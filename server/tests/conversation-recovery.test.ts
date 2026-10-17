import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { createPlanner, type Planner } from '../src/ai.js';
import { loadConfig } from '../src/config.js';
import { AppError } from '../src/errors.js';
import { LocalProjectRepository, MemoryProjectRepository, type ProjectRepository } from '../src/repository.js';
import type { SearchProvider } from '../src/research.js';
import {
  AssistantResponseSchema, CartResponseSchema, CreateProjectResponseSchema, ErrorResponseSchema,
  ProjectResponseSchema, ResearchResultSchema, type AssistantResponse, type LifeProject,
} from '../../shared/contracts/index.js';

const goingGoal = 'I am going to Rome for five days with a budget of EUR 900.';
const travelGoal = 'Plan a trip from Helsinki to Rome for five days with a budget of EUR 900.';
const casualRequest = 'I need somewhere to sleep and aviatickets.';
const deadline = { timeout: 15_000 };

class FailingRepository extends MemoryProjectRepository {
  failNextWrite = false;
  failures = 0;
  protected override async write(project: LifeProject) {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      this.failures++;
      throw new AppError('STORAGE_ERROR', 'Temporary fixture storage failure; retry the request.', 503);
    }
    return super.write(project);
  }
}

async function serve(t: TestContext, repository: ProjectRepository = new MemoryProjectRepository(), repeatedReply?: string) {
  const config = loadConfig({ AI_MODE: 'local', RESEARCH_MODE: 'unavailable', STORAGE_MODE: 'memory', LOG_LEVEL: 'silent' });
  const local = createPlanner({ mode: 'local', model: config.model, timeoutMs: config.aiTimeoutMs });
  const calls = { create: 0, assistant: 0, search: 0, modelFailures: 0, failNextAssistant: false };
  const planner: Planner = {
    ...local,
    async createProject(input) { calls.create++; return local.createProject(input); },
    async assistant(project, request) {
      calls.assistant++;
      if (calls.failNextAssistant) {
        calls.failNextAssistant = false;
        calls.modelFailures++;
        throw new AppError('AI_UNAVAILABLE', 'Temporary fixture model failure; retry the request.', 503);
      }
      if (repeatedReply) return { reply: repeatedReply, commands: [], explanations: [] };
      return local.assistant(project, request);
    },
  };
  const search: SearchProvider = { mode: 'unavailable', async search(request) {
    calls.search++;
    return ResearchResultSchema.parse({ id: randomUUID(), category: request.category, status: 'unavailable', mode: 'unavailable', offers: [], warnings: ['HTTP test search is intentionally unavailable.'], searchedAt: new Date().toISOString(), query: request.category });
  } };
  const app = await buildApp({ config, repository, planner, search });
  const origin = await app.listen({ port: 0, host: '127.0.0.1' });
  assert.notEqual(new URL(origin).port, '0', 'The test must use an actual ephemeral TCP listener');
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await app.close(); } };
  t.after(close);
  async function request(route: string, method = 'GET', payload?: object) {
    const response = await fetch(`${origin}${route}`, {
      method, headers: { 'content-type': 'application/json', connection: 'close' },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), signal: AbortSignal.timeout(4_000),
    });
    const body: unknown = await response.json();
    return { status: response.status, body };
  }
  async function create(message = travelGoal) {
    const response = await request('/api/projects', 'POST', { message, locale: 'en' });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return CreateProjectResponseSchema.parse(response.body).project;
  }
  async function get(id: string) {
    const response = await request(`/api/projects/${id}`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return ProjectResponseSchema.parse(response.body).project;
  }
  async function chat(id: string, message: string) {
    const response = await request(`/api/projects/${id}/assistant`, 'POST', { message });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return AssistantResponseSchema.parse(response.body);
  }
  return { request, create, get, chat, close, calls, repository };
}

function assertBudgetKnown(project: LifeProject, totalMinor = 90_000) {
  assert.equal(project.budget.totalMinor, totalMinor);
  assert.equal(project.budget.confirmed, true);
  assert(project.budget.allocatedMinor + project.budget.emergencyReserveMinor <= totalMinor, 'A budget increase can leave unassigned funds');
  assert(!project.questions.some(question => /\bbudget\b|spending limit|how much.*spend/i.test(question)), JSON.stringify(project.questions));
  assert(!project.conversation?.clarifications.some(item => item.field === 'budget' && item.status === 'pending'));
}

