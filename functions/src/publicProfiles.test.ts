// @ts-nocheck
const { readFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const runTest = globalThis.test ?? require('node:test').test;
const test = Object.assign((name, fn) => runTest(name, fn), {
  each: values => (name, fn) => values.forEach((value, index) => runTest(`${name} [${index}]`, () => fn(value))),
});
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const builder = { https: { onCall: handler => handler }, firestore: { document: () => ({ onWrite: handler => handler }) } };
const sdk = {
  'firebase-functions': { ...builder, https: { ...builder.https, HttpsError }, region: () => builder },
  'firebase-admin': { firestore: { FieldValue: { serverTimestamp: () => 'server-timestamp' } } },
};

function loadSource(filename = resolve(__dirname, 'publicProfiles.ts'), cache = new Map()) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  new Function('require', 'module', 'exports', output)(request => request.startsWith('.')
    ? loadSource(resolve(dirname(filename), `${request}.ts`), cache)
    : sdk[request] ?? require(request), loaded, loaded.exports);
  return loaded.exports;
}

const { projectFreelancerPublicProfile, projectSalonPublicProfile,
  sanitizePublicProfile, listApprovedPublicProfiles } = loadSource();
const workplace = { name: 'Studio République', line1: '10 rue du Temple', postalCode: '75003', city: 'Paris' };
const source = {
  uid: 'freelancer-a', displayName: 'Amine Fade', bio: 'Coupe et barbe.', cityId: 'fr-paris',
  languages: ['fr'], serviceSummary: 'Coupe', serviceIds: ['coupe-degrade'],
  servicePricesMinor: { 'coupe-degrade': 2500 }, serviceDurationMinutes: { 'coupe-degrade': 45 },
  workModes: { home: true, chair: true }, workplace,
  availability: ['2099-09-05T10:00'],
  availabilityByMode: { home: ['2099-09-05T10:00'], chair: ['2099-09-05T11:00'] },
  visible: true, radiusKm: 10, travelFeeMinor: 500, deposit: { mode: 'none', value: 0 }, cancellationWindowHours: 24,
  identity: { publicSlug: 'amine-fade', socialLinks: { instagram: 'https://instagram.com/amine' },
    profileImageUrl: 'https://example.test/profile.jpg' },
  publicProfile: { approvalStatus: 'pending', visible: true, cityId: 'fr-paris',
    latitude: 48.861123, longitude: 2.351234, serviceSummary: 'Coupe', portfolioUrls: [],
    serviceIds: ['coupe-degrade'], homeVisit: false },
};

test('projects a visible pending freelancer for a direct shared link', () => {
  assert.partialDeepStrictEqual(projectFreelancerPublicProfile('freelancer-a', source), {
    kind: 'freelancer', visible: true, approvalStatus: 'pending', publicSlug: 'amine-fade',
    bio: 'Coupe et barbe.', socialLinks: { instagram: 'https://instagram.com/amine' },
    profileImageUrl: 'https://example.test/profile.jpg',
    services: [{ id: 'coupe-degrade', label: 'Coupe degrade', priceMinor: 2500, durationMinutes: 45 }],
    workModes: { home: true, chair: true }, workplace, cancellationWindowHours: 24,
    reviewSummary: { average: null, count: 0, reviews: [] },
  });
});

test('projects only safe fields and derives service labels from the saved service IDs', () => {
  const projection = projectFreelancerPublicProfile('freelancer-a', {
    ...source, publicProfile: { ...source.publicProfile, approvalStatus: 'approved' },
    homeOrigin: { latitude: 48.861123, longitude: 2.351234, line1: 'Private origin' },
    clientEmail: 'private@example.test', clientPhone: '+33612345678',
    homeAddress: { line1: 'Private visit address' },
    services: [{ id: 'coupe-degrade', label: 'Untrusted label', clientEmail: 'private@example.test' }],
  });
  assert.deepStrictEqual(projection, {
    kind: 'freelancer', cityId: 'fr-paris', latitude: 48.85, longitude: 2.35,
    serviceSummary: 'Coupe', portfolioUrls: [], visible: true, approvalStatus: 'approved',
    displayName: 'Amine Fade', serviceIds: ['coupe-degrade'], homeVisit: false,
    publicSlug: 'amine-fade', bio: 'Coupe et barbe.', socialLinks: { instagram: 'https://instagram.com/amine' },
    profileImageUrl: 'https://example.test/profile.jpg',
    services: [{ id: 'coupe-degrade', label: 'Coupe degrade', priceMinor: 2500, durationMinutes: 45 }],
    workModes: { home: true, chair: true }, workplace, cancellationWindowHours: 24,
    reviewSummary: { average: null, count: 0, reviews: [] },
  });
});

