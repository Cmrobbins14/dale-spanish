// App state + saving. One place that knows WHERE data lives:
//  • local-only mode → localStorage on this device
//  • Firebase mode   → Firestore (with offline cache), synced across devices
// Screens read the signals below and change data only through updateKid().

import { signal } from '@preact/signals';
import { firebaseEnabled, getFirebase, onAuthChange, isKidEmail } from '../services/firebase.js';
import { setWorkerSignedIn } from '../services/worker.js';
import { newKidDoc, upgradeKidDoc, freshProgress } from './model.js';
import { localDateKey } from '../engine/dates.js';

/** { status: 'loading'|'welcome'|'kid'|'grownup', mode: 'local'|'firebase', uid?, email?, kids? } */
export const session = signal({ status: 'loading', mode: firebaseEnabled ? 'firebase' : 'local' });
/** The current learner's document (see model.js). */
export const kid = signal(null);
/** Today's local date, refreshed so crossing midnight is noticed. */
export const today = signal(localDateKey());

setInterval(() => { const t = localDateKey(); if (t !== today.value) today.value = t; }, 30_000);
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
    else today.value = localDateKey();
  });
  window.addEventListener('pagehide', () => flush());
}

// ---------------- local-only storage ----------------

const LS_KEY = 'dale.v1';
function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || { kids: {}, active: null }; }
  catch { return { kids: {}, active: null }; }
}
function writeLocal(d) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch { /* storage full or blocked */ }
}

export function localProfiles() {
  const d = readLocal();
  return Object.entries(d.kids).map(([id, k]) => ({ id, nickname: k.profile?.nickname || 'Learner', avatar: k.profile?.avatar }));
}

export function openLocalKid(id) {
  const d = readLocal();
  if (!d.kids[id]) return;
  d.active = id;
  writeLocal(d);
  kid.value = upgradeKidDoc(d.kids[id]);
  session.value = { status: 'kid', mode: 'local', kidId: id };
}

export function createLocalKid() {
  const d = readLocal();
  const id = `local-${Date.now().toString(36)}`;
  d.kids[id] = newKidDoc();
  d.active = id;
  writeLocal(d);
  openLocalKid(id);
  return id;
}

export function leaveLocalKid() {
  flush();
  const d = readLocal();
  d.active = null;
  writeLocal(d);
  kid.value = null;
  session.value = { status: 'welcome', mode: 'local' };
}

// ---------------- start-up ----------------

let unsubKid = null;
let unsubUser = null;

export async function startApp() {
  if (!firebaseEnabled) {
    const d = readLocal();
    if (d.active && d.kids[d.active]) openLocalKid(d.active);
    else session.value = { status: 'welcome', mode: 'local' };
    return;
  }
  await onAuthChange(async (user) => {
    unsubKid?.(); unsubUser?.();
    unsubKid = unsubUser = null;
    kid.value = null;
    setWorkerSignedIn(!!user);
    if (!user) { session.value = { status: 'welcome', mode: 'firebase' }; return; }
    const fb = await getFirebase();
    if (isKidEmail(user.email)) {
      session.value = { status: 'loading', mode: 'firebase', uid: user.uid, kidId: user.uid };
      const ref = fb.fs.doc(fb.db, 'kids', user.uid);
      unsubKid = fb.fs.onSnapshot(ref, async (snap) => {
        if (!snap.exists()) {
          // Account made outside the app: start a fresh document.
          await fb.fs.setDoc(ref, { ...newKidDoc(), parentUid: '', updatedAt: Date.now() });
          return;
        }
        applyRemote(upgradeKidDoc(snap.data()), snap.metadata.hasPendingWrites);
        if (session.value.status !== 'kid') session.value = { status: 'kid', mode: 'firebase', uid: user.uid, kidId: user.uid };
      }, () => { /* offline: cached data keeps working */ });
    } else {
      session.value = { status: 'grownup', mode: 'firebase', uid: user.uid, email: user.email, kids: [] };
      unsubUser = fb.fs.onSnapshot(fb.fs.doc(fb.db, 'users', user.uid), (snap) => {
        session.value = { ...session.value, kids: snap.data()?.kids || [] };
      }, () => {});
    }
  });
}

