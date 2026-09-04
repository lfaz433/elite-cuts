import * as admin from 'firebase-admin';

export interface PushRecipientAssociation {
  sourceAlias: string;
  userId: string;
  membershipId: string;
}

export async function resolvePushRecipient(
  firestore: admin.firestore.Firestore,
  locationId: string,
  sourceAlias: unknown,
  sourceKind: 'client' | 'barber',
): Promise<PushRecipientAssociation | null> {
  if (typeof sourceAlias !== 'string' || !sourceAlias.trim()) return null;

  let userId = sourceAlias;
  if (sourceKind === 'barber') {
    const barber = await firestore.collection('barbers').doc(sourceAlias).get();
    const barberData = barber.data();
    const barberLocation = barberData?.locationId ?? barberData?.tenantId;
    const associatedUid = barberData?.userId ?? barberData?.uid;
    if (!barber.exists || barberLocation !== locationId || typeof associatedUid !== 'string') {
      return null;
    }
    userId = associatedUid;
  }

  const membership = await firestore.collection('memberships')
    .where('userId', '==', userId)
    .where('locationId', '==', locationId)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (membership.empty) return null;

  return {
    sourceAlias,
    userId,
    membershipId: membership.docs[0].id,
  };
}
