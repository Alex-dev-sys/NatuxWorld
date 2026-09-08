const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { launchPackaged, waitForLogin } = require('./packaged-helpers.cjs');

test('packaged renderer loads real preload and navigates login → registration → login', { timeout: 90_000 }, async (t) => {
  const { page, root } = await launchPackaged(t);
  assert.equal(new URL(page.url()).protocol, 'file:');
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(await page.evaluate(() => window.natux.getVersion()), pkg.version);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined', 'Renderer must not expose Node');
  assert.equal((await page.evaluate(() => window.natux.launcher.getStatus())).stage, 'idle');
  assert.equal((await page.evaluate(() => window.natux.account.bootstrap())).status, 'guest');

  await waitForLogin(page);
  assert.equal(await page.getByRole('button', { name: /^(ВОЙТИ|LOG IN)$/ }).isDisabled(), true);
  await page.getByRole('button', { name: /^(Нет аккаунта\? Регистрация|No account\? Sign up)$/ }).click();
  await page.getByPlaceholder('Email', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^(СОЗДАТЬ|CREATE)$/ }).isDisabled(), true);
  await page.getByRole('button', { name: /^(Уже есть аккаунт\? Войти|Already have an account\? Sign in)$/ }).click();
  await waitForLogin(page);
  assert.equal(await page.getByRole('button', { name: /^(ВОЙТИ|LOG IN)$/ }).isDisabled(), true);
});
