// One component per kind of lesson screen. Each calls onItem(...) for every
// finished practice item (for XP + mastery) and onDone() to move on.

import { useEffect, useRef, useState } from 'preact/hooks';
import { kid } from '../data/store.js';
import { speak, stopSpeaking, unlockAudio, RATES } from '../speech/tts.js';
import { scoreOpen } from '../speech/scoring.js';
import { personalize, wordConceptId, CONCEPTS } from '../content/index.js';
import { fillFrame } from './buildSteps.js';
import { SpeakPanel } from './SpeakPanel.jsx';
import { Coach } from '../ui/Coach.jsx';
import { Icon } from '../ui/Icon.jsx';
import { sfx } from '../ui/sfx.js';
import { HelpButton } from './Help.jsx';

const nick = () => kid.value?.profile?.nickname || '';

/** Speak a coach line: English explanation, then the Spanish phrase. */
async function sayLine(line, setTalking) {
  setTalking(true);
  if (line.en) await speak(personalize(line.en, nick()), { lang: 'en' });
  if (line.es) await speak(personalize(line.es, nick()), { lang: 'es' });
  setTalking(false);
}

// ---------------- Coach intro ----------------
export function IntroStep({ step, onItem, onDone, onPass }) {
  const [shown, setShown] = useState(1);
  const [talking, setTalking] = useState(false);
  const [ready, setReady] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    (async () => {
      for (let i = 0; i < step.lines.length; i++) {
        if (cancelled.current) return;
        setShown(i + 1);
        await sayLine(step.lines[i], setTalking);
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!cancelled.current) setReady(true);
    })();
    return () => { cancelled.current = true; stopSpeaking(); };
  }, [step]);

  const p = step.phrase;
  return (
    <div class="step">
      <div class="step-label">{step.scenario}</div>
      <div class="stack tight">
        {step.lines.slice(0, shown).map((l, i) => (
          <div class="coach-row">
            {i === shown - 1 ? <Coach size={84} talking={talking} /> : <div style={{ width: 84 }} />}
            <div class="bubble">
              {l.en && <span>{personalize(l.en, nick())}</span>}
              {l.es && <span class="es" lang="es">{personalize(l.es, nick())}</span>}
            </div>
          </div>
        ))}
      </div>
      {!ready ? (
        <div class="step-foot">
          <button class="btn light block" onClick={() => { cancelled.current = true; stopSpeaking(); setShown(step.lines.length); setTalking(false); setReady(true); }}>Skip intro</button>
        </div>
      ) : p ? (
        <SpeakPanel target={p.es} en={p.en} pic={p.pic} stage="full" onPass={onPass}
          onComplete={(r) => { onItem(p.id, r); onDone(); }} />
      ) : (
        <div class="step-foot"><button class="btn block big" onClick={onDone}>Let's go!</button></div>
      )}
    </div>
  );
}

// ---------------- Drill / review: say a phrase ----------------
const STAGE_LABEL = {
  full: 'Listen and repeat',
  some: 'Fill in the missing words',
  all: 'Say it from memory',
  english: 'How do you say this in Spanish?',
};
export function SayStep({ step, onItem, onDone, onPass }) {
  const label = step.check ? 'Check your progress' : step.review ? `Quick review · ${STAGE_LABEL[step.stage]}` : STAGE_LABEL[step.stage];
  return (
    <div class="step">
      <div class="row between">
        <div class="step-label">{label}</div>
        <HelpButton conceptId={step.concept} phrase={step.es} en={step.en} help={step.help} />
      </div>
      {step.tip && <div class="tip"><span class="t-icon">💡</span><div>{step.tip}</div></div>}
      <SpeakPanel key={`${step.concept}-${step.stage}-${step.es}`} target={step.es} en={step.en} pic={step.pic} stage={step.stage} onPass={onPass}
        onComplete={(r) => { onItem(step.concept, r); onDone(); }} />
    </div>
  );
}

// ---------------- Vocab builder ----------------
export function VocabStep({ step, onItem, onDone, onPass }) {
  const [k, setK] = useState(0);
  const f = step.fillers[k];
  const es = fillFrame(step.frame.es, f.es);
  const en = step.frame.en.replace('{x}', f.en);
  const [before, after] = step.frame.es.split('{x}');
  return (
    <div class="step">
      <div class="row between">
        <div class="step-label">Build it · swap the words</div>
        <HelpButton conceptId={step.frame.id} phrase={step.frame.es.replace('{x}', '___')} en={step.frame.en.replace('{x}', '___')} help={step.frame.help} />
      </div>
      <div class="frame-line" lang="es" aria-label={`${before} ___ ${after}`}>{before}<span class="slot">{f.pic || '___'}</span>{after}</div>
      <div class="filler-strip" aria-label={`Word ${k + 1} of ${step.fillers.length}`}>
        {step.fillers.map((x, i) => <span class={`filler-dot${i < k ? ' done' : i === k ? ' now' : ''}`}>{x.pic}</span>)}
      </div>
      <SpeakPanel key={es} target={es} en={en} pic={f.pic} stage="full" compact onPass={onPass}
        onComplete={(r) => {
          onItem(wordConceptId(f.es), r);
          if (k === 0) onItem(step.frame.id, r, { silent: true });
          if (k + 1 < step.fillers.length) setK(k + 1);
          else onDone();
        }} />
    </div>
  );
}

