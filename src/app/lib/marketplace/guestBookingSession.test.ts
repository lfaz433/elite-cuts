// @ts-nocheck -- Execute production TS with only Firebase SDK I/O replaced.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import ts from '../../../../functions/node_modules/typescript/lib/typescript.js';

function sessionModules() {
  const auth = { currentUser: null };
  const events = [];
  let signInResult = { user: { uid: 'anonymous-uid' } };
  let callableResult = { bookingId: 'anonymous-uid_5ab1ddea-7c82-4c19-9545-40781b317b01', status: 'pending_approval' };
  const cache = new Map();
  const load = filename => {
    if (!existsSync(filename)) return {};
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
    }).outputText;
    new Function('require', 'module', 'exports', source)(request => {
      if (request === '../firebase') return { auth, functions: {} };
      if (request === 'firebase/auth') return { signInAnonymously: async target => {
        assert.equal(target, auth); events.push('sign-in');
        if (signInResult instanceof Error) throw signInResult;
        auth.currentUser = signInResult.user; return signInResult;
      } };
      if (request === 'firebase/functions') return { httpsCallable: (_functions, name, options) => async input => {
        events.push({ name, input, options, uid: auth.currentUser?.uid });
        if (callableResult instanceof Error) throw callableResult;
        return { data: callableResult };
      } };
      if (request.startsWith('.')) return load(resolve(dirname(filename), `${request}.ts`));
      throw new Error(`Unexpected import: ${request}`);
    }, module, module.exports);
    return module.exports;
  };
  return { auth, events, session: load(resolve(import.meta.dirname, 'guestBookingSession.ts')),
    bookings: load(resolve(import.meta.dirname, 'bookings.ts')),
    setSignIn: value => { signInResult = value; }, setResponse: value => { callableResult = value; } };
}
const request = {
  publicSlug: 'amine-fade', serviceId: 'cut', appointmentMode: 'chair', date: '2099-09-05', time: '11:00',
  clientName: 'Ada', clientEmail: 'ada@example.test', clientPhone: '+33612345678',
  clientRequestId: '5ab1ddea-7c82-4c19-9545-40781b317b01',
};
test('guest helper reuses an existing Firebase session', async () => {
  const setup = sessionModules(); setup.auth.currentUser = { uid: 'existing-client' };
  assert.equal(typeof setup.session.ensureGuestBookingSession, 'function');
  assert.equal(await setup.session.ensureGuestBookingSession(), 'existing-client');
  assert.deepStrictEqual(setup.events, []);
});
test('guest helper creates an anonymous Firebase session only when requested', async () => {
  const setup = sessionModules(); assert.deepStrictEqual(setup.events, []);
  assert.equal(typeof setup.session.ensureGuestBookingSession, 'function');
  assert.equal(await setup.session.ensureGuestBookingSession(), 'anonymous-uid');
  assert.deepStrictEqual(setup.events, ['sign-in']);
});
test('guest sign-in failure propagates without a booking submission', async () => {
  const setup = sessionModules(); const error = new Error('Anonymous sign-in unavailable'); setup.setSignIn(error);
  assert.equal(typeof setup.session.ensureGuestBookingSession, 'function');
  await assert.rejects(setup.session.ensureGuestBookingSession(), candidate => candidate === error);
  assert.deepStrictEqual(setup.events, ['sign-in']);
});
test('public booking submission obtains a session and a limited-use App Check token', async () => {
  const setup = sessionModules(); assert.equal(typeof setup.bookings.requestPublicFreelancerBooking, 'function');
  assert.deepStrictEqual(setup.events, []);
  const result = await setup.bookings.requestPublicFreelancerBooking(request);
  assert.equal(result.status, 'pending_approval');
  assert.deepStrictEqual(setup.events, ['sign-in', { name: 'requestPublicFreelancerBooking', input: request,
    options: { limitedUseAppCheckTokens: true }, uid: 'anonymous-uid' }]);
});
test('public submission stops at sign-in failure and preserves callable errors', async () => {
  const setup = sessionModules(); assert.equal(typeof setup.bookings.requestPublicFreelancerBooking, 'function');
  const error = new Error('auth failed'); setup.setSignIn(error);
  await assert.rejects(setup.bookings.requestPublicFreelancerBooking(request), candidate => candidate === error);
  assert.deepStrictEqual(setup.events, ['sign-in']);
  setup.auth.currentUser = { uid: 'existing' }; setup.setResponse(error);
  await assert.rejects(setup.bookings.requestPublicFreelancerBooking(request), candidate => candidate === error);
});
for (const status of ['pending_approval', 'confirmed', 'declined', 'cancelled', 'completed', 'payment_failed']) {
  test(`public client accepts saved idempotent status ${status}`, async () => {
    const setup = sessionModules(); assert.equal(typeof setup.bookings.requestPublicFreelancerBooking, 'function');
    setup.setResponse({ bookingId: 'booking-id', status });
    assert.deepStrictEqual(await setup.bookings.requestPublicFreelancerBooking(request), { bookingId: 'booking-id', status });
  });
}
for (const data of [null, {}, { bookingId: '', status: 'pending_approval' }, { bookingId: 'bad/path', status: 'pending_approval' },
  { bookingId: 'booking-id', status: 'other' }, { bookingId: 'booking-id', status: 'pending_approval', homeAddress: 'private' }]) {
  test(`public client rejects malformed or overbroad booking response ${JSON.stringify(data)}`, async () => {
    const setup = sessionModules(); assert.equal(typeof setup.bookings.requestPublicFreelancerBooking, 'function');
    setup.setResponse(data);
    await assert.rejects(setup.bookings.requestPublicFreelancerBooking(request), /invalid response/);
  });
}
