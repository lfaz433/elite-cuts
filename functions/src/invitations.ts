import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { locationMembershipId } from './memberships';

type InvitationRole = 'salon_admin' | 'worker' | 'chair_renter';
type JobRelationshipType = 'employee' | 'chair_rental';
type InvitationStatus = 'pending' | 'accepted' | 'declined';

interface PermissionMap {
  [key: string]: boolean;
}

interface LocationMembership {
  userId?: unknown;
  brandId?: unknown;
  locationId?: unknown;
  role?: unknown;
  status?: unknown;
  permissions?: unknown;
}

interface InvitationRecord {
  brandId: string;
  locationId: string;
  email: string;
  displayName: string;
  role: InvitationRole;
  permissions: PermissionMap;
  status: InvitationStatus;
  invitedBy: string;
  relationshipType?: JobRelationshipType;
  jobId?: string;
  applicationId?: string;
}

interface InvitationIdentity {
  uid: string;
  email?: string;
  emailVerified?: boolean;
}

interface CreateInvitationInput {
  locationId: string;
  email: string;
  displayName: string;
  role: InvitationRole;
}

interface RespondToInvitationInput {
  invitationId: string;
  accept: boolean;
}

interface RespondToInvitationResult {
  membershipId: string;
  status: 'active' | 'declined';
}

interface ExistingMembership {
  userId: string;
  brandId: string;
  locationId: string;
  role: string;
  status: 'pending' | 'active' | 'declined' | 'revoked';
  relationshipType?: JobRelationshipType;
}

const CREATE_INPUT_KEYS = new Set(['locationId', 'email', 'displayName', 'role']);
const RESPOND_INPUT_KEYS = new Set(['invitationId', 'accept']);

const SALON_ADMIN_PERMISSIONS: PermissionMap = {
  manageBookings: true,
  manageStaff: true,
  inviteWorkers: false,
  removeWorkers: false,
  manageServices: true,
  manageInventory: false,
  manageJobs: true,
};

const WORKER_PERMISSIONS: PermissionMap = {
  manageBookings: false,
  manageStaff: false,
  inviteWorkers: false,
  removeWorkers: false,
  manageServices: false,
  manageInventory: false,
  manageJobs: false,
};

function inputRecord(
  value: unknown,
  allowedKeys: Set<string>,
  description: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new functions.https.HttpsError('invalid-argument', `${description} is required`);
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !allowedKeys.has(key))) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Server-owned invitation fields cannot be supplied by the client',
    );
  }
  return input;
}

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > maxLength) {
    throw new functions.https.HttpsError('invalid-argument', `${field} is invalid`);
  }
  return value.trim();
}

function normalizeEmail(value: unknown): string {
  const email = requireText(value, 'email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new functions.https.HttpsError('invalid-argument', 'email is invalid');
  }
  return email;
}

function invitationPermissions(role: InvitationRole): PermissionMap {
  return role === 'salon_admin' ? SALON_ADMIN_PERMISSIONS : WORKER_PERMISSIONS;
}

export function membershipRelationshipForInvitation(
  invitation: Pick<InvitationRecord, 'role' | 'relationshipType'>,
): {
  role: InvitationRole;
  relationshipType?: JobRelationshipType;
  createsWorkerProfile: boolean;
} {
  if (invitation.relationshipType === undefined) {
    if (invitation.role === 'chair_renter') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Chair rental invitations require an independent relationship',
      );
    }
    return {
      role: invitation.role,
      createsWorkerProfile: invitation.role === 'worker',
    };
  }
  const expectedRole: InvitationRole = invitation.relationshipType === 'employee'
    ? 'worker'
    : 'chair_renter';
  if (invitation.role !== expectedRole) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Invitation role does not match its relationship type',
    );
  }
  return {
    role: invitation.role,
    relationshipType: invitation.relationshipType,
    createsWorkerProfile: invitation.relationshipType === 'employee',
  };
}

function parseCreateInput(value: unknown): CreateInvitationInput {
  const input = inputRecord(value, CREATE_INPUT_KEYS, 'Invitation data');
  if (input.role !== 'salon_admin' && input.role !== 'worker') {
    throw new functions.https.HttpsError('invalid-argument', 'role is invalid');
  }
  return {
    locationId: requireText(input.locationId, 'locationId', 128),
    email: normalizeEmail(input.email),
    displayName: requireText(input.displayName, 'displayName', 120),
    role: input.role,
  };
}

function parseRespondInput(value: unknown): RespondToInvitationInput {
  const input = inputRecord(value, RESPOND_INPUT_KEYS, 'Invitation response');
  if (typeof input.accept !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'accept must be a boolean');
  }
  return {
    invitationId: requireText(input.invitationId, 'invitationId', 128),
    accept: input.accept,
  };
}

