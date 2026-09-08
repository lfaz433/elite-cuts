import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('exposes the database-free freelancer preview route', async () => {
  const [app, page] = await Promise.all([
    readFile(new URL('../../App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./FreelancerPreviewPage.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /path="freelancer-preview"/);
  assert.match(page, /Aperçu démo/);
  assert.match(page, /ServiceCatalog/);
  assert.match(page, /TravelSettings/);
});

test('keeps the freelancer preview outside tenant data listeners', async () => {
  const app = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /function AppContent\(\)/);
  assert.match(app, /pathname === '\/freelancer-preview'/);
});
