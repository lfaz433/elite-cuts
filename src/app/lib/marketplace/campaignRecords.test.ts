import assert from 'node:assert/strict';
import test from 'node:test';
import { parseClientCampaigns } from './campaignRecords';

test('parses only bounded client campaign projections returned by the server', () => {
  assert.deepEqual(parseClientCampaigns([
    {
      id: 'campaign-a', tenantId: 'location-a', title: 'VIP', description: 'Merci',
      segment: 'vip', couponCode: 'VIP20', discountAmount: 20,
    },
    {
      id: 'bad-segment', tenantId: 'location-a', title: 'Secret', description: 'No',
      segment: 'active',
    },
    {
      id: 'bad-discount', tenantId: 'location-a', title: 'Secret', description: 'No',
      segment: 'all', discountAmount: 1000,
    },
  ]), [{
    id: 'campaign-a', tenantId: 'location-a', title: 'VIP', description: 'Merci',
    segment: 'vip', couponCode: 'VIP20', discountAmount: 20,
  }]);
  assert.equal(parseClientCampaigns(null), null);
});
