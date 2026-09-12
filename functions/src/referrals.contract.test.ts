import type { ReferralAuditFilter } from './referrals';

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
