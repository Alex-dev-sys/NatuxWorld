# Wave 3 — Real Launcher Pipeline (Vanilla 1.21.6 + Forge)

**Date:** 2026-06-08
**Scope:** Replace the stub `LauncherService`/`MinecraftService`/`JavaService`/`AuthService` with a real pipeline that resolves a Mojang version manifest, auto-installs Temurin JRE 21, downloads libraries+assets with hash verification, extracts natives, installs Forge for 1.21.6 on top, generates a Mojang-style offline-mode user identity, and spawns the JVM with a correct classpath+game-args, streaming logs back to the renderer.

This is **Wave 3-L** (Launcher). News, MS-auth, donate platform, real server ping are separate Wave 3 sub-projects (3-N, 3-A, 3-D, 3-S).

## Goals — what "done" means

After Wave 3-L:

1. Click PLAY in the launcher → vanilla Minecraft 1.21.6 OR Forge 1.21.6 actually launches on a clean machine with no Java pre-installed.
2. Progress bar reflects real per-stage progress (Java install %, libraries %, assets %, JVM startup).
3. User's selected version (from `useLauncherStore.VERSIONS`) is honored — Forge 1.21.6 / 1.20.1, Fabric/NeoForge intentionally not supported in this wave (UI options for those map to vanilla until later waves; explicitly stated in tooltip).
4. Re-launching the same version skips already-downloaded files (resume semantics).
5. If JVM crashes / launcher errors out, the renderer shows a usable error message and the store returns to idle.

## Non-goals

- Fabric, NeoForge loader installers (Wave 3-L.next).
- MS OAuth, premium account login (Wave 3-A).
- Mod download/sync (Wave 3-M, later).
- Skin rendering, in-game RPC, custom JVM args UI beyond what `SettingsModal` already exposes.

## High-level architecture

```
renderer (React)
  └─ useLauncherStore.play()
        │ bridge.launcher.play(...)
        ▼
preload.mjs ──IPC──► main process
                       └─ LauncherService (orchestrator)
                            ├─ JavaService       (detect / install Temurin JRE 21)
                            ├─ MojangService     (resolve version_manifest_v2)
                            ├─ DownloadService   (parallel hash-verified DL)
                            ├─ ForgeService      (Maven installer.jar → patched manifest)
                            ├─ AuthService       (offline UUID + token)
                            └─ MinecraftService  (classpath + args + spawn JVM)
                              │
                              │ stdout/stderr ──IPC──► launcher:log
                              │ progress    ──IPC──► launcher:progress
                              ▼
                          renderer (PlayButton subscribes via bridge.launcher.onProgress)
```

State machine inside `LauncherService`:

```
idle
  └─► resolving         (fetch version_manifest_v2)
      └─► java-check    (detect existing or install)
          └─► libraries (parallel DL with progress aggregation)
              └─► assets
                  └─► natives-extract
                      └─► forge-install   ◄── only if version.loader === 'forge'
                          └─► spawn
                              ├─► running (JVM PID held, logs streaming)
                              └─► error  (any stage failure)
```

Stage events are IPC-streamed to the renderer:

```ts
type Stage =
  | 'idle' | 'resolving' | 'java-check' | 'libraries' | 'assets'
  | 'natives-extract' | 'forge-install' | 'spawn' | 'running' | 'error';

interface LaunchProgress {
  stage: Stage;
  progress: number;   // 0..100 within the current stage
  message: string;    // human-readable for UI
  detail?: string;    // current file / extra context
}
```

## File system layout

All under `app.getPath('userData')/minecraft/`:

```
runtime/
  jre-21/                          # Temurin JRE 21, full archive contents
    bin/javaw.exe                  # Windows
versions/
  1.21.6/
    1.21.6.json                    # Mojang version manifest (raw)
    1.21.6.jar                     # vanilla client jar
    natives/                       # extracted .dll/.so/.dylib
libraries/                         # Maven layout: <g>/<a>/<v>/<a>-<v>.jar
assets/
  indexes/<id>.json
  objects/<2>/<hash>
mods/                              # populated by Forge install
forge/
  1.21.6/
    forge-1.21.6-<build>-installer.jar
    install_profile.json           # extracted from installer
    version.json                   # extracted, merged with vanilla
auth.json                          # { uuid, username, accessToken }
launcher-log.txt                   # rotated, last 1MB
```

Paths exposed via `electron/utils/paths.ts` helpers (`getMinecraftDir`, `getRuntimeDir`, etc.). Already partially exists.

## Service contracts

### JavaService (rewrite)

