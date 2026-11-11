// ============================================================
//  FIREBASE CONFIG  ←  paste your Firebase web app settings here
// ------------------------------------------------------------
//  Firebase console → Project settings → General → "Your apps"
//  → Web app → "SDK setup and configuration" → Config.
//
//  While apiKey is empty, the app runs in LOCAL-ONLY mode:
//  everything works, but progress stays on this one device.
//  The README has step-by-step setup instructions.
// ============================================================

export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

// Kid accounts sign in with a username. Behind the scenes Firebase needs
// an email, so "leo" becomes "leo@kids.local". No real email is used.
export const KID_EMAIL_DOMAIN = 'kids.local';
