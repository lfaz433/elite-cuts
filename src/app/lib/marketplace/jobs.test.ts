import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJobPost } from './jobRecords';

test('accepts only published jobs in the requested city', () => {
  const job = {
    id: 'job-a', brandId: 'brand-a', locationId: 'paris', cityId: 'fr-paris',
    relationshipType: 'chair_rental', title: 'Fauteuil disponible', description: 'Description',
    serviceIds: ['cut'], schedule: 'Mardi au samedi', terms: '500 € par mois',
  };
  assert.deepEqual(parseJobPost(job, 'fr-paris'), job);
  assert.equal(parseJobPost({ ...job, cityId: 'fr-grenoble' }, 'fr-paris'), null);
});
