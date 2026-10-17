# NatuxWorld — agent instructions

## Rules

- Do what has been asked; nothing more, nothing less.
- Read each file before editing it.
- Prefer editing existing files. Create files only when necessary, including modules extracted to meet the line limit.
- Do not create documentation files unless explicitly requested.
- Put working files and tests in `src/`, `tests/`, `docs/`, `config/`, or `scripts/`, not the repository root.
- Keep source files under 500 lines.
- Validate input at system boundaries.
- Never commit secrets, credentials, or `.env` files.
- Never add a `Co-Authored-By` trailer unless `.Codex/settings.json` explicitly enables `attribution.commit`.
- Preserve changes made by the user and other agents.

## Repository layout

- `src/`: React launcher renderer and component tests. Native subprojects are
  `src/native/` (Tauri), `src/profile-lock-core/` (Rust helper), and
  `src/lock-agent/` (Java agent).
- `electron/`: optional rollback subpackage with its own dependencies, Electron main process, IPC, services, and service tests.
- `tests/e2e/` and `tests/scripts/`: packaging acceptance harnesses and tooling/release contract tests.
- `scripts/`: build, release, verification, and document tooling.
- `website/`: Next.js site, auth/API, shop, admin, Prisma database, and `website/natux-plugin/` Paper plugin.
- `config/launcher-brand.json`: shared Rust/TypeScript launcher brand and public endpoints; `brand.config.ts` is the TypeScript facade.
- `website/src/lib/brand.ts`: website brand, configured through `NEXT_PUBLIC_*` variables.
- `config/launcher-release-policy.json`: reviewed Tauri/migration/rollout source defaults; repository variables are explicit operator overrides.
- `docs/BUYER_HANDOVER.md`: current handover and release instructions.

## Build and tests

Run tests after code changes and verify the relevant build before committing.
Commands below are separate steps so failures cannot be hidden by a later command.

Primary Tauri/Rust launcher (repository root; Rust toolchain, platform build tools, and Java JDK are required):

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build:web
cargo fmt --manifest-path src/native/Cargo.toml --check
cargo clippy --manifest-path src/native/Cargo.toml --all-targets --locked -- -D warnings
cargo test --manifest-path src/native/Cargo.toml --locked
```

Package the launcher on the target operating system:

```bash
npm run build
npm run test:packaged
```

Windows installer and portable acceptance are separate `test:tauri:installed` and `test:portable` checks; build the latter with `build:portable`. Installed acceptance must not replace an existing user installation; use a clean isolated environment/CI when the guard finds one. Portable smoke checks profile relocation between directories. The default `dev`, `build`, `build:web`, and `test:packaged` scripts use Tauri. Electron is optional: run `npm run electron:install` before `electron:dev`, `electron:build`, `typecheck:electron`, or `test:electron`; use `test:electron:packaged` for its rollback package. Do not add Electron runtime/build dependencies back to the root package.

Website (working directory `website/`):

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Website builds require its configured environment and generated Prisma client.
`npm test` includes React integration tests and service tests, but does not prove
that a real Minecraft client joined a server. `npm run test:packaged:live` is a
separate opt-in acceptance test; see the handover prerequisites. Never use a
player's normal account or game data as a test fixture.

## Agent coordination

Use the agent tools actually provided by the current host. For independent work
across three or more files, use named agents where available, with one owner per
file/module and an explicit recipient for results. Agents must not revert other
agents' edits. Coordinate through direct messages and completion events rather
than polling. The lead integrates the changes and runs shared build checks.
Small edits, documentation updates, configuration changes, and questions do not
require a team. If agent tools are unavailable, continue locally.

## Optional automation

This project does not require an external swarm daemon, memory service, or hooks
CLI to build, test, or contribute. The previous `@Codex-flow/cli` commands returned
npm E404 and have been removed. Do not run them or guess a replacement package.
Only use optional memory/hooks tools when they are installed, exposed by the host,
and their invocation has been verified. Missing optional tools must not block work.

The tracked `.mcp.json` and `.codex/config.toml` are repository-scoped defaults for
optional `claude-flow` MCP integrations. They contain no machine-specific paths or
credentials and are not build or contribution dependencies. Use them only when the
tool is installed and exposed by the host.
