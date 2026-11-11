// The speaking panel: shows the phrase (with hidden words for the drill),
// plays it at normal or turtle speed, listens, lights up words, scores
// generously, and offers playback of his own voice next to the coach's.
//
// Never says "wrong". After two "not yet" tries he can always keep going.

import { useEffect, useRef, useState } from 'preact/hooks';
import { kid } from '../data/store.js';
import { speak, stopSpeaking, unlockAudio, RATES } from '../speech/tts.js';
import { chooseEngine, listenOnce, whyNoListening, listenHealth } from '../speech/listen.js';
import { playClip } from '../speech/recorder.js';
import { scoreAttempt, scoreOpen } from '../speech/scoring.js';
import { MAX_TRIES_BEFORE_SKIP } from '../config/scoring-config.js';
import { personalize } from '../content/index.js';
import { Icon } from '../ui/Icon.jsx';
import { sfx, unlockSfx } from '../ui/sfx.js';

const PRAISE = {
  great: ['¡Excelente!', '¡Perfecto!', '¡Increíble!', '¡Muy bien!', '¡Golazo!'],
  good: ['¡Muy bien!', '¡Bien hecho!', '¡Eso es!', '¡Bien!'],
  notyet: ['Almost!', 'So close!', 'Nice try!', 'Getting there!'],
};
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

function hiddenSet(words, stage) {
  if (stage === 'all' || stage === 'english') return new Set(words.map((_, i) => i));
  if (stage === 'some') {
    // Hide about half: the longer, meaning-carrying words, alternating.
    const idx = words.map((w, i) => ({ i, len: w.replace(/[^\p{L}]/gu, '').length })).filter((x) => x.len >= 3);
    return new Set(idx.filter((_, k) => k % 2 === 0).map((x) => x.i));
  }
  return new Set();
}

