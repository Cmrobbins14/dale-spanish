// Real Firebase sign-in flow against the local Auth + Firestore emulators.
// Run with: npm run test:e2e:firebase
import { test, expect } from '@playwright/test';
import { mockSpeech } from '../e2e/helpers.js';

const shot = async (page, testInfo, name) => {
  await page.waitForTimeout(350);
  return page.screenshot({ path: `screenshots/${testInfo.project.name}/${name}.png`, animations: 'disabled' });
};

test('grown-up creates a learner; learner signs in; grown-up sees dashboard', async ({ page, browser }, testInfo) => {
  await mockSpeech(page, 'good');
  const stamp = Date.now().toString(36);
  const email = `grownup-${stamp}@example.com`;
  const username = `leo${stamp}`.slice(0, 18);

  await page.goto('./?emulators');
  await page.getByRole('button', { name: 'Grown-up' }).click();
  await page.getByRole('button', { name: /Create a grown-up account/ }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('grownup-pass');
  await shot(page, testInfo, '60-grownup-signup');
  await page.getByRole('button', { name: 'Create grown-up account' }).click();

  await expect(page.getByText('Grown-ups').first()).toBeVisible();
  await page.getByRole('button', { name: 'Add a learner' }).first().click();
  await page.getByLabel(/Username/).fill(username);
  await page.getByLabel(/Nickname/).fill('Leo');
  await page.getByLabel(/Password/).fill('kidpass1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('daily goal hit rate')).toBeVisible({ timeout: 20000 });
  await shot(page, testInfo, '61-grownup-dashboard-firebase');
  await page.getByRole('button', { name: /Sign out/ }).click();

  // Learner signs in with username + password (no email).
  await page.getByRole('button', { name: "I'm the learner" }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('kidpass1');
  await shot(page, testInfo, '62-learner-signin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/What should I call you/)).toBeVisible({ timeout: 20000 });
  await page.getByPlaceholder('Nickname').fill('Leo');
  await page.getByRole('button', { name: "That's me!" }).click();
  await expect(page.getByText(/Why do you want to learn Spanish/)).toBeVisible();

  // Wrong password: friendly message, no lock-out.
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('./?emulators');
  await p2.getByRole('button', { name: "I'm the learner" }).click();
  await p2.getByLabel('Username').fill(username);
  await p2.getByLabel('Password').fill('nope-nope');
  await p2.getByRole('button', { name: 'Sign in' }).click();
  await expect(p2.getByRole('alert')).toContainText("don't match");
  await ctx.close();
});
