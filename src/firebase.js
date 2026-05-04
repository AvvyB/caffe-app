// ============================================================
// PASTE YOUR FIREBASE CONFIG BELOW
// (you'll get this from the Firebase Console — see README step 1)
// ============================================================

import { initializeApp } from 'firebase/app';
import { getFirestore, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDjvJTGisS42A4oDX7O5OyBo80Oezo3DSA",
  authDomain: "espresso-ordering.firebaseapp.com",
  projectId: "espresso-ordering",
  storageBucket: "espresso-ordering.firebasestorage.app",
  messagingSenderId: "375255695312",
  appId: "1:375255695312:web:c887e58f002a6d68ca83d5",
  measurementId: "G-EYT0J8T6C5"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const MENU_DOC = doc(db, 'menus', 'default');
