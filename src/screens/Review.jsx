// Smart Review library: every concept he has met, with a mastery score.
// Review sessions put the weakest (and due) ones first.

import { useState } from 'preact/hooks';
import { kid, today } from '../data/store.js';
import { CONCEPTS, personalize } from '../content/index.js';
import { dueConcepts } from '../engine/mastery.js';
import { daysBetween } from '../engine/dates.js';
import { speak, unlockAudio } from '../speech/tts.js';
import { Icon } from '../ui/Icon.jsx';
import { Coach } from '../ui/Coach.jsx';
import { navigate } from '../app/router.js';

function masteryColor(m) {
  if (m >= 80) return 'var(--c-field)';
  if (m >= 50) return 'var(--c-teal)';
  if (m >= 25) return 'var(--c-sun)';
  return 'var(--c-accent)';
}

export function Review() {
  const k = kid.value;
  const t = today.value;
  const [filter, setFilter] = useState('all');
  const due = dueConcepts(k.progress.concepts, t, 100);
  const nick = k.profile.nickname;
  const items = Object.entries(k.progress.concepts)
    .filter(([id]) => CONCEPTS[id] && CONCEPTS[id].kind !== 'word')
    .map(([id, c]) => ({ id, c, info: CONCEPTS[id], isDue: c.due && daysBetween(c.due, t) >= 0 }))
    .filter((x) => filter === 'all' || (filter === 'due' ? x.isDue : x.c.mastery < 50))
    .sort((a, b) => a.c.mastery - b.c.mastery);

  return (
    <div class="stack">
      <div class="screen-head"><div class="screen-title"><h1>Smart Review</h1><p class="muted" style={{ fontWeight: 700 }}>Your phrase library</p></div></div>
      <div class="card row" style={{ gap: 20 }}>
        <Coach size={88} />
        <div class="grow">
          <h3>{due.length ? `${due.length} ${due.length === 1 ? 'phrase is' : 'phrases are'} ready` : 'All caught up!'}</h3>
          <p class="muted" style={{ fontWeight: 700 }}>I'll start with the ones that need the most practice.</p>
        </div>
        <button class="btn green big" onClick={() => { unlockAudio(); navigate('/smart-review'); }} disabled={!items.length && !Object.keys(k.progress.concepts).length}>Start</button>
      </div>
      <div class="seg" role="tablist" style={{ maxWidth: 420 }}>
        {[['all', 'All'], ['due', 'Ready'], ['weak', 'Needs practice']].map(([id, label]) => (
          <button class={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      {!items.length ? (
        <p class="muted center" style={{ fontWeight: 700, padding: 30 }}>{Object.keys(k.progress.concepts).length ? 'Nothing here right now. 🎉' : 'Finish a lesson and your phrases will show up here.'}</p>
      ) : (
        <div class="card" style={{ padding: '6px 18px' }}>
          {items.map(({ id, c, info, isDue }) => (
            <div class="cando">
              <button class="icon-btn plain" onClick={() => { unlockAudio(); speak(personalize(info.es, nick).replace('{x}', '…'), { lang: 'es' }); }} aria-label="Hear it"><Icon name="sound" /></button>
              <div class="grow">
                <div class="es" lang="es">{personalize(info.es, nick).replace('{x}', '___')}</div>
                <div class="muted small" style={{ fontWeight: 700 }}>{personalize(info.en, nick).replace('{x}', '___')}{isDue ? ' · ready to review' : ''}</div>
              </div>
              <div style={{ width: 110 }} class="bar-row" aria-label={`${c.mastery}% mastered`}>
                <div class="track"><div style={{ width: `${c.mastery}%`, background: masteryColor(c.mastery) }} /></div>
                <span class="small" style={{ fontWeight: 800, width: 36, textAlign: 'right' }}>{c.mastery}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
