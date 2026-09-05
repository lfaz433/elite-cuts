import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFreelancerProfile, parsePortfolioItem } from './freelancerRecords';

test('parses only a complete owned freelancer profile', () => {
  assert.deepEqual(parseFreelancerProfile('freelancer-a', {
    uid: 'freelancer-a', displayName: 'Ada', bio: 'Paris', cityId: 'fr-paris',
    languages: ['fr'], serviceSummary: 'Coupe', serviceIds: ['cut'], visible: false,
    radiusKm: 10, travelFeeMinor: 500, deposit: { mode: 'none', value: 0 },
    cancellationWindowHours: 24, availability: ['2099-09-07T10:00'],
  }), {
    uid: 'freelancer-a', displayName: 'Ada', bio: 'Paris', cityId: 'fr-paris',
    languages: ['fr'], serviceSummary: 'Coupe', serviceIds: ['cut'], visible: false,
    radiusKm: 10, travelFeeMinor: 500, deposit: { mode: 'none', value: 0 },
    cancellationWindowHours: 24, availability: ['2099-09-07T10:00'],
  });
  assert.equal(parseFreelancerProfile('freelancer-b', { uid: 'freelancer-a' }), null);
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