function assertAllocationsPreserved(project: LifeProject, before: LifeProject) {
  assert.deepEqual(project.budget.categories, before.budget.categories, 'Chat budget increases must preserve confirmed category allocations and spending');
  assert.equal(project.budget.allocatedMinor, before.budget.allocatedMinor);
  assert.equal(project.budget.emergencyReserveMinor, before.budget.emergencyReserveMinor, 'An increased total must not silently change the reserve');
}

function assertResearch(response: AssistantResponse, expected: string[]) {
  const actions = response.proposedActions.filter(action => action.command.type === 'research_services' || action.command.type === 'research_products');
  const categories = actions.map(action => {
    if (action.command.type !== 'research_services' && action.command.type !== 'research_products') assert.fail('Expected research');
    assert.equal(action.command.type, 'research_services', JSON.stringify(action.command));
    assert.equal(action.command.arguments.kind, 'service');
    assert.equal(action.requiresConfirmation, true);
    assert.equal(action.status, 'proposed');
    return action.command.arguments.category;
  });
  for (const category of expected) assert(categories.includes(category), `Missing ${category} research: ${JSON.stringify(response)}`);
  assert.equal(new Set(categories).size, categories.length, 'Research proposals must not be duplicated');
  assert(!categories.some(category => /bed|furniture|moving|mover/.test(category)));
}

function knownFacts(project: LifeProject) {
  return {
    scenarioType: project.scenarioType, location: project.location, originalMessage: project.originalMessage,
    budget: project.budget, preferences: project.preferences, cart: project.cart, researchResults: project.researchResults,
    workspace: project.workspace, tasks: project.tasks, confirmedFacts: project.confirmedFacts,
  };
}

async function readyTrip(server: Awaited<ReturnType<typeof serve>>) {
  const project = await server.create();
  const updated = await server.request(`/api/projects/${project.id}`, 'PATCH', { preferences: { startDate: '2027-05-02', endDate: '2027-05-06', travelers: 2 } });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  const selected = await server.request(`/api/projects/${project.id}/cart/items`, 'POST', { title: 'Recorded accommodation estimate', category: 'accommodation', unitPriceMinor: 20_001, deliveryCostMinor: null, quantity: 1, status: 'selected' });
  assert.equal(selected.status, 201, JSON.stringify(selected.body));
  assert.equal(CartResponseSchema.parse(selected.body).budget.committedMinor, 20_001);
  return server.get(project.id);
}

function recoverable(response: { status: number; body: unknown }, code: string) {
  if (response.status === 200) {
    const reply = AssistantResponseSchema.parse(response.body);
    assert.match(reply.reply, /retry|try again|temporar|could not|couldn't|unavailable|recover|not saved|save.*fail/i);
    assert.equal(reply.proposedActions.length, 0, 'A failed operation must not appear as a successful proposal');
  } else {
    assert.equal(response.status, 503, JSON.stringify(response.body));
    assert.equal(ErrorResponseSchema.parse(response.body).error.code, code);
  }
}

test('TCP create going to Rome persists €900 without asking budget again, including after server restart', deadline, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'conversation-http-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = await serve(t, new LocalProjectRepository(directory));
  const created = await first.create(goingGoal);
  assert.equal(created.scenarioType, 'travel');
  assert.equal(created.location, 'Rome');
  assert.equal(created.preferences.durationDays, 5);
  assertBudgetKnown(created);
  assert(created.conversation, 'New projects must initialize conversation state');
  assert.deepEqual(await first.get(created.id), created);
  await first.close();
  const restarted = await serve(t, new LocalProjectRepository(directory));
  const restored = await restarted.get(created.id);
  assert.deepEqual(restored, created);
  assertBudgetKnown(restored);
  assert.equal(restarted.calls.create, 0, 'GET must load persisted state without regenerating a plan');
});

test('TCP casual sleep and aviatickets request resolves to accommodation plus transport in saved travel context', deadline, async t => {
  const server = await serve(t);
  const project = await server.create();
  for (const message of [casualRequest, 'just want to chill there help some place to sleep aviatickets', "I'm looking for a place to sleep and plane tickets.", 'Can you help me find somewhere cheap to sleep and airline tickets?']) {
    const response = await server.chat(project.id, message);
    assertResearch(response, ['accommodation', 'transport']);
    assert.equal(server.calls.search, 0, 'Research proposals wait for confirmation');
    const saved = await server.get(project.id);
    assertBudgetKnown(saved);
    assert.equal(saved.scenarioType, 'travel');
    assert.deepEqual(saved.cart, []);
    assert(saved.conversation, 'The conversation must persist independently of the HTTP response');
    assert.equal(saved.conversation.activeRequest, message);
    assert(saved.conversation.turns.some(turn => turn.role === 'user' && turn.content === message));
    assert(saved.conversation.turns.some(turn => turn.role === 'assistant' && turn.content === response.reply));
    assert(!saved.conversation.clarifications.some(item => item.field === 'context' && item.status === 'pending'));
  }
});

