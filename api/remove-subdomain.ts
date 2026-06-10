import { VercelRequest, VercelResponse } from '@vercel/node';
import { adminAuth, adminDb } from './utils/firebaseAdmin';

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

  // Ensure the caller is either SuperAdmin or owns this tenant
  try {
    const tenantDoc = await adminDb.collection('tenants').doc(tenantId).get();
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    const isSuperAdmin = userDoc.exists && userDoc.data()?.role === 'superadmin';

    // Even if tenant doesn't exist anymore, superadmin can force remove domain
    if (!isSuperAdmin) {
      if (!tenantDoc.exists) {
        return res.status(404).json({ error: 'Tenant not found' });
      }
      if (tenantDoc.data()?.ownerUid !== decodedToken.uid) {
        return res.status(403).json({ error: 'Forbidden: You do not own this tenant' });
      }
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
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const fqdn = `${subdomain}.${MAIN_DOMAIN}`;
  const url = new URL(`https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/domains/${fqdn}`);
  if (VERCEL_TEAM_ID) {
    url.searchParams.append('teamId', VERCEL_TEAM_ID);
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
      },
    });

    const result = await response.json() as any;

    if (!response.ok) {
      // If it doesn't exist on Vercel, that's fine (idempotency)
      if (response.status === 404 || result.error?.code === 'not_found') {
        return res.status(200).json({ ok: true, removed: true, message: 'Domain was not found on Vercel' });
      }
      console.error('Vercel API Error (DELETE):', result);
      return res.status(response.status).json({ error: 'Failed to remove subdomain', details: result });
    }

    return res.status(200).json({ ok: true, removed: true });

  } catch (error) {
    console.error('Removal error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
