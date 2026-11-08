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
let defaultFirestore;
let browserProfiles = [];
function builder(region, options = {}) {
  return { runWith: next => builder(region, { ...options, ...next }),
    https: { onCall: handler => Object.assign(handler, { options }) }, firestore: {
    document: path => ({ onWrite: handler => Object.assign(handler, { path, region }) }),
  } };
}
const sdk = {
  'firebase-functions': { ...builder(), https: { ...builder().https, HttpsError }, region: value => builder(value) },
  'firebase-admin': { firestore: Object.assign(() => defaultFirestore, { FieldValue: { serverTimestamp: () => 'server-timestamp' } }) },
  'firebase/functions': { httpsCallable: () => async () => ({ data: browserProfiles }) },
};

function loadSource(filename = resolve(__dirname, 'publicProfiles.ts'), cache = new Map()) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  new Function('require', 'module', 'exports', output)(request => request.endsWith('/firebase') ? { functions: {} } : request.startsWith('.')
    ? loadSource(resolve(dirname(filename), `${request}.ts`), cache)
    : sdk[request] ?? require(request), loaded, loaded.exports);
  return loaded.exports;
}

const { projectFreelancerPublicProfile, projectSalonPublicProfile,
  sanitizePublicProfile, listApprovedPublicProfiles, getPublicFreelancerPageBySlug,
  getPublicFreelancerPageBySlugFunction, refreshFreelancerPublicProfile,
  syncFreelancerPublicProfile, syncFreelancerReviewSummary } = loadSource();
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

function legacyApprovedSource() {
  const legacy = structuredClone(source);
  legacy.publicProfile.approvalStatus = 'approved';
  delete legacy.serviceDurationMinutes;
  delete legacy.workModes;
  delete legacy.availabilityByMode;
  delete legacy.workplace;
  return legacy;
}

test('keeps a legacy approved profile in Discover using absent-field defaults', () => {
  const legacy = legacyApprovedSource();
  const projection = projectFreelancerPublicProfile('freelancer-a', legacy);
  assert.notEqual(projection, null);
  assert.equal(projection.approvalStatus, 'approved');
  assert.deepStrictEqual(projection.workModes, { home: true, chair: false });
  assert.deepStrictEqual(projection.services, [
    { id: 'coupe-degrade', label: 'Coupe degrade', priceMinor: 2500, durationMinutes: 30 },
  ]);
  assert.equal(projection.workplace, undefined);
  assert.equal(sanitizePublicProfile('freelancer__freelancer-a', projection)?.displayName, 'Amine Fade');
  assert.equal(Object.hasOwn(legacy, 'serviceDurationMinutes'), false);
  assert.equal(Object.hasOwn(legacy, 'workModes'), false);
  assert.equal(Object.hasOwn(legacy, 'availabilityByMode'), false);
});

test('refresh preserves an approved original profile without identity or slug in Discover only', async () => {
  // The original Discover fixture predates all enhanced profile/save fields.
  const legacy = { displayName: 'Amine Fade', visible: true,
    publicProfile: { ...source.publicProfile, approvalStatus: 'approved' } };
  let projection;
  const firestore = { collection: name => ({ doc: id => ({ name, id }), where: () => ({ name }) }),
    runTransaction: fn => fn({ get: async ref => ref.name === 'freelancerProfiles'
      ? { exists: true, data: () => legacy } : { docs: [] },
    set: (_ref, value) => { projection = value; }, delete: () => { projection = null; } }) };
  await refreshFreelancerPublicProfile('freelancer-a', firestore);
  assert.ok(projection); assert.equal(projection.publicSlug, undefined);
  assert.equal(sanitizePublicProfile('freelancer__freelancer-a', projection)?.displayName, 'Amine Fade');
  browserProfiles = [sanitizePublicProfile('freelancer__freelancer-a', projection)];
  const discovery = loadSource(resolve(__dirname, '../../src/app/lib/marketplace/discovery.ts'));
  assert.deepEqual((await discovery.listPublicProfiles({ cityId: 'fr-paris' })).map(profile => profile.displayName), ['Amine Fade']);
  const state = directPageStore(); state.publicProfiles['freelancer__freelancer-a'] = projection;
  await assert.rejects(getPublicFreelancerPageBySlug('amine-fade', lookupFirestore(state), lookupNow), { code: 'not-found' });
});
test('direct page discloses the official home travel fee without private origin', async () => {
  const page = await getPublicFreelancerPageBySlug('amine-fade', lookupFirestore(directPageStore()), lookupNow);
  assert.equal(page.travelFeeMinor, 500);
  assert.doesNotMatch(JSON.stringify(page), /homeOrigin|latitude|longitude|clientEmail/);
});
test('public slots list only services that fit before or after occupied intervals', async () => {
  const state = directPageStore();
  state.publicProfiles['freelancer__freelancer-a'].services.push({ id: 'quick', label: 'Quick', priceMinor: 1000, durationMinutes: 15 });
  state.availability['freelancer-a'].reservedIntervals = [{ slot: '2099-09-05T10:30', startMs: Date.parse('2099-09-05T08:30Z'), endMs: Date.parse('2099-09-05T09:15Z') }];
  const page = await getPublicFreelancerPageBySlug('amine-fade', lookupFirestore(state), lookupNow);
  assert.deepEqual(page.slots, [{ value: '2099-09-05T10:00', appointmentMode: 'home', serviceIds: ['quick'] }]);
});

