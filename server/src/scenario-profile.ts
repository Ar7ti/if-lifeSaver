import {PreferencesSchema, ScenarioTypeSchema, TaskInputSchema, WidgetTypeSchema, type ScenarioType, type WorkspaceWidget} from '../../shared/contracts/index.js';
import type {z} from 'zod';

type Preferences = z.infer<typeof PreferencesSchema>;
type TaskInput = z.infer<typeof TaskInputSchema>;
type Category = {id: string; title: string; reason: string; weight: number};
type Detail = {title: string; explanation: string; priority: 'high'|'medium'|'low'; action: string; reason: string};
export type ScenarioProfile = {scenarioType: ScenarioType; title: string; location: string|null; budgetMinor: number|null; preferences: Preferences; categories: Category[]; widgetTypes: WorkspaceWidget['type'][]; questions: string[]; tasks: TaskInput[]; recommendations: string[]; recommendationDetails: Detail[]};

const clean = (s: string) => s.trim().replace(/[.,!?;:]+$/, '').slice(0, 200);
const date = (s: string) => PreferencesSchema.shape.moveDate.safeParse(s).success ? s : null;
const task = (title: string, category: string): TaskInput => ({title, category, dueDate: null, notes: ''});
const numberWords: Record<string,number> = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};
const countValue = (value: string) => /^\d+$/.test(value) ? Number(value) : numberWords[value.toLowerCase()] ?? null;

function euroBudget(message: string): number|null {
  const clause = /\b(?:budget|can spend|have to spend|spending limit|with)\b[^.!?\n]{0,100}/i.exec(message)?.[0] ?? '';
  if (/\$|£|\b(?:usd|dollars?|gbp|pounds?|cad|aud|sek|kronor|krona|jpy|yen)\b/i.test(clause)) return null;
  const goalLimit = /\b(?:buy|buying|purchase|purchasing)\b[^.!?\n]{0,70}\b(?:car|vehicle|van|suv)\b|\b(?:travel|trip|holiday|vacation)\b/i.test(message);
  const amount = String.raw`([0-9]{1,3}(?:[.,\s][0-9]{3})+|[0-9]+)(?:([.,])([0-9]{1,2}))?`;
  const match = [
    new RegExp(String.raw`\b(?:budget|can spend|have to spend|spending limit)\s*(?:of|is|:|around|about)?\s*(?:€|EUR\s*)?\s*${amount}\s*(?:€|euros?\b|eur\b)?`, 'i'),
    new RegExp(String.raw`\bwith\s+(?:€|EUR\s*)\s*${amount}`, 'i'),
    new RegExp(String.raw`\bwith\s+${amount}\s*(?:€|euros?\b|eur\b)`, 'i'),
    ...(goalLimit ? [new RegExp(String.raw`\b(?:under|up to|no more than|maximum|max)\s*(?:€|EUR\s*)\s*${amount}\s*(?:€|euros?\b|eur\b)?`, 'i')] : []),
    ...(/\b(?:buy|buying|purchase|purchasing)\b[^.!?\n]{0,70}\b(?:car|vehicle|van|suv)\b/i.test(message)
      ? [new RegExp(String.raw`\b(?:car|vehicle|van|suv)\b[^.!?\n]{0,35}\bfor\s*(?:€|EUR\s*)\s*${amount}\s*(?:€|euros?\b|eur\b)?`, 'i')] : []),
  ].map(re => re.exec(message)).find(Boolean);
  if (!match) return null;
  const minor = Number(match[1]!.replace(/[.,\s]/g, '')) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor <= 1_000_000_000 ? minor : null;
}

function scenario(message: string): ScenarioType {
  if (/\b(?:buy|buying|purchase|purchasing|looking for|need)\b[^.!?\n]{0,50}\b(?:car|vehicle|van|suv)\b|\b(?:car|vehicle) purchase\b/i.test(message)) return 'car_purchase';
  if (/\b(?:travel|trip|holiday|vacation|visit|flight|hotel|nights? abroad)\b/i.test(message)) return 'travel';
  if (/\b(?:furnish|furnishing|furniture|decorate|bedroom setup|buy a sofa)\b/i.test(message) && !/\b(?:mov(?:e|ing)|relocat(?:e|ion|ing))\b/i.test(message)) return 'home_furnishing';
  if (/\b(?:student|university|college|campus|semester|dorm|studies|studying|course|courses|tuition)\b/i.test(message)) return 'student_life';
  if (/\b(?:mov(?:e|ing)|relocat(?:e|ion|ing)|muut(?:to|an|taa))\b/i.test(message)) return 'moving';
  return 'other';
}

