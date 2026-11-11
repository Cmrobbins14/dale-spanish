// Free Talk (optional AI tutor): a 3–5 minute spoken chat with Coach Chispa
// on a scenario that fits his level and interests, with 2–3 mini-tasks.
// Only shown when the worker is set up and the grown-up setting allows it.

import { useEffect, useRef, useState } from 'preact/hooks';
import { kid } from '../data/store.js';
import { addSeconds, addXp, completeLesson } from '../data/actions.js';
import { tutorChat, tutorAvailable } from '../services/worker.js';
import { chooseEngine, listenOnce } from '../speech/listen.js';
import { speak, stopSpeaking, unlockAudio, RATES } from '../speech/tts.js';
import { ActiveTimer } from '../engine/activeTime.js';
import { XP } from '../engine/rewards.js';
import { CONCEPTS, personalize } from '../content/index.js';
import { Coach } from '../ui/Coach.jsx';
import { Icon } from '../ui/Icon.jsx';
import { sfx } from '../ui/sfx.js';
import { navigate } from '../app/router.js';

const SCENARIOS = [
  { id: 'pickup', tag: 'sports', icon: '⚽', title: 'Pickup soccer', scenario: 'Chispa meets him at the park and wants to start a soccer game.', tasks: ['Say hi and your name', 'Say what position you play', 'Ask Chispa a question'] },
  { id: 'tacos', tag: 'food', icon: '🌮', title: 'Taco stand', scenario: 'Chispa runs a taco stand and he is ordering a snack after a game.', tasks: ['Order something with "quiero… por favor"', 'Ask how much it costs', 'Say thank you'] },
  { id: 'lucha', tag: 'sports', icon: '🤼', title: 'Lucha libre night', scenario: 'Chispa and he are watching a lucha libre show and talk about the wrestlers.', tasks: ['Say if you like lucha libre', 'Describe a wrestler with "es muy…"', 'Say what you like to do'] },
  { id: 'newfriend', tag: 'friends', icon: '🤝', title: 'New friend', scenario: 'Chispa is a new kid at school and wants to get to know him.', tasks: ['Introduce yourself', 'Say how old you are', 'Say what you like'] },
];
const MINUTES = 4;