// ---------------- Listen & understand ----------------
export function ListenStep({ step, onItem, onDone }) {
  const [picked, setPicked] = useState(null);
  const [misses, setMisses] = useState([]);
  const right = picked === step.answer;
  const play = (rate) => { unlockAudio(); speak(step.es, { lang: 'es', rate }); };
  useEffect(() => { const t = setTimeout(() => play(RATES.normal), 300); return () => clearTimeout(t); }, [step]);

  function choose(id) {
    if (right) return;
    if (id === step.answer) {
      setPicked(id);
      sfx('great');
      onItem(step.concept, { outcome: misses.length ? 'notyet' : 'listen', score: null, tries: misses.length }, { spoken: false });
    } else {
      setMisses([...misses, id]);
      sfx('notyet');
      setTimeout(() => play(RATES.slow), 350);
    }
  }
  return (
    <div class="step">
      <div class="step-label">{step.check ? 'Check your progress · listen' : 'Listen and choose'}</div>
      <div class="phrase-card">
        <div class="row" style={{ justifyContent: 'center' }}>
          <button class="mic" style={{ width: 92, height: 92 }} onClick={() => play(RATES.normal)} aria-label="Play again"><Icon name="sound" /></button>
          <button class="icon-btn" onClick={() => play(RATES.slow)} aria-label="Play slowly"><Icon name="turtle" /></button>
        </div>
        {right && <div class="phrase-words" style={{ marginTop: 16 }} lang="es">{step.es}</div>}
      </div>
      <div class={`choices${step.pics ? ' pics' : ''}`}>
        {step.options.map((o) => (
          <button class={`choice${picked === o.id ? ' right' : misses.includes(o.id) ? ' try' : ''}`} onClick={() => choose(o.id)}>{o.label}</button>
        ))}
      </div>
      <div class="step-foot">
        {right && <div class="feedback great"><span class="f-icon">👂</span><div class="f-title">¡Eso es!</div></div>}
        {!right && misses.length > 0 && <div class="feedback notyet"><span class="f-icon">🐢</span><div>Listen once more, nice and slow.</div></div>}
        <button class="btn green block big" disabled={!right} onClick={onDone}>Continue</button>
      </div>
    </div>
  );
}

// ---------------- Q&A ----------------
export function QaStep({ step, onItem, onDone, onPass }) {
  const [talking, setTalking] = useState(false);
  const [showEn, setShowEn] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => { await new Promise((r) => setTimeout(r, 200)); if (!live) return; setTalking(true); await speak(step.q, { lang: 'es' }); if (live) setTalking(false); })();
    return () => { live = false; stopSpeaking(); };
  }, [step]);
  const ask = () => { unlockAudio(); setTalking(true); speak(step.q, { lang: 'es' }).then(() => setTalking(false)); };
  return (
    <div class="step">
      <div class="step-label">{step.open ? 'Answer on your own' : 'Answer the question'}</div>
      <div class="coach-row">
        <Coach size={88} talking={talking} />
        <div class="bubble">
          {step.pic && <span style={{ fontSize: 36, float: 'right', marginLeft: 8 }} aria-hidden="true">{step.pic}</span>}
          <span class="es" lang="es" style={{ marginTop: 0 }}>{step.q}</span>
          {showEn ? <span class="en-small">{step.qEn}</span> : <button class="btn ghost small" style={{ padding: 0, minHeight: 32 }} onClick={() => setShowEn(true)}>Show English</button>}
          <div class="row" style={{ marginTop: 6 }}>
            <button class="icon-btn plain" onClick={ask} aria-label="Hear the question again"><Icon name="sound" /></button>
            <button class="icon-btn plain" onClick={() => speak(step.q, { lang: 'es', rate: RATES.slow })} aria-label="Hear the question slowly"><Icon name="turtle" /></button>
          </div>
        </div>
      </div>
      {step.open ? (
        <SpeakPanel open={{ accept: step.accept, slots: step.slots, model: step.model, hint: step.hint }} onPass={onPass}
          onComplete={(r) => { onItem(step.concept || null, r); onDone(); }} />
      ) : (
        <SpeakPanel target={step.say} stage="full" autoPlay={false} onPass={onPass}
          onComplete={(r) => { onItem(step.concept || null, r); onDone(); }} />
      )}
    </div>
  );
}

