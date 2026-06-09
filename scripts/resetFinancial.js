import fs from 'fs';
import { OAuth2Client } from 'google-auth-library';
import { Firestore } from '@google-cloud/firestore';

const cliConfig = JSON.parse(fs.readFileSync('/Users/mac/.config/configstore/firebase-tools.json', 'utf8'));
const accessToken = cliConfig.tokens.access_token;

const authClient = new OAuth2Client();
authClient.setCredentials({ access_token: accessToken });

const db = new Firestore({
  projectId: 'elite-cuts-app',
  authClient: authClient
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
