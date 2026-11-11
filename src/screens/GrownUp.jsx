// Grown-up area.
//  • On the learner's device: behind a 4-digit PIN (GrownUp).
//  • Signed in with the grown-up account on any device (GrownUpHome):
//    create learner accounts, see each learner's dashboard, change settings.

import { useEffect, useState } from 'preact/hooks';
import { kid, updateKid, session, today, watchKidAsGrownUp, saveSettingsAsGrownUp, resetKidAsGrownUp } from '../data/store.js';
import { newKidDoc, freshProgress } from '../data/model.js';
import { createKidAccount, signOutAll, authErrorText, USERNAME_RE } from '../services/firebase.js';
import { streakView, STREAK_GOALS, setStreakGoal } from '../engine/streaks.js';
import { weakestConcepts, overallMastery } from '../engine/mastery.js';
import { weekXp, levelFromXp, TIERS } from '../engine/rewards.js';
import { lastNDays, weekStart, addDays, prettyDate } from '../engine/dates.js';
import { CONCEPTS, TOTAL_CONCEPTS, unitById, personalize } from '../content/index.js';
import { nextLessonFor, WeekStrip } from './Home.jsx';
import { phrasesLearned } from './Progress.jsx';
import { MinutesChart, AccuracyChart } from '../ui/charts.jsx';
import { Avatar } from '../ui/widgets.jsx';
import { Icon } from '../ui/Icon.jsx';
import { navigate } from '../app/router.js';

export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------- PIN gate (learner's device) ----------------

function PinPad({ title, sub, onPin }) {
  const [pin, setPin] = useState('');
  const press = (d) => {
    const next = (pin + d).slice(0, 4);
    if (next.length === 4) { setPin(''); onPin(next); }
    else setPin(next);
  };
  return (
    <div class="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
      <h2>{title}</h2>
      {sub && <p class="muted" style={{ fontWeight: 700 }}>{sub}</p>}
      <div class="pin-dots">{[0, 1, 2, 3].map((i) => <span class={i < pin.length ? 'on' : ''} />)}</div>
      <div class="pin-pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <button onClick={() => press(String(d))}>{d}</button>)}
        <span />
        <button onClick={() => press('0')}>0</button>
        <button onClick={() => setPin(pin.slice(0, -1))} aria-label="Delete">⌫</button>
      </div>
    </div>
  );
}

export function GrownUp() {
  const k = kid.value;
  const sid = session.value.kidId;
  const [ok, setOk] = useState(false);
  const [first, setFirst] = useState(null);
  const [msg, setMsg] = useState('');
  const hasPin = !!k.settings.pinHash;

  async function onPin(pin) {
    const h = await hashPin(pin, sid);
    if (hasPin) {
      if (h === k.settings.pinHash) setOk(true);
      else setMsg("That PIN didn't match. Try again.");
    } else if (!first) { setFirst(pin); setMsg(''); }
    else if (first === pin) { updateKid((d) => { d.settings.pinHash = h; }); setOk(true); }
    else { setFirst(null); setMsg("Those didn't match. Let's start over."); }
  }

  if (!ok) {
    return (
      <div class="welcome">
        <div class="welcome-card card stack">
          <button class="icon-btn plain" onClick={() => navigate('/settings')} aria-label="Back"><Icon name="back" /></button>
          <PinPad title={hasPin ? 'Grown-ups only' : first ? 'Enter it again' : 'Create a grown-up PIN'}
            sub={hasPin ? 'Enter your 4-digit PIN' : 'Pick 4 digits only a grown-up knows'} onPin={onPin} />
          {msg && <p class="error center">{msg}</p>}
        </div>
      </div>
    );
  }
  return (
    <div class="shell-main" style={{ paddingBottom: 40 }}>
      <div class="screen-head">
        <div class="row"><button class="icon-btn plain" onClick={() => navigate('/settings')} aria-label="Back"><Icon name="back" /></button><h1>Grown-up dashboard</h1></div>
      </div>
      <Dashboard doc={k} kidId={sid}
        onSaveSettings={(settings) => updateKid((d) => {
          d.settings = settings;
          if (d.progress.streak.goal !== settings.streakGoal) d.progress.streak = setStreakGoal(d.progress.streak, settings.streakGoal, today.value);
        })}
        onReset={() => updateKid((d) => { d.progress = freshProgress(today.value, d.settings.streakGoal); d.settings.resetAt = Date.now(); })} />
    </div>
  );
}

// ---------------- Grown-up account (any device) ----------------

export function GrownUpHome() {
  const s = session.value;
  const [selected, setSelected] = useState(null);
  const [doc, setDoc] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!selected) return undefined;
    setDoc(null);
    let unsub = () => {};
    watchKidAsGrownUp(selected, setDoc).then((u) => { unsub = u; });
    return () => unsub();
  }, [selected]);
  useEffect(() => { if (!selected && s.kids?.length === 1) setSelected(s.kids[0].id); }, [s.kids]);

  return (
    <div class="shell-main" style={{ paddingBottom: 40 }}>
      <div class="screen-head">
        <div class="screen-title"><div class="brand" style={{ fontSize: 'var(--fs-xl)' }}>¡Dale! · Grown-ups</div><p class="muted small" style={{ fontWeight: 700 }}>{s.email}</p></div>
        <button class="btn light small" onClick={signOutAll}><Icon name="out" /> Sign out</button>
      </div>
      <div class="row wrap" style={{ marginBottom: 20 }}>
        {(s.kids || []).map((c) => (
          <button class={`chip${selected === c.id ? ' on' : ''}`} onClick={() => setSelected(c.id)}>👤 {c.nickname || c.username}</button>
        ))}
        <button class="chip" onClick={() => setAdding(true)}>➕ Add a learner</button>
      </div>
      {adding && <AddKid onDone={(id) => { setAdding(false); if (id) setSelected(id); }} />}
      {!s.kids?.length && !adding && (
        <div class="card stack center"><h2>Welcome!</h2><p style={{ fontWeight: 700 }}>Create a learner account. Your learner signs in with the username and password on their iPad.</p><button class="btn big" onClick={() => setAdding(true)}>Add a learner</button></div>
      )}
      {selected && !doc && <p class="muted">Loading…</p>}
      {selected && doc && (
        <Dashboard doc={doc} kidId={selected}
          onSaveSettings={(settings) => saveSettingsAsGrownUp(selected, settings)}
          onReset={() => resetKidAsGrownUp(selected, doc.settings)} />
      )}
    </div>
  );
}

