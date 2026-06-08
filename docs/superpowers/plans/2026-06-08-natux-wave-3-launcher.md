# Wave 3-L — Real Launcher Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stub launcher services with a real pipeline that launches vanilla Minecraft 1.21.6 and Forge 1.21.6 from a clean state.

**Architecture:** See `docs/superpowers/specs/2026-06-08-natux-wave-3-launcher-design.md`. Main process owns the pipeline; renderer receives IPC progress/log events. Services: JavaService, MojangService, DownloadService, ForgeService, AuthService (rewrite), MinecraftService (rewrite), LauncherService (orchestrator).

**Tech Stack:** TypeScript strict, Node 20+, Electron 33, Vitest, `yauzl` (zip), built-in `node:crypto`, `node:fs/promises`, `node:child_process`, `node:https`.

**Testing approach:** Vitest for `electron/services/**`. UI manual smoke. Real-launch verification is manual.

**Commit convention:** No `Co-Authored-By` trailer (per `CLAUDE.md`). Push to `main` after each commit.

**Reference spec:** `docs/superpowers/specs/2026-06-08-natux-wave-3-launcher-design.md`

## File map

| File | Status | Tasks |
|------|--------|-------|
| `vitest.config.ts` | **create** | T1 |
| `package.json` | modify (deps + scripts) | T1, T2 |
| `electron/utils/paths.ts` | **rewrite/extend** | T2 |
| `electron/services/JavaService.ts` | **rewrite** | T3 |
| `electron/services/MojangService.ts` | **create** | T4 |
| `electron/services/DownloadService.ts` | **create** | T5 |
| `electron/services/AuthService.ts` | **rewrite** | T6 |
| `electron/services/MinecraftService.ts` | **rewrite** | T7 |
| `electron/services/LauncherService.ts` | **rewrite** | T8 |
| `electron/preload.ts` | modify (new IPC) | T8 |
| `electron/ipc/channels.ts` | modify (new channels) | T8 |
| `electron/ipc/handlers.ts` | modify (wire progress + log) | T8 |
| `src/store/useLauncherStore.ts` | rewrite (drop fake progress) | T8 |
| `src/components/PlayButton.tsx` | modify (stage label) | T8 |
| `electron/services/ForgeService.ts` | **create** | T10 |
| `src/components/PlayButton.tsx` | modify (cancel button) | T13 |

Test files (all under `electron/services/__tests__/`):

- `JavaService.test.ts` (T3)
- `MojangService.test.ts` (T4)
- `DownloadService.test.ts` (T5)
- `AuthService.test.ts` (T6)
- `MinecraftService.test.ts` (T7)
- `ForgeService.test.ts` (T10)

Test fixtures under `electron/services/__tests__/fixtures/`:

- `version_manifest_v2.snippet.json` (small, real)
- `1.21.6.json` (real, captured from Mojang)
- `assets-1.21.json` (small subset)
- `install_profile-forge-1.21.6.json` (extracted from a real installer)

---

## Task 1: Vitest setup + smoke

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add `vitest` to devDeps; add `test` and `test:watch` scripts)
- Create: `electron/services/__tests__/smoke.test.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest@^2.1.0
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['electron/**/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
```

- [ ] **Step 3: Add scripts to `package.json`**

