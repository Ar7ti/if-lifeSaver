import { FURNITURE_TERMS, furnitureItems, type FurnitureItem, type LifeProject, type ResearchRequest } from '../../shared/contracts/index.js';

/** Reviewed public browser routes. No HTTP client, scraper, internal API or credentials.
 * robots.txt is not a content licence: the app only uses hosted search evidence and
 * explicitly labelled user handoffs. Review dated access notes in FURNITURE_RESEARCH.md. */
export const FURNITURE_SOURCES = [
  {id:'ikea',name:'IKEA Finland',domain:'ikea.com',search:'https://www.ikea.com/fi/fi/search/',parameter:'q',scope:'site:ikea.com/fi/fi/p/'},
  {id:'jysk',name:'JYSK Finland',domain:'jysk.fi',search:'https://jysk.fi/search',parameter:'query',scope:'site:jysk.fi'},
  {id:'tori',name:'Tori.fi',domain:'tori.fi',search:'https://www.tori.fi/recommerce/forsale/search',parameter:'q',scope:'site:tori.fi/recommerce/forsale/item/'},
] as const;

export function focusedFurniture(request:ResearchRequest,project:LifeProject) {
  if(project.scenarioType!=='moving'||request.kind!=='product'||request.purpose==='information')return null;
  const location=request.location??project.location??'';
  if(request.country&&request.country!=='FI')return null;
  if(!/\b(?:Finland|Suomi|Turku|Helsinki|Espoo|Tampere|Vantaa|Oulu|Kuopio|Jyväskylä)\b/i.test(location))return null;
  const text=[request.category,request.searchTerms,...request.preferences].filter(Boolean).join(' ');
  const items=furnitureItems(text);
  if(!items.length&&!/\b(?:furniture|furnish|huonekal)\w*/i.test(text))return null;
  // Explicit selection or the existing UI's source preference enables this small
  // path; unrelated legacy/general research keeps its existing providers.
  if(!/\b(?:IKEA|JYSK|Tori(?:\.fi)?)\b/i.test(text))return null;
  const sources=FURNITURE_SOURCES.filter(source=>new RegExp(`\\b${source.id}\\b`,'i').test(text));
  const chosen:(FurnitureItem|'furniture')[]=items.length?items:['furniture'];
  const terms=chosen.map(item=>item==='furniture'?{en:'Furniture',fi:'huonekalut'}:FURNITURE_TERMS[item]);
  const condition=request.condition??(project.preferences.allowUsed===false?'new':'any');
  const conditionTerm=condition==='used'?'käytetty used':condition==='new'?'uusi new':condition==='refurbished'?'kunnostettu refurbished':'';
  const ceiling=request.maxPrice===undefined?'':`under EUR ${request.maxPrice.toFixed(2)}`;
  const alternatives=`(${terms.flatMap(t=>[t.fi,t.en]).join(' OR ')})`;
  const description=[conditionTerm,alternatives,location,ceiling,'hinta price product'].filter(Boolean).join(' ');
  const searchLinks=sources.flatMap(source=>chosen.map((item,i)=>{
    // A keyword is not a geographic/price/condition filter. Never construct
    // undocumented numeric location codes, stock or product IDs.
    const query=[terms[i]!.fi,source.id==='tori'?location.split(',')[0]:null].filter(Boolean).join(' ');
    const url=new URL(source.search);url.searchParams.set(source.parameter,query);
    return {source:source.id,sourceName:source.name,item,title:terms[i]!.en,query,url:url.href,kind:'source_search' as const,
      notice:`Search page, not a product listing. Check ${location}, ${condition==='any'?'condition':condition+' condition'}${ceiling?`, ${ceiling}`:''}, stock and delivery on the source. Keyword search does not apply these filters.`};
  }));
  return {id:'moving_furniture_finland',allowedDomains:sources.map(s=>s.domain),items:chosen,
    queries:sources.map(s=>`${s.scope} ${description}`.slice(0,900)),searchLinks};
}

export function isFinnishFurnitureSource(url:string,allowedDomains:readonly string[]=FURNITURE_SOURCES.map(s=>s.domain)):boolean {
  try {const u=new URL(url),host=u.hostname.replace(/^www\./,'');
    return u.protocol==='https:'&&allowedDomains.includes(host)&&((host==='ikea.com'&&u.pathname.startsWith('/fi/'))||host==='jysk.fi'||host==='tori.fi');
  } catch {return false;}
}
