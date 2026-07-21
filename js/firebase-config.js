// Fill these in with the values from your Firebase project:
// Firebase console -> Project settings -> General -> Your apps -> SDK setup and configuration
//
// This file is safe to commit / publish. Firebase web API keys are not secret;
// access to your data is controlled by the Firestore Security Rules
// (see firestore.rules.txt), not by hiding this config.
export const firebaseConfig = {
  apiKey: "AIzaSyDH_kqP0jtxi6d1pewE_jf_i1zGiNlBaOA",
  authDomain: "notes-app-32682.firebaseapp.com",
  projectId: "notes-app-32682",
  storageBucket: "notes-app-32682.firebasestorage.app",
  messagingSenderId: "404389052806",
  appId: "1:404389052806:web:f24edacf09d43cb31dac07",
};

// Set to true once you've replaced the values above with your real config.
export const firebaseConfigured = !Object.values(firebaseConfig).some((v) =>
  String(v).startsWith("YOUR_")
);
