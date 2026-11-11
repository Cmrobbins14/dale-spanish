// Small sound effects, synthesized with Web Audio (no audio files to load).

let ctx = null;
let enabled = true;
export function setSoundEnabled(on) { enabled = on; }

function ac() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Unlock audio on iOS: call from a tap. */
export function unlockSfx() { ac(); }

function tone(freq, start, dur, { type = 'sine', gain = 0.18, slide = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

const SOUNDS = {
  great: () => { tone(660, 0, 0.12, { type: 'triangle' }); tone(880, 0.09, 0.14, { type: 'triangle' }); tone(1320, 0.18, 0.22, { type: 'triangle', gain: 0.14 }); },
  good: () => { tone(587, 0, 0.12, { type: 'triangle' }); tone(784, 0.1, 0.2, { type: 'triangle' }); },
  notyet: () => { tone(440, 0, 0.14, { type: 'sine', gain: 0.12 }); tone(494, 0.12, 0.18, { type: 'sine', gain: 0.1 }); },
  tap: () => tone(520, 0, 0.05, { type: 'triangle', gain: 0.08 }),
  listen: () => tone(740, 0, 0.09, { type: 'sine', gain: 0.12, slide: 1.3 }),
  levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.25, { type: 'triangle', gain: 0.15 })),
  whistle: () => { tone(2100, 0, 0.12, { type: 'square', gain: 0.05 }); tone(2300, 0.14, 0.28, { type: 'square', gain: 0.05 }); },
};

export function sfx(name) {
  if (!enabled) return;
  try { SOUNDS[name]?.(); } catch { /* audio not available */ }
}