// ---------------- Review intro ----------------
export function ReviewIntroStep({ step, onDone }) {
  const [talking, setTalking] = useState(false);
  const line = step.checkpoint
    ? "Let's see how much you remember! No pressure. This just shows how far you've come."
    : step.smart ? "Smart Review! I picked the phrases that need a little more practice." : "Let's review this unit. Weakest phrases first!";
  useEffect(() => { setTalking(true); speak(line, { lang: 'en' }).then(() => setTalking(false)); return () => stopSpeaking(); }, []);
  return (
    <div class="step" style={{ justifyContent: 'center' }}>
      <div class="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <Coach size={150} talking={talking} />
        <h1>{step.title}</h1>
        <p class="muted" style={{ fontWeight: 700, maxWidth: 460 }}>{line}</p>
        <span class="pill">{step.count} items</span>
      </div>
      <div class="step-foot"><button class="btn block big" onClick={() => { unlockAudio(); onDone(); }}>Start</button></div>
    </div>
  );
}

// ---------------- Roleplay ----------------
export function SceneIntroStep({ step, onDone }) {
  const l = step.lesson;
  return (
    <div class="step" style={{ justifyContent: 'center' }}>
      <div class="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div class="avatar lg" style={{ background: l.character.color }}>{l.character.emoji}</div>
        <div class="step-label">Roleplay with {l.character.name}</div>
        <h1>{l.title}</h1>
        <p style={{ fontWeight: 700, maxWidth: 520, fontSize: 'var(--fs-lg)' }}>{l.scenario}</p>
        <p class="muted small" style={{ fontWeight: 700 }}>Answer out loud. Any answer that makes sense is fine!</p>
      </div>
      <div class="step-foot"><button class="btn block big orange" onClick={() => { unlockAudio(); onDone(); }}>Start the scene</button></div>
    </div>
  );
}

function fillVars(text, vars) {
  return personalize(text, nick()).replace(/\{(\w+)\}/g, (_, k) => vars[k] || (k === 'name' ? 'amigo' : ''));
}

export function SceneStep({ step, onItem, onDone, onPass }) {
  const l = step.lesson;
  const [nodeId, setNodeId] = useState(l.start);
  const [log, setLog] = useState([]);
  const [vars, setVars] = useState({});
  const [awaiting, setAwaiting] = useState(false);
  const [talking, setTalking] = useState(false);
  const endRef = useRef(null);
  const node = l.nodes[nodeId];

  useEffect(() => {
    let live = true;
    const line = fillVars(node.say, vars);
    setLog((g) => [...g, { who: 'them', es: line, en: fillVars(node.en || '', vars) }]);
    setAwaiting(false);
    (async () => {
      setTalking(true);
      await speak(line, { lang: 'es' });
      if (!live) return;
      setTalking(false);
      if (node.reply) setAwaiting(true);
      else if (!node.end) setTimeout(() => live && setNodeId(node.next), 600);
    })();
    return () => { live = false; };
  }, [nodeId]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }); }, [log, awaiting]);

  const reply = node.reply;
  const accept = reply ? (reply.branches ? reply.branches.flatMap((b) => b.accept) : reply.accept) : [];

  function answered(r) {
    const said = r.outcome === 'skipped' || r.outcome === 'selfcheck' || !r.heard ? fillVars(reply.model, vars) : r.heard;
    setLog((g) => [...g, { who: 'me', es: said }]);
    const newVars = { ...vars, ...(r.values || {}) };
    setVars(newVars);
    onItem(null, r);
    let next = node.next;
    if (reply.branches && r.heard) {
      let bestB = null;
      for (const b of reply.branches) {
        const s = scoreOpen([r.heard], b.accept, { slots: l.slots });
        if (!bestB || s.score > bestB.score) bestB = { score: s.score, next: b.next };
      }
      if (bestB && bestB.score >= 0.5) next = bestB.next;
    }
    setAwaiting(false);
    setTimeout(() => setNodeId(next), 500);
  }

  return (
    <div class="step">
      <div class="scene-head">
        <div class="avatar" style={{ background: l.character.color }}>{l.character.emoji}</div>
        <div class="grow"><div style={{ fontWeight: 800 }}>{l.character.name}</div><div class="muted small" style={{ fontWeight: 700 }}>{talking ? 'talking…' : awaiting ? 'waiting for you' : ''}</div></div>
      </div>
      <div class="chat" aria-live="polite">
        {log.map((m) => (
          <div class={`msg ${m.who}`}>
            <span class="es" lang="es">{m.es}</span>
            {m.en && <span class="en">{m.en}</span>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {awaiting && reply && (
        <SpeakPanel key={nodeId} open={{ accept, slots: l.slots || {}, model: fillVars(reply.model, vars), hint: reply.hint }} onPass={onPass} onComplete={answered} />
      )}
      {node.end && !talking && (
        <div class="step-foot"><button class="btn green block big" onClick={onDone}>Finish scene 🎬</button></div>
      )}
    </div>
  );
}

export { CONCEPTS };
