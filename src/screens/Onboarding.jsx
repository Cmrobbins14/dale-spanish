// Onboarding is a chat with Coach Chispa, not a form. It collects a
// nickname + avatar, reasons, interests, a quick speaking placement check,
// daily goal, streak goal and practice time, then shows "Your plan".

import { useEffect, useState } from 'preact/hooks';
import { kid, updateKid, today } from '../data/store.js';
import { recordItem } from '../data/actions.js';
import { AVATARS, AVATAR_COLORS } from '../data/model.js';
import { speak, stopSpeaking, unlockAudio } from '../speech/tts.js';
import { setStreakGoal } from '../engine/streaks.js';
import { addDays, prettyDate } from '../engine/dates.js';
import { courseOrder, lessonById, MINUTES_PER_LESSON } from '../content/index.js';
import { SpeakPanel } from '../lesson/SpeakPanel.jsx';
import { Coach } from '../ui/Coach.jsx';
import { Avatar, ProgressBar } from '../ui/widgets.jsx';
import { sfx } from '../ui/sfx.js';
import { navigate } from '../app/router.js';

const REASONS = [
  { id: 'friends', label: 'Talk with friends', icon: '💬' },
  { id: 'school', label: 'For school', icon: '🏫' },
  { id: 'travel', label: 'Travel', icon: '✈️' },
  { id: 'sports', label: 'Sports', icon: '⚽' },
  { id: 'fun', label: 'Just for fun', icon: '🎉' },
];
const TOPICS = [
  { id: 'sports', label: 'Sports', icon: '⚽' },
  { id: 'games', label: 'Games', icon: '🎮' },
  { id: 'food', label: 'Food', icon: '🌮' },
  { id: 'animals', label: 'Animals', icon: '🐶' },
  { id: 'music', label: 'Music', icon: '🎵' },
  { id: 'school', label: 'School', icon: '📚' },
  { id: 'friends', label: 'Friends', icon: '🤝' },
  { id: 'travel', label: 'Places', icon: '🗺️' },
];
const DAILY = [
  { min: 5, label: 'Warm-up' }, { min: 10, label: 'Practice' }, { min: 15, label: 'Training' }, { min: 20, label: 'Pro' },
];
const STREAKS = [7, 14, 30, 50];
const TIMES = [
  { id: 'Before school', icon: '🌅' }, { id: 'After school', icon: '🎒' }, { id: 'After practice', icon: '⚽' },
  { id: 'Before dinner', icon: '🍽️' }, { id: 'Before bed', icon: '🌙' },
];

// Placement check: short, adaptive, generously scored.
const PLACEMENT = [
  { id: 'hola', say: '¡Hola!', en: 'Say "hi" in Spanish!', stage: 'english', concept: 'hola' },
  { id: 'count', say: 'uno, dos, tres, cuatro, cinco', en: 'Count from 1 to 5 in Spanish!', stage: 'english', concept: 'numeros-1-5' },
  { id: 'name', say: 'Me llamo {me}.', en: 'Say "My name is…" with your name!', stage: 'english', concept: 'me-llamo' },
  { id: 'listen', listen: '¿Cómo estás?', options: ['How are you?', "What's your name?", 'Where are you?'], answer: 0, concept: 'como-estas' },
  { id: 'age', open: { accept: ['tengo {number} años', 'tengo {number}', '{number} años', '{number}'], model: 'Tengo once años.', hint: 'Tengo ___ años.' }, q: '¿Cuántos años tienes?', en: 'How old are you?', concept: 'tengo-x-anos' },
  // Harder items, only if the first ones went well:
  { id: 'morning', say: 'Buenos días.', en: 'Say "Good morning" in Spanish!', stage: 'english', concept: 'buenos-dias', hard: true },
  { id: 'play', listen: '¿Quieres jugar al fútbol?', options: ['Do you want to play soccer?', 'Do you like soccer?', 'Where is the soccer field?'], answer: 0, concept: 'quieres-jugar-futbol', hard: true },
  { id: 'like', say: 'Me gusta el fútbol.', en: 'Say "I like soccer" in Spanish!', stage: 'english', concept: 'me-gusta-el-futbol', hard: true },
];

const STAGES = ['hello', 'why', 'topics', 'placementIntro', 'placement', 'daily', 'streak', 'time', 'plan'];

function useCoachLine(text, deps) {
  const [talking, setTalking] = useState(false);
  useEffect(() => {
    let live = true;
    setTalking(true);
    speak(text, { lang: 'en' }).then(() => live && setTalking(false));
    return () => { live = false; stopSpeaking(); };
  }, deps);
  return talking;
}

