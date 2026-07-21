import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getAuthInstance } from "./db.js";

export function onAuthChange(cb) {
  return onAuthStateChanged(getAuthInstance(), cb);
}

export async function register(name, email, password) {
  const cred = await createUserWithEmailAndPassword(getAuthInstance(), email, password);
  if (name) await updateProfile(cred.user, { displayName: name });
  return cred.user;
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(getAuthInstance(), email, password);
  return cred.user;
}

export async function logout() {
  return signOut(getAuthInstance());
}

export async function resetPassword(email) {
  return sendPasswordResetEmail(getAuthInstance(), email);
}

export function friendlyAuthError(err) {
  const code = err?.code || "";
  const map = {
    "auth/email-already-in-use": "That email already has an account — try logging in instead.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts — please wait a moment and try again.",
    "auth/network-request-failed": "Network error — check your connection.",
  };
  return map[code] || err.message || "Something went wrong. Please try again.";
}