function destination(message: string, type: ScenarioType): string|null {
  if (type === 'car_purchase') return clean(/\b(?:in|near|around)\s+([\p{L}][\p{L} '-]{1,70}?)(?=\s+(?:under|for|with|budget|to)|[,.!?]|$)/iu.exec(message)?.[1] ?? '') || null;
  if (type === 'travel') {
    const route = /\b(?:travel|traveling|trip|fly|flying)\s+from\s+[\p{L}][\p{L} '-]{1,70}?\s+to\s+([\p{L}][\p{L} '-]{1,70}?)(?=\s+(?:for|on|in|with|under|budget)|[,.!?]|$)/iu.exec(message);
    if (route?.[1]) return clean(route[1]);
  }
  const verb = type === 'moving' ? String.raw`(?:mov(?:e|ing)\s+to|relocat(?:e|ing)\s+to|muut(?:an|taa|to)\s+)`
    : type === 'travel' ? String.raw`(?:travel(?:ing)?\s+to|trip\s+to|visit(?:ing)?\s+|holiday\s+in|vacation\s+in|fly(?:ing)?\s+to)`
    : type === 'student_life' ? String.raw`(?:stud(?:y|ying)\s+in|university\s+in|college\s+in)` : '';
  if (!verb) return null;
  const match = new RegExp(String.raw`\b${verb}\s*([\p{L}][\p{L} '-]{1,70}?)(?=\s+(?:next|this|in|on|by|with|for|budget|and|from|in\s+\d|for\s+\d)|[,.!?]|$)`, 'iu').exec(message);
  const place = clean(match?.[1] ?? '');
  return /^turku$/i.test(place) ? 'Turku, Finland' : place || null;
}

function inferredPreferences(message: string, type: ScenarioType, base?: Preferences): Preferences {
  const dates = [...message.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)].map(m => date(m[0])).filter((v): v is string => !!v);
  const count = /\b(?:for|with)\s+(\d{1,2})\s+(?:people|persons|travelers|travellers|guests)\b|\b(\d{1,2})\s+(?:of us|travelers|travellers|people)\b/i.exec(message);
  const nights = /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+nights?\b/i.exec(message);
  const days = /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+days?\b/i.exec(message);
  const origin = /\bfrom\s+([\p{L}][\p{L} '-]{1,70}?)(?=\s+(?:to|next|this|with|on|in)|[,.!?]|$)/iu.exec(message)?.[1]?.trim() ?? null;
  const daySpan = dates.length > 1 ? Math.round((Date.parse(`${dates[1]}T00:00:00Z`) - Date.parse(`${dates[0]}T00:00:00Z`))/86400000)+1 : null;
  const inferredEnd = type === 'travel' && dates[0] && nights ? new Date(Date.parse(`${dates[0]}T00:00:00Z`) + countValue(nights[1]!)!*86400000).toISOString().slice(0,10) : null;
  const deliveryRequired = /\b(?:no delivery|delivery (?:is )?not (?:needed|required)|(?:do not|don't) (?:need|require) delivery|pickup (?:is )?(?:fine|okay|ok)|(?:can|will) collect)\b/i.test(message) ? false
    : /\b(?:need|require|must have|want)\s+(?:home\s+)?delivery\b|\bdelivery\s+(?:is\s+)?(?:required|needed)\b/i.test(message) ? true : null;
  const allowUsed = /\b(?:new only|only new|no used|avoid used|no secondhand|no second-hand)\b/i.test(message) ? false
    : /\b(?:used|secondhand|second-hand)\s+(?:is\s+)?(?:fine|okay|ok|allowed|acceptable)\b|\b(?:open to|allow)\s+(?:used|secondhand|second-hand)\b|\b(?:used|secondhand|second-hand)\s+(?:car|vehicle|van|suv)\b/i.test(message) ? true : null;
  const ownedItems = new Set((base?.ownedItems ?? []).map(x => x.toLowerCase()));
  const ownClause = /\b(?:I|we)\s+(?:already\s+)?(?:own|have|bring|keep)\s+([^.!?\n]{1,100})/gi;
  for (const match of message.matchAll(ownClause)) {
    const clause = match[1]!.split(/\b(?:but|so|and need|and want|for|to buy)\b/i)[0]!;
    for (const item of ['bed','desk','sofa','table','chair','wardrobe','mattress','car']) if (new RegExp(`\\b${item}s?\\b`, 'i').test(clause)) ownedItems.add(item);
  }
  const ownsFurniture = /\b(?:already own|own|have|bringing|bring|keeping|keep)\s+(?:all|my|our|the)?\s*furniture\b/i.test(message) ? true
    : /\b(?:no furniture|need (?:all|new) furniture|furnish from scratch)\b/i.test(message) ? false : null;
  const vehicleType = /\b(?:(?:reliable|used|new|electric|hybrid|family|small)\s+){1,3}(?:car|vehicle|van|suv)\b/i.exec(message)?.[0] ?? null;
  const inferred = {
    moveDate: type === 'moving' ? dates[0] ?? null : null, origin: type === 'moving' || type === 'travel' ? origin : null, householdSize: type === 'moving' && count ? Number(count[1] ?? count[2]) : null,
    deliveryRequired, allowUsed, priorities: [], notes: type === 'moving' && /\bnext month\b/i.test(message) ? 'User said the move is next month; exact date is not specified.' : '',
    startDate: type === 'travel' ? dates[0] ?? null : null, endDate: type === 'travel' ? dates[1] ?? inferredEnd : null,
    durationDays: type === 'travel' ? days ? countValue(days[1]!) : nights ? countValue(nights[1]!)!+1 : daySpan && daySpan > 0 ? daySpan : null : null, travelers: type === 'travel' && count ? Number(count[1] ?? count[2]) : null,
    ownsFurniture, ownedItems: [...ownedItems], vehicleType: type === 'car_purchase' ? vehicleType : null, useCase: null,
  };
  const saved = <K extends keyof Preferences>(key: K, value: Preferences[K]): Preferences[K] => base && Object.prototype.hasOwnProperty.call(base,key) ? base[key] : value;
  return PreferencesSchema.parse({...inferred, ...base,
    moveDate: saved('moveDate',inferred.moveDate), origin:saved('origin',inferred.origin),
    startDate: saved('startDate',inferred.startDate), endDate: saved('endDate',inferred.endDate),
    durationDays: saved('durationDays',inferred.durationDays), travelers: saved('travelers',inferred.travelers),
    ownsFurniture: saved('ownsFurniture',inferred.ownsFurniture), ownedItems: base && Object.prototype.hasOwnProperty.call(base,'ownedItems') ? base.ownedItems : inferred.ownedItems,
    vehicleType: saved('vehicleType',inferred.vehicleType),
    deliveryRequired: saved('deliveryRequired',inferred.deliveryRequired), allowUsed: saved('allowUsed',inferred.allowUsed),
    notes: base?.notes || inferred.notes,
  });
}

export function buildScenarioProfile(input: {message: string; scenarioType?: ScenarioType; preferences?: Preferences; location?: string|null; totalMinor?: number}): ScenarioProfile {
  const message = input.message;
  const scenarioType = ScenarioTypeSchema.parse(input.scenarioType ?? scenario(message));
  const preferences = inferredPreferences(message, scenarioType, input.preferences);
  const location = input.location ?? destination(message, scenarioType);
  const budgetMinor = input.totalMinor ?? euroBudget(message);
  const owned = new Set(preferences.ownedItems?.map(x => x.toLowerCase()) ?? []);
  const categories: Category[] = [];
  const add = (id: string, title: string, reason: string, weight: number) => categories.push({id,title,reason,weight});
  const questions: string[] = [];
  const tasks: TaskInput[] = [];
  const recommendations: string[] = [];
  const widgets = new Set<WorkspaceWidget['type']>(['task_list','recommendations']);
  const recommend = (text: string) => recommendations.push(text);
  if (scenarioType === 'moving') {
    add('moving','Moving services','Moving requires a way to transport belongings.', 5);
    if (!preferences.ownsFurniture && !owned.has('bed') && /\b(?:need|buy|looking for)\s+(?:a\s+)?(?:bed|mattress)\b/i.test(message)) add('bed','Bed','A bed was explicitly requested for the move.', 2);
    const furnitureNeed = /\b(?:need|buy|furnish)\b[^.!?\n]{0,60}\bfurniture\b/i.test(message)
      || ['sofa','desk','table','chair','wardrobe'].some(item=>!owned.has(item) && new RegExp(`\\b(?:need|buy|looking for)\\b[^.!?\\n]{0,40}\\b${item}\\b`,'i').test(message));
    if (!preferences.ownsFurniture && furnitureNeed) add('furniture','Furniture','The move includes an explicit furniture need.', 2);
    if (!location) questions.push('Where are you moving?');
    if (!preferences.moveDate) questions.push('What is the exact move date?');
    if (!preferences.origin) questions.push('Where are you moving from?');
    tasks.push(task('Confirm move date and addresses','moving'), task('List belongings and transport needs','moving'));
    recommend('Confirm the move date and the belongings to transport before requesting quotes.');
    widgets.add('service_finder'); widgets.add('timeline'); widgets.add('shopping_cart');
    if (categories.length > 1) {widgets.add('product_catalog'); widgets.add('shopping_cart');}
  } else if (scenarioType === 'travel') {
    add('transport','Transport','The trip needs travel to and from the destination.', 4);
    if (!/\b(?:day trip|daytrip|no accommodation|accommodation (?:is )?(?:already )?(?:booked|paid)|hotel (?:is )?(?:already )?(?:booked|paid)|stay(?:ing)? with (?:friends|family))\b/i.test(message)) add('accommodation','Accommodation','The trip needs a place to stay.', 4);
    add('food','Food','Meals are a trip expense.', 2);
    if (/\b(?:activity|activities|museum|tour|sightseeing|excursion)\b/i.test(message)) add('activities','Activities','The trip mentions activities to plan.', 1);
    if (!location) questions.push('Where are you traveling?');
    if (!preferences.startDate) questions.push(preferences.durationDays ? 'When does the trip start?' : 'When does the trip start, and how long will it be?');
    else if (!preferences.durationDays && !preferences.endDate) questions.push('How long will the trip be?');
    if (!preferences.travelers) questions.push('How many people are traveling?');
    tasks.push(task('Confirm travel dates and travelers','transport'), task('Compare transport and stays','accommodation'));
    recommend('Compare transport and accommodation for the stated trip dates.');
    widgets.add('timeline'); widgets.add('service_finder'); widgets.add('shopping_cart');
  } else if (scenarioType === 'car_purchase') {
    add('vehicle','Vehicle','Buying a car requires a vehicle purchase budget.', 6);
    add('running_costs','Running costs','A car purchase includes ongoing ownership costs.', 2);
    add('inspection','Inspection','A vehicle should be inspected before purchase.', 1);
    add('registration','Registration','A purchased vehicle needs registration planning.', 1);
    if (!preferences.vehicleType) questions.push('What kind of vehicle are you looking for?');
    if (!preferences.useCase) questions.push('How will you mainly use the car?');
    tasks.push(task('Define vehicle requirements','vehicle'), task('Compare vehicles and ownership costs','running_costs'), task('Arrange a vehicle inspection','inspection'));
    recommend('Compare the purchase price with running costs before choosing a car.');
    widgets.add('product_catalog'); widgets.add('shopping_cart'); widgets.add('risk_guardian');
  } else if (scenarioType === 'home_furnishing') {
    const requested = ['bed','desk','sofa','table','chair','wardrobe','mattress'].filter(item => new RegExp(`\\b${item}s?\\b`, 'i').test(message) && !owned.has(item));
    if (requested.length) for (const item of requested) add(item,item[0]!.toUpperCase()+item.slice(1),`The furnishing goal mentions a ${item} that is not listed as owned.`, 2);
    else if (!preferences.ownsFurniture) add('furniture','Furniture','The goal is to furnish a home.', 5);
    if (preferences.deliveryRequired === true || /\bdelivery\b/i.test(message)) add('delivery','Delivery','Delivery is part of the stated furnishing need.', 1);
    if (/\b(?:assembly|assemble|installation|install)\b/i.test(message)) add('assembly','Assembly','Assembly is part of the stated furnishing need.', 1);
    if (!requested.length && !preferences.ownsFurniture) questions.push('Which furniture do you need first?');
    tasks.push(task('List the furniture still needed',categories[0]?.id ?? 'furniture'));
    recommend('Measure the space and list the furniture still needed before comparing options.');
    widgets.add('product_catalog'); widgets.add('shopping_cart');
    if (categories.some(c=>c.id==='delivery'||c.id==='assembly')) widgets.add('service_finder');
  } else if (scenarioType === 'student_life') {
    add('education','Education','Student life includes study costs and requirements.', 4);
    if (/\b(?:dorm|apartment|rent|housing|room)\b/i.test(message)) add('housing','Housing','The student goal mentions accommodation.', 3);
    if (/\b(?:move|commut|travel|transport|bus|train)\b/i.test(message)) add('logistics','Logistics','The student goal mentions travel or moving logistics.', 2);
    if (/\b(?:food|grocer|household|furniture|bed|desk)\b/i.test(message)) add('household','Household','The student goal mentions household needs.', 2);
    if (!location) questions.push('Where will you study?');
    tasks.push(task('List study and living requirements','education'));
    recommend('List study costs and any stated housing or travel needs.');
    widgets.add('timeline');
    if (/\b(?:course|courses|housing|dorm|apartment|transport|commute)\b/i.test(message)) {widgets.add('service_finder'); widgets.add('shopping_cart');}
  } else {
    add('general','General',`The goal is: ${clean(message).slice(0,120)}.`, 1);
    tasks.push(task('Define the goal and next step','general'));
    recommend('Clarify the goal and its main costs before comparing options.');
  }
  if (budgetMinor === null) questions.splice(Math.min(2,questions.length),0,'What budget should I plan around?');
  else widgets.add('budget');
  if (scenarioType !== 'other') widgets.add('risk_guardian');
  if (budgetMinor !== null && categories.some(c=>c.id!=='general')) widgets.add('scenario_comparison');
  const title = scenarioType === 'moving' ? `Move${location ? ` to ${location}` : ''}`
    : scenarioType === 'travel' ? `Trip${location ? ` to ${location}` : ''}`
    : scenarioType === 'car_purchase' ? 'Car purchase'
    : scenarioType === 'home_furnishing' ? 'Home furnishing'
    : scenarioType === 'student_life' ? 'Student life' : clean(message).slice(0,80) || 'New project';
  const recommendationDetails: Detail[] = recommendations.map((text, i) => ({title: i === 0 ? 'Next step' : 'Recommendation', explanation:text, priority:'high', action:text, reason:`Relevant to the ${scenarioType.replace('_',' ')} goal.`}));
  const notes = preferences.notes.toLowerCase();
  const answered = (q: string) => {
    if (!notes) return false;
    const topic = /budget/i.test(q) ? 'budget' : /date|when|long/i.test(q) ? 'date' : /where.*(?:from|moving from)/i.test(q) ? 'origin' : /where/i.test(q) ? 'destination' : /travelers|people/i.test(q) ? 'travelers' : /vehicle|car/i.test(q) ? 'vehicle' : null;
    return !!topic && new RegExp(`(?:${topic}\\s*[:=-]\\s*[^\\n.;]+|(?:q[:.]?[^\\n]*${topic}[^\\n]*a[:.]?\\s*[^\\n.;]+))`,'i').test(notes);
  };
  return {scenarioType,title,location,budgetMinor,preferences,categories,widgetTypes:[...widgets].filter(w => WidgetTypeSchema.safeParse(w).success),questions:[...new Set(questions)].filter(q=>!answered(q)).slice(0,3),tasks,recommendations,recommendationDetails};
}
