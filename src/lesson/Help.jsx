// The "?" help button: a kid-friendly explanation written into the content,
// plus (optionally) "Ask the coach" when the AI tutor is set up.

import { useState } from 'preact/hooks';
import { kid } from '../data/store.js';
import { CONCEPTS, personalize } from '../content/index.js';
import { speak, unlockAudio, RATES } from '../speech/tts.js';
import { tutorAvailable } from '../services/worker.js';
import { Icon } from '../ui/Icon.jsx';
import { AskCoach } from '../tutor/AskCoach.jsx';

export function HelpButton({ conceptId, phrase, en, help }) {
  const [open, setOpen] = useState(false);
  const c = CONCEPTS[conceptId];
  const text = help || c?.help;
  if (!text) return null;
  const nickname = kid.value?.profile?.nickname || '';
  const shown = personalize(phrase || c?.es, nickname);
  const tutorOn = tutorAvailable() && kid.value?.settings?.tutor !== false;
  return (
    <>
      <button class="icon-btn" onClick={() => setOpen(true)} aria-label="What does this mean?"><Icon name="help" /></button>
      {open && (
        <div class="overlay" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div class="modal left">
            <div class="row between">
              <div class="step-label">What does it mean?</div>
              <button class="icon-btn plain" onClick={() => setOpen(false)} aria-label="Close"><Icon name="close" /></button>
            </div>
            <div class="row" style={{ margin: '8px 0' }}>
              <h2 class="grow" lang="es">{shown}</h2>
              <button class="icon-btn" onClick={() => { unlockAudio(); speak(shown, { lang: 'es', rate: RATES.slow }); }} aria-label="Hear it slowly"><Icon name="turtle" /></button>
            </div>
            {en && <p style={{ fontWeight: 800, color: 'var(--c-ink-2)' }}>{personalize(en, nickname)}</p>}
            <p style={{ marginTop: 14, fontSize: 'var(--fs-lg)' }}>{text}</p>
            {tutorOn && <AskCoach phrase={shown} meaning={en} />}
            <button class="btn block" style={{ marginTop: 20 }} onClick={() => setOpen(false)}>Got it!</button>
          </div>
        </div>
      )}
    </>
  );
}
