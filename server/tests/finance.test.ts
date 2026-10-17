import test from 'node:test';
import assert from 'node:assert/strict';
import { BudgetSchema, RiskSchema, SimulationScenarioSchema, type Budget, type CartItem, type LifeProject, type Offer, type ResearchResult } from '../../shared/contracts/index.js';
import { AppError } from '../src/errors.js';
import { allocateBudget, allocateBudgetForPlan, recalculateBudget, simulateScenarios, analyzeRisks } from '../src/finance.js';

const timestamp = '2026-10-17T10:00:00.000Z';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sourceUrl = 'https://example.com/offer';
function budget(totalMinor = 10_000, allocations: Record<string, number> = { furniture: 8_000 }, reserve = 1_000): Budget {
  return recalculateBudget({ ...allocateBudget(totalMinor, true), categories: Object.entries(allocations).map(([id, allocatedMinor]) => ({ id, title: id, allocatedMinor, committedMinor: 0, proposedMinor: 0 })), emergencyReserveMinor: reserve }, []);
}
function cart(overrides: Partial<CartItem> = {}): CartItem {
  return { id: uuid(1), offerId: null, title: 'Existing chair', category: 'furniture', quantity: 1, unitPriceMinor: 1_000, deliveryCostMinor: 0, currency: 'EUR', status: 'selected', sourceUrl, priceStatus: 'verified', addedAt: timestamp, ...overrides };
}
function offer(overrides: Partial<Offer> = {}): Offer {
  return { id: uuid(20), category: 'furniture', kind: 'product', title: 'Source chair', description: 'A source-backed offer', priceMinor: 2_000, currency: 'EUR', priceStatus: 'verified', sourceUrl, sourceName: 'Example', seller: { name: 'Shop', type: 'company', publicProfileUrl: null, verified: true }, imageUrl: null, location: null, delivery: { available: true, costMinor: 100, details: 'Delivery' }, condition: 'new', availability: 'in_stock', lastCheckedAt: timestamp, verificationStatus: 'source_checked', recommendation: '', score: 50, evidence: ['Source checked'], ...overrides };
}
function research(offers: Offer[], overrides: Partial<ResearchResult> = {}): ResearchResult {
  return { id: uuid(40), category: 'furniture', status: 'completed', mode: 'live', offers, warnings: [], searchedAt: timestamp, query: 'chairs', ...overrides };
}
function project(overrides: Partial<LifeProject> = {}): LifeProject {
  return { id: uuid(90), revision: 3, title: 'Move', scenarioType: 'other', location: 'Helsinki', locale: 'en', originalMessage: 'Plan my move', status: 'planning', preferences: { moveDate: null, origin: null, householdSize: 1, deliveryRequired: true, allowUsed: true, priorities: [], notes: '' }, assumptions: [], confirmedFacts: [], questions: [], budget: budget(), cart: [], tasks: [], workspace: { id: uuid(91), version: 1, title: 'Move', widgets: [], updatedAt: timestamp }, researchResults: [], risks: [], scenarios: [], actions: [], recommendations: [], aiMode: 'local', createdAt: timestamp, updatedAt: timestamp, ...overrides };
}

test('allocation preserves every cent, including tiny totals and the maximum contract amount', () => {
  for (const total of [...Array.from({ length: 301 }, (_, n) => n), 99_999_999, 1_000_000_000]) {
    const result = allocateBudget(total);
    BudgetSchema.parse(result);
    assert.equal(result.allocatedMinor + result.emergencyReserveMinor, total);
    assert.equal(result.remainingMinor, total);
    assert.equal(result.availableMinor, total - result.emergencyReserveMinor);
    assert.equal(result.confirmed, false);
    assert.deepEqual(result, allocateBudget(total));
  }
  assert.equal(allocateBudget(1).categories[0]!.allocatedMinor, 1);
  assert.equal(allocateBudget(100, true).confirmed, true);
});

test('invalid money is rejected with AppError without rounding or silently overflowing', () => {
  for (const amount of [-1, 0.1, NaN, Infinity, 1_000_000_001, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => allocateBudget(amount), AppError);
  }
  assert.throws(() => recalculateBudget(budget(), [cart({ unitPriceMinor: -1 })]), AppError);
  assert.throws(() => recalculateBudget(budget(), [cart({ quantity: 0 })]), AppError);
  assert.throws(() => recalculateBudget(budget(), [cart({ quantity: 1.5 })]), AppError);
  assert.throws(() => recalculateBudget(budget(), [cart({ unitPriceMinor: 1_000_000_000, quantity: 100 })]), AppError);
  assert.throws(() => recalculateBudget(budget(), [cart({ unitPriceMinor: 1_000_000_000 }), cart({ id: uuid(2), unitPriceMinor: 1 })]), AppError);
});

test('selected and proposed spending are distinct; quantity multiplies price but delivery is once per line', () => {
  const original = budget(10_001, { furniture: 9_000 }, 1_001);
  const items = [cart({ quantity: 3, unitPriceMinor: 101, deliveryCostMinor: 99 }), cart({ id: uuid(2), status: 'proposed', quantity: 2, unitPriceMinor: 123, deliveryCostMinor: 54 })];
  const originalCopy = structuredClone(original);
  const itemsCopy = structuredClone(items);
  const result = recalculateBudget(original, items);
  assert.equal(result.committedMinor, 402);
  assert.equal(result.proposedMinor, 300);
  assert.equal(result.remainingMinor, 9_599);
  assert.equal(result.availableMinor, 8_298);
  assert.equal(result.categories[0]!.committedMinor, 402);
  assert.equal(result.categories[0]!.proposedMinor, 300);
  assert.deepEqual(original, originalCopy);
  assert.deepEqual(items, itemsCopy);
  const selected = recalculateBudget(result, items.map(item => ({ ...item, status: 'selected' })));
  assert.equal(selected.committedMinor, 702);
  assert.equal(selected.proposedMinor, 0);
  assert.equal(selected.availableMinor, result.availableMinor);
  assert.equal(recalculateBudget(selected, []).committedMinor, 0);
});

test('allocations plus reserve cannot exceed the total and duplicated categories are invalid', () => {
  const original = budget();
  assert.throws(() => recalculateBudget({ ...original, emergencyReserveMinor: 2_001 }, []), (error: unknown) => error instanceof AppError && error.code === 'BUDGET_ALLOCATION_EXCEEDED');
  assert.throws(() => recalculateBudget({ ...original, categories: [...original.categories, original.categories[0]!] }, []), AppError);
  assert.throws(() => recalculateBudget(original, [cart(), cart()]), AppError);
});

test('unknown categories and delivery remain visible; overspending is represented by negative funds', () => {
  const result = recalculateBudget(budget(), [cart({ category: 'transport', deliveryCostMinor: null, unitPriceMinor: 11_000 })]);
  assert.equal(result.categories.find(category => category.id === 'transport')!.committedMinor, 11_000);
  assert.equal(result.allocatedMinor, 8_000);
  assert.equal(result.remainingMinor, -1_000);
  assert.equal(result.availableMinor, -2_000);
  assert.match(result.warnings.join(' '), /Additional line charge unknown/);
  assert.match(result.warnings.join(' '), /exceeds the total/);
  BudgetSchema.parse(result);
});

