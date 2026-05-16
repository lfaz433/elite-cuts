import { initializeApp, getApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { firebaseConfig } from './firebase';

/**
 * Creates a barber account in Firebase Auth using a secondary app instance.
 * This prevents the current Admin user from being logged out during the process.
 */
export const createBarberAccount = async (email: string, password: string) => {
  let secondaryApp;
  try {
    // 1. Initialize a temporary secondary app
    secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp');
    const secondaryAuth = getAuth(secondaryApp);

    // 2. Create the user
    await createUserWithEmailAndPassword(secondaryAuth, email, password);
    
    // 3. Sign out of the secondary app immediately
    await signOut(secondaryAuth);
    
    return { success: true };
  } catch (error: any) {
    console.error("Error creating barber account:", error);
    throw error;
  } finally {
    // 4. Cleanup: Delete the secondary app instance
    if (secondaryApp) {
      await deleteApp(secondaryApp);
    }
  }
};
