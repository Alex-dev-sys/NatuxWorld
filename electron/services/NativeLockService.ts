import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

export type NativeLockKind = 'profile' | 'game';

const READY_LINE = 'NATUX_LOCK_READY_V1';
const BUSY_LINE = 'NATUX_LOCK_BUSY_V1';
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;

export class NativeLockBusyError extends Error {
  constructor(readonly kind: NativeLockKind) {
    super(kind === 'profile'
      ? 'Профиль уже используется другим экземпляром лаунчера'
      : 'Папка игры сейчас используется другим процессом');
    this.name = 'NativeLockBusyError';
  }
}

type LockHelperSpawner = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface NativeLockServiceOptions {
  getUserDataPath?: () => string;
  getHelperPath?: () => string;
  getAgentJarPath?: () => string;
  spawnProcess?: LockHelperSpawner;
  handshakeTimeoutMs?: number;
}

/** Keeps a kernel lock alive in the helper until `release()` closes its stdin. */
export class NativeLockLease extends EventEmitter {
  private releaseRequested = false;
  private closed = false;
  private closeResolve!: (result: { code: number | null; signal: NodeJS.Signals | null }) => void;
  private readonly closePromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;

  constructor(private readonly child: ChildProcess) {
    super();
    this.closePromise = new Promise((resolve) => { this.closeResolve = resolve; });
    child.once('close', (code, signal) => {
      this.closed = true;
      if (!this.releaseRequested) this.emit('lost', new Error('Процесс блокировки неожиданно завершился'));
      this.closeResolve({ code, signal });
    });
    // ChildProcess can emit `error` before `close` (for example, ENOENT). Keep a
    // listener for its full lifetime so that no late error becomes unhandled.
    child.on('error', (error) => {
      if (!this.releaseRequested) this.emit('lost', error);
    });
  }

  get isClosed(): boolean {
    return this.closed;
  }

  onLost(listener: (error: Error) => void): () => void {
    if (this.closed && !this.releaseRequested) {
      queueMicrotask(() => listener(new Error('Процесс блокировки неожиданно завершился')));
      return () => undefined;
    }
    this.on('lost', listener);
    return () => this.off('lost', listener);
  }

  /** Sends EOF to the helper and waits until the OS has released its lock. */
  async release(): Promise<void> {
    if (this.releaseRequested || this.closed) {
      await this.closePromise;
      return;
    }
    this.releaseRequested = true;
    this.child.stdin?.end();

    const timeout = new Promise<null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 5_000);
      timer.unref?.();
    });
    const closed = await Promise.race([this.closePromise, timeout]);
    if (closed) return;

    // A helper that does not exit on EOF cannot prove that it released the lock.
    // Terminate it and wait for the kernel handle to close before returning.
    this.child.kill();
    const terminated = await Promise.race([this.closePromise, new Promise<null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 5_000);
      timer.unref?.();
    })]);
    if (!terminated) throw new Error('Не удалось подтвердить освобождение блокировки');
  }

  /** Stop a helper whose startup handshake failed, then wait for lock release. */
  async terminate(): Promise<void> {
    this.releaseRequested = true;
    if (!this.closed) this.child.kill();
    const closed = await Promise.race([this.closePromise, new Promise<null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 5_000);
      timer.unref?.();
    })]);
    if (!closed) throw new Error('Процесс блокировки не завершился после остановки');
  }
}

/** Runs a fail-closed action once if the helper can no longer prove lock ownership. */
export function failClosedOnLockLoss(lease: NativeLockLease, action: (error: Error) => void): () => void {
  let acted = false;
  return lease.onLost((error) => {
    if (acted) return;
    acted = true;
    action(error);
  });
}

/** Coordinates Electron with Tauri and the Java premain lock agent. */
export class NativeLockService {
  private readonly getUserDataPath: () => string;
  private readonly getHelperPath: () => string;
  private readonly getAgentJarPath: () => string;
  private readonly spawnProcess: LockHelperSpawner;
  private readonly handshakeTimeoutMs: number;

