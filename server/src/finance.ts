import { BudgetCategorySchema, BudgetSchema, CartItemSchema, MinorSchema, HomeInsuranceExpenseSchema, type HomeInsuranceExpense, type Budget, type CartItem, type LifeProject, type Offer, type Risk, type SimulationScenario } from '../../shared/contracts/index.js';
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
const otherGroups: Record<string, string> = {
  hotel: 'hotel', hotels: 'hotel', hostel: 'hostel', hostels: 'hostel',
  flight: 'flight', flights: 'flight', airfare: 'flight',
  train: 'train', trains: 'train', rail: 'train', bus: 'bus', buses: 'bus',
  car: 'vehicle', cars: 'vehicle', vehicle: 'vehicle', vehicles: 'vehicle', car_purchase: 'vehicle', vehicle_purchase: 'vehicle',
};
function purchaseGroup(category: string): string {
  if (Object.hasOwn(furnitureGroups, category)) return furnitureGroups[category]!;
  if (Object.hasOwn(otherGroups, category)) return otherGroups[category]!;
  const tokens = category.split(/[_-]+/);
  // Specific UI search slugs still spend the parent financial envelope. Service
  // names take precedence; accessories and ambiguous bundles stay separate.
  if (tokens.includes('delivery')) return 'delivery';
  if (tokens.includes('assembly')) return 'assembly';
  if (tokens.includes('inspection')) return 'inspection';
  if (tokens.includes('registration')) return 'registration';
  if (tokens.includes('insurance')) return 'insurance';
  if (tokens.some(token => ['toy', 'toys', 'miniature', 'miniatures', 'doll', 'dolls', 'pet', 'pets', 'dog', 'cat', 'accessory', 'accessories', 'part', 'parts', 'linen', 'linens', 'sheet', 'sheets', 'bedding', 'cover', 'covers', 'protector', 'protectors', 'pillow', 'cushion', 'battery', 'batteries', 'charger', 'chargers', 'tire', 'tires', 'tyre', 'tyres', 'wheel', 'wheels', 'mat', 'mats', 'mirror', 'mirrors', 'engine', 'engines', 'rental', 'rentals', 'lease', 'leasing'].includes(token))) return category;
  const furniture = unique(tokens.filter(token => Object.hasOwn(furnitureGroups, token)).map(token => furnitureGroups[token]!));
  if (furniture.length === 1) return furniture[0]!;
  if (furniture.length > 1) return category;
  if (tokens.some(token => ['car', 'cars', 'vehicle', 'vehicles'].includes(token))) return 'vehicle';
  if (tokens.some(token => ['flight', 'flights', 'airfare'].includes(token))) return 'flight';
  if (tokens.some(token => ['hotel', 'hotels'].includes(token))) return 'hotel';
  if (tokens.some(token => ['hostel', 'hostels'].includes(token))) return 'hostel';
  if (tokens.includes('moving') && tokens.some(token => ['company', 'companies', 'service', 'services', 'quote', 'quotes'].includes(token))) return 'moving';
  return category;
}
function envelope(category: string, budget: Budget): string {
  if (budget.categories.some(item => item.id === category)) return category;
  const alias = budget.categories.find(item => purchaseGroup(item.id) === purchaseGroup(category));
  if (alias) return alias.id;
  if (isFurniture(category) && budget.categories.some(item => item.id === 'furniture')) return 'furniture';
  const parentCategories: Record<string, string[]> = { hotel: ['accommodation', 'lodging'], hostel: ['accommodation', 'lodging'], flight: ['transport'], train: ['transport'], bus: ['transport'], vehicle: ['purchase'] };
  const parent = Object.hasOwn(parentCategories, purchaseGroup(category)) ? parentCategories[purchaseGroup(category)]!.find(id => budget.categories.some(item => item.id === id)) : undefined;
  if (parent) return parent;
  return category;
}
const isStale = (result: LifeProject['researchResults'][number]) => result.warnings.some(warning => warning.startsWith('Project constraints changed'));
const isFurniture = (category: string) => category === 'furniture' || Object.hasOwn(furnitureGroups, purchaseGroup(category));
const serviceGroups = new Set(['services', 'moving', 'movers', 'removals', 'accommodation', 'lodging', 'hotel', 'hostel', 'transport', 'flight', 'train', 'bus', 'inspection', 'registration', 'insurance', 'delivery', 'assembly', 'installation']);
const serviceCategory = (category: string, budget: Budget) => serviceGroups.has(purchaseGroup(category)) || serviceGroups.has(envelope(category, budget));

