import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function findNode(node, predicate) {
  if (predicate(node)) return node;
  return ts.forEachChild(node, (child) => findNode(child, predicate));
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function extractPreloadApiPaths(sourceText) {
  const source = ts.createSourceFile('electron/preload.ts', sourceText, ts.ScriptTarget.Latest, true);
  const declaration = findNode(source, (node) => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'api');
  assert.ok(declaration && ts.isObjectLiteralExpression(declaration.initializer),
    'Electron preload api object exists');

  function visit(object, prefix = '') {
    return object.properties.flatMap((property) => {
      assert.ok(ts.isPropertyAssignment(property), 'Electron preload API uses named properties');
      const name = propertyName(property.name);
      assert.ok(name, 'Electron preload API property has a static name');
      const memberPath = prefix ? `${prefix}.${name}` : name;
      return ts.isObjectLiteralExpression(property.initializer)
        ? visit(property.initializer, memberPath)
        : [memberPath];
    });
  }

  return visit(declaration.initializer).sort();
}

function extractNeutralApiPaths(sourceText) {
  const source = ts.createSourceFile('src/types/native.ts', sourceText, ts.ScriptTarget.Latest, true);
  const declaration = findNode(source, (node) => ts.isInterfaceDeclaration(node)
    && node.name.text === 'NatuxAPI');
  assert.ok(declaration, 'neutral NatuxAPI interface exists');

  function visit(type, prefix = '') {
    return type.members.flatMap((member) => {
      assert.ok(ts.isPropertySignature(member) && member.name,
        'neutral NatuxAPI uses named property signatures');
      const name = propertyName(member.name);
      assert.ok(name, 'neutral NatuxAPI property has a static name');
      const memberPath = prefix ? `${prefix}.${name}` : name;
      return member.type && ts.isTypeLiteralNode(member.type)
        ? visit(member.type, memberPath)
        : [memberPath];
    });
  }

  return visit(declaration).sort();
}

test('neutral NatuxAPI preserves every public Electron preload method', async () => {
  const [electronPreload, neutralTypes] = await Promise.all([
    readFile(path.join(repositoryRoot, 'electron', 'preload.ts'), 'utf8'),
    readFile(path.join(repositoryRoot, 'src', 'types', 'native.ts'), 'utf8'),
  ]);
  const electronMethods = extractPreloadApiPaths(electronPreload);
  const neutralMethods = extractNeutralApiPaths(neutralTypes);

  assert.deepEqual(neutralMethods, electronMethods);
  assert.ok(electronMethods.length >= 40, 'the parity contract covers the complete launcher API');
});
