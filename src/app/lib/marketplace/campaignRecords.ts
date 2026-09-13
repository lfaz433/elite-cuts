export type ClientCampaignSegment = 'all' | 'new' | 'inactive' | 'vip';

export interface ClientCampaign {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  segment: ClientCampaignSegment;
  couponCode?: string;
  discountAmount?: number;
}

const SEGMENTS = new Set<ClientCampaignSegment>(['all', 'new', 'inactive', 'vip']);

export function parseClientCampaigns(value: unknown): ClientCampaign[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  return value.flatMap(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const campaign = raw as Record<string, unknown>;
    if (
      typeof campaign.id !== 'string'
      || campaign.id.length === 0
      || campaign.id.length > 256
      || typeof campaign.tenantId !== 'string'
      || campaign.tenantId.length === 0
      || campaign.tenantId.length > 256
      || typeof campaign.title !== 'string'
      || campaign.title.length === 0
      || campaign.title.length > 160
      || typeof campaign.description !== 'string'
      || campaign.description.length === 0
      || campaign.description.length > 2000
      || typeof campaign.segment !== 'string'
      || !SEGMENTS.has(campaign.segment as ClientCampaignSegment)
      || (campaign.couponCode !== undefined && (
        typeof campaign.couponCode !== 'string'
        || campaign.couponCode.length === 0
        || campaign.couponCode.length > 80
      ))
      || (campaign.discountAmount !== undefined && (
        typeof campaign.discountAmount !== 'number'
        || !Number.isFinite(campaign.discountAmount)
        || campaign.discountAmount < 0
        || campaign.discountAmount > 100
      ))
    ) return [];
    return [{
      id: campaign.id,
      tenantId: campaign.tenantId,
      title: campaign.title,
      description: campaign.description,
      segment: campaign.segment as ClientCampaignSegment,
      ...(typeof campaign.couponCode === 'string' ? { couponCode: campaign.couponCode } : {}),
      ...(typeof campaign.discountAmount === 'number'
        ? { discountAmount: campaign.discountAmount }
        : {}),
    }];
  });
}
