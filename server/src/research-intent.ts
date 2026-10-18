import {researchStrategy} from './research-strategy.js';
import type { LifeProject, Offer, ResearchRequest } from '../../shared/contracts/index.js';

type Focus = 'rental' | 'insurance' | 'bed' | 'car' | 'accommodation' | 'travel_transport' | 'moving' | 'furniture' | 'generic';
export type ResearchPlan = ReturnType<typeof planResearch>;
export type LocationFit = { status: 'match' | 'national' | 'unknown' | 'conflict'; location: string | null; reason: string };
export const normalized = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const contains = (text: string, phrase: string) => (` ${normalized(text)} `).includes(` ${normalized(phrase)} `);
const furnitureRules: Record<string, { match: RegExp; avoid: RegExp }> = {
  sofa: { match: /\b(sofa|sofas|couch|couches|sohva)\b/, avoid: /\b(cover|covers|cushion|toy|doll)\b/ },
  desk: { match: /\b(desk|desks|writing table|tyopoyta)\b/, avoid: /\b(lamp|lamps|organizer|toy|doll)\b/ },
  chair: { match: /\b(chair|chairs|armchair|tuoli)\b/, avoid: /\b(cover|covers|cushion|toy|doll)\b/ },
  table: { match: /\b(table|tables|poyta)\b/, avoid: /\b(tablecloth|cloth|cover|covers|toy|doll)\b/ },
  wardrobe: { match: /\b(wardrobe|wardrobes|closet|vaatekaappi)\b/, avoid: /\b(hanger|hangers|toy|doll)\b/ },
};
const furnitureRule = (category: string) => furnitureRules[normalized(category).replace(/s$/, '')];
export function samePlace(a: string, b: string): boolean {
  const city = (value: string) => value.split(',')[0]!.trim();
  return contains(a, b) || contains(b, a) || contains(a, city(b)) || contains(b, city(a));
}

function focusFor(request: ResearchRequest, project: LifeProject): Focus {
  const category = normalized(request.category);
  if(/\b(?:insurance|protection|vakuutus)\b/.test(category))return 'insurance';
  if(/\b(?:rental|rent|apartments?|housing)\b/.test(category)&&project.scenarioType!=='travel')return 'rental';
  if (/\b(beds?|mattress(?:es)?|sanky|patja)\b/.test(category)) return 'bed';
  if (project.scenarioType === 'travel' && /\b(accommodations?|lodging|hotels?|hostels?|housing|stay)\b/.test(category)) return 'accommodation';
  if (project.scenarioType === 'travel' && /\b(transport|transportation|flights?|trains?|tickets?|travel)\b/.test(category)) return 'travel_transport';
  if ((/\b(car|cars|vehicle|vehicles)\b/.test(category)||(project.scenarioType==='car_purchase'&&/\b(purchase|transport)\b/.test(category))) &&
    !/\b(insurance|repairs?|maintenance|fuel|tax|registration|financing)\b/.test(category)) return 'car';
  if (request.kind === 'service' && /\b(moving|movers?|removals?|transport|muutto\w*|kuljetus\w*)\b/.test(category)) return 'moving';
  if (/\b(furniture|furnishing|furnishings)\b/.test(category)) return 'furniture';
  if (/\b(housing|accommodations?|lodging)\b/.test(category)) return 'accommodation';
  return 'generic';
}

const focusTerms: Record<Focus, string> = {
  rental:'rental apartment vuokra asunto monthly rent', insurance:'official If Finland home insurance general coverage terms not personalized quote',
  bed: 'bed mattress bed frame', car: 'car for sale purchase', accommodation: 'accommodation hotel apartment hostel',
  travel_transport: 'passenger transport flights train bus ferry tickets', moving: 'moving removals muutto muuttopalvelu kuljetus service',
  furniture: 'home furniture', generic: '',
};

