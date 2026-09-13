import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export type PermissionKey =
  | 'manageBookings'
  | 'manageStaff'
  | 'inviteWorkers'
  | 'removeWorkers'
  | 'manageServices'
  | 'manageInventory'
  | 'manageJobs';

type PermissionSet = Record<PermissionKey, boolean>;

const PERMISSION_KEYS: readonly PermissionKey[] = [
  'manageBookings',
  'manageStaff',
  'inviteWorkers',
  'removeWorkers',
  'manageServices',
  'manageInventory',
  'manageJobs',
];

const PRINCIPAL_ADMIN_PERMISSIONS: PermissionSet = {
  manageBookings: true,
  manageStaff: true,
  inviteWorkers: true,
  removeWorkers: true,
  manageServices: true,
  manageInventory: true,
  manageJobs: true,
};

const LOCATION_INPUT_KEYS = new Set([
  'brandId', 'name', 'city', 'countryCode', 'address', 'phone', 'timezone',
]);
const BRAND_BOOTSTRAP_INPUT_KEYS = new Set([
  'brandName', 'locationName', 'city', 'countryCode', 'address', 'phone', 'timezone',
]);
const PERMISSION_UPDATE_INPUT_KEYS = new Set(['membershipId', 'permissions']);

interface LocationInput {
  brandId: string;
  name: string;
  city: string;
  countryCode: string;
  address?: string;
  phone?: string;
  timezone?: string;
}

interface BrandBootstrapInput {
  brandName: string;
  locationName: string;
  city: string;
  countryCode: string;
  address?: string;
  phone?: string;
  timezone?: string;
}

interface BrandBootstrapResult {
  brandId: string;
  locationId: string;
  membershipId: string;
}

interface LocationCreationResult {
  locationId: string;
  membershipId: string;
}

interface PermissionUpdateInput {
  membershipId: string;
  permissions: PermissionSet;
}

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > maxLength) {
    throw new functions.https.HttpsError('invalid-argument', `${field} is invalid`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requireText(value, field, maxLength);
}

function inputRecord(value: unknown, allowedKeys: Set<string>): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'Location data is required');
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !allowedKeys.has(key))) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Server-owned membership fields cannot be supplied by the client',
    );
  }
  return input;
}

function parseLocationInput(value: unknown): LocationInput {
  const input = inputRecord(value, LOCATION_INPUT_KEYS);
  const countryCode = requireText(input.countryCode, 'countryCode', 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new functions.https.HttpsError('invalid-argument', 'countryCode is invalid');
  }
  return {
    brandId: requireText(input.brandId, 'brandId', 128),
    name: requireText(input.name, 'name', 120),
    city: requireText(input.city, 'city', 120),
    countryCode,
    address: optionalText(input.address, 'address', 300),
    phone: optionalText(input.phone, 'phone', 40),
    timezone: optionalText(input.timezone, 'timezone', 100),
  };
}

function parseBrandBootstrapInput(value: unknown): BrandBootstrapInput {
  const input = inputRecord(value, BRAND_BOOTSTRAP_INPUT_KEYS);
  const countryCode = requireText(input.countryCode, 'countryCode', 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new functions.https.HttpsError('invalid-argument', 'countryCode is invalid');
  }
  return {
    brandName: requireText(input.brandName, 'brandName', 120),
    locationName: requireText(input.locationName, 'locationName', 120),
    city: requireText(input.city, 'city', 120),
    countryCode,
    address: optionalText(input.address, 'address', 300),
    phone: optionalText(input.phone, 'phone', 40),
    timezone: optionalText(input.timezone, 'timezone', 100),
  };
}

function parsePermissionUpdateInput(value: unknown): PermissionUpdateInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'Permission update is required');
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !PERMISSION_UPDATE_INPUT_KEYS.has(key))) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Only membership permissions may be updated',
    );
  }
  if (!input.permissions || typeof input.permissions !== 'object' || Array.isArray(input.permissions)) {
    throw new functions.https.HttpsError('invalid-argument', 'permissions are invalid');
  }
  const permissions = input.permissions as Record<string, unknown>;
  if (
    Object.keys(permissions).length !== PERMISSION_KEYS.length
    || Object.keys(permissions).some(key => !PERMISSION_KEYS.includes(key as PermissionKey))
    || PERMISSION_KEYS.some(key => typeof permissions[key] !== 'boolean')
  ) {
    throw new functions.https.HttpsError('invalid-argument', 'permissions are invalid');
  }
  return {
    membershipId: requireText(input.membershipId, 'membershipId', 384),
    permissions: { ...permissions } as PermissionSet,
  };
}

