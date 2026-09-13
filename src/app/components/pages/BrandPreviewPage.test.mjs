import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('exposes a database-free multi-salon brand preview', async () => {
  const [app, page] = await Promise.all([
    readFile(new URL('../../App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./BrandPreviewPage.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /path="brand-preview"/);
  assert.match(app, /pathname === '\/brand-preview'/);
  assert.match(page, /Aperçu démo/);
  assert.match(page, /Vue principale/);
  assert.match(page, /Autoriser la création de comptes travailleurs/);
});
