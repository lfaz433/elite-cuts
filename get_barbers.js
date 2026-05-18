import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB455BHQ7ZIAcO0jwXYbYuzlcvXKt2Qpx4",
  authDomain: "elite-cuts-app.firebaseapp.com",
  projectId: "elite-cuts-app",
  storageBucket: "elite-cuts-app.firebasestorage.app",
  messagingSenderId: "499181564992",
  appId: "1:499181564992:web:afc888388b72144ccc9ba5",
  measurementId: "G-QDWD7EKPM7"
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
