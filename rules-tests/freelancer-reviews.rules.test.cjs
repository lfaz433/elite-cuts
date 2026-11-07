const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const nodeTest = require('node:test');
const test = globalThis.test ?? nodeTest.test;
const before = globalThis.beforeAll ?? nodeTest.before;
const assert = require('node:assert/strict');
// Native REST avoids loading the stalled baseline Firebase test SDK. These
// requests still exercise the real local Firestore rules engine.
const project = 'demo-freelancer-reviews';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8188';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Local emulator required');
const base = `http://${host}`;
const documents = `/v1/projects/${project}/databases/(default)/documents`;
function token(uid) {
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: uid, user_id: uid, aud: project,
    iss: `https://securetoken.google.com/${project}`, iat: now, exp: now + 3600,
    firebase: { sign_in_provider: 'custom', identities: {} } })}.`;
}
async function request(method, path, uid, body) {
  return fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${uid === 'owner' ? 'owner' : token(uid)}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20_000),
  });
}
async function succeeds(response) { assert.equal(response.status, 200, await response.text()); }
async function denied(response) { assert.equal(response.status, 403, await response.text()); }
before(async () => {
  await succeeds(await request('PUT', `/emulator/v1/projects/${project}:securityRules`, null, {
    rules: { files: [{ content: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8') }] },
  }));
  await succeeds(await request('PATCH', `${documents}/freelancerReviews/booking-a`, 'owner', { fields: {
    freelancerId: { stringValue: 'freelancer-a' }, bookingId: { stringValue: 'booking-a' },
    rating: { integerValue: '5' }, authorName: { stringValue: 'Ada C.' },
    createdAt: { timestampValue: new Date().toISOString() }, status: { stringValue: 'approved' },
  } }));
});

test('only the freelancer owner can read and query their review inbox', async () => {
  await succeeds(await request('GET', `${documents}/freelancerReviews/booking-a`, 'freelancer-a'));
  const structuredQuery = { from: [{ collectionId: 'freelancerReviews' }], where: {
    fieldFilter: { field: { fieldPath: 'freelancerId' }, op: 'EQUAL', value: { stringValue: 'freelancer-a' } },
  } };
  await succeeds(await request('POST', `${documents}:runQuery`, 'freelancer-a', { structuredQuery }));
  await denied(await request('GET', `${documents}/freelancerReviews`, 'freelancer-a'));
  for (const uid of [null, 'client-a', 'freelancer-b']) {
    await denied(await request('GET', `${documents}/freelancerReviews/booking-a`, uid));
  }
});

test('no browser identity can create, change moderation, edit or delete reviews', async () => {
  for (const uid of [null, 'client-a', 'freelancer-a', 'freelancer-b']) {
    await denied(await request('PATCH', `${documents}/freelancerReviews/new-review`, uid, { fields: {
      freelancerId: { stringValue: uid || 'anonymous' }, rating: { integerValue: '5' }, status: { stringValue: 'approved' },
    } }));
    await denied(await request('PATCH', `${documents}/freelancerReviews/booking-a`, uid, { fields: {
      status: { stringValue: 'hidden' }, rating: { integerValue: '1' },
    } }));
    await denied(await request('DELETE', `${documents}/freelancerReviews/booking-a`, uid));
  }
});