/** Merge a document that arrived from the cloud. */
function applyRemote(remote, pendingLocal) {
  const local = kid.value;
  if (!local) { kid.value = syncStreakGoal(remote); return; }
  if (pendingLocal) return; // our own write echoing back
  const next = { ...local, settings: remote.settings, parentUid: remote.parentUid };
  // A grown-up reset (or progress made on another device) wins.
  if (remote.settings.resetAt !== local.settings.resetAt || (remote.updatedAt || 0) > (local.updatedAt || 0)) {
    next.progress = remote.progress;
    next.profile = remote.profile;
  }
  kid.value = syncStreakGoal(next);
}

function syncStreakGoal(doc) {
  if (doc.settings.streakGoal && doc.progress.streak.goal !== doc.settings.streakGoal) {
    return { ...doc, progress: { ...doc.progress, streak: { ...doc.progress.streak, goal: doc.settings.streakGoal } } };
  }
  return doc;
}

// ---------------- changing + saving ----------------

const dirty = new Set();
let saveTimer = null;

/**
 * Change the learner's data. `mutator` edits a copy; we then save only the
 * top-level parts that changed (profile / settings / progress).
 */
export function updateKid(mutator) {
  const before = kid.value;
  if (!before) return;
  const next = structuredClone(before);
  mutator(next);
  for (const k of ['profile', 'settings', 'progress']) {
    if (JSON.stringify(before[k]) !== JSON.stringify(next[k])) dirty.add(k);
  }
  next.updatedAt = Date.now();
  kid.value = next;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 800);
}

export async function flush() {
  clearTimeout(saveTimer);
  const doc = kid.value;
  if (!doc || !dirty.size) return;
  const parts = [...dirty];
  dirty.clear();
  const s = session.value;
  if (s.mode === 'local') {
    const d = readLocal();
    if (s.kidId) { d.kids[s.kidId] = doc; writeLocal(d); }
    return;
  }
  const fb = await getFirebase();
  const patch = { updatedAt: doc.updatedAt };
  parts.forEach((p) => { patch[p] = doc[p]; });
  // updateDoc replaces each top-level map whole, so nothing stale lingers.
  fb.fs.updateDoc(fb.fs.doc(fb.db, 'kids', s.kidId), patch).catch((e) => console.warn('save failed', e));
}

/** Append-only activity log (Firestore subcollection + recent list). */
export async function logSession(entry) {
  const s = session.value;
  if (s.mode !== 'firebase' || !s.kidId) return;
  const fb = await getFirebase();
  fb.fs.addDoc(fb.fs.collection(fb.db, 'kids', s.kidId, 'sessions'), entry).catch(() => {});
}

// ---------------- grown-up (Firebase) ----------------

/** Watch one learner's document as the grown-up. Returns unsubscribe. */
export async function watchKidAsGrownUp(kidId, cb) {
  const fb = await getFirebase();
  return fb.fs.onSnapshot(fb.fs.doc(fb.db, 'kids', kidId), (snap) => {
    if (snap.exists()) cb(upgradeKidDoc(snap.data()));
  }, () => cb(null));
}

export async function saveSettingsAsGrownUp(kidId, settings) {
  const fb = await getFirebase();
  return fb.fs.updateDoc(fb.fs.doc(fb.db, 'kids', kidId), { settings, updatedAt: Date.now() });
}

export async function resetKidAsGrownUp(kidId, settings) {
  const fb = await getFirebase();
  return fb.fs.updateDoc(fb.fs.doc(fb.db, 'kids', kidId), {
    progress: freshProgress(localDateKey(), settings.streakGoal),
    settings: { ...settings, resetAt: Date.now() },
    updatedAt: Date.now(),
  });
}
