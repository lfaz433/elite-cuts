// @ts-nocheck
const { readFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const runTest = globalThis.test ?? require('node:test').test;
const test = Object.assign((name, fn) => runTest(name, fn), {
  each: values => (name, fn) => values.forEach((value, index) => runTest(`${name} [${index}]`, () => fn(value))),
});

// The SDK boundary only builds deployed handlers and produces timestamps here.
// Keeping it local prevents this unit suite from initializing cloud clients.
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const builder = { https: { onCall: handler => handler }, firestore: { document: () => ({ onWrite: handler => handler }) } };
const sdk = {
  'firebase-functions': { ...builder, https: { ...builder.https, HttpsError }, region: () => builder },
  'firebase-admin': { firestore: { FieldValue: { serverTimestamp: () => 'server-timestamp' } } },
};

function loadSource(filename = resolve(__dirname, 'freelancers.ts'), cache = new Map()) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  new Function('require', 'module', 'exports', output)(request => request.startsWith('.')
    ? loadSource(resolve(dirname(filename), `${request}.ts`), cache)
    : sdk[request] ?? require(request), loaded, loaded.exports);
  return loaded.exports;
}

const { parseFreelancerProfileInput, saveFreelancerProfile } = loadSource();
const homeSlot = '2099-09-05T10:00';
const chairSlot = '2099-09-05T11:00';
const workplace = { name: 'Studio République', line1: '10 rue du Temple', postalCode: '75003', city: 'Paris' };
const mixedModeInput = {
  displayName: 'Amine Fade', bio: 'Coupe et barbe.', cityId: 'fr-paris', languages: ['fr'],
  serviceSummary: 'Coupe', serviceIds: ['coupe-degrade'], servicePricesMinor: { 'coupe-degrade': 2500 },
  serviceDurationMinutes: { 'coupe-degrade': 45 }, workModes: { home: true, chair: true },
  availabilityByMode: { home: [homeSlot], chair: [chairSlot] }, workplace,
  visible: true, radiusKm: 10, travelFeeMinor: 500, deposit: { mode: 'none', value: 0 },
  cancellationWindowHours: 24, availability: [homeSlot],
  identity: { publicSlug: 'amine-fade', socialLinks: {} },
};

// Only Firestore I/O is replaced. Transactions stage writes, forbid reads after
// writes, roll back failures, and serialize competitors like committed retries.
function firestoreState(initial = {}) {
  const state = structuredClone(initial);
  let nextId = 0;
  let queue = Promise.resolve();
  const snapshot = (data, id) => ({ id, exists: data !== undefined, data: () => data });
  return {
    state,
    firestore: {
      collection(collectionName) {
        return {
          doc(id = `auto-${++nextId}`) { return { collectionName, id }; },
          where(field, operator, value) { return { collectionName, filter: [field, operator, value] }; },
        };
      },
      runTransaction(callback) {
        const run = queue.then(async () => {
          const staged = [];
          const result = await callback({
            async get(ref) {
              if (staged.length) throw new Error('Transaction reads must precede writes');
              if (ref.filter) {
                const [field, operator, expected] = ref.filter;
                if (operator !== '==') throw new Error('Unsupported test query');
                return { docs: Object.entries(state[ref.collectionName] ?? {})
                  .filter(([, data]) => data[field] === expected)
                  .map(([id, data]) => snapshot(data, id)) };
              }
              return snapshot(state[ref.collectionName]?.[ref.id], ref.id);
            },
            set(ref, data) { staged.push(['set', ref, data]); },
            create(ref, data) {
              if (state[ref.collectionName]?.[ref.id]) throw new Error('already exists');
              staged.push(['set', ref, data]);
            },
            delete(ref) { staged.push(['delete', ref]); },
          });
          for (const [operation, ref, data] of staged) {
            state[ref.collectionName] ??= {};
            if (operation === 'delete') delete state[ref.collectionName][ref.id];
            else state[ref.collectionName][ref.id] = data;
          }
          return result;
        });
        queue = run.catch(() => {});
        return run;
      },
    },
  };
}

