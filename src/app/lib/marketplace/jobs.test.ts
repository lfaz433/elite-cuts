import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJobPost, parseSalonHiringWorkspace } from './jobRecords';

test('accepts only published jobs in the requested city', () => {
  const job = {
    id: 'job-a', brandId: 'brand-a', locationId: 'paris', cityId: 'fr-paris',
    relationshipType: 'chair_rental', title: 'Fauteuil disponible', description: 'Description',
    serviceIds: ['cut'], schedule: 'Mardi au samedi', terms: '500 € par mois',
  };
  assert.deepEqual(parseJobPost(job, 'fr-paris'), job);
  assert.equal(parseJobPost({ ...job, cityId: 'fr-grenoble' }, 'fr-paris'), null);
});

test('parses an exact-location salon hiring workspace and drops mismatched applications', () => {
  const job = {
    id: 'job-a', brandId: 'brand-a', locationId: 'location-a', cityId: 'fr-paris',
    relationshipType: 'employee', title: 'Barbier', description: 'Description',
    serviceIds: ['cut'], schedule: 'Mardi au samedi', terms: 'CDI',
  };
  assert.deepEqual(parseSalonHiringWorkspace({
    locationId: 'location-a', cityId: 'fr-paris', jobs: [job], applications: [
      {
        id: 'application-a', jobId: 'job-a', applicantId: 'freelancer-a',
        applicantEmail: 'ada@example.test', applicantName: 'Ada', portfolioItemIds: ['portfolio-a'],
        message: 'Bonjour', brandId: 'brand-a', locationId: 'location-a', cityId: 'fr-paris',
        relationshipType: 'employee', status: 'submitted',
      },
      {
        id: 'application-cross', jobId: 'job-a', applicantId: 'freelancer-b',
        applicantEmail: 'eve@example.test', applicantName: 'Eve', portfolioItemIds: [],
        message: '', brandId: 'brand-a', locationId: 'location-b', cityId: 'fr-paris',
        relationshipType: 'employee', status: 'submitted',
      },
    ],
  }, 'location-a'), {
    locationId: 'location-a', cityId: 'fr-paris', jobs: [job],
    applications: [expectApplication('application-a')],
  });
  assert.equal(parseSalonHiringWorkspace({ locationId: 'location-b' }, 'location-a'), null);
});

function expectApplication(id: string) {
  return {
    id, jobId: 'job-a', applicantId: 'freelancer-a', applicantEmail: 'ada@example.test',
    applicantName: 'Ada', portfolioItemIds: ['portfolio-a'], message: 'Bonjour',
    brandId: 'brand-a', locationId: 'location-a', cityId: 'fr-paris',
    relationshipType: 'employee', status: 'submitted',
  };
}
