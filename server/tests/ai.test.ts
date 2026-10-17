import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {AgentCommandSchema, WidgetTypeSchema, type LifeProject} from '../../shared/contracts/index.js';
import {createPlanner, createPlannerWithClient, ProjectBlueprintSchema} from '../src/ai.js';
import {AppError} from '../src/errors.js';

const options = {mode: 'local' as const, model: 'unused', timeoutMs: 1000};
const input = {message: 'I am moving to Turku next month with a budget of €2,000', locale: 'en' as const};

function project(): LifeProject {
  const widgetId = randomUUID();
  return {
    title: 'Move to Turku', scenarioType: 'moving', location: 'Turku, Finland', locale: 'en',
    preferences: {moveDate: null, origin: null, householdSize: null, deliveryRequired: null, allowUsed: null, priorities: [], notes: ''},
    budget: {totalMinor: 200000, categories: [{id: 'moving', title: 'Moving', allocatedMinor: 0, committedMinor: 0, proposedMinor: 0}]},
    workspace: {widgets: [{id: widgetId, type: 'budget', title: 'Budget', visible: true}]},
    tasks: [], cart: [], researchResults: [],
  } as unknown as LifeProject;
}

function proposal(type: string, patch: Record<string, unknown> = {}) {
  return {type, category: null, maxPrice: null, offerId: null, quantity: null, language: null,
    tasks: [], allocation: null, widgetId: null, visible: null, ...patch};
}

test('local extraction preserves unknowns and never invents verified facts', async () => {
  const plan = await createPlanner(options).createProject(input);
  assert.equal(ProjectBlueprintSchema.safeParse(plan).success, true);
  assert.equal(plan.scenarioType, 'moving');
  assert.equal(plan.location, 'Turku, Finland');
  assert.equal(plan.budgetMinor, 200000);
  assert.equal(plan.preferences.moveDate, null);
  assert.ok(plan.questions.some(q => /exact move date/i.test(q)));
  assert.ok(plan.assumptions.some(a => /Finland/.test(a)));
  assert.ok(plan.confirmedFacts.every(f => !/verified|offer|price/i.test(f)));
  assert.equal(plan.allocation, null);
  assert.ok(plan.widgetTypes.includes('service_finder'));
  assert.ok(plan.widgetTypes.includes('shopping_cart'));
  assert.ok(plan.widgetTypes.length < WidgetTypeSchema.options.length);
});

test('moving request with a euro amount needs no literal budget keyword',async()=>{
  for(const message of ["I'm moving to Turku next month with €2,000.",'Moving to Turku with 2000 euros.']) {
    const plan=await createPlanner(options).createProject({message,locale:'en'});
    assert.equal(plan.budgetMinor,200000);
    assert.equal(plan.location,'Turku, Finland');
  }
});

test('local extraction asks for missing budget and makes a general plan for other intent', async () => {
  const plan = await createPlanner(options).createProject({message: 'Plan a graduation party', locale: 'en'});
  assert.equal(plan.scenarioType, 'other');
  assert.equal(plan.location, null);
  assert.equal(plan.budgetMinor, null);
  assert.ok(plan.questions.some(q => /budget/i.test(q)));
  assert.ok(plan.tasks.length > 0);
  assert.equal(plan.aiMode, 'local');
  const pricedItem = await createPlanner(options).createProject({message: 'I am moving and saw a bed for €250', locale: 'en'});
  assert.equal(pricedItem.budgetMinor, null);
});

test('local budget and preferences preserve cents, uncertainty, and explicit requirements', async () => {
  const plan = await createPlanner(options).createProject({
    message: 'I am moving to Turku next month with a budget of €2,000.50. Delivery required. New only.', locale: 'en',
  });
  assert.equal(plan.budgetMinor, 200050);
  assert.equal(plan.preferences.deliveryRequired, true);
  assert.equal(plan.preferences.allowUsed, false);
  assert.equal(plan.preferences.moveDate, null);
  assert.match(plan.preferences.notes, /next month/i);
  assert.ok(plan.questions.some(question => /exact move date/i.test(question)));
  const used = await createPlanner(options).createProject({message: 'Moving next month. Used is okay and pickup is fine.', locale: 'en'});
  assert.equal(used.preferences.allowUsed, true);
  assert.equal(used.preferences.deliveryRequired, false);
});

