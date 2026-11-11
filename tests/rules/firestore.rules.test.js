import { readFileSync } from 'node:fs';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs } from 'firebase/firestore';

let env;
const KID = 'kid1';
const KID2 = 'kid2';
const GROWN = 'grown1';
const STRANGER = 'stranger';

const kidDoc = (parentUid) => ({ parentUid, profile: { nickname: 'Leo' }, settings: { dailyGoalMin: 10 }, progress: { xp: 0 }, updatedAt: 1 });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-spanish',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'kids', KID), kidDoc(GROWN));
    await setDoc(doc(db, 'kids', KID2), kidDoc('someoneElse'));
    await setDoc(doc(db, 'users', GROWN), { role: 'grownup', kids: [{ id: KID }] });
    await addDoc(collection(db, 'kids', KID, 'sessions'), { kind: 'lesson', xp: 30 });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();

describe('learner', () => {
  it('can read and update their own document', async () => {
    await assertSucceeds(getDoc(doc(as(KID), 'kids', KID)));
    await assertSucceeds(updateDoc(doc(as(KID), 'kids', KID), { progress: { xp: 50 }, updatedAt: 2 }));
  });
  it("can NOT read another learner's data", async () => {
    await assertFails(getDoc(doc(as(KID), 'kids', KID2)));
    await assertFails(getDocs(collection(as(KID), 'kids', KID2, 'sessions')));
  });
  it('can NOT change who their grown-up is', async () => {
    await assertFails(updateDoc(doc(as(KID), 'kids', KID), { parentUid: STRANGER }));
  });
  it('can NOT add unexpected fields', async () => {
    await assertFails(updateDoc(doc(as(KID), 'kids', KID), { hacked: true }));
  });
  it('can add to, but not rewrite, the activity log', async () => {
    await assertSucceeds(addDoc(collection(as(KID), 'kids', KID, 'sessions'), { kind: 'lesson' }));
    const snap = await getDocs(collection(as(KID), 'kids', KID, 'sessions'));
    await assertFails(updateDoc(snap.docs[0].ref, { xp: 9999 }));
    await assertFails(deleteDoc(snap.docs[0].ref));
  });
  it('can not delete their document', async () => {
    await assertFails(deleteDoc(doc(as(KID), 'kids', KID)));
  });
  it('can create their own document only for themselves', async () => {
    await assertSucceeds(setDoc(doc(as('newKid'), 'kids', 'newKid'), kidDoc(GROWN)));
    await assertFails(setDoc(doc(as('newKid'), 'kids', 'otherKid'), kidDoc(GROWN)));
  });
});

describe('linked grown-up', () => {
  it("can read the learner's data and activity", async () => {
    await assertSucceeds(getDoc(doc(as(GROWN), 'kids', KID)));
    await assertSucceeds(getDocs(collection(as(GROWN), 'kids', KID, 'sessions')));
  });
  it('can change settings and reset progress', async () => {
    await assertSucceeds(updateDoc(doc(as(GROWN), 'kids', KID), { settings: { dailyGoalMin: 15 }, updatedAt: 3 }));
    await assertSucceeds(updateDoc(doc(as(GROWN), 'kids', KID), { progress: { xp: 0 }, updatedAt: 4 }));
  });
  it('can NOT change the profile or the link', async () => {
    await assertFails(updateDoc(doc(as(GROWN), 'kids', KID), { profile: { nickname: 'X' } }));
    await assertFails(updateDoc(doc(as(GROWN), 'kids', KID), { parentUid: STRANGER }));
  });
  it('can NOT read a learner they are not linked to', async () => {
    await assertFails(getDoc(doc(as(GROWN), 'kids', KID2)));
  });
  it('can read and write only their own user record', async () => {
    await assertSucceeds(getDoc(doc(as(GROWN), 'users', GROWN)));
    await assertFails(getDoc(doc(as(KID), 'users', GROWN)));
  });
});

describe('everyone else', () => {
  it('signed-out visitors can read nothing', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'kids', KID)));
    await assertFails(getDoc(doc(anon, 'users', GROWN)));
  });
  it('a stranger account can read nothing', async () => {
    await assertFails(getDoc(doc(as(STRANGER), 'kids', KID)));
    await assertFails(getDocs(collection(as(STRANGER), 'kids', KID, 'sessions')));
    await assertFails(updateDoc(doc(as(STRANGER), 'kids', KID), { settings: {} }));
  });
});
