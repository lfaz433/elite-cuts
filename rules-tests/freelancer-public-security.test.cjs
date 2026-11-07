const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const nodeTest = require('node:test');
const test = globalThis.test ?? nodeTest.test;
const before = callback => globalThis.beforeAll
  ? globalThis.beforeAll(callback, 30_000)
  : nodeTest.before(callback, { timeout: 30_000 });

// Exercise the real Firestore rules engine over REST, including query rules.
// Unsigned tokens and the owner fixture token work only in the local emulator.
const project = 'demo-freelancer-public-security';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8188';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Local emulator required');
const base = `http://${host}`;
const documents = `/v1/projects/${project}/databases/(default)/documents`;
const actors = [
  null,
  { uid: 'guest-a', provider: 'anonymous' },
  { uid: 'client-a' },
  { uid: 'freelancer-a' },
  { uid: 'freelancer-b' },
  { uid: 'platform-admin', superadmin: true, platformAdmin: true },
];
const freelancer = actors[3];
const string = stringValue => ({ stringValue });
const fixtures = {
  freelancerReviews: { freelancerId: string('freelancer-a'), bookingId: string('record-a'), rating: { integerValue: '5' }, authorName: string('Samira S.'), status: string('approved') },
  publicProfiles: { ownerId: string('freelancer-a'), ownerType: string('freelancer'), publicSlug: string('amine-fade'), isPublic: { booleanValue: true } },
  publicProfileSlugs: { ownerId: string('freelancer-a'), profileId: string('freelancer__freelancer-a') },
  bookingRequests: { ownerId: string('freelancer-a'), ownerType: string('freelancer'), clientId: string('client-a'), status: string('pending'), mode: string('home') },
  bookingRequestPrivate: { ownerId: string('freelancer-a'), clientId: string('client-a'), homeAddress: string('PRIVATE TEST ADDRESS') },
};

