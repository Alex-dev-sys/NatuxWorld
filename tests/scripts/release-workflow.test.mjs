import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveReleasePolicy } from '../../scripts/resolve-launcher-release-policy.mjs';

const workflow = (await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../.github/workflows/build.yml'),
  'utf8',
)).replace(/\r\n/g, '\n');

function sectionBetween(startMarker, endMarker) {
  const start = workflow.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing workflow marker: ${startMarker}`);
  const end = workflow.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing workflow marker: ${endMarker}`);
  return workflow.slice(start, end);
}

test('native CI installs targets into the same pinned toolchain selected by the Tauri crate', async () => {
  const pinned = await readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/native/rust-toolchain.toml'), 'utf8');
  const channel = /^channel\s*=\s*"(\d+\.\d+\.\d+)"\s*$/m.exec(pinned)?.[1];
  assert.ok(channel, 'Native builds require a pinned numeric Rust toolchain.');
  for (const job of [sectionBetween('  windows:\n', '  macos:\n'), sectionBetween('  macos:\n', '  macos_acceptance:\n')]) {
    const setup = job.slice(job.indexOf('uses: dtolnay/rust-toolchain@'));
    assert.ok(setup.startsWith('uses: dtolnay/rust-toolchain@'));
    assert.ok(setup.includes(`toolchain: ${channel}\n`), 'Cross targets must be installed for the crate toolchain, not an unrelated stable default.');
  }
  assert.match(sectionBetween('  macos:\n', '  macos_acceptance:\n'), /targets: aarch64-apple-darwin,x86_64-apple-darwin/);
});