test('local assistant proposes validated bounded actions without mutating project', async () => {
  const source = project();
  const before = structuredClone(source);
  const result = await createPlanner(options).assistant(source, {message: 'Find a cheaper bed, compare scenarios, identify risks, and show Budget', context: {activeCategory: 'bed'}});
  assert.ok(result.commands.length > 0 && result.commands.length <= 5);
  assert.ok(result.commands.every(c => AgentCommandSchema.safeParse(c).success));
  assert.ok(result.commands.some(c => c.type === 'research_products' && c.arguments.category === 'bed'));
  assert.ok(result.commands.some(c => c.type === 'compare_scenarios'));
  assert.ok(result.commands.some(c => c.type === 'identify_risks'));
  assert.ok(result.commands.some(c => c.type === 'update_workspace'));
  assert.deepEqual(source, before);
  assert.match(result.reply, /No research, purchase, or message has been completed/);
});

test('local assistant proposes moving service research and reviewable allocation', async () => {
  const result = await createPlanner(options).assistant(project(), {message: 'Research moving services and split the budget'});
  assert.ok(result.commands.some(c => c.type === 'research_services'));
  assert.ok(result.commands.some(c => c.type === 'propose_budget_allocation'));
  assert.ok(result.commands.every(c => AgentCommandSchema.safeParse(c).success));
});

test('cheaper bed research uses the cheapest matching recorded price minus one cent', async () => {
  const source = project();
  source.cart = [{title: 'Bed frame', category: 'furniture', unitPriceMinor: 15000} as LifeProject['cart'][number]];
  source.researchResults = [{offers: [
    {title: 'Mattress and bed', category: 'furniture', priceMinor: 13000} as LifeProject['researchResults'][number]['offers'][number],
    {title: 'Lamp', category: 'furniture', priceMinor: 500} as LifeProject['researchResults'][number]['offers'][number],
  ]} as LifeProject['researchResults'][number]];
  const result = await createPlanner(options).assistant(source, {message: 'Find a cheaper bed', context: {activeCategory: 'furniture'}});
  const command = result.commands.find(c => c.type === 'research_products');
  assert.equal(command?.arguments.category, 'bed');
  assert.equal(command?.arguments.maxPrice, 129.99);
  assert.match(result.explanations[0] ?? '', /one cent below/i);
});

test('cheaper product research falls back to allocation, then explains an absent ceiling', async () => {
  const source = project();
  source.budget.categories = [{id: 'furniture', title: 'Furniture', allocatedMinor: 50001, committedMinor: 0, proposedMinor: 0}];
  const allocated = await createPlanner(options).assistant(source, {message: 'Find a cheaper bed', context: {activeCategory: 'furniture'}});
  assert.equal(allocated.commands.find(c => c.type === 'research_products')?.arguments.maxPrice, 500.01);
  source.budget.categories = [];
  const unknown = await createPlanner(options).assistant(source, {message: 'Find a cheaper bed'});
  const command = unknown.commands.find(c => c.type === 'research_products');
  assert.ok(command && !('maxPrice' in command.arguments));
  assert.match(unknown.explanations[0] ?? '', /no price ceiling/i);
});

test('plural bed categories still use selected prices for a cheaper search', async () => {
  const source = project();
  source.cart = [{title:'Fictional demo beds option',category:'beds',unitPriceMinor:12500} as LifeProject['cart'][number]];
  const result = await createPlanner(options).assistant(source,{message:'Find cheaper beds',context:{activeCategory:'furniture'}});
  const command=result.commands.find(c=>c.type==='research_products');
  assert.equal(command?.arguments.category,'bed');
  assert.equal(command?.arguments.maxPrice,124.99);
});

