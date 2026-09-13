import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

type Firestore = admin.firestore.Firestore;
type RecordValue = Record<string, unknown>;
type ClientSegment = 'active' | 'new' | 'inactive' | 'vip';
type CampaignSegment = 'all' | Exclude<ClientSegment, 'active'>;

export interface ClientCampaign {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  segment: CampaignSegment;
  couponCode?: string;
  discountAmount?: number;
}

interface SegmentFacts {
  completedVisits: number;
  lastCompletedDate?: string;
  accountCreatedAtMs?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ASSOCIATED_TENANTS = 50;
const CAMPAIGN_SEGMENTS = new Set<CampaignSegment>(['all', 'new', 'inactive', 'vip']);

export function clientCampaignSegment(
  facts: SegmentFacts,
  currentTime: Date = new Date(),
): ClientSegment {
  if (facts.completedVisits > 5) return 'vip';
  if (facts.lastCompletedDate) {
    const lastVisitMs = Date.parse(`${facts.lastCompletedDate}T12:00:00.000Z`);
    if (Number.isFinite(lastVisitMs) && currentTime.getTime() - lastVisitMs > 30 * DAY_MS) {
      return 'inactive';
    }
  }
  if (
    typeof facts.accountCreatedAtMs === 'number'
    && Number.isFinite(facts.accountCreatedAtMs)
    && currentTime.getTime() >= facts.accountCreatedAtMs
    && currentTime.getTime() - facts.accountCreatedAtMs <= 14 * DAY_MS
  ) return 'new';
  return 'active';
}

function timestampMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === 'function') {
      const parsed = toMillis.call(value);
      return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined;
    }
  }
  return undefined;
}

function visitTenant(value: RecordValue): string | undefined {
  if (typeof value.tenantId === 'string' && value.tenantId) return value.tenantId;
  if (
    value.ownerType === 'salon'
    && typeof value.ownerId === 'string'
    && value.locationId === value.ownerId
  ) return value.ownerId;
  return undefined;
}

function isCompletedVisit(value: RecordValue): boolean {
  return value.status === 'completed' || value.status === 'archived';
}

function parseCampaign(
  id: string,
  value: RecordValue,
  callerUid: string,
  associatedTenants: Set<string>,
  tenantSegments: Map<string, ClientSegment>,
): ClientCampaign | undefined {
  const targeted = Array.isArray(value.targetUserIds)
    && value.targetUserIds.every(userId => typeof userId === 'string')
    && value.targetUserIds.includes(callerUid);
  const segment = value.segment;
  if (
    value.status !== 'active'
    || typeof value.tenantId !== 'string'
    || typeof value.title !== 'string'
    || value.title.trim() === ''
    || value.title.length > 160
    || typeof value.description !== 'string'
    || value.description.trim() === ''
    || value.description.length > 2000
    || typeof segment !== 'string'
    || !CAMPAIGN_SEGMENTS.has(segment as CampaignSegment)
  ) return undefined;
  const computedSegment = tenantSegments.get(value.tenantId);
  if (
    !targeted
    && (
      !associatedTenants.has(value.tenantId)
      || (segment !== 'all' && segment !== computedSegment)
    )
  ) return undefined;
  const couponCode = typeof value.couponCode === 'string'
    && value.couponCode.trim() !== ''
    && value.couponCode.length <= 80
    ? value.couponCode.trim()
    : undefined;
  const discountAmount = typeof value.discountAmount === 'number'
    && Number.isFinite(value.discountAmount)
    && value.discountAmount >= 0
    && value.discountAmount <= 100
    ? value.discountAmount
    : undefined;
  return {
    id,
    tenantId: value.tenantId,
    title: value.title.trim(),
    description: value.description.trim(),
    segment: segment as CampaignSegment,
    ...(couponCode ? { couponCode } : {}),
    ...(discountAmount !== undefined ? { discountAmount } : {}),
  };
}

export async function listClientCampaigns(
  callerUid: string | null,
  value: unknown,
  firestore: Firestore = admin.firestore(),
  currentTime: Date = new Date(),
): Promise<ClientCampaign[]> {
  if (!callerUid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 0) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Campaign scope is derived from the authenticated account',
    );
  }

  const [profileSnapshot, legacyBookings, marketplaceBookings] = await Promise.all([
    firestore.collection('users').doc(callerUid).get(),
    firestore.collection('bookings').where('clientId', '==', callerUid).get(),
    firestore.collection('bookingRequests').where('clientId', '==', callerUid).get(),
  ]);
  const profile = profileSnapshot.data() as RecordValue | undefined;
  const accountCreatedAtMs = timestampMs(profile?.createdAt);
  const visitsByTenant = new Map<string, RecordValue[]>();
  for (const snapshot of [legacyBookings, marketplaceBookings]) {
    for (const document of snapshot.docs) {
      const visit = document.data() as RecordValue;
      if (visit.clientId !== callerUid) continue;
      const tenantId = visitTenant(visit);
      if (!tenantId) continue;
      visitsByTenant.set(tenantId, [...(visitsByTenant.get(tenantId) ?? []), visit]);
    }
  }
  const associatedTenantIds = [...visitsByTenant.keys()].sort();
  if (associatedTenantIds.length > MAX_ASSOCIATED_TENANTS) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Too many salon associations to load campaigns safely',
    );
  }
  const associatedTenants = new Set(associatedTenantIds);
  const tenantSegments = new Map(associatedTenantIds.map(tenantId => {
    const completed = (visitsByTenant.get(tenantId) ?? []).filter(isCompletedVisit);
    const completedDates = completed
      .map(visit => visit.date)
      .filter((date): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort();
    return [tenantId, clientCampaignSegment({
      completedVisits: completed.length,
      ...(completedDates.length > 0
        ? { lastCompletedDate: completedDates[completedDates.length - 1] }
        : {}),
      ...(accountCreatedAtMs !== undefined ? { accountCreatedAtMs } : {}),
    }, currentTime)];
  }));

  const campaignSnapshots = await Promise.all([
    firestore.collection('campaigns').where('targetUserIds', 'array-contains', callerUid).get(),
    ...associatedTenantIds.map(tenantId => (
      firestore.collection('campaigns').where('tenantId', '==', tenantId).get()
    )),
  ]);
  const candidates = new Map<string, RecordValue>();
  for (const snapshot of campaignSnapshots) {
    for (const document of snapshot.docs) candidates.set(document.id, document.data() as RecordValue);
  }
  if (candidates.size > 200) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Too many campaigns to load safely',
    );
  }
  return [...candidates.entries()]
    .flatMap(([id, campaign]) => {
      const parsed = parseCampaign(id, campaign, callerUid, associatedTenants, tenantSegments);
      return parsed ? [parsed] : [];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export const listClientCampaignsFunction = functions.https.onCall((data, context) => (
  listClientCampaigns(context.auth?.uid ?? null, data)
));