function cartOffer(item: CartItem, project: LifeProject): Offer | undefined {
  // Retained research still describes the kind of a locked cart item, even when
  // a newer search superseded that result or the search is stale for new choices.
  for (let index = project.researchResults.length - 1; index >= 0; index--) {
    const offer = project.researchResults[index]!.offers.find(offer => offer.id === item.offerId);
    if (offer) return offer;
  }
  return undefined;
}

function cartIsService(item: CartItem, project: LifeProject): boolean {
  const linked = cartOffer(item, project);
  return linked ? linked.kind === 'service' : serviceCategory(item.category, project.budget);
}

const serviceFeeNote = 'The recorded service price does not separately establish whether taxes and additional fees are included; totals exclude any unpriced extras.';

function ownedCategory(category: string, project: LifeProject): boolean {
  if (project.preferences.ownsFurniture === true && isFurniture(category)) return true;
  return (project.preferences.ownedItems ?? []).some(item => {
    const normalized = item.toLowerCase().trim().replace(/[\s-]+/g, '_');
    if (purchaseGroup(normalized) === purchaseGroup(category)) return true;
    if (normalized === 'furniture' && isFurniture(category)) return true;
    // Accept named owned objects such as "double bed", without matching substrings like "bedroom".
    return isFurniture(category) && normalized.split('_').some(word => purchaseGroup(word) === purchaseGroup(category));
  });
}

function contextualCategory(category: string, project: LifeProject): boolean {
  return !(['travel', 'car_purchase'].includes(project.scenarioType) &&
    (isFurniture(category) || ['moving', 'movers', 'removals', 'appliances'].includes(purchaseGroup(category))));
}

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
  // The recorded additional charge applies to the line, not to each unit.
  return sum([money(item.unitPriceMinor * item.quantity, 'Cart line subtotal'), item.deliveryCostMinor ?? 0], 'Cart line total');
}

// Convert the caller's decimal number representation to an exact ratio, including
// scientific notation. Money never passes through floating-point multiplication.
function decimalRatio(value: number): { numerator: bigint; denominator: bigint } {
  const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole, fraction = ''] = coefficient!.split('.');
  const digits = BigInt(`${whole}${fraction}`);
  const scale = fraction.length - Number(exponent);
  return scale >= 0 ? { numerator: digits, denominator: 10n ** BigInt(scale) } : { numerator: digits * 10n ** BigInt(-scale), denominator: 1n };
}

/** Normalize positive planning weights, reserving the requested percentage.
 * Largest fractional remainders win cents; input order breaks ties, reserve last.
 */
