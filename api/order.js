// Vercel Serverless Function — the single, reliable path for placing an order.
//
// The client POSTs the order here (one request) and the SERVER then:
//   1. writes the order to Firestore
//   2. bumps the running order stats
//   3. reads every push subscription itself
//   4. sends a web push to each one
//   5. prunes subscriptions the push service reports as gone (404/410)
//
// This removes the old dependency on the ordering customer's browser staying
// alive long enough to fetch subscriptions and fire the notification.
//
// Env vars required (set in Vercel project settings):
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_CONTACT_EMAIL  (e.g. mailto:you@example.com)

import webpush from 'web-push';
import {
  addDoc,
  setDoc,
  deleteDoc,
  doc,
  collection,
  getDocs,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db } from '../src/firebase.js';

function setVapid() {
  webpush.setVapidDetails(
    process.env.VAPID_CONTACT_EMAIL || 'mailto:hello@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const { order, notify } = req.body || {};
  if (!order || (!order.summary && !order.customerName)) {
    return res.status(400).json({ error: 'missing order' });
  }

  // 1 + 2. Persist the order and bump stats. This is the part the customer
  // actually cares about, so do it first and fail loudly if it breaks.
  let orderId;
  try {
    const ref = await addDoc(collection(db, 'orders'), {
      customerName: order.customerName || 'Anonymous',
      temp: order.temp ?? null,
      decaf: !!order.decaf,
      drink: order.drink || '',
      addons: Array.isArray(order.addons) ? order.addons : [],
      summary: order.summary || '',
      status: 'open',
      createdAt: serverTimestamp(),
    });
    orderId = ref.id;

    await setDoc(
      doc(db, 'stats', 'global'),
      { totalOrders: increment(1), lastOrderAt: serverTimestamp() },
      { merge: true }
    );
  } catch (err) {
    console.error('order save failed', err);
    return res.status(500).json({ error: 'order save failed' });
  }

  // 3-5. Notify. A notification failure must NOT fail the order, so from here
  // on we only ever report problems — the order is already safe.
  let sent = 0;
  let failed = 0;
  let pruned = 0;

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    try {
      setVapid();

      const snap = await getDocs(collection(db, 'subscriptions'));
      const subs = snap.docs
        .map((d) => ({ id: d.id, subscription: d.data().subscription }))
        .filter((s) => s.subscription);

      const payload = JSON.stringify({
        title: (notify && notify.title) || 'New order ☕',
        body: (notify && notify.body) || order.summary || 'Someone placed an order.',
        tag: orderId, // unique per order → each order alerts on its own
      });

      const results = await Promise.allSettled(
        subs.map((s) =>
          webpush.sendNotification(s.subscription, payload, {
            TTL: 3600, // hold up to 1h if the phone is briefly offline/asleep
            urgency: 'high',
          })
        )
      );

      const dead = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          sent++;
        } else {
          failed++;
          const code = r.reason && r.reason.statusCode;
          if (code === 404 || code === 410) dead.push(subs[i].id);
        }
      });

      // Prune expired/rotated subscriptions so they stop counting as failures
      // and can't slow future sends.
      await Promise.allSettled(
        dead.map((id) => deleteDoc(doc(db, 'subscriptions', id)))
      );
      pruned = dead.length;
    } catch (err) {
      console.error('notify step failed', err);
    }
  }

  return res.status(200).json({ orderId, sent, failed, pruned });
}
