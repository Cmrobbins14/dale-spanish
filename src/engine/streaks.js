// Streak logic, in one small pure module with thorough tests.
// A streak that breaks by mistake would be crushing, so the rules are simple:
//
// • A day COUNTS when the daily minutes goal is met (recordGoalMet).
// • `lastCovered` is the most recent day that counted (or was saved by a freeze).
// • When the app opens (reconcile), any missed days between lastCovered and
//   today are covered by streak freezes if he has enough. Otherwise the
//   streak resets to 0 (best streak is kept forever) and we say "welcome back".
// • Today is never "missed" — he has until midnight.
// • Freezes are earned: 1 for every 7 counted days, holding at most 2.

import { addDays, daysBetween } from './dates.js';

export const FREEZE_EVERY = 7;
export const MAX_FREEZES = 2;
export const STREAK_GOALS = [3, 7, 14, 30, 50, 75, 100, 150, 200, 365];
export const MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];

export function initialStreak(goal = 7, today = null) {
  return {
    current: 0,
    best: 0,
    lastCovered: null, // "YYYY-MM-DD"
    freezes: 0,
    towardFreeze: 0, // counted days since the last freeze was earned
    freezeDays: [], // dates a freeze covered (for the week view)
    goal,
    goalSetOn: today,
    goalsReached: [], // [{ goal, on }]
  };
}

/**
 * Bring the streak up to date for `today`. Pure: returns a new state.
 * @returns {{state:object, event: null | {type:'freeze-saved', days:string[]} | {type:'welcome-back', lost:number}}}
 */
export function reconcile(s, today) {
  if (!s.lastCovered) return { state: s, event: null };
  const missed = daysBetween(s.lastCovered, today) - 1;
  if (missed <= 0) return { state: s, event: null }; // also guards a clock set backwards

  if (s.current > 0 && missed <= s.freezes) {
    const days = Array.from({ length: missed }, (_, i) => addDays(s.lastCovered, i + 1));
    return {
      state: {
        ...s,
        freezes: s.freezes - missed,
        freezeDays: [...s.freezeDays, ...days].slice(-60),
        lastCovered: addDays(today, -1),
      },
      event: { type: 'freeze-saved', days },
    };
  }

  const lost = s.current;
  return {
    state: { ...s, current: 0, towardFreeze: 0, lastCovered: null },
    event: { type: 'welcome-back', lost },
  };
}

/**
 * Today's goal was met. Safe to call many times a day: only the first counts.
 * @returns {{state:object, events:object[]}}
 */
export function recordGoalMet(s, today) {
  const { state: r, event } = reconcile(s, today);
  const events = event ? [event] : [];
  if (r.lastCovered && daysBetween(r.lastCovered, today) <= 0) return { state: r, events };

  const state = { ...r, goalsReached: [...r.goalsReached] };
  state.current += 1;
  state.best = Math.max(state.best, state.current);
  state.lastCovered = today;
  state.towardFreeze += 1;
  events.push({ type: 'day-counted', current: state.current });

  if (state.towardFreeze >= FREEZE_EVERY) {
    state.towardFreeze = 0;
    if (state.freezes < MAX_FREEZES) {
      state.freezes += 1;
      events.push({ type: 'freeze-earned', freezes: state.freezes });
    }
  }
  if (MILESTONES.includes(state.current)) events.push({ type: 'milestone', days: state.current });
  if (state.current === state.goal) {
    state.goalsReached.push({ goal: state.goal, on: today });
    events.push({ type: 'goal-reached', goal: state.goal });
  }
  return { state, events };
}

/** Pick a new streak goal (after reaching one, or in settings). */
export function setStreakGoal(s, goal, today) {
  return { ...s, goal, goalSetOn: today };
}

/** Next goals worth offering after reaching `current`. */
export function nextGoalOptions(current) {
  return STREAK_GOALS.filter((g) => g > current).slice(0, 3);
}

/** What the home screen shows (does not change saved state). */
export function streakView(s, today) {
  const { state } = reconcile(s, today);
  const doneToday = state.lastCovered === today;
  const atRisk = !doneToday && state.current > 0;
  return {
    current: state.current,
    best: state.best,
    freezes: state.freezes,
    doneToday,
    atRisk,
    goal: state.goal,
    toGoal: Math.max(0, state.goal - state.current),
    pct: Math.min(1, state.current / state.goal),
  };
}

/**
 * Status of each day for the week strip:
 * 'met' | 'freeze' | 'short' (practiced, goal not met) | 'missed' | 'today' | 'future'
 */
export function dayStatus(dateKey, today, days, streak) {
  const d = days[dateKey];
  if (d?.goalMet) return 'met';
  if (streak.freezeDays.includes(dateKey)) return 'freeze';
  if (dateKey === today) return d?.sec > 0 ? 'today-started' : 'today';
  if (daysBetween(today, dateKey) > 0) return 'future';
  if (d?.sec > 0) return 'short';
  return 'missed';
}
