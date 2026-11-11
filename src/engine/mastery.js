// Concept mastery + spaced repetition ("SM-2 lite").
//
// Every phrase frame and key word is a "concept". Each time he uses one —
// in a drill, Q&A, roleplay or review — we update:
//   acc      running pronunciation accuracy (0–1)
//   reps     correct-in-a-row reviews on different days
//   interval days until it should come back
//   due      next review date
//   mastery  0–100, blending accuracy and how well it has stuck over time
// Struggling never takes mastery below what accuracy supports, and it
// just brings the concept back sooner. No penalties.

import { addDays, daysBetween } from './dates.js';

export function newConcept() {
  return { reps: 0, ease: 2.5, interval: 0, due: null, acc: null, mastery: 0, seen: 0, ok: 0, last: null };
}

/** Outcome → SM-2 quality (0–5). */
export function qualityOf(outcome) {
  return { great: 5, good: 4, selfcheck: 4, listen: 4, notyet: 2, skipped: 1 }[outcome] ?? 3;
}

/**
 * @param {object|undefined} c  existing concept state
 * @param {string} outcome  'great' | 'good' | 'notyet' | 'selfcheck' | 'listen' | 'skipped'
 * @param {number|null} score  speech score 0–1 (null when not spoken)
 * @param {string} today  "YYYY-MM-DD"
 */
export function updateConcept(c, outcome, score, today) {
  const s = { ...(c || newConcept()) };
  const q = qualityOf(outcome);
  s.seen += 1;
  if (q >= 3) s.ok += 1;
  if (typeof score === 'number') s.acc = s.acc == null ? score : 0.7 * s.acc + 0.3 * score;
  else if (s.acc == null && q >= 4) s.acc = 0.8;

  // Only the first practice of a day moves the schedule; repeats within the
  // same lesson shouldn't inflate the interval.
  const firstToday = s.last !== today;
  if (firstToday) {
    if (q >= 3) {
      s.reps += 1;
      s.interval = s.reps === 1 ? 1 : s.reps === 2 ? 3 : Math.round(s.interval * s.ease);
    } else {
      s.reps = 0;
      s.interval = 1;
    }
    s.ease = Math.max(1.3, s.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    s.due = addDays(today, s.interval);
  } else if (q < 3) {
    s.due = addDays(today, 1);
  }
  s.last = today;
  s.mastery = masteryOf(s);
  return s;
}

export function masteryOf(s) {
  const acc = s.acc ?? 0;
  const stick = Math.min(1, s.reps / 4);
  return Math.round(100 * (0.6 * acc + 0.4 * stick));
}

/** Concepts due for review today, weakest first. */
export function dueConcepts(concepts, today, limit = 10) {
  return Object.entries(concepts || {})
    .filter(([, c]) => c.due && daysBetween(c.due, today) >= 0)
    .sort(([, a], [, b]) => a.mastery - b.mastery || (a.due < b.due ? -1 : 1))
    .slice(0, limit)
    .map(([id]) => id);
}

/** Weakest practiced concepts (for review when nothing is due, and the grown-up view). */
export function weakestConcepts(concepts, limit = 10) {
  return Object.entries(concepts || {})
    .filter(([, c]) => c.seen > 0)
    .sort(([, a], [, b]) => a.mastery - b.mastery)
    .slice(0, limit)
    .map(([id]) => id);
}

export function overallMastery(concepts, totalConcepts) {
  const vals = Object.values(concepts || {}).map((c) => c.mastery);
  if (!totalConcepts) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / totalConcepts);
}
