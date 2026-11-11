// End-of-lesson summary: XP, phrases, speaking accuracy, minutes, and how
// close he is to today's goal.

import { useEffect } from 'preact/hooks';
import { kid, today } from '../data/store.js';
import { CONCEPTS } from '../content/index.js';
import { Ring, Confetti } from '../ui/widgets.jsx';
import { Coach } from '../ui/Coach.jsx';
import { sfx } from '../ui/sfx.js';
import { navigate } from '../app/router.js';
import { orderedLessons } from '../content/index.js';

export function Summary({ lesson, smart, result }) {
  const k = kid.value;
  const day = k.progress.days[today.value] || { sec: 0 };
  const goalSec = k.settings.dailyGoalMin * 60;
  const pct = Math.min(1, day.sec / goalSec);
  const minutesLeft = Math.max(0, Math.ceil((goalSec - day.sec) / 60));
  const phrases = result.concepts.filter((id) => CONCEPTS[id] && CONCEPTS[id].kind !== 'word').length;
  const acc = result.accuracy == null ? '—' : `${Math.round(result.accuracy * 100)}%`;
  const mins = Math.max(1, Math.round(result.seconds / 60));
  useEffect(() => { sfx('levelup'); }, []);

  const checkpoint = lesson?.type === 'checkpoint';
  const lessons = orderedLessons(k.profile.topics);
  const nextLesson = lessons.find((l) => !k.progress.lessons[l.id]?.done);

  return (
    <div class="lesson">
      <Confetti run={result} />
      <div class="step summary" style={{ justifyContent: 'center' }}>
        <Coach size={130} cheer />
        <h1>{result.perfect ? '¡Perfecto! ⭐' : checkpoint ? '¡Mira cuánto sabes!' : '¡Lo hiciste!'}</h1>
        <p class="muted" style={{ fontWeight: 700 }}>
          {smart ? 'Smart Review complete. Those phrases are stronger now.' : lesson?.canDo ? `New skill: ${lesson.canDo}.` : 'Lesson complete.'}
        </p>
        <div class="summary-stats">
          <div class="stat-tile"><div class="v" style={{ color: '#c08a00' }}>+{result.xp}</div><div class="k">XP earned</div></div>
          <div class="stat-tile"><div class="v">{phrases}</div><div class="k">phrases practiced</div></div>
          <div class="stat-tile"><div class="v" style={{ color: 'var(--c-field-strong)' }}>{acc}</div><div class="k">speaking accuracy</div></div>
          <div class="stat-tile"><div class="v">{mins}</div><div class="k">{mins === 1 ? 'minute' : 'minutes'} practiced</div></div>
        </div>
        <div class="card goal-card" style={{ width: '100%' }}>
          <Ring pct={pct} size={96} stroke={11}><span class="ring-center" style={{ fontSize: 22 }}>{Math.round(pct * 100)}%</span></Ring>
          <div class="grow" style={{ textAlign: 'left' }}>
            <h3>{pct >= 1 ? 'Daily goal done! 🎯' : "Today's goal"}</h3>
            <p class="muted" style={{ fontWeight: 700 }}>{pct >= 1 ? 'Your streak is safe for today.' : `${minutesLeft} more ${minutesLeft === 1 ? 'minute' : 'minutes'} to reach ${k.settings.dailyGoalMin} today.`}</p>
          </div>
        </div>
      </div>
      <div class="step-foot">
        {nextLesson && pct < 1 && <button class="btn green block big" onClick={() => navigate(`/lesson/${nextLesson.id}`)}>Next lesson: {nextLesson.title}</button>}
        <button class={`btn block ${nextLesson && pct < 1 ? 'light' : 'big green'}`} onClick={() => navigate('/')}>Done</button>
      </div>
    </div>
  );
}
