/**
 * OFFLINE DEMO ADAPTER — fictional data only.
 *
 * Used only when a person chooses "Demo data" in Settings (or from the offline prompt).
 * Every offer is marked priceStatus/verificationStatus "demo", has no source link and
 * no real seller. The UI shows a persistent "Demo data" banner while this adapter is active.
 * Arithmetic here is a thin stand-in so the demo stays interactive; the real budget,
 * scenario and risk engines live in server/src/finance.ts and are never reimplemented
 * for live data.
 */
import type {
  AgentAction, Budget, CartItem, LifeProject, Offer, ResearchResult, SimulationScenario, Workspace, WorkspaceWidget,
} from '@contracts';
import { ApiError, type LifeSimApi } from './types';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
const now = () => new Date().toISOString();
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const STORE_KEY = 'lifesim.mock.projects';
const projects = new Map<string, LifeProject>(load());

function load(): [string, LifeProject][] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as [string, LifeProject][]) : [];
  } catch {
    return [];
  }
}
/** Removes every demo project from memory and this browser. */
export function clearMockProjects() {
  projects.clear();
  try {
    localStorage.removeItem(STORE_KEY);
  } catch { /* demo only */ }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...projects.entries()]));
  } catch { /* demo only */ }
}

function widget(type: WorkspaceWidget['type'], title: string, dataRef: WorkspaceWidget['dataRef'], x: number, y: number, w = 6): WorkspaceWidget {
  return { id: uid(), type, title, position: { x, y, w, h: 4 }, visible: true, dataRef, config: {} };
}

function demoOffer(category: string, kind: Offer['kind'], title: string, priceMinor: number, sellerType: Offer['seller']['type'], condition: Offer['condition'], location: string, delivery: number | null, score: number, reasons: string[]): Offer {
  return {
    id: uid(), category, kind, title, description: `${title} — fictional demo listing.`, priceMinor, currency: 'EUR', priceStatus: 'demo',
    sourceUrl: null, sourceName: 'Demo data', seller: { name: sellerType === 'private' ? 'Demo private seller' : 'Demo store', type: sellerType, publicProfileUrl: null, verified: false },
    imageUrl: null, location, delivery: { available: delivery !== null, costMinor: delivery, details: delivery === null ? 'Pickup only (demo).' : 'Delivery offered (demo).' },
    condition, availability: 'demo', lastCheckedAt: now(), verificationStatus: 'demo', recommendation: reasons.join(' '), score, evidence: ['Fictional demo offer. Not current market data.'],
  };
}

function demoOffers(category: string, kind: Offer['kind'], maxPriceMinor?: number): Offer[] {
  const catalog: Record<string, Offer[]> = {
    furniture: [
      demoOffer(category, kind, 'Pine bed frame 90 × 200 (demo)', 6900, 'company', 'new', 'Turku', 2900, 82, ['Fits your furniture envelope.', 'Delivery cost is listed.']),
      demoOffer(category, kind, 'Used sofa, 3-seat (demo)', 12000, 'private', 'used', 'Turku, Kupittaa', null, 74, ['Lower price than new equivalents.', 'Pickup required.']),
      demoOffer(category, kind, 'Desk with drawers (demo)', 8900, 'company', 'new', 'Raisio', 1900, 70, ['Close to your destination.']),
      demoOffer(category, kind, 'Dining table and 2 chairs (demo)', 4500, 'private', 'used', 'Turku, Port Arthur', null, 66, ['Very low price.', 'Condition needs checking.']),
    ],
    services: [
      demoOffer(category, 'service', 'Small-apartment moving van, 4 h (demo)', 29000, 'company', 'not_applicable', 'Turku', null, 78, ['Covers a typical one-room move.']),
      demoOffer(category, 'service', 'Van rental, self-move, 1 day (demo)', 9500, 'company', 'not_applicable', 'Turku', null, 72, ['Cheapest option if you can carry items yourself.']),
      demoOffer(category, 'service', 'Moving boxes, 20 pack (demo)', 3900, 'company', 'new', 'Turku', 900, 64, ['Needed for any moving option.']),
    ],
  };
  const list = (kind === 'service' ? catalog.services : catalog.furniture) ?? [];
  return list.filter(o => maxPriceMinor === undefined || (o.priceMinor ?? 0) <= maxPriceMinor);
}

