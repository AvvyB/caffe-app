// ============================================================
// PASTE YOUR FIREBASE CONFIG BELOW
// (you'll get this from the Firebase Console — see README step 1)
// ============================================================

import { initializeApp } from 'firebase/app';
import { getFirestore, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE.appspot.com",
  messagingSenderId: "PASTE",
  appId: "PASTE"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const MENU_DOC = doc(db, 'menus', 'default');
