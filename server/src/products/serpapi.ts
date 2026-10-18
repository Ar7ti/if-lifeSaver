import {z} from 'zod';
import type {Config} from '../config.js';
import {AppError} from '../errors.js';
import {extractSerpApiItem} from './extractor.js';
import type {ProductContext,ProductProvider,ProductRecord} from './types.js';

const MARKETS={FI:{gl:'fi',hl:'fi',currency:'EUR'},DE:{gl:'de',hl:'de',currency:'EUR'},GB:{gl:'uk',hl:'en',currency:'GBP'},US:{gl:'us',hl:'en',currency:'USD'},FR:{gl:'fr',hl:'fr',currency:'EUR'},IT:{gl:'it',hl:'it',currency:'EUR'},ES:{gl:'es',hl:'es',currency:'EUR'},CA:{gl:'ca',hl:'en',currency:'CAD'},AU:{gl:'au',hl:'en',currency:'AUD'}} as const;
type Settings=Config['serpapi'];
type Dependencies={fetch?:typeof fetch;now?:()=>number;limit?:<T>(scope:string,dispatch:()=>Promise<T>)=>Promise<T>;allow?:()=>boolean;diagnose?:(event:Record<string,unknown>)=>void};
const batchSchema=z.object({search_metadata:z.object({status:z.string(),id:z.string().max(100).optional()}).passthrough(),shopping_results:z.array(z.unknown()).max(200).optional(),error:z.string().optional()}).passthrough();

