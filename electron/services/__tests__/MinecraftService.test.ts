import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import {
  buildClasspath,
  classpathSeparator,
  resolveLibraryPaths,
  buildGameValues,
  MinecraftService,
} from '../MinecraftService';
import type { Library } from '../MojangService';
import type { VanillaVersion } from '../MojangService';

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\Users\\Test\\AppData\\Roaming\\NATUX WORLD' },
}));

describe('toArgFile', () => {
  it('quotes each arg and escapes backslashes for Java @argfile', () => {
    const out = MinecraftService.toArgFile(['-cp', 'C:\\libs\\a.jar;C:\\libs\\b.jar', 'Main']);
    expect(out).toBe('"-cp"\n"C:\\\\libs\\\\a.jar;C:\\\\libs\\\\b.jar"\n"Main"');
  });

  it('escapes embedded quotes', () => {
    expect(MinecraftService.toArgFile(['a"b'])).toBe('"a\\"b"');
  });
});

describe('classpathSeparator', () => {
  it(': on unix, ; on windows', () => {
    expect(classpathSeparator('win32')).toBe(';');
    expect(classpathSeparator('linux')).toBe(':');
    expect(classpathSeparator('darwin')).toBe(':');
  });
});

describe('buildClasspath', () => {
  it('joins libs + client jar with platform separator', () => {
    const cp = buildClasspath(['/libs/a.jar', '/libs/b.jar'], '/versions/1.21.6/1.21.6.jar', 'win32');
    expect(cp).toBe('/libs/a.jar;/libs/b.jar;/versions/1.21.6/1.21.6.jar');
  });

  it('linux uses colon', () => {
    const cp = buildClasspath(['/libs/a.jar'], '/c.jar', 'linux');
    expect(cp).toBe('/libs/a.jar:/c.jar');
  });
});

describe('resolveLibraryPaths', () => {
  it('skips libraries without artifact + no os classifier', () => {
    const libs: Library[] = [{ name: 'foo:bar:1.0' }];
    expect(resolveLibraryPaths(libs, 'windows')).toEqual([]);
  });

  it('returns absolute paths for artifacts', () => {
    const libs: Library[] = [
      {
        name: 'com.mojang:authlib:6.0.54',
        downloads: {
          artifact: {
            path: 'com/mojang/authlib/6.0.54/authlib-6.0.54.jar',
            url: 'https://x',
            sha1: 'a',
            size: 1,
          },
        },
      },
    ];
    const paths = resolveLibraryPaths(libs, 'windows');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/authlib-6\.0\.54\.jar$/);
  });

  it('respects OS rules', () => {
    const libs: Library[] = [
      {
        name: 'osx-only:lib:1.0',
        rules: [{ action: 'allow', os: { name: 'osx' } }],
        downloads: {
          artifact: { path: 'osx-only/lib/1.0/lib-1.0.jar', url: 'https://x', sha1: 'a', size: 1 },
        },
      },
    ];
    expect(resolveLibraryPaths(libs, 'windows')).toHaveLength(0);
    expect(resolveLibraryPaths(libs, 'osx')).toHaveLength(1);
  });
});

describe('buildGameValues', () => {
  it('substitutes standard Mojang placeholders', () => {
    const values = buildGameValues({
      username: 'Notch',
      uuid: 'b50ad385-829d-3141-a216-7e7d7539ba7f',
      accessToken: '0',
      versionId: '1.21.6',
      versionType: 'release',
      gameDir: '/game',
      assetsDir: '/assets',
      assetIndex: '26',
      nativesDir: '/natives',
    });
    expect(values.auth_player_name).toBe('Notch');
    expect(values.auth_uuid).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f');
    expect(values.auth_access_token).toBe('0');
    expect(values.version_name).toBe('1.21.6');
    expect(values.version_type).toBe('release');
    expect(values.game_directory).toBe('/game');
    expect(values.assets_root).toBe('/assets');
    expect(values.assets_index_name).toBe('26');
    expect(values.user_type).toBe('msa');
    expect(values.natives_directory).toBe('/natives');
  });
});

function fakeJavaProcess(): { child: ChildProcess; stdout: PassThrough } {
  const emitter = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  const child = Object.assign(emitter, {
    pid: 4242,
    stdout,
    stderr,
    stdin,
    kill: vi.fn(() => {
      process.nextTick(() => emitter.emit('exit', 1, null));
      return true;
    }),
  }) as unknown as ChildProcess;
  return { child, stdout };
}

