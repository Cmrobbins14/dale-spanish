// ¡Dale! helper worker (Cloudflare Workers, free tier).
//
//   GET  /health      → which features are configured
//   POST /transcribe  → audio clip → Spanish text (Cloudflare Workers AI Whisper)
//   POST /chat        → AI tutor turn: Free Talk or "Ask the coach" (Claude)
//
// Every POST must carry a Firebase ID token for a FAMILY account
// (FAMILY_UIDS), and each account has a daily request cap.

import Anthropic from '@anthropic-ai/sdk';
import SYSTEM_PROMPT from '../system-prompt.md';
import { verifyFirebaseToken } from './firebase-auth.js';

// Output filter for the content rule. content-rule-ok (validator skips this line)
const BANNED = /(?<![\p{L}])(mam[aá]s?|mami|pap[aá]s?|papi|padres?|madres?|moms?|mommy|dads?|daddy|mothers?|fathers?|parents?)(?![\p{L}])/iu;

function cors(env, extra = {}) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    ...extra,
  };
}
const json = (env, data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: cors(env, { 'Content-Type': 'application/json' }) });

/** Count one request; false when today's cap is used up. */
async function underDailyCap(env, uid, kind, limit) {
  if (!env.USAGE) return true; // no KV bound: no cap (not recommended)
  const day = new Date().toISOString().slice(0, 10);
  const key = `${kind}:${uid}:${day}`;
  const n = Number((await env.USAGE.get(key)) || 0);
  if (n >= limit) return false;
  await env.USAGE.put(key, String(n + 1), { expirationTtl: 60 * 60 * 48 });
  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(env) });
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(env, { transcribe: !!env.AI, tutor: !!env.ANTHROPIC_API_KEY });
    }
    if (request.method !== 'POST') return json(env, { error: 'not found' }, 404);

    // ---- who is calling? ----
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    let user;
    try { user = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID); }
    catch { return json(env, { error: 'unauthorized' }, 401); }
    const family = (env.FAMILY_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!family.includes(user.uid)) return json(env, { error: 'not a family account' }, 403);

    if (url.pathname === '/transcribe') return transcribe(request, env, user);
    if (url.pathname === '/chat') return chat(request, env, user);
    return json(env, { error: 'not found' }, 404);
  },
};

// ---------------- speech → text ----------------

async function transcribe(request, env, user) {
  if (!env.AI) return json(env, { error: 'transcribe not configured' }, 501);
  if (!(await underDailyCap(env, user.uid, 'stt', Number(env.DAILY_TRANSCRIBE_LIMIT || 600)))) return json(env, { error: 'daily limit' }, 429);
  const buf = await request.arrayBuffer();
  if (buf.byteLength > 2_000_000) return json(env, { error: 'clip too long' }, 413);
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
    audio: btoa(binary),
    language: 'es',
    vad_filter: true,
  });
  return json(env, { text: result?.text?.trim() || '' });
}

// ---------------- AI tutor ----------------

const FREE_TALK_SCHEMA = {
  type: 'object',
  properties: {
    reply_es: { type: 'string', description: 'Coach Chispa\'s next turn in simple Spanish (max ~15 words), ending with an easy question.' },
    reply_en: { type: 'string', description: 'English translation of reply_es.' },
    try: { type: 'string', description: 'If his last message had an error, the corrected Spanish sentence; otherwise empty.' },
    tasks_done: { type: 'array', items: { type: 'integer' }, description: 'Indexes of mini-tasks he has completed so far.' },
  },
  required: ['reply_es', 'reply_en', 'try', 'tasks_done'],
  additionalProperties: false,
};
const EXPLAIN_SCHEMA = {
  type: 'object',
  properties: { reply: { type: 'string', description: 'A short, kid-friendly answer in English (2–4 sentences), with at most one Spanish example.' } },
  required: ['reply'],
  additionalProperties: false,
};

const clip = (s, n) => String(s || '').slice(0, n);

async function chat(request, env, user) {
  if (!env.ANTHROPIC_API_KEY) return json(env, { error: 'tutor not configured' }, 501);
  if (!(await underDailyCap(env, user.uid, 'chat', Number(env.DAILY_CHAT_LIMIT || 120)))) return json(env, { error: 'daily limit' }, 429);
  const body = await request.json().catch(() => ({}));
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  let messages;
  let schema;
  if (body.mode === 'explain') {
    schema = EXPLAIN_SCHEMA;
    messages = [{
      role: 'user',
      content: `He is looking at the Spanish phrase "${clip(body.phrase, 120)}" (meaning: "${clip(body.meaning, 160)}").\nHis question (in English): ${clip(body.question, 200)}\nAnswer in English for an 11-year-old.`,
    }];
  } else {
    schema = FREE_TALK_SCHEMA;
    const tasks = (body.tasks || []).slice(0, 3).map((t, i) => `${i}. ${clip(t, 120)}`).join('\n');
    const known = (body.known || []).slice(0, 80).map((k) => clip(k, 60)).join(' | ');
    const setup = `Free Talk scenario: ${clip(body.scenario, 200)}\nMini-tasks for him (mark them done in tasks_done when he does them):\n${tasks}\nPhrases he knows: ${known}\nStart the conversation or continue it.`;
    const history = (body.history || []).slice(-16).map((m) => ({
      role: m.role === 'coach' ? 'assistant' : 'user',
      content: m.role === 'coach' ? clip(m.text, 300) : `He said (speech recognition): "${clip(m.text, 300)}"`,
    }));
    messages = [{ role: 'user', content: setup }, ...history];
    // The API needs alternating roles ending with the user; merge if needed.
    if (messages[messages.length - 1].role === 'assistant') messages.push({ role: 'user', content: '(He is waiting for your next turn.)' });
  }

  try {
    const response = await client.beta.messages.create({
      model: env.MODEL || 'claude-opus-5-5',
      max_tokens: 1024,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: env.EFFORT || 'low', format: { type: 'json_schema', schema } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages,
    });
    if (response.stop_reason === 'refusal') return json(env, safeFallback(body.mode));
    const text = response.content.find((b) => b.type === 'text')?.text || '{}';
    const data = JSON.parse(text);
    // Belt and braces: never pass along anything that breaks the content rule.
    if (BANNED.test(JSON.stringify(data))) return json(env, safeFallback(body.mode));
    return json(env, data);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json(env, { error: 'busy' }, 429);
    if (err instanceof Anthropic.APIError) return json(env, { error: `api ${err.status}` }, 502);
    return json(env, { error: 'tutor error' }, 500);
  }
}

function safeFallback(mode) {
  if (mode === 'explain') return { reply: "Let's stick to Spanish! Tap the turtle to hear it slowly, then try saying it." };
  return { reply_es: '¡Muy bien! ¿Te gusta el fútbol?', reply_en: 'Very good! Do you like soccer?', try: '', tasks_done: [] };
}