test('scenarios use real category offers with economy cost and balanced research score preferences', () => {
  const cheap = offer({ id: uuid(20), priceMinor: 1_001, score: 25 });
  const quality = offer({ id: uuid(21), priceMinor: 3_001, score: 90 });
  const state = project({ researchResults: [research([quality, cheap])] });
  const before = structuredClone(state);
  const startedAt = Date.now();
  const scenarios = simulateScenarios(state);
  assert.deepEqual(scenarios.map(scenario => scenario.name), ['Economy', 'Balanced', 'Comfort']);
  assert.deepEqual(scenarios[0]!.selectedOfferIds, [cheap.id]);
  assert.deepEqual(scenarios[1]!.selectedOfferIds, [quality.id]);
  assert.equal(scenarios[0]!.estimatedTotalMinor, 1_101);
  assert.equal(scenarios[0]!.verifiedCostMinor, 1_001);
  assert.equal(scenarios[0]!.estimatedCostMinor, 100);
  assert.equal(scenarios[0]!.remainingMinor, 8_899);
  assert.equal(scenarios[0]!.emergencyReserveMinor, 1_000);
  assert(Date.parse(scenarios[0]!.calculatedAt) >= startedAt);
  assert(Date.parse(scenarios[0]!.calculatedAt) <= Date.now());
  assert.equal(scenarios[0]!.basedOnRevision, 3);
  for (const scenario of scenarios) SimulationScenarioSchema.parse(scenario);
  assert.deepEqual(state, before);
  const costs = (values: ReturnType<typeof simulateScenarios>) => values.map(({ calculatedAt: _calculatedAt, ...scenario }) => scenario);
  assert.deepEqual(costs(scenarios), costs(simulateScenarios(state)));
});

test('cart-covered categories are not bought twice and only selected cart lines are locked', () => {
  const state = project({ budget: budget(10_000, { furniture: 6_000, moving: 2_000 }), cart: [cart({ quantity: 2, unitPriceMinor: 101, deliveryCostMinor: 99, offerId: uuid(20) }), cart({ id: uuid(2), category: 'moving', status: 'proposed', unitPriceMinor: 700, deliveryCostMinor: 0 })], researchResults: [research([offer({ priceMinor: 5_000 })])] });
  for (const scenario of simulateScenarios(state)) {
    assert.equal(scenario.estimatedTotalMinor, 1_001);
    assert.deepEqual(scenario.selectedOfferIds, [uuid(20)]);
    assert.deepEqual(scenario.lockedCartItemIds, [uuid(1)]);
    assert.equal(scenario.missingData.length, 0);
    assert.match(scenario.tradeOffs.join(' '), /Proposed cart item/);
  }
});

test('missing categories use actual allocations explicitly as estimates, with no fake products or reserve spending', () => {
  const state = project({ budget: budget(10_000, { furniture: 3_003, moving: 2_002 }, 2_000) });
  for (const scenario of simulateScenarios(state)) {
    assert.equal(scenario.estimatedTotalMinor, 5_005);
    assert.equal(scenario.verifiedCostMinor, 0);
    assert.equal(scenario.estimatedCostMinor, 5_005);
    assert.equal(scenario.remainingMinor, 4_995);
    assert.equal(scenario.withinBudget, true);
    assert.deepEqual(scenario.selectedOfferIds, []);
    assert.match(scenario.missingData.join(' '), /allocation-based planning estimate of 3003 cents/);
    assert.match(scenario.missingData.join(' '), /not a product or quote/);
  }
});

test('unknown delivery and estimated prices are flagged rather than fabricated', () => {
  const estimated = offer({ priceMinor: 1_003, priceStatus: 'estimated', verificationStatus: 'unverified', sourceUrl: null, delivery: { available: null, costMinor: null, details: '' }, availability: 'unknown' });
  const state = project({ researchResults: [research([estimated])] });
  state.preferences.deliveryRequired = null;
  for (const scenario of simulateScenarios(state)) {
    assert.equal(scenario.estimatedTotalMinor, 1_003);
    assert.equal(scenario.verifiedCostMinor, 0);
    assert.equal(scenario.estimatedCostMinor, 1_003);
    assert.match(scenario.missingData.join(' '), /delivery availability or cost unknown/);
    assert.match(scenario.missingData.join(' '), /availability is unknown/);
    assert.match(scenario.risks.join(' '), /not a source-verified quote/);
    assert.equal(scenario.convenience, 'medium');
  }
  const withCart = simulateScenarios(project({ cart: [cart({ deliveryCostMinor: null })] }))[0]!;
  assert.equal(withCart.estimatedTotalMinor, 1_000);
  assert.match(withCart.missingData.join(' '), /delivery cost unknown/);
});

test('scenario eligibility respects condition, delivery, price availability, stock, demo mode and maximum budget', () => {
  const invalid = [
    offer({ id: uuid(21), condition: 'used', priceMinor: 1 }),
    offer({ id: uuid(22), condition: 'refurbished', priceMinor: 1 }),
    offer({ id: uuid(23), delivery: { available: false, costMinor: 0, details: '' }, priceMinor: 1 }),
    offer({ id: uuid(24), priceMinor: null, priceStatus: 'unknown' }),
    offer({ id: uuid(25), availability: 'out_of_stock', priceMinor: 1 }),
    offer({ id: uuid(26), priceStatus: 'demo', verificationStatus: 'demo', priceMinor: 1 }),
    offer({ id: uuid(27), priceMinor: 20_000 }),
    offer({ id: uuid(28), condition: 'unknown', priceMinor: 1 }),
  ];
  const valid = offer({ priceMinor: 2_000 });
  const state = project({ researchResults: [research([...invalid, valid])] });
  state.preferences.allowUsed = false;
  for (const scenario of simulateScenarios(state)) assert.deepEqual(scenario.selectedOfferIds, [valid.id]);
  state.researchResults = [research([valid], { mode: 'demo' })];
  assert.deepEqual(simulateScenarios(state)[0]!.selectedOfferIds, []);
  state.researchResults = [research([invalid[6]!])];
  assert.deepEqual(simulateScenarios(state)[0]!.selectedOfferIds, []);
  assert.equal(simulateScenarios(state)[0]!.withinBudget, false);
});

test('delivery, used-item permissions and affordability apply to portfolio totals including reserve', () => {
  const pickup = offer({ condition: 'used', delivery: { available: false, costMinor: null, details: 'Pickup only' }, priceMinor: 500 });
  const state = project({ researchResults: [research([pickup])] });
  state.preferences.deliveryRequired = false;
  const scenario = simulateScenarios(state)[0]!;
  assert.deepEqual(scenario.selectedOfferIds, [pickup.id]);
  assert.equal(scenario.estimatedTotalMinor, 500);
  assert.equal(scenario.convenience, 'low');
  assert.match(scenario.risks.join(' '), /pickup or separate transport/);
  const expensive = offer({ priceMinor: 7_000, score: 100 });
  const cheap = offer({ id: uuid(21), priceMinor: 3_000, score: 1 });
  const moving = offer({ id: uuid(22), category: 'moving', kind: 'service', condition: 'not_applicable', priceMinor: 3_000 });
  const portfolio = project({ budget: budget(10_000, { furniture: 4_000, moving: 4_000 }, 2_000), researchResults: [research([expensive, cheap]), research([moving], { id: uuid(41), category: 'moving' })] });
  for (const option of simulateScenarios(portfolio)) {
    assert.deepEqual(option.selectedOfferIds, [cheap.id, moving.id]);
    assert.equal(option.estimatedTotalMinor, 6_200);
    assert.equal(option.withinBudget, true);
  }
});