/** Thin demo stand-in for the server budget recalculation. */
function recalc(budget: Budget, cart: CartItem[]): Budget {
  const line = (i: CartItem) => i.unitPriceMinor * i.quantity + (i.deliveryCostMinor ?? 0);
  const committed = cart.filter(i => i.status === 'selected').reduce((s, i) => s + line(i), 0);
  const proposed = cart.filter(i => i.status === 'proposed').reduce((s, i) => s + line(i), 0);
  const categories = budget.categories.map(c => ({
    ...c,
    committedMinor: cart.filter(i => i.category === c.id && i.status === 'selected').reduce((s, i) => s + line(i), 0),
    proposedMinor: cart.filter(i => i.category === c.id && i.status === 'proposed').reduce((s, i) => s + line(i), 0),
  }));
  const allocated = categories.reduce((s, c) => s + c.allocatedMinor, 0);
  const warnings = cart.filter(i => i.deliveryCostMinor === null).map(i => `Delivery cost unknown for "${i.title}"; totals exclude that charge.`);
  if (committed > budget.totalMinor - budget.emergencyReserveMinor) warnings.push('Planned spending reaches into your emergency reserve.');
  return { ...budget, categories, allocatedMinor: allocated, committedMinor: committed, proposedMinor: proposed, remainingMinor: budget.totalMinor - committed, availableMinor: budget.totalMinor - committed - proposed - budget.emergencyReserveMinor, warnings };
}

function scenarios(p: LifeProject): SimulationScenario[] {
  const committed = p.budget.committedMinor;
  const open = Math.max(0, p.budget.allocatedMinor - committed);
  const make = (id: SimulationScenario['id'], name: SimulationScenario['name'], factor: number, convenience: SimulationScenario['convenience'], effort: SimulationScenario['effort'], tradeOffs: string[]): SimulationScenario => {
    const est = Math.round(open * factor);
    const total = committed + est;
    return {
      id, name, estimatedTotalMinor: total, verifiedCostMinor: 0, estimatedCostMinor: total, remainingMinor: p.budget.totalMinor - total,
      emergencyReserveMinor: p.budget.emergencyReserveMinor, withinBudget: total + p.budget.emergencyReserveMinor <= p.budget.totalMinor,
      convenience, effort, selectedOfferIds: [], lockedCartItemIds: p.cart.map(i => i.id), risks: ['Demo estimate; no real prices.'], tradeOffs,
      missingData: ['Demo scenario derived from allocation envelopes, not offers.'], calculatedAt: now(), basedOnRevision: p.revision,
    };
  };
  return [
    make('economy', 'Economy', 0.7, 'low', 'high', ['Used furniture and a self-move van.', 'More pickups and carrying.']),
    make('balanced', 'Balanced', 0.88, 'medium', 'medium', ['Mix of new and used items.', 'Movers for heavy items only.']),
    make('comfort', 'Comfort', 1, 'high', 'low', ['New items with delivery.', 'Full-service movers.']),
  ];
}

function risks(p: LifeProject): LifeProject['risks'] {
  const list: LifeProject['risks'] = [];
  if (!p.preferences.moveDate) list.push({ id: 'moving:date', category: 'planning', severity: 'high', title: 'Exact move date is missing', explanation: 'Movers and deliveries cannot be scheduled without a date.', evidence: ['preferences.moveDate is empty (demo).'], preventiveAction: 'Set your move date in the project overview.', status: 'open', sourceUrl: null });
  if (p.budget.emergencyReserveMinor < p.budget.totalMinor * 0.1) list.push({ id: 'budget:reserve', category: 'budget', severity: 'medium', title: 'Emergency reserve is thin', explanation: 'Less than 10% of the budget is held back for surprises.', evidence: [`Reserve ${p.budget.emergencyReserveMinor / 100} EUR of ${p.budget.totalMinor / 100} EUR (demo).`], preventiveAction: 'Raise the reserve in the budget editor.', status: 'open', sourceUrl: null });
  for (const item of p.cart.filter(i => i.deliveryCostMinor === null)) list.push({ id: `cart:delivery:${item.id}`, category: 'delivery', severity: 'medium', title: `Delivery cost unknown: ${item.title}`, explanation: 'The plan total excludes an unknown delivery charge.', evidence: ['Demo cart line without delivery price.'], preventiveAction: 'Ask the seller for pickup or delivery terms.', status: 'open', sourceUrl: null });
  return list;
}

function derive(p: LifeProject) {
  p.revision += 1;
  p.updatedAt = now();
  p.budget = recalc(p.budget, p.cart);
  p.scenarios = scenarios(p);
  p.risks = risks(p);
  save();
}

