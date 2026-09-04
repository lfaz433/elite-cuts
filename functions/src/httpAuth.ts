import * as admin from 'firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';

export interface FirebaseTokenRequest {
  headers?: Record<string, string | string[] | undefined>;
}

export async function verifyFirebaseIdToken(
  req: FirebaseTokenRequest,
): Promise<DecodedIdToken | null> {
  const value = req.headers?.authorization;
  const authorization = Array.isArray(value) ? value[0] : value;
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);

  if (!match) {
    return null;
  }

  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch {
    return null;
  }
}
