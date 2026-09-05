import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { VercelRequest } from '@vercel/node';

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();

if (!projectId) {
  throw new Error('FIREBASE_PROJECT_ID is required for Firebase Admin.');
}

// Initialize the app only once
if (!getApps().length) {
  let credential;

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      if (serviceAccount.project_id && serviceAccount.project_id !== projectId) {
        throw new Error('Firebase service account project does not match FIREBASE_PROJECT_ID.');
      }
      credential = cert(serviceAccount);
    } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      credential = cert({
        projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
    }
  } catch (error) {
    throw new Error('Could not initialize Firebase Admin credentials.', { cause: error });
  }

  initializeApp({
    projectId,
    ...(credential ? { credential } : {})
  });
}

export const adminAuth = getAuth();
export const adminDb = getFirestore();

export async function verifyFirebaseIdToken(
  req: Pick<VercelRequest, 'headers'>,
): Promise<DecodedIdToken | null> {
  const value = req.headers.authorization;
  const authorization = Array.isArray(value) ? value[0] : value;
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);

  if (!match) {
    return null;
  }

  try {
    return await adminAuth.verifyIdToken(match[1]);
  } catch {
    return null;
  }
}

export async function hasMembershipPermission(
  uid: string,
  locationId: string,
  permission: string,
): Promise<boolean> {
  const snapshot = await adminDb.collection('memberships')
    .where('userId', '==', uid)
    .where('locationId', '==', locationId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  return !snapshot.empty && snapshot.docs[0].data().permissions?.[permission] === true;
}