test('PR-executed release planning receives credential-presence flags, not signing keys', () => {
  const planJob = sectionBetween('  plan:\n', '  windows:\n');
  const platformSigningSecrets = [
    'WIN_CSC_LINK',
    'WIN_CSC_KEY_PASSWORD',
    'CSC_LINK',
    'CSC_KEY_PASSWORD',
    'MAC_SIGNING_IDENTITY',
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
  ];

  assert.doesNotMatch(
    planJob,
    /(?:TAURI_SIGNING_PRIVATE_KEY|UPDATE_SIGNING_PRIVATE_KEY):\s*\$\{\{\s*secrets\./,
  );
  assert.match(
    planJob,
    /TAURI_SIGNING_PRIVATE_KEY_AVAILABLE:\s*\$\{\{\s*secrets\.TAURI_SIGNING_PRIVATE_KEY\s*!=\s*''\s*\}\}/,
  );
  assert.match(
    planJob,
    /UPDATE_SIGNING_PRIVATE_KEY_AVAILABLE:\s*\$\{\{\s*secrets\.UPDATE_SIGNING_PRIVATE_KEY\s*!=\s*''\s*\}\}/,
  );
  for (const secret of platformSigningSecrets) {
    assert.match(
      planJob,
      new RegExp(`${secret}_AVAILABLE:\\s*\\$\\{\\{\\s*secrets\\.${secret}\\s*!=\\s*''\\s*\\}\\}`),
    );
  }
  assert.doesNotMatch(
    planJob,
    /^\s*(?:WIN_CSC_LINK|WIN_CSC_KEY_PASSWORD|CSC_LINK|CSC_KEY_PASSWORD|MAC_SIGNING_IDENTITY|APPLE_ID|APPLE_APP_SPECIFIC_PASSWORD|APPLE_TEAM_ID):\s*\$\{\{\s*secrets\./m,
  );
  assert.match(planJob, /if \(\$signed -and \$missingSigningSecrets\.Count -gt 0\)/);
  assert.match(planJob, /CODE_SIGNING_ENABLED requires these GitHub Actions secrets:/);
  assert.doesNotMatch(planJob, /TAURI_UPDATES_ENABLED requires CODE_SIGNING_ENABLED=true/);
});

test('primary release policy explicitly enables signed Tauri, migration and rollout without provider variables', async () => {
  const source = JSON.parse(await readFile(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../config/launcher-release-policy.json'), 'utf8'));
  assert.deepEqual(source, { tauri: true, migrationEnabled: true, rolloutPct: 100 });
  assert.deepEqual(resolveReleasePolicy(source), source);
  assert.deepEqual(resolveReleasePolicy(source, { TAURI_UPDATES_ENABLED: '', TAURI_MIGRATION_ENABLED: '', TAURI_ROLLOUT_PCT: '' }), source);
  assert.deepEqual(resolveReleasePolicy(source, { TAURI_MIGRATION_ENABLED: ' false ', TAURI_ROLLOUT_PCT: '0' }),
    { tauri: true, migrationEnabled: false, rolloutPct: 0 });
  assert.deepEqual(resolveReleasePolicy(source, { TAURI_UPDATES_ENABLED: 'FALSE', TAURI_MIGRATION_ENABLED: 'false' }),
    { tauri: false, migrationEnabled: false, rolloutPct: 100 });
  for (const env of [{ TAURI_UPDATES_ENABLED: '0' }, { TAURI_MIGRATION_ENABLED: 'yes' },
    { TAURI_ROLLOUT_PCT: '101' }, { TAURI_ROLLOUT_PCT: '1.5' }, { TAURI_ROLLOUT_PCT: '01' },
    { TAURI_UPDATES_ENABLED: 'false' }]) assert.throws(() => resolveReleasePolicy(source, env));
  for (const invalid of [{}, { ...source, tauri: 'true' }, { ...source, rolloutPct: null },
    { ...source, rolloutPct: -1 }, { ...source, typo: true }]) assert.throws(() => resolveReleasePolicy(invalid));

  const planJob = sectionBetween('  plan:\n', '  windows:\n');
  assert.match(planJob, /node scripts\/resolve-launcher-release-policy\.mjs/);
  assert.match(planJob, /if \(\$LASTEXITCODE -ne 0\).*release policy is invalid/);
  assert.match(planJob, /\$tauriRequested = \$eligible -and \$policy\.tauri/);
  assert.match(planJob, /\$migrationRequested = \$tauriRequested -and \$policy\.migrationEnabled/);
  assert.match(planJob, /\$rolloutPct = \[string\]\$policy\.rolloutPct/);
  assert.match(planJob, /if \(\$tauriRequested -and \$env:TAURI_SIGNING_PRIVATE_KEY_AVAILABLE -ine 'true'\)/);
  assert.match(planJob, /if \(\$tauriRequested -and \$env:UPDATE_SIGNING_PRIVATE_KEY_AVAILABLE -ine 'true'\)/);
});

test('Electron beta signing receives its selected channel independently of Tauri rollout', () => {
  const planJob = sectionBetween('  plan:\n', '  windows:\n');
  assert.doesNotMatch(planJob, /Set TAURI_ROLLOUT_PCT explicitly before enabling Tauri updates\./);
  assert.doesNotMatch(planJob, /\$rolloutPct\s*=\s*'100'/);

  const signerStep = sectionBetween(
    '      - name: Sign update manifest and write Windows checksums\n',
    '      - name: Upload verified Windows release files\n',
  );
  assert.match(signerStep, /CHANNEL:\s*\$\{\{\s*needs\.plan\.outputs\.channel\s*\}\}/);
  assert.doesNotMatch(signerStep, /ROLLOUT_PCT/);
});

test('Windows and macOS Tauri updater bundles are verified against the embedded key', () => {
  const windowsStep = sectionBetween(
    '      - name: Build Tauri Windows updater bundle\n',
    '      - name: Build Tauri Windows validation bundle\n',
  );
  const macosStep = sectionBetween(
    '      - name: Build Tauri macOS updater bundles\n',
    '      - name: Package macOS (signed)\n',
  );

  assert.match(windowsStep, /cargo run --manifest-path src\/native\/Cargo\.toml --locked --bin verify-updater-signature/);
  assert.match(windowsStep, /if \(\$LASTEXITCODE -ne 0\)/);
  assert.match(macosStep, /cargo run --manifest-path src\/native\/Cargo\.toml --locked --bin verify-updater-signature/);
});

test('OS code signing is optional while Tauri updater signatures remain mandatory', () => {
  const windowsImport = sectionBetween(
    '      - name: Import Tauri Windows signing certificate\n',
    '      - name: Build Tauri Windows updater bundle\n',
  );
  const windowsStep = sectionBetween(
    '      - name: Build Tauri Windows updater bundle\n',
    '      - name: Build Tauri Windows validation bundle\n',
  );
  const macosImport = sectionBetween(
    '      - name: Import Tauri macOS signing certificate\n',
    '      - name: Build Tauri macOS updater bundles\n',
  );
  const macosStep = sectionBetween(
    '      - name: Build Tauri macOS updater bundles\n',
    '      - name: Package macOS (signed)\n',
  );

  assert.match(windowsImport, /if: needs\.plan\.outputs\.tauri == 'true' && needs\.plan\.outputs\.signed == 'true'/);
  assert.match(macosImport, /if: needs\.plan\.outputs\.tauri == 'true' && needs\.plan\.outputs\.signed == 'true'/);
  assert.match(windowsStep, /Get-AuthenticodeSignature -FilePath \$signedFile/);
  assert.match(windowsStep, /\$authenticode\.Status -ne 'Valid'/);
  assert.match(windowsStep, /SignerCertificate\.Thumbprint -ne \$expectedThumbprint/);
  const windowsSigningGate = windowsStep.indexOf("if ($env:NATUX_CODE_SIGNING_ENABLED -eq 'true') {");
  const windowsStage = windowsStep.indexOf("Copy-Item $installer.FullName 'release/tauri/");
  const windowsUpdaterVerifier = windowsStep.indexOf('verify-updater-signature -- "$($installer.FullName)" "$($installer.FullName).sig"');
  assert.ok(
    windowsSigningGate >= 0
      && windowsSigningGate < windowsStep.indexOf('Get-AuthenticodeSignature')
      && windowsStep.indexOf('Get-AuthenticodeSignature') < windowsStage
      && windowsStep.indexOf('SignerCertificate.Thumbprint -ne $expectedThumbprint') < windowsStage
      && windowsUpdaterVerifier >= 0 && windowsUpdaterVerifier < windowsStage,
    'Windows Authenticode checks are conditional; updater signature verification always precedes upload staging',
  );

  assert.match(macosStep, /codesign --verify --deep --strict --verbose=2/);
  assert.match(macosStep, /if \[\[ "\$NATUX_CODE_SIGNING_ENABLED" == 'true' \]\]/);
  assert.match(macosStep, /expected_identity=\$\(security find-identity -v -p codesigning build\.keychain/);
  assert.match(macosStep, /toupper\(hash\) == toupper\(configured\) \|\| name == configured/);
  assert.match(macosStep, /Authority=\$expected_identity/);
  assert.match(macosStep, /spctl --assess --type execute --verbose=2/);
  assert.match(macosStep, /xcrun stapler validate "\$dmg"/);
  assert.match(macosStep, /export APPLE_SIGNING_IDENTITY='-'/);
  assert.match(macosStep, /grep -F 'Signature=adhoc'/);
  const macosStage = macosStep.indexOf('cp "$updater_bundle" "release/tauri/');
  const macosUpdaterVerifier = macosStep.indexOf('verify-updater-signature -- "$updater_bundle" "$updater_bundle.sig"');
  const macosChecks = [
    macosUpdaterVerifier,
    macosStep.indexOf('codesign --verify --deep --strict --verbose=2'),
    macosStep.indexOf('grep -F "Authority=$expected_identity"'),
    macosStep.indexOf('spctl --assess --type execute --verbose=2'),
    macosStep.indexOf('xcrun stapler validate "$dmg"'),
  ];
  assert.ok(macosChecks.every((position) => position >= 0 && position < macosStage),
    'macOS artifacts must pass updater signature checks; OS signing checks run when enabled and ad-hoc signing is verified otherwise');
});

test('Tauri control metadata is checked with the Rust client key before release assets are uploaded', () => {
  const generationStep = sectionBetween(
    '      - name: Generate signed Tauri updater metadata\n',
    '      - name: Create or complete draft release\n',
  );
  const publishStep = sectionBetween(
    '      - name: Create or complete draft release\n',
    '      - name: Verify assets and publish\n',
  );
  const publishJob = workflow.slice(workflow.indexOf('  publish:\n'));

  assert.match(
    generationStep,
    /cargo run --manifest-path scripts\/tauri-control-verifier\/Cargo\.toml --locked --bin verify-tauri-control-signature -- release\/tauri\/natux-tauri-control\.json release\/tauri\/natux-tauri-control\.json\.sig/,
  );
  assert.ok(
    generationStep.indexOf('verify-tauri-control-signature') < generationStep.indexOf('sha256sum'),
    'control metadata signature must be verified before preparing release uploads',
  );
  assert.ok(
    generationStep.indexOf('unset UPDATE_SIGNING_PRIVATE_KEY') <
      generationStep.indexOf('cargo run --manifest-path scripts/tauri-control-verifier/'),
    'the signing key must be removed from the verifier process environment',
  );
  assert.ok(
    workflow.indexOf('      - name: Generate signed Tauri updater metadata\n') <
      workflow.indexOf('      - name: Create or complete draft release\n'),
    'control metadata verification must run before uploading assets to the version release',
  );
  assert.match(publishStep, /gh release upload/);
  assert.match(publishJob, /needs: \[plan, windows, macos, macos_acceptance\]/);
  assert.match(publishJob, /if: needs\.plan\.outputs\.release == 'true'/);
  assert.doesNotMatch(publishJob, /if:\s*always\(\)/,
    'release publishing must remain skipped when a platform signing job fails');

  const windowsJob = sectionBetween('  windows:\n', '  macos:\n');
  assert.match(
    windowsJob,
    /- name: Test Tauri control signature verifier\n\x20{8}run: cargo test --manifest-path scripts\/tauri-control-verifier\/Cargo\.toml --locked/,
  );
});

test('Windows CI checks Electron rollback against the installed Tauri profile', () => {
  const windowsJob = sectionBetween('  windows:\n', '  macos:\n');
  const electronPackage = windowsJob.indexOf('      - name: Package Windows (unsigned)');
  const packagedSmoke = windowsJob.indexOf('      - name: Packaged Windows smoke test');
  const rollbackSmoke = windowsJob.indexOf('      - name: Installed Tauri and Electron rollback smoke test');

  assert.notEqual(electronPackage, -1);
  assert.notEqual(packagedSmoke, -1);
  assert.notEqual(rollbackSmoke, -1);
  assert.ok(electronPackage < packagedSmoke, 'Electron package must be built before its packaged smoke test');
  assert.ok(packagedSmoke < rollbackSmoke, 'rollback smoke must run after both Tauri and Electron packages exist');
  assert.match(windowsJob, /- name: Installed Tauri and Electron rollback smoke test\n\x20{8}run: npm run test:tauri:installed/);
});

test('Windows CI compiles production hooks and accepts real published Electron installation migration before upload', () => {
  const windowsJob = sectionBetween('  windows:\n', '  macos:\n');
  const nativeBuild = windowsJob.indexOf('      - name: Build Tauri Windows validation bundle\n');
  const hooks = windowsJob.indexOf('      - name: Test compiled production NSIS migration hooks\n');
  const installed = windowsJob.indexOf('      - name: Installed Tauri and Electron rollback smoke test\n');
  const migration = windowsJob.indexOf('      - name: Accept published Electron to Tauri installation migration\n');
  const upload = windowsJob.indexOf('      - name: Upload verified Windows release files\n');
  assert.ok(nativeBuild >= 0 && nativeBuild < hooks && hooks < installed && installed < migration && migration < upload);
  assert.match(windowsJob, /run: node --test tests\/scripts\/tauri-installer-hooks\.test\.mjs/);
  const acceptance = sectionBetween('      - name: Accept published Electron to Tauri installation migration\n',
    '      - name: Sign update manifest and write Windows checksums\n');
  assert.match(acceptance, /if: github\.repository == 'Alex-dev-sys\/NatuxWorld'/);
  assert.match(acceptance, /NATUX_TAURI_ELECTRON_MIGRATION_ACCEPTANCE: '1'/);
  assert.match(acceptance, /NATUX_TAURI_ELECTRON_MIGRATION_DEDICATED_ACCOUNT: 'YES'/);
  assert.match(acceptance, /NATUX_TAURI_ELECTRON_MIGRATION_EPHEMERAL_CI: 'YES'/);
  assert.match(acceptance, /NATUX_TAURI_ELECTRON_MIGRATION_WINDOWS_ACCOUNT = \[Environment\]::UserName/);
  assert.match(acceptance, /NATUX_TAURI_E2E_INSTALLER:.*release\/tauri\/NatuxWorld-/);
  assert.match(acceptance, /Get-FileHash -LiteralPath \$application -Algorithm SHA512/);
  assert.match(acceptance, /node --test tests\/e2e\/tauri-electron-migration\.test\.cjs/);
  assert.doesNotMatch(acceptance, /secrets\./);
});

test('macOS CI verifies Electron legacy userData resolution', () => {
  const macosJob = sectionBetween('  macos:\n', '  publish:\n');
  assert.match(macosJob, /- name: Test Electron legacy userData path on macOS\n\x20{8}run: node --test tests\/e2e\/electron-safe-storage-interop\.test\.cjs/);
});

test('macOS native acceptance reuses both exact DMGs on PRs and releases without duplicate compilation', () => {
  const macosJob = sectionBetween('  macos:\n', '  publish:\n');
  const validationBuild = sectionBetween(
    '      - name: Build Tauri macOS validation bundle\n',
    '      - name: Import Tauri macOS signing certificate\n',
  );
  const stage = sectionBetween('      - name: Stage exact Tauri macOS acceptance artifacts\n',
    '      - name: Write macOS checksums\n');
  const acceptance = sectionBetween('  macos_acceptance:\n', '  publish:\n');
  assert.match(validationBuild, /if: needs\.plan\.outputs\.tauri != 'true'/);
  assert.match(validationBuild, /for target in x86_64-apple-darwin aarch64-apple-darwin/);
  assert.match(validationBuild, /APPLE_SIGNING_IDENTITY: '-'/);
  assert.match(validationBuild, /npm run tauri:build -- --target "\$target" --bundles app,dmg/);
  assert.doesNotMatch(validationBuild, /secrets\./);
  assert.match(stage, /cp "release\/tauri\/\$name" "release\/tauri-acceptance\/\$name"/);
  assert.match(stage, /cp "release\/tauri\/\$hash" "release\/tauri-acceptance\/\$hash"/);
  assert.match(stage, /shasum -a 512/);
  assert.match(stage, /Upload Tauri macOS acceptance artifacts on every branch/);
  assert.doesNotMatch(stage, /if: needs\.plan\.outputs/);
  assert.match(acceptance, /needs: \[plan, macos\]/);
  assert.match(acceptance, /runner: macos-15-intel\n\s+arch: x86_64/);
  assert.match(acceptance, /runner: macos-15\n\s+arch: aarch64/);
  assert.match(acceptance, /--name "natux-world-tauri-macos-acceptance-\$VERSION"/);
  assert.match(acceptance, /NATUX_TAURI_MACOS_E2E_DMG:.*\$\{\{ matrix.arch \}\}\.dmg/);
  assert.match(acceptance, /NATUX_TAURI_MACOS_E2E_EXECUTABLE_HASH_FILE:.*\$\{\{ matrix.arch \}\}\.txt/);
  assert.match(acceptance, /run: node --test tests\/e2e\/tauri-macos-packaged\.test\.cjs/);
  assert.doesNotMatch(acceptance, /cargo|tauri:build|--prefix electron|npm run .*build/);
  assert.match(
    macosJob,
    /Packaged macOS smoke test\n\s+# Manual migration-branch validation runs the dedicated Tauri smoke below;\n\s+# keep the legacy Electron CDP smoke on PRs and main-branch release builds\.\n\s+if: github\.event_name != 'workflow_dispatch' \|\| github\.ref == 'refs\/heads\/main'/,
  );
});

test('Windows Tauri packaged smoke has the WebView2 Runtime available', () => {
  const windowsJob = sectionBetween('  windows:\n', '  macos:\n');
  const validationBuild = sectionBetween(
    '      - name: Build Tauri Windows validation bundle\n',
    '      - name: Ensure WebView2 Runtime for Tauri packaged smoke test\n',
  );
  const runtimeSetup = sectionBetween(
    '      - name: Ensure WebView2 Runtime for Tauri packaged smoke test\n',
    '      - name: Packaged Tauri smoke test\n',
  );
  const packagedSmoke = windowsJob.indexOf('      - name: Packaged Tauri smoke test\n');

  assert.ok(packagedSmoke > windowsJob.indexOf('      - name: Ensure WebView2 Runtime for Tauri packaged smoke test\n'));
  assert.match(validationBuild, /run-tauri-validation-build\.mjs --bundles nsis/);
  assert.match(validationBuild, /if: needs\.plan\.outputs\.tauri != 'true'/);
  assert.doesNotMatch(validationBuild, /NATUX_TAURI_E2E_DEBUG_PORT/);
  assert.match(runtimeSetup, /MicrosoftEdgeWebView2Setup\.exe/);
  assert.match(runtimeSetup, /WEBVIEW2Setup/i);
  assert.match(runtimeSetup, /\/silent', '\/install/);
  assert.match(runtimeSetup, /F3017226-FE2A-4295-8BDF-00C3A9A7E4C5/);
  assert.match(windowsJob, /NATUX_TAURI_E2E_DEBUG_PORT: '9222'/);
});

test('release acceptance installs the publishable NSIS and checks its native executable hash', () => {
  const windowsJob = sectionBetween('  windows:\n', '  macos:\n');
  assert.match(windowsJob, /NATUX_TAURI_E2E_INSTALLER:.*release\/tauri\/NatuxWorld-/);
  assert.match(windowsJob, /NATUX_TAURI_E2E_EXECUTABLE_HASH_FILE:.*release\/tauri\/executable-sha512-windows-x86_64\.txt/);
  assert.match(windowsJob, /Get-FileHash -LiteralPath \$application -Algorithm SHA512/);
  assert.doesNotMatch(windowsJob, /tauri\.validation\.generated\.conf/);
  const macosJob = sectionBetween('  macos:\n', '  publish:\n');
  assert.match(macosJob, /shasum -a 512 "\$app_bundle\/Contents\/MacOS\/\$executable_name"/);
  assert.match(macosJob, /executable-sha512-darwin-\$arch\.txt/);
  assert.match(macosJob, /cp "release\/tauri\/\$name" "release\/tauri-acceptance\/\$name"/);
  assert.match(macosJob, /NATUX_TAURI_MACOS_E2E_DMG: release\/tauri-acceptance\/NatuxWorld-/);
  assert.match(macosJob, /NATUX_TAURI_MACOS_E2E_EXECUTABLE_HASH_FILE: release\/tauri-acceptance\/executable-sha512-darwin-/);
});

test('macOS updater job searches DMG in the Tauri dmg output directory', () => {
  const macosUpdater = sectionBetween(
    '      - name: Build Tauri macOS updater bundles\n',
    '      - name: Package macOS (signed)\n',
  );

  assert.match(macosUpdater, /macos_bundle_dir="src\/native\/target\/\$target\/release\/bundle\/macos"/);
  assert.match(macosUpdater, /dmg_bundle_dir="src\/native\/target\/\$target\/release\/bundle\/dmg"/);
  assert.match(macosUpdater, /find "\$macos_bundle_dir" .*'\*\.app\.tar\.gz'/);
  assert.match(macosUpdater, /find "\$dmg_bundle_dir" .*'\*\.dmg'/);
});

test('Windows CI runs the Electron to Tauri public API parity contract', () => {
  const windowsJob = sectionBetween('  windows:\n', '  macos:\n');
  assert.match(
    windowsJob,
    /Test Tauri release metadata and command permissions\n\x20{8}run: node --test .*native-api-parity\.test\.mjs/,
  );
});

test('Windows and macOS build native lock resources before compiling Tauri', () => {
  const windowsJob = sectionBetween('  windows:\n', '  macos:\n');
  const macosJob = sectionBetween('  macos:\n', '  publish:\n');

  for (const [platform, job] of [['Windows', windowsJob], ['macOS', macosJob]]) {
    const resourceBuild = job.indexOf('      - name: Build native lock runtime resources\n');
    const rustTests = job.indexOf('      - name: Rust tests\n');
    assert.ok(resourceBuild >= 0 && resourceBuild < rustTests,
      `${platform} CI must create the lock-agent JAR before Tauri build.rs runs`);
  }
});

test('Windows packages and tests portable ZIP from the already tested native binary', () => {
  const windowsJob = sectionBetween('  windows:\n', '  macos:\n');
  const smoke = windowsJob.indexOf('      - name: Packaged Tauri smoke test\n');
  const packageZip = windowsJob.indexOf('      - name: Package Tauri portable ZIP from tested native binary\n');
  const testZip = windowsJob.indexOf('      - name: Test Tauri portable profile and relocation\n');
  const upload = windowsJob.indexOf('      - name: Upload signed Tauri Windows updater bundle\n');
  assert.ok(smoke >= 0 && smoke < packageZip && packageZip < testZip && testZip < upload);
  const portableStep = sectionBetween('      - name: Package Tauri portable ZIP from tested native binary\n',
    '      - name: Tauri signed upgrade acceptance preflight\n');
  assert.match(portableStep, /run: node scripts\/package-tauri-portable\.mjs/);
  assert.match(portableStep, /run: npm run test:portable/);
  assert.doesNotMatch(portableStep, /npm run (?:build|tauri:build)/);
  const plan = sectionBetween('  plan:\n', '  windows:\n');
  assert.ok(plan.includes('NatuxWorld-$version-x64-portable.zip'));
  const publish = workflow.slice(workflow.indexOf('  publish:\n'));
  assert.ok(publish.includes('NatuxWorld-${{ needs.plan.outputs.version }}-x64-portable.zip'));
  assert.match(publish, /assets\+=\(release\/tauri\/\*\)/);
  assert.match(publish, /find \. -maxdepth 1 -type f ! -name 'SHA256SUMS-tauri\.txt'/);
});

test('legacy CI installs and invokes optional Electron tooling explicitly on both platforms', () => {
  for (const [platform, job] of [
    ['Windows', sectionBetween('  windows:\n', '  macos:\n')],
    ['macOS', sectionBetween('  macos:\n', '  publish:\n')],
  ]) {
    const install = job.indexOf('run: npm ci --prefix electron');
    const test = job.indexOf('run: npm run test:electron\n');
    const renderer = job.indexOf('run: npm run electron:build:web');
    const packaging = job.indexOf('run: npm run electron:package --');
    assert.ok(install >= 0 && install < test && test < renderer && renderer < packaging,
      `${platform} rollback dependencies and tests must precede the optional renderer and packager`);
    assert.doesNotMatch(job, /npx electron-builder/);
    assert.match(job, /npm run electron:package -- --config config\/electron-builder\.signed\.cjs/);
    assert.match(job, /npm run electron:package -- --(?:win|mac) --x64/);
    assert.match(job, /--publish never/);
  }
});
