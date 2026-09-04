import { VercelRequest, VercelResponse } from '@vercel/node';
import { hasMembershipPermission, verifyFirebaseIdToken } from './utils/firebaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const decodedToken = await verifyFirebaseIdToken(req);
  if (!decodedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { recipientId, title, body, data, tenantId } = req.body ?? {};

    if (
      typeof recipientId !== 'string' ||
      typeof title !== 'string' ||
      typeof body !== 'string' ||
      typeof tenantId !== 'string'
    ) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const isAuthorized = decodedToken.superadmin === true
      || decodedToken.platformAdmin === true
      || await hasMembershipPermission(decodedToken.uid, tenantId, 'manageBookings');

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const ONE_SIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID?.trim();
    const ONE_SIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY?.trim();

    if (!ONE_SIGNAL_APP_ID || !ONE_SIGNAL_REST_API_KEY) {
      console.error('OneSignal credentials missing');
      return res.status(500).json({ error: 'Server misconfiguration: Missing OneSignal credentials' });
    }

    const requestedUrl = typeof data?.url === 'string' ? data.url : '/';
    const redirectUrl = requestedUrl.startsWith('/') && !requestedUrl.startsWith('//')
      ? requestedUrl
      : '/';

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${ONE_SIGNAL_REST_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: ONE_SIGNAL_APP_ID,
        include_external_user_ids: [recipientId],
        contents: { en: body, fr: body },
        headings: { en: title, fr: title },
        url: redirectUrl,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('OneSignal Error:', result);
      return res.status(response.status).json({ error: 'Failed to send push notification', details: result });
    }

    return res.status(200).json({ success: true, result });

  } catch (error) {
    console.error('Push notification error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