function demoProject(message: string): LifeProject {
  const budgetMatch = /€?\s?(\d[\d\s,.]*)\s?(€|eur|euros?)?/i.exec(message);
  const total = budgetMatch ? Math.min(10_000_000, Math.round(Number(budgetMatch[1]!.replace(/[\s,]/g, '')) * 100)) || 200000 : 200000;
  const city = /\bto ([A-ZÅÄÖ][\wåäö-]+)/.exec(message)?.[1] ?? 'Turku';
  const reserve = Math.round(total * 0.1);
  const categories = [
    ['furniture', 'Furniture', 0.35], ['moving', 'Moving', 0.2], ['appliances', 'Appliances', 0.15], ['essentials', 'Essentials', 0.1], ['services', 'Services', 0.1],
  ] as const;
  const widgets: Workspace['widgets'] = [
    widget('budget', 'Moving budget', 'budget', 0, 0), widget('task_list', 'Moving checklist', 'tasks', 6, 0),
    widget('product_catalog', 'Furniture and essentials', 'researchResults', 0, 4, 12),
    widget('shopping_cart', 'Your moving plan', 'cart', 0, 8), widget('service_finder', 'Moving services', 'researchResults', 6, 8),
    widget('scenario_comparison', 'Compare your options', 'scenarios', 0, 12, 12),
    widget('risk_guardian', 'Life Risk Guardian', 'risks', 0, 16), widget('timeline', 'Moving timeline', 'tasks', 6, 16),
    widget('recommendations', 'Suggested next steps', 'recommendations', 0, 20, 12),
  ];
  const t = (title: string, category: string, dueDate: string | null = null) => ({ id: uid(), title, category, status: 'todo' as const, dueDate, origin: 'template' as const, notes: '' });
  const p: LifeProject = {
    id: uid(), revision: 0, title: `Move to ${city} (demo)`, scenarioType: 'moving', location: `${city}, Finland`, locale: 'en', originalMessage: message, status: 'planning',
    preferences: { moveDate: null, origin: null, householdSize: null, deliveryRequired: null, allowUsed: null, priorities: [], notes: '' },
    assumptions: ['This is a fictional demo project; nothing here is live.'], confirmedFacts: [`Budget ${total / 100} EUR`], questions: ['What is the exact move date?', 'Where are you moving from, and how many people are moving?'],
    budget: recalc({ totalMinor: total, currency: 'EUR', confirmed: true, categories: categories.map(([id, title, share]) => ({ id, title, allocatedMinor: Math.round(total * share), committedMinor: 0, proposedMinor: 0 })), emergencyReserveMinor: reserve, allocatedMinor: 0, committedMinor: 0, proposedMinor: 0, remainingMinor: total, availableMinor: 0, warnings: [] }, []),
    cart: [],
    tasks: [t('Confirm move date and addresses', 'moving'), t('Give notice on current lease', 'planning'), t('List furniture you need', 'furniture'), t('Compare moving quotes', 'moving'), t('Update address with Posti and DVV', 'documents'), t('Set up electricity contract', 'services'), t('Buy home insurance', 'services')],
    workspace: { id: uid(), version: 1, title: `Move to ${city}`, widgets, updatedAt: now() },
    researchResults: [], risks: [], scenarios: [], actions: [],
    recommendations: ['Set your move date so services can be scheduled.', 'Research beds first: it is the largest single furniture purchase.', 'Keep at least 10% of the budget as an emergency reserve.'],
    aiMode: 'local', createdAt: now(), updatedAt: now(),
  };
  p.scenarios = scenarios(p);
  p.risks = risks(p);
  return p;
}

function get(id: string) {
  const p = projects.get(id);
  if (!p) throw new ApiError('NOT_FOUND', 'Demo project not found', 404);
  return p;
}
const cartResponse = (p: LifeProject) => clone({ items: p.cart, budget: p.budget, revision: p.revision });

