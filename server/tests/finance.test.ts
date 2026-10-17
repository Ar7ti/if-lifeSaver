import test from 'node:test';
import assert from 'node:assert/strict';
import { BudgetSchema, RiskSchema, SimulationScenarioSchema, type Budget, type CartItem, type LifeProject, type Offer, type ResearchResult } from '../../shared/contracts/index.js';
import { AppError } from '../src/errors.js';
import { allocateBudget, recalculateBudget, simulateScenarios, analyzeRisks } from '../src/finance.js';

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
  assert.match(result.warnings.join(' '), /Delivery cost unknown/);
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