test('local assistant resolves cheaper options from active category, selected item, then travel default', async () => {
  const source=project();
  source.scenarioType='travel'; source.location='Paris';
  source.budget.categories=[{id:'accommodation',title:'Accommodation',allocatedMinor:50000,committedMinor:0,proposedMinor:0}];
  const defaultResult=await createPlanner(options).assistant(source,{message:'Find cheaper options'});
  assert.equal(defaultResult.commands.find(c=>c.type==='research_services')?.arguments.category,'accommodation');
  source.cart=[{title:'Train',category:'transport',status:'selected',unitPriceMinor:10000} as LifeProject['cart'][number]];
  const selected=await createPlanner(options).assistant(source,{message:'Find cheaper options'});
  assert.equal(selected.commands.find(c=>c.type==='research_services')?.arguments.category,'transport');
  const active=await createPlanner(options).assistant(source,{message:'Find cheaper options',context:{activeCategory:'accommodation'}});
  assert.equal(active.commands.find(c=>c.type==='research_services')?.arguments.category,'accommodation');
});

test('car followup researches vehicles and never defaults to moving', async () => {
  const source=project(); source.scenarioType='car_purchase'; source.originalMessage='I want to buy a car'; source.budget.categories=[];
  const result=await createPlanner(options).assistant(source,{message:'Find cheaper options and split the budget'});
  assert.equal(result.commands.find(c=>c.type==='research_products')?.arguments.category,'vehicle');
  const allocation=result.commands.find(c=>c.type==='propose_budget_allocation');
  assert.ok(allocation && allocation.arguments.categories.every(c=>!['moving','furniture'].includes(c.id)));
});

test('OpenAI project uses Responses parse with strict format and grounds unknown budget/date', async () => {
  const local = await createPlanner(options).createProject({message: 'I am moving next month', locale: 'en'});
  const calls: unknown[] = [];
  const planner = createPlannerWithClient({mode: 'openai', model: 'test-model', timeoutMs: 1000}, async (body) => {
    calls.push(body);
    return {status: 'completed', output: [], output_parsed: {...local, budgetMinor: 123456, preferences: {...local.preferences, moveDate: '2027-04-01'}, confirmedFacts: ['Invented fact'], aiMode: 'openai'}};
  });
  const plan = await planner.createProject({message: 'I am moving next month', locale: 'en'});
  assert.equal(plan.budgetMinor, null);
  assert.equal(plan.preferences.moveDate, null);
  assert.deepEqual(plan.confirmedFacts, []);
  assert.equal(plan.aiMode, 'openai');
  const body = calls[0] as {model: string; store: boolean; input: Array<{role: string}>; text: {format: {type: string; strict: boolean}}};
  assert.equal(body.model, 'test-model');
  assert.equal(body.store, false);
  assert.deepEqual(body.input.map(i => i.role), ['system', 'user']);
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
});

test('OpenAI preserves a stated euro word budget but not unstated or non-EUR budgets', async () => {
  const local = await createPlanner(options).createProject({message: 'Moving next month', locale: 'en'});
  const planner = createPlannerWithClient({mode: 'openai', model: 'test', timeoutMs: 1000}, async () => ({
    status: 'completed', output: [], output_parsed: {...local, budgetMinor: 200000, aiMode: 'openai'},
  }));
  const wordBudget = await planner.createProject({message: 'I am moving next month with a budget of two thousand euros', locale: 'en'});
  assert.equal(wordBudget.budgetMinor, 200000);
  assert.ok(wordBudget.confirmedFacts.some(fact => /€2000\.00/.test(fact)));
  assert.ok(!wordBudget.questions.some(question => /budget/i.test(question)));
  const unknown = await planner.createProject({message: 'I am moving next month', locale: 'en'});
  assert.equal(unknown.budgetMinor, null);
  const dollar = await planner.createProject({message: 'I am moving next month with a budget of $2,000', locale: 'en'});
  assert.equal(dollar.budgetMinor, null);
  assert.ok(dollar.questions.some(question => /in euros|EUR/i.test(question)));
});

