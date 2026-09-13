import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireMembership } from './authz';

const INPUT_KEYS = new Set(['tenantId', 'info']);
const BUSINESS_INFO_KEYS = new Set([
  'name',
  'address',
  'phone',
  'email',
  'adminEmail',
  'hours',
  'weeklyHours',
  'socials',
  'instagram',
  'tiktok',
  'facebook',
  'website',
  'mapUrl',
  'latitude',
  'longitude',
  'logo',
  'heroImage',
  'heroTitle',
  'heroSubtitle',
  'heroButtonText',
  'showStatsSection',
  'stats',
  'timezone',
  'bookingPolicy',
]);
const STRING_FIELDS: ReadonlyArray<readonly [string, number]> = [
  ['name', 160],
  ['address', 500],
  ['phone', 80],
  ['email', 320],
  ['adminEmail', 320],
  ['instagram', 2_048],
  ['tiktok', 2_048],
  ['facebook', 2_048],
  ['website', 2_048],
  ['mapUrl', 2_048],
  ['logo', 900_000],
  ['heroImage', 900_000],
  ['heroTitle', 300],
  ['heroSubtitle', 4_000],
  ['heroButtonText', 160],
  ['timezone', 100],
];
const DAY_KEYS = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);
const CREDENTIAL_FIELD = /password|credential/i;

export interface BusinessInfoUpdateInput {
  tenantId: string;
  info: Record<string, unknown>;
}

type MembershipAuthorizer = (
  uid: string,
  locationId: string,
  permission: string,
) => Promise<{ id: string }>;

function invalid(message: string): never {
  throw new functions.https.HttpsError('invalid-argument', message);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid(`${field} is invalid`);
  }
  return value as Record<string, unknown>;
}

function assertKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  field: string,
): void {
  if (Object.keys(value).some(key => !allowed.has(key))) {
    invalid(`${field} contains a field that is not allowed`);
  }
}

function containsCredentialField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCredentialField);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => (
    CREDENTIAL_FIELD.test(key) || containsCredentialField(child)
  ));
}

function optionalString(
  input: Record<string, unknown>,
  key: string,
  maxLength: number,
  output: Record<string, unknown>,
): void {
  if (!(key in input)) return;
  const value = input[key];
  if (typeof value !== 'string' || value.length > maxLength) {
    invalid(`Business info ${key} is invalid`);
  }
  output[key] = value;
}

function parseHours(value: unknown): Record<string, string> {
  const input = record(value, 'Business info hours');
  assertKeys(input, new Set(['weekdays', 'weekends']), 'Business info hours');
  if (
    typeof input.weekdays !== 'string'
    || input.weekdays.length > 200
    || typeof input.weekends !== 'string'
    || input.weekends.length > 200
  ) {
    invalid('Business info hours are invalid');
  }
  return { weekdays: input.weekdays, weekends: input.weekends };
}

function parseWeeklyHours(value: unknown): Record<string, Record<string, unknown>> {
  const input = record(value, 'Business info weeklyHours');
  assertKeys(input, DAY_KEYS, 'Business info weeklyHours');
  const output: Record<string, Record<string, unknown>> = {};
  for (const [day, rawHours] of Object.entries(input)) {
    const hours = record(rawHours, `Business info weeklyHours.${day}`);
    assertKeys(
      hours,
      new Set(['isOpen', 'open', 'close']),
      `Business info weeklyHours.${day}`,
    );
    if (
      typeof hours.isOpen !== 'boolean'
      || typeof hours.open !== 'string'
      || hours.open.length > 16
      || typeof hours.close !== 'string'
      || hours.close.length > 16
    ) {
      invalid(`Business info weeklyHours.${day} is invalid`);
    }
    output[day] = { isOpen: hours.isOpen, open: hours.open, close: hours.close };
  }
  return output;
}

function parseSocials(value: unknown): Record<string, string> {
  const input = record(value, 'Business info socials');
  assertKeys(input, new Set(['instagram', 'facebook']), 'Business info socials');
  const output: Record<string, string> = {};
  for (const key of ['instagram', 'facebook']) {
    if (!(key in input)) continue;
    if (typeof input[key] !== 'string' || input[key].length > 2_048) {
      invalid(`Business info socials.${key} is invalid`);
    }
    output[key] = input[key] as string;
  }
  return output;
}

