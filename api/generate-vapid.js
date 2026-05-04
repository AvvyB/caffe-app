// One-time VAPID key generator.
// Visit /api/generate-vapid in your browser to get a fresh public/private keypair.
// DELETE THIS FILE after you've copied your keys.
 
import webpush from 'web-push';
 
export default function handler(req, res) {
  const keys = webpush.generateVAPIDKeys();
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send(
    `VAPID keys generated. Copy these now — refreshing this page generates new ones.\n\n` +
    `PUBLIC KEY:\n${keys.publicKey}\n\n` +
    `PRIVATE KEY:\n${keys.privateKey}\n\n` +
    `Next:\n` +
    `1. Paste the PUBLIC key into src/push.js (VAPID_PUBLIC_KEY).\n` +
    `2. Paste both into Vercel env vars (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY).\n` +
    `3. Delete this file (api/generate-vapid.js) from your repo.\n`
  );
}
 
