import { describe, it, expect } from 'vitest';
import {
  initialStreak, reconcile, recordGoalMet, streakView, dayStatus, setStreakGoal,
  nextGoalOptions, FREEZE_EVERY, MAX_FREEZES,
} from '../../src/engine/streaks.js';
import { localDateKey, daysBetween, addDays, weekStart } from '../../src/engine/dates.js';

/** Meet the goal on consecutive days starting at `from`. */
function streakOf(n, from = '2026-03-01', goal = 30) {
  let s = initialStreak(goal, from);
  for (let i = 0; i < n; i++) s = recordGoalMet(s, addDays(from, i)).state;
  return s;
}

describe('dates', () => {
  it('local date key uses the device local calendar', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 0, 6, 0, 0))).toBe('2026-01-06');
  });
  it('crossing midnight is exactly one day', () => {
    const late = localDateKey(new Date(2026, 4, 10, 23, 59, 59));
    const early = localDateKey(new Date(2026, 4, 11, 0, 0, 1));
    expect(daysBetween(late, early)).toBe(1);
  });
  it('daylight-saving changes never skip or double a day (US + EU dates)', () => {
    // US spring forward 2026-03-08, fall back 2026-11-01; EU 2026-03-29 / 2026-10-25.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-03-29', -1)).toBe('2026-03-28');
    // Every day across a whole year is exactly 1 apart.
    let d = '2026-01-01';
    for (let i = 0; i < 400; i++) { const n = addDays(d, 1); expect(daysBetween(d, n)).toBe(1); d = n; }
  });
  it('handles month and leap-year boundaries', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('weeks start on Monday', () => {
    expect(weekStart('2026-11-11')).toBe('2026-11-09'); // Wednesday → Monday
    expect(weekStart('2026-11-15')).toBe('2026-11-09'); // Sunday → previous Monday
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
  });
});

describe('recordGoalMet', () => {
  it('first goal day starts a 1-day streak', () => {
    const { state, events } = recordGoalMet(initialStreak(7), '2026-05-01');
    expect(state.current).toBe(1);
    expect(state.best).toBe(1);
    expect(events.some((e) => e.type === 'day-counted')).toBe(true);
  });

  it('multiple sessions in one day only count once', () => {
    let s = recordGoalMet(initialStreak(7), '2026-05-01').state;
    const again = recordGoalMet(s, '2026-05-01');
    expect(again.state.current).toBe(1);
    expect(again.events.length).toBe(0);
    s = recordGoalMet(again.state, '2026-05-01').state;
    expect(s.current).toBe(1);
  });

  it('consecutive days grow the streak, including across midnight', () => {
    expect(streakOf(5).current).toBe(5);
  });

  it('streaks continue across daylight-saving weekends', () => {
    const s = streakOf(4, '2026-03-06'); // Mar 6–9 includes US DST change
    expect(s.current).toBe(4);
    const t = streakOf(4, '2026-10-30'); // Oct 30–Nov 2 includes fall back
    expect(t.current).toBe(4);
  });

  it('earns a freeze every 7 counted days, holding at most 2', () => {
    expect(streakOf(FREEZE_EVERY - 1).freezes).toBe(0);
    expect(streakOf(FREEZE_EVERY).freezes).toBe(1);
    expect(streakOf(FREEZE_EVERY * 2).freezes).toBe(2);
    expect(streakOf(FREEZE_EVERY * 4).freezes).toBe(MAX_FREEZES);
  });

  it('emits goal-reached exactly when the streak hits the goal', () => {
    let s = initialStreak(3, '2026-05-01');
    s = recordGoalMet(s, '2026-05-01').state;
    s = recordGoalMet(s, '2026-05-02').state;
    const r = recordGoalMet(s, '2026-05-03');
    expect(r.events.find((e) => e.type === 'goal-reached')?.goal).toBe(3);
    expect(r.state.goalsReached).toEqual([{ goal: 3, on: '2026-05-03' }]);
    const r2 = recordGoalMet(r.state, '2026-05-04');
    expect(r2.events.find((e) => e.type === 'goal-reached')).toBeUndefined();
  });

  it('after reaching a goal, a new bigger goal can be chosen and reached', () => {
    let s = streakOf(7, '2026-05-01', 7);
    s = setStreakGoal(s, 14, '2026-05-07');
    for (let i = 7; i < 14; i++) {
      const r = recordGoalMet(s, addDays('2026-05-01', i));
      s = r.state;
      if (i === 13) expect(r.events.some((e) => e.type === 'goal-reached' && e.goal === 14)).toBe(true);
    }
    expect(nextGoalOptions(14)[0]).toBe(30);
  });
});