function CoachSays({ text, sub, deps }) {
  const talking = useCoachLine(text, deps);
  return (
    <div class="coach-row">
      <Coach size={96} talking={talking} />
      <div class="bubble">{text}{sub && <span class="en-small">{sub}</span>}</div>
    </div>
  );
}

export function Onboarding() {
  const p = kid.value.profile;
  // Always start with the nickname + avatar step (a grown-up may have
  // pre-filled the nickname; he still picks his own buddy and color).
  const [stage, setStage] = useState('hello');
  const idx = STAGES.indexOf(stage);
  const go = (s) => { sfx('tap'); setStage(s); };
  return (
    <div class="ob">
      <div class="lesson-top">
        <ProgressBar pct={(idx + 1) / STAGES.length} />
      </div>
      <div class="ob-body" key={stage}>
        {stage === 'hello' && <Hello onNext={() => go('why')} />}
        {stage === 'why' && <Multi field="reasons" options={REASONS} line={`Nice to meet you, ${p.nickname}! Why do you want to learn Spanish? Pick as many as you like.`} onNext={() => go('topics')} />}
        {stage === 'topics' && <Multi field="topics" options={TOPICS} line="What are you into? I'll use these in your lessons." onNext={() => go('placementIntro')} />}
        {stage === 'placementIntro' && <PlacementIntro onNext={() => go('placement')} />}
        {stage === 'placement' && <Placement onNext={() => go('daily')} />}
        {stage === 'daily' && <DailyGoal onNext={() => go('streak')} />}
        {stage === 'streak' && <StreakGoal onNext={() => go('time')} />}
        {stage === 'time' && <PracticeTime onNext={() => go('plan')} />}
        {stage === 'plan' && <Plan />}
      </div>
    </div>
  );
}

