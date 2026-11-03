// @ts-nocheck -- This test executes real TS modules with mocked SDK I/O boundaries.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import ts from '../../../../functions/node_modules/typescript/lib/typescript.js';

const callableCalls: unknown[] = [];
let callableResponse: unknown;
function loadSource(filename = resolve(import.meta.dirname, 'publicFreelancer.ts')) {
  if (!existsSync(filename)) return {};
  const loaded = { exports: {} };
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  new Function('require', 'module', 'exports', output)((request: string) => {
    if (request === 'firebase/functions') return { httpsCallable: (_functions: unknown, name: string) => async (input: unknown) => {
      callableCalls.push([name, input]);
      if (callableResponse instanceof Error) throw callableResponse;
      return { data: callableResponse };
    } };
    if (request === '../firebase') return { functions: {} };
    if (request.startsWith('.')) return loadSource(resolve(dirname(filename), `${request}.ts`));
    throw new Error(`Unexpected dependency: ${request}`);
  }, loaded, loaded.exports);
  return loaded.exports;
}
const { parsePublicFreelancerPage, getPublicFreelancerPageBySlug } = loadSource();
const now = Date.parse('2099-09-05T09:00:00Z');
function validPage() {
  return {
    id: 'freelancer__freelancer-a', publicSlug: 'amine-fade', displayName: 'Amine Fade', cityId: 'fr-paris',
    bio: 'Coupe et barbe.', serviceSummary: 'Coupe', profileImageUrl: 'https://example.test/profile.jpg',
    portfolioUrls: ['https://example.test/approved.jpg'],
    services: [{ id: 'cut', label: 'Cut', priceMinor: 2500, durationMinutes: 30 }],
    workModes: { home: true, chair: true },
    workplace: { name: 'Studio', line1: '10 rue du Temple', postalCode: '75003', city: 'Paris' },
    socialLinks: { instagram: 'https://instagram.com/amine', whatsapp: '+33612345678' },
    cancellationWindowHours: 24, reviewSummary: { average: null, count: 0, reviews: [] },
    slots: [{ value: '2099-09-05T10:00', appointmentMode: 'chair' }],
  };
}

test('parses the complete direct page contract into an independent safe value', () => {
  assert.equal(typeof parsePublicFreelancerPage, 'function');
  const raw = validPage();
  const parsed = parsePublicFreelancerPage(raw, now);
  assert.deepStrictEqual(parsed, validPage());
  raw.services[0].label = 'changed'; raw.slots[0].value = 'changed'; raw.portfolioUrls.push('private');
  raw.workplace.line1 = 'changed'; raw.socialLinks.instagram = 'changed';
  assert.deepStrictEqual(parsed, validPage());
});

