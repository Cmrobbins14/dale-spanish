import { describe, it, expect } from 'vitest';
import { updateConcept, dueConcepts, masteryOf, weakestConcepts } from '../../src/engine/mastery.js';
import { levelFromXp, speakXp, settleLeague, initialLeague, newTrophies, leagueTarget, LEAGUE_MIN } from '../../src/engine/rewards.js';
import { freshProgress } from '../../src/data/model.js';

describe('mastery (SM-2 lite)', () => {
  it('a great first attempt schedules review tomorrow and raises mastery', () => {
    const c = updateConcept(undefined, 'great', 1, '2026-05-01');
    expect(c.due).toBe('2026-05-02');
    expect(c.mastery).toBeGreaterThan(50);
  });

  it('intervals grow with repeated success on different days', () => {
    let c = updateConcept(undefined, 'great', 1, '2026-05-01');
    c = updateConcept(c, 'great', 1, '2026-05-02');
    expect(c.interval).toBe(3);
    c = updateConcept(c, 'great', 1, '2026-05-05');
    expect(c.interval).toBeGreaterThan(3);
  });

  it('practicing the same concept twice in one day does not inflate the interval', () => {
    let c = updateConcept(undefined, 'great', 1, '2026-05-01');
    const due = c.due;
    c = updateConcept(c, 'great', 1, '2026-05-01');
    expect(c.due).toBe(due);
    expect(c.reps).toBe(1);
  });

  it('a "not yet" brings the concept back tomorrow but keeps accuracy history', () => {
    let c = updateConcept(undefined, 'great', 0.95, '2026-05-01');
    c = updateConcept(c, 'great', 0.95, '2026-05-02');
    c = updateConcept(c, 'notyet', 0.3, '2026-05-05');
    expect(c.due).toBe('2026-05-06');
    expect(c.acc).toBeGreaterThan(0.5);
  });

  it('due concepts come weakest first', () => {
    const concepts = {
      a: { ...updateConcept(undefined, 'great', 1, '2026-05-01') },
      b: { ...updateConcept(undefined, 'good', 0.6, '2026-05-01') },
      c: { ...updateConcept(undefined, 'great', 1, '2026-05-01'), due: '2026-06-01' },
    };
    expect(dueConcepts(concepts, '2026-05-02')).toEqual(['b', 'a']);
    expect(weakestConcepts(concepts, 1)).toEqual(['b']);
  });

  it('mastery stays within 0–100', () => {
    expect(masteryOf({ acc: 1, reps: 99 })).toBe(100);
    expect(masteryOf({ acc: null, reps: 0 })).toBe(0);
  });
});

describe('XP and levels', () => {
  it('levels need a bit more XP each time', () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(250).level).toBe(3);
  });
  it('combos add bonus XP for passing answers only', () => {
    expect(speakXp('great', 1).total).toBe(5);
    expect(speakXp('great', 3).bonus).toBe(2);
    expect(speakXp('great', 50).bonus).toBe(3);
    expect(speakXp('notyet', 5).total).toBe(0);
  });
});

describe('personal league', () => {
  const days = (map) => Object.fromEntries(Object.entries(map).map(([d, xp]) => [d, { xp }]));
  it('moves up after beating last week (and the minimum)', () => {
    const l = initialLeague('2026-11-02'); // Monday
    const d = days({ '2026-10-27': 20, '2026-11-03': 120 });
    const { league, promoted } = settleLeague(l, d, '2026-11-10');
    expect(promoted).toBe(1);
    expect(league.tier).toBe(1);
    expect(league.week).toBe('2026-11-09');
  });
  it('never moves down', () => {
    const l = { ...initialLeague('2026-11-02'), tier: 3 };
    const { league } = settleLeague(l, days({ '2026-10-27': 500 }), '2026-11-10');
    expect(league.tier).toBe(3);
  });
  it('catches up several missed weeks at once', () => {
    const l = initialLeague('2026-10-05');
    const { league } = settleLeague(l, days({ '2026-10-06': 100, '2026-10-13': 200 }), '2026-11-10');
    expect(league.week).toBe('2026-11-09');
    expect(league.tier).toBe(2);
  });
  it('target is last week + 1, at least the minimum', () => {
    expect(leagueTarget({}, '2026-11-10')).toBe(LEAGUE_MIN);
    expect(leagueTarget(days({ '2026-11-04': 90 }), '2026-11-10')).toBe(91);
  });
});

describe('trophies', () => {
  it('awards first lesson and streak trophies once', () => {
    const p = freshProgress('2026-05-01');
    p.stats.lessonsDone = 1;
    p.streak.best = 7;
    const got = newTrophies(p, { unitsDone: 0, totalUnits: 8 });
    expect(got).toEqual(expect.arrayContaining(['first-lesson', 'streak-3', 'streak-7']));
    got.forEach((id) => { p.trophies[id] = '2026-05-01'; });
    expect(newTrophies(p, { unitsDone: 0, totalUnits: 8 })).toEqual([]);
  });
});
