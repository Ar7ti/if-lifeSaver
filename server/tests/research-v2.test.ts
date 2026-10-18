import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Responses} from 'openai/resources/responses/responses';
import {buildApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {createSearchProvider} from '../src/research.js';
import {planResearch} from '../src/research-intent.js';
import {ResearchRequestSchema,LifeProjectSchema,ResearchResultSchema,type LifeProject} from '../../shared/contracts/index.js';

// Synthetic source summaries and prices. No network requests or real listings.
function entry(title:string,price:number|null=120,condition='used',location:string|null='Turku',url=`https://fixture-market.fi/listing/${encodeURIComponent(title)}`){
 const identity=price===null?`${title}.`:`${title} costs EUR ${price}.`;
 const cond=condition==='unknown'?'Condition: not stated.':`Condition: ${condition}.`;
 const local=location?`Location: ${location}.`:'';
 return {url,text:`${identity} ${cond} ${local}`,candidate:{sourceUrl:url,sourceType:'listing',title,identityQuote:identity,priceMinor:price===null?null:price*100,priceQuote:price===null?null:identity,condition:['used','new','refurbished'].includes(condition)?condition:'unknown',conditionQuote:condition==='unknown'?null:cond,location,locationQuote:location?local:null,availability:'unknown',availabilityQuote:null,deliveryAvailable:null,deliveryCostMinor:null,deliveryQuote:null}};
}
type Entry=ReturnType<typeof entry>;
function search(entries:Entry[]){let text='';const annotations:unknown[]=[];for(const e of entries){if(text)text+='\n\n';text+=e.text;const start=text.length;text+=' [source]';annotations.push({type:'url_citation',url:e.url,title:'Synthetic fixture',start_index:start,end_index:text.length});}return {status:'completed',usage:{input_tokens:150,output_tokens:100},output:[{type:'web_search_call',status:'completed',action:{type:'search',sources:entries.map(e=>({type:'url',url:e.url}))}},{type:'message',role:'assistant',content:[{type:'output_text',text,annotations}]}]};}
function extraction(entries:Entry[]){return {status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({offers:entries.map(e=>e.candidate)}),annotations:[]}]}]};}
async function project(message='Moving to Turku with EUR 2000') {const app=await buildApp({config:loadConfig({AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'memory',LOG_LEVEL:'silent'})});try{return (await app.inject({method:'POST',url:'/api/projects',payload:{message}})).json().project as LifeProject;}finally{await app.close();}}
const options={mode:'live' as const,apiKey:'fixture-never-sent',model:'fixture',timeoutMs:1000};
async function run(t:import('node:test').TestContext,entries:Entry[],input:Record<string,unknown>={},p?:LifeProject){let calls=0;t.mock.method(Responses.prototype,'create',async()=>calls++===0?search(entries):extraction(entries));const r=await createSearchProvider(options).search(ResearchRequestSchema.parse({category:'sofa',condition:'used',location:'Turku',localOnly:true,maxPrice:200,sort:'price_asc',...input}),p??await project());assert.equal(calls,entries.length?2:1);return ResearchResultSchema.parse(r);}

