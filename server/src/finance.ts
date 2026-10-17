import { BudgetSchema, CartItemSchema, MinorSchema, type Budget, type CartItem, type LifeProject, type Offer, type Risk, type SimulationScenario } from '../../shared/contracts/index.js';
import { AppError } from './errors.js';

const MAX_MINOR = MinorSchema.maxValue!;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const unique = (values: string[]) => [...new Set(values)];
const label = (value: string) => value.slice(0, 160);
const furnitureGroups: Record<string, string> = {
  bed: 'bed', beds: 'bed', mattress: 'mattress', mattresses: 'mattress',
  sofa: 'sofa', sofas: 'sofa', couch: 'sofa', couches: 'sofa',
  chair: 'chair', chairs: 'chair', table: 'table', tables: 'table',
  desk: 'desk', desks: 'desk', wardrobe: 'wardrobe', wardrobes: 'wardrobe',
};
const purchaseGroup = (category: string) => Object.hasOwn(furnitureGroups, category) ? furnitureGroups[category]! : category;
function envelope(category: string, budget: Budget): string {
  if (budget.categories.some(item => item.id === category)) return category;
  const alias = budget.categories.find(item => purchaseGroup(item.id) === purchaseGroup(category));
  if (alias) return alias.id;
  if (Object.hasOwn(furnitureGroups, category) && budget.categories.some(item => item.id === 'furniture')) return 'furniture';
  return category;
}
const isStale = (result: LifeProject['researchResults'][number]) => result.warnings.some(warning => warning.startsWith('Project constraints changed'));

function money(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MINOR) {
    throw new AppError('INVALID_MONEY', `${field} must be integer cents between 0 and ${MAX_MINOR}`);
  }
  return value;
}

function sum(values: number[], field: string): number {
  return money(values.reduce((total, value) => total + money(value, field), 0), field);
}

function cartTotal(item: CartItem): number {
  // Delivery is a charge for the line, not for each unit.
  return sum([money(item.unitPriceMinor * item.quantity, 'Cart line subtotal'), item.deliveryCostMinor ?? 0], 'Cart line total');
}

