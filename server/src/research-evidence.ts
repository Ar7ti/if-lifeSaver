import type {Offer,ResearchResult,EvidenceField} from '../../shared/contracts/index.js';
import type {ResearchPlan,LocationFit} from './research-intent.js';

type Context={relevance:{excluded:boolean;points:number;reason:string};location:LocationFit};
export function classifyResearchOffer(offer:Offer,plan:ResearchPlan,context:Context){
 const hard:string[]=[],missing:NonNullable<Offer['missingEvidence']>=[];
 const need=(field:EvidenceField,reason:string,required=true)=>missing.push({field,reason,required});
 if(context.relevance.excluded)hard.push('category');
 else if(context.relevance.points<25)need('category','Specific relevance to the requested item is not established.');
 if(context.location.status==='conflict')hard.push('location');
 if((plan.constraints.localOnly||plan.constraints.purpose!=='information'&&!!plan.location)&&context.location.status!=='match')need('location','The source does not establish the requested local area.');
 else if(context.location.status==='unknown'||context.location.status==='national')need('location','The listing location or destination coverage is not confirmed.',false);
 if(plan.category.focus==='insurance'&&offer.sourceUrl&&!/(^|\.)if\.fi$/.test(new URL(offer.sourceUrl).hostname))hard.push('official_source');
 const wanted=plan.preferences.allowUsed===false?'new':plan.constraints.condition;
 if(wanted!=='any'&&offer.condition!=='not_applicable'){
  if(offer.condition==='unknown')need('condition',`The source does not establish ${wanted} condition.`);
  else if(offer.condition!==wanted)hard.push('condition');
 }else if(offer.condition==='unknown')need('condition','Condition is not stated.',false);
 const amount=plan.constraints.pricePeriod==='month'?(offer.reportedRate?.period==='month'?offer.reportedRate.amountMinor:null):offer.priceMinor;
 if(plan.constraints.purpose!=='information'){
  if(offer.sourceType==='category'||offer.sourceType==='information')hard.push('not_specific_listing');
  if(offer.sourceType==='lead')need('sourceType','A specific current listing has not been established.');
  if(amount===null)need('price',offer.reportedRate?'Only a unit rate is reported; the required total is unknown.':'A reliable source-reported price is missing.');
  else if(plan.budget.maxItemMinor!==null&&amount>plan.budget.maxItemMinor)hard.push('price');
 }
 if(plan.preferences.deliveryRequired&&offer.kind==='product'&&offer.condition!=='not_applicable'){
  if(offer.delivery.available===false)hard.push('delivery');
  else if(offer.delivery.available!==true)need('delivery','Required delivery to the destination is unconfirmed.');
 }else if(offer.kind==='product'&&(offer.delivery.available===null||offer.delivery.costMinor===null))need('delivery','Delivery arrangements or fees need checking.',false);
 if(offer.availability==='out_of_stock')hard.push('availability');
 else if(offer.availability==='unknown')need('availability','Current availability is not confirmed.',false);
 if(['travel_transport','accommodation'].includes(plan.category.focus)){
  if(plan.dates.startDate&&offer.evidenceByField?.dates?.status!=='source_supported')need('dates','The source does not establish the requested travel dates.');
  if(plan.origin&&plan.category.focus==='travel_transport'&&offer.evidenceByField?.origin?.status!=='source_supported')need('origin','The requested departure point is not established.');
  if(plan.travelers&&offer.evidenceByField?.travelers?.status!=='source_supported')need('travelers','The fare or stay total for the requested party size is unconfirmed.');
 }
 offer.missingEvidence=missing;
 offer.eligibilityStatus=missing.some(m=>m.required)?'potential':'supported';
 offer.confidenceExplanation=offer.eligibilityStatus==='supported'?'The cited search summary supports the applicable criteria. This is not independent page, stock or seller verification.':'A relevant cited source exists, but required details remain unknown. Review the source before planning an expense.';
 return {hard,missing};
}

export function researchPresentation(result:ResearchResult,sourceCount=0):ResearchResult{
 const supported=result.offers.filter(o=>o.eligibilityStatus!=='potential').length,potential=result.offers.length-supported;
 const missing=[...new Set(result.offers.flatMap(o=>(o.missingEvidence??[]).filter(m=>m.required).map(m=>m.field)))];
 result.engineVersion=2;
 result.summary={supportedCount:supported,potentialCount:potential,rejectedCount:result.rejections?.length??0,sourceCount,
  explanation:supported?`${supported} match${supported===1?'':'es'} your criteria based on cited summaries; confirm current details at the source.${potential?` ${potential} additional potential lead${potential===1?' needs':'s need'} checking.`:''}`:potential?`No supported matches. ${potential} potential lead${potential===1?' is':'s are'} available; ${missing.join(', ')||'essential details'} still need checking.`:result.sourceNotes?.length?`No qualifying listings were established. ${result.sourceNotes.length} cited research source${result.sourceNotes.length===1?' is':'s are'} available to review; prices, availability and suitability still need checking.`:sourceCount?'Sources were discovered, but no useful listing evidence survived validation.':'No usable cited candidate sources were returned.'};
 if(result.furnitureSearchLinks?.length)result.summary.explanation+=` ${result.furnitureSearchLinks.length} source-specific searches are available separately; these links are not listings and do not confirm prices, condition or delivery.`;
 result.refinementSuggestions=[];
 if(potential)result.refinementSuggestions.push({id:'review_details',title:'Review missing details',explanation:'Open the linked sources and check the marked fields. No new search is needed.',message:`Help me review the missing ${missing.join(', ')} evidence in the saved ${result.category} leads without running another search.`});
 if(!supported&&result.request?.localOnly)result.refinementSuggestions.push({id:'expand_location',title:'Consider a wider area',explanation:'Prepare a broader search for your review. The current location constraint stays unchanged.',message:`Propose a wider-area search for ${result.category}; ask which nearby area I approve before changing the current location constraint.`});
 if(!supported&&result.request?.maxPrice!==undefined)result.refinementSuggestions.push({id:'increase_budget',title:'Review the price ceiling',explanation:'Decide whether to change the ceiling before requesting another search.',message:`Help me decide whether to change the ${result.request.maxPrice} EUR ceiling for ${result.category}. Do not change it or search automatically.`});
 if(!supported&&result.request?.condition&&result.request.condition!=='any'&&result.refinementSuggestions.length<4)result.refinementSuggestions.push({id:'condition_any',title:'Review the condition restriction',explanation:'Keep the current restriction unless you explicitly approve a change.',message:`Discuss whether to broaden the ${result.request.condition} condition restriction for ${result.category}; keep it unchanged until I approve.`});
 if(!result.refinementSuggestions.length&&!supported)result.refinementSuggestions.push({id:'retry_sources',title:'Review the search description',explanation:'Specify the item and any missing constraints before another search.',message:`Help me refine the saved ${result.category} search without running it automatically.`});
 return result;
}
