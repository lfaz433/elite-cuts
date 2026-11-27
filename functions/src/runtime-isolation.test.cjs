// Run after `npm --prefix functions run build` using Node's test runner.
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const express = require('express');
const endpoints = require('../lib/index.js');

let server;
let baseUrl;
before(async () => {
  const app = express();
  app.use(express.json());
  for (const name of [
    'listSalonBookingWorkspace', 'saveSalonAvailability',
    'listSalonHiringWorkspace', 'getMyReferralWorkspace',
    'requestBooking', 'requestPublicFreelancerBooking',
    'getGuestFreelancerBooking', 'cancelBooking', 'recordReferralVisit', 'submitFreelancerReview',
  ]) app.post(`/${name}`, endpoints[name]);
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function unauthenticatedRequest(name) {
  const response = await fetch(`${baseUrl}/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: {} }),
  });
  assert.equal(response.status, 401);
  return response.json();
}

for (const name of [
  'listSalonBookingWorkspace', 'saveSalonAvailability',
  'listSalonHiringWorkspace', 'getMyReferralWorkspace',
]) test(`${name} retains its own authentication guard without inheriting public App Check options`, async () => {
  const body = await unauthenticatedRequest(name);
  assert.deepEqual(body.error, {
    status: 'UNAUTHENTICATED', message: 'Authentication is required',
  });
});

for (const name of [
  'requestBooking', 'requestPublicFreelancerBooking',
  'getGuestFreelancerBooking', 'cancelBooking', 'recordReferralVisit', 'submitFreelancerReview',
]) test(`${name} still rejects missing App Check before entering the public handler`, async () => {
  const body = await unauthenticatedRequest(name);
  assert.deepEqual(body.error, { status: 'UNAUTHENTICATED', message: 'Unauthenticated' });
});