for (const key of ['clientAddress', 'clientEmail', 'clientPhone', 'homeOrigin', 'latitude', 'longitude',
  'rawProfile', 'identity', 'approvalStatus', 'portfolioItems', 'unexpected', '__proto__', 'constructor']) {
  test(`rejects an unexpected root response key: ${key}`, () => {
    assert.equal(typeof parsePublicFreelancerPage, 'function');
    const raw = { ...validPage(), [key]: 'private' };
    assert.equal(parsePublicFreelancerPage(raw, now), null);
  });
}
for (const [name, mutate] of [
  ['service private field', p => { p.services[0].clientEmail = 'private'; }],
  ['mode private field', p => { p.workModes.homeOrigin = 'private'; }],
  ['workplace private field', p => { p.workplace.clientAddress = 'private'; }],
  ['social private field', p => { p.socialLinks.clientEmail = 'private'; }],
  ['summary private field', p => { p.reviewSummary.clientEmail = 'private'; }],
  ['review private field', p => { p.reviewSummary = { average: 5, count: 1, reviews: [{ rating: 5, authorName: 'A', createdAtMs: now - 1, clientEmail: 'private' }] }; }],
  ['slot private field', p => { p.slots[0].clientAddress = 'private'; }],
  ['HTTP portfolio', p => { p.portfolioUrls = ['http://example.test/image.jpg']; }],
  ['broken HTTPS portfolio', p => { p.portfolioUrls = ['https://']; }],
  ['credential URL', p => { p.portfolioUrls = ['https://client:secret@example.test/image.jpg']; }],
  ['data profile image', p => { p.profileImageUrl = 'data:image/png;base64,aaa'; }],
  ['social executable URL', p => { p.socialLinks.instagram = 'javascript:alert(1)'; }],
  ['social host mismatch', p => { p.socialLinks.instagram = 'https://example.test/'; }],
  ['invalid slug', p => { p.publicSlug = 'Amine Fade'; }],
  ['salon profile ID', p => { p.id = 'salon__freelancer-a'; }],
  ['missing required key', p => { delete p.bio; }],
  ['invalid city', p => { p.cityId = 'us-new-york'; }],
  ['invalid price', p => { p.services[0].priceMinor = NaN; }],
  ['invalid duration', p => { p.services[0].durationMinutes = 14; }],
  ['duplicate services', p => { p.services.push({ ...p.services[0] }); }],
  ['no services', p => { p.services = []; }],
  ['invalid mode', p => { p.slots[0].appointmentMode = 'remote'; }],
  ['disabled mode', p => { p.workModes.chair = false; delete p.workplace; }],
  ['invalid slot date', p => { p.slots[0].value = '2099-02-30T10:00'; }],
  ['invalid slot time', p => { p.slots[0].value = '2099-09-05T25:00'; }],
  ['past slot', p => { p.slots[0].value = '2099-09-05T08:00'; }],
  ['current slot', p => { p.slots[0].value = '2099-09-05T09:00'; }],
  ['duplicate slots', p => { p.slots.push({ ...p.slots[0] }); }],
  ['nonboolean mode', p => { p.workModes.home = 'yes'; }],
  ['no active mode', p => { p.workModes = { home: false, chair: false }; }],
  ['missing workplace', p => { delete p.workplace; }],
  ['disabled workplace', p => { p.workModes.chair = false; p.slots = []; }],
  ['invalid cancellation', p => { p.cancellationWindowHours = -1; }],
  ['invalid review average', p => { p.reviewSummary.average = 7; }],
  ['inconsistent reviews', p => { p.reviewSummary.count = 1; }],
  ['invalid review', p => { p.reviewSummary = { average: 5, count: 1, reviews: [{ rating: 6, authorName: 'A', createdAtMs: now - 1 }] }; }],
]) {
  test(`rejects malformed or private nested response: ${name}`, () => {
    assert.equal(typeof parsePublicFreelancerPage, 'function');
    const raw = validPage(); mutate(raw);
    assert.equal(parsePublicFreelancerPage(raw, now), null);
  });
}

test('supports safe public reviews, empty availability, and a home-only page without a workplace', () => {
  assert.equal(typeof parsePublicFreelancerPage, 'function');
  const raw = validPage();
  raw.workModes.chair = false; delete raw.workplace; delete raw.profileImageUrl; raw.bio = ''; raw.slots = [];
  raw.reviewSummary = { average: 4.5, count: 2, reviews: [{ rating: 5, text: 'Super', authorName: 'Alex', createdAtMs: now - 1 }] };
  assert.deepStrictEqual(parsePublicFreelancerPage(raw, now), raw);
});

test('loads the normalized slug through the named callable and validates its response', async () => {
  assert.equal(typeof getPublicFreelancerPageBySlug, 'function');
  callableCalls.length = 0; callableResponse = validPage();
  assert.deepStrictEqual(await getPublicFreelancerPageBySlug('  AMINE FADE  '), validPage());
  assert.deepStrictEqual(callableCalls, [['getPublicFreelancerPageBySlug', { slug: 'amine-fade' }]]);
  callableResponse = { ...validPage(), clientEmail: 'private' };
  await assert.rejects(() => getPublicFreelancerPageBySlug('amine-fade'), /invalid public freelancer/i);
  callableResponse = { ...validPage(), publicSlug: 'other-person' };
  await assert.rejects(() => getPublicFreelancerPageBySlug('amine-fade'), /invalid public freelancer/i);
});

test('preserves not-found failures and rejects invalid input before a request', async () => {
  assert.equal(typeof getPublicFreelancerPageBySlug, 'function');
  callableCalls.length = 0;
  await assert.rejects(() => getPublicFreelancerPageBySlug('!'), /invalid/i);
  assert.deepStrictEqual(callableCalls, []);
  const notFound = Object.assign(new Error('not found'), { code: 'functions/not-found' });
  callableResponse = notFound;
  await assert.rejects(() => getPublicFreelancerPageBySlug('missing-profile'), error => error === notFound);
});
