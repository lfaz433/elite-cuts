import type { User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

export interface MembershipSummary {
  id: string;
  userId: string;
  brandId: string;
  locationId?: string;
  role: string;
  status: 'active';
  permissions: Record<string, boolean>;
  barberId?: string;
}

export interface SessionUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  memberships: MembershipSummary[];
}

interface MembershipCandidate {
  id: string;
  userId?: unknown;
  brandId?: unknown;
  locationId?: unknown;
  role?: unknown;
  status?: unknown;
  permissions?: unknown;
  barberId?: unknown;
}

function isPermissionMap(value: unknown): value is Record<string, boolean> {
  return typeof value === 'object'
    && value !== null
    && Object.values(value).every((permission) => typeof permission === 'boolean');
}

export async function loadSessionUser(firebaseUser: FirebaseUser): Promise<SessionUser> {
  const [profileDocument, membershipSnapshot] = await Promise.all([
    getDoc(doc(db, 'users', firebaseUser.uid)),
    getDocs(query(
      collection(db, 'memberships'),
      where('userId', '==', firebaseUser.uid),
      where('status', '==', 'active'),
    )),
  ]);

  const profile = profileDocument.exists() ? profileDocument.data() : {};
  const memberships = membershipSnapshot.docs
    .map((membershipDocument): MembershipCandidate => {
      const membership = membershipDocument.data();
      return {
        id: membershipDocument.id,
        userId: membership.userId,
        brandId: membership.brandId,
        locationId: membership.locationId,
        role: membership.role,
        status: membership.status,
        permissions: membership.permissions,
        barberId: membership.barberId,
      };
    })
    .filter((membership): membership is MembershipSummary => (
      membership.userId === firebaseUser.uid
      && membership.status === 'active'
      && typeof membership.brandId === 'string'
      && (membership.locationId === undefined || typeof membership.locationId === 'string')
      && typeof membership.role === 'string'
      && isPermissionMap(membership.permissions)
      && (membership.barberId === undefined || typeof membership.barberId === 'string')
    ));

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email?.trim().toLowerCase() ?? '',
    emailVerified: firebaseUser.emailVerified,
    displayName: typeof profile.displayName === 'string'
      ? profile.displayName
      : typeof profile.name === 'string'
        ? profile.name
        : firebaseUser.displayName ?? '',
    memberships,
  };
}
