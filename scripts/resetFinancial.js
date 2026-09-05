import { Firestore } from '@google-cloud/firestore';
import { requireStagingWrite, STAGING_PROJECT_ID } from './lib/staging-write-guard.mjs';

if (!requireStagingWrite(process.argv.slice(2), process.env, 'Financial reset')) process.exit(0);

const db = new Firestore({
  projectId: STAGING_PROJECT_ID,
});

const TENANT_ID = 'barberboard-demo';
const collections = [
  'bookings',
  'sales', 
  'expenses',
  'deposits',
  'payroll_requests',
  'payroll_payments',
  'notifications'
];

async function deleteAll() {
  let hasErrors = false;
  console.log(`\n🧹 Processing tenant: ${TENANT_ID}...`);
  for (const col of collections) {
    try {
      const snapshot = await db.collection(col)
        .where('tenantId', '==', TENANT_ID)
        .get();
      
      if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`✅ Deleted ${snapshot.docs.length} docs from ${col}`);
      } else {
        console.log(`ℹ️ No docs found in ${col}`);
      }
    } catch (err) {
      console.error(`❌ Error deleting ${col}:`, err);
      hasErrors = true;
    }
  }

  // Verification step
  console.log('\n🔍 Verifying all collections are 0...');
  for (const col of collections) {
    try {
      const snapshot = await db.collection(col)
        .where('tenantId', '==', TENANT_ID)
        .get();
      
      console.log(`  - ${col}: ${snapshot.size} documents remaining`);
      if (snapshot.size > 0) hasErrors = true;
    } catch (err) {
      console.error(`  - ${col}: Error verifying - ${err.message}`);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.log('\n⚠️ Completed with errors or remaining documents.');
  } else {
    console.log('\n🎉 All financial data reset to 0');
  }
}

deleteAll();