test('scenario recomputation reflects cart edits, allocations, revision and the latest research snapshot', () => {
  const state = project({ researchResults: [research([offer({ priceMinor: 1_000 })])] });
  assert.equal(simulateScenarios(state)[0]!.estimatedTotalMinor, 1_100);
  state.researchResults.push(research([offer({ priceMinor: 2_000 })], { id: uuid(41), searchedAt: '2026-10-18T10:00:00.000Z' }));
  assert.equal(simulateScenarios(state)[0]!.estimatedTotalMinor, 2_100);
  state.cart = [cart({ unitPriceMinor: 400 })];
  state.revision++;
  assert.equal(simulateScenarios(state)[0]!.estimatedTotalMinor, 400);
  assert.equal(simulateScenarios(state)[0]!.basedOnRevision, 4);
  state.cart = [];
  state.researchResults.push(research([], { id: uuid(42), status: 'unavailable', mode: 'unavailable', searchedAt: '2026-10-19T10:00:00.000Z' }));
  state.budget = budget(10_000, { furniture: 6_001 });
  assert.equal(simulateScenarios(state)[0]!.estimatedTotalMinor, 6_001);
  assert.deepEqual(simulateScenarios(state)[0]!.selectedOfferIds, []);
});

test('risk analysis is evidence-grounded and does not invent seller, transport or contract problems', () => {
  const clean = project({ researchResults: [research([offer()])] });
  assert.deepEqual(analyzeRisks(clean), []);
  clean.cart = [cart({ priceStatus: 'estimated', sourceUrl: null, deliveryCostMinor: null, unitPriceMinor: 11_000 })];
  clean.researchResults = [research([offer({ seller: { name: null, type: 'private', verified: false, publicProfileUrl: null }, delivery: { available: false, costMinor: null, details: '' }, availability: 'unknown' })], { status: 'limited', warnings: ['Only one source found'] })];
  const risks = analyzeRisks(clean);
  assert(risks.some(risk => risk.id === 'budget:overcommitted'));
  assert(risks.some(risk => risk.id === 'budget:reserve-shortfall'));
  assert(risks.some(risk => risk.id === `cart:delivery:${uuid(1)}`));
  assert(risks.some(risk => risk.id === `cart:price:${uuid(1)}`));
  assert(risks.some(risk => risk.category === 'seller'));
  assert(risks.some(risk => risk.category === 'transport'));
  assert(risks.some(risk => risk.evidence.includes('Only one source found')));
  assert(!risks.some(risk => risk.category === 'contract'));
  for (const risk of risks) {
    RiskSchema.parse(risk);
    assert.equal(risk.status, 'open');
    assert(risk.evidence.length > 0);
    assert.doesNotMatch(JSON.stringify(risk), /probability|coverage percentage|\d+%/i);
  }
  assert.deepEqual(risks, analyzeRisks(clean));
});

test('risk IDs stay stable, acknowledgement and resolution survive only unchanged evidence', () => {
  for (const status of ['acknowledged', 'resolved'] as const) {
    const state = project({ cart: [cart({ deliveryCostMinor: null })] });
    const initial = analyzeRisks(state);
    state.risks = initial.map(risk => ({ ...risk, status }));
    assert(analyzeRisks(state).every(risk => risk.status === status));
    state.revision++;
    state.title = 'Renamed';
    assert(analyzeRisks(state).every(risk => risk.status === status));
    state.cart[0]!.quantity = 2;
    const changed = analyzeRisks(state).find(risk => risk.id === `cart:delivery:${uuid(1)}`)!;
    assert.equal(changed.id, initial[0]!.id);
    assert.equal(changed.status, 'open');
    state.cart[0]!.deliveryCostMinor = 0;
    assert(!analyzeRisks(state).some(risk => risk.id === changed.id));
  }
});

test('research risk status is reopened when source evidence changes; obsolete risks disappear', () => {
  const state = project({ researchResults: [research([offer({ priceStatus: 'estimated', verificationStatus: 'unverified' })])] });
  state.risks = analyzeRisks(state).map(risk => ({ ...risk, status: 'acknowledged' }));
  assert.equal(analyzeRisks(state)[0]!.status, 'acknowledged');
  state.researchResults[0]!.offers[0]!.priceMinor = 2_001;
  assert.equal(analyzeRisks(state)[0]!.status, 'open');
  state.researchResults[0]!.offers[0] = offer();
  assert.deepEqual(analyzeRisks(state), []);
});

test('stale research is excluded after constraints change, but selected cart lines remain locked', () => {
  const stale = research([offer({ priceMinor: 101 })], { warnings: ['Project constraints changed after this search; research again before selecting these offers.'] });
  const state = project({ researchResults: [stale] });
  for (const scenario of simulateScenarios(state)) {
    assert.deepEqual(scenario.selectedOfferIds, []);
    assert.equal(scenario.estimatedTotalMinor, 8_000);
    assert.match(scenario.missingData.join(' '), /excluded because project constraints changed/);
  }
  state.cart = [cart({ offerId: uuid(20), unitPriceMinor: 101 })];
  for (const scenario of simulateScenarios(state)) {
    assert.deepEqual(scenario.lockedCartItemIds, [uuid(1)]);
    assert.deepEqual(scenario.selectedOfferIds, [uuid(20)]);
    assert.equal(scenario.estimatedTotalMinor, 101);
    assert.match(scenario.missingData.join(' '), /constraints changed/);
  }
  assert(analyzeRisks(state).some(risk => risk.id === 'research:coverage:furniture'));
});

test('bed aliases spend furniture allocation without adding a second allocation-based furniture purchase', () => {
  for (const category of ['bed', 'beds', 'sofa', 'sofas']) {
    const state = project({ cart: [cart({ category, unitPriceMinor: 601 })] });
    const result = recalculateBudget(state.budget, state.cart);
    assert.equal(result.categories.length, 1);
    assert.equal(result.categories[0]!.id, 'furniture');
    assert.equal(result.categories[0]!.committedMinor, 601);
    for (const scenario of simulateScenarios(state)) assert.equal(scenario.estimatedTotalMinor, 601);
  }
});

