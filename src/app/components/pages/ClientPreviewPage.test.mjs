import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('exposes a database-free client dashboard preview', async () => {
  const [app, page] = await Promise.all([
    readFile(new URL('../../App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./ClientPreviewPage.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /path="client-preview"/);
  assert.match(app, /pathname === '\/client-preview'/);
  assert.match(page, /Aperçu démo/);
  assert.match(page, /Trouver un barbier/);
  assert.match(page, /Vos rendez-vous/);
});
