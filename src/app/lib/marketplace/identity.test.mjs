import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from '../../../../functions/node_modules/typescript/lib/typescript.js';

const filename = resolve(import.meta.dirname, 'identity.ts');
const source = readFileSync(filename, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: filename,
}).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', output)(loaded, loaded.exports);
const { normalizePublicSlug, sanitizeSocialLinks } = loaded.exports;

test('normalizes an available public slug', () => {
  assert.equal(normalizePublicSlug(' Amine Fade Studio '), 'amine-fade-studio');
});

test('rejects unsafe social links', () => {
  assert.throws(() => sanitizeSocialLinks({ website: 'javascript:alert(1)' }));
});
