import {randomUUID} from 'node:crypto';
import {researchSourceKey,OfferSchema,ResearchResultSchema,researchDismissed,productExponent,type Offer,type LifeProject,type ResearchRequest,type ProductCurrency} from '../../../shared/contracts/index.js';
import {accessContext} from '../access-context.js';
import {assessRelevance,planResearch,samePlace,normalized} from '../research-intent.js';
import {normalizeResearchRequest} from '../research-constraints.js';
import {researchPresentation} from '../research-evidence.js';
import type {SearchProvider} from '../research.js';
import {EBAY_MARKETS} from './ebay.js';
import type {ProductProvider,ProductContext,ProductRecord} from './types.js';
export const DISCOVERY_SOURCES=[{id:'tori',countries:['FI'],state:'discovery_only',method:'hosted web discovery only; no structured API configured'},{id:'etsy',countries:[],state:'requires_partner_approval',method:'No adapter configured'},{id:'shopify',countries:[],state:'requires_credentials',method:'Requires an explicitly authorized storefront; no adapter configured'}] as const;
export function researchCountry(request:ResearchRequest,project:LifeProject):string|null{
 if(request.country)return request.country;const location=request.location??project.location??'';
 const names:Record<string,RegExp>={DE:/\b(?:Germany|Deutschland)\b/i,GB:/\b(?:UK|United Kingdom|Britain)\b/i,US:/\b(?:USA|United States)\b/i,FI:/\b(?:Finland|Suomi)\b/i,FR:/\bFrance\b/i,IT:/\bItaly\b/i,ES:/\bSpain\b/i,CA:/\bCanada\b/i,AU:/\bAustralia\b/i};
 return Object.entries(names).find(([,pattern])=>pattern.test(location))?.[0]??null;
}
export function productContext(request:ResearchRequest,project:LifeProject):ProductContext{
 const country=researchCountry(request,project);const market=country&&Object.hasOwn(EBAY_MARKETS,country)?EBAY_MARKETS[country as keyof typeof EBAY_MARKETS]:null;
 return{request,project,country,currency:request.currency??market?.currency??'EUR',scopeKey:accessContext.getStore()?.principal.id??'legacy-shared'};
}
function recordOffer(record:ProductRecord,context:ProductContext):{offer:Offer|null;reasons:string[]}{
 const r=context.request,p=context.project,meta=record.metadata,reasons:string[]=[],missing:NonNullable<Offer['missingEvidence']>=[];
 const plan=planResearch(r,p);let relevance=assessRelevance(record.title,plan,record.description);
 const requested=normalized(r.category),title=normalized(record.title);
 if(/\b(?:laptops?|macbook|smartphones?|iphone|phones?)\b/.test(requested)){
  const accessory=/\b(?:case|cover|charger|battery|screen|parts?|repair|toy|doll)\b/;
  const family=/\b(?:laptops?|macbook)\b/.test(requested)?/\b(?:laptops?|notebook|macbook|thinkpad|chromebook)\b/:/\b(?:iphone|smartphone|phone|galaxy|pixel)\b/;
  relevance={points:family.test(title)&&!accessory.test(title)?25:0,excluded:accessory.test(title)||!family.test(title),reason:'Explicit product-family identity; accessories are excluded.'};
 }
 if(relevance.excluded||relevance.points===0)reasons.push('category');
 if(meta.priceType==='auction'||meta.priceType==='subscription')reasons.push('not_fixed_purchase_price');
 if(record.availability==='out_of_stock')reasons.push('unavailable');
 if(meta.attributes['conditionId']==='7000')reasons.push('for_parts');
 const requiredCondition=r.condition??(p.preferences.allowUsed===false?'new':'any');
 if(requiredCondition!=='any'){if(record.condition==='unknown')missing.push({field:'condition',required:true,reason:`The API did not establish ${requiredCondition} condition.`});else if(record.condition!==requiredCondition)reasons.push('condition');}
 if(record.currency===null)missing.push({field:'price',required:true,reason:'The provider currency is unknown; no amount or conversion was assumed.'});
 else if(record.currency!==context.currency)missing.push({field:'price',required:true,reason:`The listing uses ${record.currency}, while the ceiling uses ${context.currency}; no FX conversion is available.`});
 if(record.priceMinor===null)missing.push({field:'price',required:true,reason:'The API did not return a usable fixed purchase price.'});
 else if(record.currency===context.currency&&r.maxPrice!==undefined&&record.priceMinor>Math.floor(r.maxPrice*10**productExponent(context.currency)+1e-8))reasons.push('price');
 const countryNames:Record<string,string[]>={DE:['de','germany','deutschland'],GB:['gb','uk','united kingdom','britain'],US:['us','usa','united states'],FR:['fr','france'],ES:['es','spain'],IT:['it','italy'],CA:['ca','canada'],AU:['au','australia']};
 if(r.localOnly){const countryOnly=(countryNames[context.country??'']??[]).includes(normalized(r.location??p.location??context.country??''));
  if(countryOnly){if(!meta.sellerCountry)missing.push({field:'location',required:true,reason:'The seller country is unknown.'});else if(meta.sellerCountry!==context.country)reasons.push('location');}
  else if(!record.location)missing.push({field:'location',required:true,reason:'Seller locality is unknown.'});else if(!samePlace(record.location,r.location??p.location??''))reasons.push('location');
 }
 if(meta.deliveryCountry!==context.country||meta.deliverySupported!==true)missing.push({field:'delivery',required:true,reason:'Delivery eligibility to the requested country has not been established.'});
 if(record.shippingCostMinor===null)missing.push({field:'delivery',required:false,reason:'Shipping cost is unknown; the item price is not an all-inclusive total.'});
 if(record.availability==='unknown')missing.push({field:'availability',required:false,reason:'Current quantity and availability require checking at eBay.'});
 if(reasons.length)return{offer:null,reasons};
 const evidenceByField:NonNullable<Offer['evidenceByField']>={};for(const field of ['title','category','price','condition','location','availability','delivery','image','seller','sourceType'] as const){const actual=meta.fieldProvenance[field];evidenceByField[field]={status:actual?'source_supported':'unknown',snippet:actual?`Provider API field: ${actual.path}`:null,provenance:actual?'provider_api':'none'};}
 evidenceByField.category={status:relevance.points===25?'source_supported':'unknown',snippet:relevance.points===25?record.title:null,provenance:relevance.points===25?'provider_api':'none'};
 const mode=meta.sourceMode==='sandbox';const offer=OfferSchema.parse({id:randomUUID(),category:r.category,kind:'product',title:record.title,description:record.description,priceMinor:record.priceMinor,currency:record.currency,priceStatus:record.priceMinor===null?'unknown':mode?'demo':'estimated',priceOrigin:mode?'demo':'source_reported',sourceUrl:record.url,sourceName:meta.provider==='ebay'?'eBay':'Structured product source',sourceType:'listing',seller:{name:record.seller,type:'unknown',publicProfileUrl:null,verified:false},imageUrl:record.imageUrl,imageSource:'provider',imageType:'listing',location:record.location,delivery:{available:meta.deliverySupported,costMinor:record.shippingCostMinor,details:`${meta.deliveryCountry?`eBay delivery-country filter: ${meta.deliveryCountry}. `:''}Shipping ${record.shippingCostMinor===null?'cost not established':'is provider-reported, separate from item price'}. Extra charges may apply.`},condition:record.condition,availability:mode?'demo':record.availability,lastCheckedAt:record.fetchedAt,verificationStatus:mode?'demo':'source_checked',recommendation:'Direct structured eBay response; seller statements and current availability are not independently verified.',score:relevance.points,evidence:['Direct eBay Browse API response, not an AI-created listing.',meta.taxInformation],eligibilityStatus:missing.some(m=>m.required)?'potential':'supported',missingEvidence:missing,evidenceByField,confidenceExplanation:'Fields originate from the eBay API. This establishes provider-reported data, not independent product, seller, stock or all-inclusive cost verification.',product:meta});
 return{offer,reasons};
}
export function createProductResearchRouter(web:SearchProvider,providers:ProductProvider[],options:{diagnose?:(summary:Record<string,unknown>)=>void}={}):SearchProvider{
 const inFlight=new Map<string,Promise<ReturnType<typeof ResearchResultSchema.parse>>>();
 return{mode:web.mode,async search(input,project){
  const request=normalizeResearchRequest(input),c=productContext(request,project),preferred=providers.find(p=>p.supports(c)),explicit=['ebay','auto'].includes(request.productSource??'');
  if(request.kind!=='product'||request.productSource==='web'||!explicit&&(!preferred||preferred.getCapabilities().state!=='available')){
   // Old requests keep their existing web path. Never silently change a failed API call into paid web search.
   if(request.currency&&request.currency!=='EUR')return unavailable('Web extraction currently validates EUR prices only. Choose a structured marketplace for other currencies.',request,[]);
   const result=await web.search(request,project);if(request.kind==='product'&&request.productSource!=='web')result.productRoutes=[{provider:'web_discovery',state:'discovery_only',reason:'No eligible configured structured provider was used. These results came from the existing web/demo research provider.',marketplace:null}];return result;
  }
  const provider=preferred??providers.find(p=>p.getCapabilities().id==='ebay'),caps=provider?.getCapabilities();
  const route={provider:'ebay',state:!preferred?'unavailable' as const:caps?.state??'unavailable' as const,reason:!preferred?'This country/category has no configured structured provider. Finland has no eBay FI marketplace; no US marketplace was assumed.':caps?.reason??'No provider configured.',marketplace:c.country&&Object.hasOwn(EBAY_MARKETS,c.country)?EBAY_MARKETS[c.country as keyof typeof EBAY_MARKETS].id:null};
  if(!preferred||caps?.state!=='available')return unavailable(route.reason+' You can explicitly choose Web research instead.',request,[route]);
  request.currency=c.currency;if(c.country)request.country=c.country;
  const key=project.id+'\n'+JSON.stringify(request);if(inFlight.has(key))return structuredClone(await inFlight.get(key)!);
  const pending=(async()=>{
   const start=Date.now(),batch=await preferred.searchProducts(c),records=batch.records,offers:Offer[]=[],rejections:NonNullable<LifeProject['researchResults'][number]['rejections']>=[],seen=new Set<string>();
   for(const record of records){const key=record.metadata.provider+':'+record.metadata.sourceProductId,urlKey=researchSourceKey(record.url,'');const converted=recordOffer(record,c);const reasons=converted.reasons;if(seen.has(key)||seen.has(urlKey))reasons.push('duplicate');seen.add(key);seen.add(urlKey);if(converted.offer&&researchDismissed(project,converted.offer))reasons.push('workspace_feedback');if(reasons.length){rejections.push({title:record.title.slice(0,300),sourceUrl:record.url,reasons});continue;}if(converted.offer)offers.push(converted.offer);}
   const sandbox=caps.environment==='sandbox'||records.some(r=>r.metadata.sourceMode==='sandbox');const diagnostics={provider:'ebay' as const,mode:sandbox?'sandbox' as const:'production' as const,durationMs:Date.now()-start,apiRequests:1,cacheHits:0,candidateCount:batch.candidateCount,acceptedCount:offers.length,rejectedCount:batch.candidateCount-offers.length,errorCategory:null,estimatedOpenAiCostUsd:0 as const};
   const result=researchPresentation(ResearchResultSchema.parse({id:randomUUID(),category:request.category,status:offers.length?'completed':'limited',mode:sandbox?'demo':'live',offers:offers.slice(0,request.limit??15),warnings:[...(batch.invalidCount?[`${batch.invalidCount} malformed API item(s) were rejected before normalization.`]:[]),...(sandbox?['eBay Sandbox: test inventory and prices, not production shopping listings.']:[]),'Direct eBay API data is provider-reported, not independently verified. Item and shipping amounts are separate; unknown extras are excluded.',...(c.currency!=='EUR'?['Prices remain in their original currency. The current EUR workspace cannot include them without a sourced FX conversion.']:[]),'eBay Best Match order is retained; local re-sorting is disabled pending partner display/sorting permission.'],searchedAt:new Date().toISOString(),query:request.searchTerms??request.category,request,productRoutes:[route],productDiagnostics:diagnostics,providerOrder:true,rejections:rejections.slice(0,30)}),batch.candidateCount);
   result.summary!.rejectedCount=diagnostics.rejectedCount;result.summary!.explanation=result.summary!.explanation.replace('cited summaries','structured API fields');
   try{options.diagnose?.({...diagnostics,operation:'product_research'});}catch{}return result;
  })();inFlight.set(key,pending);try{return await pending;}finally{inFlight.delete(key);}
 }};
}
function unavailable(message:string,request:ResearchRequest,routes:NonNullable<LifeProject['researchResults'][number]['productRoutes']>){return ResearchResultSchema.parse({id:randomUUID(),category:request.category,status:'unavailable',mode:'unavailable',offers:[],warnings:[message,'No eBay API or automatic paid web search was executed.'],searchedAt:new Date().toISOString(),query:request.searchTerms??request.category,request,productRoutes:routes});}