test('beds and sofas share furniture funding but remain distinct research purchases', () => {
  const bed = offer({ id: uuid(21), category: 'beds', priceMinor: 2_000 });
  const sofa = offer({ id: uuid(22), category: 'sofas', priceMinor: 3_000 });
  const state = project({ researchResults: [research([bed], { category: 'beds' }), research([sofa], { category: 'sofas', id: uuid(41) })] });
  for (const scenario of simulateScenarios(state)) {
    assert.equal(scenario.estimatedTotalMinor, 5_200);
    assert.deepEqual(scenario.selectedOfferIds, [bed.id, sofa.id]);
    assert.equal(scenario.missingData.length, 0);
  }
  state.cart = [cart({ category: 'bed', unitPriceMinor: 501, offerId: bed.id })];
  for (const scenario of simulateScenarios(state)) {
    assert.equal(scenario.estimatedTotalMinor, 3_601);
    assert.deepEqual(scenario.selectedOfferIds, [bed.id, sofa.id]);
    assert.deepEqual(scenario.lockedCartItemIds, [uuid(1)]);
  }
});

test('missing bed and sofa research shares the existing furniture allocation without duplication', () => {
  const state = project({ budget: budget(10_000, { furniture: 8_001 }), researchResults: [research([], { category: 'beds' }), research([], { category: 'sofas', id: uuid(41) })] });
  for (const scenario of simulateScenarios(state)) {
    assert.equal(scenario.estimatedTotalMinor, 8_001);
    assert.equal(scenario.missingData.length, 2);
    assert.match(scenario.missingData[0]!, /4001 cents/);
    assert.match(scenario.missingData[1]!, /4000 cents/);
  }
  state.cart = [cart({ category: 'beds', unitPriceMinor: 501 })];
  assert.equal(simulateScenarios(state)[0]!.estimatedTotalMinor, 8_001);
});

test('moving risks expose missing date, origin and transport arrangement with real evidence', () => {
  const state = project({ scenarioType: 'moving' });
  const risks = analyzeRisks(state);
  assert.deepEqual(risks.map(risk => risk.id), ['moving:date', 'moving:origin', 'moving:arrangement']);
  for (const risk of risks) {
    RiskSchema.parse(risk);
    assert.match(risk.evidence.join(' '), /moving/);
  }
  state.preferences.moveDate = '2026-11-01';
  state.preferences.origin = 'Espoo';
  state.cart = [cart({ category: 'moving', unitPriceMinor: 1_000 })];
  // The selected arrangement is evidence; research alone would not prove a booking.
  assert(!analyzeRisks(state).some(risk => risk.id.startsWith('moving:')));
});

test('service-term risk requires an actual service offer and tracks its evidence', () => {
  const state = project({ researchResults: [research([offer()])] });
  assert(!analyzeRisks(state).some(risk => risk.category === 'contract'));
  state.researchResults[0]!.offers[0] = offer({ kind: 'service', description: 'Two movers for two hours' });
  const initial = analyzeRisks(state).find(risk => risk.category === 'contract')!;
  assert(initial.evidence.includes('Service description: Two movers for two hours'));
  state.risks = [{ ...initial, status: 'resolved' }];
  assert.equal(analyzeRisks(state).find(risk => risk.id === initial.id)!.status, 'resolved');
  state.researchResults[0]!.offers[0]!.description = 'One mover for one hour';
  assert.equal(analyzeRisks(state).find(risk => risk.id === initial.id)!.status, 'open');
});

test('delivery charges are estimates even when the product price is verified', () => {
  const state = project({ cart: [cart({ quantity: 3, unitPriceMinor: 101, deliveryCostMinor: 99 })] });
  const scenario = simulateScenarios(state)[0]!;
  assert.equal(scenario.verifiedCostMinor, 303);
  assert.equal(scenario.estimatedCostMinor, 99);
  assert.equal(scenario.estimatedTotalMinor, 402);
  assert.match(scenario.tradeOffs.join(' '), /does not separately verify shipping prices/);
});

test('broad furniture searches preserve actual bed and sofa purchase groups', () => {
  const bed = offer({ id: uuid(21), category: 'beds', priceMinor: 2_000 });
  const sofa = offer({ id: uuid(22), category: 'sofas', priceMinor: 3_000 });
  const state = project({ researchResults: [research([bed, sofa])] });
  const scenario = simulateScenarios(state)[0]!;
  assert.equal(scenario.estimatedTotalMinor, 5_200);
  assert.deepEqual(scenario.selectedOfferIds, [bed.id, sofa.id]);
  state.cart = [cart({ category: 'bed', unitPriceMinor: 501, offerId: bed.id })];
  assert.equal(simulateScenarios(state)[0]!.estimatedTotalMinor, 3_601);
});

test('unknown shipping does not turn a verified product price into fabricated shipping verification', () => {
  const state = project({ researchResults: [research([offer({ priceMinor: 1_001, delivery: { available: true, costMinor: null, details: '' } })])] });
  const scenario = simulateScenarios(state)[0]!;
  assert.equal(scenario.verifiedCostMinor, 1_001);
  assert.equal(scenario.estimatedCostMinor, 0);
  assert.equal(scenario.estimatedTotalMinor, 1_001);
  assert.match(scenario.missingData.join(' '), /total excludes any unknown delivery charge/);
});

test('risk evidence is contract-valid and changes beyond 2000 characters reopen service-term review', () => {
  const state = project({ researchResults: [research([offer({ kind: 'service', description: 'a'.repeat(3_000) })], { status: 'limited', warnings: ['', '   '] })] });
  state.risks = analyzeRisks(state).map(risk => ({ ...risk, status: 'resolved' }));
  state.risks.forEach(risk => RiskSchema.parse(risk));
  state.researchResults[0]!.offers[0]!.description += ' changed';
  assert.equal(analyzeRisks(state).find(risk => risk.category === 'contract')!.status, 'open');
});

test('scenario contract overflow is rejected and overcommitted selected lines remain locked', () => {
  const state = project({ cart: [cart({ unitPriceMinor: 11_000 })] });
  const scenario = simulateScenarios(state)[0]!;
  assert.equal(scenario.withinBudget, false);
  assert.equal(scenario.remainingMinor, -1_000);
  assert.deepEqual(scenario.lockedCartItemIds, [uuid(1)]);
  state.cart = [cart({ unitPriceMinor: 1_000_000_000 }), cart({ id: uuid(2), unitPriceMinor: 1, status: 'proposed' })];
  assert.throws(() => simulateScenarios(state), AppError);
});

test('required delivery cannot be satisfied by unknown availability; the exclusion remains explicit', () => {
  const state = project({ researchResults: [research([offer({ delivery: { available: null, costMinor: null, details: '' } })])] });
  for (const scenario of simulateScenarios(state)) {
    assert.deepEqual(scenario.selectedOfferIds, []);
    assert.match(scenario.missingData.join(' '), /delivery availability unknown; excluded because delivery is required/);
    assert.equal(scenario.estimatedCostMinor, 8_000);
  }
});

test('unknown budgets do not claim affordability, and a zero reserve is an evidence-backed gap',()=>{
  const unknown=project({budget:allocateBudget(0,false)});
  for(const scenario of simulateScenarios(unknown)) {
    assert.equal(scenario.withinBudget,false);
    assert.match(scenario.missingData.join(' '),/budget has not been confirmed/);
  }
  const noReserve=project({budget:budget(10000,{furniture:10000},0)});
  const risk=analyzeRisks(noReserve).find(r=>r.id==='budget:no-reserve');
  assert.ok(risk);
  assert.match(risk.evidence.join(' '),/reserve: 0 cents/);
});