test('TCP yes/ok resumes an old context clarification instead of repeatedly asking what the saved trip means', deadline, async t => {
  const server = await serve(t);
  const project = await server.create();
  const question = 'Is this about your current trip or another real-life decision?';
  for (const affirmation of ['yes', 'Yes it is', 'it is']) {
    const clarificationId = randomUUID();
    const now = new Date().toISOString();
    await server.repository.update(project.id, saved => {
      saved.conversation = {
        id: saved.conversation?.id ?? randomUUID(), activeRequest: casualRequest,
        turns: [
          { id: randomUUID(), role: 'user', content: casualRequest, createdAt: now },
          { id: randomUUID(), role: 'assistant', content: question, createdAt: now },
        ],
        clarifications: [{ id: clarificationId, field: 'context', question, status: 'pending', createdAt: now, updatedAt: now, context: { scenarioType: 'travel', request: casualRequest }, answer: null, attempts: 2 }],
      };
    });
    const resumed = await server.chat(project.id, affirmation);
    assertResearch(resumed, ['accommodation', 'transport']);
    for (const confirmation of ['ok', 'yes']) {
      const reply = await server.chat(project.id, confirmation);
      assert.notEqual(reply.reply, question);
      assert.doesNotMatch(reply.reply, /is this about your current plan|which part of your life plan|another real.life decision/i);
    }
    const saved = await server.get(project.id);
    assert.equal(saved.scenarioType, 'travel');
    assert.equal(saved.location, 'Rome');
    assertBudgetKnown(saved);
    const clarification = saved.conversation?.clarifications.find(item => item.id === clarificationId);
    assert(clarification);
    assert.notEqual(clarification.status, 'pending');
    assert(!saved.conversation!.clarifications.some(item => item.field === 'context' && item.status === 'pending'));
    assert.equal(saved.conversation!.activeRequest, casualRequest, 'A confirmation must not replace the actual active request');
    assert(saved.conversation!.turns.length <= 12);
    assert(saved.conversation!.clarifications.every(item => item.attempts <= 3));
  }
});

test('TCP bare EUR 900 after a budget clarification preserves known dates and reconciles travelers on reload', deadline, async t => {
  const server = await serve(t);
  const project = await server.create('Plan a trip from Helsinki to Rome for five days from 2027-05-02 to 2027-05-06.');
  assert.equal(project.budget.confirmed, false);
  assert.equal(project.preferences.startDate, '2027-05-02');
  assert.equal(project.preferences.endDate, '2027-05-06');
  assert(project.questions.some(question => /budget/i.test(question)));
  assert(project.conversation?.clarifications.some(item => item.field === 'budget' && item.status === 'pending'));
  for (const answer of ['EUR 900', 'Travel dates are 2027-05-02 to 2027-05-06.', 'There will be 2 travelers.']) {
    const reply = await server.chat(project.id, answer);
    assert.doesNotMatch(reply.reply, /(?:what|when|which|how much)[^?]*(?:budget|start date|departure date|return date|travel dates)[^?]*\?/i);
  }
  const saved = await server.get(project.id);
  assertBudgetKnown(saved);
  assert.equal(saved.location, 'Rome');
  assert.equal(saved.preferences.origin, 'Helsinki');
  assert.equal(saved.preferences.startDate, '2027-05-02');
  assert.equal(saved.preferences.endDate, '2027-05-06');
  assert.equal(saved.preferences.durationDays, 5);
  assert.equal(saved.preferences.travelers, 2);
  assert(!saved.questions.some(question => /\bbudget\b|when.*trip|when.*start|how many|travel dates/i.test(question)), JSON.stringify(saved.questions));
  assert(!saved.conversation?.clarifications.some(item => ['budget', 'startDate', 'endDate', 'durationDays', 'travelers', 'ownedItems'].includes(item.field) && item.status === 'pending'));
  assert(saved.conversation?.turns.some(turn => turn.role === 'user' && turn.content === 'EUR 900'));
  assert(saved.budget.categories.every(category => !/bed|desk|furniture|moving/.test(category.id)));
  assert.deepEqual(await server.get(project.id), saved, 'Refresh must not reintroduce answered questions or discard facts');
});

