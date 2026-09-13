import type { ReferralMarketingOverview } from './ReferralMarketingDashboard';

export const validReferralOverviewEpoch: ReferralMarketingOverview['summaryEpoch'] = 'referral-v3';

// @ts-expect-error The dashboard consumes only the literal V3 summary epoch.
export const invalidReferralOverviewEpoch: ReferralMarketingOverview['summaryEpoch'] = 'legacy';

export const validFixedTopReferrers: ReferralMarketingOverview['topReferrers'] = {
  items: [],
  truncated: false,
};

export const invalidPageableTopReferrers: ReferralMarketingOverview['topReferrers'] = {
  items: [],
  // @ts-expect-error The dashboard's fixed top-ten ranking cannot be paged.
  nextPageToken: 'not-supported',
  truncated: true,
};