export function brandPrincipalMembershipId(brandId: string, userId: string): string {
  return `${brandId}__principal__${userId}`;
}

export function locationMembershipId(brandId: string, locationId: string, userId: string): string {
  return `${brandId}__${locationId}__${userId}`;
}

function principalMembership(brandId: string, userId: string, createdAt: unknown) {
  return {
    userId,
    brandId,
    role: 'principal_admin',
    status: 'active',
    permissions: PRINCIPAL_ADMIN_PERMISSIONS,
    createdAt,
  };
}

function principalLocationMembership(
  brandId: string,
  locationId: string,
  userId: string,
  createdAt: unknown,
) {
  return {
    ...principalMembership(brandId, userId, createdAt),
    locationId,
  };
}

function locationRecord(input: Omit<LocationInput, 'brandId'>, createdAt: unknown) {
  return {
    name: input.name,
    city: input.city,
    countryCode: input.countryCode,
    ...(input.address ? { address: input.address } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.timezone ? { timezone: input.timezone } : {}),
    createdAt,
  };
}

function tenantBridgeRecord(
  brandId: string,
  input: Omit<LocationInput, 'brandId'>,
  ownerUid: string,
  createdAt: unknown,
) {
  return {
    brandId,
    name: input.name,
    city: input.city,
    countryCode: input.countryCode,
    ...(input.address ? { address: input.address } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.timezone ? { timezone: input.timezone } : {}),
    ownerUid,
    onboardingComplete: true,
    subscription: { status: 'trialing', planId: 'pro' },
    branding: { primaryColor: '#D4AF37', logoUrl: '', businessName: input.name },
    settings: { maxBarbersLimit: 999, allowOnlineBooking: true, bookingPolicy: 'manual' },
    createdAt,
  };
}

export async function bootstrapBrandOwner(
  callerUid: string,
  value: unknown,
  firestore: admin.firestore.Firestore = admin.firestore(),
): Promise<BrandBootstrapResult> {
  if (!callerUid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }
  const input = parseBrandBootstrapInput(value);
  const brandRef = firestore.collection('brands').doc();
  const locationRef = firestore.collection('salonLocations').doc();
  const tenantBridgeRef = firestore.collection('tenants').doc(locationRef.id);
  const brandMembershipRef = firestore.collection('memberships')
    .doc(brandPrincipalMembershipId(brandRef.id, callerUid));
  const locationMembershipRef = firestore.collection('memberships')
    .doc(locationMembershipId(brandRef.id, locationRef.id, callerUid));
  const createdAt = admin.firestore.FieldValue.serverTimestamp();

  await firestore.runTransaction(async transaction => {
    transaction.create(brandRef, { name: input.brandName, ownerUid: callerUid, createdAt });
    transaction.create(locationRef, {
      brandId: brandRef.id,
      ...locationRecord({
        name: input.locationName,
        city: input.city,
        countryCode: input.countryCode,
        address: input.address,
        phone: input.phone,
        timezone: input.timezone,
      }, createdAt),
    });
    transaction.create(tenantBridgeRef, tenantBridgeRecord(
      brandRef.id,
      {
        name: input.locationName,
        city: input.city,
        countryCode: input.countryCode,
        address: input.address,
        phone: input.phone,
        timezone: input.timezone,
      },
      callerUid,
      createdAt,
    ));
    transaction.create(brandMembershipRef, principalMembership(brandRef.id, callerUid, createdAt));
    transaction.create(
      locationMembershipRef,
      principalLocationMembership(brandRef.id, locationRef.id, callerUid, createdAt),
    );
  });

  return { brandId: brandRef.id, locationId: locationRef.id, membershipId: locationMembershipRef.id };
}