function Hello({ onNext }) {
  const [name, setName] = useState(kid.value.profile.nickname || '');
  const [icon, setIcon] = useState(kid.value.profile.avatar.icon);
  const [color, setColor] = useState(kid.value.profile.avatar.color);
  const clean = name.trim().slice(0, 16);
  return (
    <>
      <CoachSays text="¡Hola! I'm Chispa, your Spanish coach. What should I call you?" sub="Just a nickname is perfect." deps={[]} />
      <div class="card stack">
        <label class="field">My nickname
          <input class="input" value={name} maxLength={16} placeholder="Nickname" onInput={(e) => setName(e.currentTarget.value)} autocomplete="off" />
        </label>
        <div class="field">Pick your buddy
          <div class="swatches">
            {AVATARS.map((a) => <button class={`swatch${a === icon ? ' on' : ''}`} style={{ background: 'var(--c-surface-2)', fontSize: 28 }} onClick={() => setIcon(a)} aria-label={`avatar ${a}`}>{a}</button>)}
          </div>
        </div>
        <div class="field">Pick a color
          <div class="swatches">
            {AVATAR_COLORS.map((c) => <button class={`swatch${c === color ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`color ${c}`} />)}
          </div>
        </div>
        <div class="row"><Avatar avatar={{ icon, color }} size="lg" /><h2>{clean || '…'}</h2></div>
      </div>
      <div class="step-foot">
        <button class="btn block big" disabled={!clean} onClick={() => {
          unlockAudio();
          updateKid((d) => { d.profile.nickname = clean; d.profile.avatar = { icon, color }; });
          onNext();
        }}>That's me!</button>
      </div>
    </>
  );
}

function Multi({ field, options, line, onNext }) {
  const [sel, setSel] = useState(kid.value.profile[field] || []);
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <>
      <CoachSays text={line} deps={[field]} />
      <div class="chips">
        {options.map((o) => (
          <button class={`chip${sel.includes(o.id) ? ' on' : ''}`} aria-pressed={sel.includes(o.id)} onClick={() => { sfx('tap'); toggle(o.id); }}>
            <span class="emoji">{o.icon}</span>{o.label}
          </button>
        ))}
      </div>
      <div class="step-foot">
        <button class="btn block big" disabled={!sel.length} onClick={() => { updateKid((d) => { d.profile[field] = sel; }); onNext(); }}>Next</button>
      </div>
    </>
  );
}

function PlacementIntro({ onNext }) {
  return (
    <>
      <CoachSays text="I heard you already know some Spanish! Let's do a super quick speaking check. Just do your best. There's no wrong answer here." deps={[]} />
      <div class="card stack" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64 }}>🎤</div>
        <p style={{ fontWeight: 700 }}>Tap the big mic, then speak. If you don't know one, just tap <b>Keep going</b>.</p>
      </div>
      <div class="step-foot"><button class="btn block big" onClick={() => { unlockAudio(); onNext(); }}>Let's go!</button></div>
    </>
  );
}

function Placement({ onNext }) {
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [asked, setAsked] = useState(0);
  const items = PLACEMENT;
  const item = items[i];

  function done(points, conceptId, outcome, s) {
    if (conceptId) recordItem(conceptId, outcome, s, { spoken: outcome !== 'listen' && outcome !== 'notyet-listen' });
    const newScore = score + points;
    const newAsked = asked + 1;
    setScore(newScore);
    setAsked(newAsked);
    // Adaptive: after 5 items, only continue to the harder ones if it's going well.
    let next = i + 1;
    if (next === 5 && newScore / newAsked < 0.6) next = items.length;
    if (next >= items.length) {
      const ratio = newScore / newAsked;
      const level = newAsked >= 8 && ratio >= 0.75 ? 'strong' : ratio >= 0.35 ? 'some' : 'new';
      updateKid((d) => {
        d.profile.placement = { level, score: Math.round(ratio * 100) / 100, items: newAsked };
        d.profile.startLesson = level === 'strong' ? 'u1-l1' : 'u0-l1';
      });
      onNext();
      return;
    }
    setI(next);
  }

  const pointsFor = (o) => (o === 'great' ? 1 : o === 'good' ? 0.8 : o === 'selfcheck' ? 0.7 : 0);
  return (
    <>
      <div class="step-label">Quick check · {i + 1}</div>
      {item.listen ? (
        <PlacementListen key={item.id} item={item} onDone={(ok) => done(ok ? 1 : 0, item.concept, ok ? 'listen' : 'notyet', null)} />
      ) : item.open ? (
        <>
          <CoachSays text={item.q} sub={item.en} deps={[item.id]} />
          <SpeakPanel key={item.id} open={item.open} onComplete={(r) => done(pointsFor(r.outcome), item.concept, r.outcome, r.score)} />
        </>
      ) : (
        <SpeakPanel key={item.id} target={item.say} en={item.en} stage={item.stage} onComplete={(r) => done(pointsFor(r.outcome), item.concept, r.outcome, r.score)} />
      )}
    </>
  );
}

function PlacementListen({ item, onDone }) {
  const [picked, setPicked] = useState(null);
  useEffect(() => { const t = setTimeout(() => speak(item.listen, { lang: 'es' }), 300); return () => clearTimeout(t); }, []);
  return (
    <>
      <CoachSays text="Listen. What does this mean?" deps={[item.id]} />
      <div class="phrase-card"><button class="btn light" onClick={() => speak(item.listen, { lang: 'es' })}>🔊 Play again</button></div>
      <div class="choices">
        {item.options.map((o, k) => (
          <button class={`choice${picked === k ? (k === item.answer ? ' right' : ' try') : ''}`} disabled={picked != null}
            onClick={() => { setPicked(k); sfx(k === item.answer ? 'great' : 'notyet'); setTimeout(() => onDone(k === item.answer), 700); }}>{o}</button>
        ))}
      </div>
    </>
  );
}

function DailyGoal({ onNext }) {
  const [min, setMin] = useState(kid.value.settings.dailyGoalMin || 10);
  return (
    <>
      <CoachSays text="Great job! Now, how many minutes a day do you want to practice?" deps={[]} />
      <div class="option-grid">
        {DAILY.map((d) => (
          <button class={`option${min === d.min ? ' on' : ''}`} onClick={() => { sfx('tap'); setMin(d.min); }}>
            <span class="o-big">{d.min} min</span>{d.label}
          </button>
        ))}
      </div>
      <div class="step-foot"><button class="btn block big" onClick={() => { updateKid((d) => { d.settings.dailyGoalMin = min; }); onNext(); }}>Next</button></div>
    </>
  );
}

function StreakGoal({ onNext }) {
  const [goal, setGoal] = useState(kid.value.settings.streakGoal || 14);
  return (
    <>
      <CoachSays text="Let's set a streak goal! How many days in a row can you practice?" sub="Streaks help because a little practice every day sticks in your brain better than a lot once a week." deps={[]} />
      <div class="option-grid">
        {STREAKS.map((g) => (
          <button class={`option${goal === g ? ' on' : ''}`} onClick={() => { sfx('tap'); setGoal(g); }}>
            <span class="o-big">🔥 {g} days</span>{g === 7 ? 'One week' : g === 14 ? 'Two weeks' : g === 30 ? 'A whole month' : 'Legendary'}
          </button>
        ))}
      </div>
      <p class="muted small" style={{ fontWeight: 700 }}>🧊 Bonus: every 7 days you earn a streak freeze that saves your streak if you miss a day.</p>
      <div class="step-foot"><button class="btn block big orange" onClick={() => {
        updateKid((d) => { d.settings.streakGoal = goal; d.progress.streak = setStreakGoal(d.progress.streak, goal, today.value); });
        onNext();
      }}>I can do it!</button></div>
    </>
  );
}

function PracticeTime({ onNext }) {
  const [t, setT] = useState(kid.value.profile.practiceTime || '');
  return (
    <>
      <CoachSays text="When's a good time to practice each day? I'll remind you on the home screen." deps={[]} />
      <div class="chips">
        {TIMES.map((x) => (
          <button class={`chip${t === x.id ? ' on' : ''}`} onClick={() => { sfx('tap'); setT(x.id); }}><span class="emoji">{x.icon}</span>{x.id}</button>
        ))}
      </div>
      <div class="step-foot"><button class="btn block big" disabled={!t} onClick={() => { updateKid((d) => { d.profile.practiceTime = t; }); onNext(); }}>Next</button></div>
    </>
  );
}

/** Builds the "Your plan" summary from the answers and the course map. */
export function makePlan(profile, settings, todayKey) {
  const units = courseOrder(profile.topics);
  const start = lessonById(profile.startLesson || 'u0-l1');
  const startU = units.findIndex((u) => u.id === start.unitId);
  const target = units[Math.min(units.length - 1, startU + 1)];
  const lessons = units.flatMap((u) => u.lessons.map((l) => ({ ...l, unitId: u.id })));
  const from = lessons.findIndex((l) => l.id === start.id);
  const to = lessons.map((l) => l.unitId).lastIndexOf(target.id);
  const count = Math.max(1, to - from + 1);
  const perDay = Math.max(1, Math.floor(settings.dailyGoalMin / MINUTES_PER_LESSON));
  const days = Math.ceil(count / perDay);
  const cans = target.lessons.filter((l) => l.canDo).slice(0, 3).map((l) => l.canDo.replace(/^I can /, ''));
  return { startLesson: start, startUnit: units[startU], target, date: prettyDate(addDays(todayKey, days)), cans };
}

function Plan() {
  const k = kid.value;
  const plan = makePlan(k.profile, k.settings, today.value);
  const level = k.profile.placement?.level;
  const why = level === 'strong'
    ? 'You already know the basics really well, so we\'ll jump right into new stuff!'
    : level === 'some' ? 'You know some Spanish already! We\'ll start with a quick warm-up to make it feel easy, then learn new things.'
      : 'We\'ll start with a fun warm-up of the basics so you feel super confident.';
  const talking = useCoachLine(`Here's your plan, ${k.profile.nickname}! ${why}`, []);
  return (
    <>
      <div class="coach-row"><Coach size={96} talking={talking} cheer /><div class="bubble"><h2>Your plan</h2><span class="en-small">{why}</span></div></div>
      <div class="plan-list">
        <div class="plan-item"><span class="p-icon">{plan.startUnit.icon}</span><div><div class="muted small" style={{ fontWeight: 800 }}>START HERE</div><h3>{plan.startUnit.title}</h3><div class="muted" style={{ fontWeight: 700 }}>{plan.startUnit.titleEn}</div></div></div>
        <div class="plan-item"><span class="p-icon">⏱️</span><div><div class="muted small" style={{ fontWeight: 800 }}>DAILY GOAL</div><h3>{k.settings.dailyGoalMin} minutes a day</h3>{k.profile.practiceTime && <div class="muted" style={{ fontWeight: 700 }}>{k.profile.practiceTime}</div>}</div></div>
        <div class="plan-item"><span class="p-icon">🔥</span><div><div class="muted small" style={{ fontWeight: 800 }}>STREAK GOAL</div><h3>{k.settings.streakGoal} days in a row</h3></div></div>
        <div class="plan-item" style={{ background: 'var(--c-primary-soft)' }}><span class="p-icon">🚀</span><div>
          <div class="small" style={{ fontWeight: 800, color: 'var(--c-primary-strong)' }}>BY {plan.date.toUpperCase()} YOU'LL BE ABLE TO…</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontWeight: 700 }}>{plan.cans.map((c) => <li>{c}</li>)}</ul>
        </div></div>
      </div>
      <p class="muted small center" style={{ fontWeight: 700 }}>You can change your goals any time in Settings.</p>
      <div class="step-foot">
        <button class="btn green block big" onClick={() => {
          unlockAudio();
          updateKid((d) => { d.profile.onboarded = true; d.profile.onboardedOn = today.value; });
          navigate(`/lesson/${k.profile.startLesson || 'u0-l1'}`);
        }}>Start my first lesson!</button>
      </div>
    </>
  );
}
