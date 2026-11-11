// Shared helpers for the iPad (WebKit) end-to-end tests.

/**
 * Replaces the browser's speech recognizer with a fake that "hears" the
 * phrase on screen. Modes: good | borderline | poor | unsupported.
 * Also makes text-to-speech instant so tests run fast.
 */
export async function mockSpeech(page, mode = 'good') {
  await page.addInitScript((m) => {
    // Local-only mode for tests (your real Firebase project is never touched).
    try { localStorage.setItem('dale.forceLocal', '1'); } catch { /* ignore */ }
    window.__TEST_FAST_TTS = true;
    window.__speechMode = m;
    if (m === 'unsupported') {
      try { delete window.SpeechRecognition; } catch { /* ignore */ }
      try { delete window.webkitSpeechRecognition; } catch { /* ignore */ }
      window.SpeechRecognition = undefined;
      window.webkitSpeechRecognition = undefined;
      return;
    }
    class FakeRecognition {
      start() {
        setTimeout(() => {
          this.onstart?.(); this.onaudiostart?.(); this.onspeechstart?.();
          const panels = [...document.querySelectorAll('[data-speak]')];
          const target = panels[panels.length - 1]?.dataset.speak || '';
          let text = target;
          const mode = window.__speechMode;
          if (mode === 'borderline') {
            const w = target.split(' ');
            text = w.length > 2 ? w.slice(0, -1).join(' ') : w.map((x) => x.slice(0, -1)).join(' ');
          }
          if (mode === 'poor') text = 'pizza con queso';
          const interim = [{ transcript: text.split(' ')[0] }]; interim.isFinal = false;
          this.onresult?.({ results: [interim] });
          setTimeout(() => {
            const fin = [{ transcript: text }, { transcript: text.toLowerCase() }]; fin.isFinal = true;
            this.onresult?.({ results: [fin] });
            setTimeout(() => this.onend?.(), 40);
          }, 120);
        }, 150);
      }
      stop() {}
      abort() {}
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = FakeRecognition;
  }, mode);
}

/** A learner who already finished onboarding (local-only mode). */
export async function seedLearner(page, extra = {}) {
  await page.addInitScript((x) => {
    if (localStorage.getItem('dale.v1')) return;
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('dale.v1', JSON.stringify({
      active: 'local-test',
      kids: { 'local-test': {
        profile: { nickname: 'Leo', onboarded: true, startLesson: 'u0-l1', topics: ['sports', 'food'], practiceTime: 'After school', avatar: { icon: '🐆', color: '#5B4BFF' } },
        settings: { dailyGoalMin: 10, streakGoal: 14 },
        progress: { startedOn: today, ...(x.progress || {}) },
      } },
    }));
  }, extra);
}

const visible = async (loc) => loc.first().isVisible().catch(() => false);

/** Close celebration pop-ups (goal met, trophies…). */
export async function dismissCelebrations(page, onFirst) {
  for (let i = 0; i < 8; i++) {
    const ok = page.getByRole('button', { name: '¡Genial!' });
    if (!(await visible(ok))) return;
    if (i === 0 && onFirst) await onFirst();
    await ok.first().click();
    await page.waitForTimeout(200);
  }
}

/** Plays whatever lesson is on screen until the summary appears. */
export async function playLesson(page, { maxSteps = 140 } = {}) {
  for (let n = 0; n < maxSteps; n++) {
    await dismissCelebrations(page);
    if (await visible(page.getByRole('button', { name: /^Done$/ }))) return true;
    const tryButtons = [
      page.getByRole('button', { name: 'Skip intro' }),
      page.getByRole('button', { name: /^Start( the scene)?$/ }),
      page.getByRole('button', { name: /Finish scene/ }),
      page.getByRole('button', { name: /I said it/ }),
      page.getByRole('button', { name: /Keep going/ }),
    ];
    let clicked = false;
    const cont = page.getByRole('button', { name: 'Continue' });
    if (await visible(cont) && await cont.first().isEnabled()) { await cont.first().click(); clicked = true; }
    for (const b of tryButtons) {
      if (clicked) break;
      if (await visible(b)) { await b.first().click(); clicked = true; }
    }
    if (!clicked && await visible(page.getByTestId('mic'))) {
      await page.getByTestId('mic').click();
      await page.waitForTimeout(700);
      clicked = true;
    }
    if (!clicked && (await page.locator('.choice').count()) > 0) {
      const choices = page.locator('.choice');
      const k = await choices.count();
      for (let i = 0; i < k; i++) {
        if (await cont.first().isEnabled().catch(() => false)) break;
        if (await choices.nth(i).isEnabled()) { await choices.nth(i).click(); await page.waitForTimeout(450); }
      }
      clicked = true;
    }
    await page.waitForTimeout(clicked ? 250 : 500);
  }
  return false;
}
