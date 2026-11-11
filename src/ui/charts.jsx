// Tiny SVG charts (no chart library): minutes per day, accuracy trend.
import { lastNDays, dayShort } from '../engine/dates.js';

export function MinutesChart({ days, today, goalMin, n = 14 }) {
  const dates = lastNDays(today, n);
  const vals = dates.map((d) => (days[d]?.sec || 0) / 60);
  const max = Math.max(goalMin * 1.25, ...vals, 1);
  const W = 640, H = 200, pad = 28, bw = (W - pad) / n;
  const y = (v) => H - 24 - (v / max) * (H - 40);
  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Minutes practiced, last ${n} days`}>
      <line class="goal-line" x1={pad} x2={W} y1={y(goalMin)} y2={y(goalMin)} />
      <text class="axis" x={0} y={y(goalMin) + 4}>{goalMin}</text>
      {vals.map((v, i) => {
        const h = Math.max(v > 0 ? 4 : 0, H - 24 - y(v));
        return (
          <g>
            <rect class={`bar${days[dates[i]]?.goalMet ? ' met' : ''}`} x={pad + i * bw + bw * 0.18} y={H - 24 - h} width={bw * 0.64} height={h} rx="6" />
            {(n <= 14 || i % 2 === 0) && <text class="axis" x={pad + i * bw + bw / 2} y={H - 6} text-anchor="middle">{dates[i] === today ? 'Today' : dayShort(dates[i]).slice(0, 2)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function AccuracyChart({ days, today, n = 14 }) {
  const dates = lastNDays(today, n);
  const pts = dates.map((d, i) => ({ i, v: days[d]?.scored ? days[d].scoreSum / days[d].scored : null })).filter((p) => p.v != null);
  const W = 640, H = 180, pad = 32;
  const x = (i) => pad + (i / (n - 1)) * (W - pad - 10);
  const y = (v) => H - 24 - v * (H - 44);
  if (!pts.length) return <p class="muted" style={{ fontWeight: 700 }}>Speak in a lesson to see your accuracy here.</p>;
  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Speaking accuracy trend">
      {[0.5, 1].map((v) => <text class="axis" x={0} y={y(v) + 4}>{v * 100}%</text>)}
      <line x1={pad} x2={W} y1={y(1)} y2={y(1)} stroke="var(--c-line)" />
      <line x1={pad} x2={W} y1={y(0.5)} y2={y(0.5)} stroke="var(--c-line)" />
      <polyline class="line" points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} />
      {pts.map((p) => <circle class="dot" cx={x(p.i)} cy={y(p.v)} r="5" />)}
      {dates.map((d, i) => (i % 2 === 1 || i === n - 1) && <text class="axis" x={x(i)} y={H - 4} text-anchor="middle">{d === today ? 'Today' : dayShort(d).slice(0, 2)}</text>)}
    </svg>
  );
}
