import { initializeApp, getApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { firebaseConfig } from './firebase';

/**
 * Creates a barber account in Firebase Auth using a secondary app instance.
 * This prevents the current Admin user from being logged out during the process.
 */
export const createBarberAccount = async (email: string, password: string) => {
  const appName = `SecondaryApp-${Date.now()}`;
  let secondaryApp;
  try {
    // 1. Initialize with unique name to avoid collisions
    secondaryApp = initializeApp(firebaseConfig, appName);
    const secondaryAuth = getAuth(secondaryApp);

    // 2. Wrap creation in a timeout to prevent infinite hanging
    let newUid: string | null = null;
    const creationPromise = (async () => {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      newUid = userCredential.user.uid;
      await signOut(secondaryAuth);
    })();

    await Promise.race([
      creationPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Auth Timeout")), 35000))
    ]);
    
    return { success: true, uid: newUid };
  } catch (error: any) {
    console.error("Error creating barber account:", error);
    throw error;
  } finally {
    // 3. Cleanup: Delete the secondary app instance
    if (secondaryApp) {
      try {
        await deleteApp(secondaryApp);
      } catch (err) {
        console.warn("Error deleting secondary app:", err);
      }
    }
  }
};