test('saves disjoint home and chair slots with mode ownership and the home legacy list', async () => {
  const { state, firestore } = firestoreState();
  await saveFreelancerProfile('freelancer-a', { ...mixedModeInput, availability: [chairSlot] }, firestore);
  assert.partialDeepStrictEqual(state.availability['freelancer-a'], {
    ownerId: 'freelancer-a', ownerType: 'freelancer', configuredSlots: [homeSlot, chairSlot],
    availableSlots: [homeSlot, chairSlot], reservedSlots: [],
    modeBySlot: { [homeSlot]: 'home', [chairSlot]: 'chair' },
  });
  assert.deepStrictEqual(state.availability['freelancer-a'].configuredSlots, [homeSlot, chairSlot]);
  assert.deepStrictEqual(state.availability['freelancer-a'].availableSlots, [homeSlot, chairSlot]);
  assert.deepStrictEqual(state.availability['freelancer-a'].reservedSlots, []);
  assert.partialDeepStrictEqual(state.freelancerProfiles['freelancer-a'], {
    availability: [homeSlot], availabilityByMode: { home: [homeSlot], chair: [chairSlot] },
    serviceDurationMinutes: { 'coupe-degrade': 45 }, workModes: { home: true, chair: true }, workplace,
    publicProfile: { approvalStatus: 'pending', visible: true },
  });
});

test('rejects a slot that appears in both modes', () => {
  assert.throws(() => parseFreelancerProfileInput({ ...mixedModeInput,
    availabilityByMode: { home: [homeSlot], chair: [homeSlot] },
  }), /availabilityByMode contains duplicate slots/);
});
test('saving services preserves booked duration intervals and does not reopen overlapping starts', async () => {
  const intervals = [{ slot: chairSlot, startMs: Date.parse('2099-09-05T09:00Z'), endMs: Date.parse('2099-09-05T09:45Z') }];
  const { state, firestore } = firestoreState({ availability: { 'freelancer-a': {
    availableSlots: [homeSlot], reservedSlots: [chairSlot], reservedIntervals: intervals, modeBySlot: { [chairSlot]: 'chair' },
  } } });
  await saveFreelancerProfile('freelancer-a', { ...mixedModeInput, serviceDurationMinutes: { 'coupe-degrade': 15 },
    availabilityByMode: { home: [homeSlot, '2099-09-05T11:30'], chair: [chairSlot, '2099-09-05T11:45'] } }, firestore);
  assert.deepEqual(state.availability['freelancer-a'].availableSlots, [homeSlot, '2099-09-05T11:45']);
  assert.deepEqual(state.availability['freelancer-a'].reservedIntervals, intervals);
});
test('saving an older reservation without interval metadata recovers its booked duration', async () => {
  const { state, firestore } = firestoreState({
    availability: { 'freelancer-a': { availableSlots: [homeSlot], reservedSlots: [chairSlot] } },
    bookingRequests: { older: { ownerId: 'freelancer-a', ownerType: 'freelancer', date: '2099-09-05', time: '11:00', status: 'confirmed', durationMinutes: 45 } },
  });
  await saveFreelancerProfile('freelancer-a', { ...mixedModeInput,
    availabilityByMode: { home: [homeSlot, '2099-09-05T11:30'], chair: [chairSlot] } }, firestore);
  assert.deepEqual(state.availability['freelancer-a'].availableSlots, [homeSlot]);
});

test.each([
  { home: [homeSlot, homeSlot], chair: [chairSlot] },
  { home: ['2099-02-30T10:00'], chair: [chairSlot] },
  { home: ['2099-13-05T10:00'], chair: [chairSlot] },
  { home: ['2099-09-05T24:00'], chair: [chairSlot] },
  { home: [42], chair: [chairSlot] },
])('rejects duplicate or invalid calendar slots %#', availabilityByMode => {
  assert.throws(() => parseFreelancerProfileInput({ ...mixedModeInput, availabilityByMode }), /availability/);
});

test.each([{}, { other: 30 }, { 'coupe-degrade': 30, extra: 30 },
  { 'coupe-degrade': 14 }, { 'coupe-degrade': 361 }, { 'coupe-degrade': 30.5 }, null])(
  'requires exactly one duration from 15 through 360 minutes per service %#', serviceDurationMinutes => {
    assert.throws(() => parseFreelancerProfileInput({ ...mixedModeInput, serviceDurationMinutes }), /serviceDurationMinutes/);
  },
);

test.each([15, 360])('accepts the inclusive duration boundary %s', minutes => {
  assert.deepStrictEqual(parseFreelancerProfileInput({ ...mixedModeInput,
    serviceDurationMinutes: { 'coupe-degrade': minutes },
  }).serviceDurationMinutes, { 'coupe-degrade': minutes });
});

