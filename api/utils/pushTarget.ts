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

interface FirestoreLike {
  collection(name: string): {
    doc(id: string): { get(): Promise<DocumentSnapshotLike> };
  };
}

export async function resolvePushTarget(
  db: FirestoreLike,
  tenantId: string,
  notificationId: string,
): Promise<PushTarget> {
  const snapshot = await db.collection('notifications').doc(notificationId).get();
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

  const recipientId = notification.recipientId;
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

  return { recipientId, title, body, redirectUrl };
}
