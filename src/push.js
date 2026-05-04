// Push notification subscription helpers
import { setDoc, deleteDoc, doc, collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

// ============================================================
// PASTE YOUR VAPID PUBLIC KEY BELOW (see README Part 5)
// ============================================================
export const VAPID_PUBLIC_KEY = 'BBTNSeHm2TxcRQgZ_yyDhmP82L2BMPPNWuebX9zn-DQARCU3b7wxS9Ax0N3qXR9EM4kQJtv7st58pzbGpT3tSXo';

const DEVICE_ID_KEY = 'caffe-device-id';

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
         `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function pushSupported() {
  return 'serviceWorker' in navigator &&
         'PushManager' in window &&
         'Notification' in window;
}

export async function checkSubscribed() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

export async function subscribeToPush() {
  if (!pushSupported()) {
    throw new Error('Push notifications not supported on this device.');
  }
  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith('PASTE')) {
    throw new Error('VAPID public key not configured. See README Part 5.');
  }

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  await setDoc(doc(db, 'subscriptions', getDeviceId()), {
    subscription: sub.toJSON(),
    createdAt: Date.now(),
    userAgent: navigator.userAgent.slice(0, 200),
  });
}

export async function unsubscribeFromPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) {
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  }
  try {
    await deleteDoc(doc(db, 'subscriptions', getDeviceId()));
  } catch (e) {
    // ignore
  }
}

export async function notifyOrder(orderText, total) {
  try {
    const snap = await getDocs(collection(db, 'subscriptions'));
    const subscriptions = snap.docs.map((d) => d.data().subscription).filter(Boolean);
    if (subscriptions.length === 0) return;

    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscriptions,
        payload: {
          title: 'New order ☕',
          body: `${orderText} · $${total.toFixed(2)}`,
        },
      }),
    });
  } catch (e) {
    console.error('notifyOrder failed', e);
  }
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
