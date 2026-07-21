# Ledger

A fast, private space for tasks, a reading list, and notes (typed or handwritten
with Apple Pencil) — built to run on GitHub Pages and feel great on iPad.

No build step, no framework, no server: plain HTML/CSS/JS + Firebase for
accounts and syncing your data across devices.

## Firebase status

This repo is already wired up to a real Firebase project (`notes-app-32682`):
- ✅ Web app registered, config filled into `js/firebase-config.js`
- ✅ Firestore database created (`nam5`)
- ✅ Security rules deployed (`firestore.rules` — each account can only ever
  read/write its own data; verified with a live permission-denied test)

**One manual step is left — Email/Password sign-in.** Google's newer Identity
Platform API requires a Blaze (pay-as-you-go) billing link to turn this on
programmatically, even though the feature itself is free to use — and that's
a payment-method step only you should do:

1. Open the [Authentication page](https://console.firebase.google.com/project/notes-app-32682/authentication) for this project.
2. Click **Get started**.
3. Under **Sign-in method**, enable **Email/Password**.
4. If it prompts you to upgrade to the Blaze plan first: that's normal, it's
   still $0 for this app's usage level (Spark's free quotas carry over, you're
   simply billed only if you ever exceed them) — no charge happens just from
   linking a card.

Once that's on, registering/logging in on the site will work immediately —
no other setup needed.

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