function invitationRecord(value: admin.firestore.DocumentData | undefined): InvitationRecord | null {
  if (
    !value
    || typeof value.brandId !== 'string'
    || typeof value.locationId !== 'string'
    || typeof value.email !== 'string'
    || typeof value.displayName !== 'string'
    || (value.role !== 'salon_admin' && value.role !== 'worker' && value.role !== 'chair_renter')
    || !value.permissions
    || typeof value.permissions !== 'object'
    || (value.status !== 'pending' && value.status !== 'accepted' && value.status !== 'declined')
    || typeof value.invitedBy !== 'string'
    || (value.relationshipType !== undefined
      && value.relationshipType !== 'employee'
      && value.relationshipType !== 'chair_rental')
    || (value.jobId !== undefined && typeof value.jobId !== 'string')
    || (value.applicationId !== undefined && typeof value.applicationId !== 'string')
  ) return null;
  const invitation = value as InvitationRecord;
  try {
    membershipRelationshipForInvitation(invitation);
  } catch {
    return null;
  }
  return invitation;
}

function existingMembershipRecord(
  value: admin.firestore.DocumentData | undefined,
  decodedUid: string,
  invitation: InvitationRecord,
): ExistingMembership | null {
  if (
    !value
    || value.userId !== decodedUid
    || value.brandId !== invitation.brandId
    || value.locationId !== invitation.locationId
    || typeof value.role !== 'string'
    || !['pending', 'active', 'declined', 'revoked'].includes(value.status)
  ) return null;
  if (
    value.relationshipType !== undefined
    && value.relationshipType !== 'employee'
    && value.relationshipType !== 'chair_rental'
  ) return null;
  return value as ExistingMembership;
}

function workerBarberId(locationId: string, uid: string): string {
  return `${locationId}__${uid}`;
}

export function safeWorkerPublicProfile(
  invitation: InvitationRecord,
  uid: string,
) {
  return {
    name: invitation.displayName,
    email: invitation.email,
    userId: uid,
    uid,
    brandId: invitation.brandId,
    locationId: invitation.locationId,
    tenantId: invitation.locationId,
    publicCredentialSafe: true,
  };
}

export function assertInvitationSender(
  membership: LocationMembership | undefined,
  callerUid: string,
  brandId: string,
  locationId: string,
  targetRole: InvitationRole,
): void {
  if (
    !membership
    || membership.userId !== callerUid
    || membership.brandId !== brandId
    || membership.locationId !== locationId
    || membership.status !== 'active'
  ) {
    throw new functions.https.HttpsError('permission-denied', 'Permission denied');
  }
  const isPrincipal = membership.role === 'principal_admin';
  const permissions = membership.permissions as Record<string, unknown> | undefined;
  if (!isPrincipal && permissions?.inviteWorkers !== true) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Worker invitations are disabled for this administrator',
    );
  }
  if (targetRole === 'salon_admin' && !isPrincipal) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only a Principal Admin can invite a Salon Admin',
    );
  }
}

export function assertInvitationRecipient(
  invitation: Pick<InvitationRecord, 'email'>,
  decoded: InvitationIdentity,
): void {
  if (decoded.emailVerified !== true) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Invitation acceptance requires a verified email address',
    );
  }
  const decodedEmail = typeof decoded.email === 'string'
    ? decoded.email.trim().toLowerCase()
    : '';
  if (invitation.email !== decodedEmail) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Invitation belongs to a different account',
    );
  }
}

