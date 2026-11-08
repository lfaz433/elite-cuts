// @ts-nocheck -- Real source, with Firebase storage/registration replaced at the boundary.
const { existsSync, readFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const test = globalThis.test ?? require('node:test').test;
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
let defaultFirestore;
function functionBuilder(options = {}) {
  return {
    https: { onCall: handler => Object.assign(handler, { region: options.region, options }) },
    runWith: next => functionBuilder({ ...options, ...next }),
  };
}
const sdk = {
  'firebase-functions': { https: { HttpsError }, region: region => functionBuilder({ region }) },
  'firebase-admin': { firestore: Object.assign(() => defaultFirestore, {
    FieldValue: { serverTimestamp: () => 'server-timestamp' },
  }) },
};
function loadSource(filename = resolve(__dirname, 'reviews.ts')) {
  if (!existsSync(filename)) return {};
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  new Function('require', 'module', 'exports', code)(request => request.startsWith('.')
    ? loadSource(resolve(dirname(filename), `${request}.ts`)) : sdk[request] ?? require(request), loaded, loaded.exports);
  return loaded.exports;
}
const api = loadSource();
function store(extra = {}) {
  const data = {
    'bookingRequests/booking-a': { ownerId: 'freelancer-a', ownerType: 'freelancer', clientId: 'client-a',
      status: 'completed', clientName: 'Ada Clarkson', clientEmail: 'ada@private.test',
      clientPhone: '+33612345678', address: { line1: '12 rue privée' } },
    'freelancerProfiles/freelancer-a': { uid: 'freelancer-a' }, ...extra,
  };
  const reads = [];
  let queue = Promise.resolve();
  function ref(path) { return { path, get: async () => snapshot(path) }; }
  function snapshot(path) { return { id: path.split('/').at(-1), exists: !!data[path], data: () => data[path] }; }
  const firestore = {
    collection(name) { return {
      doc: id => ref(`${name}/${id}`),
      where: (field, op, value) => ({ get: async () => {
        assert.equal(op, '=='); reads.push([name, field, value]);
        return { docs: Object.keys(data).filter(path => path.startsWith(`${name}/`) && data[path][field] === value).map(snapshot) };
      } }),
    }; },
    runTransaction(fn) {
      const result = queue.then(async () => {
        const writes = []; let writing = false;
        const result = await fn({
          async get(reference) { assert.equal(writing, false, 'all reads must precede writes'); reads.push(reference.path); return snapshot(reference.path); },
          create(reference, value) { writing = true; assert.equal(data[reference.path], undefined); writes.push([reference.path, value]); },
        });
        writes.forEach(([path, value]) => { data[path] = value; });
        return result;
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  return { firestore, data, reads };
}

test('creates one minimized immutable review for the client of a completed freelancer booking', async () => {
  assert.equal(typeof api.submitFreelancerReview, 'function');
  const state = store();
  assert.deepStrictEqual(await api.submitFreelancerReview('client-a', {
    bookingId: 'booking-a', rating: 5, text: '  Très bon dégradé  ',
  }, state.firestore), { reviewId: 'booking-a', status: 'approved' });
  assert.deepStrictEqual(state.data['freelancerReviews/booking-a'], {
    freelancerId: 'freelancer-a', bookingId: 'booking-a', rating: 5, text: 'Très bon dégradé',
    authorName: 'Ada C.', createdAt: 'server-timestamp', status: 'approved',
  });
  await assert.rejects(() => api.submitFreelancerReview('client-a', { bookingId: 'booking-a', rating: 1 }, state.firestore),
    error => error.code === 'already-exists');
  assert.equal(state.data['freelancerReviews/booking-a'].rating, 5);
  assert.ok(state.reads.every(read => typeof read === 'string' && /^(bookingRequests|freelancerReviews)\//.test(read)));
});

for (const [name, patch, caller, code] of [
  ['pending', { status: 'pending_approval' }, 'client-a', 'failed-precondition'],
  ['confirmed', { status: 'confirmed' }, 'client-a', 'failed-precondition'],
  ['cancelled', { status: 'cancelled' }, 'client-a', 'failed-precondition'],
  ['cross-client', {}, 'client-b', 'permission-denied'],
  ['freelancer owner', {}, 'freelancer-a', 'permission-denied'],
  ['salon', { ownerType: 'salon' }, 'client-a', 'failed-precondition'],
  ['legacy owner type', { ownerType: undefined }, 'client-a', 'failed-precondition'],
  ['malformed owner ID', { ownerId: '../private' }, 'client-a', 'failed-precondition'],
]) test(`rejects ${name} without writes`, async () => {
  assert.equal(typeof api.submitFreelancerReview, 'function');
  const state = store(); Object.assign(state.data['bookingRequests/booking-a'], patch);
  await assert.rejects(() => api.submitFreelancerReview(caller, { bookingId: 'booking-a', rating: 5 }, state.firestore), error => error.code === code);
  assert.equal(state.data['freelancerReviews/booking-a'], undefined);
});

test('rejects unauthenticated and missing bookings', async () => {
  assert.equal(typeof api.submitFreelancerReview, 'function');
  const state = store();
  await assert.rejects(() => api.submitFreelancerReview('', { bookingId: 'booking-a', rating: 5 }, state.firestore), e => e.code === 'unauthenticated');
  await assert.rejects(() => api.submitFreelancerReview('client-a', { bookingId: 'missing', rating: 5 }, state.firestore), e => e.code === 'not-found');
});

for (const patch of [
  { rating: 0 }, { rating: 6 }, { rating: 1.5 }, { rating: '5' }, { rating: NaN },
  { text: 'x'.repeat(501) }, { text: null }, { bookingId: '../booking-a' }, { bookingId: '' },
  { authorName: 'Full Fake Name' }, { status: 'approved' }, { clientId: 'client-a' },
]) test(`rejects invalid or server-owned input ${JSON.stringify(patch)}`, async () => {
  assert.equal(typeof api.submitFreelancerReview, 'function');
  const state = store();
  await assert.rejects(() => api.submitFreelancerReview('client-a', { bookingId: 'booking-a', rating: 5, ...patch }, state.firestore), e => e.code === 'invalid-argument');
  assert.equal(state.reads.length, 0);
});

for (const [name, expected] of [['Ada', 'Ada'], ['Élodie de La Tour', 'Élodie T.'], ['ada@private.test', 'Client'], ['+33612345678', 'Client']]) {
  test(`minimizes the stored booking name ${name}`, async () => {
    assert.equal(typeof api.submitFreelancerReview, 'function');
    const state = store(); state.data['bookingRequests/booking-a'].clientName = name;
    await api.submitFreelancerReview('client-a', { bookingId: 'booking-a', rating: 1 }, state.firestore);
    assert.equal(state.data['freelancerReviews/booking-a'].authorName, expected);
    assert.equal(Object.hasOwn(state.data['freelancerReviews/booking-a'], 'text'), false);
  });
}

test('concurrent submissions produce exactly one review', async () => {
  assert.equal(typeof api.submitFreelancerReview, 'function');
  const state = store();
  const results = await Promise.allSettled([1, 5].map(rating => api.submitFreelancerReview('client-a', { bookingId: 'booking-a', rating }, state.firestore)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'already-exists');
  assert.equal(Object.keys(state.data).filter(path => path.startsWith('freelancerReviews/')).length, 1);
});

function review(rating, createdAtMs, patch = {}) {
  return { freelancerId: 'freelancer-a', bookingId: `booking-${createdAtMs}`, rating, authorName: 'Ada C.',
    createdAt: { toMillis: () => createdAtMs }, status: 'approved', ...patch };
}

test('the public summary averages all approved ratings but exposes only five newest safe reviews', () => {
  assert.equal(typeof api.buildApprovedReviewSummary, 'function');
  const records = [review(1, 1), review(2, 2), review(3, 3), review(4, 4), review(5, 5), review(3, 6),
    review(1, 7, { status: 'hidden' }), review(5, 8, { freelancerId: 'other' }),
    review(10, 9), review(5, 10, { text: 'x'.repeat(501) })];
  Object.assign(records[5], { clientEmail: 'private', clientPhone: 'private', clientAddress: 'private', text: 'Super' });
  assert.deepStrictEqual(api.buildApprovedReviewSummary('freelancer-a', records, 20), {
    average: 3, count: 6, reviews: [
      { rating: 3, authorName: 'Ada C.', createdAtMs: 6, text: 'Super' },
      { rating: 5, authorName: 'Ada C.', createdAtMs: 5 },
      { rating: 4, authorName: 'Ada C.', createdAtMs: 4 },
      { rating: 3, authorName: 'Ada C.', createdAtMs: 3 },
      { rating: 2, authorName: 'Ada C.', createdAtMs: 2 },
    ],
  });
  assert.deepStrictEqual(api.buildApprovedReviewSummary('freelancer-a', [review(5, 1, { status: 'hidden' })], 20),
    { average: null, count: 0, reviews: [] });
});

test('Firestore timestamps with microsecond precision retain their review at integer milliseconds', () => {
  assert.equal(typeof api.buildApprovedReviewSummary, 'function');
  assert.deepStrictEqual(api.buildApprovedReviewSummary('freelancer-a', [review(5, 10.125, { bookingId: 'booking-a' })], 20), {
    average: 5, count: 1, reviews: [{ rating: 5, authorName: 'Ada C.', createdAtMs: 10 }],
  });
});

test('newest reviews retain timestamp precision when two records share one public millisecond', () => {
  const summary = api.buildApprovedReviewSummary('freelancer-a', [
    review(5, 10.1, { bookingId: 'booking-a' }), review(1, 10.9, { bookingId: 'booking-b' }),
  ], 20);
  assert.deepStrictEqual(summary, { average: 3, count: 2, reviews: [
    { rating: 1, authorName: 'Ada C.', createdAtMs: 10 },
    { rating: 5, authorName: 'Ada C.', createdAtMs: 10 },
  ] });
});

test('the owner inbox includes hidden reviews but never copies contact/address fields', async () => {
  assert.equal(typeof api.listMyFreelancerReviews, 'function');
  const state = store({
    'freelancerReviews/booking-1': review(4, 1, { clientEmail: 'private', clientAddress: 'private', authorName: 'Ada Clarkson' }),
    'freelancerReviews/booking-2': review(2, 2, { status: 'hidden', clientPhone: 'private' }),
    'freelancerReviews/booking-3': review(5, 3, { freelancerId: 'other' }),
  });
  assert.deepStrictEqual(await api.listMyFreelancerReviews('freelancer-a', state.firestore), [
    { reviewId: 'booking-2', bookingId: 'booking-2', rating: 2, authorName: 'Ada C.', createdAtMs: 2, status: 'hidden' },
    { reviewId: 'booking-1', bookingId: 'booking-1', rating: 4, authorName: 'Ada C.', createdAtMs: 1, status: 'approved' },
  ]);
  assert.deepStrictEqual(state.reads, [['freelancerReviews', 'freelancerId', 'freelancer-a']]);
  await assert.rejects(() => api.listMyFreelancerReviews('client-a', state.firestore), e => e.code === 'permission-denied');
  await assert.rejects(() => api.listMyFreelancerReviews('', state.firestore), e => e.code === 'unauthenticated');
});

test('Europe callables derive caller identity from auth and the inbox rejects owner selectors', async () => {
  assert.equal(typeof api.submitFreelancerReviewFunction, 'function');
  assert.equal(typeof api.listMyFreelancerReviewsFunction, 'function');
  assert.equal(api.submitFreelancerReviewFunction.region, 'europe-west1');
  assert.equal(api.listMyFreelancerReviewsFunction.region, 'europe-west1');
  defaultFirestore = store().firestore;
  await assert.rejects(() => api.submitFreelancerReviewFunction({ bookingId: 'booking-a', rating: 5 }, {}), e => e.code === 'unauthenticated');
  assert.deepStrictEqual(await api.submitFreelancerReviewFunction({ bookingId: 'booking-a', rating: 5 }, {
    auth: { uid: 'client-a' }, app: { appId: 'app', alreadyConsumed: false },
  }), { reviewId: 'booking-a', status: 'approved' });
  await assert.rejects(() => api.listMyFreelancerReviewsFunction({ freelancerId: 'other' }, { auth: { uid: 'freelancer-a' } }), e => e.code === 'invalid-argument');
  defaultFirestore = store().firestore;
  assert.deepStrictEqual(await api.listMyFreelancerReviewsFunction({}, { auth: { uid: 'freelancer-a' } }), []);
});

test('guest review submission registers App Check enforcement and replay protection in Europe', () => {
  assert.deepStrictEqual(api.submitFreelancerReviewFunction.options, {
    region: 'europe-west1', enforceAppCheck: true, consumeAppCheckToken: true, maxInstances: 2,
  });
});

for (const [name, verification] of [
  ['missing', {}],
  ['invalid', { rawRequest: { headers: { 'x-firebase-appcheck': 'invalid-token' } } }],
  ['consumed', { app: { appId: 'app', alreadyConsumed: true } }],
]) test(`guest review rejects ${name} App Check without creating a review or changing the booking`, async () => {
  const state = store(); defaultFirestore = state.firestore; const before = structuredClone(state.data);
  await assert.rejects(async () => api.submitFreelancerReviewFunction({ bookingId: 'booking-a', rating: 5 }, {
    auth: { uid: 'client-a', token: { firebase: { sign_in_provider: 'anonymous' } } }, ...verification,
  }), { code: 'failed-precondition' });
  assert.deepStrictEqual(state.data, before);
  assert.deepStrictEqual(state.reads, []);
});

test('verified guest review retains ownership and completion checks and creates one immutable review', async () => {
  const state = store(); defaultFirestore = state.firestore;
  const app = { appId: 'app', alreadyConsumed: false };
  const input = { bookingId: 'booking-a', rating: 5 };
  const before = structuredClone(state.data);
  await assert.rejects(async () => api.submitFreelancerReviewFunction(input, { app }), { code: 'unauthenticated' });
  for (const uid of ['other-client', 'freelancer-a']) {
    await assert.rejects(async () => api.submitFreelancerReviewFunction(input, { app, auth: { uid } }), { code: 'permission-denied' });
    assert.deepStrictEqual(state.data, before);
  }
  const context = { app, auth: { uid: 'client-a', token: { firebase: { sign_in_provider: 'anonymous' } } } };
  state.data['bookingRequests/booking-a'].status = 'confirmed';
  await assert.rejects(async () => api.submitFreelancerReviewFunction(input, context), { code: 'failed-precondition' });
  assert.equal(state.data['freelancerReviews/booking-a'], undefined);
  state.data['bookingRequests/booking-a'].status = 'completed';
  assert.deepStrictEqual(await api.submitFreelancerReviewFunction(input, context), { reviewId: 'booking-a', status: 'approved' });
  assert.deepStrictEqual(state.data['freelancerReviews/booking-a'], {
    freelancerId: 'freelancer-a', bookingId: 'booking-a', rating: 5,
    authorName: 'Ada C.', createdAt: 'server-timestamp', status: 'approved',
  });
  const reviewed = structuredClone(state.data);
  await assert.rejects(async () => api.submitFreelancerReviewFunction(input, context), { code: 'already-exists' });
  assert.deepStrictEqual(state.data, reviewed);
});
