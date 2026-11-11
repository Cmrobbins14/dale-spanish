// The unit path. Every lesson is open — nothing is ever locked —
// with the recommended next one highlighted.

import { kid } from '../data/store.js';
import { courseOrder, lessonById } from '../content/index.js';
import { nextLessonFor } from './Home.jsx';
import { Icon } from '../ui/Icon.jsx';
import { unlockAudio } from '../speech/tts.js';
import { navigate } from '../app/router.js';

export function Path() {
  const k = kid.value;
  const next = nextLessonFor(k);
  const units = courseOrder(k.profile.topics);
  return (
    <div>
      <div class="screen-head"><div class="screen-title"><h1>Learn</h1><p class="muted" style={{ fontWeight: 700 }}>Your course map</p></div></div>
      {units.map((u, n) => {
        const done = u.lessons.filter((l) => k.progress.lessons[l.id]?.done).length;
        return (
          <section class="unit">
            <div class="unit-banner" style={{ background: u.color }}>
              <span class="u-icon" aria-hidden="true">{u.icon}</span>
              <div class="grow">
                <div style={{ fontWeight: 800, opacity: 0.9 }}>Unit {n}{n === 0 ? ' · Warm-up' : ''}</div>
                <h2>{u.title}</h2>
                <div style={{ fontWeight: 700, opacity: 0.9 }}>{u.titleEn}</div>
              </div>
              <div class="pill" style={{ background: 'rgba(255,255,255,.25)', color: '#fff' }}>{done}/{u.lessons.length}</div>
            </div>
            <div class="lessons">
              {u.lessons.map((l) => {
                const st = k.progress.lessons[l.id];
                const isNext = next?.id === l.id;
                return (
                  <button class={`lesson-tile${st?.done ? ' done' : ''}${isNext ? ' next' : ''}`} onClick={() => { unlockAudio(); navigate(`/lesson/${l.id}`); }}>
                    <span class="l-icon" aria-hidden="true">{l.icon}</span>
                    <div class="grow">
                      <div class="l-title">{l.title}</div>
                      <div class="muted small" style={{ fontWeight: 700 }}>{isNext ? '▶ Up next' : l.subtitle}</div>
                    </div>
                    {st?.done && <span class="check-badge" aria-label="done"><Icon name="check" size={28} /></span>}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export { lessonById };
