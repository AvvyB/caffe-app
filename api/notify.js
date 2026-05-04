// Vercel Serverless Function — sends a web push to all provided subscriptions.
// Triggered by the client when an order is placed.
//
// Env vars required (set in Vercel project settings):
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_CONTACT_EMAIL  (e.g. mailto:you@example.com)

import webpush from 'web-push';

function setVapid() {
  webpush.setVapidDetails(
    process.env.VAPID_CONTACT_EMAIL || 'mailto:hello@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export default async function handler(req, res) {
  // Allow CORS from same origin
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  try {
    setVapid();

    const { subscriptions, payload } = req.body || {};
    if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
      return res.status(400).json({ error: 'no subscriptions' });
    }

    const safePayload = {
      title: (payload && payload.title) || 'New order',
      body: (payload && payload.body) || 'Someone placed an order.',
    };

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(sub, JSON.stringify(safePayload))
      )
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - sent;

    return res.status(200).json({ sent, failed });
  } catch (err) {
    console.error('notify error', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
