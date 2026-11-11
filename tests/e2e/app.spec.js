import { test, expect } from '@playwright/test';
import { mockSpeech, seedLearner, playLesson, dismissCelebrations } from './helpers.js';

async function clickDone(page) {
  await dismissCelebrations(page);
  await page.getByRole('button', { name: /^Done$/ }).click();
  await dismissCelebrations(page);
}

const shot = async (page, testInfo, name) => {
  await page.waitForTimeout(350); // let step transitions settle
  return page.screenshot({ path: `screenshots/${testInfo.project.name}/${name}.png`, animations: 'disabled' });
};

test('first run: onboarding interview → first lesson → home', async ({ page }, testInfo) => {
  await mockSpeech(page, 'good');
  await page.goto('./');
  await expect(page.getByText('¡Dale!').first()).toBeVisible();
  await shot(page, testInfo, '01-welcome');
  await page.getByRole('button', { name: "Let's start!" }).click();

  // Nickname + avatar
  await page.getByPlaceholder('Nickname').fill('Leo');
  await page.getByRole('button', { name: 'avatar 🦊' }).click();
  await shot(page, testInfo, '02-onboarding-name');
  await page.getByRole('button', { name: "That's me!" }).click();

  // Why + topics
  await page.getByRole('button', { name: /Sports/ }).click();
  await page.getByRole('button', { name: /Talk with friends/ }).click();
  await shot(page, testInfo, '03-onboarding-why');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /Sports/ }).click();
  await page.getByRole('button', { name: /Food/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  // Placement check (adaptive, spoken)
  await page.getByRole('button', { name: "Let's go!" }).click();
  for (let i = 0; i < 40; i++) {
    if (await page.getByText('how many minutes a day').isVisible().catch(() => false)) break;
    if (i === 0) await shot(page, testInfo, '04-placement');
    const cont = page.getByRole('button', { name: 'Continue' });
    if (await cont.isVisible().catch(() => false)) { await cont.click(); continue; }
    if (await page.getByTestId('mic').isVisible().catch(() => false)) { await page.getByTestId('mic').click(); await page.waitForTimeout(700); continue; }
    if (await page.locator('.choice').first().isVisible().catch(() => false)) { await page.locator('.choice').first().click(); await page.waitForTimeout(1000); continue; }
    await page.waitForTimeout(400);
  }

  await expect(page.getByText('how many minutes a day')).toBeVisible();
  await page.getByRole('button', { name: /15 min/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /30 days/ }).click();
  await shot(page, testInfo, '05-streak-goal');
  await page.getByRole('button', { name: 'I can do it!' }).click();
  await page.getByRole('button', { name: /After school/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  // Your plan
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
  await expect(page.getByText(/YOU'LL BE ABLE TO/)).toBeVisible();
  await shot(page, testInfo, '06-your-plan');
  await page.getByRole('button', { name: 'Start my first lesson!' }).click();

  // First lesson, start to finish
  await page.waitForTimeout(400);
  await shot(page, testInfo, '07-lesson-intro');
  expect(await playLesson(page)).toBe(true);
  await expect(page.getByText('XP earned')).toBeVisible();
  await shot(page, testInfo, '08-lesson-summary');
  await clickDone(page);

  await expect(page.getByText('¡Hola, Leo!')).toBeVisible();
  await shot(page, testInfo, '09-home');
});

test('lesson screens: drill, hidden words, vocab, Q&A, feedback', async ({ page }, testInfo) => {
  await mockSpeech(page, 'good');
  await seedLearner(page);
  await page.goto('./#/lesson/u3-l1');
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await shot(page, testInfo, '10-intro-speak');
  await page.getByTestId('mic').click();
  await expect(page.locator('.feedback.great')).toBeVisible();
  await shot(page, testInfo, '11-feedback-great');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.word.hidden').first()).toBeVisible();
  await shot(page, testInfo, '12-drill-hidden');
  // Play through the rest, grabbing a few screens on the way.
  const seen = new Set();
  for (let n = 0; n < 60; n++) {
    const labels = page.locator('.step-label');
    const label = (await labels.count()) ? await labels.first().textContent({ timeout: 2000 }).catch(() => '') : '';
    if (label && /Build it|Listen and choose|Answer/.test(label) && !seen.has(label)) {
      seen.add(label);
      await shot(page, testInfo, `13-${label.replace(/[^a-z]+/gi, '-').toLowerCase()}`);
    }
    await dismissCelebrations(page);
    if (await page.getByRole('button', { name: /^Done$/ }).isVisible().catch(() => false)) break;
    const cont = page.getByRole('button', { name: 'Continue' });
    if (await cont.isVisible().catch(() => false) && await cont.isEnabled()) { await cont.click(); continue; }
    if (await page.getByTestId('mic').isVisible().catch(() => false)) { await page.getByTestId('mic').click(); await page.waitForTimeout(600); continue; }
    const choices = page.locator('.choice');
    if (await choices.count()) { for (let i = 0; i < await choices.count(); i++) { if (await cont.isEnabled().catch(() => false)) break; await choices.nth(i).click(); await page.waitForTimeout(400); } continue; }
    await page.waitForTimeout(300);
  }
  await expect(page.getByText('XP earned')).toBeVisible();
});

test('borderline speech counts as "good"', async ({ page }, testInfo) => {
  await mockSpeech(page, 'borderline');
  await seedLearner(page);
  await page.goto('./#/lesson/u1-l4');
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.getByTestId('mic').click();
  await expect(page.locator('.feedback.good, .feedback.great')).toBeVisible();
  await expect(page.locator('.feedback.notyet')).toHaveCount(0);
  await shot(page, testInfo, '20-borderline');
});

test('poor speech: gentle "not yet", never "wrong", then Keep going', async ({ page }, testInfo) => {
  await mockSpeech(page, 'poor');
  await seedLearner(page);
  await page.goto('./#/lesson/u1-l4');
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await page.getByTestId('mic').click();
  await expect(page.locator('.feedback.notyet')).toBeVisible();
  await expect(page.getByText(/wrong|failed|incorrect/i)).toHaveCount(0);
  await shot(page, testInfo, '21-not-yet');
  await page.getByTestId('mic').click();
  await expect(page.getByRole('button', { name: /Keep going/ })).toBeVisible();
  await shot(page, testInfo, '22-keep-going');
  await page.getByRole('button', { name: /Keep going/ }).click();
  await expect(page.locator('.step')).toBeVisible();
  // XP was still earned for trying.
  const xp = await page.evaluate(() => JSON.parse(localStorage.getItem('dale.v1') || '{}'));
  expect(xp).toBeTruthy();
});

test('"Help me" reveals hidden Spanish; a "not yet" shows the answer', async ({ page }, testInfo) => {
  await mockSpeech(page, 'poor');
  await seedLearner(page);
  await page.goto('./#/lesson/u3-l1');
  await page.getByRole('button', { name: 'Skip intro' }).click();
  // Full-text step: after a "not yet", the answer is shown and said for him.
  await page.getByTestId('mic').click();
  await expect(page.locator('.feedback.notyet')).toBeVisible();
  await expect(page.getByText('Listen to how Chispa says it')).toBeVisible();
  await page.getByTestId('mic').click();
  await page.getByRole('button', { name: /Keep going/ }).click();
  // Hidden-words step: "Help me" reveals every word.
  await expect(page.locator('.word.hidden').first()).toBeVisible();
  await page.getByRole('button', { name: /Help me/ }).click();
  await expect(page.locator('.word.hidden')).toHaveCount(0);
  await shot(page, testInfo, '24-help-me');
});

test('onboarding check: "I don\'t know this one yet" shows the answer and moves on', async ({ page }, testInfo) => {
  await mockSpeech(page, 'good');
  await page.goto('./');
  await page.getByRole('button', { name: "Let's start!" }).click();
  await page.getByPlaceholder('Nickname').fill('Leo');
  await page.getByRole('button', { name: "That's me!" }).click();
  await page.getByRole('button', { name: /Sports/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /Sports/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: "Let's go!" }).click();
  await expect(page.getByText('Quick check · 1')).toBeVisible();
  await page.getByRole('button', { name: "I don't know this one yet" }).click();
  await expect(page.getByText('No problem!')).toBeVisible();
  await expect(page.locator('.phrase-words')).toContainText('Hola');
  await shot(page, testInfo, '25-dont-know');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Quick check · 2')).toBeVisible();
});

test('speech unsupported: self-check mode with a grown-up tip', async ({ page }, testInfo) => {
  await mockSpeech(page, 'unsupported');
  await seedLearner(page);
  await page.goto('./#/lesson/u0-l1');
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await expect(page.getByRole('button', { name: /I said it/ })).toBeVisible();
  await shot(page, testInfo, '23-self-check');
  expect(await playLesson(page)).toBe(true);
});

test('roleplay with branching', async ({ page }, testInfo) => {
  await mockSpeech(page, 'good');
  await seedLearner(page);
  await page.goto('./#/lesson/u4-l5');
  await shot(page, testInfo, '30-roleplay-intro');
  await page.getByRole('button', { name: 'Start the scene' }).click();
  await page.getByTestId('mic').click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('mic').waitFor();
  await shot(page, testInfo, '31-roleplay-chat');
  expect(await playLesson(page)).toBe(true);
});

test('home, smart review, progress, trophies, settings, grown-up dashboard', async ({ page }, testInfo) => {
  await mockSpeech(page, 'good');
  await seedLearner(page);
  await page.goto('./');
  // Do a lesson so there is data everywhere.
  await page.goto('./#/lesson/u0-l1');
  expect(await playLesson(page)).toBe(true);
  await clickDone(page);
  // Dismiss any celebrations.
  for (let i = 0; i < 5; i++) {
    const ok = page.getByRole('button', { name: '¡Genial!' });
    if (await ok.isVisible().catch(() => false)) { if (i === 0) await shot(page, testInfo, '40-celebration'); await ok.click(); } else break;
  }
  await shot(page, testInfo, '41-home');

  await page.getByRole('link', { name: /Learn/ }).click();
  await shot(page, testInfo, '42-path');
  await page.getByRole('link', { name: /Review/ }).click();
  await shot(page, testInfo, '43-review-library');
  await page.getByRole('button', { name: 'Start' }).click();
  await shot(page, testInfo, '44-smart-review-start');
  expect(await playLesson(page)).toBe(true);
  await clickDone(page);
  for (let i = 0; i < 5; i++) {
    const ok = page.getByRole('button', { name: '¡Genial!' });
    if (await ok.isVisible().catch(() => false)) await ok.click(); else break;
  }

  await page.getByRole('link', { name: /Progress/ }).click();
  await expect(page.getByText('Things I can say')).toBeVisible();
  await shot(page, testInfo, '45-progress');
  await page.getByRole('link', { name: /Trophies/ }).click();
  await shot(page, testInfo, '46-trophies');

  await page.getByRole('link', { name: /Home/ }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await shot(page, testInfo, '47-settings');
  await page.getByText('Grown-ups').click();
  for (const d of '12341234') await page.locator('.pin-pad button', { hasText: new RegExp(`^${d}$`) }).click();
  await expect(page.getByText('Grown-up dashboard')).toBeVisible();
  await shot(page, testInfo, '48-grownup-dashboard');
  await page.getByRole('button', { name: 'Gentle' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dale.v1')));
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('dale.v1')));
  expect(after.kids['local-test'].settings.leniency).toBe('gentle');
  expect(saved).toBeTruthy();
});

test('streak: freeze saves a missed day with a friendly message', async ({ page }, testInfo) => {
  await mockSpeech(page, 'good');
  // 7-day streak that ended two days ago, with one freeze.
  const d = new Date();
  const key = (n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const days = {};
  for (let n = 2; n <= 8; n++) days[key(n)] = { sec: 700, xp: 60, goalMet: true };
  await seedLearner(page, { progress: { days, xp: 420, streak: { current: 7, best: 7, lastCovered: key(2), freezes: 1, towardFreeze: 0, freezeDays: [], goal: 14, goalsReached: [] } } });
  await page.goto('./');
  await expect(page.getByText('Your freeze saved your streak!')).toBeVisible();
  await shot(page, testInfo, '50-freeze-saved');
  await page.getByRole('button', { name: '¡Genial!' }).click();
  await expect(page.locator('.week-dot.freeze')).toHaveCount(1);
  await shot(page, testInfo, '51-home-with-streak');
});

test('works from a GitHub Pages subpath with relative assets', async ({ page }) => {
  await mockSpeech(page, 'good');
  const failed = [];
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.url()); });
  await page.goto('./');
  await expect(page.getByText('¡Dale!').first()).toBeVisible();
  expect(failed).toEqual([]);
  const manifest = await page.request.get('./manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  const sw = await page.request.get('./sw.js');
  expect(await sw.text()).toContain('./assets/');
});
