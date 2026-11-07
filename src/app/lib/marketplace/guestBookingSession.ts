import { signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase';

export async function ensureGuestBookingSession(): Promise<string> {
  if (auth.currentUser?.uid) return auth.currentUser.uid;
  const credential = await signInAnonymously(auth);
  return credential.user.uid;
}
