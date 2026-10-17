import { createHash,randomUUID } from 'node:crypto';
import type { LifeProject, InsuranceType, ProtectionRecommendation, InsuranceBudgetLink, ProtectionBudgetRequest, CarInsuranceDraft, CarProtectionQuote, ProtectionUpdate } from '../../shared/contracts/index.js';
import { AppError } from './errors.js';

export const PROTECTION_PRODUCTS={
 home:{scenario:'moving',title:'Protect your new home with If',cta:'Check home insurance',documentation:'https://developer.if-insurance.com/apis/property/householder-insurance-apis-finland',explanation:'A move changes the home and belongings you may want to protect. Insurance hasn’t been checked in this workspace.'},
 car:{scenario:'car_purchase',title:'Check insurance for your new car',cta:'Get an If insurance price',documentation:'https://developer.if-insurance.com/apis/mobility/car-insurance-apis-finland',explanation:'Include insurance when reviewing this vehicle’s ownership costs. Insurance hasn’t been checked in this workspace.'},
 travel:{scenario:'travel',title:'Review travel insurance',cta:'Explore travel protection',documentation:'https://developer.if-insurance.com/apis/person/travel-insurance-apis-finland',explanation:'Review protection for the trip you are planning. Insurance hasn’t been checked in this workspace.'},
} as const;
export function relevantInsurance(project:LifeProject):InsuranceType|undefined{return (Object.keys(PROTECTION_PRODUCTS) as InsuranceType[]).find(k=>PROTECTION_PRODUCTS[k].scenario===project.scenarioType);}
function stable(value:unknown):string{if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;if(value&&typeof value==='object')return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;return JSON.stringify(value)??'null';}
export const fingerprint=(value:unknown)=>createHash('sha256').update(stable(value)).digest('hex');
export const carFingerprint=(p:LifeProject,draft:Partial<CarInsuranceDraft>)=>fingerprint({vehicle:p.preferences.vehicle??null,draft});
export const homeFingerprint=(p:LifeProject,details:unknown)=>fingerprint({location:p.location,moveDate:p.preferences.moveDate,details});
export function reconcileProtection(p:LifeProject){
 const state=p.protection??={recommendations:[],car:{draft:{...(p.preferences.vehicle?.registrationNumber?{registrationNumber:p.preferences.vehicle.registrationNumber}:{}),...(p.preferences.vehicle?.purchasePriceMinor!==undefined?{carPriceMinor:p.preferences.vehicle.purchasePriceMinor}:{})},quotes:[],budgetLink:null}};
 // No expiry is invented for If Car Price responses.
 for(const q of state.car.quotes)q.status=q.inputFingerprint!==carFingerprint(p,state.car.draft)?'stale':q.validUntil&&Date.parse(q.validUntil)<Date.now()?'expired':'available';
 if(state.car.budgetLink){const linked=state.car.quotes.find(q=>q.id===state.car.budgetLink!.quoteId);state.car.budgetLink.needsReview=!linked||linked.status!=='available';}
 const product=relevantInsurance(p);if(!product)return;
 const now=new Date().toISOString();const context=product==='car'?carFingerprint(p,state.car.draft):product==='home'?homeFingerprint(p,p.homeInsurance?.details??{}):fingerprint({location:p.location,start:p.preferences.startDate,end:p.preferences.endDate,travelers:p.preferences.travelers});
 let rec=state.recommendations.find(r=>r.insuranceType===product);
 if(!rec){rec={id:`${p.id}:${product}`,workspaceId:p.id,insuranceType:product,triggeringEvent:p.scenarioType,explanation:PROTECTION_PRODUCTS[product].explanation,status:'suggested',contextFingerprint:context,createdAt:now,updatedAt:now,dismissedAt:null};state.recommendations.push(rec);}
 const changed=rec.contextFingerprint!==context;const before=rec.status;
 if(changed){rec.contextFingerprint=context;rec.status='suggested';rec.dismissedAt=null;}
 if(!['dismissed','reviewed','already_insured_self_reported'].includes(rec.status)){
  if(product==='car'){const q=state.car.quotes.at(-1);if(q)rec.status=q.status==='available'?'quote_available':q.status==='expired'?'quote_expired':'quote_unavailable';}
  if(product==='home'&&p.homeInsurance?.quote){const q=p.homeInsurance.quote;rec.status=q.validTo<now.slice(0,10)?'quote_expired':q.inputFingerprint&&q.inputFingerprint!==context?'quote_unavailable':'quote_available';}
 }
 if(changed||before!==rec.status)rec.updatedAt=now;
}
export function updateProtection(p:LifeProject,input:ProtectionUpdate){reconcileProtection(p);const rec=p.protection!.recommendations.find(r=>r.insuranceType===input.product);if(!rec||relevantInsurance(p)!==input.product)throw new AppError('PROTECTION_NOT_RELEVANT','This insurance product does not match the workspace',422);rec.status=input.status;rec.dismissedAt=input.status==='dismissed'?new Date().toISOString():null;rec.updatedAt=new Date().toISOString();}
export function linkCarExpense(p:LifeProject,input:ProtectionBudgetRequest):InsuranceBudgetLink{
 reconcileProtection(p);const state=p.protection!.car;const q=state.quotes.find(q=>q.id===input.quoteId);if(!q||q.status!=='available')throw new AppError('QUOTE_STALE','Request a current price before adding insurance to the budget.',409);
 if(q.sourceMode==='sandbox')throw new AppError('IF_TEST_QUOTE','Sandbox prices cannot become real proposed expenses.',409);
 const option=q.options.find(o=>o.id===input.optionId);const price=option?.prices[input.priceIndex];if(!price?.periodMonths)throw new AppError('BILLING_PERIOD_UNKNOWN','Choose a price with a confirmed billing period.');
 const old=state.budgetLink;if(old?.quoteId===q.id&&old.optionId===input.optionId&&old.priceIndex===input.priceIndex&&old.planningMonths===input.planningMonths)throw new AppError('ALREADY_LINKED','This proposal is already in your budget.',409);
 if(old&&!input.replaceExisting)throw new AppError('REPLACE_CONFIRMATION_REQUIRED','Confirm replacement of the existing proposed insurance expense.',409);
 const installments=Math.ceil(input.planningMonths/price.periodMonths);const plannedMinor=price.amountMinor*installments;const annualEquivalentMinor=price.amountMinor*(12/price.periodMonths);if(Math.max(plannedMinor,annualEquivalentMinor)>1e9)throw new AppError('INVALID_MONEY','Insurance costs exceed the supported range.');
 const now=new Date().toISOString();return {id:old?.id??randomUUID(),workspaceId:p.id,quoteId:q.id,budgetEntryId:'car_insurance',optionId:input.optionId,priceIndex:input.priceIndex,sourceMode:q.sourceMode,premiumMinor:price.amountMinor,billingPeriod:price.billingPeriod,periodMonths:price.periodMonths,planningMonths:input.planningMonths,installments,plannedMinor,monthlyEquivalentMinor:Math.round(price.amountMinor/price.periodMonths),annualEquivalentMinor,status:'proposed',needsReview:false,createdAt:old?.createdAt??now,updatedAt:now};
}
export function insuranceSummary(p:LifeProject):string{
 reconcileProtection(p);const product=relevantInsurance(p);if(!product)return 'No supported insurance product is registered for this workspace.';
 const rec=p.protection!.recommendations.find(r=>r.insuranceType===product)!;const link=p.protection!.car.budgetLink;
 if(product==='car'){
  const q=p.protection!.car.quotes.at(-1);const summary=q?`${q.sourceMode==='demo'?'Demo quote — not an official If insurance price':q.sourceMode==='sandbox'?'If sandbox test prices':'Returned If prices'}; status ${q.status}. ${q.options.map(o=>`${o.title}: ${o.prices.map(v=>`EUR ${(v.amountMinor/100).toFixed(2)} ${v.billingPeriod}`).join(', ')}`).join('; ')}`:'No car price is saved. Open the quote form, confirm missing vehicle details, and choose live or explicitly fictional demo mode.';
  return `${summary}${link?` Proposed budget: EUR ${(link.plannedMinor/100).toFixed(2)} over ${link.planningMonths} months; monthly equivalent EUR ${(link.monthlyEquivalentMinor/100).toFixed(2)}.${p.preferences.monthlyBudgetMinor!==undefined?` Your recorded monthly budget is EUR ${(p.preferences.monthlyBudgetMinor/100).toFixed(2)}; EUR ${((p.preferences.monthlyBudgetMinor-link.monthlyEquivalentMinor)/100).toFixed(2)} remains before other monthly expenses.`:''}${link.needsReview?' The linked quote needs revalidation; the old proposal has been retained for review.':''}`:''} Nothing has been purchased.`;
 }
 if(product==='home'){const q=p.homeInsurance?.quote;return q?`${q.environment==='sandbox'?'If sandbox test quote':'Saved If quote'}: ${q.premiums.map(v=>`EUR ${(v.amountMinor/100).toFixed(2)} ${v.billingPeriod}`).join(', ')}. Status: ${rec.status}. No policy has been purchased.`:'Home insurance is relevant to this move. Open the existing home quote form; no price is available until the provider returns one.';}
 return 'Travel protection is relevant. Finnish Travel APIs are listed by If; travel pricing is not enabled in this MVP. Review any existing cover and the official If information.';
}

