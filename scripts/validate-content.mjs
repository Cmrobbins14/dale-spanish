#!/usr/bin/env node
// Checks the course content before every build:
//   • structure (schema below), unique ids, roleplay branches that lead somewhere
//   • answer patterns only use known slots
//   • Spanish punctuation (¿…? ¡…!) and commonly-missed accents
//   • the content rule: no words about mothers, fathers or parents ANYWHERE
//     in content, app text, or the AI tutor's prompt.
// Run: npm run validate

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const unitsDir = join(root, 'src', 'content', 'units');
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

// ---------- schema ----------
const LESSON_TYPES = ['lesson', 'roleplay', 'review', 'checkpoint'];
const BUILTIN_SLOTS = ['name', 'number', 'any'];
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

const unitFiles = readdirSync(unitsDir).filter((f) => f.endsWith('.json')).sort();
const lessonIds = new Set();
const conceptIds = new Map();
const allStrings = []; // [where, text] for the content-rule scan

function collectStrings(obj, where) {
  if (typeof obj === 'string') allStrings.push([where, obj]);
  else if (Array.isArray(obj)) obj.forEach((v, i) => collectStrings(v, `${where}[${i}]`));
  else if (obj && typeof obj === 'object') Object.entries(obj).forEach(([k, v]) => collectStrings(v, `${where}.${k}`));
}

function checkSpanish(where, es) {
  if (!isStr(es)) return err(where, 'missing Spanish text');
  if (/\?/.test(es) && !/¿/.test(es)) err(where, `question without "¿": ${es}`);
  if (/¿/.test(es) && !/\?/.test(es)) err(where, `"¿" without "?": ${es}`);
  if (/!/.test(es) && !/¡/.test(es)) err(where, `exclamation without "¡": ${es}`);
  if (/¡/.test(es) && !/!/.test(es)) err(where, `"¡" without "!": ${es}`);
  // Words that always need an accent in this course.
  const NEED = { futbol: 'fútbol', basquetbol: 'básquetbol', beisbol: 'béisbol', dias: 'días', adios: 'adiós', lapiz: 'lápiz', balon: 'balón',
    musica: 'música', sabado: 'sábado', miercoles: 'miércoles', rapido: 'rápido', aqui: 'aquí', alli: 'allí', tambien: 'también',
    despues: 'después', salon: 'salón', cafeteria: 'cafetería', matematicas: 'matemáticas', educacion: 'educación', fisica: 'física',
    mascara: 'máscara', hamster: 'hámster', anos: 'años', manana: 'mañana', espanol: 'español', pequeno: 'pequeño', frio: 'frío', sueno: 'sueño' };
  for (const w of es.toLowerCase().split(/[^\p{L}]+/u)) {
    if (NEED[w]) err(where, `"${w}" should be "${NEED[w]}"`);
  }
  // Question words inside ¿…? take accents.
  const q = es.match(/¿[^?]*\?/g) || [];
  for (const part of q) {
    if (/¿\s*(como|que|donde|cuanto|cuantos|cuantas|cual|quien|adonde)\b/i.test(part)) err(where, `question word needs an accent: ${part}`);
  }
}

function checkPatterns(where, accept, slots) {
  if (!Array.isArray(accept) || !accept.length) return err(where, 'needs "accept" patterns');
  for (const p of accept) {
    if (!isStr(p)) { err(where, 'empty accept pattern'); continue; }
    for (const m of p.matchAll(/\{(\w+)\}/g)) {
      if (!BUILTIN_SLOTS.includes(m[1]) && !slots?.[m[1]]) err(where, `pattern "${p}" uses unknown slot {${m[1]}}`);
    }
  }
}

function addConcept(id, where) {
  if (!isStr(id)) return err(where, 'missing concept id');
  if (!/^[a-z0-9-]+$/.test(id)) err(where, `concept id "${id}" should be lowercase-with-dashes`);
  if (conceptIds.has(id)) err(where, `concept id "${id}" already used in ${conceptIds.get(id)}`);
  conceptIds.set(id, where);
}

