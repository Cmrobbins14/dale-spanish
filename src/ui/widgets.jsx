import { useEffect, useRef } from 'preact/hooks';
import { celebrations, dismissCelebration, chooseStreakGoal } from '../data/actions.js';
import { sfx } from './sfx.js';

/** Circular progress ring (daily goal). pct 0–1. */
export function Ring({ pct, size = 132, stroke = 14, color = 'var(--c-field)', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct || 0));
  return (
    <div class="ring-wrap" style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(p * 100)} percent`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-surface-2)" stroke-width={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} stroke-width={stroke} opacity={p > 0 ? 1 : 0}
          stroke-linecap="round" stroke-dasharray={c} stroke-dashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 800ms var(--ease-out)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

export function Avatar({ avatar, size = '' }) {
  return <span class={`avatar ${size}`} style={{ background: avatar?.color || 'var(--c-primary)' }}>{avatar?.icon || '🐆'}</span>;
}

export function ProgressBar({ pct }) {
  return <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(pct * 100)}><div style={{ width: `${Math.max(3, pct * 100)}%` }} /></div>;
}

/** A quick confetti burst on a canvas. Skipped for reduced motion. */
export function Confetti({ run }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!run || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = ['#5B4BFF', '#FF8A1F', '#1FB871', '#FFC93C', '#FF5A5F', '#4FB7FF'];
    const parts = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2, y: innerHeight / 3,
      vx: (Math.random() - 0.5) * 16, vy: Math.random() * -14 - 4,
      s: 6 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: colors[(Math.random() * colors.length) | 0],
    }));
    let raf; const t0 = performance.now();
    const draw = (t) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach((p) => {
        p.vy += 0.42; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      });
      if (t - t0 < 2600) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [run]);
  return <canvas ref={ref} class="confetti" aria-hidden="true" />;
}

/** Shows queued celebrations one at a time (goal met, trophies, freezes…). */
export function Celebrations() {
  const c = celebrations.value[0];
  useEffect(() => { if (c) sfx(c.confetti ? 'levelup' : 'good'); }, [c]);
  if (!c) return null;
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="celebrate-title">
      {c.confetti && <Confetti run={c} />}
      <div class="modal">
        <div class="big-icon">{c.icon}</div>
        <h2 id="celebrate-title">{c.title}</h2>
        <p class="muted" style={{ margin: '10px 0 22px', fontWeight: 700 }}>{c.body}</p>
        {c.goalOptions?.length ? (
          <div class="stack tight">
            <p style={{ fontWeight: 800 }}>Next streak goal:</p>
            <div class="row wrap" style={{ justifyContent: 'center' }}>
              {c.goalOptions.map((g) => (
                <button class="btn orange" onClick={() => { chooseStreakGoal(g); dismissCelebration(); }}>{g} days</button>
              ))}
            </div>
          </div>
        ) : (
          <button class="btn block big" onClick={dismissCelebration} autofocus>¡Genial!</button>
        )}
      </div>
    </div>
  );
}
