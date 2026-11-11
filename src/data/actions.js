// Everything that changes progress goes through these small functions,
// so the rules (XP never goes down, streaks are safe, mastery updates
// everywhere) live in one place.

import { signal } from '@preact/signals';
import { kid, updateKid, today, logSession } from './store.js';
import { recordGoalMet, reconcile, setStreakGoal, nextGoalOptions } from '../engine/streaks.js';
import { updateConcept } from '../engine/mastery.js';
import { settleLeague, newTrophies, TROPHIES, TIERS } from '../engine/rewards.js';
import { UNITS, lessonById } from '../content/index.js';

/** Queue of celebration pop-ups: { kind, icon, title, body, actions? } */
export const celebrations = signal([]);
function celebrate(c) { celebrations.value = [...celebrations.value, c]; }
export function dismissCelebration() { celebrations.value = celebrations.value.slice(1); }

function dayOf(p, date) {
  if (!p.days[date]) p.days[date] = { sec: 0, xp: 0, goalMet: false, lessons: 0, spoken: 0, ok: 0 };
  return p.days[date];
}

// ---------- on open ----------

/** Called when the app opens or the date changes. Freezes, welcome back, league. */
export function reconcileDay() {
  const t = today.value;
  const k = kid.value;
  if (!k) return;
  const { state, event } = reconcile(k.progress.streak, t);
  const { league, promoted } = settleLeague(k.progress.league, k.progress.days, t);
  if (state === k.progress.streak && league.week === k.progress.league.week && promoted == null) return;
  updateKid((d) => { d.progress.streak = state; d.progress.league = league; });
  if (event?.type === 'freeze-saved') {
    celebrate({ kind: 'freeze', icon: '🧊', title: 'Your freeze saved your streak!', body: `You missed ${event.days.length === 1 ? 'a day' : `${event.days.length} days`}, but a streak freeze kept your ${state.current}-day streak safe.` });
  } else if (event?.type === 'welcome-back') {
    celebrate({ kind: 'welcome', icon: '👋', title: '¡Bienvenido otra vez!', body: event.lost > 1 ? `Great to see you! Your best streak is still ${state.best} days. Let's start a new one today.` : "Great to see you! Let's start a fresh streak today." });
  }
  if (promoted != null) {
    celebrate({ kind: 'league', icon: '🏆', title: `You moved up to Liga ${TIERS[promoted].name}!`, body: 'You beat last week\'s XP. Keep it going!' });
  }
  checkTrophies();
}

// ---------- minutes ----------

export function addSeconds(sec) {
  const t = today.value;
  let events = [];
  updateKid((d) => {
    const p = d.progress;
    const day = dayOf(p, t);
    day.sec += sec;
    const goalSec = d.settings.dailyGoalMin * 60;
    if (!day.goalMet && day.sec >= goalSec) {
      day.goalMet = true;
      const r = recordGoalMet(p.streak, t);
      p.streak = r.state;
      events = r.events;
    }
  });
  for (const e of events) {
    if (e.type === 'day-counted') celebrate({ kind: 'goal', icon: '🎯', title: 'Daily goal complete!', body: `That's ${e.current} ${e.current === 1 ? 'day' : 'days'} in a row. ¡Excelente!`, confetti: true });
    if (e.type === 'freeze-earned') celebrate({ kind: 'freeze', icon: '🧊', title: 'You earned a streak freeze!', body: 'If you miss a day, it saves your streak automatically.' });
    if (e.type === 'goal-reached') {
      celebrate({ kind: 'streak-goal', icon: '🏆', title: `${e.goal}-day streak goal reached!`, body: 'You did it! Pick your next goal.', confetti: true, goalOptions: nextGoalOptions(e.goal) });
    }
  }
  if (events.length) checkTrophies();
}

export function chooseStreakGoal(goal) {
  updateKid((d) => {
    d.settings.streakGoal = goal;
    d.progress.streak = setStreakGoal(d.progress.streak, goal, today.value);
  });
}

// ---------- XP ----------

export function addXp(n) {
  if (!n || n < 0) return; // XP only goes up
  const t = today.value;
  updateKid((d) => { d.progress.xp += n; dayOf(d.progress, t).xp += n; });
}

// ---------- speaking & concepts ----------

/**
 * One finished item (after any retries).
 * @param {string|null} conceptId
 * @param {'great'|'good'|'notyet'|'selfcheck'|'listen'|'skipped'} outcome
 * @param {number|null} score speech score 0–1
 */
export function recordItem(conceptId, outcome, score, { spoken = true } = {}) {
  const t = today.value;
  updateKid((d) => {
    const p = d.progress;
    if (conceptId) p.concepts[conceptId] = updateConcept(p.concepts[conceptId], outcome, score, t);
    if (spoken) {
      const day = dayOf(p, t);
      p.stats.attempts += 1;
      day.spoken += 1;
      if (outcome === 'great' || outcome === 'good' || outcome === 'selfcheck') { p.stats.spokenOk += 1; day.ok += 1; }
      if (typeof score === 'number') { p.stats.scoreSum += score; p.stats.scored += 1; day.scoreSum = (day.scoreSum || 0) + score; day.scored = (day.scored || 0) + 1; }
    }
  });
}

// ---------- lessons ----------

export function completeLesson(lessonId, { accuracy, perfect, xp, seconds, kind }) {
  const t = today.value;
  const lesson = lessonById(lessonId);
  updateKid((d) => {
    const p = d.progress;
    if (lessonId) {
      const prev = p.lessons[lessonId] || { done: false, best: 0, times: 0 };
      p.lessons[lessonId] = { done: true, best: Math.max(prev.best, accuracy ?? 0), times: prev.times + 1, last: t };
    }
    p.stats.lessonsDone += kind === 'smart-review' || kind === 'free-talk' ? 0 : 1;
    if (perfect) p.stats.perfectLessons += 1;
    if (kind === 'smart-review' || kind === 'review') p.stats.reviews += 1;
    if (kind === 'roleplay') p.stats.roleplays += 1;
    if (kind === 'free-talk') p.stats.freeTalks += 1;
    dayOf(p, t).lessons += 1;
    p.recent = [{ date: t, at: Date.now(), kind, lessonId: lessonId || null, title: lesson?.title || (kind === 'smart-review' ? 'Smart Review' : kind === 'free-talk' ? 'Free Talk' : ''), accuracy: accuracy ?? null, xp, seconds }, ...p.recent].slice(0, 30);
  });
  logSession({ date: t, at: Date.now(), kind, lessonId: lessonId || null, accuracy: accuracy ?? null, xp, seconds });
  checkTrophies();
}

export function unitsDone(p) {
  return UNITS.filter((u) => u.lessons.every((l) => p.lessons[l.id]?.done)).length;
}

export function checkTrophies() {
  const k = kid.value;
  if (!k) return;
  const earned = newTrophies(k.progress, { unitsDone: unitsDone(k.progress), totalUnits: UNITS.length });
  if (!earned.length) return;
  updateKid((d) => { earned.forEach((id) => { d.progress.trophies[id] = today.value; }); });
  earned.forEach((id) => {
    const t = TROPHIES.find((x) => x.id === id);
    celebrate({ kind: 'trophy', icon: t.icon, title: `Trophy: ${t.name}`, body: t.desc, confetti: true });
  });
}
