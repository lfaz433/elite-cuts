import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SalonBookingManagerView, SalonHiringManagerView } from './SalonManagerViews';

test('renders salon availability and manual booking response controls', () => {
  const html = renderToStaticMarkup(<SalonBookingManagerView
    slotsText="2099-09-05T10:30"
    onSlotsTextChange={() => undefined}
    onSave={() => undefined}
    onRespond={() => undefined}
    saving={false}
    bookings={[{
      id: 'booking-a', source: 'marketplace', profileId: 'salon__location-a',
      ownerId: 'location-a', ownerType: 'salon', clientId: 'client-a', clientName: 'Ada',
      serviceId: 'cut', date: '2099-09-05', time: '10:30', status: 'pending_approval',
    }]}
  />);
  assert.match(html, /Disponibilités du salon/);
  assert.match(html, /2099-09-05T10:30/);
  assert.match(html, /Ada/);
  assert.match(html, /Accepter/);
  assert.match(html, /Refuser/);
});

test('renders salon job creation and permission-aware application review controls', () => {
  const application = {
    id: 'application-a', jobId: 'job-a', applicantId: 'freelancer-a',
    applicantEmail: 'ada@example.test', applicantName: 'Ada', portfolioItemIds: [],
    message: 'Bonjour', brandId: 'brand-a', locationId: 'location-a', cityId: 'fr-paris' as const,
    relationshipType: 'employee' as const, status: 'submitted' as const,
  };
  const common = {
    jobs: [{
      id: 'job-a', brandId: 'brand-a', locationId: 'location-a', cityId: 'fr-paris' as const,
      relationshipType: 'employee' as const, title: 'Barbier', description: 'Description',
      serviceIds: ['cut'], schedule: 'Mardi', terms: 'CDI',
    }],
    applications: [application],
    onCreate: () => undefined,
    onReview: () => undefined,
    creating: false,
  };
  const managerHtml = renderToStaticMarkup(<SalonHiringManagerView {...common} canInviteWorkers={false} />);
  assert.match(managerHtml, /Publier une offre/);
  assert.match(managerHtml, /Ada/);
  assert.match(managerHtml, /Refuser/);
  assert.doesNotMatch(managerHtml, /Inviter comme membre/);

  const inviterHtml = renderToStaticMarkup(<SalonHiringManagerView {...common} canInviteWorkers />);
  assert.match(inviterHtml, /Inviter comme membre/);
});
