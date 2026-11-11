// Turns lesson data (content/units/*.json) into a list of screens ("steps").
// Speak's flow: coach intro → speaking drill with progressive hiding →
// vocab builder → listening → Q&A. Due review items get mixed in.

import { CONCEPTS, lessonById, unitConcepts, UNITS, wordConceptId } from '../content/index.js';
import { tokenize } from '../speech/scoring.js';

const shuffle = (arr, rand = Math.random) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** Fill a frame like "Me gusta {x}." with a filler. */
export function fillFrame(frameEs, fillerEs) {
  return frameEs.replace('{x}', fillerEs);
}

function drillStages(es) {
  return tokenize(es).length >= 3 ? ['full', 'some', 'all', 'english'] : ['full', 'english'];
}

/** A listen-and-choose item for a concept, with distractors from `pool`. */
function listenStep(concept, pool) {
  const usePics = !!concept.pic && pool.filter((c) => c.pic && c.pic !== concept.pic).length >= 2 && Math.random() < 0.5;
  const others = shuffle(pool.filter((c) => c.id !== concept.id && (usePics ? c.pic && c.pic !== concept.pic : c.en !== concept.en))).slice(0, 2);
  if (others.length < 2) return null;
  const options = shuffle([concept, ...others]).map((c) => ({ id: c.id, label: usePics ? c.pic : c.en }));
  const es = concept.kind === 'frame' ? fillFrame(concept.es, concept.fillers[0].es) : concept.es;
  return { kind: 'listen', concept: concept.id, es, answer: concept.id, options, pics: usePics };
}

/** A "say it" review item for any concept, harder when mastery is higher. */
function reviewSayStep(conceptId, mastery = 0) {
  const c = CONCEPTS[conceptId];
  if (!c) return null;
  if (c.kind === 'frame') {
    const f = c.fillers[Math.floor(Math.random() * c.fillers.length)];
    return { kind: 'say', concept: c.id, es: fillFrame(c.es, f.es), en: c.en.replace('{x}', f.en), pic: f.pic, help: c.help, stage: mastery >= 60 ? 'english' : 'full', review: true };
  }
  return { kind: 'say', concept: c.id, es: c.es, en: c.en, pic: c.pic, help: c.help, stage: mastery >= 70 ? 'english' : mastery >= 40 ? 'some' : 'full', review: true };
}

/**
 * @param {object} lesson
 * @param {{concepts:object, due:string[], topics:string[]}} ctx
 */
export function buildLessonSteps(lesson, ctx = {}) {
  const concepts = ctx.concepts || {};
  if (lesson.type === 'roleplay') {
    return [{ kind: 'sceneIntro', lesson }, { kind: 'scene', lesson }];
  }
  if (lesson.type === 'review') return buildUnitReview(lesson, ctx);
  if (lesson.type === 'checkpoint') return buildCheckpoint(lesson, ctx);

  const steps = [];
  const phrases = lesson.phrases || [];
  const pool = Object.values(CONCEPTS).filter((c) => c.unitId === lessonById(lesson.id).unitId && c.kind !== 'word');

  // 1. Coach intro — ends with him saying the first phrase.
  steps.push({ kind: 'intro', lines: lesson.intro, phrase: phrases[0], concept: phrases[0]?.id, scenario: lesson.scenario });

  // 2. Speaking drill with progressive hiding.
  phrases.forEach((p, i) => {
    let stages = drillStages(p.es);
    if (i === 0) stages = stages.filter((s) => s !== 'full'); // already said in the intro
    stages.forEach((stage, k) => {
      steps.push({ kind: 'say', concept: p.id, es: p.es, en: p.en, pic: p.pic, help: p.help, tip: k === 0 ? p.tip : null, stage });
    });
    if (i === 1) {
      const ls = listenStep(CONCEPTS[phrases[0].id], pool);
      if (ls) steps.push(ls);
    }
  });

  // 3. Vocab builder — the frame with swappable fillers (his topics first).
  if (lesson.frame) {
    const topics = ctx.topics || [];
    const fillers = [...lesson.frame.fillers].sort((a, b) => (topics.includes(b.tag) ? 1 : 0) - (topics.includes(a.tag) ? 1 : 0));
    steps.push({ kind: 'vocab', concept: lesson.frame.id, frame: lesson.frame, fillers });
  }

  // 4. Listening variety + a couple of due review items from earlier lessons.
  const lastPhrase = phrases[phrases.length - 1];
  if (lastPhrase && phrases.length > 1) {
    const ls = listenStep(CONCEPTS[lastPhrase.id], pool);
    if (ls) steps.push(ls);
  }
  const own = new Set([...phrases.map((p) => p.id), lesson.frame?.id]);
  (ctx.due || []).filter((id) => !own.has(id) && CONCEPTS[id]?.kind !== 'word').slice(0, 2).forEach((id) => {
    const s = reviewSayStep(id, concepts[id]?.mastery || 0);
    if (s) steps.push(s);
  });

  // 5. Q&A — the coach asks, he answers out loud.
  (lesson.qa || []).forEach((q) => steps.push({ kind: 'qa', ...q, slots: lesson.slots || {} }));
  return steps;
}

