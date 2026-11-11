// Runs a lesson (or Smart Review): progress bar, one step at a time,
// XP + mastery after every item, active-time tracking, then a summary.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { kid, today } from '../data/store.js';
import { addSeconds, addXp, recordItem, completeLesson } from '../data/actions.js';
import { ActiveTimer } from '../engine/activeTime.js';
import { dueConcepts, weakestConcepts } from '../engine/mastery.js';
import { speakXp, XP } from '../engine/rewards.js';
import { lessonById, CONCEPTS } from '../content/index.js';
import { buildLessonSteps, buildSmartReview } from './buildSteps.js';
import { IntroStep, SayStep, VocabStep, ListenStep, QaStep, ReviewIntroStep, SceneIntroStep, SceneStep } from './steps.jsx';
import { Summary } from './Summary.jsx';
import { ProgressBar } from '../ui/widgets.jsx';
import { Icon } from '../ui/Icon.jsx';
import { stopSpeaking } from '../speech/tts.js';
import { navigate } from '../app/router.js';

const STEP_VIEWS = {
  intro: IntroStep, say: SayStep, vocab: VocabStep, listen: ListenStep, qa: QaStep,
  reviewIntro: ReviewIntroStep, sceneIntro: SceneIntroStep, scene: SceneStep,
};

export function LessonScreen({ lessonId, smart = false }) {
  const k = kid.value;
  const lesson = smart ? null : lessonById(lessonId);
  const kind = smart ? 'smart-review' : lesson?.type === 'lesson' ? 'lesson' : lesson?.type;

  const steps = useMemo(() => {
    const concepts = k.progress.concepts;
    const due = dueConcepts(concepts, today.value, 12);
    if (smart) {
      const ids = due.length >= 4 ? due.slice(0, 10) : [...new Set([...due, ...weakestConcepts(concepts, 10)])].slice(0, 10);
      return buildSmartReview(ids.length ? ids : Object.keys(CONCEPTS).slice(0, 6), concepts);
    }
    return buildLessonSteps(lesson, { concepts, due, topics: k.profile.topics });
  }, [lessonId, smart]);

  const [i, setI] = useState(0);
  const [combo, setCombo] = useState(0);
  const [done, setDone] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const stats = useRef({ xp: 0, scores: [], firstTryAll: true, spoken: 0, concepts: new Set() });
  const timer = useRef(null);
  const comboRef = useRef(0);

  useEffect(() => {
    timer.current = new ActiveTimer((sec) => addSeconds(sec));
    timer.current.start();
    return () => { timer.current?.stop(); stopSpeaking(); };
  }, []);

  if (!lesson && !smart) return <div class="lesson"><p>Lesson not found.</p><button class="btn" onClick={() => navigate('/path')}>Back</button></div>;

  /** A practice item finished. r = { outcome, score, tries } */
  function onItem(conceptId, r, opts = {}) {
    timer.current?.poke();
    if (opts.silent) { if (conceptId) recordItem(conceptId, r.outcome, r.score, { spoken: false }); return; }
    const spoken = opts.spoken !== false;
    recordItem(conceptId, r.outcome, typeof r.score === 'number' ? r.score : null, { spoken });
    if (conceptId) stats.current.concepts.add(conceptId);
    const pass = ['great', 'good', 'selfcheck', 'listen'].includes(r.outcome);
    if (!pass || r.tries > 0) stats.current.firstTryAll = false;
    if (spoken) {
      stats.current.spoken += 1;
      if (typeof r.score === 'number') stats.current.scores.push(r.score);
      else if (r.outcome === 'selfcheck') stats.current.scores.push(1);
    }
    let gained = 0;
    if (r.outcome === 'listen') gained = XP.listen;
    else if (r.outcome === 'skipped' || r.outcome === 'notyet') gained = XP.effort;
    else gained = speakXp(r.outcome === 'selfcheck' ? 'selfcheck' : r.outcome, comboRef.current).total;
    if (!pass) { comboRef.current = 0; setCombo(0); }
    stats.current.xp += gained;
    addXp(gained);
  }

  /** First passing attempt: grow the combo (shown in the header). */
  function onPass() {
    comboRef.current += 1;
    setCombo(comboRef.current);
  }

  function next() {
    timer.current?.poke();
    if (i + 1 < steps.length) { setI(i + 1); return; }
    timer.current?.stop();
    const s = stats.current;
    const accuracy = s.scores.length ? s.scores.reduce((a, b) => a + b, 0) / s.scores.length : null;
    const perfect = s.firstTryAll && s.spoken >= 3;
    const bonus = (kind === 'smart-review' || kind === 'review' ? XP.reviewDone : XP.lessonDone) + (perfect ? XP.perfectLesson : 0);
    addXp(bonus);
    s.xp += bonus;
    completeLesson(lessonId || null, { accuracy, perfect, xp: s.xp, seconds: timer.current?.total || 0, kind });
    setDone({ accuracy, perfect, xp: s.xp, seconds: timer.current?.total || 0, concepts: [...s.concepts] });
  }

  if (done) return <Summary lesson={lesson} smart={smart} result={done} />;

  const step = steps[i];
  const View = STEP_VIEWS[step.kind];
  return (
    <div class="lesson">
      <div class="lesson-top">
        <button class="icon-btn plain" onClick={() => setLeaving(true)} aria-label="Leave lesson"><Icon name="close" /></button>
        <ProgressBar pct={i / steps.length} />
        <div class="combo" aria-live="polite">{combo >= 2 ? `🔥 ×${combo}` : ''}</div>
      </div>
      <View key={i} step={step} onItem={onItem} onDone={next} onPass={onPass} />
      {leaving && (
        <div class="overlay" role="dialog" aria-modal="true">
          <div class="modal">
            <div class="big-icon">⏸️</div>
            <h2>Take a break?</h2>
            <p class="muted" style={{ margin: '10px 0 22px', fontWeight: 700 }}>Everything you've practiced so far is saved, XP included.</p>
            <div class="stack tight">
              <button class="btn block big green" onClick={() => setLeaving(false)}>Keep practicing</button>
              <button class="btn light block" onClick={() => { timer.current?.stop(); navigate('/'); }}>Leave for now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
