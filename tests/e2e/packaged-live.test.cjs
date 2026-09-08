const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { launchPackaged, waitForLogin, until } = require('./packaged-helpers.cjs');

const INSTALL_TIMEOUT = 30 * 60_000;
const CONNECTION_TIMEOUT = 5 * 60_000;

test('live packaged login → fresh install → game launch → server-confirmed connection',
  { timeout: INSTALL_TIMEOUT + CONNECTION_TIMEOUT + 120_000 }, async (t) => {
    for (const name of ['NATUX_E2E_LOGIN', 'NATUX_E2E_PASSWORD', 'NATUX_E2E_USERNAME', 'NATUX_E2E_SERVER_LOG']) {
      assert.ok(process.env[name], `Live E2E prerequisite missing: ${name}`);
    }
    const username = process.env.NATUX_E2E_USERNAME;
    assert.match(username, /^[A-Za-z0-9_]{3,16}$/, 'Expected Minecraft username must be explicit');
    const logPath = path.resolve(process.env.NATUX_E2E_SERVER_LOG);
    const log = await fs.open(logPath, 'r');
    t.after(() => log.close());
    assert.ok((await log.stat()).isFile(), 'Server log must be a readable regular file');

    const { page, userData } = await launchPackaged(t);
    await waitForLogin(page);
    // Do not print locator errors from credential entry: they may include the password value.
    try {
      await page.getByPlaceholder(/^(Ник или email|Username or email)$/).fill(process.env.NATUX_E2E_LOGIN);
      await page.getByPlaceholder(/^(Пароль|Password)$/).fill(process.env.NATUX_E2E_PASSWORD);
      await page.getByRole('button', { name: /^(ВОЙТИ|LOG IN)$/ }).click();
    } catch {
      throw new Error('Could not submit live login through the packaged UI');
    }
    await until(async () => {
      const result = await page.evaluate(() => window.natux.account.bootstrap());
      if (result.status !== 'authed') return false;
      assert.equal(result.user.username, username, 'Authenticated account must match the dedicated test username');
      return true;
    }, 60_000, 'Live login failed; use a verified test account without 2FA');

    const settings = await page.evaluate(() => window.natux.settings.get());
    if (!settings.onboardingCompleted) {
      await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
      await page.getByRole('heading', { name: 'Настроим игру', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
      await page.getByRole('button', { name: 'Готово', exact: true }).click();
      await until(async () => (await page.evaluate(() => window.natux.settings.get())).onboardingCompleted,
        10_000, 'Onboarding settings were not persisted');
    }
    await page.evaluate(() => {
      window.__natuxE2eStages = [];
      window.natux.launcher.onProgress((progress) => window.__natuxE2eStages.push(progress.stage));
    });

    // A previously recorded join cannot satisfy this test. A rotated/truncated log is a failure,
    // rather than silently resetting the offset and accepting an old connection.
    const baseline = await log.stat();
    let offset = baseline.size;
    let text = '';
    const decoder = new StringDecoder('utf8');
    let discardPartialLine = false;
    if (offset) {
      const last = Buffer.alloc(1);
      await log.read(last, 0, 1, offset - 1);
      discardPartialLine = last[0] !== 10;
    }
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const joined = new RegExp(`(?:^|\\s)${escaped} joined the game\\s*$`, 'm');
    await page.getByRole('button', { name: /^(ИГРАТЬ|PLAY)$/ }).click();
    await until(async () => {
      const status = await page.evaluate(() => window.natux.launcher.getStatus());
      assert.notEqual(status.stage, 'error', 'Live installation or launch failed; inspect local launcher logs');
      return status.stage === 'running';
    }, INSTALL_TIMEOUT, 'Minecraft did not reach running state', 1000);
    const stages = await page.evaluate(() => window.__natuxE2eStages);
    for (const stage of ['libraries', 'assets', 'natives-extract', 'forge-install', 'running']) {
      assert.ok(stages.includes(stage), `Fresh installation must emit ${stage}`);
    }
    await fs.access(path.join(userData, 'minecraft', 'versions', '1.21.1', '1.21.1.jar'));

    await until(async () => {
      assert.equal((await page.evaluate(() => window.natux.launcher.getStatus())).stage, 'running',
        'Minecraft exited before the server confirmed connection');
      const current = await fs.stat(logPath);
      assert.equal(current.dev, baseline.dev, 'Server log device changed during test');
      assert.equal(current.ino, baseline.ino, 'Server log rotated during test');
      assert.ok(current.size >= offset, 'Server log was truncated during test');
      while (offset < current.size) {
        const buffer = Buffer.alloc(Math.min(current.size - offset, 64 * 1024));
        const { bytesRead } = await log.read(buffer, 0, buffer.length, offset);
        if (!bytesRead) break;
        offset += bytesRead;
        text += decoder.write(buffer.subarray(0, bytesRead));
        if (discardPartialLine) {
          const newline = text.indexOf('\n');
          if (newline === -1) { text = ''; continue; }
          text = text.slice(newline + 1);
          discardPartialLine = false;
        }
        const lastNewline = text.lastIndexOf('\n');
        if (lastNewline !== -1) {
          if (joined.test(text.slice(0, lastNewline + 1))) return true;
          text = text.slice(lastNewline + 1);
        }
        assert.ok(text.length < 1024 * 1024, 'Server log contains an unexpectedly long line');
      }
      return false;
    }, CONNECTION_TIMEOUT, 'No new server-confirmed join for the test account after PLAY', 1000);
  });