test.each([null, { home: false, chair: false }, { home: 'yes', chair: true }])(
  'requires boolean work modes with at least one active mode %#', workModes => {
    assert.throws(() => parseFreelancerProfileInput({ ...mixedModeInput, workModes }), /workModes/);
  },
);

test.each([undefined, null, {}, { ...workplace, name: '' }, { ...workplace, line1: '' },
  { ...workplace, postalCode: '' }, { ...workplace, city: '' }])(
  'requires a complete workplace for chair mode %#', place => {
    assert.throws(() => parseFreelancerProfileInput({ ...mixedModeInput, workplace: place }), /workplace/);
  },
);

test('allows a hidden empty draft but not an empty visible slug, services or enabled-mode slots', async () => {
  const draft = { ...mixedModeInput, visible: false, serviceSummary: '', serviceIds: [],
    servicePricesMinor: {}, serviceDurationMinutes: {}, availability: [],
    availabilityByMode: { home: [], chair: [] }, identity: { publicSlug: '', socialLinks: {} },
  };
  const { state, firestore } = firestoreState();
  await saveFreelancerProfile('freelancer-a', draft, firestore);
  assert.equal(state.freelancerProfiles['freelancer-a'].identity.publicSlug, '');
  assert.deepStrictEqual(state.publicProfileSlugs ?? {}, {});
  assert.throws(() => parseFreelancerProfileInput({ ...mixedModeInput, identity: draft.identity }), /publicSlug/);
  assert.throws(() => parseFreelancerProfileInput({ ...mixedModeInput,
    serviceIds: [], servicePricesMinor: {}, serviceDurationMinutes: {},
  }), /service/);
  for (const availabilityByMode of [{ home: [], chair: [chairSlot] }, { home: [homeSlot], chair: [] }]) {
    assert.throws(() => parseFreelancerProfileInput({ ...mixedModeInput, availabilityByMode }), /availability/);
  }
});

test('never makes slots of a disabled mode bookable', async () => {
  const { state, firestore } = firestoreState();
  await saveFreelancerProfile('freelancer-a', { ...mixedModeInput, workModes: { home: false, chair: true } }, firestore);
  assert.deepStrictEqual(state.availability['freelancer-a'].configuredSlots, [chairSlot]);
  assert.deepStrictEqual(state.availability['freelancer-a'].availableSlots, [chairSlot]);
  assert.deepStrictEqual(state.availability['freelancer-a'].modeBySlot, { [chairSlot]: 'chair' });
});

test('reserves a normalized slug even while hidden and permits repeat saves by its owner', async () => {
  const { state, firestore } = firestoreState();
  const input = { ...mixedModeInput, visible: false, identity: { publicSlug: '  Amine Fade  ', socialLinks: {} } };
  await saveFreelancerProfile('freelancer-a', input, firestore);
  await saveFreelancerProfile('freelancer-a', input, firestore);
  assert.partialDeepStrictEqual(state.publicProfileSlugs['amine-fade'], {
    profileId: 'freelancer__freelancer-a', freelancerId: 'freelancer-a',
  });
  assert.ok(state.publicProfileSlugs['amine-fade'].updatedAt);
});

test.each(['ab', 'a'.repeat(65), '!!!'])('rejects invalid nonempty slug %s', publicSlug => {
  assert.throws(() => parseFreelancerProfileInput({ ...mixedModeInput, visible: false,
    identity: { publicSlug, socialLinks: {} },
  }), /publicSlug/);
});

test('rejects a slug owned by another profile without changing any saved state', async () => {
  const { state, firestore } = firestoreState();
  await saveFreelancerProfile('freelancer-a', mixedModeInput, firestore);
  const before = { ...state.freelancerProfiles };
  await assert.rejects(saveFreelancerProfile('freelancer-b', mixedModeInput, firestore),
    { code: 'already-exists', message: 'publicSlug is already used' });
  assert.deepStrictEqual(state.freelancerProfiles, before);
  assert.equal(Object.keys(state.auditEvents).length, 1);
});

test('serializes competing slug reservations to a single owner', async () => {
  const { state, firestore } = firestoreState();
  const outcomes = await Promise.allSettled(['freelancer-a', 'freelancer-b'].map(uid =>
    saveFreelancerProfile(uid, mixedModeInput, firestore)));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(result => result.status === 'rejected')[0].reason.code, 'already-exists');
  assert.deepStrictEqual(Object.keys(state.freelancerProfiles), ['freelancer-a']);
});

