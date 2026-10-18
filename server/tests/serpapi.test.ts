import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {buildApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {extractSerpApiItem} from '../src/products/extractor.js';
import {SerpApiShoppingProvider} from '../src/products/serpapi.js';
import {ProductRequestLimiter} from '../src/products/limits.js';
import {createProductResearchRouter,productContext} from '../src/products/router.js';
import {ResearchRequestSchema,LifeProjectSchema,type LifeProject,type ResearchRequest} from '../../shared/contracts/index.js';
const settings={enabled:true,apiKey:'mock-private-serpapi-credential',timeoutMs:100,dailyRequests:5,globalDailyRequests:30};
const now='2026-10-18T12:00:00.000Z';
// Contract-shaped FICTIONAL fixtures. No live Google, merchant or OpenAI calls.
const item=(id='1',patch:Record<string,unknown>={})=>({title:'Sohva synthetic '+id,product_id:id,product_link:'https://www.google.com/search?ibp=oshop&prds=catalogid:'+id,price:'199,00 €',extracted_price:199,source:'Fictional furniture merchant',thumbnail:'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:synthetic-'+id,...patch});
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const success=(items:unknown[])=>json({search_metadata:{status:'Success',id:'synthetic-search-id'},shopping_results:items});
const request=(patch:Partial<ResearchRequest>={})=>ResearchRequestSchema.parse({category:'sofa',kind:'product',country:'FI',currency:'EUR',searchTerms:'sohva',maxPrice:200,...patch});
async function project(){const app=await buildApp({config:loadConfig({AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'memory',LOG_LEVEL:'silent'})});try{return (await app.inject({method:'POST',url:'/api/projects',payload:{message:"I'm moving to Turku, Finland with EUR 2000"}})).json().project as LifeProject;}finally{await app.close();}}
const context=async(patch:Partial<ResearchRequest>={})=>productContext(request(patch),await project());

test('SerpApi extraction preserves Finnish source price, image, merchant, Google destination and timestamp',()=>{
 const r=extractSerpApiItem(item(),{country:'FI',now});assert.equal(r.priceMinor,19900);assert.equal(r.currency,'EUR');assert.equal(r.imageUrl,item().thumbnail);assert.equal(r.seller,item().source);assert.equal(r.url,item().product_link);assert.equal(r.fetchedAt,now);assert.equal(r.metadata.provider,'serpapi');assert.equal(r.metadata.linkDestination,'google_product');assert.equal(r.metadata.fieldProvenance.price?.method,'provider_api');assert.equal(r.condition,'unknown');assert.equal(r.location,null);assert.equal(r.metadata.sellerCountry,null);assert.equal(r.metadata.deliverySupported,null);assert.equal(r.shippingCostMinor,null);assert.equal(r.metadata.knownTotalMinor,null);assert.equal(r.availability,'unknown');
});
test('missing fields never become free, new, local, stocked or illustrated with a different product',()=>{
 const r=extractSerpApiItem(item('1',{price:undefined,extracted_price:undefined,thumbnail:'javascript:alert(1)',thumbnails:['https://images.example.org/unsafe.svg']}),{country:'FI'});assert.equal(r.priceMinor,null);assert.equal(r.currency,null);assert.equal(r.imageUrl,null);assert.equal(r.condition,'unknown');assert.equal(r.shippingCostMinor,null);
 const dollar=extractSerpApiItem(item('2',{price:'$100',extracted_price:100}),{country:'US'});assert.equal(dollar.currency,null);assert.equal(dollar.priceMinor,null);
});
test('localized prices are exact and conflicting amounts, currencies, installments and ranges cannot become purchase prices',()=>{
 for(const [display,number,expected]of [['199,- EUR',199,19900],['1.299,95 €',1299.95,129995],['EUR 199.95',199.95,19995]] as const)assert.equal(extractSerpApiItem(item('1',{price:display,extracted_price:number}),{country:'FI'}).priceMinor,expected);
 for(const patch of [{price:'€199',extracted_price:99},{price:'€199',currency:'USD'},{price:'from €99',extracted_price:99},{price:'€19/month',extracted_price:19},{price:'€99–199',extracted_price:99}])assert.equal(extractSerpApiItem(item('1',patch),{country:'FI'}).priceMinor,null);
 const usd=extractSerpApiItem(item('1',{price:'US$199.00',extracted_price:199}),{country:'FI'});assert.equal(usd.currency,'USD');assert.equal(usd.priceMinor,19900);
});
test('only explicit condition and unconditional delivery evidence are normalized',()=>{
 assert.equal(extractSerpApiItem(item('1',{second_hand_condition:'Used'}),{country:'FI'}).condition,'used');assert.equal(extractSerpApiItem(item('1',{second_hand_condition:'Refurbished'}),{country:'FI'}).condition,'refurbished');assert.equal(extractSerpApiItem(item('1',{second_hand_condition:'Like new'}),{country:'FI'}).condition,'unknown');
 for(const [delivery,fee]of [['Free delivery',0],['€10.50 delivery',1050],['Free delivery on orders over €250',null],['Calculated at checkout',null]] as const){const r=extractSerpApiItem(item('1',{delivery}),{country:'FI'});assert.equal(r.shippingCostMinor,fee);assert.equal(r.metadata.deliverySupported,null);}
});
test('unsafe links, general Google search pages, provider proxies and credentials are rejected',()=>{
 for(const url of ['javascript:alert(1)','http://127.0.0.1/private','https://www.google.com/search?q=sofa','https://serpapi.com/search?engine=google_shopping','https://retailer.example.org/sofa?api_key=secret'])assert.throws(()=>extractSerpApiItem(item('1',{product_link:url}),{country:'FI'}));
 assert.equal(extractSerpApiItem(item('1',{product_link:'https://retailer.example.org/products/sofa'}),{country:'FI'}).metadata.linkDestination,'retailer');
});
test('one documented search maps actual query, gl/hl, location, max_price and sorting without hidden pagination or AI',async()=>{
 let calls=0;const p=new SerpApiShoppingProvider(settings,{fetch:(async(url:unknown,options:RequestInit)=>{calls++;const u=new URL(String(url));assert.equal(u.origin+u.pathname,'https://serpapi.com/search');for(const [key,value]of Object.entries({engine:'google_shopping',q:'sohva',gl:'fi',hl:'fi',max_price:'200',sort_by:'1',location:'Turku, Finland'}))assert.equal(u.searchParams.get(key),value);assert.equal(u.searchParams.get('num'),null);assert.equal(u.searchParams.get('no_cache'),null);assert.equal(options.redirect,'error');return success([item(),{bad:'malformed'}]);}) as typeof fetch});
 const r=await p.searchProducts(await context({location:'Turku, Finland',sort:'price_asc'}));assert.equal(calls,1);assert.equal(r.records.length,1);assert.equal(r.candidateCount,2);assert.equal(r.invalidCount,1);
});
test('country localization cannot invent currency conversion or delivery; unsupported categories are never queried',async()=>{
 let calls=0;const p=new SerpApiShoppingProvider(settings,{fetch:(async(url:unknown)=>{calls++;const u=new URL(String(url));assert.equal(u.searchParams.get('gl'),'uk');assert.equal(u.searchParams.get('hl'),'en');assert.equal(u.searchParams.get('max_price'),null);return success([]);}) as typeof fetch});await p.searchProducts(await context({country:'GB',currency:'EUR'}));
 for(const category of ['moving_services','housing','transport','vehicle','insurance'])assert.equal(p.supports(await context({category})),false);assert.equal(p.supports(await context({country:'ZZ'})),false);assert.equal(calls,1);
});
test('credentials, disabled provider and kill switch fail before any dispatch or quota reservation',async()=>{
 let calls=0;const deps={fetch:(async()=>{calls++;return success([]);}) as typeof fetch};const c=await context();for(const patch of [{apiKey:undefined},{enabled:false}]){const p=new SerpApiShoppingProvider({...settings,...patch},deps);await assert.rejects(()=>p.searchProducts(c),{code:'SERPAPI_NOT_CONFIGURED'});}const p=new SerpApiShoppingProvider(settings,{...deps,allow:()=>false});await assert.rejects(()=>p.searchProducts(c),{code:'PUBLIC_AI_DISABLED'});assert.equal(calls,0);
});
for(const [status,code]of [[403,'SERPAPI_ACCESS_DENIED'],[429,'SERPAPI_RATE_LIMITED'],[500,'SERPAPI_UNAVAILABLE']] as const)test(`SerpApi ${status} is safe and never retries or starts a paid AI fallback`,async()=>{
 let calls=0;const p=new SerpApiShoppingProvider(settings,{fetch:(async()=>{calls++;return json({error:settings.apiKey},status);}) as typeof fetch});await assert.rejects(()=>p.searchProducts(awaitContext),(e:any)=>e.code===code&&!e.message.includes(settings.apiKey));assert.equal(calls,1);
});
const awaitContext:any={request:request(),country:'FI',currency:'EUR',scopeKey:'test',project:{location:null}};
test('timeout, HTML, malformed JSON and provider error resolve without exposing provider payloads',async()=>{
 for(const response of [new Response('<html>blocked</html>'),new Response('{broken',{headers:{'content-type':'application/json'}}),json({search_metadata:{status:'Error'},error:'private-provider-payload'})]){const p=new SerpApiShoppingProvider(settings,{fetch:(async()=>response) as typeof fetch});await assert.rejects(()=>p.searchProducts(awaitContext));}
 const p=new SerpApiShoppingProvider(settings,{fetch:(async(_u:unknown,o:RequestInit)=>new Promise((_resolve,reject)=>o.signal!.addEventListener('abort',()=>reject(o.signal!.reason)))) as typeof fetch});await assert.rejects(()=>p.searchProducts(awaitContext),{code:'SERPAPI_TIMEOUT'});
});
test('router prefers configured SerpApi, retains explicit web/eBay routes and classifies unknown condition as potential',async()=>{
 const p=await project();let webCalls=0;const web:any={mode:'unavailable',async search(){webCalls++;return{status:'unavailable',offers:[]};}};
 const serp=new SerpApiShoppingProvider(settings,{fetch:(async()=>success([item('1',{second_hand_condition:'Used'}),item('2'),item('3',{second_hand_condition:'New'}),item('4',{price:'250 €',extracted_price:250}),item('5',{title:'Sofa cushion cover'}),item('1',{second_hand_condition:'Used'})])) as typeof fetch});
 const router=createProductResearchRouter(web,[serp]);const r=await router.search(request({productSource:undefined,condition:'used'}),p);assert.equal(r.productDiagnostics!.provider,'serpapi');assert.equal(r.summary!.supportedCount,1);assert.equal(r.summary!.potentialCount,1);assert.equal(r.productDiagnostics!.rejectedCount,4);assert.equal(r.offers[0]!.priceStatus,'estimated');assert.equal(r.offers[0]!.priceOrigin,'source_reported');assert.equal(webCalls,0);
 await router.search(request({productSource:'web'}),p);assert.equal(webCalls,1);await router.search(request({kind:'service',category:'moving'}),p);assert.equal(webCalls,2);const explicit=await router.search(request({productSource:'ebay'}),p);assert.equal(explicit.status,'unavailable');assert.equal(webCalls,2);
});
test('unknown currency and local-only location remain potential; cheapest-first sorts known prices without unknown=zero',async()=>{
 const provider=new SerpApiShoppingProvider(settings,{fetch:(async()=>success([item('1',{price:'£90',extracted_price:90}),item('2',{price:'100 €',extracted_price:100}),item('3',{price:undefined,extracted_price:undefined}),item('4',{price:'90 €',extracted_price:90})])) as typeof fetch});const router=createProductResearchRouter({mode:'unavailable',async search(){throw Error('not used');}},[provider]);const p=await project(),r=await router.search(request({sort:'price_asc'}),p);assert.equal(r.summary!.supportedCount,2);assert.equal(r.offers[0]!.priceMinor,9000);assert.equal(r.offers[1]!.priceMinor,10000);assert.equal(r.offers.at(-1)!.priceMinor,null);const local=await router.search(request({localOnly:true,location:'Turku'}),p);assert.equal(local.summary!.supportedCount,0);assert(local.offers.every(o=>o.missingEvidence?.some(m=>m.field==='location'&&m.required)));
});
test('SerpApi durable 5/user and 30/global reservations survive restart and dispatch failures count',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'serpapi-limit-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=path.join(dir,'serpapi.sqlite');let q=new ProductRequestLimiter(file,5,30);for(let n=0;n<5;n++)await q.run('a',async()=>1);await assert.rejects(()=>q.run('a',async()=>1),{code:'PRODUCT_QUOTA_EXCEEDED'});q.close();q=new ProductRequestLimiter(file,5,30);assert.equal(q.status('a').personalRequests,5);await assert.rejects(()=>q.run('b',async()=>{throw Error('dispatched provider failed');}));for(let n=6;n<30;n++)await q.run('visitor-'+n,async()=>1);assert.equal(q.status().requests,30);await assert.rejects(()=>q.run('fresh',async()=>1),{code:'PRODUCT_QUOTA_EXCEEDED'});q.close();
});
test('actual public HTTP: source prices/images, ownership, CSRF, quota, cart replacement and reload share existing services',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'serpapi-http-'));t.after(()=>rm(dir,{recursive:true,force:true}));const origin='http://127.0.0.1:5994';let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return success([item('1',{price:'100 €',extracted_price:100}),item('2',{price:'180 €',extracted_price:180}),item('3',{price:'£90',extracted_price:90})]);});
 const config=loadConfig({DATA_DIR:dir,STORAGE_MODE:'local',AI_MODE:'local',RESEARCH_MODE:'unavailable',LOG_LEVEL:'silent',PUBLIC_ACCESS_ENABLED:'true',PUBLIC_AI_ENABLED:'true',ADMIN_ACCESS_KEY:'synthetic-separate-serp-admin-key',SESSION_COOKIE_SECURE:'false',ALLOWED_ORIGINS:origin,SERPAPI_API_KEY:settings.apiKey,SERPAPI_REQUESTS_PER_USER_PER_DAY:'1'});let app=await buildApp({config});t.after(()=>app.close());
 const session=async()=>{const r=await app.inject({method:'POST',url:'/api/session',headers:{origin},payload:{}});return{cookie:String(r.headers['set-cookie']).split(';')[0]!,csrf:r.json().csrfToken};};const a=await session(),b=await session();const req=(v:typeof a,url:string,method:'GET'|'POST'='GET',payload?:unknown)=>app.inject({method,url,headers:{origin,cookie:v.cookie,'x-csrf-token':v.csrf,'idempotency-key':randomUUID()},...(method==='GET'?{}:{payload:payload??{}})});
 const made=await req(a,'/api/projects','POST',{message:"I'm moving to Turku, Finland with EUR 2000"});assert.equal(made.statusCode,201,made.body);const base='/api/projects/'+made.json().project.id;
 const researched=await req(a,base+'/research','POST',request());assert.equal(researched.statusCode,200,researched.body);assert.equal(calls,1);assert.equal((await req(a,'/api/session')).json().usage.used,0);const own=researched.json().offers.find((o:any)=>o.priceMinor===10000),alternative=researched.json().offers.find((o:any)=>o.priceMinor===18000),foreign=researched.json().offers.find((o:any)=>o.currency==='GBP');assert(own&&alternative&&foreign);
 for(const [suffix,method,payload]of [['','GET'],['/research','POST',request()],['/cart/items','POST',{offerId:own.id}]] as const)assert.equal((await req(b,base+suffix,method,payload)).statusCode,404);assert.equal(calls,1);assert.equal((await req(a,'/api/admin/product-usage')).statusCode,404);
 assert.equal((await app.inject({method:'POST',url:base+'/research',headers:{origin,cookie:a.cookie,'idempotency-key':randomUUID()},payload:request()})).statusCode,403);assert.equal((await req(a,base+'/cart/items','POST',{offerId:foreign.id})).statusCode,422);
 const add=await req(a,base+'/cart/items','POST',{offerId:own.id,status:'proposed'});assert.equal(add.statusCode,201,add.body);assert.equal(add.json().budget.proposedMinor,10000);assert.equal(add.json().items[0].deliveryCostMinor,null);assert.equal(add.json().items[0].imageUrl,item().thumbnail);assert.equal((await req(a,base+'/cart/items','POST',{offerId:own.id})).statusCode,409);
 const p=(await req(a,base)).json().project;const changed=await req(a,base+'/cart/items/'+p.cart[0].id+'/replace','POST',{offerId:alternative.id,approved:true,expectedRevision:p.revision});assert.equal(changed.statusCode,200,changed.body);assert.equal(changed.json().project.cart.length,1);assert.equal(changed.json().project.budget.proposedMinor,18000);assert(changed.json().project.scenarios.every((s:any)=>!s.selectedOfferIds.includes(foreign.id)));
 assert.equal((await req(a,base+'/research','POST',request())).statusCode,429);assert.equal(calls,1);await app.close();app=await buildApp({config});const reloaded=await req(a,base);assert.equal(reloaded.statusCode,200);assert.equal(reloaded.json().project.budget.proposedMinor,18000);assert(LifeProjectSchema.safeParse(reloaded.json().project).success);assert.equal((await req(a,base+'/research','POST',request())).statusCode,429);assert.equal(calls,1);
});

