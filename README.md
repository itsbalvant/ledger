# Ledger

A fast, private space for tasks, a reading list, and notes (typed or handwritten
with Apple Pencil) — built to run on GitHub Pages and feel great on iPad.

No build step, no framework, no server: plain HTML/CSS/JS + Firebase for
accounts and syncing your data across devices.

## Firebase status

This repo is wired up to a real Firebase project (`notes-app-32682`), fully
configured and locked down:
- ✅ Web app registered, config filled into `js/firebase-config.js`
- ✅ Email/Password sign-in enabled
- ✅ Firestore database created (`nam5`)
- ✅ **No billing account linked** — confirmed via the Cloud Billing API
  (`billingEnabled: false`). You're on the free Spark plan; nothing can be
  charged.
- ✅ Security rules deployed and locked to a **single owner account**
  (`firestore.rules`) — even if a stranger finds this site's URL and
  registers their own account, every read/write they attempt gets
  `PERMISSION_DENIED`. Only the one owner uid can ever touch data. Verified
  live with an unauthenticated request (`403 PERMISSION_DENIED`).

If you ever want to trust a second device/person with your own data, add
their uid to the allow-list in `firestore.rules` and redeploy (see below) —
don't just widen the rule back to "any signed-in user."

## Redeploying security rules later

If you ever edit `firestore.rules`, push the change with:
```bash
firebase deploy --only firestore:rules
```
(`.firebaserc` already points the CLI at the right project.)

## Try it locally

From this folder:
```bash
python3 -m http.server 8080
```
Then open `http://localhost:8080`, register an account, and add a
task/article/note to confirm everything syncs (works once Email/Password
sign-in is enabled above).

## Deploy to GitHub Pages

1. Push this repo to GitHub (see chat for the exact commands used for this
   repo, or):
   ```bash
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy
   from a branch → Branch: `main` / `(root)` → Save**.
3. GitHub gives you a URL like `https://<your-username>.github.io/<repo-name>/`
   — that's your live app. It usually takes a minute to go live after the
   first push.

## Add it to your iPad Home Screen

Open the GitHub Pages URL in Safari on your iPad → tap the **Share** icon →
**Add to Home Screen**. It launches full-screen like a native app and keeps
working (read-only for cached content) if you briefly lose connection.

## Using it with Apple Pencil

- In **Notes**, tap **Sketch** to open a full drawing canvas. Pencil pressure
  changes stroke width automatically. Use the floating toolbar to change
  color, thickness, switch to the eraser, undo the last stroke, or clear the
  page.
- Text notes, tasks, and the reading list are all Pencil/touch/keyboard
  friendly, but store plain text — the drawing canvas is where handwriting
  lives.

## Project structure

```
index.html             App shell: auth screen + tasks/reading/notes views
css/styles.css          Design system (light/dark, responsive)
js/firebase-config.js   Firebase project keys for notes-app-32682
js/db.js                Firestore read/write helpers + offline persistence
js/auth.js              Register/login/logout/password reset
js/tasks.js             Task list logic
js/reading.js           Reading list logic
js/notes.js             Notes list + editor wiring
js/canvas.js            Pressure-aware drawing engine for Pencil notes
js/main.js              App bootstrap, navigation, theming
manifest.json, sw.js, icons/   PWA install + offline shell caching
firestore.rules, firebase.json, .firebaserc   Security rules + CLI project link
```

## Notes on the free tier

Firebase's free "Spark" plan comfortably covers personal use of this app
(tasks/articles/notes for one person). GitHub Pages is free for public
repositories.