/** Unit review: every concept in the unit, weakest first, mixed formats. */
function buildUnitReview(lesson, ctx) {
  const unitId = lessonById(lesson.id).unitId;
  const list = unitConcepts(unitId)
    .map((c) => ({ c, m: ctx.concepts?.[c.id]?.mastery || 0 }))
    .sort((a, b) => a.m - b.m)
    .slice(0, 9);
  const pool = unitConcepts(unitId);
  const steps = [{ kind: 'reviewIntro', title: lesson.title, count: list.length }];
  list.forEach(({ c, m }, i) => {
    if (i % 3 === 2) {
      const ls = listenStep(c, pool);
      if (ls) { steps.push(ls); return; }
    }
    const s = reviewSayStep(c.id, m);
    if (s) steps.push(s);
  });
  // Two open questions from the unit's lessons.
  const unit = UNITS.find((u) => u.id === unitId);
  const qas = shuffle(unit.lessons.flatMap((l) => (l.qa || []).filter((q) => q.open).map((q) => ({ ...q, slots: l.slots || {} })))).slice(0, 2);
  qas.forEach((q) => steps.push({ kind: 'qa', ...q }));
  return steps;
}

/** "Check your progress": English → Spanish production across units so far. */
function buildCheckpoint(lesson, ctx) {
  const unitIndex = lessonById(lesson.id).unitIndex;
  const units = UNITS.slice(0, unitIndex + 1);
  const recent = units.slice(-2);
  const pick = (u, n) => shuffle(unitConcepts(u.id)).slice(0, n);
  const chosen = [...recent.flatMap((u) => pick(u, 4)), ...units.slice(0, -2).flatMap((u) => pick(u, 1))].slice(0, 10);
  const steps = [{ kind: 'reviewIntro', title: lesson.title, count: chosen.length, checkpoint: true }];
  chosen.forEach((c, i) => {
    if (i % 4 === 3) {
      const ls = listenStep(c, unitConcepts(c.unitId));
      if (ls) { steps.push({ ...ls, check: true }); return; }
    }
    const s = reviewSayStep(c.id, 100); // production from English
    if (s) steps.push({ ...s, check: true, review: false });
  });
  return steps;
}

/** Smart Review session: due concepts (weakest first), else weakest overall. */
export function buildSmartReview(conceptIds, concepts) {
  const steps = [{ kind: 'reviewIntro', title: 'Smart Review', count: conceptIds.length, smart: true }];
  conceptIds.forEach((id, i) => {
    const c = CONCEPTS[id];
    if (!c) return;
    const m = concepts?.[id]?.mastery || 0;
    if (c.kind === 'word') {
      const frame = CONCEPTS[c.frameId];
      steps.push({ kind: 'say', concept: id, es: fillFrame(frame.es, c.es), en: frame.en.replace('{x}', c.en), pic: c.pic, help: frame.help, stage: m >= 60 ? 'english' : 'full', review: true });
      return;
    }
    if (i % 3 === 2) {
      const ls = listenStep(c, unitConcepts(c.unitId));
      if (ls) { steps.push(ls); return; }
    }
    const s = reviewSayStep(id, m);
    if (s) steps.push(s);
  });
  return steps;
}

export { wordConceptId };