test('TCP moving bed/desk ownership is canonical while separate travel and car conversations stay isolated', deadline, async t => {
  const server = await serve(t);
  const rome = await server.create();
  const car = await server.create('I want to buy a reliable used car in Finland under EUR 4,000.');
  const originalCar = await server.get(car.id);
  await server.chat(rome.id, 'There will be 2 travelers.');
  await server.chat(rome.id, casualRequest);
  assert.deepEqual(await server.get(car.id), originalCar, 'A Rome conversation cannot mutate the car project');
  await server.chat(car.id, 'My budget is EUR 4,200.');
  const savedRome = await server.get(rome.id);
  const savedCar = await server.get(car.id);
  assertBudgetKnown(savedRome);
  assertBudgetKnown(savedCar, 420_000);
  assertAllocationsPreserved(savedCar, originalCar);
  assert.equal(savedRome.preferences.travelers, 2);
  assert.notEqual(savedCar.preferences.travelers, 2);
  assert.equal(savedRome.location, 'Rome');
  assert.equal(savedCar.scenarioType, 'car_purchase');
  assert(savedRome.conversation && savedCar.conversation);
  assert.notEqual(savedRome.conversation.id, savedCar.conversation.id);
  const romeTurnIds = new Set(savedRome.conversation.turns.map(turn => turn.id));
  assert(savedCar.conversation.turns.every(turn => !romeTurnIds.has(turn.id)));
  assert(!savedCar.conversation.turns.some(turn => turn.content === casualRequest));
  assert.equal(savedRome.conversation.activeRequest, casualRequest);
  const moving = await server.create('I am moving from Helsinki to Turku on 2027-04-05 with a budget of EUR 2,000.');
  const inventoryReply = await server.chat(moving.id, 'I already own my bed and desk.');
  const savedMoving = await server.get(moving.id);
  assert.equal(savedMoving.scenarioType, 'moving');
  assertBudgetKnown(savedMoving, 200_000);
  assert.equal(savedMoving.preferences.moveDate, '2027-04-05');
  assert.equal(savedMoving.preferences.origin, 'Helsinki');
  assert.deepEqual(savedMoving.preferences.ownedItems?.slice().sort(), ['bed', 'desk']);
  assert(!savedMoving.questions.some(question => /already.*(?:own|have)|own furniture/i.test(question)));
  assert(!savedMoving.conversation?.clarifications.some(item => ['ownedItems', 'ownsFurniture'].includes(item.field) && item.status === 'pending'));
  assert(!inventoryReply.proposedActions.some(action => (action.command.type === 'research_products' || action.command.type === 'research_services') && /bed|desk|furniture/.test(action.command.arguments.category)), 'Owning a bed and desk does not request replacements');
  assert(savedMoving.budget.categories.every(category => !/bed|desk|furniture/.test(category.id)));
  assert.deepEqual(await server.get(rome.id), savedRome);
  assert.deepEqual(await server.get(car.id), savedCar);
});

test('TCP Python sorting is out of scope before planner calls and cannot mutate known planning facts', deadline, async t => {
  const server = await serve(t);
  const project = await server.create();
  const before = await server.get(project.id);
  const calls = { create: server.calls.create, assistant: server.calls.assistant };
  const rejected = await server.request('/api/projects', 'POST', { message: 'Teach me sorting in Python.' });
  assert.equal(rejected.status, 422, JSON.stringify(rejected.body));
  assert.equal(ErrorResponseSchema.parse(rejected.body).error.code, 'OUT_OF_SCOPE');
  const response = await server.chat(project.id, 'Explain sorting algorithms in Python.');
  assert.deepEqual(response.proposedActions, []);
  assert.equal(response.workspacePatch, null);
  assert.match(response.reply, /life plans|outside this workspace|life.planning/i);
  assert.equal(server.calls.create, calls.create);
  assert.equal(server.calls.assistant, calls.assistant);
  assert.equal(server.calls.search, 0);
  const after = await server.get(project.id);
  assert.deepEqual(knownFacts(after), knownFacts(before));
  assert.deepEqual(after.actions, before.actions);
  assert.deepEqual(after.questions, before.questions);
  assert.equal(after.conversation?.activeRequest, before.conversation?.activeRequest);
});