test.each([
  { visible: false },
  { publicProfile: { ...source.publicProfile, visible: false } },
  { publicProfile: { ...source.publicProfile, approvalStatus: 'rejected' } },
  { identity: { publicSlug: '', socialLinks: {} } },
  { identity: { publicSlug: 'NOT-normalized', socialLinks: {} } },
  { identity: { publicSlug: 'amine-fade', socialLinks: { website: 'javascript:alert(1)' } } },
  { serviceDurationMinutes: { 'coupe-degrade': 5 } },
  { servicePricesMinor: { 'coupe-degrade': -1 } },
  { serviceIds: [{ id: 'coupe-degrade', label: 'Injected' }] },
  { workModes: { home: false, chair: false } },
  { workplace: { name: 'Incomplete' } },
  { availabilityByMode: { home: [], chair: [] } },
  { cancellationWindowHours: '24' },
])('does not project a hidden or malformed freelancer %#', patch => {
  for (const approvalStatus of ['pending', 'approved']) {
    assert.equal(projectFreelancerPublicProfile('freelancer-a', {
      ...source, publicProfile: { ...source.publicProfile, approvalStatus }, ...patch,
    }), null);
  }
});

test('omits the commercial workplace when chair mode is disabled', () => {
  const projection = projectFreelancerPublicProfile('freelancer-a', {
    ...source, workModes: { home: true, chair: false },
  });
  assert.notEqual(projection, null);
  assert.equal(projection.workplace, undefined);
});

test('Discover sanitation and salon projections still require approval', () => {
  const pending = projectFreelancerPublicProfile('freelancer-a', source);
  assert.equal(sanitizePublicProfile('freelancer__freelancer-a', pending), null);
  const approved = projectFreelancerPublicProfile('freelancer-a', {
    ...source, publicProfile: { ...source.publicProfile, approvalStatus: 'approved' },
  });
  assert.partialDeepStrictEqual(sanitizePublicProfile('freelancer__freelancer-a', approved), { displayName: 'Amine Fade' });
  assert.equal(projectSalonPublicProfile('salon-a', { name: 'Salon', publicProfile: source.publicProfile }), null);
});

test('Discover queries approval and filters pending and hidden records returned by the storage boundary', async () => {
  const approved = projectFreelancerPublicProfile('freelancer-a', {
    ...source, publicProfile: { ...source.publicProfile, approvalStatus: 'approved' },
  });
  const records = [approved, { ...approved, approvalStatus: 'pending' }, { ...approved, visible: false }];
  const queryFilters = [];
  const query = {
    where(...args) { queryFilters.push(args); return query; },
    async get() { return { docs: records.map((data, index) => ({ id: `profile-${index}`, data: () => data })) }; },
  };
  const firestore = { collection(name) {
    if (name === 'cityLaunches') return { doc: () => ({ get: async () => ({ exists: true, data: () => ({ status: 'enabled' }) }) }) };
    if (name === 'publicProfiles') return query;
    throw new Error(`Unexpected collection ${name}`);
  } };
  const profiles = await listApprovedPublicProfiles('fr-paris', firestore);
  assert.deepStrictEqual(profiles.map(profile => profile.id), ['profile-0']);
  assert.ok(queryFilters.some(([key, operator, value]) => key === 'approvalStatus' && operator === '==' && value === 'approved'));
});
