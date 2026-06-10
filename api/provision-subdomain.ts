import { VercelRequest, VercelResponse } from '@vercel/node';
import { adminAuth, adminDb } from './utils/firebaseAdmin';

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

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
  }

  const token = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(token);
  } catch (err) {
    console.error('Token verification failed:', err);
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

  // Ensure the caller actually owns this tenant
  try {
    const tenantDoc = await adminDb.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    const tenantData = tenantDoc.data();
    
    // SuperAdmins bypass this check if they are re-provisioning
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    const isSuperAdmin = userDoc.exists && userDoc.data()?.role === 'superadmin';

    if (!isSuperAdmin && tenantData?.ownerUid !== decodedToken.uid) {
      return res.status(403).json({ error: 'Forbidden: You do not own this tenant' });
    }
  } catch (err) {
    console.error('Tenant verification failed:', err);
    return res.status(500).json({ error: 'Internal server error during validation' });
  }

  const VERCEL_TOKEN = process.env.VERCEL_TOKEN?.trim();
  const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID?.trim();
  const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID?.trim();
  const MAIN_DOMAIN = process.env.VITE_MAIN_DOMAIN?.trim() || 'barberboard.pro';

  if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
    console.error('Vercel configuration missing');
    return res.status(500).json({ error: 'Server misconfiguration: Missing Vercel credentials' });
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
      if (result.error?.code === 'domain_already_in_use' || result.error?.code === 'domain_already_assigned') {
        return res.status(200).json({ 
          ok: true, 
          domain: fqdn,
          verified: true,
          status: 'active',
          message: 'Domain already assigned to this project'
        });
      }
      console.error('Vercel API Error:', result);
      return res.status(response.status).json({ error: 'Failed to provision subdomain', details: result });
    }

    // Success response parsing
    return res.status(200).json({
      ok: true,
      domain: fqdn,
      verified: result.verified === true,
      status: 'active',
      verification: result.verification || null
    });

  } catch (error) {
    console.error('Provisioning error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