function AddKid({ onDone }) {
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const u = username.trim().toLowerCase();
    if (u.includes('@')) { setErr("The username isn't an email. Make up a short name instead, like cam2015. No email needed!"); return; }
    if (!USERNAME_RE.test(u)) { setErr('Username: 3–20 lowercase letters, numbers, dots or dashes.'); return; }
    if (password.length < 6) { setErr('Password needs at least 6 characters (a Firebase rule).'); return; }
    setBusy(true); setErr('');
    try {
      const doc = newKidDoc({ nickname: nickname.trim(), username: u });
      const id = await createKidAccount({ username: u, password, nickname: nickname.trim() || u }, doc);
      onDone(id);
    } catch (ex) { setErr(authErrorText(ex)); }
    setBusy(false);
  }
  return (
    <form class="card stack" onSubmit={submit} style={{ marginBottom: 20 }}>
      <h3>New learner account</h3>
      <p class="muted small" style={{ fontWeight: 700 }}>No email needed. Use a nickname, not a full name.</p>
      <label class="field">Username (a short made-up name, not an email)<input class="input" placeholder="e.g. cam2015" value={username} onInput={(e) => setUsername(e.currentTarget.value)} autocapitalize="off" autocorrect="off" spellcheck={false} required /></label>
      <label class="field">Nickname (shown in the app)<input class="input" value={nickname} maxLength={16} onInput={(e) => setNickname(e.currentTarget.value)} /></label>
      <label class="field">Password (6+ characters)<input class="input" type="text" value={password} onInput={(e) => setPassword(e.currentTarget.value)} autocomplete="new-password" required /></label>
      {err && <p class="error">{err}</p>}
      <div class="row"><button class="btn" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button><button type="button" class="btn ghost" onClick={() => onDone(null)}>Cancel</button></div>
    </form>
  );
}

