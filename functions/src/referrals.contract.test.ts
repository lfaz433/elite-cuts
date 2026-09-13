import type { ReferralAuditFilter, ReferralMarketingOverview } from './referrals';

export const validReferralAuditFilters: ReferralAuditFilter[] = [
  {},
  { limit: 20 },
  { code: 'FRIEND', limit: 10 },
  { programId: 'program-a', limit: 10 },
  { rewardId: 'reward-a', limit: 10 },
  { action: 'REFERRAL_REWARD_APPROVED', limit: 10 },
];

// @ts-expect-error Overview accepts one audit filter at a time.
export const invalidCombinedReferralAuditFilter: ReferralAuditFilter = {
  code: 'FRIEND',
  programId: 'program-a',
};

export const validReferralOverviewEpoch: ReferralMarketingOverview['summaryEpoch'] = 'referral-v3';

// @ts-expect-error The V3 overview epoch is a literal contract, not an arbitrary string.
export const invalidReferralOverviewEpoch: ReferralMarketingOverview['summaryEpoch'] = 'legacy';

export const validFixedTopReferrers: ReferralMarketingOverview['topReferrers'] = {
  items: [],
  truncated: false,
};

export const invalidPageableTopReferrers: ReferralMarketingOverview['topReferrers'] = {
  items: [],
  // @ts-expect-error The fixed top-ten ranking has no continuation token.
  nextPageToken: 'not-supported',
  truncated: true,
};