test.each([true, false])('deletes the old slug only when it points to this profile (owned=%s)', owned => {
  const { state, firestore } = firestoreState({
    freelancerProfiles: { 'freelancer-a': { identity: { publicSlug: 'old-slug' } } },
    publicProfileSlugs: { 'old-slug': { profileId: owned ? 'freelancer__freelancer-a' : 'freelancer__other' } },
  });
  return saveFreelancerProfile('freelancer-a', mixedModeInput, firestore).then(() => {
    assert.equal(Boolean(state.publicProfileSlugs['old-slug']), !owned);
    assert.equal(state.publicProfileSlugs['amine-fade'].profileId, 'freelancer__freelancer-a');
  });
});

test('a conflicting rename retains the old slug, profile, availability and audit', async () => {
  const { state, firestore } = firestoreState();
  await saveFreelancerProfile('freelancer-a', mixedModeInput, firestore);
  state.publicProfileSlugs.taken = { profileId: 'freelancer__other' };
  const oldProfile = state.freelancerProfiles['freelancer-a'];
  const oldAvailability = state.availability['freelancer-a'];
  await assert.rejects(saveFreelancerProfile('freelancer-a', { ...mixedModeInput,
    identity: { publicSlug: 'taken', socialLinks: {} },
  }, firestore), { code: 'already-exists' });
  assert.equal(state.freelancerProfiles['freelancer-a'], oldProfile);
  assert.equal(state.availability['freelancer-a'], oldAvailability);
  assert.equal(state.publicProfileSlugs['amine-fade'].freelancerId, 'freelancer-a');
  assert.equal(Object.keys(state.auditEvents).length, 1);
});

test.each(['remove', 'reclassify'])('preserves a reserved appointment mode when an edit tries to %s it', async edit => {
  const { state, firestore } = firestoreState({
    freelancerProfiles: { 'freelancer-a': { ...mixedModeInput, publicProfile: { approvalStatus: 'approved' } } },
    availability: { 'freelancer-a': { configuredSlots: [homeSlot, chairSlot],
      availableSlots: [homeSlot], reservedSlots: [chairSlot], modeBySlot: { [homeSlot]: 'home', [chairSlot]: 'chair' } } },
  });
  const input = { ...mixedModeInput, visible: false, availabilityByMode: {
    home: edit === 'reclassify' ? [chairSlot] : [], chair: [],
  } };
  await saveFreelancerProfile('freelancer-a', input, firestore);
  assert.deepStrictEqual(state.availability['freelancer-a'].availableSlots, []);
  assert.deepStrictEqual(state.availability['freelancer-a'].reservedSlots, [chairSlot]);
  assert.deepStrictEqual(state.availability['freelancer-a'].modeBySlot, { [chairSlot]: 'chair' });
  assert.deepStrictEqual(state.availability['freelancer-a'].configuredSlots, edit === 'reclassify' ? [chairSlot] : []);
  assert.equal(state.availability['freelancer-a'].modeBySlot[homeSlot], undefined);
  assert.equal(state.freelancerProfiles['freelancer-a'].publicProfile.approvalStatus, 'approved');
  state.availability['freelancer-a'].reservedSlots = [];
  await saveFreelancerProfile('freelancer-a', input, firestore);
  assert.equal(state.availability['freelancer-a'].modeBySlot[chairSlot], edit === 'reclassify' ? 'home' : undefined);
});

test('preserves consumed legacy home slots without mistaking modern released slots for reservations', async () => {
  const { state, firestore } = firestoreState({
    freelancerProfiles: { 'freelancer-a': { availability: [homeSlot] } },
    availability: { 'freelancer-a': { availableSlots: [] } },
  });
  await saveFreelancerProfile('freelancer-a', mixedModeInput, firestore);
  assert.partialDeepStrictEqual(state.availability['freelancer-a'], {
    availableSlots: [chairSlot], reservedSlots: [homeSlot], modeBySlot: { [homeSlot]: 'home' },
  });
  assert.deepStrictEqual(state.availability['freelancer-a'].availableSlots, [chairSlot]);
  assert.deepStrictEqual(state.availability['freelancer-a'].reservedSlots, [homeSlot]);
  state.availability['freelancer-a'].reservedSlots = [];
  await saveFreelancerProfile('freelancer-a', mixedModeInput, firestore);
  assert.deepStrictEqual(state.availability['freelancer-a'].reservedSlots, []);
});