export function planResearch(request: ResearchRequest, project: LifeProject) {
  const p = project.preferences;
  const focus = focusFor(request, project);
  const focusBudget = focus === 'car' ? /\b(vehicle|purchase|car)\b/ :
    focus === 'accommodation' ? /\b(accommodation|housing|lodging)\b/ :
    focus === 'travel_transport' ? /\btransport\b/ :
    focus === 'moving' ? /\bmoving\b/ : null;
  const allocation = project.budget.categories.find(c => c.id === request.category) ??
    (focusBudget ? project.budget.categories.find(c => focusBudget.test(normalized(`${c.id} ${c.title}`))) : undefined) ??
    (['bed', 'furniture'].includes(focus) || furnitureRule(request.category) ? project.budget.categories.find(c => c.id === 'furniture') : undefined);
  const categoryRemainingMinor = allocation && (allocation.allocatedMinor > 0 || project.budget.confirmed)
    ? Math.max(0, allocation.allocatedMinor - allocation.committedMinor - allocation.proposedMinor) : null;
  const maxItemMinor = request.maxPrice === undefined ? null : Math.round(request.maxPrice * 100);
  const limits = [maxItemMinor, categoryRemainingMinor, project.budget.totalMinor > 0 || project.budget.confirmed ? Math.max(0, project.budget.availableMinor) : null]
    .filter((v): v is number => v !== null);
  const planningLimitMinor = limits.length ? Math.min(...limits) : null;
  const location = request.location ?? project.location;
  const attributes = [...new Set([...request.preferences, ...p.priorities,
    ...(p.vehicleType && focus === 'car' ? [p.vehicleType] : []), ...(p.useCase ? [p.useCase] : [])])].filter(Boolean);
  const dates = { startDate: p.startDate ?? null, endDate: p.endDate ?? null, durationDays: p.durationDays ?? null, moveDate: p.moveDate };
  const category = allocation?.id === request.category ? allocation.title : request.category.replace(/[_-]/g, ' ');
  const strategy=researchStrategy({category:request.category,focus,condition:request.condition??(p.allowUsed===false?'new':'any'),purpose:request.purpose??'offers',location,origin:p.origin,ceilingMinor:maxItemMinor??planningLimitMinor,period:request.pricePeriod??'one_time',dates,travelers:p.travelers,attributes});
  const queries=strategy.queries;
  return { scenarioType: project.scenarioType, goal: { title: project.title, originalMessage: project.originalMessage },
    category: { id: request.category, title: category, focus }, location, origin: p.origin, dates,
    travelers: p.travelers ?? null, householdSize: p.householdSize,
    budget: { maxItemMinor, categoryRemainingMinor, projectAvailableMinor: project.budget.availableMinor, planningLimitMinor },
    constraints:{condition:request.condition??(p.allowUsed===false?'new':'any'),localOnly:request.localOnly===true,limit:request.limit??15,sort:request.sort??'recommended',pricePeriod:request.pricePeriod??'one_time',purpose:focus==='insurance'?'information':request.purpose??'offers'},
    preferences: { allowUsed: p.allowUsed, deliveryRequired: p.deliveryRequired, priorities: p.priorities,
      requested: request.preferences, notes: p.notes, ownsFurniture: p.ownsFurniture ?? null, ownedItems: p.ownedItems ?? [],
      vehicleType: p.vehicleType ?? null, useCase: p.useCase ?? null }, attributes, queries, strategy, excludedSources:(project.researchFeedback??[]).filter(f=>f.type!=='useful').slice(-20).map(f=>f.sourceKey),
  };
}

