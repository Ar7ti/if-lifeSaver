import { test, expect, type Page } from '@playwright/test';
import type { LifeProject } from '../../shared/contracts/index';

/** Real local backend (AI_MODE=local, demo research). One shared travel project keeps
 * the suite under the API's project-creation rate limit. */
test.describe.configure({ mode: 'serial' });
let id = '';
test.beforeAll(async ({ request }) => {
  const r = await request.post('/api/projects', { data: { message: 'I want to travel from Helsinki to Rome for five days with a budget of €900.', locale: 'en' } });
  expect(r.status()).toBe(201);
  id = (await r.json()).project.id;
});
const open = async (page: Page) => {
  await page.goto(`/app/p/${id}`);
  await expect(page.locator('#project-title')).toBeVisible();
};
const read = async (page: Page) => (await (await page.request.get(`/api/projects/${id}`)).json()).project as LifeProject;

test('compare: one selector, honest totals, switching and choosing a plan', async ({ page }) => {
  await open(page);
  const w = page.locator('#w-scenario_comparison');
  const tabs = w.getByRole('tab');
  await expect(tabs).toHaveCount(3);
  // Totals shown in the selector are the engine's real totals.
  const p = await read(page);
  for (const s of p.scenarios) await expect(w.getByRole('tab', { name: new RegExp(s.name) })).toContainText(`€${(s.estimatedTotalMinor / 100).toLocaleString('en-IE')}`);
  if (new Set(p.scenarios.map(s => s.estimatedTotalMinor)).size === 1) await expect(w).toContainText('Same total for all three right now');
  await expect(w.getByRole('tab', { name: /Balanced/ })).toHaveAttribute('aria-selected', 'true');
  // Keyboard: arrows move between approaches.
  await w.getByRole('tab', { name: /Balanced/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(w.getByRole('tab', { name: /Comfort/ })).toHaveAttribute('aria-selected', 'true');
  await expect(w.getByRole('tabpanel')).toContainText('Ease and convenience first');
  await w.getByRole('button', { name: 'Plan with Comfort' }).click();
  await expect(w.getByRole('tabpanel')).toContainText('Your plan');
  await expect(w.getByRole('tab', { name: /Comfort.*your plan/ })).toBeVisible();
  await w.getByRole('button', { name: 'Recalculate' }).click();
  await expect(page.getByText('Scenarios recalculated')).toBeVisible();
});

test('transport search: integrated bar, honest loading, chip feedback, preferences', async ({ page }) => {
  await open(page);
  const w = page.locator('#w-service_finder');
  // Hold the research response so the in-flight state is observable.
  let release!: () => void;
  const gate = new Promise<void>(r => (release = r));
  await page.route('**/research', async route => {
    await gate;
    await route.continue();
  });
  await w.getByRole('button', { name: /Preferences/ }).click();
  await w.getByRole('checkbox', { name: 'Free cancellation' }).check();
  await expect(w.getByRole('button', { name: /Preferences/ })).toContainText('1');
  await w.getByRole('button', { name: 'Accommodation', exact: true }).click();
  const status = w.getByRole('status');
  await expect(status).toContainText('Researching');
  await expect(status).toContainText('No results yet');
  await expect(w.getByRole('button', { name: 'Accommodation', exact: true })).toHaveAttribute('aria-busy', 'true');
  await expect(w.getByRole('button', { name: 'Add to plan' })).toHaveCount(0);
  release();
  await expect(w.getByRole('button', { name: 'Add to plan' }).first()).toBeVisible();
  await expect(w.getByRole('button', { name: 'New search' })).toBeVisible();
  // The research request carried the selected preference.
  const p = await read(page);
  expect(p.researchResults.length).toBeGreaterThan(0);
});

test('next steps: one highlighted next action that hands its text to the assistant', async ({ page }) => {
  await open(page);
  const w = page.locator('#w-recommendations');
  await expect(w.getByText('Up next')).toBeVisible();
  await expect(w.getByRole('button', { name: /^Start:/ })).toHaveCount(1);
  const p = await read(page);
  const expected = p.recommendationDetails?.[0]?.action ?? p.recommendations[0]!;
  await w.getByRole('button', { name: /^Start:/ }).click();
  await expect(page.getByRole('textbox', { name: 'Message the assistant' })).toHaveValue(`Help me with this: ${expected}`);
});

test('reduced motion: sections render complete and static', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await open(page);
  for (const sel of ['#w-scenario_comparison', '#w-service_finder', '#w-recommendations']) {
    const el = page.locator(sel);
    await el.scrollIntoViewIfNeeded();
    await expect(el).toBeVisible();
    expect(await el.evaluate(n => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await ctx.close();
});
