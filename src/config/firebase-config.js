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
  apiKey: 'AIzaSyBcql9_AVVM6jAaza3E80LCXxdQx-hK3No',
  authDomain: 'dale-spanish-d6668.firebaseapp.com',
  projectId: 'dale-spanish-d6668',
  storageBucket: 'dale-spanish-d6668.firebasestorage.app',
  messagingSenderId: '294816137419',
  appId: '1:294816137419:web:b5644bc177855158f59b4e',
  // (measurementId left out on purpose: the app never loads Google Analytics.)
};

// Kid accounts sign in with a username. Behind the scenes Firebase needs
// an email, so "leo" becomes "leo@kids.local". No real email is used.
export const KID_EMAIL_DOMAIN = 'kids.local';