In `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Smoke test**

Create `electron/services/__tests__/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('vitest smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run and verify**

```bash
npm test
```
Expected: 1 test passes.

- [ ] **Step 6: Commit & push**

```bash
git add vitest.config.ts package.json package-lock.json electron/services/__tests__/smoke.test.ts
git commit -m "test: vitest setup with smoke test"
git push origin main
```

---

## Task 2: Paths utility

**Files:**
- Rewrite: `electron/utils/paths.ts`
- Test: `electron/utils/__tests__/paths.test.ts` (new)

- [ ] **Step 1: Write failing test**

Create `electron/utils/__tests__/paths.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'C:\\Users\\Test\\AppData\\Roaming\\NATUX WORLD') },
}));

beforeEach(() => vi.clearAllMocks());

describe('paths', () => {
  it('getMinecraftDir returns userData/minecraft', async () => {
    const { getMinecraftDir } = await import('../paths');
    expect(getMinecraftDir()).toMatch(/minecraft$/);
  });

  it('getVersionDir composes version subdir', async () => {
    const { getVersionDir } = await import('../paths');
    expect(getVersionDir('1.21.6')).toMatch(/minecraft[\\/]versions[\\/]1\.21\.6$/);
  });

  it('getLibraryPath resolves a Maven name', async () => {
    const { getLibraryPath } = await import('../paths');
    const p = getLibraryPath('com.mojang:authlib:6.0.54');
    expect(p).toMatch(/libraries[\\/]com[\\/]mojang[\\/]authlib[\\/]6\.0\.54[\\/]authlib-6\.0\.54\.jar$/);
  });
});
```

- [ ] **Step 2: Run, see it fail**

```bash
npm test -- paths
```
Expected: missing exports.

- [ ] **Step 3: Implement**

Rewrite `electron/utils/paths.ts`:

```ts
import { app } from 'electron';
import path from 'node:path';

export function getMinecraftDir(): string {
  return path.join(app.getPath('userData'), 'minecraft');
}

export function getRuntimeDir(): string {
  return path.join(getMinecraftDir(), 'runtime');
}

export function getJrePath(): string {
  const exe = process.platform === 'win32' ? 'javaw.exe' : 'java';
  return path.join(getRuntimeDir(), 'jre-21', 'bin', exe);
}

export function getVersionsDir(): string {
  return path.join(getMinecraftDir(), 'versions');
}

export function getVersionDir(id: string): string {
  return path.join(getVersionsDir(), id);
}

export function getVersionJsonPath(id: string): string {
  return path.join(getVersionDir(id), `${id}.json`);
}

export function getVersionJarPath(id: string): string {
  return path.join(getVersionDir(id), `${id}.jar`);
}

export function getNativesDir(id: string): string {
  return path.join(getVersionDir(id), 'natives');
}

export function getLibrariesDir(): string {
  return path.join(getMinecraftDir(), 'libraries');
}

export function getLibraryPath(mavenName: string): string {
  const [group, artifact, version, classifier] = mavenName.split(':');
  const groupDir = group.replace(/\./g, path.sep);
  const fileSuffix = classifier ? `-${classifier}` : '';
  return path.join(getLibrariesDir(), groupDir, artifact, version, `${artifact}-${version}${fileSuffix}.jar`);
}

export function getAssetsDir(): string {
  return path.join(getMinecraftDir(), 'assets');
}

export function getAssetIndexPath(id: string): string {
  return path.join(getAssetsDir(), 'indexes', `${id}.json`);
}

export function getAssetObjectPath(hash: string): string {
  return path.join(getAssetsDir(), 'objects', hash.slice(0, 2), hash);
}

export function getForgeDir(mcVer: string): string {
  return path.join(getMinecraftDir(), 'forge', mcVer);
}

export function getAuthPath(): string {
  return path.join(getMinecraftDir(), 'auth.json');
}
```

- [ ] **Step 4: Run, see it pass**

```bash
npm test -- paths
```
Expected: all 3 tests pass.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit & push**

```bash
git add electron/utils/paths.ts electron/utils/__tests__/paths.test.ts
git commit -m "feat(paths): launcher filesystem layout helpers"
git push origin main
```

---

## Task 3: JavaService — Adoptium auto-install

**Files:**
- Rewrite: `electron/services/JavaService.ts`
- Create: `electron/services/__tests__/JavaService.test.ts`

- [ ] **Step 1: Write tests**

Create `electron/services/__tests__/JavaService.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { JavaService } from '../JavaService';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/test' } }));
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, access: vi.fn() };
});

describe('JavaService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('detect returns null when no managed runtime and no system java', async () => {
    const svc = new JavaService();
    // mock access to fail (no managed); mock spawn to fail (no system java)
    // ... see implementation
    const result = await svc.detect();
    expect(result).toBeNull();
  });

  it('adoptiumUrl composes win/x64 URL correctly', () => {
    const url = JavaService.adoptiumUrl('windows', 'x64', 21);
    expect(url).toBe(
      'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse',
    );
  });

  it('isJava21Plus parses "java version \\"21.0.5\\""', () => {
    expect(JavaService.isJava21Plus('java version "21.0.5"\nOpenJDK Runtime')).toBe(true);
    expect(JavaService.isJava21Plus('openjdk version "17.0.10"')).toBe(false);
    expect(JavaService.isJava21Plus('openjdk version "22.0.1"')).toBe(true);
  });
});
```

- [ ] **Step 2: Run, see it fail**

```bash
npm test -- JavaService
```

- [ ] **Step 3: Implement**

Rewrite `electron/services/JavaService.ts`. The implementation includes:

- `detect()`: check managed JRE first (fs.access on `getJrePath()`), else spawn `java -version`, parse output, return `null` if absent or < 21.
- `install()`: HTTPS GET to Adoptium API → ZIP → extract via `yauzl` (or builtin `node:stream` + `unzip-stream`) → return `JavaInstallation`.
- `static adoptiumUrl(os, arch, major)`: pure URL builder.
- `static isJava21Plus(versionOutput)`: parse `version "X.Y.Z"` regex, integer compare.

Key code skeleton (full implementation in commit):

```ts
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import yauzl from 'yauzl';
import { getJrePath, getRuntimeDir } from '../utils/paths';

export interface JavaInstallation {
  version: string;
  vendor: 'Temurin' | 'system';
  path: string;
}

export class JavaService extends EventEmitter {
  static adoptiumUrl(os: string, arch: string, major: number): string {
    return `https://api.adoptium.net/v3/binary/latest/${major}/ga/${os}/${arch}/jre/hotspot/normal/eclipse`;
  }

  static isJava21Plus(versionOutput: string): boolean {
    const m = versionOutput.match(/version "(\d+)\.?/);
    return m ? Number(m[1]) >= 21 : false;
  }

  async detect(): Promise<JavaInstallation | null> {
    // 1. managed
    try {
      await fsp.access(getJrePath(), fs.constants.X_OK);
      return { version: '21', vendor: 'Temurin', path: getJrePath() };
    } catch { /* not present */ }

    // 2. system
    return new Promise((resolve) => {
      const proc = spawn('java', ['-version']);
      let out = '';
      proc.stderr.on('data', (d) => (out += d.toString()));
      proc.on('close', () => {
        if (JavaService.isJava21Plus(out)) {
          resolve({ version: out.match(/version "([^"]+)"/)?.[1] ?? 'unknown', vendor: 'system', path: 'java' });
        } else {
          resolve(null);
        }
      });
      proc.on('error', () => resolve(null));
    });
  }

  async install(): Promise<JavaInstallation> {
    const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
    const url = JavaService.adoptiumUrl(os, 'x64', 21);
    // GET, follow redirects, stream zip to disk, sha256-verify against companion .sha256.txt
    // extract under getRuntimeDir()/jre-21/
    // emit('progress', 0..100)
    // ... full implementation
    return { version: '21', vendor: 'Temurin', path: getJrePath() };
  }
}
```

Add `yauzl` to deps:

```bash
npm install --save yauzl
npm install --save-dev @types/yauzl
```

- [ ] **Step 4: Tests pass**

```bash
npm test -- JavaService
```

- [ ] **Step 5: Commit & push**

```bash
git add electron/services/JavaService.ts electron/services/__tests__/JavaService.test.ts package.json package-lock.json
git commit -m "feat(java): Adoptium JRE 21 auto-install with detect fallback"
git push origin main
```

---

## Task 4: MojangService — version manifest resolver

**Files:**
- Create: `electron/services/MojangService.ts`
- Create: `electron/services/__tests__/MojangService.test.ts`
- Create: `electron/services/__tests__/fixtures/1.21.6.json` (capture from `curl -sL https://launchermeta.mojang.com/mc/game/version_manifest_v2.json | jq` then fetch the actual 1.21.6 entry's url)

- [ ] **Step 1: Capture fixtures**

```bash
node -e "
const https = require('https');
https.get('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', r => {
  let s = '';
  r.on('data', d => s += d);
  r.on('end', () => {
    const m = JSON.parse(s);
    const v = m.versions.find(x => x.id === '1.21.6');
    require('fs').writeFileSync('electron/services/__tests__/fixtures/version-1.21.6-meta.json', JSON.stringify(v, null, 2));
    https.get(v.url, r2 => {
      let s2 = '';
      r2.on('data', d => s2 += d);
      r2.on('end', () => require('fs').writeFileSync('electron/services/__tests__/fixtures/1.21.6.json', s2));
    });
  });
});
"
```

- [ ] **Step 2: Write tests**

Tests assert:
- `resolveVersion('1.21.6')` returns a parsed manifest with at least 60 libraries.
- Library filtering by OS rules: `rules: [{action: 'allow', os: {name: 'osx'}}]` is excluded on Windows.
- `arguments.game` includes a string entry `--username` and a templated entry containing `${auth_player_name}`.

(Full test code in commit — uses fixture loading, mocks https for the network call.)

- [ ] **Step 3: Implement**

```ts
import https from 'node:https';
import fsp from 'node:fs/promises';
import { getVersionJsonPath, getVersionDir } from '../utils/paths';

const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';

export class MojangService {
  async resolveVersion(id: string): Promise<VanillaVersion> {
    // 1. try local cache (getVersionJsonPath)
    // 2. else fetch manifest, find entry by id, fetch its url, save, return.
    // ...
  }

  async resolveAssetIndex(version: VanillaVersion): Promise<AssetIndex> {
    // download to getAssetIndexPath(version.assetIndex.id), parse, return.
  }
}

export function filterByOsRules(items: { rules?: Rule[] }[], os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux'): typeof items {
  return items.filter((it) => evaluateRules(it.rules ?? [{ action: 'allow' }], os));
}

function evaluateRules(rules: Rule[], os: string): boolean {
  let allow = false;
  for (const r of rules) {
    const matches = !r.os || r.os.name === os;
    if (matches) allow = r.action === 'allow';
  }
  return allow;
}
```

(Types and full impl in commit.)

- [ ] **Step 4: Tests pass**

```bash
npm test -- MojangService
```

- [ ] **Step 5: Commit & push**

```bash
git add electron/services/MojangService.ts electron/services/__tests__/MojangService.test.ts electron/services/__tests__/fixtures/
git commit -m "feat(mojang): version manifest resolver with OS-rule library filter"
git push origin main
```

---

## Task 5: DownloadService — parallel hash-verified

**Files:**
- Create: `electron/services/DownloadService.ts`
- Create: `electron/services/__tests__/DownloadService.test.ts`

Tests use `nock` (or vitest's built-in `vi.mock('node:https')`) to assert:

- Skip-if-exists when local file's SHA-1 matches.
- Retry up to 3× with exponential backoff on network error.
- Fail after 3 attempts with the underlying error.
- Atomic rename (temp file → final) on success.
- Aggregate progress monotonically increases.

Implementation: a worker pool with `maxConcurrent` slots, each downloads one job with `node:https`, pipes through `crypto.createHash('sha1')`, writes to `dest + '.tmp'`, renames on completion.

(Detailed code in commit; ~150 lines.)

- [ ] **Step 1**: Write tests.
- [ ] **Step 2**: Run, see fail.
- [ ] **Step 3**: Implement.
- [ ] **Step 4**: Tests pass.
- [ ] **Step 5**: Commit:

```bash
git commit -m "feat(download): parallel SHA-1 verified downloader with retry"
git push origin main
```

---

## Task 6: AuthService — offline UUID + persist

**Files:**
- Rewrite: `electron/services/AuthService.ts`
- Create: `electron/services/__tests__/AuthService.test.ts`

The offline UUID derivation is deterministic and well-known:

```
md5(("OfflinePlayer:" + username).getBytes(UTF_8))
// then set version to 3 (high nibble of byte 6 = 0x30) and variant to IETF (byte 8 high bits = 0b10)
// format as 8-4-4-4-12 hex
```

- [ ] **Step 1: Write tests with known reference values**

For username `Notch` (Mojang's own offline UUID generator gives a known value):

```ts
import { describe, expect, it } from 'vitest';
import { AuthService } from '../AuthService';

describe('AuthService offline UUID', () => {
  it('matches Mojang reference for "Notch"', () => {
    expect(AuthService.offlineUuid('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7a');
  });
  it('matches reference for "Steve"', () => {
    expect(AuthService.offlineUuid('Steve')).toBe('c06f8906-4c8a-3b29-a5b4-4b21f0e6e1f8');
  });
});
```

(Reference values: run a Java snippet `UUID.nameUUIDFromBytes(("OfflinePlayer:" + name).getBytes(StandardCharsets.UTF_8))` for the truth. If above values differ from real output, replace before committing.)

- [ ] **Step 2: Implement**

```ts
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { getAuthPath } from '../utils/paths';

export interface User {
  uuid: string;
  username: string;
  accessToken: string;
  type: 'offline';
}

export class AuthService {
  static offlineUuid(username: string): string {
    const hash = crypto.createHash('md5').update('OfflinePlayer:' + username, 'utf8').digest();
    hash[6] = (hash[6] & 0x0f) | 0x30; // version 3
    hash[8] = (hash[8] & 0x3f) | 0x80; // IETF variant
    const hex = hash.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async getUser(): Promise<User | null> {
    try {
      const raw = await fsp.readFile(getAuthPath(), 'utf-8');
      return JSON.parse(raw);
    } catch { return null; }
  }

  async login(username: string): Promise<User> {
    const user: User = { uuid: AuthService.offlineUuid(username), username, accessToken: '0', type: 'offline' };
    await fsp.mkdir(require('node:path').dirname(getAuthPath()), { recursive: true });
    await fsp.writeFile(getAuthPath(), JSON.stringify(user, null, 2), 'utf-8');
    return user;
  }

  async logout(): Promise<void> {
    try { await fsp.unlink(getAuthPath()); } catch { /* ok */ }
  }
}
```

- [ ] **Step 3: Tests pass, commit:**

```bash
git commit -m "feat(auth): offline-mode Mojang-compatible UUID + persistent identity"
git push origin main
```

---

## Task 7: MinecraftService — classpath + args + spawn (vanilla)

**Files:**
- Rewrite: `electron/services/MinecraftService.ts`
- Create: `electron/services/__tests__/MinecraftService.test.ts`

Tests assert:
- Classpath separator `;` on win32, `:` elsewhere.
- Game args substitute `${auth_player_name}` etc.
- JVM args filter by OS rules (e.g. `-XstartOnFirstThread` only on macOS).
- Spawn is called with `{ detached: false, stdio: ['ignore', 'pipe', 'pipe'] }` and the resolved javaw path.

Implementation extracts to pure functions for testability:

```ts
export function buildClasspath(libs: string[], clientJar: string): string {
  return [...libs, clientJar].join(process.platform === 'win32' ? ';' : ':');
}

export function substituteArgs(args: string[], values: Record<string, string>): string[] {
  return args.map((a) => a.replace(/\$\{(\w+)\}/g, (_, k) => values[k] ?? ''));
}
```

Spawn wrapper uses `child_process.spawn` and returns an EventEmitter that re-emits stdout lines.

- [ ] **Steps 1-3: Tests + impl, see commit for full code.**

- [ ] **Step 4: Commit:**

```bash
git commit -m "feat(minecraft): classpath + arg builders + JVM spawn"
git push origin main
```

---

## Task 8: LauncherService orchestrator (vanilla path) + IPC + renderer rewire

This is the biggest task. Wires everything together for the vanilla path.

**Files:**
- Rewrite: `electron/services/LauncherService.ts`
- Modify: `electron/ipc/channels.ts` (add `LOG`, `CANCEL`)
- Modify: `electron/ipc/handlers.ts` (wire `launcher.on('progress')` and `launcher.on('log')` to `mainWindow.webContents.send`)
- Modify: `electron/preload.ts` (expose `onLog`, `cancel`)
- Modify: `src/types/electron.d.ts` (extend NatuxAPI)
- Modify: `src/services/electron-bridge.ts` (fallback impls for new methods)
- Rewrite: `src/store/useLauncherStore.ts` (subscribe to real `onProgress`, drop fake interval)
- Modify: `src/components/PlayButton.tsx` (show stage message; show error caption when stage === 'error')

(The plan keeps this as one task but it's the largest commit — ~400 lines across files.)

- [ ] **Step 1**: Add LOG + CANCEL to `IPC` constants and to `preload.ts` api object.
- [ ] **Step 2**: Wire main process: `launcher.on('progress', p => mainWindow.webContents.send('launcher:progress', p))` and same for `log`. Add `ipcMain.handle('launcher:cancel', () => launcher.cancel())`.
- [ ] **Step 3**: Implement `LauncherService.play(opts)` using the spec's state machine pseudocode. Emit progress at each transition.
- [ ] **Step 4**: Rewrite `useLauncherStore.play` to call `bridge.launcher.play(...)` and listen via `bridge.launcher.onProgress`. Map stage → friendlier label using a const table:

```ts
const STAGE_LABEL: Record<string, string> = {
  resolving: 'Получение манифеста...',
  'java-check': 'Проверка Java...',
  libraries: 'Загрузка библиотек...',
  assets: 'Загрузка ресурсов...',
  'natives-extract': 'Распаковка библиотек...',
  'forge-install': 'Установка Forge...',
  spawn: 'Запуск Minecraft...',
  running: 'Игра запущена',
  error: 'Ошибка',
};
```

- [ ] **Step 5**: Update PlayButton — show `progressMessage` from store; on error, render red caption with retry.
- [ ] **Step 6**: Manual smoke: `npm run dev`, click PLAY, watch progress messages cycle through stages (since real downloads will happen, this may take a few minutes on first run).
- [ ] **Step 7**: Commit:

```bash
git commit -m "feat(launcher): wire real orchestrator + IPC progress/log streaming"
git push origin main
```

---

## Task 9: End-to-end smoke — launch vanilla 1.21.6

**No code changes.** This is a verification task and explicit checkpoint.

- [ ] **Step 1**: Delete `userData/minecraft/` if it exists locally (simulate clean state).
- [ ] **Step 2**: `npm run dev`. Click PLAY with «Forge 1.21.6» selected. (Forge step is skipped because T10 hasn't shipped yet; LauncherService should branch on a feature flag — verify the branch.)
- [ ] **Step 3**: Wait. Verify in sequence:
  - JRE 21 downloads to `userData/minecraft/runtime/jre-21/`.
  - Vanilla 1.21.6 client jar downloads to `versions/1.21.6/`.
  - Libraries fill in `libraries/`.
  - Assets fill in `assets/`.
  - Natives extracted to `versions/1.21.6/natives/`.
  - Minecraft window opens, shows main menu, lets you join `mc.xbestu.ru` (if it accepts offline-mode players).
- [ ] **Step 4**: Document any issues in a follow-up commit.
- [ ] **Step 5**: Commit only if anything changed (e.g. README note, doc):

```bash
git commit -m "docs: vanilla launch verified on clean state"
git push origin main
```

---

## Task 10: ForgeService

**Files:**
- Create: `electron/services/ForgeService.ts`
- Create: `electron/services/__tests__/ForgeService.test.ts`
- Create: `electron/services/__tests__/fixtures/install_profile-forge-1.21.6.json`

- [ ] **Step 1**: Download a real Forge 1.21.6 installer locally to inspect:

```bash
curl -L https://maven.minecraftforge.net/net/minecraftforge/forge/1.21.6-52.0.40/forge-1.21.6-52.0.40-installer.jar -o /tmp/forge-installer.jar
unzip -p /tmp/forge-installer.jar install_profile.json > electron/services/__tests__/fixtures/install_profile-forge-1.21.6.json
unzip -p /tmp/forge-installer.jar version.json > electron/services/__tests__/fixtures/forge-version-1.21.6.json
```

- [ ] **Step 2**: Write tests against captured fixtures — parse libraries list, parse processors list, build expected JVM invocations for each processor.

- [ ] **Step 3**: Implement:
  - `install(mcVer, javaPath, onProgress)`:
    1. Download installer to `forge/<mcVer>/`.
    2. Extract `install_profile.json` and `version.json` (use `yauzl`).
    3. Download all `libraries[]` via DownloadService.
    4. For each processor in `processors[]`: build `java -cp ${cp} ${mainClass} ${args}` (with `{MINECRAFT_JAR}`, `{SIDE}`, `{ROOT}` substitutions per the install profile spec) and spawn JVM sequentially. Wait for exit.
    5. Read the resulting patched `versions/<id-with-forge>/<id>.jar` and `<id>.json`.
    6. Return merged manifest.
- [ ] **Step 4**: Tests pass.
- [ ] **Step 5**: Commit:

```bash
git commit -m "feat(forge): installer.jar parser + processor runner"
git push origin main
```

---

## Task 11: LauncherService Forge branch + integration

**Files:**
- Modify: `electron/services/LauncherService.ts`

- [ ] **Step 1**: After natives-extract, branch on `opts.version.startsWith('forge-')`. Call `forge.install(mcVer, java.path, p => emit('progress', p))`. Use the returned `MergedVersion` (instead of vanilla) for MinecraftService.launch.
- [ ] **Step 2**: Manual smoke: switch UI to «Forge 1.21.6» and click PLAY. Verify installer runs once, second launch is fast (cached).
- [ ] **Step 3**: Commit:

```bash
git commit -m "feat(launcher): forge branch in orchestrator"
git push origin main
```

---

## Task 12: End-to-end smoke — Forge 1.21.6

Same as T9 but for Forge.

- [ ] **Step 1**: Clean `userData/minecraft/forge/` and `versions/1.21.6-forge-*`.
- [ ] **Step 2**: PLAY. Verify the chain runs, Forge processors execute, Minecraft launches with the Forge title screen (FML indicator).
- [ ] **Step 3**: Note any issues. Commit only if doc updates needed.

---

## Task 13: Cancel button + cleanup

**Files:**
- Modify: `src/components/PlayButton.tsx`
- Modify: `src/store/useLauncherStore.ts`
- Modify: `electron/services/LauncherService.ts` (cancel: AbortController flowing through DownloadService and JavaService; kill spawned JVM)

- [ ] **Step 1**: Add `cancel()` action in `useLauncherStore` that calls `bridge.launcher.cancel()`.
- [ ] **Step 2**: In `LauncherService`, hold an `AbortController` per `play()` call; pass `signal` into DownloadService jobs; on cancel: `abort()`, kill JVM, set state to idle.
- [ ] **Step 3**: PlayButton: when `isLaunching && stage !== 'running' && stage !== 'spawn'`, render a small `<X />` cancel button next to the progress.
- [ ] **Step 4**: Smoke: click PLAY during library download, immediately click cancel. Verify: state returns to idle, partial files removed.
- [ ] **Step 5**: Commit:

```bash
git commit -m "feat(launcher): cancel button + partial-file cleanup"
git push origin main
```

---

## Task 14: Error UX polish

**Files:**
- Modify: `src/components/PlayButton.tsx`

- [ ] **Step 1**: When `progressMessage` includes 'Ошибка' or `stage === 'error'`, render a red caption + small retry icon. Click retry → call `play()` again.
- [ ] **Step 2**: Smoke: simulate by temporarily killing network during a download. Verify error UI, then re-enable network and click retry.
- [ ] **Step 3**: Commit:

```bash
git commit -m "feat(ui): error caption and retry on PlayButton"
git push origin main
```

---

## Wave 3-L done

After Task 14:

- [ ] `npm test` — all service unit tests pass.
- [ ] `npm run typecheck` — green.
- [ ] `npm run build:web` — green.
- [ ] Manual: vanilla launch works from clean state. Forge launch works from clean state. Cancel works. Retry works after simulated network error.

Wave 3-L delivers real Minecraft launch. Subsequent sub-projects (3-A MS auth, 3-N news, 3-S server ping, 3-D donate) can proceed in parallel.

## Notes for future sessions

- Each task is a self-contained commit. A new session can pick up at any unchecked task by reading the spec + this plan and resuming.
- T4/T10 require real fixtures captured from live Mojang/Forge servers — these are committed to the repo so tests stay deterministic offline.
- T8 is the biggest single commit (~400 lines). Consider splitting it across multiple commits if review fatigue sets in (one commit per file would also be reasonable).
- If `yauzl` causes platform issues, alternative is `adm-zip` (synchronous but pure JS).
