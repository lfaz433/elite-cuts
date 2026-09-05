import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { requireStagingRead, STAGING_PROJECT_ID } from './scripts/lib/staging-write-guard.mjs';

requireStagingRead(process.argv.slice(2), 'User inspection');
const firebaseApiKey = process.env.STAGING_FIREBASE_API_KEY;
if (!firebaseApiKey) throw new Error('STAGING_FIREBASE_API_KEY is required.');

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: `${STAGING_PROJECT_ID}.firebaseapp.com`,
  projectId: STAGING_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const inspect = async () => {
  console.log("--- USERS ---");
  const usersSnap = await getDocs(collection(db, "users"));
  usersSnap.forEach((doc) => {
    console.log(`${doc.id} => ${JSON.stringify(doc.data(), null, 2)}`);
  });

  console.log("\n--- BOOKINGS ---");
  const bookingsSnap = await getDocs(collection(db, "bookings"));
  bookingsSnap.forEach((doc) => {
    console.log(`${doc.id} => ${JSON.stringify(doc.data(), null, 2)}`);
  });

  process.exit(0);
};

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