test('plan allocations normalize arbitrary weights exactly and apportion cents by largest remainder', () => {
  const definitions = [{ id: 'transport', title: 'Transport', weight: 0.1 }, { id: 'accommodation', title: 'Accommodation', weight: 0.2 }, { id: 'food', title: 'Food', weight: 0.3 }];
  const result = allocateBudgetForPlan(101, definitions, 10, true);
  assert.deepEqual(result.categories.map(category => category.allocatedMinor), [15, 30, 46]);
  assert.equal(result.emergencyReserveMinor, 10);
  assert.equal(result.confirmed, true);
  assert.deepEqual(result, allocateBudgetForPlan(101, definitions.map(category => ({ ...category, weight: category.weight * 10 })), 10, true));
  const before = structuredClone(definitions);
  for (const total of [...Array.from({ length: 101 }, (_, index) => index), 1_000_000_000]) {
    for (const reserve of [0, 0.01, 12.5, 33.33333333333333, 100]) {
      const allocated = allocateBudgetForPlan(total, definitions, reserve);
      BudgetSchema.parse(allocated);
      assert.equal(allocated.allocatedMinor + allocated.emergencyReserveMinor, total);
      assert.equal(allocated.availableMinor, total - allocated.emergencyReserveMinor);
      assert.deepEqual(allocated, allocateBudgetForPlan(total, definitions, reserve));
    }
  }
  assert.deepEqual(definitions, before);
  const tie = allocateBudgetForPlan(1, [{ id: 'first', title: 'First', weight: 1 }, { id: 'second', title: 'Second', weight: 1 }], 0);
  assert.deepEqual(tie.categories.map(category => category.allocatedMinor), [1, 0]);
});

test('plan weights support scientific notation and extreme positive values without monetary overflow', () => {
  const definitions = [{ id: 'large', title: 'Large', weight: Number.MAX_VALUE }, { id: 'small', title: 'Small', weight: Number.MIN_VALUE }];
  const result = allocateBudgetForPlan(1_000_000_000, definitions, 1e-7);
  BudgetSchema.parse(result);
  assert.equal(result.allocatedMinor + result.emergencyReserveMinor, 1_000_000_000);
  assert.equal(result.emergencyReserveMinor, 1);
  assert.equal(result.categories[1]!.allocatedMinor, 0);
  const allReserve = allocateBudgetForPlan(101, definitions, 100);
  assert.equal(allReserve.allocatedMinor, 0);
  assert.equal(allReserve.emergencyReserveMinor, 101);
});

test('plan allocator rejects invalid totals, categories, duplicate IDs, weights and reserve percentages', () => {
  const valid = [{ id: 'travel', title: 'Travel', weight: 1 }];
  for (const total of [-1, 1.01, Infinity, 1_000_000_001]) assert.throws(() => allocateBudgetForPlan(total, valid), AppError);
  for (const weight of [0, -1, NaN, Infinity, -Infinity]) assert.throws(() => allocateBudgetForPlan(100, [{ ...valid[0]!, weight }]), AppError);
  for (const reserve of [-1, 100.01, NaN, Infinity]) assert.throws(() => allocateBudgetForPlan(100, valid, reserve), AppError);
  assert.throws(() => allocateBudgetForPlan(100, []), AppError);
  assert.throws(() => allocateBudgetForPlan(100, [valid[0]!, valid[0]!]), AppError);
  assert.throws(() => allocateBudgetForPlan(100, [{ ...valid[0]!, id: 'Invalid category' }]), AppError);
  assert.throws(() => allocateBudgetForPlan(100, [{ ...valid[0]!, title: '' }]), AppError);
  assert.throws(() => allocateBudgetForPlan(100, Array.from({ length: 21 }, (_, index) => ({ id: `category_${index}`, title: 'Category', weight: 1 }))), AppError);
});

test('travel scenarios use only actual travel allocations and group hotel and flight offers into those envelopes', () => {
  const flight = offer({ id: uuid(21), category: 'flights', kind: 'service', condition: 'not_applicable', priceMinor: 2_000 });
  const hotel = offer({ id: uuid(22), category: 'hotel', kind: 'service', condition: 'not_applicable', priceMinor: 3_000 });
  const state = project({ scenarioType: 'travel', budget: budget(10_000, { transport: 3_000, accommodation: 4_000, food: 1_000 }), researchResults: [research([flight], { category: 'flights' }), research([hotel], { id: uuid(41), category: 'hotel' }), research([offer()], { id: uuid(42) }), research([offer({ id: uuid(23), category: 'moving' })], { id: uuid(43), category: 'moving' })] });
  for (const scenario of simulateScenarios(state)) {
    assert.equal(scenario.estimatedTotalMinor, 6_200);
    assert.deepEqual(scenario.selectedOfferIds, [flight.id, hotel.id]);
    assert.equal(scenario.missingData.length, 1);
    assert.match(scenario.missingData[0]!, /^food: allocation-based planning estimate of 1000 cents/);
    assert.doesNotMatch(scenario.missingData.join(' '), /moving|furniture/);
  }
  state.cart = [cart({ category: 'flights', offerId: flight.id, quantity: 2, unitPriceMinor: 1_001, deliveryCostMinor: 99 })];
  const recalculated = recalculateBudget(state.budget, state.cart);
  assert.equal(recalculated.categories.find(category => category.id === 'transport')!.committedMinor, 2_101);
  assert.equal(recalculated.categories.length, 3);
  assert.equal(simulateScenarios(state)[0]!.estimatedTotalMinor, 6_201);
});

test('travel and car contexts cannot reintroduce legacy moving and furniture planning estimates', () => {
  for (const scenarioType of ['travel', 'car_purchase'] as const) {
    const state = project({ scenarioType, budget: budget(10_000, { moving: 2_000, furniture: 4_000, food: 1_000 }) });
    const scenario = simulateScenarios(state)[0]!;
    assert.equal(scenario.estimatedTotalMinor, 1_000);
    assert.doesNotMatch(scenario.missingData.join(' '), /moving|furniture/);
    // Explicit user choices remain authoritative even when outside the contextual template.
    state.cart = [cart({ category: 'furniture', unitPriceMinor: 601 })];
    assert.equal(simulateScenarios(state)[0]!.estimatedTotalMinor, 1_601);
    assert.deepEqual(simulateScenarios(state)[0]!.lockedCartItemIds, [uuid(1)]);
  }
});

