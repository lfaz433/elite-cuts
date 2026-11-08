import { signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase';

export async function ensureGuestBookingSession(): Promise<string> {
  await auth.authStateReady();
  if (auth.currentUser?.uid) return auth.currentUser.uid;
  const credential = await signInAnonymously(auth);
  return credential.user.uid;
}

export async function existingGuestBookingSession(): Promise<string | null> {
  await auth.authStateReady();
  return auth.currentUser?.uid ?? null;
}
