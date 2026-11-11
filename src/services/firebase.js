// Firebase: accounts (Authentication) and cloud progress (Firestore).
// Loaded lazily, so local-only mode never downloads the Firebase SDK.

import { firebaseConfig, KID_EMAIL_DOMAIN } from '../config/firebase-config.js';

// For automated tests on this computer: add ?emulators to the URL to talk to
// the local Firebase emulators instead of the real project.
const useEmulators = typeof location !== 'undefined' &&
  /^(localhost|127\.0\.0\.1)$/.test(location.hostname) &&
  new URLSearchParams(location.search).has('emulators');

export const firebaseEnabled = !!firebaseConfig.apiKey || useEmulators;

let fbPromise = null;

export function getFirebase() {
  if (!firebaseEnabled) return Promise.resolve(null);
  if (!fbPromise) fbPromise = init();
  return fbPromise;
}

async function init() {
  const [{ initializeApp }, authLib, fs] = await Promise.all([
    import('firebase/app'), import('firebase/auth'), import('firebase/firestore'),
  ]);
  const config = useEmulators
    ? { apiKey: 'demo-key', projectId: 'demo-spanish', authDomain: 'localhost', appId: 'demo-app' }
    : firebaseConfig;
  const app = initializeApp(config);
  // Stay signed in on the iPad (IndexedDB survives app restarts).
  const auth = authLib.initializeAuth(app, {
    persistence: [authLib.indexedDBLocalPersistence, authLib.browserLocalPersistence],
  });
  let db;
  try {
    // Offline persistence: lessons work without a connection and sync later.
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentSingleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  } catch {
    db = fs.initializeFirestore(app, { localCache: fs.memoryLocalCache(), ignoreUndefinedProperties: true });
  }
  if (useEmulators) {
    authLib.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return { app, auth, db, authLib, fs, config };
}

// ---------- usernames ----------

export const USERNAME_RE = /^[a-z0-9][a-z0-9_.-]{2,19}$/;
export function kidEmail(username) {
  return `${String(username).trim().toLowerCase()}@${KID_EMAIL_DOMAIN}`;
}
export function isKidEmail(email) {
  return String(email || '').endsWith(`@${KID_EMAIL_DOMAIN}`);
}

/** Friendly words for Firebase error codes. */
export function authErrorText(err) {
  const code = err?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return "That name and password don't match. Try again!";
  if (code.includes('email-already-in-use')) return 'That name is already taken. Try another one.';
  if (code.includes('weak-password')) return 'Passwords need at least 6 characters.';
  if (code.includes('invalid-email')) return "That doesn't look like a valid email.";
  if (code.includes('network')) return 'No internet right now. Try again in a bit.';
  if (code.includes('too-many-requests')) return 'Too many tries. Take a short break and try again.';
  return 'Something went wrong. Please try again.';
}

// ---------- sign in / out ----------

export async function onAuthChange(cb) {
  const fb = await getFirebase();
  if (!fb) return () => {};
  return fb.authLib.onAuthStateChanged(fb.auth, cb);
}

export async function signInKid(username, password) {
  const fb = await getFirebase();
  return fb.authLib.signInWithEmailAndPassword(fb.auth, kidEmail(username), password);
}

export async function signInGrownUp(email, password) {
  const fb = await getFirebase();
  return fb.authLib.signInWithEmailAndPassword(fb.auth, email.trim(), password);
}

export async function createGrownUp(email, password) {
  const fb = await getFirebase();
  const cred = await fb.authLib.createUserWithEmailAndPassword(fb.auth, email.trim(), password);
  await fb.fs.setDoc(fb.fs.doc(fb.db, 'users', cred.user.uid), { role: 'grownup', kids: [] });
  return cred;
}

export async function signOutAll() {
  const fb = await getFirebase();
  if (fb) await fb.authLib.signOut(fb.auth);
}

export async function getIdToken() {
  const fb = await getFirebase();
  return fb?.auth.currentUser ? fb.auth.currentUser.getIdToken() : null;
}

/**
 * The grown-up creates a learner account without being signed out:
 * we use a second, temporary Firebase app for the new account, write the
 * learner's starting document AS the learner (so the security rules hold),
 * then record the link on the grown-up's own user document.
 */
export async function createKidAccount({ username, password, nickname }, starterDoc) {
  const fb = await getFirebase();
  const parentUid = fb.auth.currentUser?.uid;
  if (!parentUid) throw new Error('Grown-up must be signed in');
  const { initializeApp, deleteApp } = await import('firebase/app');
  const tmp = initializeApp(fb.config, `create-${Date.now()}`);
  try {
    const tmpAuth = fb.authLib.initializeAuth(tmp, { persistence: fb.authLib.inMemoryPersistence });
    if (useEmulators) fb.authLib.connectAuthEmulator(tmpAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const cred = await fb.authLib.createUserWithEmailAndPassword(tmpAuth, kidEmail(username), password);
    const tmpDb = fb.fs.initializeFirestore(tmp, { localCache: fb.fs.memoryLocalCache(), ignoreUndefinedProperties: true });
    if (useEmulators) fb.fs.connectFirestoreEmulator(tmpDb, '127.0.0.1', 8080);
    const kidUid = cred.user.uid;
    await fb.fs.setDoc(fb.fs.doc(tmpDb, 'kids', kidUid), { ...starterDoc, parentUid, updatedAt: Date.now() });
    await fb.fs.setDoc(fb.fs.doc(fb.db, 'users', parentUid),
      { role: 'grownup', kids: fb.fs.arrayUnion({ id: kidUid, nickname, username: username.toLowerCase() }) },
      { merge: true });
    await fb.authLib.signOut(tmpAuth);
    return kidUid;
  } finally {
    deleteApp(tmp).catch(() => {});
  }
}