test('moving with owned furniture skips automatic replacement offers and furniture estimates, preserving selected cart choices', () => {
  const state = project({ scenarioType: 'moving', budget: budget(10_000, { furniture: 5_000, moving: 3_000 }), researchResults: [research([offer({ category: 'beds' })], { category: 'beds' })] });
  state.preferences.ownsFurniture = true;
  state.preferences.ownedItems = ['double bed', 'sofa'];
  for (const scenario of simulateScenarios(state)) {
    assert.equal(scenario.estimatedTotalMinor, 3_000);
    assert.deepEqual(scenario.selectedOfferIds, []);
    assert.equal(scenario.missingData.length, 1);
    assert.match(scenario.missingData[0]!, /^moving:/);
    assert.match(scenario.tradeOffs.join(' '), /recorded owned items/);
  }
  state.cart = [cart({ category: 'beds', offerId: uuid(20), unitPriceMinor: 601 })];
  for (const scenario of simulateScenarios(state)) {
    assert.equal(scenario.estimatedTotalMinor, 3_601);
    assert.deepEqual(scenario.lockedCartItemIds, [uuid(1)]);
    assert.deepEqual(scenario.selectedOfferIds, [uuid(20)]);
  }
  assert.equal(state.budget.categories[0]!.allocatedMinor, 5_000);
});

test('specific owned items do not suppress other furniture groups or duplicate their allocation', () => {
  const bed = offer({ id: uuid(21), category: 'beds', priceMinor: 2_000 });
  const sofa = offer({ id: uuid(22), category: 'sofas', priceMinor: 3_000 });
  const state = project({ scenarioType: 'home_furnishing', researchResults: [research([bed, sofa])] });
  state.preferences.ownedItems = ['Double bed'];
  for (const scenario of simulateScenarios(state)) {
    assert.deepEqual(scenario.selectedOfferIds, [sofa.id]);
    assert.equal(scenario.estimatedTotalMinor, 3_100);
    assert.equal(scenario.missingData.length, 0);
  }
  state.researchResults[0]!.offers = [bed];
  assert.equal(simulateScenarios(state)[0]!.estimatedTotalMinor, 0);
  state.preferences.ownedItems = ['bedroom lamp'];
  assert.deepEqual(simulateScenarios(state)[0]!.selectedOfferIds, [bed.id]);
});

test('car scenarios use vehicle and ownership allocations without adding a second vehicle purchase', () => {
  const vehicle = offer({ category: 'cars', priceMinor: 5_000, condition: 'used' });
  const state = project({ scenarioType: 'car_purchase', budget: budget(10_000, { vehicle: 7_000, ownership_costs: 2_000 }), researchResults: [research([vehicle], { category: 'cars' })] });
  for (const scenario of simulateScenarios(state)) {
    assert.equal(scenario.estimatedTotalMinor, 7_100);
    assert.deepEqual(scenario.selectedOfferIds, [vehicle.id]);
    assert.equal(scenario.missingData.length, 1);
    assert.match(scenario.missingData[0]!, /^ownership_costs:/);
    assert.doesNotMatch(scenario.missingData.join(' '), /furniture|moving/);
  }
  state.cart = [cart({ category: 'cars', offerId: vehicle.id, unitPriceMinor: 5_000 })];
  assert.equal(recalculateBudget(state.budget, state.cart).categories.find(category => category.id === 'vehicle')!.committedMinor, 5_000);
  assert.equal(simulateScenarios(state)[0]!.estimatedTotalMinor, 7_000);
});

test('travel risks cite incomplete dates and origin but never invent document requirements or moving issues', () => {
  const state = project({ scenarioType: 'travel', budget: budget(10_000, { transport: 4_000, accommodation: 4_000 }) });
  const risks = analyzeRisks(state);
  assert.deepEqual(risks.map(risk => risk.id), ['travel:dates', 'travel:origin']);
  risks.forEach(risk => RiskSchema.parse(risk));
  state.preferences.startDate = '2026-11-01';
  state.preferences.durationDays = 5;
  state.preferences.origin = 'Helsinki';
  assert.deepEqual(analyzeRisks(state), []);
  state.preferences.endDate = '2026-10-01';
  assert(analyzeRisks(state).some(risk => risk.id === 'travel:date-order'));
});

test('travel document risk requires an actual outstanding task or recorded concern and preserves only unchanged evidence status', () => {
  const state = project({ scenarioType: 'travel' });
  state.tasks = [{ id: uuid(50), title: 'Check passport validity', category: 'documents', status: 'todo', dueDate: null, origin: 'user', notes: 'Before departure' }];
  const documentRisk = analyzeRisks(state).find(risk => risk.id === 'travel:documents')!;
  assert.match(documentRisk.evidence.join(' '), /Check passport validity/);
  assert.doesNotMatch(documentRisk.explanation, /visa is required/);
  state.risks = [{ ...documentRisk, status: 'acknowledged' }];
  assert.equal(analyzeRisks(state).find(risk => risk.id === documentRisk.id)!.status, 'acknowledged');
  state.tasks[0]!.status = 'in_progress';
  assert.equal(analyzeRisks(state).find(risk => risk.id === documentRisk.id)!.status, 'open');
  state.tasks[0]!.status = 'done';
  assert(!analyzeRisks(state).some(risk => risk.id === documentRisk.id));
  state.preferences.notes = 'My passport expired last week.';
  assert.match(analyzeRisks(state).find(risk => risk.id === documentRisk.id)!.evidence.join(' '), /passport expired/);
});

test('car inspection and ownership-cost risks require recorded vehicle evidence and disappear when gaps are addressed', () => {
  const unrelated = project({ scenarioType: 'car_purchase' });
  assert(!analyzeRisks(unrelated).some(risk => risk.id.startsWith('car:') || risk.id.startsWith('moving:')));
  const state = project({ scenarioType: 'car_purchase', budget: budget(10_000, { vehicle: 8_000 }), researchResults: [research([offer({ category: 'cars', condition: 'used' })], { category: 'cars' })] });
  const risks = analyzeRisks(state);
  assert(risks.some(risk => risk.id === 'car:inspection'));
  const ownership = risks.find(risk => risk.id === 'car:ownership-costs')!;
  assert.match(ownership.evidence.join(' '), /vehicle=8000 cents/);
  assert.doesNotMatch(ownership.explanation, /\d+%|probability/);
  risks.forEach(risk => RiskSchema.parse(risk));
  state.tasks = [{ id: uuid(50), title: 'Vehicle inspection review', category: 'inspection', status: 'done', dueDate: null, origin: 'user', notes: '' }];
  state.budget = budget(10_000, { vehicle: 7_000, ownership_costs: 1_000 });
  assert(!analyzeRisks(state).some(risk => risk.id.startsWith('car:')));
  state.tasks = [];
  state.researchResults[0]!.offers[0]!.condition = 'new';
  assert(!analyzeRisks(state).some(risk => risk.id === 'car:inspection'));
});

test('scenario-specific risk prompts never leak into other contextual project types', () => {
  for (const scenarioType of ['home_furnishing', 'student_life', 'other'] as const) {
    const state = project({ scenarioType });
    assert(!analyzeRisks(state).some(risk => /^(moving|travel|car):/.test(risk.id)));
  }
});

