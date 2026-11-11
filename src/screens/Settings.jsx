// Learner settings: his goals, practice time, sound. Grown-up area behind a PIN.

import { kid, updateKid, today, session, leaveLocalKid } from '../data/store.js';
import { setStreakGoal, STREAK_GOALS } from '../engine/streaks.js';
import { signOutAll } from '../services/firebase.js';
import { Icon } from '../ui/Icon.jsx';
import { navigate } from '../app/router.js';

const DAILY = [5, 10, 15, 20];
const TIMES = ['Before school', 'After school', 'After practice', 'Before dinner', 'Before bed'];

export function Settings() {
  const k = kid.value;
  const s = k.settings;
  const local = session.value.mode === 'local';
  const goals = STREAK_GOALS.filter((g) => g >= 7);
  return (
    <div class="stack">
      <div class="screen-head">
        <div class="row"><button class="icon-btn plain" onClick={() => navigate('/')} aria-label="Back"><Icon name="back" /></button><h1>Settings</h1></div>
      </div>
      <div class="card">
        <div class="setting-row"><div><h3>Daily goal</h3><p class="muted small" style={{ fontWeight: 700 }}>Minutes of practice each day</p></div>
          <div class="chips">{DAILY.map((m) => <button class={`chip${s.dailyGoalMin === m ? ' on' : ''}`} onClick={() => updateKid((d) => { d.settings.dailyGoalMin = m; })}>{m} min</button>)}</div>
        </div>
        <div class="setting-row"><div><h3>Streak goal</h3><p class="muted small" style={{ fontWeight: 700 }}>Days in a row (now: {k.progress.streak.current})</p></div>
          <div class="chips">{goals.slice(0, 6).map((g) => (
            <button class={`chip${s.streakGoal === g ? ' on' : ''}`} disabled={g <= k.progress.streak.current}
              onClick={() => updateKid((d) => { d.settings.streakGoal = g; d.progress.streak = setStreakGoal(d.progress.streak, g, today.value); })}>{g}</button>
          ))}</div>
        </div>
        <div class="setting-row"><div><h3>Practice time</h3><p class="muted small" style={{ fontWeight: 700 }}>Shown as a reminder on Home</p></div>
          <div class="chips">{TIMES.map((x) => <button class={`chip${k.profile.practiceTime === x ? ' on' : ''}`} onClick={() => updateKid((d) => { d.profile.practiceTime = x; })}>{x}</button>)}</div>
        </div>
        <div class="setting-row"><div><h3>Sound effects</h3></div>
          <button class={`chip${s.sound ? ' on' : ''}`} onClick={() => updateKid((d) => { d.settings.sound = !d.settings.sound; })}>{s.sound ? 'On 🔊' : 'Off 🔇'}</button>
        </div>
      </div>
      <button class="card tap row" onClick={() => navigate('/grown-up')}>
        <Icon name="lock" size={28} /><div class="grow"><h3>Grown-ups</h3><p class="muted small" style={{ fontWeight: 700 }}>Dashboard and settings (PIN)</p></div><Icon name="arrow" />
      </button>
      <button class="btn light block" onClick={() => (local ? leaveLocalKid() : signOutAll())}>
        <Icon name="out" /> {local ? 'Switch learner' : 'Sign out'}
      </button>
    </div>
  );
}
