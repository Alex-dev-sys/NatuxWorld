import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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

test('Tauri rollout must be explicit and Electron beta signing receives its selected channel', () => {
  const planJob = sectionBetween('  plan:\n', '  windows:\n');
  assert.match(planJob, /Set TAURI_ROLLOUT_PCT explicitly before enabling Tauri updates\./);
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
  assert.match(publishJob, /needs: \[plan, windows, macos\]/);
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

test('macOS CI verifies Electron legacy userData resolution', () => {
  const macosJob = sectionBetween('  macos:\n', '  publish:\n');
  assert.match(macosJob, /- name: Test Electron legacy userData path on macOS\n\x20{8}run: node --test tests\/e2e\/electron-safe-storage-interop\.test\.cjs/);
});

test('macOS Tauri validation retains the app bundle required by the startup smoke test', () => {
  const macosJob = sectionBetween('  macos:\n', '  publish:\n');
  const validationBuild = sectionBetween(
    '      - name: Build Tauri macOS validation bundle\n',
    '      - name: Import Tauri macOS signing certificate\n',
  );
  const startupSmoke = sectionBetween(
    '      - name: Packaged Tauri macOS startup smoke test\n',
    '      - name: Write macOS checksums\n',
  );

  assert.match(validationBuild, /npm run tauri:build -- --bundles app,dmg/);
  assert.match(startupSmoke, /bundle\/macos/);
  assert.match(macosJob, /NATUX_TAURI_MACOS_E2E_EXECUTABLE=.*node --test tests\/e2e\/tauri-macos-packaged\.test\.cjs/);
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
