// @ts-nocheck
const { readFileSync } = require('node:fs');
const { isAbsolute, resolve } = require('node:path');
const ts = require('typescript');

function loadModule(relativePath = 'referrals.ts') {
  const filename = isAbsolute(relativePath) ? relativePath : resolve(__dirname, relativePath);
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', output)(request => (
    request === 'firebase-admin' || request === 'firebase-functions'
      ? require(resolve(__dirname, '..', 'node_modules', request))
      : require(request)
  ), loaded, loaded.exports);
  return loaded.exports;
}

function snapshot(value, id = '') {
  return { exists: value !== undefined, id, data: () => value };
}

function firestoreState(initial) {
  const state = structuredClone(initial);
  let nextId = 0;
  const reference = (collectionName, id) => ({
    collectionName,
    id: id ?? `${collectionName}-${++nextId}`,
    get: async () => snapshot(state[collectionName]?.[id], id),
  });
  const query = (collectionName, filters = []) => ({
    collectionName,
    isQuery: true,
    where(field, operator, value) {
      return query(collectionName, [...filters, [field, operator, value]]);
    },
    async get() {
      const docs = Object.entries(state[collectionName] ?? {})
        .filter(([, data]) => filters.every(([field, operator, value]) => (
          operator === '==' && data[field] === value
        )))
        .map(([id, data]) => snapshot(data, id));
      return { docs, empty: docs.length === 0 };
    },
  });
  return {
    state,
    firestore: {
      collection(collectionName) {
        return {
          doc(id) { return reference(collectionName, id); },
          where(field, operator, value) { return query(collectionName, [[field, operator, value]]); },
        };
      },
      async runTransaction(callback) {
        return callback({
          get: ref => ref.get(),
          getAll: async (...refs) => Promise.all(refs.map(ref => ref.get())),
          create(ref, value) {
            state[ref.collectionName] ??= {};
            if (state[ref.collectionName][ref.id]) throw new Error('already exists');
            state[ref.collectionName][ref.id] = value;
          },
          set(ref, value) {
            state[ref.collectionName] ??= {};
            state[ref.collectionName][ref.id] = value;
          },
          update(ref, value) {
            state[ref.collectionName] ??= {};
            state[ref.collectionName][ref.id] = { ...state[ref.collectionName][ref.id], ...value };
          },
        });
      },
    },
  };
}

const activeProgram = {
  status: 'active', countryCodes: ['FR'], currency: 'EUR', inviterCreditMinor: 500,
  invitedDiscountMinor: 300, startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-10-01T00:00:00.000Z',
};