  constructor(options: NativeLockServiceOptions = {}) {
    this.getUserDataPath = options.getUserDataPath ?? (() => app.getPath('userData'));
    this.getHelperPath = options.getHelperPath ?? (() => NativeLockService.resolveResourcePath('lock-helper'));
    this.getAgentJarPath = options.getAgentJarPath ?? (() => NativeLockService.resolveResourcePath('natux-lock-agent.jar'));
    this.spawnProcess = options.spawnProcess ?? ((command, args, spawnOptions) => spawn(command, args, spawnOptions));
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
  }

  get userDataPath(): string {
    return this.getUserDataPath();
  }

  get lockAgentJarPath(): string {
    return this.getAgentJarPath();
  }

  async ensureLockAgentAvailable(): Promise<void> {
    try {
      const entry = await stat(this.lockAgentJarPath);
      if (!entry.isFile() || entry.size === 0) throw new Error('lock-agent JAR is not a non-empty file');
    } catch {
      throw new Error('Не найден встроенный Java lock-agent; запуск игры остановлен');
    }
  }

  async acquire(kind: NativeLockKind): Promise<NativeLockLease> {
    const child = this.spawnProcess(
      this.getHelperPath(),
      ['--kind', kind, '--user-data', this.userDataPath],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false },
    );
    const lease = new NativeLockLease(child);
    try {
      await this.waitForHandshake(child, kind);
      if (lease.isClosed) throw new Error('Процесс блокировки завершился до подтверждения');
      return lease;
    } catch (error) {
      await lease.terminate().catch(() => undefined);
      throw error;
    }
  }

  private waitForHandshake(child: ChildProcess, kind: NativeLockKind): Promise<void> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.stdout?.off('data', onData);
        child.off('close', onClose);
        child.off('error', onError);
        if (error) reject(error);
        else resolve();
      };
      const onData = (chunk: string | Buffer) => {
        buffer += chunk.toString();
        if (buffer.length > 4096) {
          finish(new Error('Ответ процесса блокировки слишком длинный'));
          return;
        }
        const newline = buffer.indexOf('\n');
        if (newline < 0) return;
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        if (line === READY_LINE) finish();
        else if (line === BUSY_LINE) finish(new NativeLockBusyError(kind));
        else finish(new Error('Процесс блокировки вернул неверный ответ'));
      };
      const onClose = (code: number | null) => {
        finish(new Error(`Процесс блокировки завершился до подтверждения (код ${code ?? 'unknown'})`));
      };
      const onError = (error: Error) => finish(new Error(`Не удалось запустить процесс блокировки: ${error.message}`));
      const lockName = kind === 'profile' ? 'профиля' : 'игры';
      const timer = setTimeout(() => finish(new Error(`Тайм-аут ожидания блокировки ${lockName}`)), this.handshakeTimeoutMs);
      timer.unref?.();
      child.stdout?.setEncoding('utf-8');
      child.stdout?.on('data', onData);
      child.once('close', onClose);
      child.once('error', onError);
    });
  }

  private static resolveResourcePath(fileName: string): string {
    const executableName = fileName === 'lock-helper' && process.platform === 'win32'
      ? 'lock-helper.exe'
      : fileName;
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'natux-lock', executableName);
    }
    const appRoot = process.env.APP_ROOT ?? process.cwd();
    return path.join(appRoot, 'build', 'lock-runtime', executableName);
  }
}

export const nativeLocks = new NativeLockService();

/** Runs a short filesystem operation while excluding the game and other launchers. */
export async function withGameLock<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const lease = await nativeLocks.acquire('game');
  const controller = new AbortController();
  let lost: Error | null = null;
  const stopOnLoss = lease.onLost((error) => {
    lost = error;
    controller.abort(error);
  });
  try {
    const result = await operation(controller.signal);
    if (lost) throw new Error('Потеряна блокировка папки игры; операция остановлена', { cause: lost });
    return result;
  } finally {
    stopOnLoss();
    await lease.release();
  }
}
