import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { failClosedOnLockLoss, NativeLockBusyError, NativeLockService } from '../NativeLockService';

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\Users\\Test\\AppData\\Roaming\\NATUX WORLD', isPackaged: false },
}));

function fakeHelperProcess(): { child: ChildProcess; stdout: PassThrough } {
  const emitter = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  const child = Object.assign(emitter, {
    pid: 1234,
    stdout,
    stderr,
    stdin,
    kill: vi.fn(() => {
      process.nextTick(() => emitter.emit('close', 1, 'SIGTERM'));
      return true;
    }),
  }) as unknown as ChildProcess;
  stdin.once('finish', () => process.nextTick(() => emitter.emit('close', 0, null)));
  return { child, stdout };
}

function serviceFor(fake: ReturnType<typeof fakeHelperProcess>, options: { timeout?: number } = {}) {
  const spawnProcess = vi.fn((_command: string, _args: string[], _options: SpawnOptions) => fake.child);
  const service = new NativeLockService({
    getUserDataPath: () => 'C:\\profile with spaces',
    getHelperPath: () => 'C:\\app\\resources\\natux-lock\\lock-helper.exe',
    getAgentJarPath: () => 'C:\\app\\resources\\natux-lock\\natux-lock-agent.jar',
    spawnProcess,
    handshakeTimeoutMs: options.timeout ?? 100,
  });
  return { service, spawnProcess };
}

describe('NativeLockService', () => {
  it('passes the exact profile directory and keeps the helper alive until release', async () => {
    const fake = fakeHelperProcess();
    const { service, spawnProcess } = serviceFor(fake);
    const pending = service.acquire('profile');
    fake.stdout.write('NATUX_LOCK_READY_V1\n');
    const lease = await pending;

    expect(spawnProcess).toHaveBeenCalledWith(
      'C:\\app\\resources\\natux-lock\\lock-helper.exe',
      ['--kind', 'profile', '--user-data', 'C:\\profile with spaces'],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false },
    );
    expect(lease.isClosed).toBe(false);
    await lease.release();
    expect(lease.isClosed).toBe(true);
  });

  it('treats lock contention as a closed failure and terminates the helper', async () => {
    const fake = fakeHelperProcess();
    const { service } = serviceFor(fake);
    const pending = service.acquire('game');
    fake.stdout.write('NATUX_LOCK_BUSY_V1\n');

    await expect(pending).rejects.toBeInstanceOf(NativeLockBusyError);
    expect(fake.child.kill).toHaveBeenCalledOnce();
  });

  it('reports if a held helper exits unexpectedly', async () => {
    const fake = fakeHelperProcess();
    const { service } = serviceFor(fake);
    const pending = service.acquire('game');
    fake.stdout.write('NATUX_LOCK_READY_V1\n');
    const lease = await pending;
    const lost = vi.fn();
    lease.onLost(lost);

    fake.child.emit('close', 1, null);

    expect(lost).toHaveBeenCalledOnce();
    expect(lease.isClosed).toBe(true);
  });

  it('runs the fail-closed action once when the held lock helper loses ownership', async () => {
    const fake = fakeHelperProcess();
    const { service } = serviceFor(fake);
    const pending = service.acquire('profile');
    fake.stdout.write('NATUX_LOCK_READY_V1\n');
    const lease = await pending;
    const exitImmediately = vi.fn();
    const stopWatching = failClosedOnLockLoss(lease, exitImmediately);

    fake.child.emit('error', new Error('helper pipe failed'));
    fake.child.emit('close', 1, null);

    expect(exitImmediately).toHaveBeenCalledOnce();
    expect(exitImmediately).toHaveBeenCalledWith(expect.objectContaining({ message: 'helper pipe failed' }));
    stopWatching();
  });

  it('fails closed when the helper never sends its readiness line', async () => {
    const fake = fakeHelperProcess();
    const { service } = serviceFor(fake, { timeout: 10 });

    await expect(service.acquire('profile')).rejects.toThrow('Тайм-аут ожидания блокировки профиля');
    expect(fake.child.kill).toHaveBeenCalledOnce();
  });
});
