import { kid } from '../data/store.js';
import { TROPHIES, levelFromXp } from '../engine/rewards.js';
import { prettyDate } from '../engine/dates.js';

export function Trophies() {
  const k = kid.value;
  const got = k.progress.trophies;
  const lvl = levelFromXp(k.progress.xp);
  const count = TROPHIES.filter((t) => got[t.id]).length;
  return (
    <div class="stack">
      <div class="screen-head"><div class="screen-title"><h1>Trophies</h1><p class="muted" style={{ fontWeight: 700 }}>{count} of {TROPHIES.length} on your shelf</p></div></div>
      <div class="card row" style={{ gap: 20 }}>
        <div class="league-badge" style={{ background: 'var(--c-sun)' }}>⚡</div>
        <div class="grow">
          <div class="muted small" style={{ fontWeight: 800 }}>LEVEL {lvl.level}</div>
          <h2>{k.progress.xp.toLocaleString()} XP</h2>
          <div class="bar-row" style={{ marginTop: 6 }}>
            <div class="track"><div style={{ width: `${lvl.pct * 100}%`, background: 'var(--c-sun)' }} /></div>
            <span class="small" style={{ fontWeight: 800 }}>{lvl.need - lvl.into} XP to level {lvl.level + 1}</span>
          </div>
        </div>
      </div>
      <div class="shelf">
        {TROPHIES.map((t) => (
          <div class={`trophy${got[t.id] ? '' : ' locked'}`}>
            <div class="t-icon" aria-hidden="true">{t.icon}</div>
            <div class="t-name">{t.name}</div>
            <div class="muted xs" style={{ fontWeight: 700 }}>{got[t.id] ? prettyDate(got[t.id]) : t.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