for (const file of unitFiles) {
  let unit;
  try { unit = JSON.parse(readFileSync(join(unitsDir, file), 'utf8')); }
  catch (e) { err(file, `invalid JSON: ${e.message}`); continue; }
  collectStrings(unit, file);
  const U = `${file}`;
  for (const k of ['id', 'title', 'titleEn', 'icon', 'color']) if (!isStr(unit[k])) err(U, `unit needs "${k}"`);
  if (!Array.isArray(unit.lessons) || unit.lessons.length < 3) err(U, 'unit needs at least 3 lessons');
  const types = (unit.lessons || []).map((l) => l.type);
  if (!types.includes('roleplay')) err(U, 'unit should include a roleplay');
  if (!types.includes('review')) err(U, 'unit should include a review lesson');

  for (const l of unit.lessons || []) {
    const L = `${file} › ${l.id || '?'}`;
    if (!isStr(l.id)) { err(L, 'lesson needs an id'); continue; }
    if (lessonIds.has(l.id)) err(L, 'duplicate lesson id');
    lessonIds.add(l.id);
    if (!LESSON_TYPES.includes(l.type)) err(L, `type must be one of ${LESSON_TYPES.join(', ')}`);
    for (const k of ['title', 'icon']) if (!isStr(l[k])) err(L, `needs "${k}"`);

    if (l.type === 'lesson') {
      if (!isStr(l.canDo)) err(L, 'needs a "canDo" statement');
      if (!Array.isArray(l.intro) || !l.intro.length) err(L, 'needs "intro" coach lines');
      (l.intro || []).forEach((line, i) => { if (!isStr(line.en) && !isStr(line.es)) err(`${L} intro[${i}]`, 'needs en or es'); if (line.es) checkSpanish(`${L} intro[${i}]`, line.es); });
      if (!Array.isArray(l.phrases) || l.phrases.length < 2) err(L, 'needs at least 2 phrases');
      for (const p of l.phrases || []) {
        const P = `${L} › ${p.id}`;
        addConcept(p.id, P);
        checkSpanish(P, p.es);
        if (!isStr(p.en)) err(P, 'needs English gloss "en"');
        if (!isStr(p.help)) err(P, 'needs a kid-friendly "help" explanation');
      }
      const f = l.frame;
      if (!f) err(L, 'needs a "frame" for the vocab builder');
      else {
        const F = `${L} › ${f.id}`;
        addConcept(f.id, F);
        if (!f.es?.includes('{x}') || !f.en?.includes('{x}')) err(F, 'frame es/en must contain {x}');
        checkSpanish(F, f.es?.replace('{x}', 'x'));
        if (!isStr(f.help)) err(F, 'frame needs "help"');
        if (!Array.isArray(f.fillers) || f.fillers.length < 3) err(F, 'frame needs at least 3 fillers');
        for (const fl of f.fillers || []) {
          if (!isStr(fl.es) || !isStr(fl.en)) err(F, 'each filler needs es + en');
          else checkSpanish(`${F} filler`, f.es.replace('{x}', fl.es));
        }
      }
      if (!Array.isArray(l.qa) || l.qa.length < 2) err(L, 'needs at least 2 Q&A items');
      (l.qa || []).forEach((q, i) => {
        const Q = `${L} qa[${i}]`;
        checkSpanish(Q, q.q);
        if (!isStr(q.qEn)) err(Q, 'needs "qEn"');
        if (q.open) {
          checkPatterns(Q, q.accept, l.slots);
          if (!isStr(q.model)) err(Q, 'open question needs a "model" answer');
          else checkSpanish(`${Q} model`, q.model);
          if (!isStr(q.hint)) err(Q, 'open question needs a "hint"');
        } else if (!isStr(q.say)) err(Q, 'needs "say" (or "open": true with patterns)');
        else checkSpanish(`${Q} say`, q.say);
      });
    }

    if (l.type === 'roleplay') {
      if (!isStr(l.scenario)) err(L, 'roleplay needs a "scenario"');
      if (!l.character?.name) err(L, 'roleplay needs a character');
      const nodes = l.nodes || {};
      if (!nodes[l.start]) err(L, `start node "${l.start}" missing`);
      const seen = new Set();
      const walk = (id) => {
        if (seen.has(id) || !nodes[id]) return;
        seen.add(id);
        const n = nodes[id];
        const targets = [n.next, ...(n.reply?.branches || []).map((b) => b.next)].filter(Boolean);
        targets.forEach(walk);
      };
      walk(l.start);
      let hasEnd = false;
      for (const [id, n] of Object.entries(nodes)) {
        const N = `${L} › node ${id}`;
        checkSpanish(N, n.say?.replace(/\{\w+\}/g, 'x'));
        if (!isStr(n.en)) err(N, 'needs English "en"');
        if (n.end) hasEnd = true;
        else if (!n.next) err(N, 'needs "next" (or "end": true)');
        if (n.next && !nodes[n.next]) err(N, `next "${n.next}" does not exist`);
        if (!seen.has(id)) warn(N, 'node is never reached');
        if (n.reply) {
          if (n.reply.branches) n.reply.branches.forEach((b, i) => { checkPatterns(`${N} branch ${i}`, b.accept, l.slots); if (!nodes[b.next]) err(N, `branch → "${b.next}" missing`); });
          else checkPatterns(N, n.reply.accept, l.slots);
          if (!isStr(n.reply.model)) err(N, 'reply needs a "model" answer');
          else checkSpanish(`${N} model`, n.reply.model.replace(/\{\w+\}/g, 'x'));
        }
      }
      if (!hasEnd) err(L, 'roleplay needs an end node');
    }
  }
}