```ts
interface JavaInstallation {
  version: string;       // "21.0.5+11"
  vendor: 'Temurin' | 'system';
  path: string;          // absolute path to javaw.exe on Windows, java elsewhere
}

class JavaService {
  // 1) Look for our managed runtime/jre-21/bin/javaw.exe. If present & runs, return it.
  // 2) Else fall back to `java -version` from PATH; if it's >= 21, return that.
  // 3) Else return null.
  async detect(): Promise<JavaInstallation | null>;

  // Streaming: emits 'progress' (0..100) and 'log' events while installing.
  // Downloads from Adoptium API: GET /v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse
  // Verifies SHA-256 from same API. Extracts ZIP into runtime/jre-21/.
  async install(): Promise<JavaInstallation>;
}
```

### MojangService (new)

```ts
class MojangService {
  // Fetch and cache version_manifest_v2.json (refresh every 6h).
  // Find entry by id (e.g. "1.21.6"), GET its url → full version json.
  // Cache to versions/<id>/<id>.json.
  async resolveVersion(id: string): Promise<VanillaVersion>;

  // Get asset index URL from version json, download → assets/indexes/<assetIndex.id>.json
  async resolveAssetIndex(version: VanillaVersion): Promise<AssetIndex>;
}

interface VanillaVersion {
  id: string;
  mainClass: string;        // 'net.minecraft.client.main.Main' for 1.21.6
  assetIndex: { id: string; url: string; sha1: string; size: number };
  libraries: Library[];     // each with downloads.artifact + optional natives.windows
  downloads: { client: { url: string; sha1: string; size: number } };
  arguments: { game: ArgEntry[]; jvm: ArgEntry[] };
  javaVersion?: { majorVersion: number };  // 21 for 1.21.6
}

interface Library {
  name: string;             // "com.mojang:authlib:6.0.54"
  downloads: {
    artifact?: { path: string; url: string; sha1: string; size: number };
    classifiers?: Record<string, { path: string; url: string; sha1: string; size: number }>;
  };
  rules?: Rule[];           // OS gating
  natives?: { windows?: string };
}

type ArgEntry = string | { rules: Rule[]; value: string | string[] };
type Rule = { action: 'allow' | 'disallow'; os?: { name?: 'windows' | 'osx' | 'linux'; arch?: string } };
```

### DownloadService (new)

```ts
interface DownloadJob {
  url: string;
  dest: string;       // absolute path
  sha1?: string;      // skip download if already present and matches
  size?: number;      // for byte-accurate progress
}

class DownloadService {
  constructor(private maxConcurrent: number = 8) {}

  // Reports aggregate progress 0..1 across all jobs.
  // Per-file: GET, stream to temp file, SHA-1 hash on the fly,
  //   atomic-rename to final dest. Skip if dest exists and sha1 matches.
  // 3 retries with exponential backoff (1s, 2s, 4s).
  async downloadMany(
    jobs: DownloadJob[],
    onProgress: (bytesDone: number, bytesTotal: number, currentFile: string) => void,
  ): Promise<void>;
}
```

### ForgeService (new)

```ts
class ForgeService {
  // Hardcoded mapping of supported MC versions to known-good Forge build numbers.
  // 1.21.6 → 52.0.x (latest at spec time). Pin so reproducible builds.
  private static FORGE_VERSIONS: Record<string, string> = {
    '1.21.6': '52.0.40',
    '1.20.1': '47.3.12',
  };

  // 1. Download forge-<mc>-<build>-installer.jar from maven.minecraftforge.net into forge/<mc>/.
  // 2. Open as zip (yauzl), extract install_profile.json and version.json.
  // 3. Download libraries listed in install_profile.libraries via DownloadService.
  // 4. Run installer's "processors" step: for v2 install_profile, each processor is a `java -cp ... mainClass args` invocation. Spawn JVM (JavaService) and run them sequentially. Required for 1.21.6 because Forge generates a patched client jar from vanilla.
  // 5. Result: versions/<mcVer>-forge-<build>/<id>.json with merged manifest (libraries + new mainClass = `net.minecraftforge.bootstrap.ForgeBootstrap` or similar).
  async install(mcVersion: string, javaPath: string, onProgress: (p: LaunchProgress) => void): Promise<MergedVersion>;
}
```

`MergedVersion` extends `VanillaVersion` with the union of libraries and overridden `mainClass`/`arguments`.

### AuthService (rewrite, offline-only)

```ts
interface User {
  uuid: string;           // generated, persisted
  username: string;       // user-chosen
  accessToken: string;    // "0" for offline
  type: 'offline';
}

class AuthService {
  // Mojang offline-mode UUID: UUIDv3 in namespace 'OfflinePlayer:' + username
  // (this is what the vanilla server uses to identify offline players)
  private offlineUuid(username: string): string;

  // Read auth.json if present, else null.
  async getUser(): Promise<User | null>;

  // Generate UUID, persist to auth.json, return.
  async login(username: string): Promise<User>;

  async logout(): Promise<void>;  // delete auth.json
}
```