test('v2 preserves two genuine cited identities as potential leads without inventing used condition',async t=>{
 const r=await run(t,[entry('Sofa A',120,'unknown'),entry('Sofa B',180,'unknown')]);
 assert.equal(r.summary!.supportedCount,0);assert.equal(r.summary!.potentialCount,2);assert.equal(r.diagnostics!.candidateCount,2);assert.equal(r.diagnostics!.rejectedCount,0);
 for(const o of r.offers){assert.equal(o.condition,'unknown');assert.equal(o.eligibilityStatus,'potential');assert.equal(o.evidenceByField!.condition!.status,'unknown');assert.equal(o.evidenceByField!.price!.status,'source_supported');assert(o.sourceUrl);assert.equal(o.imageUrl,null);assert(o.missingEvidence!.some(m=>m.field==='condition'&&m.required));}
 assert.match(r.summary!.explanation,/2 potential/);assert(r.refinementSuggestions!.some(s=>s.id==='review_details'));
});
test('v2 known new, remote, expensive and unsafe candidates stay rejected; unknowns stay potential',async t=>{
 const entries=[entry('Sofa Supported',180),entry('Sofa Cheapest Lead',20,'unknown'),entry('Sofa Missing Price',null),entry('Sofa Missing Location',100,'used',null),entry('Sofa New',10,'new'),entry('Sofa Remote',10,'used','Helsinki'),entry('Sofa Costly',450),entry('Sofa Unsafe',20,'used','Turku','javascript:alert(1)')];
 const r=await run(t,entries);assert.equal(r.summary!.supportedCount,1);assert.equal(r.summary!.potentialCount,3);assert.equal(r.summary!.rejectedCount,4);assert.equal(r.offers[0]!.title,'Sofa Supported');assert.equal(r.offers.at(-1)!.priceMinor,null);assert(r.rejections!.some(r=>r.reasons.includes('condition')));assert(r.rejections!.some(r=>r.reasons.includes('location')));assert(r.rejections!.some(r=>r.reasons.includes('price')));assert(r.rejections!.some(r=>r.reasons.includes('unsafe_source_url')));
});
test('v2 Finnish explicit käytetty is usable evidence; marketplace name and hyvä are not',async t=>{
 const e=entry('Sohva suora',100,'used');e.text='Sohva suora costs EUR 100. Kunto: käytetty. Location: Turku.';e.candidate.conditionQuote='Kunto: käytetty.';
 const unknown=entry('Sohva siisti',120,'unknown','Turku','https://www.tori.fi/recommerce/forsale/item/fixture-only');unknown.text+=' Kunto: hyvä.';
 const r=await run(t,[e,unknown]);assert.equal(r.offers.find(o=>o.title===e.candidate.title)!.eligibilityStatus,'supported');assert.equal(r.offers.find(o=>o.title===unknown.candidate.title)!.condition,'unknown');assert.equal(r.summary!.potentialCount,1);
});
test('v2 unsupported amounts stay null; generic categories and conflicting duplicate prices are not matches',async t=>{
 const noPrice=entry('Sofa Wrong Amount',180);noPrice.candidate.priceMinor=100;
 const category=entry('Sofa collection',100,'used','Turku','https://shop.fi/category/sofas');
 const a=entry('Sofa Conflict',100),b=entry('Sofa Conflict',150);
 const r=await run(t,[noPrice,category,a,b]);assert.equal(r.offers.length,1);assert.equal(r.offers[0]!.priceMinor,null);assert.equal(r.offers[0]!.eligibilityStatus,'potential');assert(r.rejections!.some(r=>r.reasons.includes('not_specific_listing')));assert(r.rejections!.some(r=>r.reasons.includes('conflicting_duplicate')));
});
test('v2 explicit sold evidence is rejected even when extraction omitted its stock field',async t=>{
 const e=entry('Sofa sold fixture',100);e.text+=' Availability: myyty.';e.candidate.availability='unknown';e.candidate.availabilityQuote=null;
 const r=await run(t,[e]);assert.equal(r.offers.length,0);assert(r.rejections!.some(r=>r.reasons.includes('availability')));
});
test('v2 source strategies are deterministic, bounded, local-language discovery hints only',async()=>{
 const p=await project();const req=ResearchRequestSchema.parse({category:'sofa',condition:'used',location:'Turku, Finland',maxPrice:200,localOnly:true,limit:3});const a=planResearch(req,p),b=planResearch(req,p);
 assert.deepEqual(a,b);assert.equal(a.strategy.id,'used_furniture');assert.equal(a.queries.length,3);assert(a.queries[0]!.includes('site:tori.fi'));assert(a.queries.some(q=>q.includes('sohva')));assert(a.queries.every(q=>q.includes('Turku')&&q.includes('200.00')));assert.equal(a.strategy.access,'hosted_search_only');assert.equal(a.strategy.maximumHostedToolCalls,3);
 for(const [category,kind,id] of [['housing','service','rental'],['vehicle','product','car'],['home_insurance','service','insurance'],['moving','service','moving']] as const){const plan=planResearch(ResearchRequestSchema.parse({category,kind}),p);assert.equal(plan.strategy.id,id);}
});
test('v2 rental monthly prices and official If information never become one-time premiums or purchases',async t=>{
 const e=entry('Rental studio apartment',700,'unknown');e.text='Rental studio apartment costs EUR 700/month. Location: Turku.';e.candidate.identityQuote='Rental studio apartment costs EUR 700/month.';e.candidate.priceQuote=e.candidate.identityQuote;
 const r=await run(t,[e],{category:'housing',kind:'service',maxPrice:750,pricePeriod:'month'});assert.equal(r.summary!.supportedCount,1);assert.equal(r.offers[0]!.priceMinor,null);assert.equal(r.offers[0]!.reportedRate!.amountMinor,70000);
 t.mock.restoreAll();const info=entry('If home insurance information',80,'unknown','Finland','https://www.if.fi/henkiloasiakkaat/vakuutukset/kotivakuutus');
 const i=await run(t,[info],{category:'home_insurance',kind:'service',purpose:'information',location:'Finland',localOnly:false});assert.equal(i.offers[0]!.priceMinor,null);assert.equal(i.offers[0]!.sourceType,'information');assert.equal(i.summary!.supportedCount,1);
});
test('v2 car and dated transport preserve category, period and source-scoped route evidence',async t=>{
 const car=await run(t,[entry('Toyota Corolla 2011',7500,'used','Finland')],{category:'vehicle',location:'Finland',maxPrice:8000},await project('Buy a used Toyota Corolla under EUR 8000 in Finland'));assert.equal(car.summary!.supportedCount,1);
 t.mock.restoreAll();const p=await project('Travel from Helsinki to Tampere with EUR 500');p.preferences.startDate='2027-02-20';p.preferences.origin='Helsinki';p.location='Tampere';
 const e=entry('Train Helsinki Tampere',20,'unknown','Tampere');e.text+=' Origin: Helsinki. Departure: 2027-02-20.';Object.assign(e.candidate,{origin:'Helsinki',originQuote:'Origin: Helsinki.'});
 const travel=await run(t,[e],{category:'transport',kind:'service',condition:'any',location:'Tampere'},p);assert.equal(travel.summary!.supportedCount,1);assert.equal(travel.offers[0]!.evidenceByField!.dates!.status,'source_supported');
});
test('v2 no cited candidates is distinct from useful leads and old project records still parse',async t=>{
 const r=await run(t,[]);assert.equal(r.offers.length,0);assert.equal(r.summary!.potentialCount,0);assert.match(r.summary!.explanation,/No usable/);assert(r.refinementSuggestions!.length);const old=await project();assert(LifeProjectSchema.safeParse(old).success);assert.equal(old.researchFeedback,undefined);
});

