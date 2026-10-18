import { furnitureItems, ResearchRequestSchema,type ResearchRequest,type LifeProject } from '../../shared/contracts/index.js';

/** Current user text only; never run this against retrieved pages. Unrecognized
 * constraints remain in preferences for the existing model, not silently guessed. */
export function explicitResearchConstraints(text:string):Partial<ResearchRequest>{
 const out:Partial<ResearchRequest>={};
 if(/\b(?:only (?:show )?(?:used|second.hand)|used only|used (?:ones|sofas?|beds?|desks?|cars?|vehicles?|toyota)|second.hand (?:only|sofas?|beds?|desks?))\b/i.test(text))out.condition='used';
 if(/\b(?:only new|new only|new (?:sofas?|beds?|desks?))\b/i.test(text))out.condition='new';
 if(/\b(?:refurbished only|refurbished (?:macbook|laptop|phone|iphone|electronics))\b/i.test(text))out.condition='refurbished';
 if(/\b(?:any condition|new or used)\b/i.test(text))out.condition='any';
 if(/\bused (?:iphone|phone|smartphone|macbook|laptop)\b/i.test(text))out.condition='used';
 const countryNames:Record<string,RegExp>={DE:/\b(?:Germany|Deutschland)\b/i,GB:/\b(?:UK|Britain|United Kingdom)\b/i,US:/\b(?:USA|United States)\b/i,FI:/\b(?:Finland|Suomi)\b/i,FR:/\bFrance\b/i,CA:/\bCanada\b/i,AU:/\bAustralia\b/i};
 const country=Object.entries(countryNames).find(([,test])=>test.test(text))?.[0];if(country)out.country=country;
 if(/£|\b(?:GBP|pounds?)\b/i.test(text))out.currency='GBP';else if(/\bUSD\b|US\$/i.test(text))out.currency='USD';else if(/€|\bEUR\b/i.test(text))out.currency='EUR';
 if(/\beBay\b/i.test(text))out.productSource='ebay';
 const money=/\b(?:under|below|maximum|max|up to)\s*(?:€|EUR\s*)?\s*(\d{1,3}(?:[ ,]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:€|EUR|euros?)?/i.exec(text);
 if(money&&!/[$£]|\b(?:USD|GBP|dollars?|pounds?)\b/i.test(text))out.maxPrice=Number(money[1]!.replace(/[ ,]/g,''))+Number((money[2]??'').padEnd(2,'0'))/100;
 const foreign=/\b(?:under|below|maximum|max|up to)\s*(£|GBP|USD|US\$)\s*(\d+(?:\.\d{1,2})?)/i.exec(text);if(foreign){out.currency=/£|GBP/i.test(foreign[1]!)?'GBP':'USD';out.maxPrice=Number(foreign[2]);}
 const dollars=/\b(?:under|below|maximum|max|up to)\s*\$\s*(\d+(?:\.\d{1,2})?)/i.exec(text);if(dollars&&country&&['US','CA','AU'].includes(country)){out.currency=country==='US'?'USD':country==='CA'?'CAD':'AUD';out.maxPrice=Number(dollars[1]);}
 const count=/\b(?:find|show|give me|top)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.exec(text)?.[1]?.toLowerCase();
 const n=count?Number(count)||['one','two','three','four','five','six','seven','eight','nine','ten'].indexOf(count)+1:0;
 if(n>0&&n<=15)out.limit=n;
 if(/\b(?:cheapest first|lowest price first|sort(?:ed)? by price|price ascending)\b/i.test(text))out.sort='price_asc';
 if(/\b(?:recommended first|sort by relevance)\b/i.test(text))out.sort='recommended';
 const place=/\b(?:in|near)\s+([A-Za-zÀ-ž][A-Za-zÀ-ž ,'-]{1,100}?)(?=\s+(?:under|below|with|for|and|only|on)\b|[.!?]|$)/i.exec(text)?.[1]?.trim().replace(/[,\s]+$/,'');
 if(place&&!/\b(?:budget|stock|advance|general|finland under)\b/i.test(place)){out.location=place;out.localOnly=true;}
 if(/\b(?:anywhere|all Finland|nationwide|across Finland)\b/i.test(text))out.localOnly=false;
 if(/\/\s*(?:mo(?:nth)?|month)\b|per month|monthly rent/i.test(text))out.pricePeriod='month';
 if(/\b(?:official information|what.*covers?|general coverage|policy information)\b/i.test(text))out.purpose='information';
 return out;
}

export function normalizeResearchRequest(input:ResearchRequest):ResearchRequest {
 const words=input.preferences.join(' ');
 const categoryText=input.category.replaceAll('_',' ');
 const requested=input.searchTerms??(/\b(?:find|looking|under|cheapest)\b/i.test(categoryText)||['furniture','general'].includes(input.category)?categoryText+' '+words:'');
 const category=furnitureItems(requested).length>1?'furniture':/\b(?:laptops?|macbook|notebook)\b/i.test(requested)?'laptop':/\b(?:iphones?|smartphones?|phones?)\b/i.test(requested)?'smartphone':/\b(?:sofas?|couches?)\b/i.test(requested)?'sofa':/\b(?:beds?|mattress)\b/i.test(requested)?'bed':/\bdesks?\b/i.test(requested)?'desk':/\bfurniture\b/i.test(requested)?'furniture':/\b(?:rental|apartments?)\b/i.test(requested)?'housing':/\b(?:toyota|vehicles?|cars?)\b/i.test(requested)?'vehicle':input.category;
 return ResearchRequestSchema.parse({...explicitResearchConstraints(words),...input,category});
}

/** Saved actions/results provide a compact per-project search context. A short
 * refinement retains the previous ceiling/locality, without unrelated history. */
export function contextualResearchRequest(project:LifeProject,message:string,category:string,kind:'product'|'service',maxPrice?:number):ResearchRequest {
 const prior=latestResearchContext(project,category)?.request;
 const refine=/\b(?:only|ones|those|them|same|cheaper|cheapest first|sort|sorted|which option|which one)\b/i.test(message)&&! /\b(?:find|search|research|look for)\b/i.test(message);
 const text=explicitResearchConstraints(message);
 return ResearchRequestSchema.parse({...(refine?prior:{}),category,kind,
   ...(maxPrice===undefined?{}:{maxPrice}),...text,
   preferences:[...(refine?prior?.preferences??[]:[]),`Looking for: ${message}`.slice(0,200)].slice(-20)});
}

/** Latest persisted research request wins, including a search with zero results. */
export function latestResearchContext(project:LifeProject,category?:string){
 const saved=[...(project.researchResults??[])].filter(r=>!category||r.category===category).map(r=>({category:r.category,at:r.searchedAt,request:r.request}));
 const proposed=(project.actions??[]).flatMap(a=>(a.command.type==='research_products'||a.command.type==='research_services')&&(!category||a.command.arguments.category===category)?[{category:a.command.arguments.category,at:a.createdAt,request:a.command.arguments}]:[]);
 return [...saved,...proposed].sort((a,b)=>b.at.localeCompare(a.at))[0];
}