function testVersion(): VanillaVersion {
  return {
    id: '1.21.1',
    mainClass: 'net.minecraft.client.main.Main',
    type: 'release',
    assetIndex: { id: '1', url: '', sha1: 'a', size: 1, totalSize: 1 },
    libraries: [],
    downloads: { client: { url: '', sha1: 'a', size: 1 } },
    arguments: { game: [], jvm: [] },
  };
}

describe('MinecraftService lock handoff', () => {
  it('releases the parent lock after writing the argfile and waits for the Java premain marker', async () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'natux-minecraft-lock-'));
    const gameDir = path.join(temp, 'game');
    mkdirSync(gameDir);
    const agent = path.join(temp, 'natux-lock-agent.jar');
    writeFileSync(agent, 'test agent');
    const fake = fakeJavaProcess();
    const order: string[] = [];
    let captured: { args: string[]; options: SpawnOptions } | undefined;
    const spawnProcess = ((_: string, args: string[], options: SpawnOptions) => {
      order.push('spawn');
      captured = { args, options };
      return fake.child;
    }) as typeof import('node:child_process').spawn;

    const envKeys = ['JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS'];
    const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
    for (const key of envKeys) process.env[key] = '-javaagent:untrusted.jar';

    try {
      const service = new MinecraftService(spawnProcess, 2_000);
      const handle = await service.launch({
        version: testVersion(),
        javaPath: 'java',
        gameDir,
        assetsDir: path.join(temp, 'assets'),
        nativesDir: path.join(temp, 'natives'),
        clientJar: path.join(temp, 'client.jar'),
        user: { username: 'Player', uuid: '00000000-0000-3000-8000-000000000000', accessToken: 'secret', type: 'offline' },
        memory: 2048,
        lockAgentJarPath: agent,
        profileDir: path.join(temp, 'profile with spaces'),
      }, async () => {
        order.push('release-parent-lock');
        const argsFile = readFileSync(path.join(gameDir, 'launch-args.txt'), 'utf8');
        expect(argsFile.startsWith(MinecraftService.toArgFile([`-javaagent:${agent}`]))).toBe(true);
      });

      expect(order).toEqual(['release-parent-lock', 'spawn']);
      expect(captured?.options.env?.NATUX_PROFILE_DIR).toBe(path.join(temp, 'profile with spaces'));
      for (const key of envKeys) expect(captured?.options.env?.[key]).toBeUndefined();
      expect(captured?.args).toEqual([`@${path.join(gameDir, 'launch-args.txt')}`]);

      const logs: string[] = [];
      handle.on('log', ({ line }: { line: string }) => logs.push(line));
      fake.stdout.write(`JVM starting\nNATUX_LOCK_READY_V1\nMinecraft ready\n`);
      await expect(handle.ready).resolves.toBeUndefined();
      expect(logs).toEqual(['JVM starting', 'Minecraft ready']);
      fake.child.emit('exit', 0, null);
    } finally {
      for (const [key, value] of previousEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('fails closed and kills Java when premain never confirms the game lock', async () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'natux-minecraft-lock-timeout-'));
    const gameDir = path.join(temp, 'game');
    mkdirSync(gameDir);
    const agent = path.join(temp, 'natux-lock-agent.jar');
    writeFileSync(agent, 'test agent');
    const fake = fakeJavaProcess();
    const spawnProcess = (() => fake.child) as typeof import('node:child_process').spawn;
    try {
      const service = new MinecraftService(spawnProcess, 10);
      const handle = await service.launch({
        version: testVersion(),
        javaPath: 'java',
        gameDir,
        assetsDir: path.join(temp, 'assets'),
        nativesDir: path.join(temp, 'natives'),
        clientJar: path.join(temp, 'client.jar'),
        user: { username: 'Player', uuid: '00000000-0000-3000-8000-000000000000', accessToken: 'secret', type: 'offline' },
        memory: 2048,
        lockAgentJarPath: agent,
        profileDir: temp,
      }, async () => undefined);

      await expect(handle.ready).rejects.toThrow('не подтвердил получение блокировки');
      expect(fake.child.kill).toHaveBeenCalledOnce();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