test('OpenAI enriches grounded travel title and tasks while rejecting moving content', async () => {
  const message='Plan a five day stay in Rome with a budget of €900';
  const local=await createPlanner(options).createProject({message,locale:'en'});
  assert.equal(local.scenarioType,'other');
  const planner=createPlannerWithClient({mode:'openai',model:'test',timeoutMs:1000},async()=>({
    status:'completed',output:[],output_parsed:{...local,scenarioType:'travel',location:'Rome',title:'Five day stay in Rome',
      tasks:[
        {title:'Compare Rome accommodation cancellation terms',category:'accommodation',dueDate:null,notes:''},
        {title:'Book moving services',category:'moving',dueDate:null,notes:''},
        {title:'Buy a bed for Rome',category:'accommodation',dueDate:null,notes:''},
      ],
      recommendations:['Compare Rome accommodation cancellation terms.','Book moving services.'],aiMode:'openai'},
  }));
  const plan=await planner.createProject({message,locale:'en'});
  assert.equal(plan.scenarioType,'travel');
  assert.equal(plan.location,'Rome');
  assert.equal(plan.title,'Five day stay in Rome');
  assert.ok(plan.tasks.some(t=>/cancellation terms/i.test(t.title)));
  assert.ok(!plan.tasks.some(t=>/moving|bed/i.test(t.title)));
  assert.ok(plan.recommendations.some(r=>/cancellation terms/i.test(r)));
  assert.ok(!plan.recommendations.some(r=>/moving services/i.test(r)));
  assert.ok(!plan.widgetTypes.includes('product_catalog'));
});

test('OpenAI rejects unsupported scenario, location, dates, and hard boolean guesses', async () => {
  const message='Plan a graduation party';
  const local=await createPlanner(options).createProject({message,locale:'en'});
  const planner=createPlannerWithClient({mode:'openai',model:'test',timeoutMs:1000},async()=>({status:'completed',output:[],output_parsed:{
    ...local,scenarioType:'travel',location:'Paris',preferences:{...local.preferences,startDate:'2027-07-01',travelers:4,allowUsed:false,deliveryRequired:true},
    title:'Paris travel plan',tasks:[{title:'Book a Paris hotel',category:'accommodation',dueDate:null,notes:''}],aiMode:'openai',
  }}));
  const plan=await planner.createProject({message,locale:'en'});
  assert.equal(plan.scenarioType,'other'); assert.equal(plan.location,null);
  assert.equal(plan.preferences.startDate,null); assert.equal(plan.preferences.travelers,null);
  assert.equal(plan.preferences.allowUsed,null); assert.equal(plan.preferences.deliveryRequired,null);
  assert.ok(!plan.tasks.some(t=>/hotel/i.test(t.title)));
});

test('OpenAI assistant drops invalid, unknown, and ungrounded commands', async () => {
  const planner = createPlannerWithClient({mode: 'openai', model: 'test', timeoutMs: 1000}, async () => ({
    status: 'completed', output: [], output_parsed: {
      reply: 'These are proposals for review.', explanations: ['bad price', 'unknown widget', 'valid comparison', 'missing offer'],
      proposals: [
        proposal('research_products', {category: 'bed', maxPrice: -1}),
        proposal('update_workspace', {widgetId: randomUUID(), visible: false}),
        proposal('compare_scenarios'),
        proposal('propose_cart_item', {offerId: randomUUID(), quantity: 1}),
      ],
    },
  }));
  const result = await planner.assistant(project(), {message: 'Compare options'});
  assert.deepEqual(result.commands.map(c => c.type), ['compare_scenarios']);
  assert.deepEqual(result.explanations, ['valid comparison']);
});

