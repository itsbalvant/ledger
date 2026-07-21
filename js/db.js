// Thin wrapper around Firestore: per-user collections + realtime subscriptions.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getAuth,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";

export { firebaseConfigured };

let app = null;
let auth = null;
let db = null;

export function initFirebase() {
  if (app) return { app, auth, db };
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  enableIndexedDbPersistence(db).catch(() => {
    // multiple tabs open, or unsupported browser — app still works online.
  });
  return { app, auth, db };
}

export function getDb() {
  if (!db) initFirebase();
  return db;
}
export function getAuthInstance() {
  if (!auth) initFirebase();
  return auth;
}

function col(uid, name) {
  return collection(getDb(), "users", uid, name);
}

export function watchCollection(uid, name, orderField, cb, dir = "desc") {
  const q = query(col(uid, name), orderBy(orderField, dir));
  return onSnapshot(
    q,
    (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      cb(items, null);
    },
    (err) => cb(null, err)
  );
}

export async function addItem(uid, name, data) {
  return addDoc(col(uid, name), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateItem(uid, name, id, data) {
  return updateDoc(doc(getDb(), "users", uid, name, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteItem(uid, name, id) {
  return deleteDoc(doc(getDb(), "users", uid, name, id));
}