export class SerpApiShoppingProvider implements ProductProvider {
 private readonly fetcher:typeof fetch;private readonly now:()=>number;
 constructor(private settings:Settings,private deps:Dependencies={}){this.fetcher=deps.fetch??fetch;this.now=deps.now??Date.now;}
 getCapabilities(){const state=!this.settings.enabled?'disabled':!this.settings.apiKey?'requires_credentials':'available';return{id:'serpapi',environment:'production' as const,countries:Object.keys(MARKETS),categories:['consumer_products'],excludedCategories:['moving','housing','transport','vehicle','insurance'],conditionFilters:[],images:true,shipping:true,requiresAuthentication:true,details:false,state:state as 'available'|'disabled'|'requires_credentials',reason:state==='available'?'Google Shopping via SerpApi; source-reported shopping data, not independently verified retailer prices.':state==='disabled'?'SerpApi product discovery is disabled.':'Configure SERPAPI_API_KEY on the backend to use Google Shopping.'};}
 supports(context:ProductContext){return context.request.kind==='product'&&context.request.purpose!=='information'&&!!context.country&&Object.hasOwn(MARKETS,context.country)&&! /(?:^|_)(?:moving|movers?|services?|housing|rentals?|apartments?|accommodation|hotels?|flights?|transport|vehicles?|cars?|insurance|protection|fuel|registration|activities)(?:_|$)/i.test(context.request.category);}
 async getProductDetails():Promise<ProductRecord>{throw new AppError('PRODUCT_DETAILS_UNSUPPORTED','This adapter searches Google Shopping only. Open the product link to check current retailer details.',422);}
 async searchProducts(context:ProductContext,signal?:AbortSignal){
  const caps=this.getCapabilities();if(caps.state!=='available')throw new AppError('SERPAPI_NOT_CONFIGURED',caps.reason,503);
  if(!this.supports(context))throw new AppError('PRODUCT_MARKET_UNSUPPORTED','Google Shopping is not enabled for this country or research category.',422);
  if(this.deps.allow&&!this.deps.allow())throw new AppError('PUBLIC_AI_DISABLED','Public provider searches are temporarily paused. Saved results remain available.',503);
  const market=MARKETS[context.country as keyof typeof MARKETS],r=context.request;
  let query=(r.searchTerms??r.preferences.find(p=>p.startsWith('Looking for:'))?.slice('Looking for:'.length).trim()??r.category.replaceAll('_',' ')).slice(0,200);
  if(r.condition&&r.condition!=='any'&&!/\b(?:used|new|refurbished|käytetty|uusi|kunnostettu)\b/i.test(query))query+=' '+(market.hl==='fi'?{used:'käytetty',new:'uusi',refurbished:'kunnostettu'}[r.condition]:r.condition);
  const params=new URLSearchParams({engine:'google_shopping',q:query,gl:market.gl,hl:market.hl,api_key:this.settings.apiKey!,output:'json'});
  // Localisation is search context, never evidence of seller locality or delivery.
  const location=r.location??context.project.location;
  if(location&&location.includes(',')&&location.length<=200&&(!r.country||context.project.location===location||new RegExp(context.country==='FI'?'Finland|Suomi':context.country==='DE'?'Germany|Deutschland':context.country==='GB'?'United Kingdom|UK':context.country==='US'?'United States|USA':context.country!,'i').test(location)))params.set('location',location);
  if(r.maxPrice!==undefined&&context.currency===market.currency)params.set('max_price',String(r.maxPrice));
  if(r.sort==='price_asc')params.set('sort_by','1');
  const started=this.now();let status=0;let searchId:string|undefined;const invalidItemReasons:Record<string,number>={};
  const dispatch=async()=>{
   try{
    const response=await this.fetcher('https://serpapi.com/search?'+params,{headers:{Accept:'application/json'},redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(this.settings.timeoutMs)]):AbortSignal.timeout(this.settings.timeoutMs)});status=response.status;
    if(!response.ok)throw new AppError(status===429?'SERPAPI_RATE_LIMITED':status===401||status===403?'SERPAPI_ACCESS_DENIED':'SERPAPI_UNAVAILABLE',status===429?'Google Shopping provider is rate limited. Please wait before retrying.':'Google Shopping provider could not complete this request. No automatic Web Research was started.',status===429?429:502);
    if(!response.headers.get('content-type')?.includes('application/json'))throw new AppError('INVALID_PRODUCT_RESPONSE','Google Shopping returned an unsupported response format.',502);
    const reader=response.body?.getReader();if(!reader)throw new AppError('INVALID_PRODUCT_RESPONSE','Google Shopping returned an empty response.',502);
    const chunks:Uint8Array[]=[];let length=0;
    while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>2_000_000){await reader.cancel();throw new AppError('INVALID_PRODUCT_RESPONSE','Google Shopping response exceeded the safe size limit.',502);}chunks.push(chunk.value);}
    let raw:unknown;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AppError('INVALID_PRODUCT_RESPONSE','Google Shopping returned invalid JSON.',502);}
    const parsed=batchSchema.safeParse(raw);if(!parsed.success)throw new AppError('INVALID_PRODUCT_RESPONSE','Google Shopping response did not match its expected contract.',502);
    if(parsed.data.error||parsed.data.search_metadata.status!=='Success')throw new AppError('SERPAPI_UNAVAILABLE','Google Shopping reported a provider error. No automatic paid fallback was started.',502);
    searchId=parsed.data.search_metadata.id;const records:ProductRecord[]=[];let invalid=0;
    for(const item of parsed.data.shopping_results??[]){try{const record=extractSerpApiItem(item,{country:context.country!,now:new Date(this.now()).toISOString()});if(JSON.stringify(record).includes(this.settings.apiKey!))throw Error('SECRET_IN_PROVIDER_RESULT');records.push(record);}catch(error){invalid++;const reason=error instanceof z.ZodError?'schema':error instanceof Error&&/URL/.test(error.message)?'unsafe_or_nonproduct_url':'invalid_product';invalidItemReasons[reason]=(invalidItemReasons[reason]??0)+1;}}
    return {records,candidateCount:parsed.data.shopping_results?.length??0,invalidCount:invalid};
   }catch(error){if(error instanceof AppError)throw error;throw new AppError(signal?.aborted||error instanceof Error&&/timeout|abort/i.test(error.name)?'SERPAPI_TIMEOUT':'SERPAPI_UNAVAILABLE','Google Shopping did not complete. You may retry or explicitly choose Web Research; no additional provider was called.',504);}
   finally{try{this.deps.diagnose?.({provider:'serpapi',operation:'search',durationMs:this.now()-started,status,apiRequests:1,estimatedOpenAiCostUsd:0,...(searchId&&/^[a-zA-Z0-9_-]{1,100}$/.test(searchId)?{providerSearchId:searchId}:{}),invalidItemReasons});}catch{/* Diagnostics must not affect results. */}}
  };
  return this.deps.limit?this.deps.limit(context.scopeKey,dispatch):dispatch();
 }
}
