// Speech scoring: pure functions, no browser APIs, fully unit-tested.
//
// Philosophy: an 11-year-old English speaker is learning. We want to reward
// a real attempt at the right words, forgive accent and recognizer noise,
// and still notice when he said something unrelated.
//
//   1. Normalize everything (lowercase, no accents/punctuation, digits → words).
//   2. Compare word by word with fuzzy similarity (spelling AND sound-alike).
//   3. Align target words to heard words in order, take the share matched.
//   4. Use the best of all the alternatives the recognizer offered.

import { numberToSpanish, NUMBER_WORDS } from './numbers.js';
import { SCORING } from '../config/scoring-config.js';

// ---------- normalizing ----------

export function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** "¡Tengo 11 años!" → "tengo once anos" */
export function normalize(text) {
  let s = String(text ?? '').toLowerCase();
  // Times like "3:30" → "tres treinta" ("3:00" → "tres").
  s = s.replace(/(\d{1,2}):(\d{2})/g, (_, h, m) =>
    ` ${numberToSpanish(+h)}${+m ? ' ' + numberToSpanish(+m) : ''} `);
  s = s.replace(/\d+/g, (d) => ` ${numberToSpanish(+d)} `);
  s = stripAccents(s); // also turns ñ into n
  s = s.replace(/[^a-z\s]/g, ' '); // drops ¿ ¡ . , ! ? ' - and anything else
  return s.replace(/\s+/g, ' ').trim();
}

export function tokenize(text) {
  const n = normalize(text);
  return n ? n.split(' ') : [];
}

// ---------- comparing single words ----------

/**
 * A rough "how it sounds" key for Spanish, so spelling differences that
 * sound the same still match: hola/ola, vaca/baca, casa/caza, llama/yama.
 */