describe('reconcile (opening the app)', () => {
  it('nothing happens the same day or the next day', () => {
    const s = streakOf(3, '2026-05-01'); // last counted May 3
    expect(reconcile(s, '2026-05-03').event).toBeNull();
    expect(reconcile(s, '2026-05-04').event).toBeNull(); // he has all of May 4
    expect(streakView(s, '2026-05-04').current).toBe(3);
    expect(streakView(s, '2026-05-04').atRisk).toBe(true);
  });

  it('a missed day without freezes resets to 0 with a welcome back (best kept)', () => {
    const s = streakOf(5, '2026-05-01'); // last May 5, no freezes
    const { state, event } = reconcile(s, '2026-05-07'); // missed May 6
    expect(event).toEqual({ type: 'welcome-back', lost: 5 });
    expect(state.current).toBe(0);
    expect(state.best).toBe(5);
    const after = recordGoalMet(state, '2026-05-07').state;
    expect(after.current).toBe(1);
    expect(after.best).toBe(5);
  });

  it('a missed day WITH a freeze keeps the streak and records the freeze day', () => {
    const s = streakOf(7, '2026-05-01'); // 1 freeze, last May 7
    const { state, event } = reconcile(s, '2026-05-09'); // missed May 8
    expect(event).toEqual({ type: 'freeze-saved', days: ['2026-05-08'] });
    expect(state.current).toBe(7);
    expect(state.freezes).toBe(0);
    expect(state.freezeDays).toContain('2026-05-08');
    expect(recordGoalMet(state, '2026-05-09').state.current).toBe(8);
  });

  it('two missed days use two freezes', () => {
    const s = streakOf(14, '2026-05-01'); // 2 freezes, last May 14
    const { state, event } = reconcile(s, '2026-05-17'); // missed 15, 16
    expect(event.type).toBe('freeze-saved');
    expect(event.days).toEqual(['2026-05-15', '2026-05-16']);
    expect(state.freezes).toBe(0);
    expect(state.current).toBe(14);
  });

  it('more missed days than freezes resets, and keeps unused freezes', () => {
    const s = streakOf(7, '2026-05-01'); // 1 freeze
    const { state, event } = reconcile(s, '2026-05-11'); // missed 8, 9, 10
    expect(event.type).toBe('welcome-back');
    expect(state.current).toBe(0);
    expect(state.freezes).toBe(1);
  });

  it('reconcile is idempotent (opening the app twice)', () => {
    const s = streakOf(7, '2026-05-01');
    const once = reconcile(s, '2026-05-09').state;
    const twice = reconcile(once, '2026-05-09');
    expect(twice.event).toBeNull();
    expect(twice.state.freezes).toBe(0);
    expect(twice.state.current).toBe(7);
  });

  it('meeting the goal after a long break goes through reconcile first', () => {
    const s = streakOf(3, '2026-05-01');
    const r = recordGoalMet(s, '2026-06-01');
    expect(r.events[0].type).toBe('welcome-back');
    expect(r.state.current).toBe(1);
  });

  it('a clock set backwards never breaks the streak', () => {
    const s = streakOf(4, '2026-05-01');
    expect(reconcile(s, '2026-04-20').event).toBeNull();
    expect(recordGoalMet(s, '2026-04-20').state.current).toBe(4);
  });

  it('a fresh learner with no history is never "welcomed back"', () => {
    expect(reconcile(initialStreak(7), '2026-05-01').event).toBeNull();
  });
});

describe('week view statuses', () => {
  it('labels met, freeze, short, missed, today and future days', () => {
    let s = streakOf(7, '2026-05-01');
    s = reconcile(s, '2026-05-09').state; // freeze May 8
    const days = { '2026-05-07': { sec: 900, goalMet: true }, '2026-05-06': { sec: 120, goalMet: false } };
    expect(dayStatus('2026-05-07', '2026-05-09', days, s)).toBe('met');
    expect(dayStatus('2026-05-08', '2026-05-09', days, s)).toBe('freeze');
    expect(dayStatus('2026-05-06', '2026-05-09', { '2026-05-06': { sec: 120 } }, initialStreak())).toBe('short');
    expect(dayStatus('2026-05-05', '2026-05-09', {}, initialStreak())).toBe('missed');
    expect(dayStatus('2026-05-09', '2026-05-09', {}, s)).toBe('today');
    expect(dayStatus('2026-05-10', '2026-05-09', {}, s)).toBe('future');
  });
});
