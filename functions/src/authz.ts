import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export interface Membership {
  id: string;
  userId: string;
  brandId: string;
  locationId: string;
  role: string;
  status: string;
  permissions: Record<string, boolean>;
}

export async function requireMembership(
  uid: string,
  locationId: string,
  permission: string,
): Promise<Membership> {
  const snapshot = await admin.firestore()
    .collection('memberships')
    .where('userId', '==', uid)
    .where('locationId', '==', locationId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new functions.https.HttpsError('permission-denied', 'Permission denied');
  }

  const membershipDocument = snapshot.docs[0];
  const membership = membershipDocument.data() as Omit<Membership, 'id'>;

  if (membership.permissions?.[permission] !== true) {
    throw new functions.https.HttpsError('permission-denied', 'Permission denied');
  }

  return { id: membershipDocument.id, ...membership };
}