export async function createSalonLocation(
  callerUid: string,
  value: unknown,
  firestore: admin.firestore.Firestore = admin.firestore(),
): Promise<LocationCreationResult> {
  if (!callerUid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }
  const input = parseLocationInput(value);
  const brandRef = firestore.collection('brands').doc(input.brandId);
  const callerMembershipRef = firestore.collection('memberships')
    .doc(brandPrincipalMembershipId(input.brandId, callerUid));
  const locationRef = firestore.collection('salonLocations').doc();
  const tenantBridgeRef = firestore.collection('tenants').doc(locationRef.id);
  const locationMembershipRef = firestore.collection('memberships')
    .doc(locationMembershipId(input.brandId, locationRef.id, callerUid));
  const createdAt = admin.firestore.FieldValue.serverTimestamp();

  await firestore.runTransaction(async transaction => {
    const [brand, callerMembership] = await Promise.all([
      transaction.get(brandRef),
      transaction.get(callerMembershipRef),
    ]);
    if (!brand.exists) {
      throw new functions.https.HttpsError('not-found', 'Brand not found');
    }
    const membership = callerMembership.data();
    if (
      !callerMembership.exists
      || membership?.userId !== callerUid
      || membership?.brandId !== input.brandId
      || membership?.role !== 'principal_admin'
      || membership?.status !== 'active'
    ) {
      throw new functions.https.HttpsError('permission-denied', 'Only a Principal Admin can create locations');
    }
    transaction.create(locationRef, {
      brandId: input.brandId,
      ...locationRecord(input, createdAt),
    });
    transaction.create(tenantBridgeRef, tenantBridgeRecord(
      input.brandId,
      input,
      callerUid,
      createdAt,
    ));
    transaction.create(
      locationMembershipRef,
      principalLocationMembership(input.brandId, locationRef.id, callerUid, createdAt),
    );
  });

  return { locationId: locationRef.id, membershipId: locationMembershipRef.id };
}

export async function updateMembershipPermissions(
  callerUid: string,
  value: unknown,
  firestore: admin.firestore.Firestore = admin.firestore(),
): Promise<{ membershipId: string; permissions: PermissionSet }> {
  if (!callerUid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }
  const input = parsePermissionUpdateInput(value);
  const targetRef = firestore.collection('memberships').doc(input.membershipId);
  const auditRef = firestore.collection('auditEvents').doc();

  await firestore.runTransaction(async transaction => {
    const [targetSnapshot] = await transaction.getAll(targetRef);
    const target = targetSnapshot.data();
    if (
      !targetSnapshot.exists
      || typeof target?.userId !== 'string'
      || typeof target?.brandId !== 'string'
      || typeof target?.locationId !== 'string'
      || target?.role !== 'salon_admin'
      || target?.status !== 'active'
      || !target?.permissions
      || typeof target.permissions !== 'object'
    ) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Only an active Salon Admin membership can be updated',
      );
    }

    const callerRef = firestore.collection('memberships')
      .doc(brandPrincipalMembershipId(target.brandId, callerUid));
    const locationRef = firestore.collection('salonLocations').doc(target.locationId);
    const [callerSnapshot, locationSnapshot] = await transaction.getAll(callerRef, locationRef);
    const caller = callerSnapshot.data();
    const location = locationSnapshot.data();
    if (
      !callerSnapshot.exists
      || caller?.userId !== callerUid
      || caller?.brandId !== target.brandId
      || caller?.role !== 'principal_admin'
      || caller?.status !== 'active'
    ) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only a Principal Admin can change membership permissions',
      );
    }
    if (!locationSnapshot.exists || location?.brandId !== target.brandId) {
      throw new functions.https.HttpsError('permission-denied', 'Membership location is outside this brand');
    }

    const changedAt = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(targetRef, {
      permissions: input.permissions,
      updatedAt: changedAt,
      updatedBy: callerUid,
    });
    transaction.create(auditRef, {
      action: 'MEMBERSHIP_PERMISSIONS_UPDATED',
      actorUid: callerUid,
      brandId: target.brandId,
      locationId: target.locationId,
      targetMembershipId: input.membershipId,
      targetUserId: target.userId,
      before: { permissions: target.permissions },
      after: { permissions: input.permissions },
      createdAt: changedAt,
    });
  });

  return { membershipId: input.membershipId, permissions: input.permissions };
}

export const bootstrapBrandOwnerFunction = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }
  return bootstrapBrandOwner(context.auth.uid, data);
});

export const createSalonLocationFunction = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }
  return createSalonLocation(context.auth.uid, data);
});

export const updateMembershipPermissionsFunction = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }
  return updateMembershipPermissions(context.auth.uid, data);
});