export function allocateBudgetForPlan(totalMinor: number, categories: Array<{ id: string; title: string; weight: number }>, reservePercent = 10, confirmed = false): Budget {
  money(totalMinor, 'Budget total');
  if (!Array.isArray(categories) || categories.length < 1 || categories.length > 20 ||
      typeof confirmed !== 'boolean' || !Number.isFinite(reservePercent) || reservePercent < 0 || reservePercent > 100) {
    throw new AppError('INVALID_BUDGET', 'Provide 1–20 categories, a reserve percentage from 0 to 100, and a boolean confirmation');
  }
  const categorySchema = BudgetCategorySchema.pick({ id: true, title: true });
  const seen = new Set<string>();
  const definitions = categories.map(category => {
    if (!category || !categorySchema.safeParse({ id: category.id, title: category.title }).success ||
        !Number.isFinite(category.weight) || category.weight <= 0 || seen.has(category.id)) {
      throw new AppError('INVALID_BUDGET', 'Category IDs must be valid and unique, with valid titles and finite positive weights');
    }
    seen.add(category.id);
    return { ...category, ratio: decimalRatio(category.weight) };
  });
  const scale = definitions.reduce((largest, category) => category.ratio.denominator > largest ? category.ratio.denominator : largest, 1n);
  const weights = definitions.map(category => category.ratio.numerator * (scale / category.ratio.denominator));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0n);
  const reserve = decimalRatio(reservePercent);
  const denominator = totalWeight * 100n * reserve.denominator;
  const numerators = [...weights.map(weight => weight * (100n * reserve.denominator - reserve.numerator)), totalWeight * reserve.numerator];
  const shares = numerators.map((numerator, index) => {
    const product = BigInt(totalMinor) * numerator;
    return { index, minor: product / denominator, remainder: product % denominator };
  });
  const remainder = BigInt(totalMinor) - shares.reduce((total, share) => total + share.minor, 0n);
  const order = [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (let index = 0; index < Number(remainder); index++) order[index]!.minor++;
  return recalculateBudget({
    totalMinor, currency: 'EUR', confirmed,
    categories: definitions.map((category, index) => ({ id: category.id, title: category.title, allocatedMinor: Number(shares[index]!.minor), committedMinor: 0, proposedMinor: 0 })),
    emergencyReserveMinor: Number(shares[definitions.length]!.minor), allocatedMinor: 0, committedMinor: 0, proposedMinor: 0,
    remainingMinor: totalMinor, availableMinor: totalMinor, warnings: [],
  }, []);
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
export function recalculateBudget(budget: Budget, cart: CartItem[], insurance?:HomeInsuranceExpense|null): Budget {
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
    // This export has no project/research context, so it cannot assume that an
    // unknown charge is shipping rather than a service fee.
    if (item.deliveryCostMinor === null) warnings.push(`Additional line charge unknown for cart item ${item.id}; totals exclude any unpriced charge.`);
  }
  if(insurance){
    HomeInsuranceExpenseSchema.parse(insurance);
    let category=categories.find(c=>c.id==='home_insurance');
    if(!category){if(categories.length===20)throw new AppError('INVALID_BUDGET','Insurance would exceed the budget category limit');category={id:'home_insurance',title:'Home insurance',allocatedMinor:0,committedMinor:0,proposedMinor:0};categories.push(category);}
    category.proposedMinor=sum([category.proposedMinor,insurance.plannedMinor],'Proposed insurance');
    warnings.push(`Home insurance: ${insurance.installments} ${insurance.billingPeriod} premium(s) over ${insurance.planningMonths} planning month(s); proposed only. Future renewals outside this horizon are excluded.`);
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
  return { ...parsed.data, categories, allocatedMinor, committedMinor, proposedMinor, remainingMinor, availableMinor, warnings, recurringProposedMinor:insurance?.plannedMinor??0 };
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
    !(offer.kind === 'product' && project.preferences.deliveryRequired === true && offer.delivery.available !== true) &&
    !(project.preferences.allowUsed === false && offer.kind === 'product' && offer.condition !== 'new' && offer.condition !== 'not_applicable');
}

/** Scenarios buy one researched option per uncovered category, never one per search result. */
export function simulateScenarios(project: LifeProject): SimulationScenario[] {
  const calculatedAt = new Date().toISOString();
  const budget = recalculateBudget(project.budget, project.cart, project.homeInsurance?.expense);
  const snapshots = currentResearch(project);
  // Furniture needs may include both a bed and sofa. Other plan envelopes describe
  // one expense choice: e.g. a hotel and a hostel are alternatives for accommodation.
  const scenarioGroup = (category: string) => isFurniture(category) ? purchaseGroup(category) : purchaseGroup(envelope(category, budget));
  const automaticCategory = (category: string) => !ownedCategory(category, project) && contextualCategory(category, project) &&
    project.budget.categories.some(item => item.id === envelope(category, budget));
  const offers = new Map<string, Offer[]>();
  for (const result of snapshots) {
    // Demo catalog entries are not real purchase candidates. Allocation estimates remain useful offline.
    if (isStale(result) || result.mode !== 'live' || result.status === 'unavailable') continue;
    for (const offer of result.offers) {
      if (!automaticCategory(offer.category) || !eligible(offer, project)) continue;
      const category = scenarioGroup(offer.category);
      const group = offers.get(category) ?? [];
      if (!group.some(existing => existing.id === offer.id)) group.push(offer);
      offers.set(category, group);
    }
  }
  const covered = new Set(project.cart.map(item => scenarioGroup(item.category)));
  if(project.homeInsurance?.expense)covered.add(scenarioGroup('home_insurance'));
  // A broad furniture search can contain both beds and sofas. Group its actual offers,
  // rather than collapsing every offer into the search request's envelope.
  const researchedGroups = unique(snapshots.flatMap(result => result.offers.length ? result.offers.map(offer => scenarioGroup(offer.category)) : [scenarioGroup(result.category)]));
  const categoryPlans = new Map<string, number>();
  for (const envelopeId of unique([...budget.categories.map(category => category.id), ...researchedGroups.map(group => envelope(group, budget))])) {
    if (!automaticCategory(envelopeId)) continue;
    const cartInEnvelope = project.cart.filter(item => envelope(item.category, budget) === envelopeId);
    const allocation = budget.categories.find(category => category.id === envelopeId)?.allocatedMinor ?? 0;
    const envelopeGroups = researchedGroups.filter(group => envelope(group, budget) === envelopeId);
    let groups = envelopeGroups.filter(group => automaticCategory(group) && !covered.has(group));
    if (covered.has(envelopeId)) continue;
    // Broad furniture searches overlap specific product groups; prefer explicit groups.
    if (groups.some(group => group !== envelopeId) || cartInEnvelope.length) groups = groups.filter(group => group !== envelopeId);
    if (!groups.length && !cartInEnvelope.length && !envelopeGroups.length) groups = [envelopeId];
    const remainingAllocation = Math.max(0, allocation - cartInEnvelope.reduce((total, item) => total + cartTotal(item), 0));
    groups.forEach((group, index) => categoryPlans.set(group, Math.floor(remainingAllocation / groups.length) + (index < remainingAllocation % groups.length ? 1 : 0)));
  }
  const categories = [...categoryPlans.keys()];
  const allocation = (id: string) => categoryPlans.get(id) ?? 0;
  const minimum = (id: string) => offers.get(id)?.length ? Math.min(...offers.get(id)!.map(offerCost)) : allocation(id);
  const baseCost = sum([...project.cart.map(cartTotal),project.homeInsurance?.expense?.plannedMinor??0], 'Scenario cart total');
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
    const tradeOffs = [id === 'economy' ? 'Selects the lowest known price including recorded line charges in each uncovered category.' : id === 'balanced' ? 'Prefers the highest research score among affordable offers; ties favor lower known cost.' : 'Prefers documented availability, then research score, among affordable offers.'];
    if(project.homeInsurance?.expense){verifiedCostMinor=project.homeInsurance.expense.plannedMinor;tradeOffs.push(`Home insurance is a proposed recurring expense over ${project.homeInsurance.expense.planningMonths} month(s), not a purchased policy. Later renewals are excluded.`);}
    if (project.preferences.ownsFurniture === true || project.preferences.ownedItems?.length) tradeOffs.push(`Automatic purchases exclude recorded owned items (${project.preferences.ownedItems?.join(', ') || 'furniture'}); explicit cart choices are retained.`);
    const excluded = researchedGroups.filter(group => !automaticCategory(group));
    if (excluded.length) tradeOffs.push(`Research groups excluded from automatic purchases because they are owned, outside this context, or absent from the current budget: ${excluded.join(', ')}.`);
    for (const result of snapshots) {
      if (isStale(result)) missingData.push(`${result.category}: research excluded because project constraints changed; research again.`);
      else if (result.mode === 'demo') missingData.push(`${result.category}: demo offers excluded because their prices and availability are not real; allocation-based planning estimates are used where needed.`);
      else if (project.preferences.deliveryRequired === true) {
        for (const offer of result.offers) {
          if (offer.kind === 'product' && offer.delivery.available === null) missingData.push(`Offer ${offer.id}: delivery availability unknown; excluded because delivery is required.`);
        }
      }
    }
    let hasPhysicalProduct = false;
    let hasService = false;
    const deliveryStates: ('yes' | 'no' | 'unknown')[] = [];
    const add = (cost: number, verified: boolean) => {
      if (verified) verifiedCostMinor = sum([verifiedCostMinor, cost], 'Verified scenario cost');
      else estimatedCostMinor = sum([estimatedCostMinor, cost], 'Estimated scenario cost');
    };
    for (const item of project.cart) {
      const service = cartIsService(item, project);
      hasService ||= service;
      hasPhysicalProduct ||= !service;
      add(money(item.unitPriceMinor * item.quantity, 'Cart subtotal'), item.priceStatus === 'verified' && item.sourceUrl !== null);
      add(item.deliveryCostMinor ?? 0, false);
      if (item.offerId) selectedOfferIds.push(item.offerId);
      if (item.status === 'proposed') tradeOffs.push(`Proposed cart item ${item.id} is included as a planning choice; it is not locked.`);
      if (service) {
        if (item.deliveryCostMinor === null || item.priceStatus !== 'verified' || !item.sourceUrl) missingData.push(`Cart item ${item.id}: service total fees need confirmation. ${serviceFeeNote}`);
      } else if (item.deliveryCostMinor === null) missingData.push(`Cart item ${item.id}: delivery cost unknown; total excludes unknown delivery.`);
      if (item.priceStatus !== 'verified' || !item.sourceUrl) risks.push(`Cart item ${item.id}: price is not source-verified.`);
      deliveryStates.push('unknown'); // A cart line has a delivery price, but no delivery-availability field.
    }
    for (const [index, category] of categories.entries()) {
      const candidates = [...(offers.get(category) ?? [])];
      const laterMinimum = categories.slice(index + 1).reduce((total, next) => total + minimum(next), 0);
      const affordable = candidates.filter(offer => offerCost(offer) <= spendingLimit - runningCost - laterMinimum);
      affordable.sort((a, b) => {
        if (id === 'comfort') {
          const delivery = Number(b.kind === 'service' ? b.availability === 'in_stock' : b.delivery.available === true && b.delivery.costMinor !== null) - Number(a.kind === 'service' ? a.availability === 'in_stock' : a.delivery.available === true && a.delivery.costMinor !== null);
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
      hasService ||= offer.kind === 'service';
      hasPhysicalProduct ||= offer.kind === 'product';
      const deliveryKnown = offer.delivery.available === true && offer.delivery.costMinor !== null;
      deliveryStates.push(offer.kind === 'service' ? (offer.availability === 'in_stock' ? 'yes' : 'unknown') : deliveryKnown ? 'yes' : offer.delivery.available === false ? 'no' : 'unknown');
      if (offer.kind === 'service') {
        if (offer.delivery.costMinor === null || offer.priceStatus !== 'verified' || offer.verificationStatus !== 'source_checked' || !offer.sourceUrl) missingData.push(`Offer ${offer.id}: service total fees need confirmation. ${serviceFeeNote}`);
      } else {
        if (offer.delivery.available === null || (offer.delivery.available !== false && offer.delivery.costMinor === null)) missingData.push(`Offer ${offer.id}: delivery availability or cost unknown; total excludes any unknown delivery charge.`);
        if (offer.delivery.available === false) risks.push(`Offer ${offer.id}: delivery unavailable; pickup or separate transport is required.`);
      }
      if (offer.availability === 'unknown') missingData.push(`Offer ${offer.id}: stock or service availability is unknown.`);
      if (offer.priceStatus !== 'verified' || offer.verificationStatus !== 'source_checked' || !offer.sourceUrl) risks.push(`Offer ${offer.id}: price is an estimate, not a source-verified quote.`);
      if (offer.condition === 'used' || offer.condition === 'refurbished') tradeOffs.push(`Offer ${offer.id} is ${offer.condition}; inspect its condition before committing.`);
    }
    if (hasPhysicalProduct) tradeOffs.push('Known delivery charges are estimates because the contract does not separately verify shipping prices.');
    if (hasService) tradeOffs.push('Recorded additional service charges are estimates; the base price verification does not verify those charges or establish that all taxes and fees are included. Confirm the full quote and service terms.');
    const estimatedTotalMinor = sum([verifiedCostMinor, estimatedCostMinor], 'Scenario total');
    const withinBudget = budget.confirmed && !unfunded && estimatedTotalMinor <= spendingLimit;
    if (estimatedTotalMinor > spendingLimit) risks.push('Known costs and planning estimates exceed funds available after the emergency reserve.');
    if (missingData.length) risks.push('Totals are provisional; missing prices, availability or additional charges require confirmation.');
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
  const budget = recalculateBudget(project.budget, project.cart, project.homeInsurance?.expense);
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
    const movingItems = project.cart.filter(item => item.status === 'selected' && ['moving', 'movers', 'transport', 'removals'].includes(purchaseGroup(item.category)));
    if (!movingItems.length && project.status !== 'completed') add('moving:arrangement', 'transport', 'medium', 'Moving arrangement is not recorded', 'No moving or transport option is selected in the project cart.', [`Scenario: moving; selected moving/transport cart items: none; move date: ${project.preferences.moveDate ?? 'unknown'}; origin: ${project.preferences.origin ?? 'unknown'}; destination: ${project.location ?? 'unknown'}.`], 'Record the agreed moving service or a self-move transport plan.');
  }
  if (project.scenarioType === 'travel') {
    const { startDate, endDate, durationDays, origin } = project.preferences;
    const dates = `Scenario: travel; start date: ${startDate ?? 'unknown'}; end date: ${endDate ?? 'unknown'}; duration: ${durationDays ?? 'unknown'} days; destination: ${project.location ?? 'unknown'}.`;
    if (!startDate || (!endDate && !durationDays)) add('travel:dates', 'planning', 'medium', 'Travel dates need confirmation', 'The trip has no complete recorded date range or start date with duration.', [dates], 'Confirm the departure date and either the return date or trip duration.');
    if (startDate && endDate && endDate < startDate) add('travel:date-order', 'planning', 'high', 'Travel date order is inconsistent', 'The recorded return date precedes the departure date.', [dates], 'Correct the departure and return dates before comparing travel offers.');
    if (!origin?.trim()) add('travel:origin', 'planning', 'medium', 'Travel origin is missing', 'The departure location is not recorded, so route-specific travel planning is incomplete.', [`Scenario: travel; origin: ${origin ?? 'unknown'}; destination: ${project.location ?? 'unknown'}.`], 'Record the departure location before comparing routes.');
    const documentTopic = /\b(passport|visa|travel documents?|identity (?:card|documents?))\b/i;
    const documentTasks = project.tasks.filter(task => task.status !== 'done' && (['documents', 'travel_documents', 'passport', 'visa'].includes(task.category) || documentTopic.test(task.title)));
    const documentConcerns = [project.originalMessage, project.preferences.notes, ...project.confirmedFacts].flatMap(value => value.split(/[.!?\n]/)).filter(value => documentTopic.test(value) && /\b(missing|expired|not renewed|renewal|not checked|unconfirmed|haven't checked|have not checked|need to check)\b/i.test(value));
    if (documentTasks.length || documentConcerns.length) add('travel:documents', 'planning', 'medium', 'Recorded travel document checks are outstanding', 'The project records an unfinished document check or a specific document concern. It does not establish which documents the traveler needs.', [
      ...documentTasks.map(task => `Task ${task.id}: ${task.title}; status: ${task.status}; notes: ${task.notes || 'none'}.`),
      ...documentConcerns.map(value => `Recorded concern: ${value.trim()}`),
    ], 'Resolve the recorded concern and check applicable document requirements for the actual traveler and route.');
  }
  if (project.scenarioType === 'car_purchase') {
    const vehicleCategory = (category: string) => purchaseGroup(category) === 'vehicle' || category === 'purchase';
    const vehicleOffers = currentResearch(project).filter(result => result.mode === 'live').flatMap(result => result.offers).filter(offer => offer.kind === 'product' && vehicleCategory(offer.category) && offer.verificationStatus !== 'demo');
    const inspectionTopic = /\b(inspection|inspect|vehicle history|service history|pre.?purchase check)\b/i;
    const inspectionTasks = project.tasks.filter(task => task.category === 'inspection' || inspectionTopic.test(task.title));
    const usedOffers = vehicleOffers.filter(offer => offer.condition === 'used' || offer.condition === 'refurbished');
    if (!inspectionTasks.some(task => task.status === 'done') && (usedOffers.length || inspectionTasks.some(task => task.status !== 'done'))) add('car:inspection', 'planning', 'medium', 'Vehicle inspection review is outstanding', 'The project records a used vehicle offer or an unfinished inspection task, without a completed inspection review task.', [
      ...usedOffers.map(offer => `Offer ${offer.id}: ${offer.title}; condition: ${offer.condition}; checked: ${offer.lastCheckedAt}; source: ${offer.sourceUrl ?? 'not supplied'}.`),
      ...inspectionTasks.map(task => `Task ${task.id}: ${task.title}; status: ${task.status}.`),
    ], 'Arrange and record an appropriate inspection and history review before committing to the vehicle.');
    const purchaseAllocations = budget.categories.filter(category => vehicleCategory(category.id) && category.allocatedMinor > 0);
    const vehicleCart = project.cart.filter(item => vehicleCategory(item.category));
    const ownershipAllocations = budget.categories.filter(category => /(?:ownership|operating|running|insurance|tax|maintenance|fuel|charging|registration|parking|repair)/.test(category.id) && category.allocatedMinor > 0);
    if (!ownershipAllocations.length && (purchaseAllocations.length || vehicleCart.length || vehicleOffers.length || project.preferences.vehicleType?.trim())) add('car:ownership-costs', 'budget', 'medium', 'Vehicle ownership costs are not allocated', 'Vehicle purchase planning is recorded, but the budget has no positive allocation identified for ownership or running costs. No cost amount has been established by this check.', [
      `Scenario: car_purchase; vehicle type: ${project.preferences.vehicleType ?? 'unknown'}; use case: ${project.preferences.useCase ?? 'unknown'}.`,
      `Budget categories: ${budget.categories.map(category => `${category.id}=${category.allocatedMinor} cents`).join(', ') || 'none'}.`,
      `Recorded vehicle offers: ${vehicleOffers.map(offer => offer.id).join(', ') || 'none'}; cart items: ${vehicleCart.map(item => item.id).join(', ') || 'none'}.`,
    ], 'Estimate ownership costs for the intended vehicle and usage using actual quotes, then allocate funds.');
  }
  if (!budget.confirmed) add('budget:unconfirmed', 'planning', 'medium', 'Budget is not confirmed', 'The budget is still a planning assumption.', [`Budget total: ${budget.totalMinor} cents; confirmed: false.`], 'Confirm the spending limit and category allocations.');
  if (budget.confirmed && budget.totalMinor > 0 && budget.emergencyReserveMinor === 0) add('budget:no-reserve', 'budget', 'medium', 'No emergency reserve is allocated', 'All available funds are exposed to unexpected costs because no reserve is set aside.', [`Budget total: ${budget.totalMinor} cents; emergency reserve: 0 cents.`], 'Consider setting aside a reserve for costs that have not yet been confirmed.');
  if (budget.remainingMinor < 0) add('budget:overcommitted', 'budget', 'high', 'Selected spending exceeds the budget', 'Selected cart lines exceed the project spending limit.', [`Selected: ${budget.committedMinor} cents; budget: ${budget.totalMinor} cents.`], 'Remove or reduce selected spending, or confirm a revised budget.');
  if (budget.availableMinor < 0) add('budget:reserve-shortfall', 'budget', 'high', 'Planned spending encroaches on the reserve', 'Selected and proposed cart lines cannot all be funded while preserving the emergency reserve.', [`Selected: ${budget.committedMinor} cents; proposed: ${budget.proposedMinor} cents; reserve: ${budget.emergencyReserveMinor} cents; total: ${budget.totalMinor} cents.`], 'Reduce planned spending or explicitly revise the reserve and allocations.');
  for (const category of budget.categories) {
    if (category.committedMinor + category.proposedMinor > category.allocatedMinor) add(`budget:category:${category.id}`, 'budget', 'medium', `Allocation exceeded: ${label(category.title)}`, 'Cart spending for this category exceeds its planning allocation.', [`Category ${category.id}: allocated ${category.allocatedMinor} cents; selected ${category.committedMinor} cents; proposed ${category.proposedMinor} cents.`], 'Review the cart or rebalance category allocations.');
  }
  for (const item of project.cart) {
    if (cartIsService(item, project)) {
      if (item.deliveryCostMinor === null || item.priceStatus !== 'verified' || !item.sourceUrl) {
        const linked = cartOffer(item, project);
        add(`cart:service-fees:${item.id}`, 'budget', 'medium', `Confirm full service quote: ${label(item.title)}`, serviceFeeNote,
          [`Cart item ${item.id}; category ${item.category}; quantity ${item.quantity}; unit price ${item.unitPriceMinor} cents (${item.priceStatus}); recorded additional line charge: ${item.deliveryCostMinor ?? 'unknown'} cents.`, linked ? `Linked offer ${linked.id}; kind: ${linked.kind}; source: ${linked.sourceUrl ?? 'missing'}.` : `Manual line in service budget group ${envelope(item.category, project.budget)}; no linked offer establishes total fees.`],
          'Confirm the full service price, taxes, extra fees, scope and cancellation terms before committing.', item.sourceUrl);
      }
    } else if (item.deliveryCostMinor === null) add(`cart:delivery:${item.id}`, 'delivery', project.preferences.deliveryRequired ? 'high' : 'medium', `Delivery cost unknown: ${label(item.title)}`, 'The cart total excludes an unknown delivery charge.', [`Cart item ${item.id}; quantity ${item.quantity}; unit price ${item.unitPriceMinor} cents; delivery cost unknown; delivery required: ${project.preferences.deliveryRequired}.`], 'Confirm delivery availability and the charge for the entire line.', item.sourceUrl);
    if (item.priceStatus !== 'verified' || !item.sourceUrl) add(`cart:price:${item.id}`, 'budget', 'medium', `Price needs verification: ${label(item.title)}`, 'This cart line does not have a source-verified price.', [`Cart item ${item.id}; unit price ${item.unitPriceMinor} cents; quantity ${item.quantity}; price status ${item.priceStatus}; source ${item.sourceUrl ?? 'missing'}.`], 'Verify the current price at a checked source before selecting or paying.', item.sourceUrl);
  }
  for (const result of currentResearch(project)) {
    const serviceResearch = result.offers.length ? result.offers.every(offer => offer.kind === 'service') : serviceCategory(result.category, project.budget);
    if (isStale(result) || result.status !== 'completed' || result.mode !== 'live') add(`research:coverage:${result.category}`, 'planning', 'medium', `Research needs follow-up: ${result.category}`, 'Research for this category is stale, limited, unavailable or demonstration data.', [`Research ${result.id}; status ${result.status}; mode ${result.mode}; searched ${result.searchedAt}.`, ...result.warnings], serviceResearch ? 'Obtain current real service quotes and verify total fees, availability and terms.' : 'Obtain current real offers and verify prices, stock and delivery.');
    for (const offer of [...result.offers].sort((a, b) => compare(a.id, b.id))) {
      const evidence = `Offer ${offer.id}; price ${offer.priceMinor ?? 'unknown'} cents (${offer.priceStatus}); verification ${offer.verificationStatus}; checked ${offer.lastCheckedAt}.`;
      if (offer.kind === 'service' && result.mode === 'live' && offer.verificationStatus !== 'demo') add(`offer:terms:${offer.id}`, 'contract', 'medium', `Verify service terms: ${label(offer.title)}`, 'This service offer needs scope, payment and cancellation terms checked before booking; the project does not record confirmed contractual terms.', [evidence, `Service description: ${offer.description || 'not provided'}`], 'Obtain written scope, inclusions, payment and cancellation terms from the provider.', offer.sourceUrl);
      if (offer.kind === 'service' && result.mode === 'live' && offer.verificationStatus !== 'demo' && offer.delivery.costMinor === null) add(`offer:service-fees:${offer.id}`, 'budget', 'medium', `Confirm service total fees: ${label(offer.title)}`, serviceFeeNote, [evidence, 'No additional service charge amount or confirmation that taxes and extra fees are included is recorded.'], 'Request a full service quote including taxes and any additional fees; confirm which charges are included.', offer.sourceUrl);
      if (offer.priceStatus !== 'verified' || offer.verificationStatus !== 'source_checked' || !offer.sourceUrl) add(`offer:price:${offer.id}`, 'budget', 'medium', `Research price unverified: ${label(offer.title)}`, 'The researched price is not a checked current quote.', [evidence], 'Check the original source and obtain a confirmed price.', offer.sourceUrl);
      if (offer.kind === 'product' && (offer.delivery.available !== true || offer.delivery.costMinor === null)) add(`offer:delivery:${offer.id}`, offer.delivery.available === false ? 'transport' : 'delivery', project.preferences.deliveryRequired ? 'high' : 'medium', `Delivery needs review: ${label(offer.title)}`, offer.delivery.available === false ? 'The offer does not provide delivery.' : 'Delivery availability or its charge has not been established.', [`${evidence} Delivery available: ${offer.delivery.available}; delivery cost: ${offer.delivery.costMinor ?? 'unknown'} cents; required: ${project.preferences.deliveryRequired}.`], 'Confirm delivery or plan and price separate transport before committing.', offer.sourceUrl);
      if (offer.seller.type !== 'company' || !offer.seller.verified) add(`offer:seller:${offer.id}`, 'seller', 'medium', `Seller needs review: ${label(offer.title)}`, 'The seller information requires review before payment; this is not evidence of fraud.', [`Offer ${offer.id}; seller ${offer.seller.name ?? 'unnamed'}; type ${offer.seller.type}; verified ${offer.seller.verified}; profile ${offer.seller.publicProfileUrl ?? 'missing'}.`], 'Review the seller profile and agree on inspection and payment terms.', offer.sourceUrl);
      if (offer.availability !== 'in_stock') add(`offer:availability:${offer.id}`, 'planning', offer.availability === 'out_of_stock' ? 'high' : 'medium', `Availability needs review: ${label(offer.title)}`, 'The offer is not confirmed available for purchase.', [`Offer ${offer.id}; availability ${offer.availability}; checked ${offer.lastCheckedAt}.`], 'Confirm availability before relying on this offer.', offer.sourceUrl);
      if (project.preferences.allowUsed === false && offer.kind === 'product' && offer.condition !== 'new' && offer.condition !== 'not_applicable') add(`offer:condition:${offer.id}`, 'planning', 'medium', `Condition conflicts with preferences: ${label(offer.title)}`, 'The project disallows used items and this product is not confirmed new.', [`Offer ${offer.id}; condition ${offer.condition}; allowUsed false.`], 'Choose a confirmed new product or revise the preference.', offer.sourceUrl);
    }
  }
  return risks;
}
