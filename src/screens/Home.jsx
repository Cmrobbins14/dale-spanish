// Home: today's goal ring, streak toward his streak goal, the week,
// and one big "keep going" button.

import { kid, today } from '../data/store.js';
import { streakView, dayStatus, MILESTONES } from '../engine/streaks.js';
import { lastNDays, dayLetter } from '../engine/dates.js';
import { levelFromXp } from '../engine/rewards.js';
import { dueConcepts } from '../engine/mastery.js';
import { orderedLessons, unitById } from '../content/index.js';
import { tutorAvailable } from '../services/worker.js';
import { Ring, Avatar } from '../ui/widgets.jsx';
import { Icon } from '../ui/Icon.jsx';
import { unlockAudio } from '../speech/tts.js';
import { navigate } from '../app/router.js';

export function nextLessonFor(k) {
  const lessons = orderedLessons(k.profile.topics);
  const startIdx = Math.max(0, lessons.findIndex((l) => l.id === k.profile.startLesson));
  return lessons.slice(startIdx).find((l) => !k.progress.lessons[l.id]?.done)
    || lessons.find((l) => !k.progress.lessons[l.id]?.done) || null;
}

const WEEK_ICON = { met: '🔥', freeze: '🧊', short: '·', missed: '', today: '', 'today-started': '', future: '' };

export function WeekStrip({ k, t }) {
  return (
    <div class="week" aria-label="This week">
      {lastNDays(t, 7).map((d) => {
        const s = dayStatus(d, t, k.progress.days, k.progress.streak);
        const label = { met: 'goal met', freeze: 'freeze used', short: 'practiced', missed: 'missed', today: 'today', 'today-started': 'today, started', future: '' }[s];
        return (
          <div class="week-day" title={label}>
            <span class={`week-dot ${s}`} aria-label={`${d}: ${label}`}>{WEEK_ICON[s]}</span>
            {d === t ? 'Today' : dayLetter(d)}
          </div>
        );
      })}
    </div>
  );
}

export function StreakGoalBar({ view }) {
  const marks = MILESTONES.filter((m) => m < view.goal).slice(-3);
  return (
    <div class="streak-track" aria-label={`${view.current} of ${view.goal} days`}>
      <div class="streak-fill" style={{ width: `${Math.max(3, view.pct * 100)}%` }} />
      {marks.map((m) => <span class={`streak-mark${view.current >= m ? ' hit' : ''}`} style={{ left: `${(m / view.goal) * 100}%` }}>{m}</span>)}
      <span class={`streak-mark${view.current >= view.goal ? ' hit' : ''}`} style={{ left: '100%' }}>🏆</span>
    </div>
  );
}

