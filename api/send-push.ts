import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Basic security validation: Only authenticated requests
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // In a real app, verify the bearer token here to ensure it's from your valid clients.
  // For simplicity, we assume if it reaches here and has a Bearer token, it's valid.

  try {
    const { recipientId, title, body, data, notificationId, type } = req.body;

    if (!recipientId || !title || !body) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const ONE_SIGNAL_APP_ID = "812f9b44-12d9-4391-97b7-6f0b2798987d";
    const ONE_SIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY?.trim();

    if (!ONE_SIGNAL_REST_API_KEY) {
      console.error('OneSignal credentials missing');
      return res.status(500).json({ error: 'Server misconfiguration: Missing REST API KEY' });
    }

    const redirectUrl = data?.url || '/';

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
