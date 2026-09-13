import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addFreelancerService,
  displayFreelancerService,
  removeFreelancerService,
  setFreelancerServicePrice,
} from './freelancerServices.mjs';

test('adds a named service once with a price slot', () => {
  const profile = { serviceIds: ['cut'], servicePricesMinor: { cut: 2500 } };
  assert.deepEqual(addFreelancerService(profile, 'Beard trim'), {
    serviceIds: ['cut', 'beard-trim'],
    servicePricesMinor: { cut: 2500, 'beard-trim': 0 },
  });
  assert.equal(addFreelancerService(profile, 'Cut'), null);
});

test('updates and removes only the selected service price', () => {
  const profile = { serviceIds: ['cut', 'beard-trim'], servicePricesMinor: { cut: 2500, 'beard-trim': 0 } };
  assert.deepEqual(setFreelancerServicePrice(profile, 'beard-trim', 1800), {
    serviceIds: ['cut', 'beard-trim'], servicePricesMinor: { cut: 2500, 'beard-trim': 1800 },
  });
  assert.deepEqual(removeFreelancerService(profile, 'cut'), {
    serviceIds: ['beard-trim'], servicePricesMinor: { 'beard-trim': 0 },
  });
  assert.equal(displayFreelancerService('cut-and-beard'), 'Cut and beard');
});