test.each([
  { serviceDurationMinutes: null },
  { serviceDurationMinutes: {} },
  { serviceDurationMinutes: { 'coupe-degrade': '30' } },
  { workModes: null },
  { workModes: { home: 'yes', chair: false } },
  { availabilityByMode: null },
  { availabilityByMode: { home: [], chair: [] } },
  { availabilityByMode: { home: ['invalid-slot'], chair: [] } },
  { availability: ['2099-02-30T10:00'] },
])('rejects malformed fields on a legacy approved profile instead of defaulting them %#', patch => {
  assert.equal(projectFreelancerPublicProfile('freelancer-a', {
    ...legacyApprovedSource(), ...patch,
  }), null);
});

test('projects a visible pending freelancer for a direct shared link', () => {
  assert.partialDeepStrictEqual(projectFreelancerPublicProfile('freelancer-a', source), {
    kind: 'freelancer', visible: true, approvalStatus: 'pending', publicSlug: 'amine-fade',
    bio: 'Coupe et barbe.', socialLinks: { instagram: 'https://instagram.com/amine' },
    profileImageUrl: 'https://example.test/profile.jpg',
    services: [{ id: 'coupe-degrade', label: 'Coupe degrade', priceMinor: 2500, durationMinutes: 45 }],
    workModes: { home: true, chair: true }, workplace, cancellationWindowHours: 24, travelFeeMinor: 500,
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
    workModes: { home: true, chair: true }, workplace, cancellationWindowHours: 24, travelFeeMinor: 500,
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

// 09:00 in Paris during summer time.
const lookupNow = Date.parse('2099-09-05T07:00:00Z');
function directPageStore() {
  return {
    publicProfileSlugs: { 'amine-fade': { profileId: 'freelancer__freelancer-a', freelancerId: 'freelancer-a' } },
    publicProfiles: { 'freelancer__freelancer-a': {
      ...projectFreelancerPublicProfile('freelancer-a', source),
      portfolioUrls: ['https://example.test/approved.jpg'],
    } },
    availability: { 'freelancer-a': {
      ownerId: 'freelancer-a', ownerType: 'freelancer',
      availableSlots: ['2099-09-05T11:00', '2099-09-05T10:00'], reservedSlots: [],
      modeBySlot: { '2099-09-05T10:00': 'home', '2099-09-05T11:00': 'chair' },
    } },
  };
}
function lookupFirestore(state) {
  return { collection(name) {
    if (!['publicProfileSlugs', 'publicProfiles', 'availability', 'bookingRequests'].includes(name)) {
      throw new Error(`Public resolver must not read ${name}`);
    }
    return { where: (field, op, value) => ({ get: async () => ({ docs: Object.values(state[name] ?? {})
      .filter(data => data[field] === value).map(data => ({ data: () => data })) }) }), doc(id) { return { get: async () => ({
      id, exists: Boolean(state[name]?.[id]), data: () => structuredClone(state[name]?.[id]),
    }) }; } };
  } };
}
test('older reservations without interval metadata still hide overlapping public starts', async () => {
  const state = directPageStore();
  state.availability['freelancer-a'].reservedSlots = ['2099-09-05T10:30'];
  state.bookingRequests = { old: { ownerId: 'freelancer-a', ownerType: 'freelancer', date: '2099-09-05', time: '10:30', status: 'confirmed', durationMinutes: 45 } };
  const page = await getPublicFreelancerPageBySlug('amine-fade', lookupFirestore(state), lookupNow);
  assert.deepEqual(page.slots, []);
});

test('profile and review changes rebuild the projection from current source and approved reviews', async () => {
  assert.equal(typeof refreshFreelancerPublicProfile, 'function');
  assert.equal(typeof syncFreelancerReviewSummary, 'function');
  const state = { profile: structuredClone(source), reviews: [
    { freelancerId: 'freelancer-a', bookingId: 'booking-a', status: 'approved', rating: 5,
      authorName: 'Ada C.', createdAt: { toMillis: () => 1 }, clientEmail: 'private' },
    { freelancerId: 'freelancer-a', bookingId: 'booking-b', status: 'hidden', rating: 1,
      authorName: 'Bob D.', createdAt: { toMillis: () => 2 } },
  ], projection: undefined };
  const reads = [];
  defaultFirestore = {
    collection(name) { return {
      doc: id => ({ path: `${name}/${id}` }),
      where: (field, op, value) => ({ name, field, op, value }),
    }; },
    async runTransaction(fn) {
      let writing = false;
      return fn({
        async get(ref) {
          assert.equal(writing, false);
          if (ref.path === 'freelancerProfiles/freelancer-a') return { exists: !!state.profile, data: () => state.profile };
          assert.deepStrictEqual(ref, { name: 'freelancerReviews', field: 'freelancerId', op: '==', value: 'freelancer-a' });
          reads.push(ref);
          return { docs: state.reviews.map(value => ({ data: () => value })) };
        },
        set(ref, value) { writing = true; assert.equal(ref.path, 'publicProfiles/freelancer__freelancer-a'); state.projection = value; },
        delete(ref) { writing = true; assert.equal(ref.path, 'publicProfiles/freelancer__freelancer-a'); state.projection = null; },
      });
    },
  };
  await refreshFreelancerPublicProfile('freelancer-a', defaultFirestore);
  assert.deepStrictEqual(state.projection.reviewSummary, {
    average: 5, count: 1, reviews: [{ rating: 5, authorName: 'Ada C.', createdAtMs: 1 }],
  });
  assert.doesNotMatch(JSON.stringify(state.projection), /clientEmail|private/);
  state.profile.displayName = 'Updated Name';
  await syncFreelancerPublicProfile({ after: { exists: true, data: () => source } }, { params: { uid: 'freelancer-a' } });
  assert.equal(state.projection.displayName, 'Updated Name');
  assert.equal(state.projection.reviewSummary.count, 1);
  const change = { before: { exists: true, data: () => ({ freelancerId: 'freelancer-a' }) },
    after: { exists: true, data: () => ({ freelancerId: 'freelancer-a' }) } };
  state.reviews[0].status = 'hidden';
  await syncFreelancerReviewSummary(change);
  assert.deepStrictEqual(state.projection.reviewSummary, { average: null, count: 0, reviews: [] });
  state.reviews[1].status = 'approved';
  await syncFreelancerReviewSummary(change);
  assert.equal(state.projection.reviewSummary.average, 1);
  state.reviews = [];
  await syncFreelancerReviewSummary({ ...change, after: { exists: false } });
  assert.equal(state.projection.reviewSummary.count, 0);
  state.profile = null;
  await syncFreelancerReviewSummary(change);
  assert.equal(state.projection, null);
  assert.equal(syncFreelancerReviewSummary.region, 'europe-west1');
  assert.equal(syncFreelancerReviewSummary.path, 'freelancerReviews/{reviewId}');
  assert.equal(reads.length, 5);
});

for (const [name, reviewSummary] of [
  ['more than five reviews', { average: 5, count: 6, reviews: Array.from({ length: 6 }, () => ({ rating: 5, authorName: 'Ada C.', createdAtMs: 1 })) }],
  ['text over 500 characters', { average: 5, count: 1, reviews: [{ rating: 5, authorName: 'Ada C.', createdAtMs: 1, text: 'x'.repeat(501) }] }],
]) test(`public resolver rejects ${name}`, async () => {
  const state = directPageStore(); state.publicProfiles['freelancer__freelancer-a'].reviewSummary = reviewSummary;
  await assert.rejects(() => getPublicFreelancerPageBySlug('amine-fade', lookupFirestore(state), lookupNow), e => e.code === 'not-found');
});

test.each(['pending', 'approved'])('resolves visible direct profiles independently of Discover approval %#', async approvalStatus => {
  const state = directPageStore();
  state.publicProfiles['freelancer__freelancer-a'].approvalStatus = approvalStatus;
  const page = await getPublicFreelancerPageBySlug('  AMINE FADE  ', lookupFirestore(state), lookupNow);
  assert.deepStrictEqual(page, {
    id: 'freelancer__freelancer-a', publicSlug: 'amine-fade', displayName: 'Amine Fade', cityId: 'fr-paris',
    bio: 'Coupe et barbe.', serviceSummary: 'Coupe', profileImageUrl: 'https://example.test/profile.jpg',
    portfolioUrls: ['https://example.test/approved.jpg'],
    services: [{ id: 'coupe-degrade', label: 'Coupe degrade', priceMinor: 2500, durationMinutes: 45 }],
    workModes: { home: true, chair: true }, workplace,
    socialLinks: { instagram: 'https://instagram.com/amine' }, cancellationWindowHours: 24, travelFeeMinor: 500,
    reviewSummary: { average: null, count: 0, reviews: [] },
    slots: [
      { value: '2099-09-05T10:00', appointmentMode: 'home' },
      { value: '2099-09-05T11:00', appointmentMode: 'chair' },
    ],
  });
});

test('selects a closed public response without private source, contacts, coordinates or unapproved portfolio objects', async () => {
  const state = directPageStore();
  Object.assign(state.publicProfiles['freelancer__freelancer-a'], {
    homeOrigin: { line1: '12 rue privée', latitude: 48.861123 }, clientEmail: 'client@private.test',
    clientPhone: '+33600000000', rawProfile: source, identity: { clientAddress: '12 rue privée' },
    portfolioItems: [{ imageUrl: 'https://example.test/pending.jpg', moderationStatus: 'pending' }],
  });
  Object.assign(state.availability['freelancer-a'], { clientAddress: '12 rue privée', clientEmail: 'private' });
  const page = await getPublicFreelancerPageBySlug('amine-fade', lookupFirestore(state), lookupNow);
  assert.deepStrictEqual(Object.keys(page).sort(), [
    'id', 'publicSlug', 'displayName', 'cityId', 'bio', 'serviceSummary', 'profileImageUrl',
    'portfolioUrls', 'services', 'workModes', 'workplace', 'socialLinks', 'cancellationWindowHours', 'travelFeeMinor', 'reviewSummary', 'slots',
  ].sort());
  assert.doesNotMatch(JSON.stringify(page), /12 rue|clientEmail|clientPhone|clientAddress|rawProfile|homeOrigin|latitude|pending\.jpg/);
});

test.each([
  state => { delete state.publicProfileSlugs['amine-fade']; },
  state => { delete state.publicProfiles['freelancer__freelancer-a']; },
  state => { state.publicProfileSlugs['amine-fade'].freelancerId = 'someone-else'; },
  state => { state.publicProfileSlugs['amine-fade'].profileId = 'salon__freelancer-a'; },
  state => { state.publicProfileSlugs['amine-fade'].freelancerId = '../private'; },
  state => { state.publicProfiles['freelancer__freelancer-a'].publicSlug = 'renamed-profile'; },
  state => { state.publicProfiles['freelancer__freelancer-a'].visible = false; },
  state => { state.publicProfiles['freelancer__freelancer-a'].kind = 'salon'; },
  state => { state.publicProfiles['freelancer__freelancer-a'].approvalStatus = 'rejected'; },
  state => { state.publicProfiles['freelancer__freelancer-a'].services[0].durationMinutes = 0; },
  state => { state.publicProfiles['freelancer__freelancer-a'].services[0].priceMinor = '2500'; },
  state => { state.publicProfiles['freelancer__freelancer-a'].services[0].clientEmail = 'private'; },
  state => { state.publicProfiles['freelancer__freelancer-a'].portfolioUrls = ['http://example.test/image.jpg']; },
  state => { state.publicProfiles['freelancer__freelancer-a'].profileImageUrl = 'https://'; },
  state => { state.publicProfiles['freelancer__freelancer-a'].socialLinks = { clientEmail: 'private' }; },
  state => { state.publicProfiles['freelancer__freelancer-a'].workplace.clientAddress = 'private'; },
  state => { state.publicProfiles['freelancer__freelancer-a'].reviewSummary.reviews = [{ rating: 5, clientEmail: 'private' }]; },
  state => { state.publicProfiles['freelancer__freelancer-a'].cityId = 'unknown'; },
  state => { state.publicProfiles['freelancer__freelancer-a'].workModes = { home: false, chair: false }; },
  state => { delete state.publicProfiles['freelancer__freelancer-a'].workplace; },
  state => { delete state.availability['freelancer-a']; },
  state => { state.availability['freelancer-a'].ownerId = 'someone-else'; },
  state => { state.availability['freelancer-a'].ownerType = 'salon'; },
  state => { state.availability['freelancer-a'].availableSlots = 'invalid'; },
  state => { state.availability['freelancer-a'].reservedSlots = 'invalid'; },
  state => { state.availability['freelancer-a'].modeBySlot = null; },
])('returns not-found for unknown, stale, hidden or malformed direct records %#', async mutate => {
  const state = directPageStore(); mutate(state);
  await assert.rejects(() => getPublicFreelancerPageBySlug('amine-fade', lookupFirestore(state), lookupNow),
    error => error.code === 'not-found' && /not found/i.test(error.message));
});

test('includes only future free distinct slots with valid enabled modes and real calendar dates', async () => {
  const state = directPageStore();
  state.publicProfiles['freelancer__freelancer-a'].workModes = { home: false, chair: true };
  const times = ['2099-09-05T08:00', '2099-09-05T09:00', '2099-09-05T10:00', '2099-09-05T11:00',
    '2099-09-05T12:00', '2099-09-05T13:00', '2099-09-05T14:00', '2099-02-30T10:00', '2099-09-05T25:00'];
  state.availability['freelancer-a'] = {
    ownerId: 'freelancer-a', ownerType: 'freelancer', availableSlots: [...times, '2099-09-05T11:00'],
    reservedSlots: ['2099-09-05T12:00'], modeBySlot: { ...Object.fromEntries(times.map(t => [t, 'chair'])),
      '2099-09-05T10:00': 'home', '2099-09-05T13:00': 'invalid', '2099-09-05T14:00': undefined },
  };
  const page = await getPublicFreelancerPageBySlug('amine-fade', lookupFirestore(state), lookupNow);
  assert.deepStrictEqual(page.slots, [{ value: '2099-09-05T11:00', appointmentMode: 'chair' }]);
});

test('a visible profile may have no remaining free appointments and omits a disabled chair workplace', async () => {
  const state = directPageStore();
  state.publicProfiles['freelancer__freelancer-a'].workModes = { home: true, chair: false };
  state.availability['freelancer-a'].availableSlots = [];
  const page = await getPublicFreelancerPageBySlug('amine-fade', lookupFirestore(state), lookupNow);
  assert.deepStrictEqual(page.slots, []);
  assert.equal(Object.hasOwn(page, 'workplace'), false);
});

test.each([
  {
    name: 'winter past and current local times', now: '2026-11-03T09:30:00Z',
    slots: ['2026-11-03T10:00', '2026-11-03T10:30', '2026-11-03T10:31'],
    expected: ['2026-11-03T10:31'],
  },
  {
    name: 'summer past and current local times', now: '2026-07-03T08:30:00Z',
    slots: ['2026-07-03T10:00', '2026-07-03T10:30', '2026-07-03T10:31'],
    expected: ['2026-07-03T10:31'],
  },
  {
    name: 'spring DST gap', now: '2026-03-29T00:00:00Z',
    slots: ['2026-03-29T01:30', '2026-03-29T02:00', '2026-03-29T02:30', '2026-03-29T03:00'],
    expected: ['2026-03-29T01:30', '2026-03-29T03:00'],
  },
  {
    name: 'autumn DST overlap', now: '2026-10-24T23:00:00Z',
    slots: ['2026-10-25T01:30', '2026-10-25T02:00', '2026-10-25T02:30', '2026-10-25T03:00'],
    expected: ['2026-10-25T01:30', '2026-10-25T03:00'],
  },
  {
    name: 'first unique time after spring transition', now: '2026-03-29T01:00:00Z',
    slots: ['2026-03-29T03:00', '2026-03-29T03:01'], expected: ['2026-03-29T03:01'],
  },
  {
    name: 'first unique time after autumn transition', now: '2026-10-25T02:00:00Z',
    slots: ['2026-10-25T03:00', '2026-10-25T03:01'], expected: ['2026-10-25T03:01'],
  },
])('filters public slots with Europe/Paris booking semantics %#', async ({ name, now, slots, expected }) => {
  const state = directPageStore();
  state.availability['freelancer-a'] = {
    ownerId: 'freelancer-a', ownerType: 'freelancer', availableSlots: slots, reservedSlots: [],
    modeBySlot: Object.fromEntries(slots.map(slot => [slot, 'chair'])),
  };
  const page = await getPublicFreelancerPageBySlug('amine-fade', lookupFirestore(state), Date.parse(now));
  assert.deepStrictEqual(page.slots, expected.map(value => ({ value, appointmentMode: 'chair' })), name);
});

test.each([null, {}, { slug: 'amine-fade', clientEmail: 'private' }, { slug: 12 }, { slug: '!' }])(
  'the callable rejects malformed or expanded lookup input %#', async input => {
    await assert.rejects(() => getPublicFreelancerPageBySlugFunction(input), error => error.code === 'invalid-argument');
  },
);
