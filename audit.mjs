import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, limit } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB455BHQ7ZIAcO0jwXYbYuzlcvXKt2Qpx4",
  projectId: "elite-cuts-app",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    const q = query(
      collection(db, "bookings"),
      where("tenantId", "==", "barbeboard-demo"),
      where("status", "==", "completed"),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      console.log("No completed booking found for barbeboard-demo");
    } else {
      const doc = snapshot.docs[0];
      console.log("Found booking:", doc.id);
      console.log(JSON.stringify(doc.data(), null, 2));
      
      const salesQ = query(
        collection(db, "sales"),
        where("bookingId", "==", doc.id)
      );
      const salesSnap = await getDocs(salesQ);
      if (salesSnap.empty) {
        console.log("No sale document found for this booking");
      } else {
        console.log("Found sale:", salesSnap.docs[0].id);
        console.log(JSON.stringify(salesSnap.docs[0].data(), null, 2));
      }
    }
  } catch (err) {
    console.error("Error querying:", err);
  }
}
run();