/** Default planning allocations; largest remainders keep every cent accounted for. */
export function allocateBudget(totalMinor: number, confirmed = false): Budget {
  money(totalMinor, 'Budget total');
  if (typeof confirmed !== 'boolean') throw new AppError('INVALID_BUDGET', 'confirmed must be a boolean');
  const weights = [35, 20, 15, 10, 10, 10];
  const amounts = weights.map(weight => Math.floor(totalMinor * weight / 100));
  const order = weights.map((weight, index) => ({ index, remainder: totalMinor * weight % 100 }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const remainder = totalMinor - amounts.reduce((a, b) => a + b, 0);
  for (let index = 0; index < remainder; index++) amounts[order[index]!.index]!++;
  const definitions = [['furniture', 'Furniture'], ['appliances', 'Appliances'], ['moving', 'Moving'], ['essentials', 'Essentials'], ['services', 'Services']] as const;
  return recalculateBudget({
    totalMinor, currency: 'EUR', confirmed,
    categories: definitions.map(([id, title], index) => ({ id, title, allocatedMinor: amounts[index]!, committedMinor: 0, proposedMinor: 0 })),
    emergencyReserveMinor: amounts[5]!, allocatedMinor: 0, committedMinor: 0, proposedMinor: 0,
    remainingMinor: totalMinor, availableMinor: totalMinor, warnings: [],
  }, []);
}

/** Allocations are envelopes; only selected cart lines commit money. */
export function recalculateBudget(budget: Budget, cart: CartItem[]): Budget {
  const parsed = BudgetSchema.safeParse(budget);
  const parsedCart = CartItemSchema.array().max(100).safeParse(cart);
  if (!parsed.success || !parsedCart.success) throw new AppError('INVALID_BUDGET', 'Budget and cart must satisfy the finance contract');
  const categories = parsed.data.categories.map(category => ({ ...category, committedMinor: 0, proposedMinor: 0 }));
  if (new Set(categories.map(category => category.id)).size !== categories.length) throw new AppError('INVALID_BUDGET', 'Budget category IDs must be unique');
  if (new Set(cart.map(item => item.id)).size !== cart.length) throw new AppError('INVALID_BUDGET', 'Cart item IDs must be unique');
  const allocatedMinor = sum(categories.map(category => category.allocatedMinor), 'Allocated budget');
  if (allocatedMinor + budget.emergencyReserveMinor > budget.totalMinor) {
    throw new AppError('BUDGET_ALLOCATION_EXCEEDED', 'Category allocations plus emergency reserve exceed the total budget');
  }
  const warnings: string[] = [];
  for (const item of cart) {
    const categoryId = envelope(item.category, budget);
    let category = categories.find(category => category.id === categoryId);
    if (!category) {
      if (categories.length === 20) throw new AppError('INVALID_BUDGET', 'Cart categories exceed the 20-category budget limit');
      category = { id: categoryId, title: categoryId, allocatedMinor: 0, committedMinor: 0, proposedMinor: 0 };
      categories.push(category);
    }
    const field = item.status === 'selected' ? 'committedMinor' : 'proposedMinor';
    category[field] = sum([category[field], cartTotal(item)], 'Category spending');
    if (item.deliveryCostMinor === null) warnings.push(`Delivery cost unknown for cart item ${item.id}; totals exclude that charge.`);
  }
  const committedMinor = sum(categories.map(category => category.committedMinor), 'Committed spending');
  const proposedMinor = sum(categories.map(category => category.proposedMinor), 'Proposed spending');
  const remainingMinor = budget.totalMinor - committedMinor;
  const availableMinor = remainingMinor - proposedMinor - budget.emergencyReserveMinor;
  for (const category of categories) {
    if (category.committedMinor + category.proposedMinor > category.allocatedMinor) warnings.push(`Category ${category.id}: selected and proposed spending exceeds its allocation.`);
  }
  if (remainingMinor < 0) warnings.push('Selected spending exceeds the total budget.');
  if (availableMinor < 0) warnings.push('Selected and proposed spending leaves insufficient funds to preserve the emergency reserve.');
  return { ...parsed.data, categories, allocatedMinor, committedMinor, proposedMinor, remainingMinor, availableMinor, warnings };
}

// A later research snapshot supersedes older snapshots, including unavailable results.
function currentResearch(project: LifeProject) {
  const latest = new Map<string, LifeProject['researchResults'][number]>();
  for (const result of project.researchResults) {
    const group = purchaseGroup(result.category);
    const previous = latest.get(group);
    if (!previous || compare(result.searchedAt, previous.searchedAt) > 0 ||
      (result.searchedAt === previous.searchedAt && compare(result.id, previous.id) > 0)) latest.set(group, result);
  }
  return [...latest.values()].sort((a, b) => compare(a.category, b.category));
}

function offerCost(offer: Offer): number {
  return sum([offer.priceMinor!, offer.delivery.available === false ? 0 : offer.delivery.costMinor ?? 0], 'Offer total');
}

function eligible(offer: Offer, project: LifeProject): boolean {
  return offer.priceMinor !== null && offer.priceStatus !== 'unknown' && offer.priceStatus !== 'demo' &&
    offer.verificationStatus !== 'demo' && offer.availability !== 'out_of_stock' && offer.availability !== 'demo' &&
    !(project.preferences.deliveryRequired === true && offer.delivery.available !== true) &&
    !(project.preferences.allowUsed === false && offer.kind === 'product' && offer.condition !== 'new' && offer.condition !== 'not_applicable');
}

/** Scenarios buy one researched option per uncovered category, never one per search result. */
export function simulateScenarios(project: LifeProject): SimulationScenario[] {
  const calculatedAt = new Date().toISOString();
  const budget = recalculateBudget(project.budget, project.cart);
  const snapshots = currentResearch(project);
  const offers = new Map<string, Offer[]>();
  for (const result of snapshots) {
    // Demo catalog entries are not real purchase candidates. Allocation estimates remain useful offline.
    if (isStale(result) || result.mode !== 'live' || result.status === 'unavailable') continue;
    for (const offer of result.offers) {
      if (!eligible(offer, project)) continue;
      const category = purchaseGroup(offer.category);
      const group = offers.get(category) ?? [];
      if (!group.some(existing => existing.id === offer.id)) group.push(offer);
      offers.set(category, group);
    }
  }
  const covered = new Set(project.cart.map(item => purchaseGroup(item.category)));
  // A broad furniture search can contain both beds and sofas. Group its actual offers,
  // rather than collapsing every offer into the search request's envelope.
  const researchedGroups = unique(snapshots.flatMap(result => result.offers.length ? result.offers.map(offer => purchaseGroup(offer.category)) : [purchaseGroup(result.category)]));
  const categoryPlans = new Map<string, number>();
  for (const envelopeId of unique([...budget.categories.map(category => category.id), ...researchedGroups.map(group => envelope(group, budget))])) {
    const cartInEnvelope = project.cart.filter(item => envelope(item.category, budget) === envelopeId);
    const allocation = budget.categories.find(category => category.id === envelopeId)?.allocatedMinor ?? 0;
    let groups = researchedGroups.filter(group => envelope(group, budget) === envelopeId && !covered.has(group));
    if (covered.has(envelopeId)) continue;
    // Broad furniture searches overlap specific product groups; prefer explicit groups.
    if (groups.some(group => group !== envelopeId) || cartInEnvelope.length) groups = groups.filter(group => group !== envelopeId);
    if (!groups.length && !cartInEnvelope.length) groups = [envelopeId];
    const remainingAllocation = Math.max(0, allocation - cartInEnvelope.reduce((total, item) => total + cartTotal(item), 0));
    groups.forEach((group, index) => categoryPlans.set(group, Math.floor(remainingAllocation / groups.length) + (index < remainingAllocation % groups.length ? 1 : 0)));
  }
  const categories = [...categoryPlans.keys()];
  const allocation = (id: string) => categoryPlans.get(id) ?? 0;
  const minimum = (id: string) => offers.get(id)?.length ? Math.min(...offers.get(id)!.map(offerCost)) : allocation(id);
  const baseCost = sum(project.cart.map(cartTotal), 'Scenario cart total');
  const spendingLimit = budget.totalMinor - budget.emergencyReserveMinor;
  return (['economy', 'balanced', 'comfort'] as const).map(id => {
    let verifiedCostMinor = 0;
    let estimatedCostMinor = 0;
    let runningCost = baseCost;
    let unfunded = false;
    const selectedOfferIds: string[] = [];
    const missingData: string[] = [];
    const risks: string[] = [];
    if (!budget.confirmed) missingData.push('The total budget has not been confirmed; affordability cannot be established.');
    const tradeOffs = [id === 'economy' ? 'Selects the lowest known price including known delivery in each uncovered category.' : id === 'balanced' ? 'Prefers the highest research score among affordable offers; ties favor lower known cost.' : 'Prefers confirmed delivery, then research score, among affordable offers.'];
    for (const result of snapshots) {
      if (isStale(result)) missingData.push(`${result.category}: research excluded because project constraints changed; research again.`);
      else if (result.mode === 'demo') missingData.push(`${result.category}: demo offers excluded because their prices and availability are not real; allocation-based planning estimates are used where needed.`);
      else if (project.preferences.deliveryRequired === true) {
        for (const offer of result.offers) {
          if (offer.delivery.available === null) missingData.push(`Offer ${offer.id}: delivery availability unknown; excluded because delivery is required.`);
        }
      }
    }
    tradeOffs.push('Known delivery charges are estimates because the contract does not separately verify shipping prices.');
    const deliveryStates: ('yes' | 'no' | 'unknown')[] = [];
    const add = (cost: number, verified: boolean) => {
      if (verified) verifiedCostMinor = sum([verifiedCostMinor, cost], 'Verified scenario cost');
      else estimatedCostMinor = sum([estimatedCostMinor, cost], 'Estimated scenario cost');
    };
    for (const item of project.cart) {
      add(money(item.unitPriceMinor * item.quantity, 'Cart subtotal'), item.priceStatus === 'verified' && item.sourceUrl !== null);
      add(item.deliveryCostMinor ?? 0, false);
      if (item.offerId) selectedOfferIds.push(item.offerId);
      if (item.status === 'proposed') tradeOffs.push(`Proposed cart item ${item.id} is included as a planning choice; it is not locked.`);
      if (item.deliveryCostMinor === null) missingData.push(`Cart item ${item.id}: delivery cost unknown; total excludes unknown delivery.`);
      if (item.priceStatus !== 'verified' || !item.sourceUrl) risks.push(`Cart item ${item.id}: price is not source-verified.`);
      deliveryStates.push('unknown'); // A cart line has a delivery price, but no delivery-availability field.
    }
    for (const [index, category] of categories.entries()) {
      const candidates = [...(offers.get(category) ?? [])];
      const laterMinimum = categories.slice(index + 1).reduce((total, next) => total + minimum(next), 0);
      const affordable = candidates.filter(offer => offerCost(offer) <= spendingLimit - runningCost - laterMinimum);
      affordable.sort((a, b) => {
        if (id === 'comfort') {
          const delivery = Number(b.delivery.available === true && b.delivery.costMinor !== null) - Number(a.delivery.available === true && a.delivery.costMinor !== null);
          if (delivery) return delivery;
        }
        if (id !== 'economy' && a.score !== b.score) return b.score - a.score;
        return offerCost(a) - offerCost(b) || compare(a.id, b.id);
      });
      const offer = affordable[0];
      if (!offer) {
        const estimate = allocation(category);
        add(estimate, false);
        runningCost = sum([runningCost, estimate], 'Scenario total');
        missingData.push(`${category}: allocation-based planning estimate of ${estimate} cents from its remaining category envelope (shared equally across uncovered purchase groups); no ${candidates.length ? 'affordable' : 'eligible priced'} research offer selected. This is not a product or quote.`);
        if (candidates.length) { unfunded = true; risks.push(`${category}: available offers cannot fit the budget while preserving the reserve and other category plans.`); }
        deliveryStates.push('unknown');
        continue;
      }
      const cost = offerCost(offer);
      runningCost = sum([runningCost, cost], 'Scenario total');
      add(offer.priceMinor!, offer.priceStatus === 'verified' && offer.verificationStatus === 'source_checked' && offer.sourceUrl !== null);
      add(offer.delivery.available === false ? 0 : offer.delivery.costMinor ?? 0, false);
      selectedOfferIds.push(offer.id);
      const deliveryKnown = offer.delivery.available === true && offer.delivery.costMinor !== null;
      deliveryStates.push(deliveryKnown ? 'yes' : offer.delivery.available === false ? 'no' : 'unknown');
      if (offer.delivery.available === null || (offer.delivery.available !== false && offer.delivery.costMinor === null)) missingData.push(`Offer ${offer.id}: delivery availability or cost unknown; total excludes any unknown delivery charge.`);
      if (offer.delivery.available === false) risks.push(`Offer ${offer.id}: delivery unavailable; pickup or separate transport is required.`);
      if (offer.availability === 'unknown') missingData.push(`Offer ${offer.id}: stock or service availability is unknown.`);
      if (offer.priceStatus !== 'verified' || offer.verificationStatus !== 'source_checked' || !offer.sourceUrl) risks.push(`Offer ${offer.id}: price is an estimate, not a source-verified quote.`);
      if (offer.condition === 'used' || offer.condition === 'refurbished') tradeOffs.push(`Offer ${offer.id} is ${offer.condition}; inspect its condition before committing.`);
    }
    const estimatedTotalMinor = sum([verifiedCostMinor, estimatedCostMinor], 'Scenario total');
    const withinBudget = budget.confirmed && !unfunded && estimatedTotalMinor <= spendingLimit;
    if (estimatedTotalMinor > spendingLimit) risks.push('Known costs and planning estimates exceed funds available after the emergency reserve.');
    if (missingData.length) risks.push('Totals are provisional; missing prices, availability or delivery details require confirmation.');
    const convenience = deliveryStates.length && deliveryStates.every(state => state === 'yes') ? 'high' : deliveryStates.includes('no') ? 'low' : 'medium';
    return {
      id, name: id === 'economy' ? 'Economy' : id === 'balanced' ? 'Balanced' : 'Comfort',
      estimatedTotalMinor, verifiedCostMinor, estimatedCostMinor, remainingMinor: budget.totalMinor - estimatedTotalMinor,
      emergencyReserveMinor: budget.emergencyReserveMinor, withinBudget, convenience,
      effort: convenience === 'high' ? 'low' : convenience === 'low' ? 'high' : 'medium',
      selectedOfferIds: unique(selectedOfferIds), lockedCartItemIds: project.cart.filter(item => item.status === 'selected').map(item => item.id),
      risks: unique(risks), tradeOffs, missingData, calculatedAt, basedOnRevision: project.revision,
    };
  });
}

/** Risk identity follows the issue; status follows the exact supporting evidence. */
export function analyzeRisks(project: LifeProject): Risk[] {
  const budget = recalculateBudget(project.budget, project.cart);
  const risks: Risk[] = [];
  const add = (id: string, category: Risk['category'], severity: Risk['severity'], title: string, explanation: string, evidence: string[], preventiveAction: string, sourceUrl: string | null = null) => {
    if (risks.some(risk => risk.id === id)) return;
    const risk: Risk = { id, category, severity, title, explanation, evidence: evidence.flatMap(value => value.match(/[\s\S]{1,2000}/g) ?? []).map(value => value.trim()).filter(Boolean), preventiveAction, status: 'open', sourceUrl };
    const previous = project.risks.find(previous => previous.id === id);
    if (previous && previous.category === risk.category && previous.severity === risk.severity && previous.title === risk.title && previous.explanation === risk.explanation && previous.preventiveAction === risk.preventiveAction && previous.sourceUrl === risk.sourceUrl && JSON.stringify(previous.evidence) === JSON.stringify(risk.evidence)) risk.status = previous.status;
    risks.push(risk);
  };
  if (project.scenarioType === 'moving') {
    if (!project.preferences.moveDate) add('moving:date', 'planning', 'high', 'Exact move date is missing', 'The project has no confirmed exact move date for scheduling.', ['Scenario: moving; preferences.moveDate: null.'], 'Confirm the exact move date before booking services.');
    if (!project.preferences.origin?.trim()) add('moving:origin', 'planning', 'medium', 'Moving origin is missing', 'The starting address or location is needed to obtain meaningful transport quotes.', [`Scenario: moving; origin: ${project.preferences.origin ?? 'unknown'}; destination: ${project.location ?? 'unknown'}.`], 'Confirm the starting address and destination before requesting quotes.');
    const movingItems = project.cart.filter(item => item.status === 'selected' && ['moving', 'movers', 'transport', 'removals'].includes(item.category));
    if (!movingItems.length && project.status !== 'completed') add('moving:arrangement', 'transport', 'medium', 'Moving arrangement is not recorded', 'No moving or transport option is selected in the project cart.', [`Scenario: moving; selected moving/transport cart items: none; move date: ${project.preferences.moveDate ?? 'unknown'}; origin: ${project.preferences.origin ?? 'unknown'}; destination: ${project.location ?? 'unknown'}.`], 'Record the agreed moving service or a self-move transport plan.');
  }
  if (!budget.confirmed) add('budget:unconfirmed', 'planning', 'medium', 'Budget is not confirmed', 'The budget is still a planning assumption.', [`Budget total: ${budget.totalMinor} cents; confirmed: false.`], 'Confirm the spending limit and category allocations.');
  if (budget.confirmed && budget.totalMinor > 0 && budget.emergencyReserveMinor === 0) add('budget:no-reserve', 'budget', 'medium', 'No emergency reserve is allocated', 'All available funds are exposed to unexpected costs because no reserve is set aside.', [`Budget total: ${budget.totalMinor} cents; emergency reserve: 0 cents.`], 'Consider setting aside a reserve for costs that have not yet been confirmed.');
  if (budget.remainingMinor < 0) add('budget:overcommitted', 'budget', 'high', 'Selected spending exceeds the budget', 'Selected cart lines exceed the project spending limit.', [`Selected: ${budget.committedMinor} cents; budget: ${budget.totalMinor} cents.`], 'Remove or reduce selected spending, or confirm a revised budget.');
  if (budget.availableMinor < 0) add('budget:reserve-shortfall', 'budget', 'high', 'Planned spending encroaches on the reserve', 'Selected and proposed cart lines cannot all be funded while preserving the emergency reserve.', [`Selected: ${budget.committedMinor} cents; proposed: ${budget.proposedMinor} cents; reserve: ${budget.emergencyReserveMinor} cents; total: ${budget.totalMinor} cents.`], 'Reduce planned spending or explicitly revise the reserve and allocations.');
  for (const category of budget.categories) {
    if (category.committedMinor + category.proposedMinor > category.allocatedMinor) add(`budget:category:${category.id}`, 'budget', 'medium', `Allocation exceeded: ${label(category.title)}`, 'Cart spending for this category exceeds its planning allocation.', [`Category ${category.id}: allocated ${category.allocatedMinor} cents; selected ${category.committedMinor} cents; proposed ${category.proposedMinor} cents.`], 'Review the cart or rebalance category allocations.');
  }
  for (const item of project.cart) {
    if (item.deliveryCostMinor === null) add(`cart:delivery:${item.id}`, 'delivery', project.preferences.deliveryRequired ? 'high' : 'medium', `Delivery cost unknown: ${label(item.title)}`, 'The cart total excludes an unknown delivery charge.', [`Cart item ${item.id}; quantity ${item.quantity}; unit price ${item.unitPriceMinor} cents; delivery cost unknown; delivery required: ${project.preferences.deliveryRequired}.`], 'Confirm delivery availability and the charge for the entire line.', item.sourceUrl);
    if (item.priceStatus !== 'verified' || !item.sourceUrl) add(`cart:price:${item.id}`, 'budget', 'medium', `Price needs verification: ${label(item.title)}`, 'This cart line does not have a source-verified price.', [`Cart item ${item.id}; unit price ${item.unitPriceMinor} cents; quantity ${item.quantity}; price status ${item.priceStatus}; source ${item.sourceUrl ?? 'missing'}.`], 'Verify the current price at a checked source before selecting or paying.', item.sourceUrl);
  }
  for (const result of currentResearch(project)) {
    if (isStale(result) || result.status !== 'completed' || result.mode !== 'live') add(`research:coverage:${result.category}`, 'planning', 'medium', `Research needs follow-up: ${result.category}`, 'Research for this category is stale, limited, unavailable or demonstration data.', [`Research ${result.id}; status ${result.status}; mode ${result.mode}; searched ${result.searchedAt}.`, ...result.warnings], 'Obtain current real offers and verify prices, stock and delivery.');
    for (const offer of [...result.offers].sort((a, b) => compare(a.id, b.id))) {
      const evidence = `Offer ${offer.id}; price ${offer.priceMinor ?? 'unknown'} cents (${offer.priceStatus}); verification ${offer.verificationStatus}; checked ${offer.lastCheckedAt}.`;
      if (offer.kind === 'service' && result.mode === 'live' && offer.verificationStatus !== 'demo') add(`offer:terms:${offer.id}`, 'contract', 'medium', `Verify service terms: ${label(offer.title)}`, 'This service offer needs scope, payment and cancellation terms checked before booking; the project does not record confirmed contractual terms.', [evidence, `Service description: ${offer.description || 'not provided'}`], 'Obtain written scope, inclusions, payment and cancellation terms from the provider.', offer.sourceUrl);
      if (offer.priceStatus !== 'verified' || offer.verificationStatus !== 'source_checked' || !offer.sourceUrl) add(`offer:price:${offer.id}`, 'budget', 'medium', `Research price unverified: ${label(offer.title)}`, 'The researched price is not a checked current quote.', [evidence], 'Check the original source and obtain a confirmed price.', offer.sourceUrl);
      if (offer.delivery.available !== true || offer.delivery.costMinor === null) add(`offer:delivery:${offer.id}`, offer.delivery.available === false ? 'transport' : 'delivery', project.preferences.deliveryRequired ? 'high' : 'medium', `Delivery needs review: ${label(offer.title)}`, offer.delivery.available === false ? 'The offer does not provide delivery.' : 'Delivery availability or its charge has not been established.', [`${evidence} Delivery available: ${offer.delivery.available}; delivery cost: ${offer.delivery.costMinor ?? 'unknown'} cents; required: ${project.preferences.deliveryRequired}.`], 'Confirm delivery or plan and price separate transport before committing.', offer.sourceUrl);
      if (offer.seller.type !== 'company' || !offer.seller.verified) add(`offer:seller:${offer.id}`, 'seller', 'medium', `Seller needs review: ${label(offer.title)}`, 'The seller information requires review before payment; this is not evidence of fraud.', [`Offer ${offer.id}; seller ${offer.seller.name ?? 'unnamed'}; type ${offer.seller.type}; verified ${offer.seller.verified}; profile ${offer.seller.publicProfileUrl ?? 'missing'}.`], 'Review the seller profile and agree on inspection and payment terms.', offer.sourceUrl);
      if (offer.availability !== 'in_stock') add(`offer:availability:${offer.id}`, 'planning', offer.availability === 'out_of_stock' ? 'high' : 'medium', `Availability needs review: ${label(offer.title)}`, 'The offer is not confirmed available for purchase.', [`Offer ${offer.id}; availability ${offer.availability}; checked ${offer.lastCheckedAt}.`], 'Confirm availability before relying on this offer.', offer.sourceUrl);
      if (project.preferences.allowUsed === false && offer.kind === 'product' && offer.condition !== 'new' && offer.condition !== 'not_applicable') add(`offer:condition:${offer.id}`, 'planning', 'medium', `Condition conflicts with preferences: ${label(offer.title)}`, 'The project disallows used items and this product is not confirmed new.', [`Offer ${offer.id}; condition ${offer.condition}; allowUsed false.`], 'Choose a confirmed new product or revise the preference.', offer.sourceUrl);
    }
  }
  return risks;
}
