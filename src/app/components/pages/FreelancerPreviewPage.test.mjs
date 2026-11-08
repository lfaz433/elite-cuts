import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('exposes the database-free freelancer preview route', async () => {
  const [app, page] = await Promise.all([
    readFile(new URL('../../App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./FreelancerPreviewPage.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /path="freelancer-preview"/);
  assert.match(page, /FreelancerPreviewShell/);
  assert.match(page, /TodayPanel/);
  assert.match(page, /PlannerPanel/);
  assert.match(page, /BookingsPanel/);
  assert.doesNotMatch(page, /ServiceCatalog/);
  assert.doesNotMatch(page, /TravelSettings/);
});

test('keeps the freelancer preview outside tenant data listeners', async () => {
  const app = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /function AppContent\(\)/);
  assert.match(app, /pathname === '\/freelancer-preview'/);
});

test('boots database-free previews without importing the Firebase application shell', async () => {
  const entry = await readFile(new URL('../../../main.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(entry, /import App from '\.\/app\/App'/);
  assert.match(entry, /import\('\.\/app\/App'\)/);
  assert.match(entry, /import\('\.\/app\/PreviewApp'\)/);
});

test('routes the public booking preview through the database-free preview app', async () => {
  const [entry, previewApp] = await Promise.all([
    readFile(new URL('../../../main.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../PreviewApp.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(entry, /book\/amine-fade-studio/);
  assert.match(previewApp, /PublicBookingPreviewPage/);
  assert.match(previewApp, /path="\/book\/amine-fade-studio"/);
});

test('provides a responsive seven-tab freelancer shell with local notifications', async () => {
  const shell = await readFile(new URL('../freelancer/preview/FreelancerPreviewShell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /Navigation principale/);
  assert.match(shell, /aria-label="Navigation mobile"/);
  assert.match(shell, /Notifications/);
  assert.match(shell, /PREVIEW_NAVIGATION/);
  assert.match(shell, /PREVIEW_MOBILE_NAVIGATION/);
  assert.match(shell, />Plus</);
  assert.match(shell, /min-w-0/);
  assert.match(shell, /data-demo-local/);
});
