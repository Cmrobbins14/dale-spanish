// "Ask the coach": a short English Q&A about the current phrase,
// answered by the optional AI tutor (Cloudflare Worker → Claude).

import { useState } from 'preact/hooks';
import { tutorChat } from '../services/worker.js';

const QUICK = ['Why is it said like that?', 'Can I use it with friends?', 'Give me another example'];

export function AskCoach({ phrase, meaning }) {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);

  async function ask(question) {
    if (!question.trim()) return;
    setBusy(true);
    setAnswer('');
    try {
      const r = await tutorChat({ mode: 'explain', phrase, meaning, question: question.slice(0, 200) });
      setAnswer(r.reply || 'Hmm, I\'m not sure. Try asking another way!');
    } catch (e) {
      setAnswer(e.message === 'daily-limit' ? "Coach is resting for today. Ask again tomorrow!" : "I couldn't reach the coach right now. Try again later.");
    }
    setBusy(false);
  }

  return (
    <div class="card flat" style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>💬 Ask Coach Chispa</div>
      <div class="chips" style={{ marginBottom: 8 }}>
        {QUICK.map((x) => <button class="chip" disabled={busy} onClick={() => { setQ(x); ask(x); }}>{x}</button>)}
      </div>
      <form class="row" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input class="input grow" value={q} maxLength={200} placeholder="Type a question…" onInput={(e) => setQ(e.currentTarget.value)} />
        <button class="btn small" disabled={busy || !q.trim()}>Ask</button>
      </form>
      {busy && <p class="muted" style={{ marginTop: 10 }}>Coach is thinking…</p>}
      {answer && <p style={{ marginTop: 10, fontWeight: 700 }}>{answer}</p>}
    </div>
  );
}