export function Home() {
  const k = kid.value;
  const t = today.value;
  const view = streakView(k.progress.streak, t);
  const day = k.progress.days[t] || { sec: 0 };
  const goalSec = k.settings.dailyGoalMin * 60;
  const pct = Math.min(1, day.sec / goalSec);
  const mins = Math.floor(day.sec / 60);
  const lvl = levelFromXp(k.progress.xp);
  const due = dueConcepts(k.progress.concepts, t, 50).length;
  const next = nextLessonFor(k);
  const unit = next && unitById(next.unitId);

  return (
    <div class="stack">
      <div class="screen-head">
        <div class="hello">
          <Avatar avatar={k.profile.avatar} />
          <div>
            <h1 style={{ fontSize: 'var(--fs-xl)' }}>¡Hola, {k.profile.nickname}!</h1>
            <div class="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              <span class="pill flame">🔥 {view.current}</span>
              <span class="pill xp">⚡ Level {lvl.level}</span>
              {view.freezes > 0 && <span class="pill ice">🧊 {view.freezes}</span>}
            </div>
          </div>
        </div>
        <button class="icon-btn" onClick={() => navigate('/settings')} aria-label="Settings"><Icon name="gear" /></button>
      </div>

      {k.profile.practiceTime && !view.doneToday && (
        <div class="reminder">⏰ Your practice time: <b>{k.profile.practiceTime}</b>{view.atRisk ? ' · keep your streak going!' : ''}</div>
      )}

      <div class="home-grid">
        <div class="stack">
          {next ? (
            <div class="continue-card">
              <span class="deco" aria-hidden="true">{next.icon}</span>
              <div class="kicker">{unit.title} · {next.subtitle}</div>
              <h2>{next.title}</h2>
              <p style={{ fontWeight: 700, opacity: 0.9 }}>{next.canDo || next.subtitle}</p>
              <button class="btn big block" onClick={() => { unlockAudio(); navigate(`/lesson/${next.id}`); }}>
                {k.progress.stats.lessonsDone ? 'Keep going' : 'Start'} <Icon name="arrow" />
              </button>
            </div>
          ) : (
            <div class="continue-card"><div class="kicker">Course complete</div><h2>¡Campeón! 🏆</h2><p>You finished every lesson. Smart Review keeps it fresh!</p></div>
          )}

          <button class="card tap row" onClick={() => { unlockAudio(); navigate('/smart-review'); }}>
            <span style={{ fontSize: 40 }}>🧠</span>
            <div class="grow"><h3>Smart Review</h3><p class="muted" style={{ fontWeight: 700 }}>{due ? `${due} ${due === 1 ? 'phrase is' : 'phrases are'} ready for review` : 'Practice your trickiest phrases'}</p></div>
            {due > 0 && <span class="pill green">{due}</span>}
          </button>

          {tutorAvailable() && k.settings.tutor !== false && (
            <button class="card tap row" onClick={() => { unlockAudio(); navigate('/free-talk'); }}>
              <span style={{ fontSize: 40 }}>💬</span>
              <div class="grow"><h3>Free Talk</h3><p class="muted" style={{ fontWeight: 700 }}>Chat out loud with Coach Chispa</p></div>
            </button>
          )}
        </div>

        <div class="stack">
          <div class="card goal-card">
            <Ring pct={pct} size={120} stroke={13} color={pct >= 1 ? 'var(--c-field)' : 'var(--c-primary)'}>
              <div>
                <div class="ring-center" style={{ fontSize: 28 }}>{pct >= 1 ? '✓' : day.sec > 0 && mins < 1 ? '<1' : mins}</div>
                <div class="muted xs" style={{ fontWeight: 800 }}>{pct >= 1 ? 'done!' : `of ${k.settings.dailyGoalMin} min`}</div>
              </div>
            </Ring>
            <div class="grow">
              <h3>{pct >= 1 ? 'Goal complete! 🎯' : "Today's goal"}</h3>
              <p class="muted" style={{ fontWeight: 700 }}>
                {pct >= 1 ? 'Amazing work. Your streak is safe today.' : `${Math.max(1, Math.ceil((goalSec - day.sec) / 60))} more min to keep your streak going.`}
              </p>
            </div>
          </div>

          <div class="card">
            <div class="row between">
              <div>
                <div class="stat-big" style={{ color: 'var(--c-flame)' }}>🔥 {view.current} <span style={{ fontSize: 'var(--fs-lg)' }}>{view.current === 1 ? 'day' : 'days'}</span></div>
                <p class="muted small" style={{ fontWeight: 800, marginTop: 4 }}>Best: {view.best} · Goal: {view.goal} days</p>
              </div>
              {view.freezes > 0 && <span class="pill ice" title="Streak freezes">🧊 ×{view.freezes}</span>}
            </div>
            <StreakGoalBar view={view} />
            <p class="small" style={{ fontWeight: 700, color: 'var(--c-ink-2)', marginBottom: 14 }}>
              {view.toGoal === 0 ? 'Streak goal reached! 🏆' : `${view.toGoal} more ${view.toGoal === 1 ? 'day' : 'days'} to reach your goal`}
            </p>
            <WeekStrip k={k} t={t} />
          </div>
        </div>
      </div>
    </div>
  );
}