describe('referral domain', () => {
  test('normalizes share codes into the globally comparable form', () => {
    const { normalizeReferralCode } = loadModule();

    expect(normalizeReferralCode(' Salon-Paris ')).toBe('SALON-PARIS');
  });

  test('rejects self-attribution before creating an immutable attribution', async () => {
    const { attributeReferral } = loadModule();
    const { firestore, state } = firestoreState({
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: {
        OWN: { code: 'OWN', programId: 'program-a', ownerType: 'client', ownerId: 'new-client', status: 'active' },
      },
      referralAttributions: {},
    });

    await expect(attributeReferral('new-client', { code: 'OWN' }, firestore, new Date('2026-09-12T12:00:00Z')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(state.referralAttributions).toEqual({});
  });

  test('reserves a normalized code once and keeps the code owner server-derived', async () => {
    const { reserveReferralCode } = loadModule();
    const { firestore, state } = firestoreState({
      referralPrograms: { 'program-a': activeProgram }, referralCodes: {}, auditEvents: {},
    });

    await expect(reserveReferralCode('inviter-a', {
      programId: 'program-a', code: ' salon-paris ', ownerType: 'client', ownerId: 'someone-else',
    }, firestore, new Date('2026-09-12T12:00:00Z'))).rejects.toMatchObject({ code: 'invalid-argument' });

    await expect(reserveReferralCode('inviter-a', {
      programId: 'program-a', code: ' salon-paris ', ownerType: 'client',
    }, firestore, new Date('2026-09-12T12:00:00Z'))).resolves.toEqual({ code: 'SALON-PARIS' });
    expect(state.referralCodes['SALON-PARIS']).toMatchObject({ ownerId: 'inviter-a', status: 'active' });
  });

  test('does not attribute a code from a paused program', async () => {
    const { attributeReferral } = loadModule();
    const { firestore, state } = firestoreState({
      referralPrograms: { 'program-a': { ...activeProgram, status: 'paused' } },
      referralCodes: {
        FRIEND: { code: 'FRIEND', programId: 'program-a', ownerType: 'client', ownerId: 'inviter-a', status: 'active' },
      },
      referralAttributions: {}, bookings: {},
    });

    await expect(attributeReferral('new-client', { code: 'FRIEND' }, firestore, new Date('2026-09-12T12:00:00Z')))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.referralAttributions).toEqual({});
  });

  test('creates one pending reward only for the first completed non-test booking', async () => {
    const { processReferralBookingCompletion } = loadModule();
    const { firestore, state } = firestoreState({
      bookings: { 'booking-1': { clientId: 'new-client', status: 'completed', isTest: false } },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: {
        FRIEND: { code: 'FRIEND', programId: 'program-a', ownerType: 'client', ownerId: 'inviter-a', status: 'active' },
      },
      referralAttributions: {
        'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-20T00:00:00.000Z' },
      },
      referralRewards: {}, auditEvents: {},
    });

    expect(await processReferralBookingCompletion('booking-1', firestore, new Date('2026-09-12T12:00:00Z')))
      .toEqual({ created: true });
    expect(state.referralRewards['program-a__new-client']).toMatchObject({
      bookingId: 'booking-1', status: 'pending', inviterId: 'inviter-a', invitedUserId: 'new-client',
      inviterCreditMinor: 500, invitedDiscountMinor: 300, currency: 'EUR',
    });

    await expect(processReferralBookingCompletion('booking-1', firestore, new Date('2026-09-12T12:00:00Z')))
      .resolves.toEqual({ created: false });
  });

  test('skips rewards when a different completed non-test booking already exists', async () => {
    const { processReferralBookingCompletion } = loadModule();
    const { firestore, state } = firestoreState({
      bookings: {
        'booking-1': { clientId: 'new-client', status: 'completed', isTest: false },
        'older-booking': { clientId: 'new-client', status: 'completed', isTest: false },
      },
      referralPrograms: { 'program-a': activeProgram },
      referralCodes: { FRIEND: { programId: 'program-a', ownerId: 'inviter-a', status: 'active' } },
      referralAttributions: { 'new-client': { code: 'FRIEND', programId: 'program-a', inviterId: 'inviter-a', expiresAt: '2026-09-20T00:00:00.000Z' } },
      referralRewards: {}, auditEvents: {},
    });

    await expect(processReferralBookingCompletion('booking-1', firestore, new Date('2026-09-12T12:00:00Z')))
      .resolves.toEqual({ created: false });
    expect(state.referralRewards).toEqual({});
  });

  test('allows a super admin to approve a pending reward once and issues non-cash ledgers', async () => {
    const { reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      referralRewards: {
        'program-a__new-client': {
          programId: 'program-a', inviterId: 'inviter-a', invitedUserId: 'new-client',
          inviterCreditMinor: 500, invitedDiscountMinor: 300, currency: 'EUR', status: 'pending',
        },
      },
      creditLedgers: {}, auditEvents: {},
    });

    await expect(reviewReferralReward('admin-a', {
      rewardId: 'program-a__new-client', decision: 'approve',
    }, firestore)).resolves.toEqual({ rewardId: 'program-a__new-client', status: 'approved' });
    expect(state.creditLedgers['program-a__new-client__inviter']).toMatchObject({
      ownerId: 'inviter-a', amountMinor: 500, kind: 'referral_inviter_credit', currency: 'EUR',
    });
    expect(state.creditLedgers['program-a__new-client__invited']).toMatchObject({
      ownerId: 'new-client', amountMinor: 300, kind: 'referral_invited_discount', currency: 'EUR',
    });
    await expect(reviewReferralReward('admin-a', {
      rewardId: 'program-a__new-client', decision: 'approve',
    }, firestore)).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  test('refuses to issue a ledger from a malformed pending reward', async () => {
    const { reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      referralRewards: {
        broken: {
          inviterId: 'inviter-a', invitedUserId: 'new-client', inviterCreditMinor: -1,
          invitedDiscountMinor: 300, currency: 'EUR', status: 'pending',
        },
      },
      creditLedgers: {}, auditEvents: {},
    });

    await expect(reviewReferralReward('admin-a', { rewardId: 'broken', decision: 'approve' }, firestore))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.creditLedgers).toEqual({});
  });

  test('requires a reason when rejecting a pending reward', async () => {
    const { reviewReferralReward } = loadModule();
    const { firestore, state } = firestoreState({
      users: { 'admin-a': { role: 'superadmin' } },
      referralRewards: {
        pending: {
          inviterId: 'inviter-a', invitedUserId: 'new-client', inviterCreditMinor: 500,
          invitedDiscountMinor: 300, currency: 'EUR', status: 'pending',
        },
      },
      creditLedgers: {}, auditEvents: {},
    });

    await expect(reviewReferralReward('admin-a', {
      rewardId: 'pending', decision: 'reject', reason: 'Duplicate identity signal',
    }, firestore)).resolves.toEqual({ rewardId: 'pending', status: 'rejected' });
    expect(state.referralRewards.pending).toMatchObject({ status: 'rejected', reviewReason: 'Duplicate identity signal' });
    expect(state.creditLedgers).toEqual({});
  });

  test('returns only the caller-safe referral workspace', async () => {
    const { getMyReferralWorkspace } = loadModule();
    const { firestore } = firestoreState({
      referralCodes: { FRIEND: { code: 'FRIEND', ownerId: 'inviter-a', ownerType: 'client', programId: 'program-a', status: 'active' } },
      referralAttributions: { 'inviter-a': { code: 'OTHER', programId: 'program-b', inviterId: 'secret-user', expiresAt: '2026-09-20T00:00:00.000Z' } },
      referralRewards: {
        own: { inviterId: 'inviter-a', invitedUserId: 'new-client', inviterCreditMinor: 500, invitedDiscountMinor: 300, currency: 'EUR', status: 'approved' },
        foreign: { inviterId: 'someone-else', invitedUserId: 'other-client', inviterCreditMinor: 1, invitedDiscountMinor: 1, currency: 'EUR', status: 'approved' },
      },
    });

    await expect(getMyReferralWorkspace('inviter-a', {}, firestore)).resolves.toEqual({
      codes: [{ code: 'FRIEND', ownerType: 'client', programId: 'program-a', status: 'active' }],
      attribution: { code: 'OTHER', programId: 'program-b', expiresAt: '2026-09-20T00:00:00.000Z' },
      rewards: [{ id: 'own', role: 'inviter', amountMinor: 500, currency: 'EUR', status: 'approved' }],
    });
  });
});
