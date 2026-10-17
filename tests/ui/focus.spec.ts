import { test, expect, type Page } from '@playwright/test';
import type { LifeProject } from '../../shared/contracts/index';

/** Real local backend (AI_MODE=local), started by playwright.config.ts. The API allows
 * 10 project creations per minute, so these tests share projects instead of creating many. */
test.describe.configure({ mode: 'serial' });
let romeId = '';
let movingId = '';
test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/projects', { data: { message: "I'm moving to Turku with a budget of €2,000.", locale: 'en' } });
  expect(res.status()).toBe(201);
  movingId = (await res.json()).project.id;
});
const readProject = async (page: Page, id: string) => (await (await page.request.get(`/api/projects/${id}`)).json()).project as LifeProject;
async function openMoving(page: Page) {
  await page.goto(`/app/p/${movingId}`);
  await expect(page.locator('#project-title')).toBeVisible();
}

async function createProject(page: Page, message: string) {
  await page.goto('/app/new');
  await page.getByRole('textbox', { name: 'What are you planning?', exact: true }).fill(message);
  await page.getByRole('button', { name: 'Create my workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/p\/[a-f0-9-]+$/, { timeout: 20000 });
  const id = page.url().split('/').at(-1)!;
  const read = async () => (await (await page.request.get(`/api/projects/${id}`)).json()).project as LifeProject;
  return { id, read };
}

test('initial budget from the request is shown on the new workspace', async ({ page }) => {
  const { id, read } = await createProject(page, "I'm traveling to Rome with €900.");
  romeId = id;
  const project = await read();
  expect(project.budget.totalMinor).toBe(90000);
  expect(project.budget.currency).toBe('EUR');
  await expect(page.locator('#w-budget dl').first()).toContainText('€900');
  // Not asked again for something it already knows.
  expect(project.questions.some(q => /budget/i.test(q))).toBeFalsy();
});

test('typing in the workspace assistant stays in the composer, even after a mouse send', async ({ page }) => {
  await openMoving(page);
  let posts = 0;
  page.on('request', r => {
    if (r.method() === 'POST' && r.url().endsWith('/assistant')) posts++;
  });
  await page.getByRole('button', { name: 'Ask assistant', exact: true }).first().click();
  const chat = page.getByRole('textbox', { name: 'Message the assistant' });
  await expect(chat).toBeFocused();
  const url = page.url();
  const scrollBefore = await page.evaluate(() => window.scrollY);

  await page.keyboard.type('Compare moving services please');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Backspace');
  await expect(chat).toHaveValue('Compare moving services please');
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

  // Paste through the clipboard shortcut.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText(' now'));
  await page.keyboard.press('ControlOrMeta+V');
  await expect(chat).toHaveValue('Compare moving services please now');

  // Send with the mouse, then keep typing without clicking back into the box.
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.keyboard.type('next question');
  await page.keyboard.press('Space');
  await expect(chat).toHaveValue('next question ');
  await expect(chat).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  expect(page.url()).toBe(url);

  // Exactly one request per submission; messages render in order without duplicates.
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log.getByText('Compare moving services please now', { exact: true })).toHaveCount(1);
  await expect.poll(() => log.locator('li').count(), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  expect(posts).toBe(1);
  const roles = await log.locator('li[data-role]').evaluateAll(items => items.map(i => i.getAttribute('data-role')));
  expect(roles.slice(0, 2)).toEqual(['user', 'assistant']);

  // Empty and repeated submissions do not send.
  await chat.fill('   ');
  await page.keyboard.press('Enter');
  expect(posts).toBe(1);
});

test('answering in chat or questions never moves focus out of the chat box', async ({ page }) => {
  await page.goto(`/app/p/${romeId}`);
  await expect(page.locator('#project-title')).toBeVisible();
  const read = () => readProject(page, romeId);
  const before = await read();
  test.skip(before.questions.length === 0, 'No open questions to answer');
  // Interact with the questions block first (this arms its auto-focus for the next question).
  const questions = page.locator('#questions');
  await questions.getByRole('button', { name: 'Skip for now', exact: true }).click();
  // Now answer through the assistant; the server may resolve the question and the block re-renders.
  await page.getByRole('button', { name: 'Ask assistant', exact: true }).first().click();
  const chat = page.getByRole('textbox', { name: 'Message the assistant' });
  await expect(chat).toBeFocused();
  await page.keyboard.type('We are 2 travelers, leaving 2027-06-10 for 5 days.');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await read()).conversation?.turns.length ?? 0, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(800);
  await page.keyboard.type('still typing here');
  await expect(chat).toHaveValue('still typing here');
  await expect(chat).toBeFocused();
});

test('question answers save to the project and survive reload', async ({ page }) => {
  const { read } = await createProject(page, 'Plan a trip to Paris with €1,500');
  const questions = page.locator('#questions');
  const first = await read();
  test.skip(first.questions.length === 0, 'No open questions');
  const asked = await questions.locator('h3').first().textContent();
  const input = questions.locator('input:not([type=radio]), textarea').first();
  const type = await input.getAttribute('type');
  await input.fill(type === 'date' ? '2027-06-10' : type === 'number' ? '3' : 'Two adults');
  await questions.getByRole('button', { name: /Save and continue|Save answer/ }).click();
  await expect.poll(async () => Object.keys((await read()).answeredQuestions ?? {}).length).toBeGreaterThan(0);
  const saved = await read();
  expect(saved.questions).not.toContain(asked?.trim());
  await page.reload();
  await expect(page.locator('#questions h3').first()).not.toHaveText(asked ?? '');
});

test('conversation reloads from the server once, in order', async ({ page }) => {
  await openMoving(page);
  await page.getByRole('button', { name: 'Ask assistant', exact: true }).first().click();
  const chat = page.getByRole('textbox', { name: 'Message the assistant' });
  await chat.fill('Review transport risks');
  await page.keyboard.press('Enter');
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log.locator('li[data-role="assistant"]').last()).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => (await readProject(page, movingId)).conversation?.turns.length ?? 0).toBeGreaterThanOrEqual(4);
  await page.reload();
  await page.getByRole('button', { name: 'Ask assistant', exact: true }).first().click();
  await expect(log.getByText('Review transport risks', { exact: true })).toHaveCount(1);
  const roles = await log.locator('li[data-role]').evaluateAll(items => items.map(i => i.getAttribute('data-role')));
  expect(roles.slice(0, 2)).toEqual(['user', 'assistant']);
});

for (const viewport of [{ width: 820, height: 1180 }, { width: 390, height: 844 }]) {
  test(`assistant sheet typing is stable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openMoving(page);
    await page.getByRole('button', { name: 'Ask assistant', exact: true }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Assistant' });
    await expect(sheet).toBeVisible();
    const chat = sheet.getByRole('textbox', { name: 'Message the assistant' });
    await expect(chat).toBeFocused();
    const y = await page.evaluate(() => window.scrollY);
    await page.keyboard.type('Plan the van');
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Shift+Enter');
    // ArrowLeft put the caret before the trailing space, so the newline lands there.
    await expect(chat).toHaveValue('Plan the va\n ');
    await expect(sheet).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(y);
  });
}
