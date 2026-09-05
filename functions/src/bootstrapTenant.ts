import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

type PlanId = 'basic' | 'pro' | 'enterprise';

interface BootstrapTenantInput {
  subdomain: string;
  shopName: string;
  shopPhone?: string;
  shopAddress?: string;
  planId: PlanId;
}

interface BootstrapTenantResult {
  tenantId: string;
  locationId: string;
  membershipId: string;
}

const allowedInputKeys = new Set([
  'subdomain',
  'shopName',
  'shopPhone',
  'shopAddress',
  'planId',
]);

const reservedSubdomains = new Set([
  'www', 'app', 'api', 'admin', 'superadmin', 'super-admin',
  'dashboard', 'billing', 'register', 'login', 'auth', 'mail',
  'ftp', 'cdn', 'assets', 'static', 'demo', 'barberboard-demo',
  'status', 'docs', 'support', 'help', 'blog', 'staging', 'test',
  'localhost', 'barberboard', 'elite-cuts',
]);

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > maxLength) {
    throw new functions.https.HttpsError('invalid-argument', `${field} is invalid`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string, maxLength: number): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  return requireText(value, field, maxLength);
}

function parseInput(value: unknown): BootstrapTenantInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', 'Registration data is required');
  }

  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !allowedInputKeys.has(key))) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Server-owned registration fields cannot be supplied by the client',
    );
  }

  const subdomain = requireText(input.subdomain, 'subdomain', 63).toLowerCase();
  if (
    !/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(subdomain) ||
    subdomain.includes('--') ||
    reservedSubdomains.has(subdomain)
  ) {
    throw new functions.https.HttpsError('invalid-argument', 'subdomain is invalid or reserved');
  }

  if (input.planId !== 'basic' && input.planId !== 'pro' && input.planId !== 'enterprise') {
    throw new functions.https.HttpsError('invalid-argument', 'planId is invalid');
  }

  return {
    subdomain,
    shopName: requireText(input.shopName, 'shopName', 120),
    shopPhone: optionalText(input.shopPhone, 'shopPhone', 40),
    shopAddress: optionalText(input.shopAddress, 'shopAddress', 300),
    planId: input.planId,
  };
}

export async function bootstrapTenantOwner(
  callerUid: string,
  value: unknown,
  firestore: admin.firestore.Firestore = admin.firestore(),
): Promise<BootstrapTenantResult> {
  if (!callerUid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }

  const input = parseInput(value);
  const tenantRef = firestore.collection('tenants').doc();
  const subdomainRef = firestore.collection('subdomains').doc(input.subdomain);
  const membershipRef = firestore.collection('memberships').doc(`${tenantRef.id}__${callerUid}`);
  const createdAt = admin.firestore.FieldValue.serverTimestamp();

  await firestore.runTransaction(async transaction => {
    const reservation = await transaction.get(subdomainRef);
    if (reservation.exists) {
      throw new functions.https.HttpsError('already-exists', 'Subdomain is already reserved');
    }

    transaction.create(subdomainRef, {
      ownerUid: callerUid,
      tenantId: tenantRef.id,
      createdAt,
    });
    transaction.create(tenantRef, {
      subdomain: input.subdomain,
      domain: {
        subdomain: input.subdomain,
        status: 'pending',
        vercelVerified: false,
      },
      name: input.shopName,
      phone: input.shopPhone,
      address: input.shopAddress,
      ownerUid: callerUid,
      onboardingComplete: true,
      subscription: {
        status: 'trialing',
        planId: input.planId,
        trialEndsAt: Date.now() + 15 * 24 * 60 * 60 * 1000,
      },
      branding: {
        primaryColor: '#D4AF37',
        logoUrl: '',
        businessName: input.shopName,
      },
      settings: {
        maxBarbersLimit: input.planId === 'basic' ? 2 : input.planId === 'pro' ? 8 : 999,
        allowOnlineBooking: true,
      },
      createdAt,
    });
    transaction.create(membershipRef, {
      userId: callerUid,
      brandId: tenantRef.id,
      locationId: tenantRef.id,
      role: 'principal_admin',
      status: 'active',
      permissions: {
        manageBilling: true,
        manageBookings: true,
        manageStaff: true,
      },
      createdAt,
    });
  });

  return {
    tenantId: tenantRef.id,
    locationId: tenantRef.id,
    membershipId: membershipRef.id,
  };
}

export const bootstrapTenantOwnerFunction = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }

  return bootstrapTenantOwner(context.auth.uid, data);
});
