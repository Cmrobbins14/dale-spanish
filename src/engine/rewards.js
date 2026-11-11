// XP, levels, the personal league and trophies.
// XP only ever goes up. Nothing here can take earned progress away.

import { weekStart, addDays, daysBetween } from './dates.js';

export const XP = {
  great: 5,
  good: 4,
  effort: 2, // tried, then chose "Keep going"
  selfcheck: 3,
  listen: 3,
  comboStep: 1, // bonus per answer in a row
  comboMax: 3,
  lessonDone: 15,
  perfectLesson: 10,
  reviewDone: 10,
  freeTalk: 20,
};

/** XP for one spoken answer, given the current combo (answers in a row). */
export function speakXp(outcome, combo) {
  const base = XP[outcome] ?? 0;
  const bonus = outcome === 'great' || outcome === 'good' ? Math.min(XP.comboMax, Math.max(0, combo - 1) * XP.comboStep) : 0;
  return { base, bonus, total: base + bonus };
}

/** Level n needs 100 + 50·(n−1) XP to finish. */
export function levelFromXp(xp) {
  let level = 1, start = 0, need = 100;
  while (xp >= start + need) {
    start += need;
    level += 1;
    need = 100 + (level - 1) * 50;
  }
  return { level, into: xp - start, need, pct: (xp - start) / need };
}

// ---------- Personal league ----------
// No strangers: he competes with last week's self. Beat last week's XP
// (and earn at least LEAGUE_MIN) to move up. Tiers never go down.

export const TIERS = [
  { name: 'Bronce', color: '#C7834A' },
  { name: 'Plata', color: '#9AA6B8' },
  { name: 'Oro', color: '#F2B705' },
  { name: 'Platino', color: '#4FC1C9' },
  { name: 'Esmeralda', color: '#20B26B' },
  { name: 'Diamante', color: '#5B8CFF' },
  { name: 'Leyenda', color: '#8E5CF7' },
];
export const LEAGUE_MIN = 40;

export function weekXp(days, monday) {
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += days[addDays(monday, i)]?.xp || 0;
  return sum;
}

export function initialLeague(today) {
  return { tier: 0, week: weekStart(today), history: [] };
}

/** Close any finished weeks. Returns { league, promoted: tierIndex|null }. */
export function settleLeague(league, days, today) {
  const thisWeek = weekStart(today);
  let l = { ...league, history: [...(league.history || [])] };
  let promoted = null;
  while (daysBetween(l.week, thisWeek) >= 7) {
    const xp = weekXp(days, l.week);
    const prev = weekXp(days, addDays(l.week, -7));
    const up = xp >= LEAGUE_MIN && xp > prev && l.tier < TIERS.length - 1;
    if (up) { l.tier += 1; promoted = l.tier; }
    l.history = [...l.history, { week: l.week, xp, up }].slice(-26);
    l.week = addDays(l.week, 7);
  }
  return { league: l, promoted };
}

/** XP needed this week to move up. */
export function leagueTarget(days, today) {
  const lastWeek = weekXp(days, addDays(weekStart(today), -7));
  return Math.max(LEAGUE_MIN, lastWeek + 1);
}

// ---------- Trophies ----------

export const TROPHIES = [
  { id: 'first-lesson', icon: '🎉', name: 'First lesson', desc: 'Finished your very first lesson' },
  { id: 'first-words', icon: '🗣️', name: 'First words', desc: 'Said 10 phrases out loud' },
  { id: 'phrases-100', icon: '💯', name: '100 phrases', desc: 'Said 100 phrases out loud' },
  { id: 'phrases-500', icon: '🎙️', name: 'Chatterbox', desc: 'Said 500 phrases out loud' },
  { id: 'perfect', icon: '⭐', name: 'Perfect lesson', desc: 'Every answer counted, first try' },
  { id: 'streak-3', icon: '🔥', name: '3-day streak', desc: '3 days in a row' },
  { id: 'streak-7', icon: '🔥', name: 'Week streak', desc: '7 days in a row' },
  { id: 'streak-14', icon: '🔥', name: '2-week streak', desc: '14 days in a row' },
  { id: 'streak-30', icon: '🏅', name: 'Month streak', desc: '30 days in a row' },
  { id: 'streak-50', icon: '🏆', name: '50-day streak', desc: '50 days in a row' },
  { id: 'streak-100', icon: '👑', name: '100-day streak', desc: '100 days in a row' },
  { id: 'streak-goal', icon: '🎯', name: 'Goal getter', desc: 'Reached your streak goal' },
  { id: 'unit-1', icon: '🥇', name: 'Unit champ', desc: 'Finished a whole unit' },
  { id: 'units-4', icon: '🗺️', name: 'Explorer', desc: 'Finished 4 units' },
  { id: 'course', icon: '🏟️', name: 'Campeón', desc: 'Finished the whole course' },
  { id: 'review-10', icon: '🧠', name: 'Sharp mind', desc: 'Did 10 Smart Reviews' },
  { id: 'roleplay', icon: '🎭', name: 'On stage', desc: 'Finished a roleplay' },
  { id: 'xp-1000', icon: '⚡', name: '1,000 XP', desc: 'Earned 1,000 XP' },
  { id: 'league-oro', icon: '🥇', name: 'Liga Oro', desc: 'Reached the Oro league' },
  { id: 'free-talk', icon: '💬', name: 'Free talker', desc: 'Finished a Free Talk' },
];

/**
 * Which trophies are now earned but weren't before.
 * @param {object} p progress
 * @param {{unitsDone:number, totalUnits:number}} course
 */
export function newTrophies(p, course) {
  const has = p.trophies || {};
  const s = p.stats || {};
  const best = p.streak?.best || 0;
  const checks = {
    'first-lesson': (s.lessonsDone || 0) >= 1,
    'first-words': (s.spokenOk || 0) >= 10,
    'phrases-100': (s.spokenOk || 0) >= 100,
    'phrases-500': (s.spokenOk || 0) >= 500,
    perfect: (s.perfectLessons || 0) >= 1,
    'streak-3': best >= 3,
    'streak-7': best >= 7,
    'streak-14': best >= 14,
    'streak-30': best >= 30,
    'streak-50': best >= 50,
    'streak-100': best >= 100,
    'streak-goal': (p.streak?.goalsReached?.length || 0) >= 1,
    'unit-1': course.unitsDone >= 1,
    'units-4': course.unitsDone >= 4,
    course: course.totalUnits > 0 && course.unitsDone >= course.totalUnits,
    'review-10': (s.reviews || 0) >= 10,
    roleplay: (s.roleplays || 0) >= 1,
    'xp-1000': (p.xp || 0) >= 1000,
    'league-oro': (p.league?.tier || 0) >= 2,
    'free-talk': (s.freeTalks || 0) >= 1,
  };
  return TROPHIES.filter((t) => !has[t.id] && checks[t.id]).map((t) => t.id);
}