// ---------- content rule: no parent vocabulary anywhere ----------
// Accent-insensitive whole-word match. "papa/papas" is banned too (it also
// means potato) to stay well clear; "¡Qué padre!" (cool) is banned as well.
// (Lookarounds instead of \b, because \b doesn't understand accented letters.)
const BANNED = /(?<![\p{L}\p{N}_])(mam[aá]s?|mami|mamita|pap[aá]s?|papi|papito|padres?|madres?|madrastra|padrastro|moms?|mommy|mommies|mum|mums|dads?|daddy|mothers?|fathers?|parents?|parental|stepmom|stepdad)(?![\p{L}\p{N}_])/iu;

function scanText(where, text) {
  const m = String(text).normalize('NFC').match(BANNED);
  if (m) err(where, `content rule: banned word "${m[0]}" in: ${String(text).slice(0, 80)}`);
}
allStrings.forEach(([w, t]) => scanText(w, t));

// App text and the AI tutor prompt (identifiers like parentUid don't match \b…\b).
function walkFiles(dir, exts) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const full = join(dir, n);
    if (statSync(full).isDirectory()) return n === 'node_modules' ? [] : walkFiles(full, exts);
    return exts.some((e) => n.endsWith(e)) ? [full] : [];
  });
}
const appFiles = [
  ...walkFiles(join(root, 'src'), ['.jsx', '.js', '.css']),
  ...walkFiles(join(root, 'worker'), ['.md', '.js']),
];
for (const f of appFiles) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // The worker's output filter must list the words; it is marked
    // "content-rule-ok" on the line above. Nothing else may use them.
    if (/content-rule-ok/.test(lines[i - 1] || '')) return;
    scanText(`${relative(root, f)}:${i + 1}`, line);
  });
}

// ---------- report ----------
const lessonsCount = lessonIds.size;
console.log(`Content: ${unitFiles.length} units, ${lessonsCount} lessons, ${conceptIds.size} phrase/frame concepts.`);
warnings.forEach((w) => console.log(`  warning: ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error(`  ✗ ${e}`));
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log('✓ Content is valid, and the content-rule scan found no parent vocabulary.');