test('travel alternatives share their actual budget envelopes instead of buying hotel plus hostel or flight plus rail', () => {
  const hotel = offer({ id: uuid(21), category: 'hotel', kind: 'service', condition: 'not_applicable', priceMinor: 3_000, score: 90 });
  const hostel = offer({ id: uuid(22), category: 'hostels', kind: 'service', condition: 'not_applicable', priceMinor: 2_000, score: 40 });
  const flight = offer({ id: uuid(23), category: 'flights', kind: 'service', condition: 'not_applicable', priceMinor: 2_000, score: 90 });
  const rail = offer({ id: uuid(24), category: 'rail', kind: 'service', condition: 'not_applicable', priceMinor: 1_000, score: 40 });
  const state = project({ scenarioType: 'travel', budget: budget(10_000, { transport: 4_000, accommodation: 4_000 }), researchResults: [research([hotel, hostel], { category: 'accommodation' }), research([flight, rail], { category: 'transport', id: uuid(41) })] });
  const scenarios = simulateScenarios(state);
  assert.deepEqual(scenarios[0]!.selectedOfferIds, [rail.id, hostel.id]);
  assert.equal(scenarios[0]!.estimatedTotalMinor, 3_200);
  assert.deepEqual(scenarios[1]!.selectedOfferIds, [flight.id, hotel.id]);
  assert.equal(scenarios[1]!.estimatedTotalMinor, 5_200);
  state.cart = [cart({ category: 'hotel', offerId: hotel.id, unitPriceMinor: 3_000 })];
  const locked = simulateScenarios(state)[0]!;
  assert.deepEqual(locked.selectedOfferIds, [hotel.id, rail.id]);
  assert.equal(locked.estimatedTotalMinor, 4_100);
});

test('a selected hotel has service fee and quote-term reviews, never a shipping risk or zero invented fees', () => {
  const hotel = offer({ category: 'hotel', kind: 'service', title: 'Recorded Rome hotel', condition: 'not_applicable', priceMinor: 2_001, delivery: { available: false, costMinor: null, details: 'Not a shipped item' } });
  const state = project({ scenarioType: 'travel', budget: budget(10_000, { accommodation: 8_000 }), researchResults: [research([hotel], { category: 'hotel' })], cart: [cart({ offerId: hotel.id, category: 'hotel', title: hotel.title, quantity: 2, unitPriceMinor: 2_001, deliveryCostMinor: null })] });
  state.preferences.startDate = '2027-05-02';
  state.preferences.endDate = '2027-05-06';
  state.preferences.origin = 'Helsinki';
  const before = structuredClone(state);
  const risks = analyzeRisks(state);
  assert(!risks.some(risk => risk.category === 'delivery' || risk.category === 'transport'));
  assert(risks.some(risk => risk.id === `cart:service-fees:${uuid(1)}`));
  assert(risks.some(risk => risk.id === `offer:service-fees:${hotel.id}`));
  assert(risks.some(risk => risk.id === `offer:terms:${hotel.id}`));
  assert.doesNotMatch(JSON.stringify(risks), /delivery|shipping|pickup/i);
  for (const scenario of simulateScenarios(state)) {
    assert.equal(scenario.estimatedTotalMinor, 4_002);
    assert.equal(scenario.verifiedCostMinor, 4_002);
    assert.equal(scenario.estimatedCostMinor, 0);
    assert.deepEqual(scenario.lockedCartItemIds, [uuid(1)]);
    assert.deepEqual(scenario.selectedOfferIds, [hotel.id]);
    assert.match(scenario.missingData.join(' '), /service total fees need confirmation/);
    assert.match(scenario.missingData.join(' '), /exclude any unpriced extras/);
    assert.doesNotMatch([...scenario.missingData, ...scenario.risks, ...scenario.tradeOffs].join(' '), /delivery|shipping|pickup/i);
    SimulationScenarioSchema.parse(scenario);
  }
  const recalculated = recalculateBudget(state.budget, state.cart);
  assert.equal(recalculated.committedMinor, 4_002);
  assert.equal(recalculated.availableMinor, 4_998);
  assert.doesNotMatch(recalculated.warnings.join(' '), /delivery|shipping/i);
  risks.forEach(risk => RiskSchema.parse(risk));
  assert.deepEqual(state, before, 'Null additional charges remain null; no fee or verification is fabricated');
});

test('manual travel service estimates use their service budget group, while a linked physical product overrides that inference', () => {
  for (const category of ['accommodation', 'hotel', 'transport', 'return_flights']) {
    const envelope = ['transport', 'return_flights'].includes(category) ? 'transport' : 'accommodation';
    const state = project({ scenarioType: 'travel', budget: budget(10_000, { [envelope]: 8_000 }), cart: [cart({ category, unitPriceMinor: 1_001, deliveryCostMinor: null, priceStatus: 'estimated', sourceUrl: null })] });
    const risks = analyzeRisks(state);
    const fees = risks.find(risk => risk.id === `cart:service-fees:${uuid(1)}`)!;
    assert(fees);
    assert.match(fees.evidence.join(' '), /Manual line in service budget group/);
    assert(!risks.some(risk => risk.category === 'delivery'));
    const scenario = simulateScenarios(state)[0]!;
    assert.equal(scenario.estimatedTotalMinor, 1_001);
    assert.equal(scenario.verifiedCostMinor, 0);
    assert.equal(scenario.estimatedCostMinor, 1_001);
    assert.doesNotMatch([...scenario.missingData, ...scenario.risks, ...scenario.tradeOffs].join(' '), /delivery|shipping|pickup/i);
  }
  const physical = offer({ category: 'accommodation', kind: 'product', delivery: { available: null, costMinor: null, details: '' } });
  const state = project({ scenarioType: 'travel', budget: budget(10_000, { accommodation: 8_000 }), cart: [cart({ offerId: physical.id, category: 'accommodation', deliveryCostMinor: null })], researchResults: [research([physical], { category: 'accommodation' })] });
  assert(analyzeRisks(state).some(risk => risk.id === `cart:delivery:${uuid(1)}`));
  assert(!analyzeRisks(state).some(risk => risk.id === `cart:service-fees:${uuid(1)}`));
  assert.match(simulateScenarios(state)[0]!.missingData.join(' '), /delivery cost unknown/);
});

test('service kind survives stale or superseded research, even when its cart category is not a known service category', () => {
  const service = offer({ category: 'general', kind: 'service', condition: 'not_applicable', delivery: { available: null, costMinor: null, details: '' } });
  const state = project({ budget: budget(10_000, { general: 8_000 }), cart: [cart({ offerId: service.id, category: 'general', deliveryCostMinor: null })], researchResults: [research([service], { category: 'general', warnings: ['Project constraints changed after this search.'] }), research([], { id: uuid(41), category: 'general', searchedAt: '2027-01-01T00:00:00.000Z' })] });
  const fees = analyzeRisks(state).find(risk => risk.id === `cart:service-fees:${uuid(1)}`)!;
  assert.match(fees.evidence.join(' '), /kind: service/);
  assert(!analyzeRisks(state).some(risk => risk.id === `cart:delivery:${uuid(1)}`));
  assert.equal(simulateScenarios(state)[0]!.estimatedTotalMinor, 1_000);
});