test('v2 feedback is free, owned, restart-persistent, affects research and cannot put leads into budgets',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'research-v2-'));t.after(()=>rm(dir,{recursive:true,force:true}));const origin='http://127.0.0.1:5999';
 const config=loadConfig({DATA_DIR:dir,STORAGE_MODE:'local',AI_MODE:'local',RESEARCH_MODE:'live',OPENAI_API_KEY:'fixture-not-networked',OPENAI_MODEL:'fixture',LOG_LEVEL:'silent',ALLOWED_ORIGINS:origin,PUBLIC_ACCESS_ENABLED:'true',PUBLIC_AI_ENABLED:'true',ADMIN_ACCESS_KEY:'fixture-independent-administrator-key',SESSION_COOKIE_SECURE:'false',AI_INPUT_USD_PER_MILLION:'0.1',AI_OUTPUT_USD_PER_MILLION:'0.1',AI_WEB_SEARCH_USD_PER_CALL:'0.01'});
 let calls=0;const entries=[entry('Sofa supported',100),entry('Sofa lead',90,'unknown')];t.mock.method(Responses.prototype,'create',async()=>calls++%2===0?search(entries):extraction(entries));
 let app=await buildApp({config});t.after(()=>app.close());
 const visitor=async()=>{const r=await app.inject({method:'POST',url:'/api/session',headers:{origin},payload:{}});assert.equal(r.statusCode,200);return{cookie:String(r.headers['set-cookie']).split(';')[0]!,csrf:r.json().csrfToken};};
 const a=await visitor(),b=await visitor();
 const req=(v:typeof a,url:string,method:'GET'|'POST'|'PATCH'='GET',payload?:unknown)=>app.inject({method,url,headers:{origin,cookie:v.cookie,'x-csrf-token':v.csrf,'idempotency-key':randomUUID()},...(method==='GET'?{}:{payload:payload??{}})});
 const made=await req(a,'/api/projects','POST',{message:'Moving to Turku with EUR 2000'});assert.equal(made.statusCode,201);const id=made.json().project.id,base='/api/projects/'+id;
 const research=await req(a,base+'/research','POST',{category:'sofa',condition:'used',location:'Turku',localOnly:true,maxPrice:200});assert.equal(research.statusCode,200,research.body);const result=research.json(),supported=result.offers.find((o:any)=>o.eligibilityStatus==='supported'),lead=result.offers.find((o:any)=>o.eligibilityStatus==='potential');assert(supported&&lead);
 assert.equal((await req(a,base+'/cart/items','POST',{offerId:lead.id})).statusCode,422);assert.equal((await req(a,base+'/cart/items','POST',{offerId:supported.id})).statusCode,201);
 for(const [suffix,method,body] of [['','GET'],['/assistant','POST',{message:'Find cheaper options'}],['/research','POST',{category:'sofa'}],['/home-insurance','GET'],[`/research/${result.id}/feedback`,'POST',{offerId:lead.id,type:'useful'}]] as const)assert.equal((await req(b,base+suffix,method,body)).statusCode,404);
 const before=(await req(a,'/api/session')).json().usage.used;
 const feedback=await req(a,base+`/research/${result.id}/feedback`,'POST',{offerId:supported.id,type:'not_relevant'});assert.equal(feedback.statusCode,200,feedback.body);assert.equal(feedback.json().project.cart.length,1);assert.equal(feedback.json().project.budget.committedMinor,10000);assert.equal((await req(a,'/api/session')).json().usage.used,before);
 const invalid=await app.inject({method:'POST',url:base+`/research/${result.id}/feedback`,headers:{origin,cookie:a.cookie},payload:{offerId:lead.id,type:'useful'}});assert.equal(invalid.statusCode,403);
 await app.close();app=await buildApp({config});let saved=(await req(a,base)).json().project;assert.equal(saved.researchFeedback.length,1);assert.equal(saved.cart.length,1);assert(saved.scenarios.every((s:any)=>!s.selectedOfferIds.includes(lead.id)));
 const again=await req(a,base+'/research','POST',{category:'sofa',condition:'used',location:'Turku',localOnly:true,maxPrice:200});assert.equal(again.statusCode,200,again.body);assert(!again.json().offers.some((o:any)=>o.title==='Sofa supported'));assert(again.json().rejections.some((r:any)=>r.reasons.includes('workspace_feedback')));
 const clear=await req(a,base+`/research/${result.id}/feedback`,'POST',{offerId:supported.id,type:null});assert.equal(clear.statusCode,200);assert.equal(clear.json().project.researchFeedback.length,0);assert.equal((await req(a,'/api/session')).json().usage.used,4);
 const exhausted=await req(a,base+'/research','POST',{category:'sofa'});assert.equal(exhausted.statusCode,429);assert.equal(exhausted.json().error.code,'AI_QUOTA_EXCEEDED');const used=calls;
 assert.equal((await req(a,base+'/research','POST',{category:'sofa'})).statusCode,429);assert.equal(calls,used);saved=(await req(a,base)).json().project;assert.equal(saved.researchResults.length,2);assert.equal(saved.budget.totalMinor,200000);
});