export function soundKey(w) {
  return w
    .replace(/ll/g, 'y')
    .replace(/^h/, '')
    .replace(/([^c])h/g, '$1') // silent h, but keep "ch"
    .replace(/qu/g, 'k')
    .replace(/c([aou])/g, 'k$1')
    .replace(/c([ei])/g, 's$1')
    .replace(/z/g, 's')
    .replace(/v/g, 'b')
    .replace(/g([ei])/g, 'j$1')
    .replace(/(.)\1+/g, '$1');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function ratio(a, b) {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// Common things a Spanish recognizer hears when an English speaker says a
// short word. These count as "close" (0.9), so they pass with a polish hint.
const ALIASES = {
  hola: ['ola', 'olla'],
  si: ['see', 'c', 'se'],
  yo: ['jo', 'lo', 'io'],
  el: ['l', 'al', 'ele'],
  y: ['e', 'i'],
  me: ['mi', 'may'],
  mi: ['me'],
  tu: ['to', 'two'],
  de: ['d', 'the'],
  tengo: ['tango'],
  gracias: ['gracia'],
  adios: ['adio'],
  es: ['ese', 's'],
};

/** 0–1: how alike two normalized words are, by spelling or by sound. */
export function wordSimilarity(target, heard) {
  if (!target || !heard) return 0;
  if (target === heard) return 1;
  const bySound = soundKey(target) === soundKey(heard) ? 1 : ratio(soundKey(target), soundKey(heard));
  let s = Math.max(ratio(target, heard), bySound);
  if (ALIASES[target]?.includes(heard)) s = Math.max(s, 0.9);
  return s;
}

// ---------- aligning a phrase ----------

function settingsFor(leniency) {
  return SCORING[leniency] || SCORING.standard;
}

// Tiny words (el, la, y, de) carry less meaning: weigh them half, so missing
// one doesn't sink an otherwise great answer.
const weightOf = (w) => (w.length <= 2 ? 0.5 : 1);

/**
 * Align target words to heard words, in order, maximizing total similarity.
 * Returns one entry per target word: { sim, heardIndex } (heardIndex -1 = missed).
 */
export function alignWords(target, heard, cfg) {
  const n = target.length, m = heard.length;
  const threshold = (w) => (w.length <= 3 ? cfg.shortWordMatch : cfg.wordMatch);
  const sims = target.map((t) => heard.map((h) => wordSimilarity(t, h)));
  // dp[i][j]: best total for first i target words vs first j heard words.
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = Math.max(dp[i - 1][j], dp[i][j - 1]);
      const s = sims[i - 1][j - 1];
      if (s >= threshold(target[i - 1])) best = Math.max(best, dp[i - 1][j - 1] + s * weightOf(target[i - 1]));
      dp[i][j] = best;
    }
  }
  // Walk back to find which pairs were used.
  const out = target.map(() => ({ sim: 0, heardIndex: -1 }));
  let i = n, j = m;
  while (i > 0 && j > 0) {
    const s = sims[i - 1][j - 1];
    const used = s >= threshold(target[i - 1]) &&
      Math.abs(dp[i][j] - (dp[i - 1][j - 1] + s * weightOf(target[i - 1]))) < 1e-9;
    if (used) { out[i - 1] = { sim: s, heardIndex: j - 1 }; i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return out;
}

function creditFor(sim, cfg) {
  if (sim <= 0) return 0;
  return sim >= cfg.polishBelow ? 1 : 0.85;
}

export function outcomeFor(score, leniency = 'standard') {
  const cfg = settingsFor(leniency);
  if (score >= cfg.great) return 'great';
  if (score >= cfg.good) return 'good';
  return 'notyet';
}

/**
 * Score one spoken attempt against a target phrase.
 * @param {string} targetText  e.g. "¿Quieres jugar al fútbol?"
 * @param {string[]} alternatives  what the recognizer heard (best guesses)
 * @returns {{score:number, outcome:string, heard:string, words:{text:string,matched:boolean,polish:boolean}[]}}
 */
export function scoreAttempt(targetText, alternatives, { leniency = 'standard' } = {}) {
  const cfg = settingsFor(leniency);
  // Keep the original display words (with accents) mapped to normalized ones.
  const display = String(targetText).split(/\s+/).filter(Boolean)
    .map((text) => ({ text, norm: tokenize(text) }))
    .filter((d) => d.norm.length);
  const target = display.flatMap((d) => d.norm);
  const totalWeight = target.reduce((s, w) => s + weightOf(w), 0) || 1;

  let best = null;
  for (const alt of (alternatives || []).filter((a) => typeof a === 'string')) {
    const heard = tokenize(alt);
    const aligned = alignWords(target, heard, cfg);
    const got = aligned.reduce((s, a, k) => s + creditFor(a.sim, cfg) * weightOf(target[k]), 0);
    const score = Math.round((got / totalWeight) * 1000) / 1000;
    if (!best || score > best.score) best = { score, aligned, heard: alt };
  }
  if (!best) best = { score: 0, aligned: target.map(() => ({ sim: 0 })), heard: '' };

  // Map aligned normalized words back onto display words.
  let k = 0;
  const words = display.map((d) => {
    const parts = best.aligned.slice(k, k + d.norm.length);
    k += d.norm.length;
    const matched = parts.every((p) => p.sim > 0);
    return { text: d.text, matched, polish: matched && parts.some((p) => p.sim < cfg.polishBelow) };
  });
  return { score: best.score, outcome: outcomeFor(best.score, leniency), heard: best.heard, words };
}

// ---------- open answers with slots ----------

// Words that are part of the frame, not part of a name.
const NAME_STOP = new Set(['me', 'llamo', 'soy', 'yo', 'mi', 'nombre', 'es', 'se', 'llama',
  'hola', 'um', 'eh', 'este', 'pues', 'el', 'la', 'y']);

function parsePattern(pattern) {
  return String(pattern).split(/\s+/).filter(Boolean).flatMap((tok) => {
    const m = tok.match(/^[¿¡]?\{(\w+)\}[?!.,]*$/);
    if (m) return [{ slot: m[1] }];
    return tokenize(tok).map((w) => ({ word: w }));
  });
}

function slotMatch(type, segment, slotLists, cfg) {
  if (!segment.length) return null;
  if (type === 'number') {
    const nums = segment.filter((w) => NUMBER_WORDS.has(w));
    return nums.length ? nums.join(' ') : null;
  }
  if (type === 'name') {
    const words = segment.filter((w) => !NAME_STOP.has(w) && w.length >= 2);
    if (!words.length) return null;
    return words.slice(0, 2).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  }
  const list = slotLists?.[type];
  if (Array.isArray(list) && list.length) {
    // Typed slot: any listed option, fuzzily, anywhere in the segment.
    for (const option of list) {
      const opt = tokenize(option);
      const al = alignWords(opt, segment, cfg);
      const share = al.filter((a) => a.sim > 0).length / opt.length;
      if (share >= 0.5) return option;
    }
    return null;
  }
  // Untyped slot ({any}, {noun}, …): any real word counts.
  const words = segment.filter((w) => w.length >= 2);
  return words.length ? words.join(' ') : null;
}

/**
 * Score an "answer on your own" reply against patterns like
 * "me llamo {name}", "tengo {number} años", "me gusta {food}".
 * @returns {{score, outcome, heard, pattern, values: Object}}
 */
export function scoreOpen(alternatives, patterns, { leniency = 'standard', slots = {} } = {}) {
  const cfg = settingsFor(leniency);
  let best = { score: 0, outcome: 'notyet', heard: alternatives?.[0] || '', pattern: null, values: {} };
  for (const pattern of patterns || []) {
    const parts = parsePattern(pattern);
    const fixed = parts.map((p, i) => ({ ...p, i })).filter((p) => p.word);
    for (const alt of (alternatives || []).filter((a) => typeof a === 'string')) {
      const heard = tokenize(alt);
      if (!heard.length) continue;
      const aligned = alignWords(fixed.map((f) => f.word), heard, cfg);
      const heardAt = {}; // pattern index → heard index for matched fixed words
      fixed.forEach((f, k) => { if (aligned[k].heardIndex >= 0) heardAt[f.i] = aligned[k].heardIndex; });

      let got = 0, total = 0;
      fixed.forEach((f, k) => { total += weightOf(f.word); got += creditFor(aligned[k].sim, cfg) * weightOf(f.word); });

      const values = {};
      parts.forEach((p, i) => {
        if (!p.slot) return;
        total += 1;
        // The slot's words lie between the nearest matched fixed words around it.
        let from = 0, to = heard.length;
        for (let a = i - 1; a >= 0; a--) if (heardAt[a] !== undefined) { from = heardAt[a] + 1; break; }
        for (let b = i + 1; b < parts.length; b++) if (heardAt[b] !== undefined) { to = heardAt[b]; break; }
        const value = slotMatch(p.slot, heard.slice(from, to), slots, cfg);
        if (value) { got += 1; values[p.slot] = value; }
      });

      const score = Math.round((got / (total || 1)) * 1000) / 1000;
      if (score > best.score) best = { score, outcome: outcomeFor(score, leniency), heard: alt, pattern, values };
    }
  }
  return best;
}
