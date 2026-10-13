import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function extract(source, pattern, label) {
  const match = pattern.exec(source);
  assert.ok(match, `${label} list is present`);
  return [...match[1].matchAll(/"([a-z][a-z0-9_]*)"/g)].map((entry) => entry[1]);
}

function assertSameEntries(actual, expected, label) {
  assert.equal(new Set(actual).size, actual.length, `${label} has no duplicates`);
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
}

function extractCallStringArguments(source, callName) {
  const sourceFile = ts.createSourceFile('contract.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const values = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === callName) {
      const [argument] = node.arguments;
      if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
        values.push(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath);
    return entry.isFile() ? [entryPath] : [];
  }));
  return nested.flat();
}

function extractRustEventNames(source) {
  const directEvents = [...source.matchAll(/\.emit\(\s*"([a-z][a-z0-9:_-]*)"/g)].map((match) => match[1]);
  const eventConstants = [...source.matchAll(/\bconst\s+\w*EVENT\w*\s*:\s*&str\s*=\s*"([a-z][a-z0-9:_-]*)"/g)]
    .map((match) => match[1]);
  return [...directEvents, ...eventConstants];
}

test('Tauri renderer bridge, event subscriptions, handlers, and capabilities stay in parity', async () => {
  const [library, buildScript, permissionToml, capabilityJson, bridge, rustFiles] = await Promise.all([
    readFile(path.join(repositoryRoot, 'src/native/src/lib.rs'), 'utf8'),
    readFile(path.join(repositoryRoot, 'src/native/build.rs'), 'utf8'),
    readFile(path.join(repositoryRoot, 'src/native/permissions/first-stage.toml'), 'utf8'),
    readFile(path.join(repositoryRoot, 'src/native/capabilities/main.json'), 'utf8'),
    readFile(path.join(repositoryRoot, 'src/services/tauri-bridge.ts'), 'utf8'),
    listFiles(path.join(repositoryRoot, 'src/native/src')),
  ]);

  const handler = /generate_handler!\s*\[(.*?)\]\s*\)/s.exec(library);
  assert.ok(handler, 'invoke_handler command list is present');
  const registered = [...handler[1].matchAll(/::([a-z][a-z0-9_]*)/g)].map((entry) => entry[1]);
  const generated = extract(buildScript, /commands\(&\[(.*?)\]\)/s, 'AppManifest');
  const granted = extract(permissionToml, /commands\.allow\s*=\s*\[(.*?)\]/s, 'Capability permission');

  assertSameEntries(generated, registered, 'AppManifest matches the registered native handlers');
  assertSameEntries(granted, registered, 'First-stage permissions match the registered native handlers');
  assert.ok(JSON.parse(capabilityJson).permissions.includes('allow-first-stage'));

  const internalNativeCommands = new Set(['health']);
  const expectedBridgeCommands = registered.filter((command) => !internalNativeCommands.has(command));
  const bridgeCommands = extractCallStringArguments(bridge, 'invokeCommand');
  assertSameEntries(bridgeCommands, expectedBridgeCommands, 'Tauri bridge invokes every public native command');

  const rustSources = await Promise.all(rustFiles
    .filter((file) => file.endsWith('.rs'))
    .map((file) => readFile(file, 'utf8')));
  const nativeEvents = [...new Set(rustSources.flatMap(extractRustEventNames))];
  const bridgeEvents = extractCallStringArguments(bridge, 'listen');
  assertSameEntries(bridgeEvents, nativeEvents, 'Tauri bridge listens to every native event exactly once');
});

test('Windows Tauri installer installs WebView2 through its online bootstrapper', async () => {
  const config = JSON.parse(await readFile(path.join(repositoryRoot, 'src/native/tauri.conf.json'), 'utf8'));
  assert.deepEqual(config.bundle.windows.webviewInstallMode, {
    type: 'downloadBootstrapper',
    silent: true,
  });
});