function token(actor) {
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: actor.uid, user_id: actor.uid, aud: project,
    iss: `https://securetoken.google.com/${project}`, iat: now, exp: now + 3600,
    superadmin: actor.superadmin ?? false, platformAdmin: actor.platformAdmin ?? false,
    firebase: { sign_in_provider: actor.provider || 'custom', identities: {} },
  })}.`;
}

async function request(method, path, actor, body) {
  return fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${actor === 'owner' ? 'owner' : token(actor)}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
}

async function expectStatus(response, status, operation) {
  assert.equal(response.status, status, `${operation}: ${await response.text()}`);
}
const denied = (response, operation) => expectStatus(response, 403, operation);
const succeeds = (response, operation) => expectStatus(response, 200, operation);

function reviewQuery(uid) {
  return { structuredQuery: { from: [{ collectionId: 'freelancerReviews' }], where: {
    fieldFilter: { field: { fieldPath: 'freelancerId' }, op: 'EQUAL', value: string(uid) },
  } } };
}

before(async () => {
  let rules = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');
  // Opt-in negative control: unsafe grants exist only in emulator memory. A
  // nonzero run proves the same assertions detect broadened access; never use
  // this flag for the release gate. The next ordinary run reloads saved rules.
  if (process.env.FREELANCER_RULES_MUTATION === 'unsafe-access') {
    rules = rules.replace('match /databases/{database}/documents {', `match /databases/{database}/documents {
      match /freelancerReviews/{id} { allow read: if true; }
      match /publicProfileSlugs/{id} { allow read, write: if true; }
      match /publicProfiles/{id} { allow write: if true; }
    `);
  } else if (process.env.FREELANCER_RULES_MUTATION) {
    throw new Error('Unknown rules mutation');
  }
  await succeeds(await request('PUT', `/emulator/v1/projects/${project}:securityRules`, null, {
    rules: { files: [{ content: rules }] },
  }), 'load rules');
  await succeeds(await request('DELETE', `/emulator/v1/projects/${project}/databases/(default)/documents`, 'owner'), 'clear local fixtures');
  for (const [collection, fields] of Object.entries(fixtures)) {
    await succeeds(await request('PATCH', `${documents}/${collection}/record-a`, 'owner', { fields }), `seed ${collection}`);
  }
  await succeeds(await request('PATCH', `${documents}/freelancerReviews/review-b`, 'owner', {
    fields: { ...fixtures.freelancerReviews, freelancerId: string('freelancer-b') },
  }), 'seed other inbox');
  await succeeds(await request('PATCH', `${documents}/unrecognizedServerData/record-a`, 'owner', { fields: { private: string('test') } }), 'seed unknown collection');
});

// A broad read grant would expose reviews to other freelancers/guests/admins.
test('only the freelancer owner reads their review document and filtered inbox', async () => {
  await succeeds(await request('GET', `${documents}/freelancerReviews/record-a`, freelancer), 'own review');
  await succeeds(await request('POST', `${documents}:runQuery`, freelancer, reviewQuery('freelancer-a')), 'own inbox');
  await denied(await request('GET', `${documents}/freelancerReviews/review-b`, freelancer), 'other inbox document');
  for (const actor of actors.filter(actor => actor !== freelancer)) {
    await denied(await request('GET', `${documents}/freelancerReviews/record-a`, actor), `review read by ${actor?.uid || 'signed-out'}`);
    await denied(await request('POST', `${documents}:runQuery`, actor, reviewQuery('freelancer-a')), `review query by ${actor?.uid || 'signed-out'}`);
  }
});

test('the freelancer cannot enumerate all reviews or query another owner inbox', async () => {
  await denied(await request('GET', `${documents}/freelancerReviews`, freelancer), 'unfiltered inbox');
  await denied(await request('POST', `${documents}:runQuery`, freelancer, reviewQuery('freelancer-b')), 'other owner query');
});

// Public projections, slug reservations and exact addresses are callable-only.
for (const collection of ['publicProfiles', 'publicProfileSlugs', 'bookingRequestPrivate']) {
  test(`no browser identity reads or lists ${collection}`, async () => {
    for (const actor of actors) {
      await denied(await request('GET', `${documents}/${collection}/record-a`, actor), `${collection} get by ${actor?.uid || 'signed-out'}`);
      await denied(await request('GET', `${documents}/${collection}`, actor), `${collection} list by ${actor?.uid || 'signed-out'}`);
    }
  });
}

// Any create/update/delete grant here would bypass server validation, privacy,
// review verification, or the transactional reservation lifecycle.
for (const [collection, fields] of Object.entries(fixtures)) {
  for (const operation of ['create', 'update', 'delete']) {
    test(`no browser identity can ${operation} ${collection}`, async () => {
      for (const actor of actors) {
        const path = `${documents}/${collection}/${operation === 'create' ? `new-${actor?.uid || 'signed-out'}` : 'record-a'}`;
        const body = operation === 'delete' ? undefined : { fields: { ...fields, status: string('tampered') } };
        await denied(await request(operation === 'delete' ? 'DELETE' : 'PATCH', path, actor, body), `${operation} ${collection} by ${actor?.uid || 'signed-out'}`);
      }
    });
  }
}

test('booking requests remain readable only by their client and freelancer', async () => {
  for (const actor of [actors[2], freelancer]) {
    await succeeds(await request('GET', `${documents}/bookingRequests/record-a`, actor), 'authorized booking read');
  }
  for (const actor of [null, actors[1], actors[4], actors[5]]) {
    await denied(await request('GET', `${documents}/bookingRequests/record-a`, actor), 'unrelated booking read');
  }
});

test('unrecognized collection paths remain denied by default', async () => {
  for (const actor of actors) {
    await denied(await request('GET', `${documents}/unrecognizedServerData/record-a`, actor), 'unknown read');
    await denied(await request('PATCH', `${documents}/unrecognizedServerData/new-record`, actor, { fields: {} }), 'unknown write');
  }
});
