import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { requireStagingRead, STAGING_PROJECT_ID } from './scripts/lib/staging-write-guard.mjs';

requireStagingRead(process.argv.slice(2), 'Barber inspection');
const firebaseApiKey = process.env.STAGING_FIREBASE_API_KEY;
if (!firebaseApiKey) throw new Error('STAGING_FIREBASE_API_KEY is required.');

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: `${STAGING_PROJECT_ID}.firebaseapp.com`,
  projectId: STAGING_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const getBarbers = async () => {
  const querySnapshot = await getDocs(collection(db, "barbers"));
  querySnapshot.forEach((doc) => {
    console.log(`${doc.id} => ${JSON.stringify(doc.data(), null, 2)}`);
  });
  process.exit(0);
};

getBarbers().catch(err => {
  console.error(err);
  process.exit(1);
});
