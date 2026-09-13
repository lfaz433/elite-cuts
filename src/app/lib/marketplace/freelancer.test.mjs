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

const { parseFreelancerProfile, parsePortfolioItem } = loadModule('freelancerRecords.ts').exports;

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
