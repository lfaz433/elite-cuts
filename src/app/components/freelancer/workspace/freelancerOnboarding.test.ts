import assert from 'node:assert/strict';
import test from 'node:test';
import { freelancerOnboardingSteps, needsFreelancerOnboarding } from './freelancerOnboarding.ts';

const emptyProfile = {
  displayName: 'Ada',
  serviceSummary: '',
  serviceIds: [],
  workModes: { home: true, chair: false },
  availabilityByMode: { home: [], chair: [] },
  visible: false,
  identity: { publicSlug: '' },
};

test('a new freelancer sees every real setup requirement as incomplete', () => {
  assert.equal(needsFreelancerOnboarding(emptyProfile), true);
  assert.deepEqual(freelancerOnboardingSteps(emptyProfile).map(step => [step.id, step.complete, step.to]), [
    ['identity', false, '/freelancer/settings'],
    ['services', false, '/freelancer/services'],
    ['availability', false, '/freelancer/settings#availability'],
    ['publication', false, '/freelancer/settings'],
  ]);
});

test('only a saved-looking profile with services, slots and publication completes setup', () => {
  const profile = {
    ...emptyProfile,
    serviceSummary: 'Coupe et barbe.',
    serviceIds: ['cut'],
    availabilityByMode: { home: ['2099-09-05T10:00'], chair: [] },
    visible: true,
    identity: { publicSlug: 'ada-cuts' },
  };
  assert.deepEqual(freelancerOnboardingSteps(profile).map(step => step.complete), [true, true, true, true]);
  assert.equal(needsFreelancerOnboarding(profile), false);
});

test('each enabled mode requires its own availability before publication', () => {
  const profile = {
    ...emptyProfile,
    serviceSummary: 'Coupe.',
    serviceIds: ['cut'],
    workModes: { home: true, chair: true },
    availabilityByMode: { home: ['2099-09-05T10:00'], chair: [] },
    visible: true,
    identity: { publicSlug: 'ada-cuts' },
  };
  assert.equal(freelancerOnboardingSteps(profile).find(step => step.id === 'availability')?.complete, false);
  assert.equal(needsFreelancerOnboarding(profile), true);
});