function parseStats(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length > 16) {
    return invalid('Business info stats are invalid');
  }
  return value.map((rawStat, index) => {
    const stat = record(rawStat, `Business info stats.${index}`);
    assertKeys(stat, new Set(['id', 'label', 'value', 'enabled']), `Business info stats.${index}`);
    if (
      typeof stat.id !== 'string'
      || stat.id.length > 100
      || typeof stat.label !== 'string'
      || stat.label.length > 200
      || typeof stat.value !== 'string'
      || stat.value.length > 100
      || typeof stat.enabled !== 'boolean'
    ) {
      invalid(`Business info stats.${index} is invalid`);
    }
    return { id: stat.id, label: stat.label, value: stat.value, enabled: stat.enabled };
  });
}

function parseBusinessInfo(value: unknown): Record<string, unknown> {
  const input = record(value, 'Business info');
  if (containsCredentialField(input)) {
    invalid('Credential fields are not allowed in public business info');
  }
  assertKeys(input, BUSINESS_INFO_KEYS, 'Business info');
  const output: Record<string, unknown> = {};
  for (const [key, maxLength] of STRING_FIELDS) {
    optionalString(input, key, maxLength, output);
  }
  if ('hours' in input) output.hours = parseHours(input.hours);
  if ('weeklyHours' in input) output.weeklyHours = parseWeeklyHours(input.weeklyHours);
  if ('socials' in input) output.socials = parseSocials(input.socials);
  if ('showStatsSection' in input) {
    if (typeof input.showStatsSection !== 'boolean') {
      invalid('Business info showStatsSection is invalid');
    }
    output.showStatsSection = input.showStatsSection;
  }
  if ('stats' in input) output.stats = parseStats(input.stats);
  if ('bookingPolicy' in input) {
    if (input.bookingPolicy !== 'manual' && input.bookingPolicy !== 'automatic') {
      invalid('Business info bookingPolicy is invalid');
    }
    output.bookingPolicy = input.bookingPolicy;
  }
  for (const [key, minimum, maximum] of [
    ['latitude', -90, 90],
    ['longitude', -180, 180],
  ] as const) {
    if (!(key in input)) continue;
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
      invalid(`Business info ${key} is invalid`);
    }
    output[key] = value;
  }
  if (JSON.stringify(output).length > 950_000) {
    invalid('Business info is too large');
  }
  return output;
}

export function parseBusinessInfoUpdate(value: unknown): BusinessInfoUpdateInput {
  const input = record(value, 'Business info update');
  if (containsCredentialField(input)) {
    invalid('Credential fields are not allowed in public business info');
  }
  assertKeys(input, INPUT_KEYS, 'Business info update');
  const tenantId = input.tenantId;
  if (
    typeof tenantId !== 'string'
    || tenantId.trim() === ''
    || tenantId.length > 256
    || tenantId.includes('/')
  ) {
    invalid('tenantId is invalid');
  }
  return { tenantId, info: parseBusinessInfo(input.info) };
}

export async function updateBusinessInfo(
  callerUid: string,
  value: unknown,
  firestore: admin.firestore.Firestore = admin.firestore(),
  authorize: MembershipAuthorizer = requireMembership,
): Promise<{ tenantId: string }> {
  const input = parseBusinessInfoUpdate(value);
  const authorizedMembership = await authorize(callerUid, input.tenantId, 'manageStaff');
  if (!authorizedMembership || typeof authorizedMembership.id !== 'string') {
    throw new functions.https.HttpsError('permission-denied', 'Permission denied');
  }

  const membershipRef = firestore.collection('memberships').doc(authorizedMembership.id);
  const tenantRef = firestore.collection('tenants').doc(input.tenantId);
  const businessInfoRef = tenantRef.collection('businessInfo').doc('info');
  await firestore.runTransaction(async transaction => {
    const [membershipSnapshot, tenantSnapshot] = await transaction.getAll(
      membershipRef,
      tenantRef,
    );
    const membership = membershipSnapshot.data();
    if (
      !membershipSnapshot.exists
      || membership?.userId !== callerUid
      || membership?.locationId !== input.tenantId
      || membership?.status !== 'active'
      || membership?.permissions?.manageStaff !== true
    ) {
      throw new functions.https.HttpsError('permission-denied', 'Permission denied');
    }
    if (!tenantSnapshot.exists) {
      throw new functions.https.HttpsError('failed-precondition', 'Location does not exist');
    }
    transaction.set(businessInfoRef, {
      ...input.info,
      publicCredentialSafe: true,
    });
  });

  return { tenantId: input.tenantId };
}

export const updateBusinessInfoFunction = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }
  return updateBusinessInfo(context.auth.uid, data);
});
