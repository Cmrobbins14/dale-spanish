// Listening: turn the learner's voice into text alternatives.
//
// Three engines, chosen automatically (see chooseEngine):
//   "cloud"     – record with MediaRecorder, transcribe on our Cloudflare Worker
//                 (Whisper). Works in the Home Screen app; the same clip is
//                 used for "hear yourself" playback.
//   "webspeech" – Safari/Chrome built-in recognition. Live word highlighting.
//                 NOT available in iOS Home Screen web apps (WebKit bug 225298),
//                 and on iOS 27 it can stall after speech plays (bug 321436),
//                 so we use the documented workarounds and a stall detector.
//   "selfcheck" – no listening; the learner taps "I said it!".

import { transcribeAvailable, transcribeClip } from '../services/worker.js';
import { createRecorder, recordingSupported } from './recorder.js';

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export const isIOS = typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const isStandalone = typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

// Remembered problems for this app run (a stall can't be fixed without a restart).
const health = { webspeechBroken: false, stalls: 0, denied: false, lastReason: '' };
export const listenHealth = health;

/**
 * Which engine to use. `preference` comes from grown-up settings:
 * "auto" | "cloud" | "webspeech" | "selfcheck".
 */
export function chooseEngine(preference = 'auto') {
  const cloudOk = transcribeAvailable() && recordingSupported();
  const webOk = !!SR && !health.webspeechBroken && !health.denied && !(isIOS && isStandalone);
  if (preference === 'selfcheck') return 'selfcheck';
  if (preference === 'cloud' && cloudOk) return 'cloud';
  if (preference === 'webspeech' && webOk) return 'webspeech';
  if (cloudOk) return 'cloud';
  if (webOk) return 'webspeech';
  return 'selfcheck';
}

/** Short reason text for the grown-up note when we fall back to self-check. */
export function whyNoListening() {
  if (health.denied) return 'denied';
  if (isIOS && isStandalone && !transcribeAvailable()) return 'homescreen';
  if (health.webspeechBroken) return 'stalled';
  if (!SR && !transcribeAvailable()) return 'unsupported';
  return '';
}

// ---------------- Web Speech engine ----------------

let rec = null; // reuse ONE recognizer: new instances can re-prompt on iOS
let recBusy = false;
let recEnded = Promise.resolve();

function waitForIdle(ms) {
  return Promise.race([recEnded, new Promise((r) => setTimeout(r, ms))]);
}

/**
 * Listen once with the built-in recognizer.
 * Resolves { alternatives: string[], engine } — empty alternatives = heard nothing.
 * Rejects { code: 'denied' | 'unsupported' | 'stalled' }.
 */
async function listenWebSpeech({ onInterim, onLevel, maxMs = 9000, signal }) {
  if (!SR) throw { code: 'unsupported' };
  if (recBusy) await waitForIdle(1500);
  if (!rec) rec = new SR();
  rec.lang = 'es-MX';
  rec.interimResults = true;
  rec.maxAlternatives = 5;
  rec.continuous = false; // continuous mode is unreliable in Safari

  return new Promise((resolve, reject) => {
    let latest = [];
    let gotAny = false;
    let settled = false;
    let endResolve;
    recEnded = new Promise((r) => { endResolve = r; });
    recBusy = true;

    const settle = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const finishWithWhatWeHave = () => settle(() => {
      if (gotAny) health.stalls = 0;
      resolve({ alternatives: latest, engine: 'webspeech' });
    });

    rec.onstart = () => onLevel?.(0.3);
    rec.onaudiostart = () => onLevel?.(0.4);
    rec.onspeechstart = () => onLevel?.(0.8);
    rec.onresult = (e) => {
      gotAny = true;
      // Build whole-utterance alternatives: earlier results use their top
      // choice; the last result contributes each of its alternatives.
      const results = Array.from(e.results);
      const head = results.slice(0, -1).map((r) => r[0]?.transcript || '').join(' ');
      const last = results[results.length - 1];
      const alts = Array.from(last || []).map((a) => `${head} ${a.transcript}`.trim());
      latest = alts.length ? alts : latest;
      onInterim?.(latest[0] || '', !!last?.isFinal);
    };
    rec.onerror = (e) => {
      const err = e.error;
      if (err === 'not-allowed') { health.denied = true; settle(() => reject({ code: 'denied' })); }
      else if (err === 'service-not-allowed' || err === 'language-not-supported') {
        health.webspeechBroken = true; health.lastReason = err;
        settle(() => reject({ code: 'unsupported' }));
      }
      // 'no-speech', 'aborted', 'network': fall through to onend.
    };
    rec.onend = () => {
      recBusy = false;
      endResolve();
      if (!gotAny && !settled) {
        // Started but returned nothing. Twice in a row looks like the iOS stall.
        health.stalls++;
        if (health.stalls >= 3) health.webspeechBroken = true;
      }
      finishWithWhatWeHave();
    };

    // Safety: never wait forever. We do NOT call stop()/abort() on iOS,
    // because cutting a session short triggers the iOS 27 stall.
    const timer = setTimeout(() => {
      if (!isIOS) { try { rec.stop(); } catch { /* ignore */ } }
      setTimeout(finishWithWhatWeHave, isIOS ? 0 : 900);
    }, maxMs);

    signal?.addEventListener('abort', () => {
      // "I'm done" tap: use what we have; let the recognizer end on its own.
      if (!isIOS) { try { rec.stop(); } catch { /* ignore */ } }
      setTimeout(finishWithWhatWeHave, isIOS ? 250 : 700);
    }, { once: true });

    try { rec.start(); }
    catch (err) {
      recBusy = false;
      endResolve();
      settle(() => reject({ code: 'unsupported', err }));
    }
  });
}

// ---------------- Cloud engine ----------------

async function listenCloud({ onLevel, maxMs = 8000, signal }) {
  const recorder = await createRecorder({ onLevel, maxMs, signal });
  const { blob, url, spoke } = await recorder.done;
  if (!spoke || !blob) return { alternatives: [], engine: 'cloud', audioUrl: url };
  try {
    const text = await transcribeClip(blob);
    return { alternatives: text ? [text] : [], engine: 'cloud', audioUrl: url };
  } catch (err) {
    return { alternatives: [], engine: 'cloud', audioUrl: url, error: 'network' };
  }
}

/**
 * Listen once using the chosen engine.
 * @returns {Promise<{alternatives:string[], engine:string, audioUrl?:string}>}
 */
export async function listenOnce(engine, opts) {
  if (engine === 'cloud') {
    try { return await listenCloud(opts); }
    catch (e) {
      if (e?.name === 'NotAllowedError') { health.denied = true; throw { code: 'denied' }; }
      throw { code: 'unsupported', err: e };
    }
  }
  if (engine === 'webspeech') {
    // While Safari's recognizer runs, a parallel recording is muted on iOS,
    // so only desktop browsers record alongside for playback.
    let recording = null;
    if (!isIOS && recordingSupported()) {
      try { recording = await createRecorder({ maxMs: opts.maxMs || 9000, signal: opts.signal, quiet: true }); }
      catch { recording = null; }
    }
    const result = await listenWebSpeech(opts);
    if (recording) {
      recording.stop();
      const r = await recording.done.catch(() => null);
      if (r?.spoke) result.audioUrl = r.url;
    }
    return result;
  }
  throw { code: 'unsupported' };
}