export const mockApi: LifeSimApi = {
  async homeInsurance(id){const p=get(id);return {status:{available:false,environment:'unavailable',message:'Live If quotes are unavailable in demo mode. Use a connected backend with approved If partner access.',documentationUrl:'https://developer.if-insurance.com/apis/property/householder-insurance-apis-finland/documentation'},state:p.homeInsurance??{details:{},quote:null,expense:null}};},
  async saveInsuranceDetails(id,details){const p=get(id);p.homeInsurance={details,quote:null,expense:null};derive(p);return clone(p);},
  async requestInsuranceQuote(){throw new ApiError('IF_ACCESS_UNAVAILABLE','Live If quotes are unavailable in demo mode.',503);},
  async addInsuranceExpense(){throw new ApiError('IF_QUOTE_MISSING','A live If quote is required.',409);},
  async removeInsuranceExpense(id){const p=get(id);if(p.homeInsurance)p.homeInsurance.expense=null;derive(p);return clone(p);},
  source: 'mock',
  async health() {
    return { status: 'ok', ready: true, contractVersion: '1.0.0', configuration: { ai: 'local', research: 'demo', storage: 'memory', authentication: false } };
  },
  async createProject(input) {
    await wait(1800);
    const p = demoProject(input.message);
    projects.set(p.id, p);
    save();
    return clone({ project: p, workspace: p.workspace, questions: p.questions });
  },
  async getProject(id) {
    await wait(150);
    return clone(get(id));
  },
  async patchProject(id, patch) {
    const p = get(id);
    if (patch.title) p.title = patch.title;
    if (patch.location) p.location = patch.location;
    if (patch.status) p.status = patch.status;
    if (patch.preferences) p.preferences = { ...p.preferences, ...patch.preferences };
    if (patch.budget) {
      const total = patch.budget.totalMinor ?? p.budget.totalMinor;
      const reserve = patch.budget.emergencyReserveMinor ?? p.budget.emergencyReserveMinor;
      const cats = patch.budget.categories ?? p.budget.categories;
      if (cats.reduce((s, c) => s + c.allocatedMinor, 0) + reserve > total) throw new ApiError('VALIDATION_ERROR', 'Allocations plus reserve exceed the total budget', 400);
      p.budget = { ...p.budget, totalMinor: total, emergencyReserveMinor: reserve, categories: cats.map(c => ({ ...c, committedMinor: 0, proposedMinor: 0 })) };
    }
    for (const t of patch.tasks ?? []) {
      const task = p.tasks.find(x => x.id === t.id);
      if (task) task.status = t.status;
    }
    if (p.preferences.moveDate) p.questions = p.questions.filter(q => !/move date/i.test(q));
    if (p.preferences.origin && p.preferences.householdSize) p.questions = p.questions.filter(q => !/moving from/i.test(q));
    derive(p);
    return clone(p);
  },
  async assistant(id, request) {
    await wait(1200);
    const p = get(id);
    const lower = request.message.toLowerCase();
    const actions: AgentAction[] = [];
    let reply = 'In demo mode I can propose layout changes and searches. Connect the live service for full planning.';
    const hideTarget = p.workspace.widgets.find(w => lower.includes('hide') && lower.includes(w.type.split('_')[0]!));
    if (hideTarget) {
      actions.push({ id: uid(), command: { type: 'update_workspace', arguments: { widgets: [{ id: hideTarget.id, visible: false }] } }, status: 'proposed', requiresConfirmation: true, explanation: `Hide “${hideTarget.title}”. Your data stays unchanged.`, result: null, createdAt: now() });
      reply = `I can hide ${hideTarget.title} for you.`;
    } else if (/cheap|furniture|bed|sofa|search|find/.test(lower)) {
      actions.push({ id: uid(), command: { type: 'research_products', arguments: { category: 'furniture', maxPrice: 150, kind: 'product', preferences: ['lowest price'] } }, status: 'proposed', requiresConfirmation: true, explanation: 'Search demo furniture under €150.', result: null, createdAt: now() });
      reply = 'I can search for cheaper furniture options.';
    } else if (/mov(er|ing)|van|transport/.test(lower)) {
      actions.push({ id: uid(), command: { type: 'research_services', arguments: { category: 'moving', kind: 'service', preferences: ['compare cheapest'] } }, status: 'proposed', requiresConfirmation: true, explanation: 'Compare demo moving services.', result: null, createdAt: now() });
      reply = 'I can compare moving options for you.';
    }
    p.actions.push(...actions);
    save();
    return clone({ reply, proposedActions: actions, workspacePatch: null });
  },
  async research(id, request) {
    await wait(2500);
    const p = get(id);
    const result: ResearchResult = {
      id: uid(), category: request.category, status: 'completed', mode: 'demo', offers: demoOffers(request.category, request.kind ?? 'product', request.maxPrice ? Math.round(request.maxPrice * 100) : undefined),
      warnings: ['Fictional demo offers. Not current market data; no real sellers.'], searchedAt: now(), query: `${request.category} in ${request.location ?? p.location} (demo)`,
    };
    p.researchResults = [...p.researchResults, result].slice(-30);
    derive(p);
    return clone(result);
  },
  async addCartItem(id, request) {
    const p = get(id);
    if ('offerId' in request) {
      const offer = p.researchResults.flatMap(r => r.offers).find(o => o.id === request.offerId);
      if (!offer || offer.priceMinor === null) throw new ApiError('NOT_FOUND', 'Offer not found', 404);
      if (p.cart.some(i => i.offerId === offer.id)) throw new ApiError('CONFLICT', 'Offer already in your plan; update its quantity', 409);
      p.cart.push({ id: uid(), offerId: offer.id, title: offer.title, category: offer.category, quantity: request.quantity ?? 1, unitPriceMinor: offer.priceMinor, deliveryCostMinor: offer.delivery.costMinor, currency: 'EUR', status: request.status ?? 'selected', sourceUrl: null, priceStatus: 'demo', addedAt: now() });
    } else {
      p.cart.push({ id: uid(), offerId: null, title: request.title, category: request.category, quantity: request.quantity ?? 1, unitPriceMinor: request.unitPriceMinor, deliveryCostMinor: request.deliveryCostMinor ?? null, currency: 'EUR', status: request.status ?? 'selected', sourceUrl: request.sourceUrl ?? null, priceStatus: 'estimated', addedAt: now() });
    }
    derive(p);
    return cartResponse(p);
  },
  async patchCartItem(id, itemId, patch) {
    const p = get(id);
    const item = p.cart.find(i => i.id === itemId);
    if (!item) throw new ApiError('NOT_FOUND', 'Cart item not found', 404);
    Object.assign(item, patch);
    derive(p);
    return cartResponse(p);
  },
  async deleteCartItem(id, itemId) {
    const p = get(id);
    p.cart = p.cart.filter(i => i.id !== itemId);
    derive(p);
    return cartResponse(p);
  },
  async recalculateScenarios(id) {
    const p = get(id);
    derive(p);
    return clone({ scenarios: p.scenarios });
  },
  async patchWorkspace(id, patch) {
    const p = get(id);
    for (const w of patch.widgets) {
      const target = p.workspace.widgets.find(x => x.id === w.id);
      if (!target) throw new ApiError('NOT_FOUND', 'Widget not found', 404);
      Object.assign(target, Object.fromEntries(Object.entries(w).filter(([k, v]) => k !== 'id' && v !== undefined)));
    }
    p.workspace.updatedAt = now();
    derive(p);
    return clone({ workspace: p.workspace, revision: p.revision });
  },
  async sellerMessage(id, request) {
    await wait(400);
    const p = get(id);
    const offer = p.researchResults.flatMap(r => r.offers).find(o => o.id === request.offerId);
    if (!offer) throw new ApiError('NOT_FOUND', 'Offer not found', 404);
    return { draft: `Hi! Is “${offer.title}” still available? Could pickup in ${p.location ?? 'Turku'} this Saturday work? Please confirm the condition and final price. Thanks!`, handoffUrl: null, sent: false, warnings: ['Fictional demo offer; no real seller is available.', 'This is a draft. Copy and send it yourself after review.'] };
  },
  async confirmAction(id, actionId, body) {
    await wait(500);
    const p = get(id);
    const action = p.actions.find(a => a.id === actionId);
    if (!action) throw new ApiError('NOT_FOUND', 'Action not found', 404);
    if (action.status !== 'proposed') throw new ApiError('CONFLICT', 'This action has already been reviewed', 409);
    if (!body.approved) {
      action.status = 'rejected';
      action.result = 'Declined by user.';
    } else {
      const c = action.command;
      if (c.type === 'update_workspace') {
        for (const w of c.arguments.widgets) {
          const target = p.workspace.widgets.find(x => x.id === w.id);
          if (target && w.visible !== undefined) target.visible = w.visible;
        }
        action.result = 'Workspace layout updated.';
      } else if (c.type === 'research_products' || c.type === 'research_services') {
        const offers = demoOffers(c.arguments.category, c.type === 'research_services' ? 'service' : 'product', c.arguments.maxPrice ? Math.round(c.arguments.maxPrice * 100) : undefined);
        p.researchResults.push({ id: uid(), category: c.arguments.category, status: 'completed', mode: 'demo', offers, warnings: ['Fictional demo offers.'], searchedAt: now(), query: `${c.arguments.category} (demo)` });
        action.result = `completed: ${offers.length} demo offers.`;
      } else action.result = 'Applied (demo).';
      action.status = 'applied';
    }
    derive(p);
    return clone(p);
  },
};