export function SpeakPanel({
  target, // Spanish text to say (may contain {me}); null for open answers
  en, pic, stage = 'full',
  open = null, // { accept: [...], slots, model, hint }
  autoPlay = true,
  onComplete, // ({ outcome, score, tries, values })
  onPass, // called on first passing attempt (for combo/XP display)
  compact = false,
  dontKnow = false, // placement check: offer "I don't know this one yet"
}) {
  const settings = kid.value?.settings || {};
  const nickname = kid.value?.profile?.nickname || '';
  const display = target ? personalize(target, nickname) : null;
  const words = display ? display.split(/\s+/).filter(Boolean) : [];
  const [engine, setEngine] = useState(() => chooseEngine(settings.listening));
  const [phase, setPhase] = useState('idle'); // idle | listening | result
  const [result, setResult] = useState(null);
  const [tries, setTries] = useState(0); // "not yet" count
  const [best, setBest] = useState(null);
  const [lit, setLit] = useState(new Set());
  const [heard, setHeard] = useState('');
  const [level, setLevel] = useState(0);
  const [clip, setClip] = useState(null);
  const [note, setNote] = useState('');
  const [helped, setHelped] = useState(false); // tapped "Help me" or got a "not yet": show + say it
  const [gaveUp, setGaveUp] = useState(false); // placement: "I don't know this one yet"
  const [modelShown, setModelShown] = useState(false);
  const abortRef = useRef(null);
  const replayRef = useRef(null);
  const passed = result && result.outcome !== 'notyet';
  const revealed = passed || helped || gaveUp || tries >= MAX_TRIES_BEFORE_SKIP || stage === 'full';
  const hidden = revealed ? new Set() : hiddenSet(words, stage);
  const showSpanish = !(stage === 'english' && !revealed);
  const sayItText = display || personalize(open?.model || '', nickname);

  /** Reveal the answer and say it slowly, so he always hears what to say. */
  function helpMe() {
    unlockAudio();
    setHelped(true);
    if (open) setModelShown(true);
    speak(sayItText, { lang: 'es', rate: RATES.slow });
  }

  // Play the phrase when the step appears (not for the English-prompt stage).
  useEffect(() => {
    if (autoPlay && display && stage !== 'english' && stage !== 'all') {
      const t = setTimeout(() => speak(display, { lang: 'es' }), 250);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [display, stage]);
  useEffect(() => () => { abortRef.current?.abort(); clearTimeout(replayRef.current); stopSpeaking(); }, []);

  const play = (rate) => { unlockAudio(); speak(display || personalize(open?.model, nickname), { lang: 'es', rate }); };
  const playWord = (w) => { unlockAudio(); speak(w.replace(/[¿?¡!.,]/g, ''), { lang: 'es', rate: RATES.slow }); };

  function evaluate(alternatives) {
    const lenient = settings.leniency || 'standard';
    let r;
    if (open) {
      r = scoreOpen(alternatives, open.accept.map((a) => personalize(a, nickname)), { leniency: lenient, slots: open.slots });
      r.words = [];
    } else if (target.includes('{me}')) {
      // "Me llamo {me}": any name counts, his nickname included.
      const a = scoreAttempt(display, alternatives, { leniency: lenient });
      const b = scoreOpen(alternatives, [target.replace('{me}', '{name}')], { leniency: lenient });
      r = b.score > a.score ? { ...a, score: b.score, outcome: b.outcome, words: a.words.map((w) => ({ ...w, matched: true })) } : a;
    } else {
      r = scoreAttempt(display, alternatives, { leniency: lenient });
    }
    setResult(r);
    setLit(new Set(r.words.map((w, i) => (w.matched ? i : -1)).filter((i) => i >= 0)));
    if (!best || r.score > best.score) setBest(r);
    sfx(r.outcome === 'notyet' ? 'notyet' : r.outcome);
    if (r.outcome === 'notyet') {
      setTries((t) => t + 1);
      // Model it for him right away: show the answer and say it slowly.
      replayRef.current = setTimeout(helpMe, 900);
    } else if (!result || result.outcome === 'notyet') {
      onPass?.(r.outcome, tries === 0);
    }
    setPhase('result');
  }

  async function onMic() {
    unlockAudio(); unlockSfx();
    if (phase === 'listening') { abortRef.current?.abort(); return; } // "I'm done"
    clearTimeout(replayRef.current);
    stopSpeaking();
    setNote(''); setHeard(''); setLit(new Set()); setResult(null);
    setPhase('listening');
    sfx('listen');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await listenOnce(engine, {
        signal: ctrl.signal,
        maxMs: 9000,
        onLevel: setLevel,
        onInterim: (text) => {
          setHeard(text);
          if (display && !open) {
            const live = scoreAttempt(display, [text], { leniency: settings.leniency });
            setLit(new Set(live.words.map((w, i) => (w.matched ? i : -1)).filter((i) => i >= 0)));
          }
        },
      });
      setLevel(0);
      if (res.audioUrl) setClip(res.audioUrl);
      if (!res.alternatives.length) {
        setPhase('idle');
        if (res.error === 'network') setNote("I couldn't reach the listening helper. Check the internet and try again.");
        else if (listenHealth.webspeechBroken) { setEngine('selfcheck'); setNote('stalled'); }
        else setNote("I didn't catch that. Tap the mic and say it nice and loud!");
        return;
      }
      setHeard(res.alternatives[0]);
      evaluate(res.alternatives);
    } catch (e) {
      setLevel(0);
      setPhase('idle');
      setEngine('selfcheck');
      setNote(e?.code === 'denied' ? 'denied' : 'unsupported');
    }
  }

  function finish(outcomeOverride) {
    stopSpeaking();
    const r = best || result;
    const outcome = outcomeOverride || r?.outcome || 'skipped';
    onComplete?.({ outcome, score: r ? r.score : null, tries, values: r?.values || {}, heard: r?.heard || '' });
  }

  const wordClass = (i) => {
    const classes = ['word'];
    if (hidden.has(i)) classes.push('hidden');
    if (lit.has(i)) classes.push('lit');
    if (phase === 'result' && result?.words?.[i]) {
      const w = result.words[i];
      if (w.polish) classes.push('polish');
      else if (!w.matched && result.outcome !== 'notyet') classes.push('missed');
    }
    return classes.join(' ');
  };
  const reason = whyNoListening() || note;

  return (
    <div class="stack" style={{ flex: 1 }} data-speak={display || personalize(open?.model || '', nickname)}>
      {display && (
        <div class="phrase-card" data-target={display}>
          {pic && !compact && <div class="phrase-pic" aria-hidden="true">{pic}</div>}
          {!showSpanish ? (
            <div class="phrase-en prompt">{en}</div>
          ) : (
            <>
              <div class="phrase-words" lang="es">
                {words.map((w, i) => (
                  <button class={wordClass(i)} onClick={() => playWord(w)} aria-label={hidden.has(i) ? 'hidden word, tap to hear' : `hear ${w}`}>
                    {w}
                  </button>
                ))}
              </div>
              {en && <div class="phrase-en">{en}</div>}
            </>
          )}
          <div class="phrase-tools">
            {(showSpanish || revealed) && (
              <>
                <button class="icon-btn" onClick={() => play(RATES.normal)} aria-label="Play"><Icon name="sound" /></button>
                <button class="icon-btn" onClick={() => play(RATES.slow)} aria-label="Play slowly"><Icon name="turtle" /></button>
              </>
            )}
          </div>
        </div>
      )}

      {open && (modelShown || passed) && open.model && (
        <div class="tip" style={{ background: 'var(--c-primary-soft)', color: 'var(--c-primary-strong)' }}>
          <span class="t-icon">💬</span>
          <div class="grow">
            <div>{passed ? 'Another way to say it:' : 'You could say:'}</div>
            <div class="es" style={{ fontSize: 'var(--fs-xl)' }} lang="es">{personalize(open.model, nickname)}</div>
          </div>
          <button class="icon-btn" onClick={() => play(RATES.normal)} aria-label="Play example"><Icon name="sound" /></button>
          <button class="icon-btn" onClick={() => play(RATES.slow)} aria-label="Play example slowly"><Icon name="turtle" /></button>
        </div>
      )}
      {open && !modelShown && !passed && open.hint && (
        <div class="tip"><span class="t-icon">🗣️</span><div>Answer on your own! <span class="muted">Try:</span> <span class="es" lang="es">{personalize(open.hint, nickname)}</span></div></div>
      )}

      <div class="step-foot">
        {phase === 'result' && result && (
          <div class={`feedback ${result.outcome}`} role="status">
            <span class="f-icon">{result.outcome === 'great' ? '🌟' : result.outcome === 'good' ? '👍' : '💪'}</span>
            <div class="grow">
              <div class="f-title">{pickOne(PRAISE[result.outcome])}</div>
              <div class="small">
                {result.outcome === 'great' && (result.values?.name ? `¡Mucho gusto, ${result.values.name}!` : 'You nailed it.')}
                {result.outcome === 'good' && (result.words?.some((w) => w.polish) ? 'That counts! Polish the orange word next time.' : 'That counts!')}
                {result.outcome === 'notyet' && (tries >= MAX_TRIES_BEFORE_SKIP ? "Great effort! Let's keep going." : 'Listen to how Chispa says it, then try once more.')}
              </div>
            </div>
          </div>
        )}
        {heard && phase !== 'idle' && <div class="heard" aria-live="polite">“{heard}”</div>}
        {note && (
          <div class="feedback info">
            <span class="f-icon">🎧</span>
            <div class="small grow">{note.length > 20 ? note : <GrownUpNote reason={reason} />}</div>
          </div>
        )}

        {clip && phase === 'result' && (
          <div class="compare">
            <button class="btn light small" onClick={() => play(RATES.normal)}><Icon name="sound" /> Coach</button>
            <button class="btn light small" onClick={() => playClip(clip)}><Icon name="me" /> Me</button>
          </div>
        )}

        {gaveUp ? (
          <div class="stack tight">
            <div class="feedback info">
              <span class="f-icon">👂</span>
              <div class="grow"><div class="f-title">No problem!</div><div class="small">That's how you say it. You'll learn it soon.</div></div>
            </div>
            <button class="btn green block big" onClick={() => finish('skipped')} autofocus>Next</button>
          </div>
        ) : engine === 'selfcheck' ? (
          <div class="stack tight">
            <p class="center muted small" style={{ fontWeight: 700 }}>Say it out loud, then tap:</p>
            <button class="btn green block big" onClick={() => { sfx('good'); finish('selfcheck'); }}>I said it! 🗣️</button>
          </div>
        ) : passed ? (
          <button class="btn green block big" onClick={() => finish()} autofocus>Continue</button>
        ) : (
          <div class="mic-wrap">
            <button class={`mic${phase === 'listening' ? ' listening' : ''}`} onClick={onMic}
              aria-label={phase === 'listening' ? 'Listening. Tap when done' : 'Tap to speak'} data-testid="mic">
              {phase === 'listening' && <span class="ripple" style={{ '--lvl': 1 + level * 0.35 }} />}
              <Icon name="mic" />
            </button>
            <div class="mic-hint">{phase === 'listening' ? 'Listening… tap when done' : tries ? 'Tap and try again' : 'Tap the mic and speak'}</div>
            {tries >= MAX_TRIES_BEFORE_SKIP && phase !== 'listening' && (
              <button class="btn light block" onClick={() => finish('skipped')}>Keep going <Icon name="arrow" /></button>
            )}
            {phase !== 'listening' && tries < MAX_TRIES_BEFORE_SKIP && (dontKnow ? (
              <button class="btn light block" onClick={() => { setGaveUp(true); helpMe(); }}>I don't know this one yet</button>
            ) : !(revealed && (!open || modelShown)) && (
              <button class="btn ghost" onClick={helpMe}><Icon name="lightbulb" /> Help me</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A short, friendly setup note for a grown-up when listening isn't available. */
export function GrownUpNote({ reason }) {
  if (reason === 'denied') return <span><b>Grown-up tip:</b> the microphone is blocked. On the iPad: Settings → Apps → Safari → Microphone → Allow. Self-check mode works in the meantime.</span>;
  if (reason === 'homescreen') return <span><b>Grown-up tip:</b> Apple doesn't allow speech recognition in Home Screen apps. Open the app in Safari for scoring, or set up Cloud listening (see README). Self-check mode works in the meantime.</span>;
  if (reason === 'stalled') return <span><b>Grown-up tip:</b> the iPad's speech recognizer stopped responding (a known iPadOS bug). Closing and reopening Safari fixes it. Self-check mode works in the meantime.</span>;
  return <span><b>Grown-up tip:</b> speech scoring needs Dictation turned on (Settings → General → Keyboard → Enable Dictation) and Siri enabled. Self-check mode works in the meantime.</span>;
}