### MinecraftService (rewrite)

```ts
class MinecraftService {
  // Build full classpath: every library jar (resolved per OS rules) + version client jar.
  // Build JVM args: -Xmx<memory>M -Djava.library.path=<natives> <version.arguments.jvm filtered by rules> -cp <classpath> <mainClass>
  // Build game args: <version.arguments.game filtered, with placeholders substituted:
  //   ${auth_player_name}, ${version_name}, ${game_directory}, ${assets_root}, ${assets_index_name},
  //   ${auth_uuid}, ${auth_access_token}, ${user_type}, ${version_type}>
  // Spawn child_process with javaw.exe (on Windows, detached: false so we can wire pipes).
  // Pipe stdout/stderr through an event emitter so LauncherService can forward via IPC.
  async launch(opts: {
    version: MergedVersion;
    javaPath: string;
    gameDir: string;        // e.g. minecraftDir itself, or instances/<id> if we add instances later
    user: User;
    memory: number;
  }): Promise<{ pid: number; on: (event: 'exit' | 'log', cb: (data: unknown) => void) => void }>;
}
```

### LauncherService (rewrite — orchestrator)

```ts
class LauncherService extends EventEmitter {
  // Wires the state machine. Pseudocode:
  async play(opts: { version: 'forge-1.21.6' | 'forge-1.20.1' | ...; username: string; memory: number }) {
    this.emit('progress', { stage: 'resolving', progress: 0, message: 'Получение манифеста...' });
    const vanilla = await this.mojang.resolveVersion(parseMc(opts.version));

    this.emit('progress', { stage: 'java-check', progress: 0, message: 'Проверка Java...' });
    let java = await this.java.detect();
    if (!java) java = await this.java.install();  // installer emits its own progress

    this.emit('progress', { stage: 'libraries', progress: 0, message: 'Загрузка библиотек...' });
    await this.download.downloadMany(libraryJobs(vanilla), onAggregateProgress);

    this.emit('progress', { stage: 'assets', progress: 0, message: 'Загрузка ресурсов...' });
    const index = await this.mojang.resolveAssetIndex(vanilla);
    await this.download.downloadMany(assetJobs(index), onAggregateProgress);

    this.emit('progress', { stage: 'natives-extract', progress: 0, message: 'Распаковка библиотек...' });
    extractNatives(vanilla, nativesDir);

    let merged: MergedVersion = vanilla;
    if (opts.version.startsWith('forge-')) {
      this.emit('progress', { stage: 'forge-install', progress: 0, message: 'Установка Forge...' });
      merged = await this.forge.install(parseMc(opts.version), java.path, (p) => this.emit('progress', p));
    }

    const user = await this.auth.getUser() ?? await this.auth.login(opts.username);

    this.emit('progress', { stage: 'spawn', progress: 0, message: 'Запуск Minecraft...' });
    const proc = await this.minecraft.launch({ version: merged, javaPath: java.path, gameDir, user, memory: opts.memory });

    this.emit('progress', { stage: 'running', progress: 100, message: 'Игра запущена' });
    proc.on('log', (line) => this.emit('log', line));
    proc.on('exit', (code) => this.emit('progress', { stage: 'idle', progress: 0, message: code === 0 ? 'Игра завершена' : `Игра упала (код ${code})` }));
  }

  async cancel(): Promise<void>;  // aborts current download / kills spawned process
}
```

## IPC additions

`electron/ipc/channels.ts` gets:

```ts
LAUNCHER: {
  PLAY: 'launcher:play',
  GET_STATUS: 'launcher:getStatus',
  PROGRESS: 'launcher:progress',
  LOG: 'launcher:log',          // NEW
  CANCEL: 'launcher:cancel',    // NEW
}
```

`preload.ts` exposes:

```ts
launcher: {
  play, getStatus,
  onProgress: (cb) => listener wiring,
  onLog: (cb) => listener wiring,    // NEW
  cancel: () => ipcRenderer.invoke('launcher:cancel'),  // NEW
}
```

`useLauncherStore.play`: drop the fake `setInterval`. Subscribe to `bridge.launcher.onProgress` and write `{ progress, progressMessage }` directly from IPC. Map stage → friendlier label using a small constant table.

## Renderer changes

- `PlayButton`: show stage label below progress bar; on `stage === 'error'` show red caption with retry CTA.
- New optional `LauncherLogModal` (off by default, opens via Ctrl+L or a hidden dev shortcut) — streams last 200 log lines. Out of scope for v1 acceptance, but `onLog` IPC is wired so the modal can be added next.

## Testing strategy

Add Vitest to devDependencies:

```jsonc
"vitest": "^2.1.0",
"@types/node": already present
```

`vitest.config.ts`:

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

New script: `"test": "vitest run"`. Watch mode separately.

Unit tests per service:

- `MojangService` — parsing of a captured `version_manifest_v2.json` and a captured `1.21.6.json` fixture. Asserts library filtering by OS rules, asset index resolution.
- `DownloadService` — uses `nock` (mock HTTP) to assert: hash mismatch retries, max 3 attempts, skip-if-exists when sha1 matches, atomic rename on completion.
- `ForgeService` — parses captured `install_profile.json` from a real installer jar. Mocks `child_process.spawn` to verify processor invocations.
- `JavaService` — mocks fs + http; asserts Adoptium URL construction by arch/os, sha-256 verification.
- `AuthService` — deterministic UUID generation for known inputs (compared against the Mojang reference `UUID.nameUUIDFromBytes(("OfflinePlayer:" + name).getBytes(StandardCharsets.UTF_8))`).
- `MinecraftService` — classpath separator (`;` on Windows, `:` elsewhere), arg substitution, JVM args filtering by rules.

UI changes (PlayButton, LauncherLogModal) covered by manual smoke. Integration test (real launch) is manual on a dev machine.

## Acceptance criteria

1. `npm test` passes with at least one unit test per service listed above.
2. `npm run typecheck` passes.
3. On a clean Windows machine with no Java: click PLAY → JRE 21 installs → vanilla 1.21.6 (test version) launches and connects to `mc.xbestu.ru`.
4. On the same machine: switch version to "Forge 1.21.6", click PLAY → Forge installs (vanilla files already cached, only forge libs + processors run) → Forge MC launches.
5. Closing Minecraft cleanly returns the launcher to idle. Killing Minecraft returns launcher to idle with a non-fatal message.
6. Cancel button (added in PlayButton when `isLaunching && stage !== 'running'`) interrupts a download and cleans up partial files.
7. Re-launching a previously-launched version completes in < 5 seconds (everything cached).

## Risks

- **Forge installer format may differ for 1.21.6** vs known 1.20.x installers. Mitigation: download an actual 1.21.6 installer jar during implementation, inspect `install_profile.json` schema before locking the parser. If it's incompatible, fall back to shelling out: `java -jar installer.jar --installClient <gameDir>` (some Forge installers support headless mode; not all).
- **Asset count for 1.21.6 is ~7,000 files** ≈ 400 MB. Download time on a slow connection is non-trivial — must show per-file progress for UX.
- **Native library extraction**: 1.21.6's natives are typically distributed as separate "natives-windows" classifier jars or as part of a primary jar's `META-INF/native/`. Need to handle both cases.
- **Adoptium API rate-limiting**: low risk for individual users; download is one-shot. Cache the extracted runtime.
- **electron-builder asar packaging**: spawning `javaw.exe` from an asar-packed app works because we resolve `path.join(app.getPath('userData'), 'minecraft', 'runtime', 'jre-21', 'bin', 'javaw.exe')` — outside asar.
- **Windows path length limit**: deep maven paths + long usernames could exceed `MAX_PATH`. Mitigation: prefix `\\?\` in path normalization. (Low likelihood for typical install locations.)

## Out of scope (Wave 3-L)

- Fabric/NeoForge.
- MS OAuth (the loader UI for non-Forge versions falls through to vanilla; Fabric/NeoForge selections show a "in development" toast).
- Mod sync, modpack support.
- Game version isolation (separate `gameDir` per profile).
- Skin rendering.
- Update channel switching (release/snapshot/beta filter in UI).

## Implementation breakdown (preview for the plan)

The plan file (separately) will split this into bite-sized tasks. Approximate order:

1. Vitest setup + smoke test.
2. `electron/utils/paths.ts` — extend with `getRuntime`/`getVersions`/`getLibraries` etc.
3. `JavaService` — Adoptium download + extract, with tests.
4. `MojangService` — manifest fetch + cache, with fixtures.
5. `DownloadService` — parallel + verify + retry, with mocked HTTP.
6. `AuthService` — offline UUID + persist, with deterministic tests.
7. `MinecraftService` (classpath + args + spawn) for VANILLA first, with tests for arg/classpath builders.
8. `LauncherService` orchestrator for vanilla path; renderer rewired to real progress.
9. End-to-end smoke: launch vanilla 1.21.6 from clean state, in a real Electron dev run.
10. `ForgeService` — installer parse + processors, with tests.
11. `LauncherService` extension for Forge branch.
12. End-to-end smoke: launch Forge 1.21.6.
13. Cancel button + cleanup logic.
14. Error UX polish (PlayButton error caption, retry).

Each step is one commit. The plan document spells out file paths, code skeleton, and tests for each.
