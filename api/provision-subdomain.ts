import { VercelRequest, VercelResponse } from '@vercel/node';
import { DocumentReference, FieldValue } from 'firebase-admin/firestore';
import { adminDb, verifyFirebaseIdToken } from './utils/firebaseAdmin.js';

// Validation regex directly matching the shared validator
const subdomainRegex = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;
const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'admin', 'superadmin', 'super-admin', 
  'dashboard', 'billing', 'register', 'login', 'auth', 'mail', 
  'ftp', 'cdn', 'assets', 'static', 'demo', 'barberboard-demo', 
  'status', 'docs', 'support', 'help', 'blog', 'staging', 'test',
  'localhost', 'barberboard', 'elite-cuts'
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const decodedToken = await verifyFirebaseIdToken(req);
  if (!decodedToken) {
    return res.status(401).json({ error: 'Unauthorized: Token verification failed' });
  }

  const { subdomain, tenantId } = req.body;
  if (!subdomain || !tenantId) {
    return res.status(400).json({ error: 'Missing required fields: subdomain or tenantId' });
  }

  // Server-side Subdomain Validation
  if (!subdomainRegex.test(subdomain) || subdomain.includes('--') || RESERVED_SUBDOMAINS.has(subdomain)) {
    return res.status(400).json({ error: 'Invalid or reserved subdomain' });
  }

  let tenantRef: DocumentReference;
  try {
    tenantRef = adminDb.collection('tenants').doc(tenantId);
    const tenantSnapshot = await tenantRef.get();
    if (!tenantSnapshot.exists) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const tenantData = tenantSnapshot.data();
    const ownerUid = tenantData?.ownerUid;
    const isPlatformAdmin = decodedToken.superadmin === true || decodedToken.platformAdmin === true;
    if (!isPlatformAdmin && ownerUid !== decodedToken.uid) {
      return res.status(403).json({ error: 'Forbidden: You do not own this tenant' });
    }
    if (tenantData?.subdomain !== subdomain) {
      return res.status(409).json({ error: 'Subdomain does not belong to this tenant' });
    }
  } catch (err) {
    console.error('Tenant verification failed:', err);
    return res.status(500).json({ error: 'Internal server error during validation' });
  }

  const VERCEL_TOKEN = process.env.VERCEL_TOKEN?.trim();
  const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID?.trim();
  const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID?.trim();
  const MAIN_DOMAIN = process.env.VITE_MAIN_DOMAIN?.trim();

  const persistDomainResult = async (status: string, verified: boolean) => {
    await tenantRef.set({
      domain: {
        subdomain,
        status,
        vercelVerified: verified,
        updatedAt: FieldValue.serverTimestamp(),
      },
    }, { merge: true });
  };

  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID || !MAIN_DOMAIN) {
    console.error('Vercel configuration missing');
    await persistDomainResult('failed', false);
    return res.status(500).json({ error: 'Server misconfiguration: Missing domain or Vercel credentials' });
  }

  const fqdn = `${subdomain}.${MAIN_DOMAIN}`;
  const url = new URL(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains`);
  if (VERCEL_TEAM_ID) {
    url.searchParams.append('teamId', VERCEL_TEAM_ID);
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: fqdn }),
    });

    const result = await response.json() as any;

    // Idempotency: Treat "already exists" / "already assigned" as success
    if (!response.ok) {
      if (result.error?.code === 'domain_already_assigned') {
        await persistDomainResult('active', true);
        return res.status(200).json({ 
          ok: true, 
          domain: fqdn,
          verified: true,
          status: 'active',
          message: 'Domain already assigned to this project',
          persisted: true,
        });
      }
      console.error('Vercel API Error:', result);
      await persistDomainResult('failed', false);
      return res.status(response.status).json({ error: 'Failed to provision subdomain', details: result });
    }

    const verified = result.verified === true;
    const status = verified ? 'active' : 'pending_verification';
    await persistDomainResult(status, verified);
    return res.status(200).json({
      ok: true,
      domain: fqdn,
      verified,
      status,
      verification: result.verification || null,
      persisted: true,
    });

  } catch (error) {
    console.error('Provisioning error:', error);
    try {
      await persistDomainResult('failed', false);
    } catch (persistenceError) {
      console.error('Could not persist provisioning failure:', persistenceError);
    }
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
