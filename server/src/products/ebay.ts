import {z} from 'zod';
import type {Config} from '../config.js';
import {AppError} from '../errors.js';
import {EbayItemSchema,extractEbayItem} from './extractor.js';
import type {ProductContext,ProductProvider,ProductRecord} from './types.js';
export const EBAY_MARKETS={DE:{id:'EBAY_DE',currency:'EUR'},GB:{id:'EBAY_GB',currency:'GBP'},US:{id:'EBAY_US',currency:'USD'},FR:{id:'EBAY_FR',currency:'EUR'},IT:{id:'EBAY_IT',currency:'EUR'},ES:{id:'EBAY_ES',currency:'EUR'},CA:{id:'EBAY_CA',currency:'CAD'},AU:{id:'EBAY_AU',currency:'AUD'}} as const;
export type EbaySettings=Config['products'];
export type ProductNetworkEvent={provider:'ebay';operation:'oauth'|'search'|'details';durationMs:number;status:number;errorCategory:string|null;estimatedOpenAiCostUsd:0};
type Dependencies={fetch?:typeof fetch;now?:()=>number;limit?:<T>(scope:string,dispatch:()=>Promise<T>)=>Promise<T>;diagnose?:(event:ProductNetworkEvent)=>void;allow?:()=>boolean};
const searchSchema=z.object({itemSummaries:z.array(z.unknown()).max(200).optional(),total:z.number().optional(),warnings:z.array(z.unknown()).optional()}).passthrough().refine(x=>Array.isArray(x.itemSummaries)||typeof x.total==='number');
export class EbayBrowseProvider implements ProductProvider{
 private token:{value:string;until:number}|null=null;private pendingToken:Promise<string>|null=null;private blockedUntil=0;private permissionDenied=false;
 private readonly fetcher:typeof fetch;private readonly now:()=>number;
 constructor(private settings:EbaySettings,private deps:Dependencies={}){this.fetcher=deps.fetch??fetch;this.now=deps.now??Date.now;}
 getCapabilities(){const s=this.settings;const state=!s.enabled?'disabled':!s.clientId||!s.clientSecret?'requires_credentials':!s.approved||!s.freeApiConfirmed||this.permissionDenied?'requires_partner_approval':'available';return{id:'ebay',environment:s.environment,countries:Object.keys(EBAY_MARKETS),categories:['general_products'],excludedCategories:['vehicle','car','cars','home_insurance'],conditionFilters:['new','used'],images:true,shipping:true,requiresAuthentication:true,details:true,state,reason:state==='available'?`Configured ${s.environment} Browse access; requests may still be denied by eBay.`:state==='disabled'?'eBay is not enabled.':state==='requires_credentials'?'Backend eBay client ID and client secret are missing.':'The operator must verify eBay permissions, applicable display/usage terms and no per-call fees.'} as const;}
 supports(c:ProductContext){return c.request.kind==='product'&&!!c.country&&Object.hasOwn(EBAY_MARKETS,c.country)&&!['vehicle','car','cars','home_insurance'].includes(c.request.category);}
 private base(){return this.settings.environment==='sandbox'?'https://api.sandbox.ebay.com':'https://api.ebay.com';}
 private async network(path:string,scope:string,operation:ProductNetworkEvent['operation'],options:RequestInit,signal?:AbortSignal):Promise<unknown>{
  if(this.getCapabilities().state!=='available')throw new AppError('PRODUCT_PROVIDER_UNAVAILABLE',this.getCapabilities().reason,503);
  if(this.deps.allow&&!this.deps.allow())throw new AppError('PRODUCT_RESEARCH_PAUSED','Public external product research is paused. Saved results remain available.',503);
  if(this.blockedUntil>this.now())throw new AppError('PRODUCT_RATE_LIMITED','eBay asked this application to wait before another request.',429);
  const start=this.now();let status=0,errorCategory:string|null=null;
  const run=async()=>{
   const deadline=AbortSignal.timeout(this.settings.timeoutMs),combined=signal?AbortSignal.any([signal,deadline]):deadline;
   const response=await this.fetcher(this.base()+path,{...options,redirect:'error',signal:combined});status=response.status;
   if(status===429){const delay=Number(response.headers.get('retry-after'));this.blockedUntil=this.now()+Math.min(300000,Math.max(1000,Number.isFinite(delay)?delay*1000:60000));throw new AppError('PRODUCT_RATE_LIMITED','eBay rate limit reached. Please try later.',429);}
   if(status===401){this.token=null;throw new AppError('PRODUCT_AUTH_FAILED','eBay rejected the configured credential or token. Ask the administrator to check access.',503);}
   if(status===403){this.permissionDenied=true;throw new AppError('PRODUCT_ACCESS_DENIED','eBay Browse permission is not available for this application.',503);}
   if(!response.ok)throw new AppError('PRODUCT_PROVIDER_ERROR','The product provider could not complete this request. No web fallback was run.',502);
   if(!response.headers.get('content-type')?.includes('application/json'))throw new AppError('INVALID_PRODUCT_RESPONSE','The provider did not return JSON.',502);
   if(Number(response.headers.get('content-length')??0)>1048576)throw new AppError('PRODUCT_RESPONSE_TOO_LARGE','The provider response exceeded its size limit.',502);
   const reader=response.body?.getReader();if(!reader)throw new AppError('INVALID_PRODUCT_RESPONSE','The provider response was empty.',502);let size=0;const chunks:Uint8Array[]=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576){await reader.cancel();throw new AppError('PRODUCT_RESPONSE_TOO_LARGE','The provider response exceeded its size limit.',502);}chunks.push(value);}
   try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AppError('INVALID_PRODUCT_RESPONSE','The provider JSON was invalid.',502);}
  };
  try{return await(this.deps.limit?this.deps.limit(scope,run):run());}catch(e){errorCategory=e instanceof AppError?e.code:signal?.aborted?'PRODUCT_CANCELLED':'PRODUCT_TIMEOUT_OR_NETWORK';if(e instanceof AppError)throw e;throw new AppError(errorCategory,'Product research could not finish. No mock results were substituted.',504);}finally{try{this.deps.diagnose?.({provider:'ebay',operation,durationMs:this.now()-start,status,errorCategory,estimatedOpenAiCostUsd:0});}catch{}}
 }
 private async accessToken(scope:string,signal?:AbortSignal){
  if(this.token&&this.token.until>this.now()+30000)return this.token.value;
  if(this.pendingToken)return this.pendingToken;
  this.pendingToken=(async()=>{const body=new URLSearchParams({grant_type:'client_credentials',scope:'https://api.ebay.com/oauth/api_scope'});const raw=await this.network('/identity/v1/oauth2/token',scope,'oauth',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(this.settings.clientId+':'+this.settings.clientSecret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body},signal);const parsed=z.object({access_token:z.string().min(1).max(12000),expires_in:z.number().int().min(1).max(86400)}).passthrough().safeParse(raw);if(!parsed.success)throw new AppError('INVALID_PRODUCT_RESPONSE','eBay did not return a valid application token.',502);this.token={value:parsed.data.access_token,until:this.now()+parsed.data.expires_in*1000};return this.token.value;})();
  try{return await this.pendingToken;}finally{this.pendingToken=null;}
 }
 private market(context:ProductContext){if(!this.supports(context))throw new AppError('PRODUCT_MARKET_UNSUPPORTED','No configured eBay marketplace serves this country/category. No US marketplace was assumed.',422);return EBAY_MARKETS[context.country as keyof typeof EBAY_MARKETS];}
 private async headers(context:ProductContext,signal?:AbortSignal){const marketplace=this.market(context);return{Authorization:'Bearer '+await this.accessToken(context.scopeKey,signal),'X-EBAY-C-MARKETPLACE-ID':marketplace.id,...(context.request.deliveryPostalCode?{'X-EBAY-C-ENDUSERCTX':'contextualLocation='+encodeURIComponent('country='+context.country+',zip='+context.request.deliveryPostalCode)}:{}),Accept:'application/json'};}
 async searchProducts(context:ProductContext,signal?:AbortSignal){
  const market=this.market(context),r=context.request;const filters=['buyingOptions:{FIXED_PRICE}','deliveryCountry:'+context.country];
  if(r.condition==='new')filters.push('conditions:{NEW}');if(r.condition==='used')filters.push('conditions:{USED}');
  // Refurbished IDs vary by marketplace/category. Retrieve candidates and validate their explicit condition IDs; no guessed filter enum.
  if(r.maxPrice!==undefined)filters.push(`price:[..${r.maxPrice.toFixed(2)}]`,`priceCurrency:${context.currency}`);
  const keywords=(r.searchTerms??r.preferences.find(v=>v.startsWith('Looking for:'))?.slice('Looking for:'.length).trim()??r.category.replaceAll('_',' ')).replace(/\b(?:under|below|max(?:imum)?|up to)\s*(?:EUR|USD|GBP|€|£|\$)?\s*\d+(?:[.,]\d+)?/gi,' ').replace(/\b(?:find|show|me|please|used|new|refurbished|three|options|in Germany|in the UK|in Finland|a|an|for|with|budget|under|below)\b/gi,' ').replace(/\s+/g,' ').trim();
  const params=new URLSearchParams({q:keywords.slice(0,100),limit:String(Math.min(30,Math.max(1,r.limit??10))),filter:filters.join(',')});if(r.providerCategoryId)params.set('category_ids',r.providerCategoryId);
  // Preserve eBay's Best Match order until partner sorting/display permissions are confirmed.
  const raw=await this.network('/buy/browse/v1/item_summary/search?'+params,context.scopeKey,'search',{headers:await this.headers(context,signal)},signal);const parsed=searchSchema.safeParse(raw);if(!parsed.success)throw new AppError('INVALID_PRODUCT_RESPONSE','eBay search did not match the expected contract.',502);
  const result:ProductRecord[]=[];for(const item of parsed.data.itemSummaries??[]){try{result.push(extractEbayItem(item,{marketplaceId:market.id,country:context.country!,mode:this.settings.environment,deliveryFiltered:true,postalCode:r.deliveryPostalCode,now:new Date(this.now()).toISOString()}));}catch{/* Malformed individual listings never become invented products. */}}return {records:result,candidateCount:parsed.data.itemSummaries?.length??0,invalidCount:(parsed.data.itemSummaries?.length??0)-result.length};
 }
 async getProductDetails(id:string,context:ProductContext,signal?:AbortSignal){
  if(!/^[A-Za-z0-9_|-]{1,200}$/.test(id))throw new AppError('INVALID_PRODUCT_ID','Invalid eBay item identifier.',400);const market=this.market(context);
  const raw=await this.network('/buy/browse/v1/item/'+encodeURIComponent(id),context.scopeKey,'details',{headers:await this.headers(context,signal)},signal);
  if(!EbayItemSchema.safeParse(raw).success||EbayItemSchema.parse(raw).itemId!==id)throw new AppError('INVALID_PRODUCT_RESPONSE','eBay item details did not match the expected contract.',502);
  try{return extractEbayItem(raw,{marketplaceId:market.id,country:context.country!,mode:this.settings.environment,deliveryFiltered:false,postalCode:context.request.deliveryPostalCode,now:new Date(this.now()).toISOString()});}catch{throw new AppError('INVALID_PRODUCT_RESPONSE','The product identity or source could not be validated.',502);}
 }
}
