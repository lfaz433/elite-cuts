import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from '../../../../functions/node_modules/typescript/lib/typescript.js';

function loadModule(relativePath) {
  const filename = resolve(import.meta.dirname, relativePath);
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    request => loadModule(`${request.slice(2)}.ts`).exports,
    loaded,
    loaded.exports,
  );
  return loaded;
}

const { parseFreelancerProfile, parsePortfolioItem, emptyFreelancerProfile } = loadModule('freelancerRecords.ts').exports;

const legacyProfile = {
  uid: 'freelancer-a', displayName: 'Ada', bio: 'Paris', cityId: 'fr-paris',
  languages: ['fr'], serviceSummary: 'Coupe', serviceIds: ['cut'], visible: false,
  servicePricesMinor: { cut: 2500 }, radiusKm: 10, travelFeeMinor: 500,
  deposit: { mode: 'none', value: 0 }, cancellationWindowHours: 24,
  availability: ['2099-09-07T10:00'],
};
const workplace = { name: 'Atelier', line1: '1 rue de Paris', postalCode: '75001', city: 'Paris' };

test('parses only a complete owned freelancer profile', () => {
  assert.deepEqual(parseFreelancerProfile('freelancer-a', {
    uid: 'freelancer-a', displayName: 'Ada', bio: 'Paris', cityId: 'fr-paris',
    languages: ['fr'], serviceSummary: 'Coupe', serviceIds: ['cut'], visible: false,
    servicePricesMinor: { cut: 2500 },
    radiusKm: 10, travelFeeMinor: 500, deposit: { mode: 'none', value: 0 },
    cancellationWindowHours: 24, availability: ['2099-09-07T10:00'],
  }), {
    uid: 'freelancer-a', displayName: 'Ada', bio: 'Paris', cityId: 'fr-paris',
    languages: ['fr'], serviceSummary: 'Coupe', serviceIds: ['cut'], visible: false,
    servicePricesMinor: { cut: 2500 },
    radiusKm: 10, travelFeeMinor: 500, deposit: { mode: 'none', value: 0 },
    cancellationWindowHours: 24, availability: ['2099-09-07T10:00'],
    identity: { socialLinks: {}, publicSlug: '' },
    serviceDurationMinutes: { cut: 30 },
    workModes: { home: true, chair: false },
    availabilityByMode: { home: ['2099-09-07T10:00'], chair: [] },
  });
  assert.equal(parseFreelancerProfile('freelancer-b', { uid: 'freelancer-a' }), null);
  assert.equal(parseFreelancerProfile('freelancer-a', {
    uid: 'freelancer-a', displayName: 'Ada', bio: 'Paris', cityId: 'fr-paris',
    languages: ['fr'], serviceSummary: 'Coupe', serviceIds: ['cut'], visible: false,
    servicePricesMinor: { beard: 2500 },
    radiusKm: 10, travelFeeMinor: 500, deposit: { mode: 'none', value: 0 },
    cancellationWindowHours: 24, availability: [],
  }), null);
});

test('accepts an owned portfolio record and rejects one belonging to another freelancer', () => {
  assert.deepEqual(parsePortfolioItem('item-owned', 'freelancer-a', {
    ownerId: 'freelancer-a', ownerType: 'freelancer', imageUrl: 'https://example.test/a.jpg',
    caption: 'Coupe', visible: true, moderationStatus: 'approved',
  }), {
    id: 'item-owned', ownerId: 'freelancer-a', ownerType: 'freelancer',
    imageUrl: 'https://example.test/a.jpg',
    caption: 'Coupe', visible: true, moderationStatus: 'approved',
  });
  assert.equal(parsePortfolioItem('item-a', 'freelancer-a', {
    ownerId: 'freelancer-b', ownerType: 'freelancer', imageUrl: 'https://example.test/b.jpg',
    caption: '', visible: true, moderationStatus: 'approved',
  }), null);
});

test('reads legacy freelancer data as home-only with 30-minute services', () => {
  const profile = parseFreelancerProfile('freelancer-a', legacyProfile);
  assert.deepEqual(profile?.workModes, { home: true, chair: false });
  assert.deepEqual(profile?.availabilityByMode, { home: ['2099-09-07T10:00'], chair: [] });
  assert.deepEqual(profile?.serviceDurationMinutes, { cut: 30 });
  assert.equal(profile?.workplace, undefined);
});

test('normalizes configured home and chair availability with a complete workplace', () => {
  const profile = parseFreelancerProfile('freelancer-a', {
    ...legacyProfile,
    serviceDurationMinutes: { cut: 45 },
    workModes: { home: true, chair: true },
    availabilityByMode: { home: ['2099-09-08T11:00'], chair: ['2099-09-07T10:00'] },
    workplace,
  });
  assert.deepEqual(profile?.workModes, { home: true, chair: true });
  assert.deepEqual(profile?.workplace, workplace);
  assert.deepEqual(profile?.availability, ['2099-09-08T11:00']);
  assert.deepEqual(profile?.availabilityByMode.chair, ['2099-09-07T10:00']);
  assert.equal(profile?.serviceDurationMinutes.cut, 45);
});

test('rejects duplicate slots within or across appointment modes, including legacy slots', () => {
  for (const availabilityByMode of [
    { home: ['2099-09-07T10:00', '2099-09-07T10:00'], chair: [] },
    { home: [], chair: ['2099-09-07T10:00', '2099-09-07T10:00'] },
    { home: ['2099-09-07T10:00'], chair: ['2099-09-07T10:00'] },
  ]) {
    assert.equal(parseFreelancerProfile('freelancer-a', {
      ...legacyProfile, workModes: { home: true, chair: true }, availabilityByMode, workplace,
    }), null);
  }
  assert.equal(parseFreelancerProfile('freelancer-a', {
    ...legacyProfile, availability: ['2099-09-07T10:00', '2099-09-07T10:00'],
  }), null);
});

test('rejects malformed mode fields and chair mode without a complete workplace', () => {
  for (const patch of [
    { workModes: null }, { workModes: { home: true, chair: 'yes' } },
    { availabilityByMode: null }, { availabilityByMode: { home: [], chair: [42] } },
    { workModes: { home: false, chair: true } },
    { workModes: { home: true, chair: true }, workplace: { ...workplace, city: ' ' } },
    { workplace: { ...workplace, line1: '' } },
  ]) assert.equal(parseFreelancerProfile('freelancer-a', { ...legacyProfile, ...patch }), null);
});

test('validates complete service durations as integers from 15 through 360 minutes', () => {
  for (const duration of [15, 360]) {
    assert.equal(parseFreelancerProfile('freelancer-a', {
      ...legacyProfile, serviceDurationMinutes: { cut: duration },
    })?.serviceDurationMinutes?.cut, duration);
  }
  for (const serviceDurationMinutes of [null, {}, { beard: 30 }, { cut: 30, beard: 30 },
    { cut: 14 }, { cut: 361 }, { cut: 30.5 }, { cut: NaN }, { cut: '30' }]) {
    assert.equal(parseFreelancerProfile('freelancer-a', { ...legacyProfile, serviceDurationMinutes }), null);
  }
});

test('starts an empty freelancer profile with compatible home-only defaults', () => {
  const profile = emptyFreelancerProfile('Ada');
  assert.deepEqual(profile.serviceDurationMinutes, {});
  assert.deepEqual(profile.workModes, { home: true, chair: false });
  assert.deepEqual(profile.availabilityByMode, { home: [], chair: [] });
  assert.equal(profile.workplace, undefined);
});