/** This is lexical relevance, never model self-assessment or an assertion of specifications. */
export function assessRelevance(title: string, plan: ResearchPlan, sameOfferContext = ''): { points: number; reason: string; excluded: boolean } {
  const t = normalized(title);
  const context = normalized(sameOfferContext);
  const reject = (reason: string) => ({ points: 0, reason, excluded: true });
  const accept = (reason: string) => ({ points: 25, reason, excluded: false });
  switch (plan.category.focus) {
    case 'rental':return /\b(?:apartment|rental|rent|studio|flat|vuokra|asunto|yksio|kaksio)\b/.test(t)?accept('title identifies rental housing'):reject('title does not identify rental housing');
    case 'insurance':return /\b(?:insurance|home|coverage|kotivakuutus|vakuutus|moving)\b/.test(t)?accept('official insurance information'):reject('title does not identify insurance information');
    case 'bed':
      if (/\b(bed ?linen|bedding|bed ?sheets?|duvet|pillow|protector|bedside|nightstand|headboard only|dog|pet|doll|toy)\b/.test(t)) return reject('bed search excludes linen, accessories, and pet/toy beds');
      return /\b(beds?|mattress(?:es)?|sanky|patja)\b/.test(t) ? accept('title names a bed, frame, or mattress') : reject('title does not identify a bed or mattress');
    case 'car':
      if (/\b(toy|toys|diecast|miniature|model car|rc car|remote control|scale model|1 43|1 24|1 18|rental|rent|lease|leasing|insurance|repair|maintenance|parts?|tyres?|tires?|accessories|car cover)\b/.test(t)) return reject('vehicle purchase excludes toys, rentals, leases, insurance, and parts/repair services');
      return /\b(car|cars|vehicle|suv|sedan|hatchback|estate|electric|hybrid|toyota|volvo|volkswagen|vw|skoda|ford|bmw|audi|tesla|nissan|kia|hyundai|mercedes|peugeot|renault|honda|opel|fiat|mazda|seat|dacia|citroen)\b/.test(t)
        ? accept('title identifies a purchase vehicle') : reject('title does not identify a purchase vehicle');
    case 'accommodation':
      if (/\b(bed ?linen|bedding|furniture|bed frame|sofa|toy)\b/.test(t)) return reject('accommodation excludes furniture and accessories');
      if (/\b(hotel|hostel|apartments?|accommodation|guesthouse|guest house|room|studio|cottage|lodging|dormitory|residence|resort|camping|stay|motel)\b/.test(t)) return accept('title identifies accommodation');
      if (/\b(bed ?linen|bedding|furniture|bed frame|sofa|toy|accessories|accessory)\b/.test(context)) return reject('accommodation context identifies goods or accessories');
      return /\b(hotels?|hostels?|apartments?|accommodation|guesthouse|guest house|rooms?|studios?|cottages?|lodging|dormitory|residence|resorts?|camping|motel)\b/.test(context)
        ? accept('same cited offer description identifies accommodation') : reject('title and same-offer description do not identify accommodation');
    case 'travel_transport':
      if (/\b(moving|removal|cargo|freight|furniture|toy|parts)\b/.test(t)) return reject('travel transport excludes freight, moving, and unrelated goods');
      return /\b(flight|airline|airways|train|rail|bus|coach|ferry|ticket|passenger|transfer|car rental|rental car)\b/.test(t)
        ? accept('title identifies passenger transport') : reject('title does not identify passenger transport');
    case 'moving':
      // Finnish compounds and inflections are common service titles. A bare route
      // (for example “Helsinki–Turku”) still has none of these service markers.
      return /\b(moving|mover|movers|removal|removals|transport|van hire|\w*muut(?:to|ot)\w*|kuljetus\w*)\b/.test(t)
        ? accept('title identifies a moving or transport service') : reject('title does not identify a moving service');
    case 'furniture':
      return /\b(chair|table|desk|sofa|couch|bed|mattress|wardrobe|shelf|shelves|bookcase|furniture|dresser|stool|armchair|cabinet)\b/.test(t) &&
        !/\b(toy|doll|cover|bed ?linen|bedding)\b/.test(t) ? accept('title identifies furniture') : reject('title does not identify furniture');
    default: {
      const rule = furnitureRule(plan.category.id);
      if (rule) return rule.match.test(t) && !rule.avoid.test(t) ? accept(`title identifies the requested ${plan.category.id}`) : reject(`title does not identify the requested ${plan.category.id} itself`);
      const terms = normalized(plan.category.id).split(' ').filter(t => t.length > 2);
      return terms.some(term => contains(t, term) || contains(t, `${term}s`)) ? accept('title matches a requested category term') :
        { points: 10, reason: 'category relevance is uncertain; no supported specialist rule', excluded: false };
    }
  }
}

export function nationalDelivery(text: string): boolean {
  return /\b(?:nationwide|national delivery|delivery (?:throughout|across)|shipping (?:throughout|across)|ships? nationwide)\b/i.test(text) &&
    !/\b(?:not nationwide|no national delivery|except|excluding|if|minimum|orders? over)\b/i.test(text);
}