/** Extract only explicit, nonsensitive vehicle planning facts. Never guesses registration or customer factors. */
export function vehicleFacts(message:string){
 const vehicle:NonNullable<LifeProject['preferences']['vehicle']>={};
 const named=/\b(?:buy(?:ing)?|purchase)\s+(?:a\s+)?(?:(20\d{2}|19\d{2})\s+)?(BMW|Audi|Volvo|Toyota|Volkswagen|Ford|Mercedes|Skoda|Tesla|Honda)\s+([\w -]{1,35}?)(?=\s+(?:for|under|with|in|and)\b|[.!?,]|$)/i.exec(message);
 if(named){if(named[1])vehicle.year=Number(named[1]);vehicle.make=named[2];vehicle.model=named[3]?.trim();}
 const number=(s:string)=>{const clean=s.trim().replace(/[.,]+$/,'').replace(/\s/g,'');const decimal=/[.,]\d{1,2}$/.exec(clean)?.[0];const whole=decimal?clean.slice(0,-decimal.length):clean;return Number(whole.replace(/[.,]/g,''))*100+(decimal?Number(decimal.slice(1).padEnd(2,'0')):0);};
 const purchase=/\b(?:for|under)\s*€\s*([\d,. ]+)/i.exec(message);if(purchase)vehicle.purchasePriceMinor=number(purchase[1]!);
 const monthly=/\bmonthly\s+budget\s*(?:is|of|:|now)?\s*€\s*([\d,. ]+)/i.exec(message);
 const registration=/\b([A-Z]{2,3}-\d{1,3})\b/.exec(message);if(registration)vehicle.registrationNumber=registration[1];
 return {vehicle,monthlyBudgetMinor:monthly?number(monthly[1]!):undefined};
}
