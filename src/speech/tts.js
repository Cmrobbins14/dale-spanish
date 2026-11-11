// Text-to-speech with the browser's built-in voices (speechSynthesis).
//
// Why the extra care:
// - Voices load asynchronously (empty list at first, then "voiceschanged").
// - iOS only plays audio that starts from a tap, so we "unlock" on first tap.
// - Safari sometimes never fires "end", so every speak() has a time-out.

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

let voicesReady = null;
let chosen = { es: null, en: null };

export const RATES = { normal: 0.92, slow: 0.62, coach: 1.0 };

function loadVoices() {
  if (!synth) return Promise.resolve([]);
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const have = synth.getVoices();
    if (have.length) return resolve(have);
    const done = () => resolve(synth.getVoices());
    synth.addEventListener?.('voiceschanged', done, { once: true });
    setTimeout(done, 2500); // some browsers never fire the event
  });
  return voicesReady;
}

// Higher score = better voice. Prefer Mexican Spanish, then US Spanish,
// then any Spanish; prefer "Enhanced"/"Premium" voices.
const QUALITY = /enhanced|premium|neural|natural|siri/i;
const GOOD_ES = /paulina|juan|m[oó]nica|sof[ií]a|daniela|ang[eé]lica|google español de estados unidos/i;
const GOOD_EN = /samantha|ava|allison|nicky|alex|google us english|aaron|evan|zoe/i;

export function rankVoice(voice, want) {
  const lang = (voice.lang || '').replace('_', '-').toLowerCase();
  let score = 0;
  if (want === 'es') {
    if (!lang.startsWith('es')) return -1;
    score += lang === 'es-mx' ? 100 : lang === 'es-us' ? 80 : lang.startsWith('es-419') ? 70 : 40;
    if (GOOD_ES.test(voice.name)) score += 10;
  } else {
    if (!lang.startsWith('en')) return -1;
    score += lang === 'en-us' ? 100 : 60;
    if (GOOD_EN.test(voice.name)) score += 10;
  }
  // On iPad, "Enhanced"/"Premium" shows up in the voice's ID, not its name
  // (e.g. com.apple.voice.enhanced.es-MX.Paulina), so check both.
  const id = `${voice.name} ${voice.voiceURI || ''}`;
  if (/premium/i.test(id)) score += 35;
  else if (QUALITY.test(id)) score += 25;
  if (/\bcompact\b|\.compact\./i.test(id)) score -= 5;
  if (voice.localService) score += 3;
  // Novelty voices on Apple devices sound silly for lessons.
  if (/bells|bubbles|cellos|whisper|zarvox|trinoids|bad news|good news|organ|boing|jester|superstar|wobble|albert|fred|junior|ralph|kathy|bahh|grandma|grandpa|rocko|shelley|flo|eddy|reed|sandy/i.test(voice.name)) score -= 80;
  return score;
}

export async function pickVoices() {
  const voices = await loadVoices();
  const best = (want) => voices
    .map((v) => ({ v, s: rankVoice(v, want) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)[0]?.v || null;
  chosen = { es: best('es'), en: best('en') };
  return chosen;
}

// Voices can finish loading (or be downloaded) after the app starts:
// pick again whenever the list changes.
if (synth?.addEventListener) {
  synth.addEventListener('voiceschanged', () => { voicesReady = null; picked = pickVoices(); });
}

export function hasSpanishVoice() {
  return !!chosen.es;
}

/** Call from the first tap so iOS lets us play speech later. */
let unlocked = false;
export function unlockAudio() {
  if (unlocked || !synth) return;
  unlocked = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  } catch { /* ignore */ }
  pickVoices();
}

let speakToken = 0;

/**
 * Speak text. Resolves when finished (or after a safety time-out).
 * @param {string} text
 * @param {{lang?:'es'|'en', rate?:number, onBoundary?:Function}} opts
 */
export async function speak(text, { lang = 'es', rate, onWord } = {}) {
  if (!synth || !text) return;
  if (window.__TEST_FAST_TTS) { onWord?.(-1); return; }
  await pickVoicesOnce();
  const token = ++speakToken;
  // iPad Safari quietly drops an utterance queued right after cancel(), so
  // only cancel when something is playing, then give it a moment to settle.
  if (synth.speaking || synth.pending) {
    synth.cancel();
    await new Promise((r) => setTimeout(r, 80));
  }
  if (token !== speakToken) return; // a newer speak() took over
  // Spoken text shouldn't include blanks/slots or emoji.
  const clean = String(text).replace(/_+/g, ' ').replace(/\p{Extended_Pictographic}/gu, '');
  const u = new SpeechSynthesisUtterance(clean);
  const voice = chosen[lang];
  if (voice) u.voice = voice;
  u.lang = voice?.lang || (lang === 'es' ? 'es-MX' : 'en-US');
  u.rate = rate ?? (lang === 'es' ? RATES.normal : RATES.coach);
  u.pitch = lang === 'en' ? 1.05 : 1;
  return new Promise((resolve) => {
    let done = false;
    let started = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    u.onstart = () => { started = true; };
    u.onend = finish;
    u.onerror = finish;
    if (onWord) u.onboundary = (e) => { if (token === speakToken) onWord(e.charIndex); };
    // Safety net: estimate duration from length and rate.
    const ms = 1200 + (clean.length * 75) / u.rate;
    setTimeout(finish, ms + 1500);
    synth.speak(u);
    // If Safari silently dropped it, try once more.
    setTimeout(() => {
      if (!started && !done && token === speakToken) {
        const again = new SpeechSynthesisUtterance(clean);
        Object.assign(again, { voice: u.voice, lang: u.lang, rate: u.rate, pitch: u.pitch, onend: finish, onerror: finish });
        synth.cancel();
        synth.speak(again);
      }
    }, 1200);
  });
}

let picked = null;
function pickVoicesOnce() {
  if (!picked) picked = pickVoices();
  return picked;
}

export function stopSpeaking() {
  speakToken++;
  synth?.cancel();
}

export function isSpeaking() {
  return !!synth?.speaking;
}
