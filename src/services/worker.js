// Talks to the optional Cloudflare Worker (folder /worker).
// Every request carries the signed-in user's Firebase ID token, which the
// worker verifies, so only family accounts can use it.

import { WORKER_URL } from '../config/worker-config.js';
import { getIdToken, firebaseEnabled } from './firebase.js';

const state = { checked: false, transcribe: false, tutor: false, signedIn: false };

/** Ask the worker which features it has (called once at start-up). */
export async function checkWorker() {
  state.checked = true;
  if (!WORKER_URL || !firebaseEnabled) return state;
  try {
    const res = await fetch(`${WORKER_URL.replace(/\/$/, '')}/health`);
    const j = await res.json();
    state.transcribe = !!j.transcribe;
    state.tutor = !!j.tutor;
  } catch {
    state.transcribe = false;
    state.tutor = false;
  }
  return state;
}

export function setWorkerSignedIn(v) { state.signedIn = v; }
export const transcribeAvailable = () => state.transcribe && state.signedIn;
export const tutorAvailable = () => state.tutor && state.signedIn;

async function call(path, body, isBinary = false) {
  const token = await getIdToken();
  if (!token) throw new Error('not-signed-in');
  const res = await fetch(`${WORKER_URL.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(isBinary ? { 'Content-Type': body.type || 'application/octet-stream' } : { 'Content-Type': 'application/json' }),
    },
    body: isBinary ? body : JSON.stringify(body),
  });
  if (res.status === 429) throw new Error('daily-limit');
  if (!res.ok) throw new Error(`worker-${res.status}`);
  return res.json();
}

/** Send one recorded clip, get back what was heard (Spanish). */
export async function transcribeClip(blob) {
  const j = await call('/transcribe', blob, true);
  return j.text || '';
}

/** Free Talk / Ask the coach. */
export function tutorChat(payload) {
  return call('/chat', payload);
}