export function FreeTalk() {
  const k = kid.value;
  const topics = k.profile.topics || [];
  const [pick, setPick] = useState(null);
  if (!tutorAvailable() || k.settings.tutor === false) {
    return <div class="lesson"><p style={{ fontWeight: 700 }}>Free Talk isn't turned on.</p><button class="btn" onClick={() => navigate('/')}>Back</button></div>;
  }
  if (!pick) {
    const list = [...SCENARIOS].sort((a, b) => (topics.includes(b.tag) ? 1 : 0) - (topics.includes(a.tag) ? 1 : 0));
    return (
      <div class="lesson">
        <div class="lesson-top"><button class="icon-btn plain" onClick={() => navigate('/')} aria-label="Back"><Icon name="close" /></button></div>
        <div class="step">
          <div class="coach-row"><Coach size={96} /><div class="bubble">Let's chat in Spanish! Pick a scene. Just talk. Mistakes are totally fine!</div></div>
          <div class="option-grid">
            {list.map((s) => (
              <button class="option" onClick={() => { unlockAudio(); setPick(s); }}>
                <span style={{ fontSize: 40 }}>{s.icon}</span><span class="o-big">{s.title}</span>{s.scenario}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return <Talk scene={pick} />;
}

function Talk({ scene }) {
  const k = kid.value;
  const [log, setLog] = useState([]); // { role: 'coach'|'me', text, en?, try? }
  const [done, setDone] = useState([]);
  const [busy, setBusy] = useState(true);
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState('');
  const [talking, setTalking] = useState(false);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState(false);
  const engine = chooseEngine(k.settings.listening);
  const timer = useRef(null);
  const started = useRef(Date.now());
  const endRef = useRef(null);
  const known = Object.keys(k.progress.concepts).map((id) => CONCEPTS[id]?.es).filter(Boolean).map((t) => personalize(t, k.profile.nickname)).slice(0, 80);

  useEffect(() => {
    timer.current = new ActiveTimer((s) => addSeconds(s));
    timer.current.start();
    turn([]);
    return () => { timer.current?.stop(); stopSpeaking(); };
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }); }, [log, busy]);

  async function turn(history) {
    setBusy(true); setError('');
    try {
      const r = await tutorChat({ mode: 'freetalk', scenario: scene.scenario, tasks: scene.tasks, known, history });
      const next = [...history, { role: 'coach', text: r.reply_es, en: r.reply_en }];
      if (r.try && history.length) next[next.length - 2] = { ...next[next.length - 2], try: r.try };
      setLog(next);
      setDone(r.tasks_done || []);
      setBusy(false);
      setTalking(true);
      await speak(r.reply_es, { lang: 'es' });
      setTalking(false);
    } catch (e) {
      setBusy(false);
      setError(e.message === 'daily-limit' ? 'Coach is resting for today. Great chatting!' : "I couldn't reach Coach Chispa. Check the internet and try again.");
    }
  }

  async function send(text) {
    if (!text.trim()) return;
    sfx('tap');
    timer.current?.poke();
    const history = [...log, { role: 'me', text: text.trim() }];
    setLog(history);
    setTyped('');
    if ((Date.now() - started.current) / 60000 >= MINUTES + 1) { finish(history); return; }
    await turn(history);
  }

  async function onMic() {
    unlockAudio(); stopSpeaking();
    setListening(true);
    try {
      const r = await listenOnce(engine, { maxMs: 10000 });
      setListening(false);
      if (r.alternatives[0]) send(r.alternatives[0]);
      else setError("I didn't catch that. Try again, or type it below.");
    } catch {
      setListening(false);
      setError('Listening isn\'t available here. You can type your answer instead.');
    }
  }

  function finish() {
    if (finished) return;
    setFinished(true);
    timer.current?.stop();
    const xp = XP.freeTalk + done.length * 5;
    addXp(xp);
    completeLesson(null, { accuracy: null, perfect: false, xp, seconds: timer.current?.total || 0, kind: 'free-talk' });
  }

  const elapsed = (Date.now() - started.current) / 60000;
  if (finished) {
    return (
      <div class="lesson"><div class="step summary" style={{ justifyContent: 'center' }}>
        <Coach size={130} cheer /><h1>¡Qué buena plática!</h1>
        <p class="muted" style={{ fontWeight: 700 }}>You finished {done.length} of {scene.tasks.length} mini-tasks.</p>
        <button class="btn green big block" onClick={() => navigate('/')}>Done</button>
      </div></div>
    );
  }
  return (
    <div class="lesson">
      <div class="lesson-top">
        <button class="icon-btn plain" onClick={() => navigate('/')} aria-label="Leave"><Icon name="close" /></button>
        <div class="grow" style={{ fontWeight: 800 }}>{scene.icon} {scene.title}</div>
        <button class="btn light small" onClick={finish}>Finish</button>
      </div>
      <div class="card flat" style={{ marginTop: 12 }}>
        {scene.tasks.map((t, i) => <div class="row" style={{ fontWeight: 700 }}><span>{done.includes(i) ? '✅' : '⬜️'}</span>{t}</div>)}
      </div>
      <div class="step" style={{ paddingTop: 12 }}>
        <div class="chat" aria-live="polite">
          {log.map((m) => (
            <div class={`msg ${m.role === 'coach' ? 'them' : 'me'}`}>
              <span class="es" lang="es">{m.text}</span>
              {m.en && <span class="en">{m.en}</span>}
              {m.role === 'coach' && <button class="icon-btn plain" style={{ width: 40, height: 40 }} onClick={() => speak(m.text, { lang: 'es', rate: RATES.slow })} aria-label="Hear slowly"><Icon name="turtle" /></button>}
              {m.try && <span class="en">💡 Try: <b lang="es">{m.try}</b></span>}
            </div>
          ))}
          {busy && <div class="msg them"><span class="muted">Chispa is thinking…</span></div>}
          <div ref={endRef} />
        </div>
        {error && <div class="feedback info small">{error}</div>}
        <div class="step-foot">
          {elapsed >= MINUTES && <p class="center muted small" style={{ fontWeight: 700 }}>Great job! Tap Finish when you're ready.</p>}
          <div class="row" style={{ justifyContent: 'center' }}>
            <Coach size={64} talking={talking} />
            {engine !== 'selfcheck' && (
              <button class={`mic${listening ? ' listening' : ''}`} disabled={busy} onClick={onMic} aria-label="Speak"><Icon name="mic" /></button>
            )}
          </div>
          <form class="row" onSubmit={(e) => { e.preventDefault(); send(typed); }}>
            <input class="input grow" value={typed} maxLength={200} placeholder="…or type in Spanish" onInput={(e) => setTyped(e.currentTarget.value)} lang="es" />
            <button class="btn small" disabled={busy || !typed.trim()}>Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}
