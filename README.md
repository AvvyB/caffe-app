# Caffè — Setup Walkthrough

You're going to do five things, all in the browser. No Node.js, no terminal, no Mac required. Total time: ~40 minutes.

1. **Firebase** — sets up the shared menu storage
2. **GitHub** — holds your code
3. **Vercel** — hosts the live website
4. **Add to Home Screen** — turns the URL into an app icon on iPhone
5. **Push notifications** — get a buzz on your lock screen when someone orders

When you're done, you'll have a URL like `caffe-app.vercel.app` that you and your friends add to your home screens.

> **You can do every step from your iPhone**, but it's easier on a laptop because of the file uploads. Either works.

---

## Part 1 — Firebase (the database) · ~10 min

### 1a. Create the project

1. Go to https://firebase.google.com and click **Get Started** (sign in with Google).
2. Click **Add project** (or **Create a project**).
3. Name it `caffe` (or anything). Continue.
4. **Disable Google Analytics** — you don't need it. Create project.
5. Wait ~30 seconds. Click **Continue** when ready.

### 1b. Add a web app

1. On the project home, click the **`</>`** icon ("Add an app — Web").
2. App nickname: `Caffe`. **Don't** check "set up Firebase Hosting." Click **Register app**.
3. A code block appears with a `firebaseConfig = { ... }`. **Copy the whole `firebaseConfig` object** — you'll paste it in Part 2. (If you lose it, you can find it again in Project Settings → General → Your apps.)
4. Click **Continue to console**.

### 1c. Turn on Firestore

1. In the left sidebar: **Build → Firestore Database**.
2. Click **Create database**.
3. Select **Start in test mode**. Continue.
4. Pick a location near you (e.g., `us-east1` or `eur3`). Click **Enable**.

### 1d. Set proper rules (so it doesn't expire in 30 days)

1. In Firestore, click the **Rules** tab.
2. Replace the entire contents with:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /menus/{menuId} {
         allow read, write: if true;
       }
       match /subscriptions/{subId} {
         allow read, write: if true;
       }
     }
   }
   ```

3. Click **Publish**.

> This lets anyone with your URL read and edit the menu. Fine for friends-only sharing. If you want admin-only editing later, see "Locking it down" at the bottom.

---

## Part 2 — GitHub (your code lives here) · ~10 min

### 2a. Make an account & repo

1. Go to https://github.com — sign up if you haven't.
2. Click the **+** icon (top right) → **New repository**.
3. Name it `caffe-app`. Leave it **Public**. Don't check any of the "Add..." boxes. Click **Create repository**.

### 2b. Upload the project files

1. On the empty repo page, click the link **"uploading an existing file"**.
2. **Unzip** the `caffe-app.zip` you got from Claude.
3. Drag **everything inside the unzipped folder** (not the folder itself — its contents: `src/`, `public/`, `index.html`, `package.json`, etc.) into the GitHub upload box.
4. Scroll down. Commit message: `initial`. Click **Commit changes**.

### 2c. Paste your Firebase config

1. In the repo file list, click **`src`**, then click **`firebase.js`**.
2. Click the pencil icon (✏️ top right of the file) to edit.
3. Replace the `firebaseConfig` block with the one you copied in Step 1b. It should end up looking like:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "caffe-12345.firebaseapp.com",
     projectId: "caffe-12345",
     storageBucket: "caffe-12345.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123:web:abc"
   };
   ```

4. Scroll down, click **Commit changes**.

---

## Part 3 — Vercel (the live website) · ~5 min

1. Go to https://vercel.com → **Sign Up** → **Continue with GitHub**.
2. Authorize Vercel. Skip any team/upgrade prompts (the free Hobby plan is fine).
3. Click **Add New… → Project**.
4. Find `caffe-app` in the list, click **Import**.
5. Leave **everything as default** (Vite is auto-detected). Click **Deploy**.
6. Wait ~60 seconds. You'll see fireworks 🎉 and a URL like `caffe-app-xyz.vercel.app`.
7. Click the URL. Your app is live.

> **If the page is blank or shows an error**, your Firebase config probably wasn't pasted correctly. Open your browser's dev tools console to check, or just re-do Step 2c.

---

## Part 4 — Add to home screen (the "app" part) · ~1 min each

Send the Vercel URL to yourself and your friends. On each iPhone:

1. Open the URL in **Safari** (must be Safari — Chrome on iOS doesn't support this).
2. Tap the **Share** button (square with arrow up, bottom center).
3. Scroll the action sheet down, tap **Add to Home Screen**.
4. Tap **Add**.

The Caffè icon appears on the home screen. Tap it — opens full-screen, no browser bars. Looks and feels like a real app.

> **Important for Part 5:** push notifications only work when the app is opened from the home-screen icon, not from Safari. Make sure you complete this step on every device that needs alerts.

---

## Part 5 — Push notifications · ~10 min

This is the part that pings your iPhone when someone orders.

### 5a. Generate VAPID keys

VAPID keys identify your app to Apple/Google's push servers. You generate them once and never change them.

1. Go to https://vapidkeys.com (a small in-browser tool — no signup).
2. Click **Generate**. You'll see a **Public Key** and a **Private Key**.
3. Keep this tab open — you'll paste both keys in the next two steps.

> **Don't share the private key.** It's like a password. Public key is fine to share.

### 5b. Add the public key to your code

1. In your GitHub repo, open **`src/push.js`** → click the pencil to edit.
2. Find the line `export const VAPID_PUBLIC_KEY = 'PASTE_YOUR_VAPID_PUBLIC_KEY';`
3. Replace `'PASTE_YOUR_VAPID_PUBLIC_KEY'` with your **public** key (keep the quotes).
4. Commit changes.

### 5c. Add both keys to Vercel as environment variables

1. Go to https://vercel.com → click your `caffe-app` project.
2. Click **Settings** → **Environment Variables** (left sidebar).
3. Add three variables (one at a time, click "Save" after each):

   | Name | Value |
   |---|---|
   | `VAPID_PUBLIC_KEY` | (paste your public key) |
   | `VAPID_PRIVATE_KEY` | (paste your private key) |
   | `VAPID_CONTACT_EMAIL` | `mailto:your@email.com` |

   For each, leave **Environments** set to all three (Production, Preview, Development).

4. Click **Deployments** in the left sidebar → click the most recent deployment → click the three dots (top right) → **Redeploy**. (This makes the new env vars take effect.)

### 5d. Turn on alerts on your iPhone

You must do this **from the Caffè app on your home screen**, not from Safari.

1. On your iPhone, open the Caffè app from the home screen icon.
2. Tap **Menu** (top right).
3. You'll see a card titled **Order alerts**. Tap **Turn on**.
4. iOS will ask "Allow Notifications?" — tap **Allow**.
5. The card turns dark. You're subscribed.

### 5e. Test it

1. From any other browser (your laptop, a friend's phone), open the Caffè URL.
2. Place a fake order.
3. Within a few seconds, your iPhone should buzz with a "New order ☕" notification.

> **Not getting notifications?**
> - You must open the app from the home-screen icon, not Safari.
> - You need iOS 16.4 or later (anything from 2023 onwards is fine).
> - If you initially tapped "Don't Allow," go to iPhone Settings → Notifications → Caffè → enable Allow Notifications, then come back to the app and tap "Turn on" again.
> - Make sure the Vercel redeploy in step 5c finished successfully.

> **Want multiple people to get notified?** Have each person install the PWA on their phone and tap "Turn on". Every device that's subscribed will receive every order.

---

## Updating the menu

Just open the app, tap **Menu** in the top right, add or remove items. Everyone sees the change within ~1 second. No deploy needed.

## Updating the code

Edit any file in your GitHub repo (pencil icon → commit). Vercel auto-redeploys in ~30 seconds. Refresh the app on your phone.

---

## Locking it down (optional, do later)

Right now anyone with the URL can edit the menu. To restrict editing to only you:

1. In Firebase Console: **Build → Authentication → Get started → Email/Password → Enable**.
2. Add yourself as a user (Users tab → Add user).
3. Update the Firestore rules:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /menus/{menuId} {
         allow read: if true;
         allow write: if request.auth != null;
       }
     }
   }
   ```

4. Add a login screen to the admin view in `App.jsx` (let me know if you want help).

---

## Troubleshooting

**"Page not found" on the live URL** → Vercel deploy probably failed. Go to your Vercel dashboard, click the project, click the failed deployment, scroll to logs.

**Menu doesn't save / "Could not save"** → Firebase rules aren't published, or config is wrong. Re-check Part 1d and Part 2c.

**Looks broken on iPhone** → Make sure you opened in Safari, not Chrome or Instagram's in-app browser.

**Want a custom domain like caffe.com** → In Vercel, project → Settings → Domains. Buy the domain through them or any registrar.
