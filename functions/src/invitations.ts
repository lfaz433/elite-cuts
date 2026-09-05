import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { locationMembershipId } from './memberships';

type InvitationRole = 'salon_admin' | 'worker';
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
}

interface InvitationIdentity {
  uid: string;
  email?: string;
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
    || (value.role !== 'salon_admin' && value.role !== 'worker')
    || !value.permissions
    || typeof value.permissions !== 'object'
    || (value.status !== 'pending' && value.status !== 'accepted' && value.status !== 'declined')
    || typeof value.invitedBy !== 'string'
  ) return null;
  return value as InvitationRecord;
}

export function assertInvitationSender(
  membership: LocationMembership | undefined,
  callerUid: string,
  brandId: string,
  locationId: string,
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
  const permissions = membership.permissions as Record<string, unknown> | undefined;
  if (permissions?.inviteWorkers !== true) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Worker invitations are disabled for this administrator',
    );
  }
}

export function assertInvitationRecipient(
  invitation: Pick<InvitationRecord, 'email'>,
  decoded: InvitationIdentity,
): void {
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
  const invitationRef = firestore.collection('invitations').doc();

  await firestore.runTransaction(async transaction => {
    const locationSnapshot = await transaction.get(locationRef);
    const location = locationSnapshot.data();
    if (!locationSnapshot.exists || typeof location?.brandId !== 'string') {
      throw new functions.https.HttpsError('not-found', 'Salon location not found');
    }
    const membershipRef = firestore.collection('memberships')
      .doc(locationMembershipId(location.brandId, input.locationId, callerUid));
    const membershipSnapshot = await transaction.get(membershipRef);
    assertInvitationSender(
      membershipSnapshot.exists ? membershipSnapshot.data() : undefined,
      callerUid,
      location.brandId,
      input.locationId,
    );
    transaction.create(invitationRef, {
      brandId: location.brandId,
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
    transaction.create(membershipRef, {
      userId: decoded.uid,
      brandId: invitation.brandId,
      locationId: invitation.locationId,
      role: invitation.role,
      status: 'active',
      permissions: invitation.permissions,
      invitationId: input.invitationId,
      displayName: invitation.displayName,
      email: invitation.email,
      invitedBy: invitation.invitedBy,
      createdAt: respondedAt,
      acceptedAt: respondedAt,
    });
    transaction.update(invitationRef, {
      status: 'accepted',
      respondedBy: decoded.uid,
      respondedAt,
      membershipId,
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
  }, data);
});