function hasExplicitLocality(value: string): boolean {
  // Landmark, neighborhood, and street-only strings can locate an offer inside
  // a city, but cannot establish which city without geocoding.
  return !/\b(near|nearby|close to|next to|by|via|street|st|road|rd|avenue|ave|district|neighbou?rhood|station|airport|landmark|area|piazza|square)\b/.test(normalized(value));
}

export function assessLocation(plan: ResearchPlan, text: string, reported: string | null, origin: string | null, delivery: boolean | null): LocationFit {
  const route = ['travel_transport', 'moving'].includes(plan.category.focus);
  const matched = reported ?? (route
    ? /\b(?:destination|arrival)\s*:\s*([^.;\n]{2,100})/i.exec(text)?.[1]?.trim()
    : /\b(?:located in|location\s*:|pickup (?:only )?(?:in|from|at)|(?:hotel|hostel|apartment|accommodation|room|cottage)(?: is)? in)\s*([^.;\n]{2,100})/i.exec(text)?.[1]?.trim()) ?? null;
  const location = matched && !/^(unknown|not stated|not specified|n\/?a)$/i.test(matched) ? matched : null;
  if (route && plan.origin && origin && !samePlace(plan.origin, origin)) return { status: 'conflict', location, reason: `reported route origin ${origin} conflicts with requested ${plan.origin}` };
  if (!plan.location) return { status: 'unknown', location, reason: 'requested location is unknown' };
  if (location && samePlace(location, plan.location)) return { status: 'match', location, reason: `reported location matches ${plan.location}` };
  // Do not infer a country from a city name. A city-only result cannot be said
  // to conflict with a country-wide request absent explicit country evidence.
  const countryAliases: Record<string, string[]> = {
    finland: ['finland', 'suomi'], sweden: ['sweden', 'sverige'], norway: ['norway', 'norge'],
    denmark: ['denmark', 'danmark'], estonia: ['estonia', 'eesti'], germany: ['germany', 'deutschland'],
    france: ['france'], spain: ['spain', 'espana'], italy: ['italy', 'italia'],
  };
  const requestedCountry = countryAliases[normalized(plan.location)];
  if (requestedCountry) {
    const explicitCountry = location && Object.values(countryAliases).flat().find(country => contains(location, country));
    if (explicitCountry && requestedCountry.includes(explicitCountry)) return {status:'match',location,reason:`reported country matches ${plan.location}`};
    if (!explicitCountry) return { status: 'unknown', location, reason: `reported locality does not establish country coverage for ${plan.location}` };
    return { status: 'conflict', location, reason: `reported country ${explicitCountry} conflicts with requested ${plan.location}` };
  }
  if (location && !hasExplicitLocality(location)) {
    return { status: 'unknown', location, reason: `reported address or landmark does not establish a city conflict with ${plan.location}` };
  }
  if (!['accommodation', 'travel_transport', 'moving'].includes(plan.category.focus) && (delivery === true || nationalDelivery(text))) {
    return { status: delivery === true ? 'match' : 'national', location,
      reason: delivery === true ? 'reported delivery covers the destination' : 'national delivery is reported; destination coverage still needs confirmation' };
  }
  if (location) return { status: 'conflict', location, reason: `reported location ${location} conflicts with requested ${plan.location}` };
  return { status: 'unknown', location: null, reason: 'no supported locality or destination coverage was reported' };
}

export function matchedAttributes(plan: ResearchPlan, text: string): string[] {
  const normalizedText = normalized(text);
  return plan.attributes.filter(attribute => {
    const tokens = normalized(attribute).split(' ').filter(t => t.length >= 3 && !['with', 'for', 'the', 'and', 'prefer', 'need', 'want', 'only'].includes(t));
    return tokens.length > 0 && tokens.every(token => contains(normalizedText, token) &&
      !new RegExp(`\\b(?:no|not|without) (?:\\w+ ){0,2}${token}\\b`).test(normalizedText));
  });
}

export function knownCost(offer: Offer): number | null {
  return offer.priceMinor === null ? null : offer.priceMinor + (offer.delivery.costMinor ?? 0);
}