test('model guesses never turn unknown delivery and used-item preferences into hard filters',async()=>{
  const local=await createPlanner(options).createProject(input);
  const planner=createPlannerWithClient({mode:'openai',model:'test',timeoutMs:1000},async()=>({
    status:'completed',output:[],output_parsed:{...local,preferences:{...local.preferences,deliveryRequired:true,allowUsed:false},aiMode:'openai'},
  }));
  const unknown=await planner.createProject(input);
  assert.equal(unknown.preferences.deliveryRequired,null);
  assert.equal(unknown.preferences.allowUsed,null);
  assert.ok(unknown.questions.length <= 3);
  assert.ok(unknown.questions.every(q=>!/already answered/i.test(q)));
  const explicit=await planner.createProject({...input,message:input.message+'. Delivery required. New only.'});
  assert.equal(explicit.preferences.deliveryRequired,true);
  assert.equal(explicit.preferences.allowUsed,false);
  const noDelivery=await planner.createProject({...input,message:input.message+". I don't need delivery. Used is okay."});
  assert.equal(noDelivery.preferences.deliveryRequired,false);
  assert.equal(noDelivery.preferences.allowUsed,true);
});

test('OpenAI assistant replaces unsupported completion claims', async () => {
  const planner = createPlannerWithClient({mode: 'openai', model: 'test', timeoutMs: 1000}, async () => ({
    status: 'completed', output: [], output_parsed: {
      reply: 'I purchased a bed for you.', explanations: ['I contacted the seller.'],
      proposals: [proposal('identify_risks')],
    },
  }));
  const result = await planner.assistant(project(), {message: 'What are the risks?'});
  assert.equal(result.commands[0]?.type, 'identify_risks');
  assert.doesNotMatch(result.reply, /purchased a bed/i);
  assert.doesNotMatch(result.explanations[0] ?? '', /contacted the seller/i);
});

test('OpenAI refusal, incomplete output, and timeout become AppError', async () => {
  const request = {message: 'Plan a move', locale: 'en' as const};
  const cases = [
    {response: {status: 'completed', output: [{content: [{type: 'refusal', refusal: 'No'}]}], output_parsed: null}, code: 'AI_REFUSAL'},
    {response: {status: 'incomplete', output: [], output_parsed: null}, code: 'AI_INCOMPLETE'},
    {response: {status: 'completed', output: [], output_parsed: {wrong: true}}, code: 'AI_INVALID_RESPONSE'},
  ];
  for (const item of cases) {
    const planner = createPlannerWithClient({mode: 'openai', model: 'test', timeoutMs: 1000}, async () => item.response);
    await assert.rejects(planner.createProject(request), (error: unknown) => error instanceof AppError && error.code === item.code);
  }
  let signal: AbortSignal | undefined;
  const planner = createPlannerWithClient({mode: 'openai', model: 'test', timeoutMs: 10}, async (_, options) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  await assert.rejects(planner.createProject(request), (error: unknown) => error instanceof AppError && error.code === 'AI_TIMEOUT');
  assert.equal(signal?.aborted, true);
});

test('course research remains an education service, while furniture searches propose products',async()=>{
 const source=project();
 source.scenarioType='student_life';source.originalMessage='Find a programming course within my education budget';
 const course=await createPlanner(options).assistant(source,{message:'Find a programming course'});
 assert.ok(course.commands.some(c=>c.type==='research_services'&&c.arguments.category==='education'));
 source.scenarioType='home_furnishing';
 const furniture=await createPlanner(options).assistant(source,{message:'Find furniture'});
 assert.ok(furniture.commands.some(c=>c.type==='research_products'&&c.arguments.category==='furniture'));
});

test('model enrichment cannot introduce furniture buying into a move with owned furniture',async()=>{
 const request={message:'I am moving to Turku with €2000 and already own furniture.',locale:'en' as const};
 const local=await createPlanner(options).createProject(request);
 const planner=createPlannerWithClient({mode:'openai',model:'test',timeoutMs:1000},async()=>({status:'completed',output:[],output_parsed:{...local,tasks:[{title:'Buy furniture for Turku',category:'moving',dueDate:null,notes:''}],recommendations:['Compare furniture for Turku.'],aiMode:'openai'}}));
 const result=await planner.createProject(request);assert.ok(!result.tasks.some(t=>/buy furniture/i.test(t.title)));assert.ok(!result.recommendations.some(r=>/compare furniture/i.test(r)));
});