export async function createWorkerInvitation(
  callerUid: string,
  value: unknown,
  firestore: admin.firestore.Firestore = admin.firestore(),
): Promise<{ invitationId: string }> {
  if (!callerUid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }
  const input = parseCreateInput(value);
  const locationRef = firestore.collection('salonLocations').doc(input.locationId);
  const legacyTenantRef = firestore.collection('tenants').doc(input.locationId);
  const invitationRef = firestore.collection('invitations').doc();

  await firestore.runTransaction(async transaction => {
    const [locationSnapshot, legacyTenantSnapshot] = await transaction.getAll(
      locationRef,
      legacyTenantRef,
    );
    const location = locationSnapshot.data();
    const brandId = locationSnapshot.exists && typeof location?.brandId === 'string'
      ? location.brandId
      : legacyTenantSnapshot.exists
        ? input.locationId
        : null;
    if (!brandId) {
      throw new functions.https.HttpsError('not-found', 'Salon location not found');
    }
    const membershipRef = firestore.collection('memberships')
      .doc(locationMembershipId(brandId, input.locationId, callerUid));
    const legacyMembershipRef = firestore.collection('memberships')
      .doc(`${input.locationId}__${callerUid}`);
    const [membershipSnapshot, legacyMembershipSnapshot] = await transaction.getAll(
      membershipRef,
      legacyMembershipRef,
    );
    const senderMembership = membershipSnapshot.exists
      ? membershipSnapshot.data()
      : legacyMembershipSnapshot.exists
        ? legacyMembershipSnapshot.data()
        : undefined;
    assertInvitationSender(
      senderMembership,
      callerUid,
      brandId,
      input.locationId,
      input.role,
    );
    transaction.create(invitationRef, {
      brandId,
      locationId: input.locationId,
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      permissions: invitationPermissions(input.role),
      status: 'pending',
      invitedBy: callerUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { invitationId: invitationRef.id };
}

export async function respondToInvitation(
  decoded: InvitationIdentity,
  value: unknown,
  firestore: admin.firestore.Firestore = admin.firestore(),
): Promise<RespondToInvitationResult> {
  if (!decoded.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }
  const input = parseRespondInput(value);
  const invitationRef = firestore.collection('invitations').doc(input.invitationId);

  return firestore.runTransaction(async transaction => {
    const invitationSnapshot = await transaction.get(invitationRef);
    if (!invitationSnapshot.exists) {
      throw new functions.https.HttpsError('not-found', 'Invitation not found');
    }
    const invitation = invitationRecord(invitationSnapshot.data());
    if (!invitation) {
      throw new functions.https.HttpsError('failed-precondition', 'Invitation is invalid');
    }
    if (invitation.status !== 'pending') {
      throw new functions.https.HttpsError('failed-precondition', 'Invitation has already been answered');
    }
    assertInvitationRecipient(invitation, decoded);

    const membershipId = locationMembershipId(
      invitation.brandId,
      invitation.locationId,
      decoded.uid,
    );
    const respondedAt = admin.firestore.FieldValue.serverTimestamp();

    if (!input.accept) {
      transaction.update(invitationRef, {
        status: 'declined',
        respondedBy: decoded.uid,
        respondedAt,
      });
      return { membershipId, status: 'declined' as const };
    }

    const membershipRef = firestore.collection('memberships').doc(membershipId);
    const membershipSnapshot = await transaction.get(membershipRef);
    const membership = membershipSnapshot.exists
      ? existingMembershipRecord(membershipSnapshot.data(), decoded.uid, invitation)
      : null;
    if (membershipSnapshot.exists && !membership) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Existing membership does not match this invitation',
      );
    }

    const invitationRelationship = membershipRelationshipForInvitation(invitation);
    if (
      membership
      && invitation.relationshipType
      && (
        membership.role !== invitationRelationship.role
        || (membership.relationshipType !== undefined
          && membership.relationshipType !== invitation.relationshipType)
      )
    ) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Existing membership has a different relationship type',
      );
    }

    const effectiveRole = membership?.role ?? invitationRelationship.role;
    const isWorker = invitationRelationship.createsWorkerProfile
      && (effectiveRole === 'worker' || effectiveRole === 'barber');
    const barberId = isWorker ? workerBarberId(invitation.locationId, decoded.uid) : null;
    const barberRef = barberId ? firestore.collection('barbers').doc(barberId) : null;
    const barberSnapshot = barberRef ? await transaction.get(barberRef) : null;
    if (
      barberSnapshot?.exists
      && (
        barberSnapshot.data()?.userId !== decoded.uid
        || barberSnapshot.data()?.locationId !== invitation.locationId
      )
    ) {
      throw new functions.https.HttpsError('failed-precondition', 'Worker profile conflicts with this invitation');
    }
    if (barberRef) {
      transaction.set(
        barberRef,
        safeWorkerPublicProfile(invitation, decoded.uid),
      );
    }

    if (membership?.status === 'active') {
      transaction.update(membershipRef, {
        ...(barberId ? { barberId } : {}),
        ...(invitationRelationship.relationshipType
          ? { relationshipType: invitationRelationship.relationshipType }
          : {}),
      });
      transaction.update(invitationRef, {
        status: 'accepted',
        respondedBy: decoded.uid,
        respondedAt,
        membershipId,
        resolution: 'existing_active_membership',
      });
      return { membershipId, status: 'active' as const };
    }

    const membershipData = {
      userId: decoded.uid,
      brandId: invitation.brandId,
      locationId: invitation.locationId,
      role: invitationRelationship.role,
      status: 'active',
      permissions: invitation.permissions,
      invitationId: input.invitationId,
      displayName: invitation.displayName,
      email: invitation.email,
      invitedBy: invitation.invitedBy,
      createdAt: respondedAt,
      acceptedAt: respondedAt,
      ...(invitationRelationship.relationshipType
        ? { relationshipType: invitationRelationship.relationshipType }
        : {}),
      ...(barberId ? { barberId } : {}),
    };
    if (membership) {
      transaction.set(membershipRef, membershipData);
    } else {
      transaction.create(membershipRef, membershipData);
    }
    transaction.update(invitationRef, {
      status: 'accepted',
      respondedBy: decoded.uid,
      respondedAt,
      membershipId,
      resolution: membership ? 'reactivated_membership' : 'created_membership',
    });
    return { membershipId, status: 'active' as const };
  });
}

export const createWorkerInvitationFunction = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }
  return createWorkerInvitation(context.auth.uid, data);
});

export const respondToInvitationFunction = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  }
  return respondToInvitation({
    uid: context.auth.uid,
    email: typeof context.auth.token.email === 'string' ? context.auth.token.email : undefined,
    emailVerified: context.auth.token.email_verified === true,
  }, data);
});