test('service scenario research does not require shipping, and unpriced extras remain explicitly excluded', () => {
  const service = offer({ category: 'hotel', kind: 'service', condition: 'not_applicable', delivery: { available: null, costMinor: null, details: '' } });
  const state = project({ scenarioType: 'travel', budget: budget(10_000, { accommodation: 8_000 }), researchResults: [research([service], { category: 'hotel' })] });
  // Physical-product delivery requirements must not exclude a hotel quote.
  state.preferences.deliveryRequired = true;
  for (const scenario of simulateScenarios(state)) {
    assert.deepEqual(scenario.selectedOfferIds, [service.id]);
    assert.equal(scenario.estimatedTotalMinor, 2_000);
    assert.equal(scenario.verifiedCostMinor, 2_000);
    assert.equal(scenario.estimatedCostMinor, 0);
    assert.match(scenario.missingData.join(' '), /taxes and additional fees/);
    assert.doesNotMatch([...scenario.missingData, ...scenario.risks, ...scenario.tradeOffs].join(' '), /delivery|shipping|pickup/i);
  }
});

test('known extra service charges remain estimated and are charged once per selected line', () => {
  const service = offer({ category: 'hotel', kind: 'service', condition: 'not_applicable' });
  const state = project({ scenarioType: 'travel', budget: budget(10_000, { accommodation: 8_000 }), cart: [cart({ offerId: service.id, category: 'hotel', quantity: 2, unitPriceMinor: 101, deliveryCostMinor: 99 })], researchResults: [research([service], { category: 'hotel' })] });
  const scenario = simulateScenarios(state)[0]!;
  assert.equal(scenario.estimatedTotalMinor, 301);
  assert.equal(scenario.verifiedCostMinor, 202);
  assert.equal(scenario.estimatedCostMinor, 99);
  assert.match(scenario.tradeOffs.join(' '), /additional service charges are estimates/);
  assert.doesNotMatch(scenario.tradeOffs.join(' '), /shipping|delivery/i);
});

test('moving services retain quote scope and cancellation review without an irrelevant shipping request', () => {
  const moving = offer({ category: 'moving_company', kind: 'service', condition: 'not_applicable', title: 'Recorded moving company', description: 'Transport and labor for the recorded inventory.', delivery: { available: false, costMinor: null, details: '' } });
  const state = project({ scenarioType: 'moving', budget: budget(10_000, { moving: 8_000 }), cart: [cart({ offerId: moving.id, category: 'moving_company', deliveryCostMinor: null })], researchResults: [research([moving], { category: 'moving_company' })] });
  const risks = analyzeRisks(state);
  assert(!risks.some(risk => risk.id === 'moving:arrangement'));
  assert(!risks.some(risk => risk.category === 'delivery'));
  const terms = risks.find(risk => risk.id === `offer:terms:${moving.id}`)!;
  assert.match(terms.evidence.join(' '), /Transport and labor/);
  assert.match(terms.preventiveAction, /scope, inclusions, payment and cancellation/);
  assert.equal(simulateScenarios(state)[0]!.estimatedTotalMinor, 1_000);
});

test('service fee review statuses survive unchanged evidence and reopen when cart amounts change', () => {
  const state = project({ scenarioType: 'travel', budget: budget(10_000, { accommodation: 8_000 }), cart: [cart({ category: 'hotel', deliveryCostMinor: null })] });
  const initial = analyzeRisks(state).find(risk => risk.id === `cart:service-fees:${uuid(1)}`)!;
  state.risks = [{ ...initial, status: 'resolved' }];
  assert.equal(analyzeRisks(state).find(risk => risk.id === initial.id)!.status, 'resolved');
  state.cart[0]!.quantity = 2;
  assert.equal(analyzeRisks(state).find(risk => risk.id === initial.id)!.status, 'open');
});

test('selected descriptive search slugs spend their financial envelope without buying the allocation again', () => {
  for (const [category, parent, scenarioType] of [
    ['bed_frame', 'furniture', 'home_furnishing'],
    ['reliable_used_car', 'vehicle', 'car_purchase'],
    ['return_flights', 'transport', 'travel'],
    ['moving_company', 'moving', 'moving'],
  ] as const) {
    const state = project({ scenarioType, budget: budget(10_000, { [parent]: 8_000 }), cart: [cart({ category, quantity: 2, unitPriceMinor: 101, deliveryCostMinor: 99 })] });
    const calculated = recalculateBudget(state.budget, state.cart);
    assert.equal(calculated.categories.length, 1, category);
    assert.equal(calculated.categories[0]!.id, parent);
    assert.equal(calculated.categories[0]!.committedMinor, 301);
    for (const scenario of simulateScenarios(state)) {
      assert.equal(scenario.estimatedTotalMinor, 301, category);
      assert.deepEqual(scenario.lockedCartItemIds, [uuid(1)]);
      assert(!scenario.missingData.some(data => data.startsWith(`${parent}:`)));
    }
  }
});

test('descriptive bed and sofa groups remain separate, and furniture delivery spends only its service envelope', () => {
  const bed = offer({ id: uuid(21), category: 'bed_frame', priceMinor: 2_000 });
  const sofa = offer({ id: uuid(22), category: 'compact_sofa', priceMinor: 3_000 });
  const state = project({ scenarioType: 'home_furnishing', researchResults: [research([bed, sofa])], cart: [cart({ category: 'bed_frame', offerId: bed.id, unitPriceMinor: 501 })] });
  const scenario = simulateScenarios(state)[0]!;
  assert.deepEqual(scenario.selectedOfferIds, [bed.id, sofa.id]);
  assert.equal(scenario.estimatedTotalMinor, 3_601);
  const delivery = project({ scenarioType: 'home_furnishing', budget: budget(10_000, { furniture: 6_000, delivery: 2_000 }), cart: [cart({ category: 'furniture_delivery', unitPriceMinor: 601 })] });
  const calculated = recalculateBudget(delivery.budget, delivery.cart);
  assert.equal(calculated.categories.find(category => category.id === 'delivery')!.committedMinor, 601);
  assert.equal(calculated.categories.find(category => category.id === 'furniture')!.committedMinor, 0);
  assert.equal(simulateScenarios(delivery)[0]!.estimatedTotalMinor, 6_601);
});

test('toy cars and accessories do not consume a real vehicle or furniture purchase allocation', () => {
  for (const category of ['toy_car', 'car_parts', 'car_floor_mats', 'vehicle_rental']) {
    const state = project({ scenarioType: 'car_purchase', budget: budget(10_000, { vehicle: 8_000 }), cart: [cart({ category, unitPriceMinor: 101 })] });
    const calculated = recalculateBudget(state.budget, state.cart);
    assert.equal(calculated.categories.find(category => category.id === 'vehicle')!.committedMinor, 0, category);
    assert.equal(calculated.categories.find(item => item.id === category)!.committedMinor, 101);
    assert.equal(simulateScenarios(state)[0]!.estimatedTotalMinor, 8_101);
  }
  const linen = project({ budget: budget(), cart: [cart({ category: 'bed_linen', unitPriceMinor: 101 })] });
  assert.equal(recalculateBudget(linen.budget, linen.cart).categories.find(category => category.id === 'furniture')!.committedMinor, 0);
});
