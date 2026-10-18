import type {Offer,ProductMetadata,ResearchResult} from '../../../shared/contracts/index.js';
import {researchPresentation} from '../research-evidence.js';
/** Google product identity excludes changing headline-offer/tracking IDs. Distinct
 * merchants and explicitly named variants stay separate; no fuzzy deduplication. */
export function productIdentity(product:ProductMetadata|undefined,title:string,merchant:string|null|undefined):string|null{
 if(!product)return null;
 if(product.provider==='serpapi'&&product.attributes.googleProductId&&merchant)return 'serpapi:'+JSON.stringify([product.attributes.googleProductId,merchant.trim().toLowerCase(),title.normalize('NFKC').trim().toLowerCase()]);
 return product.provider+':'+product.sourceProductId;
}
/** Deterministic reconciliation also protects already-saved Google results.
 * Cart amounts and original source price fields are never rewritten. */
export function reconcileSerpApiResult(result:ResearchResult):void{
 if(!result.offers.some(o=>o.product?.provider==='serpapi'))return;
 const groups=new Map<string,Offer[]>();
 for(const offer of result.offers){if(offer.product?.provider!=='serpapi')continue;const key=productIdentity(offer.product,offer.title,offer.seller.name)!;groups.set(key,[...(groups.get(key)??[]),offer]);}
 const remove=new Set<string>();let duplicates=0;
 for(const group of groups.values()){
  const first=group[0]!,prices=new Set(group.filter(o=>o.priceMinor!==null).map(o=>o.currency+':'+o.priceMinor));
  if(prices.size>1){
   const reason='Google reported conflicting prices for the same product and merchant. Check the current price at the source.';
   first.missingEvidence=[...(first.missingEvidence??[]).filter(m=>m.reason!==reason),{field:'price',required:true,reason}];
   first.evidenceByField={...first.evidenceByField,price:{status:'conflicting',snippet:reason,provenance:'provider_api'}};
  }
  for(const extra of group.slice(1)){remove.add(extra.id);duplicates++;result.rejections=[...(result.rejections??[]),{title:extra.title,sourceUrl:extra.sourceUrl,reasons:['duplicate']}].slice(-30);}
 }
 for(const offer of result.offers){if(offer.product?.provider!=='serpapi')continue;
  // Official multiple_sources means other sellers also exist, not that the named
  // source/price pair is absent. It is not by itself a hard-evidence failure.
  const named=!!offer.seller.name&&!/^\d+\s+(?:stores?|shops?|sellers?|retailers?)\b/i.test(offer.seller.name);
  if(named)offer.missingEvidence=offer.missingEvidence?.filter(m=>!(m.field==='seller'&&m.reason==='A single merchant offer has not been established.'));
  offer.eligibilityStatus=offer.missingEvidence?.some(m=>m.required)?'potential':'supported';
 }
 result.offers=result.offers.filter(o=>!remove.has(o.id));
 if(duplicates&&result.productDiagnostics){result.productDiagnostics.acceptedCount=Math.max(0,result.productDiagnostics.acceptedCount-duplicates);result.productDiagnostics.rejectedCount+=duplicates;}
 const sourceCount=result.summary?.sourceCount??result.productDiagnostics?.candidateCount??result.offers.length;
 researchPresentation(result,sourceCount);
 if(result.productDiagnostics)result.summary!.rejectedCount=result.productDiagnostics.rejectedCount;
 result.summary!.explanation=result.summary!.explanation.replace('cited summaries','structured API fields');
 if(result.offers.some(o=>o.evidenceByField?.price?.status==='conflicting')&&!result.warnings.includes('Some Google entries report conflicting prices. Those products remain potential leads, not eligible financial selections.'))result.warnings.push('Some Google entries report conflicting prices. Those products remain potential leads, not eligible financial selections.');
}