// ---------------- Shared dashboard ----------------

export function Dashboard({ doc, kidId, onSaveSettings, onReset }) {
  const t = today.value;
  const p = doc.progress;
  const s = doc.settings;
  const view = streakView(p.streak, t);
  const last14 = lastNDays(t, 14);
  const started = p.startedOn || t;
  const counted = last14.filter((d) => d >= started);
  const hitRate = counted.length ? Math.round((counted.filter((d) => p.days[d]?.goalMet).length / counted.length) * 100) : 0;
  const minWeek = (monday) => Math.round([0, 1, 2, 3, 4, 5, 6].reduce((sum, i) => sum + (p.days[addDays(monday, i)]?.sec || 0), 0) / 60);
  const thisMon = weekStart(t);
  const acc = p.stats.scored ? Math.round((p.stats.scoreSum / p.stats.scored) * 100) : null;
  const hardest = weakestConcepts(p.concepts, 8).filter((id) => CONCEPTS[id] && CONCEPTS[id].kind !== 'word').slice(0, 6);
  const next = nextLessonFor(doc);
  const unit = next ? unitById(next.unitId) : null;
  const nick = doc.profile.nickname;
  const [confirmReset, setConfirmReset] = useState(false);
  const [pinMsg, setPinMsg] = useState('');

  const set = (patch) => onSaveSettings({ ...s, ...patch });

  return (
    <div class="stack">
      <div class="card row" style={{ gap: 16 }}>
        <Avatar avatar={doc.profile.avatar} size="lg" />
        <div class="grow">
          <h2>{nick || 'Learner'}</h2>
          <p class="muted" style={{ fontWeight: 700 }}>Level {levelFromXp(p.xp).level} · {p.xp} XP · Liga {TIERS[p.league.tier].name}</p>
          <p class="small" style={{ fontWeight: 700 }}>Now on: {unit ? `${unit.title} → ${next.title}` : 'Course complete!'}</p>
        </div>
      </div>

      <div class="kpis">
        <div class="kpi"><div class="v" style={{ color: 'var(--c-flame)' }}>🔥 {view.current}</div><div class="k">streak · goal {view.goal} · best {view.best}</div></div>
        <div class="kpi"><div class="v">{hitRate}%</div><div class="k">daily goal hit rate (14 days)</div></div>
        <div class="kpi"><div class="v">{overallMastery(p.concepts, TOTAL_CONCEPTS)}%</div><div class="k">mastery · {phrasesLearned(p)} phrases</div></div>
        <div class="kpi"><div class="v">{acc == null ? '—' : `${acc}%`}</div><div class="k">speaking accuracy</div></div>
      </div>

      <div class="card">
        <div class="row between"><h3>Minutes per day</h3><span class="muted small" style={{ fontWeight: 800 }}>This week {minWeek(thisMon)} min · Last week {minWeek(addDays(thisMon, -7))} min</span></div>
        <MinutesChart days={p.days} today={t} goalMin={s.dailyGoalMin} />
        <WeekStrip k={doc} t={t} />
      </div>
      <div class="card"><h3>Speaking accuracy</h3><AccuracyChart days={p.days} today={t} /></div>

      <div class="home-grid">
        <div class="card">
          <h3>Hardest phrases</h3>
          {hardest.length ? hardest.map((id) => (
            <div class="cando"><div class="grow"><div class="es" lang="es">{personalize(CONCEPTS[id].es, nick).replace('{x}', '___')}</div><div class="muted small">{CONCEPTS[id].en.replace('{x}', '___')}</div></div><b>{p.concepts[id].mastery}%</b></div>
          )) : <p class="muted">Nothing yet.</p>}
        </div>
        <div class="card">
          <h3>Recent activity</h3>
          {p.recent.length ? (
            <table class="table"><thead><tr><th>Date</th><th>Activity</th><th>Acc.</th><th>XP</th></tr></thead>
              <tbody>{p.recent.slice(0, 8).map((r) => (
                <tr><td>{prettyDate(r.date)}</td><td>{r.title || r.kind}</td><td>{r.accuracy == null ? '—' : `${Math.round(r.accuracy * 100)}%`}</td><td>{r.xp}</td></tr>
              ))}</tbody></table>
          ) : <p class="muted">No lessons yet.</p>}
        </div>
      </div>

      <div class="card">
        <h3>Settings</h3>
        <div class="setting-row"><b>Daily goal</b><div class="chips">{[5, 10, 15, 20].map((m) => <button class={`chip${s.dailyGoalMin === m ? ' on' : ''}`} onClick={() => set({ dailyGoalMin: m })}>{m} min</button>)}</div></div>
        <div class="setting-row"><b>Streak goal</b><div class="chips">{STREAK_GOALS.filter((g) => g >= 7).slice(0, 6).map((g) => <button class={`chip${s.streakGoal === g ? ' on' : ''}`} onClick={() => set({ streakGoal: g })}>{g}</button>)}</div></div>
        <div class="setting-row"><div><b>Speech scoring</b><p class="muted small">Gentle accepts rougher attempts.</p></div><div class="chips">{['gentle', 'standard'].map((l) => <button class={`chip${s.leniency === l ? ' on' : ''}`} onClick={() => set({ leniency: l })}>{l[0].toUpperCase() + l.slice(1)}</button>)}</div></div>
        <div class="setting-row"><div><b>Listening</b><p class="muted small">Auto picks the best option on this device.</p></div><div class="chips">{[['auto', 'Auto'], ['webspeech', 'Safari speech'], ['cloud', 'Cloud'], ['selfcheck', 'Self-check']].map(([v, l]) => <button class={`chip${s.listening === v ? ' on' : ''}`} onClick={() => set({ listening: v })}>{l}</button>)}</div></div>
        <div class="setting-row"><b>Sound effects</b><button class={`chip${s.sound ? ' on' : ''}`} onClick={() => set({ sound: !s.sound })}>{s.sound ? 'On' : 'Off'}</button></div>
        <div class="setting-row"><div><b>AI tutor</b><p class="muted small">Free Talk + Ask the coach (only if the worker is set up)</p></div><button class={`chip${s.tutor ? ' on' : ''}`} onClick={() => set({ tutor: !s.tutor })}>{s.tutor ? 'On' : 'Off'}</button></div>
        <div class="setting-row"><div><b>Device PIN</b><p class="muted small">{pinMsg || 'Locks this dashboard on the learner\'s iPad.'}</p></div>
          <button class="chip" onClick={async () => {
            const pin = window.prompt('New 4-digit PIN');
            if (pin && /^\d{4}$/.test(pin)) { set({ pinHash: await hashPin(pin, kidId) }); setPinMsg('PIN updated.'); }
            else if (pin) setPinMsg('PIN must be 4 digits.');
          }}>Change PIN</button></div>
        <div class="setting-row"><div><b>Reset progress</b><p class="muted small">Erases XP, streak and mastery. Can't be undone.</p></div>
          <button class="chip" style={{ color: '#b5481b' }} onClick={() => setConfirmReset(true)}>Reset…</button></div>
      </div>

      {confirmReset && (
        <div class="overlay" role="dialog" aria-modal="true">
          <div class="modal">
            <div class="big-icon">⚠️</div>
            <h2>Reset all progress?</h2>
            <p class="muted" style={{ margin: '10px 0 20px', fontWeight: 700 }}>This erases {nick || 'the learner'}'s XP, streak, trophies and mastery. Settings and the profile stay. This can't be undone.</p>
            <div class="stack tight">
              <button class="btn block" style={{ '--btn-bg': '#d1542a', '--btn-edge': '#9c3b1b' }} onClick={() => { onReset(); setConfirmReset(false); }}>Yes, reset progress</button>
              <button class="btn light block" onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