test('nullable optional shopping fields preserve a real product identity without inventing values',()=>{
 const record=extractSerpApiItem(item('nullable',{snippet:null,delivery:null,second_hand_condition:null,thumbnail:null,thumbnails:null,multiple_sources:null,price:null,extracted_price:null,currency:null}),{country:'FI'});assert.equal(record.title,'Sohva synthetic nullable');assert.equal(record.priceMinor,null);assert.equal(record.imageUrl,null);assert.equal(record.condition,'unknown');assert.equal(record.seller,'Fictional furniture merchant');
});
test('changing Google tracking URLs cannot create new product identity, but named variants and merchants remain distinct',()=>{
 const first=extractSerpApiItem(item('same'),{country:'FI'}),tracked=extractSerpApiItem(item('same',{product_link:item('same').product_link+'&headlineOfferDocid=different'}),{country:'FI'});assert.equal(first.metadata.sourceProductId,tracked.metadata.sourceProductId);const other=extractSerpApiItem(item('same',{source:'Another fictional merchant'}),{country:'FI'});assert.notEqual(first.metadata.sourceProductId,other.metadata.sourceProductId);
});
test('named multi-seller Google results retain their source-reported price; conflicting duplicate prices remain potential',async()=>{
 const provider=new SerpApiShoppingProvider(settings,{fetch:(async()=>success([item('named',{multiple_sources:true}),item('conflict',{price:'100 €',extracted_price:100}),item('conflict',{price:'150 €',extracted_price:150,product_link:item('conflict').product_link+'&headlineOfferDocid=other'}),item('aggregate',{source:'3 stores',multiple_sources:true})])) as typeof fetch});const router=createProductResearchRouter({mode:'unavailable',async search(){throw Error('not used');}},[provider]);const result=await router.search(request(),await project());assert.equal(result.offers.length,3);const named=result.offers.find(o=>o.product?.attributes.googleProductId==='named')!;assert.equal(named.eligibilityStatus,'supported');const conflict=result.offers.find(o=>o.product?.attributes.googleProductId==='conflict')!;assert.equal(conflict.eligibilityStatus,'potential');assert.equal(conflict.evidenceByField!.price!.status,'conflicting');assert.equal(conflict.priceMinor,10000,'Original reported amount is retained for audit, not selected as a current verified price');assert(result.rejections!.some(r=>r.reasons.includes('duplicate')));assert.equal(result.offers.find(o=>o.product?.attributes.googleProductId==='aggregate')!.eligibilityStatus,'potential');
 const {reconcileSerpApiResult}=await import('../src/products/reconcile.js');const snapshot=JSON.stringify(result);reconcileSerpApiResult(result);assert.equal(JSON.stringify(result),snapshot,'reconciliation is idempotent');
});
