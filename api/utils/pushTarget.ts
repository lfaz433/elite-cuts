export interface PushTarget {
  recipientId: string;
  title: string;
  body: string;
  redirectUrl: string;
}

interface DocumentSnapshotLike {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

interface DocumentReferenceLike {
  collectionName?: string;
  id?: string;
}

interface FirestoreLike {
  collection(name: string): {
    doc(id: string): DocumentReferenceLike & {
      update?(value: Record<string, unknown>): Promise<unknown>;
    };
  };
  runTransaction<T>(callback: (transaction: {
    get(ref: DocumentReferenceLike): Promise<DocumentSnapshotLike>;
    update(ref: DocumentReferenceLike, value: Record<string, unknown>): void;
  }) => Promise<T>): Promise<T>;
}

export async function claimPushTarget(
  db: FirestoreLike,
  tenantId: string,
  notificationId: string,
): Promise<PushTarget> {
  const notificationRef = db.collection('notifications').doc(notificationId);

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(notificationRef);
    if (!snapshot.exists) {
      throw new Error('Push target not found');
    }

    const notification = snapshot.data();
    if (notification?.serverIssued !== true) {
      throw new Error('Push target is not server-issued');
    }
    if (notification.tenantId !== tenantId) {
      throw new Error('Push target does not belong to this tenant');
    }
    if (notification.deliveryClaimedAt !== undefined) {
      throw new Error('Push target was already claimed');
    }

    const recipientId = notification.recipientId;
    const recipientMembershipId = notification.recipientMembershipId;
    const locationId = notification.locationId ?? notification.tenantId;
    if (typeof recipientMembershipId === 'string' && recipientMembershipId) {
      const membershipRef = db.collection('memberships').doc(recipientMembershipId);
      const membershipSnapshot = await transaction.get(membershipRef);
      const membership = membershipSnapshot.data();
      if (
        !membershipSnapshot.exists
        || membership?.userId !== recipientId
        || membership?.brandId !== tenantId
        || membership?.locationId !== locationId
        || membership?.status !== 'active'
      ) {
        throw new Error('Push recipient is not associated with this tenant');
      }
    } else {
      const reservationId = notification.reservationId;
      if (typeof reservationId !== 'string' || !reservationId) {
        throw new Error('Push recipient is not associated with this tenant');
      }
      const bookingSnapshot = await transaction.get(db.collection('bookings').doc(reservationId));
      const booking = bookingSnapshot.data();
      if (
        !bookingSnapshot.exists
        || booking?.clientId !== recipientId
        || booking?.tenantId !== tenantId
        || (booking?.locationId ?? booking?.tenantId) !== locationId
      ) {
        throw new Error('Push recipient is not associated with this tenant');
      }
    }

    const title = notification.title;
    const body = notification.message;
    const requestedUrl = notification.redirectUrl;
    if (
      typeof recipientId !== 'string' || !recipientId.trim()
      || typeof title !== 'string' || !title.trim()
      || typeof body !== 'string' || !body.trim()
    ) {
      throw new Error('Push target delivery data is invalid');
    }

    const redirectUrl = typeof requestedUrl === 'string'
      && requestedUrl.startsWith('/')
      && !requestedUrl.startsWith('//')
      ? requestedUrl
      : '/';

    transaction.update(notificationRef, {
      deliveryStatus: 'sending',
      deliveryClaimedAt: Date.now(),
    });

    return { recipientId, title, body, redirectUrl };
  });
}

export async function recordPushDelivery(
  db: FirestoreLike,
  notificationId: string,
  status: 'sent' | 'failed',
): Promise<void> {
  const ref = db.collection('notifications').doc(notificationId);
  if (!ref.update) throw new Error('Push delivery record cannot be updated');
  await ref.update({ deliveryStatus: status, deliveryFinishedAt: Date.now() });
}
