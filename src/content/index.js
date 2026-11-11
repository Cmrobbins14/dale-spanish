// Course content loader. The lessons themselves live in ./units/*.json
// (plain data — see README "How to add a lesson"). This file indexes them:
// units, lessons, and "concepts" (every phrase, frame and key word).

import u0 from './units/u0.json';
import u1 from './units/u1.json';
import u2 from './units/u2.json';
import u3 from './units/u3.json';
import u4 from './units/u4.json';
import u5 from './units/u5.json';
import u6 from './units/u6.json';
import u7 from './units/u7.json';
import { stripAccents } from '../speech/scoring.js';

export const UNITS = [u0, u1, u2, u3, u4, u5, u6, u7];

export const slug = (s) => stripAccents(String(s).toLowerCase()).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const wordConceptId = (es) => `w-${slug(es)}`;

const lessonMap = {};
const conceptMap = {};
UNITS.forEach((unit, unitIndex) => {
  unit.lessons.forEach((lesson, lessonIndex) => {
    lessonMap[lesson.id] = { ...lesson, unitId: unit.id, unitIndex, lessonIndex };
    const where = { unitId: unit.id, lessonId: lesson.id };
    (lesson.phrases || []).forEach((p) => {
      if (!conceptMap[p.id]) conceptMap[p.id] = { id: p.id, kind: 'phrase', es: p.es, en: p.en, help: p.help, pic: p.pic, ...where };
    });
    const f = lesson.frame;
    if (f) {
      if (!conceptMap[f.id]) conceptMap[f.id] = { id: f.id, kind: 'frame', es: f.es, en: f.en, help: f.help, fillers: f.fillers, ...where };
      f.fillers.forEach((fl) => {
        const id = wordConceptId(fl.es);
        if (!conceptMap[id]) conceptMap[id] = { id, kind: 'word', es: fl.es, en: fl.en, pic: fl.pic, frameId: f.id, ...where };
      });
    }
  });
});

export const CONCEPTS = conceptMap;
export const TOTAL_CONCEPTS = Object.keys(conceptMap).length;

export const lessonById = (id) => lessonMap[id];
export const unitById = (id) => UNITS.find((u) => u.id === id);
export const conceptById = (id) => conceptMap[id];

/** Concepts taught in a unit (phrases and frames — the things you can say). */
export function unitConcepts(unitId) {
  return Object.values(conceptMap).filter((c) => c.unitId === unitId && c.kind !== 'word');
}

/**
 * Unit order for this learner. The first three units build the basics and
 * stay put; later units are ordered so his favorite topics come sooner.
 */
export function courseOrder(topics = []) {
  const fixed = UNITS.slice(0, 3);
  const rest = UNITS.slice(3);
  const liked = (u) => (u.tags || []).some((t) => topics.includes(t));
  return [...fixed, ...rest.filter(liked), ...rest.filter((u) => !liked(u))];
}

/** All lessons in the learner's order. */
export function orderedLessons(topics) {
  return courseOrder(topics).flatMap((u) => u.lessons.map((l) => lessonMap[l.id]));
}

/** Replace {me} with the learner's nickname. */
export function personalize(text, nickname) {
  return String(text || '').replace(/\{me\}/g, nickname || 'Leo');
}

/** Rough minutes for one lesson, for "your plan" dates. */
export const MINUTES_PER_LESSON = 5;
