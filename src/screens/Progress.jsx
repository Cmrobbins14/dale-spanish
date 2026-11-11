// Progress: mastery, phrases, minutes per day, accuracy trend, units,
// the personal league, and "Things I can say".

import { kid, today } from '../data/store.js';
import { overallMastery } from '../engine/mastery.js';
import { levelFromXp, TIERS, weekXp, leagueTarget } from '../engine/rewards.js';
import { weekStart } from '../engine/dates.js';
import { TOTAL_CONCEPTS, CONCEPTS, courseOrder, lessonById } from '../content/index.js';
import { MinutesChart, AccuracyChart } from '../ui/charts.jsx';

export function phrasesLearned(p) {
  return Object.entries(p.concepts).filter(([id, c]) => CONCEPTS[id] && CONCEPTS[id].kind !== 'word' && c.ok > 0).length;
}

export function Progress() {
  const k = kid.value;
  const p = k.progress;
  const t = today.value;
  const lvl = levelFromXp(p.xp);
  const totalMin = Math.round(Object.values(p.days).reduce((s, d) => s + (d.sec || 0), 0) / 60);
  const acc = p.stats.scored ? Math.round((p.stats.scoreSum / p.stats.scored) * 100) : null;
  const tier = TIERS[p.league.tier];
  const thisWeek = weekXp(p.days, weekStart(t));
  const target = leagueTarget(p.days, t);
  const cans = Object.entries(p.lessons).filter(([, s]) => s.done).map(([id]) => lessonById(id)).filter((l) => l?.canDo);

  return (
    <div class="stack">
      <div class="screen-head"><div class="screen-title"><h1>Progress</h1><p class="muted" style={{ fontWeight: 700 }}>Look how far you've come!</p></div></div>
      <div class="kpis">
        <div class="kpi"><div class="v" style={{ color: 'var(--c-primary)' }}>{overallMastery(p.concepts, TOTAL_CONCEPTS)}%</div><div class="k">course mastery</div></div>
        <div class="kpi"><div class="v">{phrasesLearned(p)}</div><div class="k">phrases learned</div></div>
        <div class="kpi"><div class="v" style={{ color: 'var(--c-field-strong)' }}>{acc == null ? '—' : `${acc}%`}</div><div class="k">speaking accuracy</div></div>
        <div class="kpi"><div class="v">{totalMin}</div><div class="k">minutes total</div></div>
      </div>

      <div class="card league-card">
        <div class="league-badge" style={{ background: tier.color }}>🏆</div>
        <div class="grow">
          <div class="muted small" style={{ fontWeight: 800 }}>MY LEAGUE · YOU VS. LAST WEEK'S YOU</div>
          <h2>Liga {tier.name}</h2>
          <div class="bar-row" style={{ marginTop: 8 }}>
            <div class="track"><div style={{ width: `${Math.min(100, (thisWeek / target) * 100)}%`, background: tier.color }} /></div>
            <span class="small" style={{ fontWeight: 800 }}>{thisWeek}/{target} XP</span>
          </div>
          <p class="muted small" style={{ fontWeight: 700, marginTop: 4 }}>
            {p.league.tier >= TIERS.length - 1 ? 'Top league! Legendary.' : thisWeek >= target ? `You're on track to reach Liga ${TIERS[p.league.tier + 1].name}!` : `Earn ${target} XP this week to move up to Liga ${TIERS[p.league.tier + 1].name}.`}
          </p>
        </div>
        <div class="center"><div class="stat-big">{lvl.level}</div><div class="muted xs" style={{ fontWeight: 800 }}>LEVEL</div></div>
      </div>

      <div class="card"><h3 style={{ marginBottom: 10 }}>Minutes per day</h3><MinutesChart days={p.days} today={t} goalMin={k.settings.dailyGoalMin} /></div>
      <div class="card"><h3 style={{ marginBottom: 10 }}>Speaking accuracy</h3><AccuracyChart days={p.days} today={t} /></div>

      <div class="card stack tight">
        <h3>Units</h3>
        {courseOrder(k.profile.topics).map((u) => {
          const done = u.lessons.filter((l) => p.lessons[l.id]?.done).length;
          return (
            <div class="bar-row">
              <span style={{ width: 28, fontSize: 22 }}>{u.icon}</span>
              <span style={{ width: 190, fontWeight: 700 }} class="small">{u.title}</span>
              <div class="track"><div style={{ width: `${(done / u.lessons.length) * 100}%`, background: u.color }} /></div>
              <span class="small" style={{ fontWeight: 800, width: 40, textAlign: 'right' }}>{done}/{u.lessons.length}</span>
            </div>
          );
        })}
      </div>

      <div class="card">
        <h3>Things I can say</h3>
        {cans.length ? cans.map((l) => <div class="cando"><span style={{ fontSize: 24 }}>✅</span>{l.canDo}</div>)
          : <p class="muted" style={{ fontWeight: 700, marginTop: 8 }}>Finish your first lesson to start this list!</p>}
      </div>
    </div>
  );
}