test('TCP model failure saves an explicit new budget; storage failure rolls back, and both paths retry without losing facts', deadline, async t => {
  const server = await serve(t);
  const before = await readyTrip(server);
  const message = 'My budget is EUR 1,200. Find cheaper accommodation options in Rome.';
  server.calls.failNextAssistant = true;
  const failed = await server.request(`/api/projects/${before.id}/assistant`, 'POST', { message });
  assert.equal(server.calls.modelFailures, 1, 'The failure fixture must actually execute the decorated planner');
  recoverable(failed, 'AI_UNAVAILABLE');
  const retained = await server.get(before.id);
  assertBudgetKnown(retained, 120_000);
  assertAllocationsPreserved(retained, before);
  assert.deepEqual(retained.preferences, before.preferences);
  assert.deepEqual(retained.cart, before.cart);
  assert.deepEqual(retained.researchResults, before.researchResults);
  assert.deepEqual(retained.workspace, before.workspace);
  assert.deepEqual(retained.tasks, before.tasks);
  assert(retained.confirmedFacts.some(fact => /budget.*1200\.00/i.test(fact)), 'Explicit budget facts must save before the model can fail');
  assert.deepEqual(retained.actions, before.actions);
  const retried = await server.chat(before.id, message);
  assertResearch(retried, ['accommodation']);
  const recovered = await server.get(before.id);
  assertBudgetKnown(recovered, 120_000);
  assertAllocationsPreserved(recovered, before);
  assert.deepEqual(recovered.preferences, before.preferences);
  assert.deepEqual(recovered.cart, before.cart);
  assert.equal(recovered.budget.committedMinor, 20_001);
  const repository = new FailingRepository();
  const storageServer = await serve(t, repository);
  const storageBefore = await readyTrip(storageServer);
  repository.failNextWrite = true;
  const storageMessage = 'My budget is EUR 1,200.';
  const storageFailed = await storageServer.request(`/api/projects/${storageBefore.id}/assistant`, 'POST', { message: storageMessage });
  assert.equal(repository.failures, 1, 'The failure fixture must reach the repository write boundary');
  recoverable(storageFailed, 'STORAGE_ERROR');
  const storageRetained = await storageServer.get(storageBefore.id);
  assert.deepEqual(knownFacts(storageRetained), knownFacts(storageBefore));
  assertBudgetKnown(storageRetained);
  await storageServer.chat(storageBefore.id, storageMessage);
  const storageRecovered = await storageServer.get(storageBefore.id);
  assertBudgetKnown(storageRecovered, 120_000);
  assertAllocationsPreserved(storageRecovered, storageBefore);
  assert.equal(storageRecovered.preferences.startDate, '2027-05-02');
  assert.equal(storageRecovered.preferences.endDate, '2027-05-06');
  assert.equal(storageRecovered.preferences.travelers, 2);
  assert.equal(storageRecovered.location, 'Rome');
  assert.deepEqual(storageRecovered.cart, storageBefore.cart);
  assert.equal(storageRecovered.budget.committedMinor, 20_001);
  assert(!storageRecovered.conversation?.clarifications.some(item => item.field === 'budget' && item.status === 'pending'));
});

test('TCP three repeated fake-planner questions never re-ask a known budget and cap a genuinely unresolved clarification', deadline, async t => {
  const unknownQuestion = 'Which transport option do you prefer?';
  const repeatedReply = `What budget should I plan around? ${unknownQuestion}`;
  const server = await serve(t, new MemoryProjectRepository(), repeatedReply);
  const project = await readyTrip(server);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const reply = await server.chat(project.id, 'Continue the trip plan.');
    assert.doesNotMatch(reply.reply, /what budget should I plan around\?/i);
    assert.deepEqual(reply.proposedActions, []);
    const saved = await server.get(project.id);
    assertBudgetKnown(saved);
    assert.deepEqual(saved.preferences, project.preferences);
    assert.deepEqual(saved.cart, project.cart);
    assert(!saved.conversation?.clarifications.some(item => item.field === 'budget' && item.status === 'pending'));
    assert(!saved.conversation?.turns.some(turn => turn.role === 'assistant' && /what budget should I plan around\?/i.test(turn.content)));
    const unresolved = saved.conversation?.clarifications.filter(item => item.question === unknownQuestion && item.status === 'pending') ?? [];
    assert.equal(unresolved.length, 1, 'Repeated prompts must reuse a single clarification, not append duplicates');
    assert.equal(unresolved[0]!.attempts, attempt);
    if (attempt === 3) assert(!reply.reply.includes(unknownQuestion), 'The third attempt must offer a way forward instead of asking the same question again');
  }
  assert.equal(server.calls.assistant, 3, 'All three fake model replies must pass through the real HTTP response reconciliation');
});
