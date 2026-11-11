// First screen. Firebase mode: learner sign-in (username + password) or
// grown-up sign-in. Local-only mode: pick or create a learner on this device.

import { useState } from 'preact/hooks';
import { session, localProfiles, openLocalKid, createLocalKid } from '../data/store.js';
import { signInKid, signInGrownUp, createGrownUp, authErrorText, USERNAME_RE } from '../services/firebase.js';
import { Coach } from '../ui/Coach.jsx';
import { Avatar } from '../ui/widgets.jsx';
import { unlockAudio } from '../speech/tts.js';

export function Welcome() {
  const local = session.value.mode === 'local';
  return (
    <div class="welcome">
      <div class="welcome-card stack">
        <div class="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Coach size={130} />
          <div class="brand">¡Dale!</div>
          <p class="muted" style={{ fontWeight: 700, fontSize: 'var(--fs-lg)' }}>Speak Spanish with Coach Chispa</p>
        </div>
        {local ? <LocalPicker /> : <SignIn />}
      </div>
    </div>
  );
}

function LocalPicker() {
  const profiles = localProfiles();
  return (
    <div class="card stack">
      {profiles.length > 0 && (
        <>
          <h3>Who's practicing?</h3>
          {profiles.map((p) => (
            <button class="card flat tap row" onClick={() => { unlockAudio(); openLocalKid(p.id); }}>
              <Avatar avatar={p.avatar} />
              <span class="es" style={{ fontSize: 'var(--fs-lg)' }}>{p.nickname}</span>
            </button>
          ))}
        </>
      )}
      <button class="btn block big" onClick={() => { unlockAudio(); createLocalKid(); }}>
        {profiles.length ? 'New learner' : "Let's start!"}
      </button>
      <p class="local-banner">📱 Local mode: progress is saved on this device only. A grown-up can turn on accounts and syncing later (see the README).</p>
    </div>
  );
}

function SignIn() {
  const [who, setWho] = useState('kid');
  const [create, setCreate] = useState(false);
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    unlockAudio();
    if (who === 'kid' && !USERNAME_RE.test(name.trim().toLowerCase())) { setErr('Usernames use 3–20 letters or numbers.'); return; }
    setBusy(true);
    try {
      if (who === 'kid') await signInKid(name, pass);
      else if (create) await createGrownUp(name, pass);
      else await signInGrownUp(name, pass);
    } catch (ex) {
      setErr(authErrorText(ex));
    }
    setBusy(false);
  }

  return (
    <form class="card stack" onSubmit={submit}>
      <div class="seg" role="tablist">
        <button type="button" class={who === 'kid' ? 'on' : ''} onClick={() => { setWho('kid'); setErr(''); }}>I'm the learner</button>
        <button type="button" class={who === 'grown' ? 'on' : ''} onClick={() => { setWho('grown'); setErr(''); }}>Grown-up</button>
      </div>
      <label class="field">{who === 'kid' ? 'Username' : 'Email'}
        <input class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} autocapitalize="off" autocorrect="off" spellcheck={false}
          type={who === 'kid' ? 'text' : 'email'} autocomplete={who === 'kid' ? 'username' : 'email'} required />
      </label>
      <label class="field">Password
        <input class="input" type="password" value={pass} onInput={(e) => setPass(e.currentTarget.value)} autocomplete={create ? 'new-password' : 'current-password'} required minLength={6} />
      </label>
      {err && <p class="error" role="alert">{err}</p>}
      <button class="btn block big" disabled={busy}>{busy ? 'One sec…' : who === 'grown' && create ? 'Create grown-up account' : 'Sign in'}</button>
      {who === 'grown' && (
        <button type="button" class="btn ghost" onClick={() => setCreate(!create)}>
          {create ? 'I already have an account' : 'New here? Create a grown-up account'}
        </button>
      )}
      {who === 'kid' && <p class="muted small center" style={{ fontWeight: 700 }}>Ask your grown-up to set up your username first.</p>}
    </form>
  );
}
