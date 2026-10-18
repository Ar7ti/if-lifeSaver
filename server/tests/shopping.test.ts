import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPlanner } from '../src/ai.js';
import { allocateBudgetForPlan,simulateScenarios,scenarioFingerprint } from '../src/finance.js';
import { CartItemSchema,OfferSchema,ProductImageUrlSchema,itemVisual,type Offer,type LifeProject,type ResearchResult } from '../../shared/contracts/index.js';
import type { SearchProvider } from '../src/research.js';
const now='2026-10-18T10:00:00.000Z';
function offers(category='sofa',demo=false):Offer[]{return [12000,18000,30000].map((price,i)=>OfferSchema.parse({
 id:randomUUID(),category,kind:'product',title:`Test ${category} ${i+1}`,description:'Explicitly fictional test fixture',priceMinor:price,currency:'EUR',
 priceStatus:demo?'demo':'estimated',priceOrigin:demo?'demo':'source_reported',sourceUrl:demo?null:`https://shop.example.org/${category}/${i}`,sourceName:'Test fixture source',
 seller:{name:`Test merchant ${i+1}`,type:'company',publicProfileUrl:null,verified:false},imageUrl:i===1?'https://images.example.org/test-product.png':null,imageSource:'provider',imageType:'listing',location:'Turku',
 delivery:{available:i>0,costMinor:i===0?0:i===1?2000:3000,details:'Fictional test fulfillment'},fulfillment:{assembly:i===2?'included':i===1?'required':'unknown',evidence:['Test fixture assembly terms']},
 condition:i===0?'used':'new',availability:demo?'demo':'in_stock',lastCheckedAt:now,verificationStatus:demo?'demo':'source_checked',recommendation:'Test fixture',score:[45,80,75][i],evidence:['Test only; not a verified listing'],
}));}
function search(mode:'live'|'demo'='live'):SearchProvider{return {mode,async search(req){return {id:randomUUID(),category:req.category,status:'completed',mode,offers:offers(req.category,mode==='demo'),warnings:['Fictional test results, not real listings'],searchedAt:now,query:'Test fixture'};}};}
async function fixture(){
 const app=await buildApp({config:loadConfig({AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'memory',LOG_LEVEL:'silent'}),search:search()});
 const r=await app.inject({method:'POST',url:'/api/projects',payload:{message:'I am moving to Turku with EUR 2000 and need a sofa, bed and desk.'}});assert.equal(r.statusCode,201,r.body);return {app,project:r.json().project as LifeProject};
}
function research(value:Offer[],mode:'live'|'demo'='live'):ResearchResult{return {id:randomUUID(),category:'sofa',status:'completed',mode,offers:value,warnings:[],searchedAt:now,query:'Test fixture'};}
function sofaOnly(p:LifeProject):LifeProject{return {...p,budget:allocateBudgetForPlan(100000,[{id:'sofa',title:'Sofa',weight:1}],0,true),researchResults:[research(offers())],cart:[],preferences:{...p.preferences,deliveryRequired:null,allowUsed:true,requiredItems:[]}};}

test('visual categories use structured fields, images reject unsafe URLs and old records remain valid',async()=>{
 assert.equal(itemVisual('desk','Sofa hidden in a description').category,'desk');assert.equal(itemVisual('car_purchase').emoji,'🚗');assert.equal(itemVisual('beds').category,'bed');assert.equal(itemVisual('furniture','A new sofa').category,'sofa');assert.equal(itemVisual('unclassified','Bedtime stories').category,'unknown');
 for(const url of ['javascript:alert(1)','data:image/png;base64,xxx','http://shop.fi/a.png','https://127.0.0.1/a.png','https://host.local/a.png','https://host.fi/a.svg','https://user:pass@host.fi/a.jpg','https://host.fi:8443/a.jpg'])assert.equal(ProductImageUrlSchema.safeParse(url).success,false,url);
 assert(ProductImageUrlSchema.safeParse('https://cdn.shop.fi/images/a.jpg?width=320').success);
 assert.equal(OfferSchema.parse({...offers()[0]!,imageUrl:'https://shop.example.org/legacy.svg'}).imageUrl,null,'An older unsafe image falls back without making the project unreadable');
 const {app,project}=await fixture();await app.close();const o=offers()[0]!;assert(OfferSchema.safeParse({...o,imageUrl:null,imageType:undefined,imageSource:undefined,fulfillment:undefined,priceOrigin:undefined}).success);
 const old={id:randomUUID(),offerId:null,title:'Old desk',category:'desk',quantity:1,unitPriceMinor:10000,deliveryCostMinor:null,currency:'EUR',status:'selected',sourceUrl:null,priceStatus:'estimated',addedAt:now};assert(CartItemSchema.safeParse(old).success);assert.equal(project.cart.length,0);
});
test('real strategies differ, explain evidence, respect constraints and are deterministic',async()=>{
 const {app,project}=await fixture();await app.close();const p=sofaOnly(project),[economy,balanced,comfort]=simulateScenarios(p);
 assert.deepEqual([economy!.estimatedTotalMinor,balanced!.estimatedTotalMinor,comfort!.estimatedTotalMinor],[12000,20000,33000]);
 assert.equal(economy!.effort,'high');assert.equal(balanced!.effort,'medium');assert.equal(comfort!.effort,'low');assert.equal(comfort!.changes!.length,1);
 const same=simulateScenarios(p);assert.deepEqual(same.map(s=>[s.selectedOfferIds,s.estimatedTotalMinor,s.changes,s.fingerprint]),[economy,balanced,comfort].map(s=>[s!.selectedOfferIds,s!.estimatedTotalMinor,s!.changes,s!.fingerprint]));
 p.preferences.deliveryRequired=true;p.preferences.allowUsed=false;assert(simulateScenarios(p).every(s=>!s.selectedOfferIds.includes(p.researchResults[0]!.offers[0]!.id)));
 p.budget=allocateBudgetForPlan(15000,[{id:'sofa',title:'Sofa',weight:1}],0,true);assert(simulateScenarios(p).every(s=>!s.withinBudget));
});
test('fixed choices remain included, proposals are substituted once, unknown facts stay unknown',async()=>{
 const {app,project}=await fixture();await app.close();const p=sofaOnly(project),current=p.researchResults[0]!.offers[2]!;
 const item=CartItemSchema.parse({id:randomUUID(),offerId:current.id,title:current.title,category:'sofa',quantity:2,unitPriceMinor:30000,deliveryCostMinor:3000,currency:'EUR',status:'proposed',sourceUrl:current.sourceUrl,priceStatus:'estimated',addedAt:now});p.cart=[item];
 const e=simulateScenarios(p)[0]!;assert.equal(e.estimatedTotalMinor,24000);assert.equal(e.changes![0]!.previousMinor,63000);assert.equal(e.changes![0]!.quantity,2);
 item.status='selected';for(const s of simulateScenarios(p)){assert.equal(s.estimatedTotalMinor,63000);assert.deepEqual(s.lockedCartItemIds,[item.id]);assert.equal(s.changes!.length,0);assert.match(s.explanation!,/same suitable choices/);}
 p.cart=[];const only=p.researchResults[0]!.offers[0]!;only.delivery={available:null,costMinor:null,details:''};only.fulfillment=undefined;p.researchResults[0]!.offers=[only];
 assert(simulateScenarios(p).every(s=>s.convenience==='unknown'&&s.effort==='unknown'));assert(simulateScenarios(p).every(s=>/same suitable choices/.test(s.explanation!)));
 assert(!CartItemSchema.safeParse({...item,currency:'USD'}).success);
});
test('unknown assembly earns no convenience bonus and fingerprints survive object key reordering',async()=>{
 const {app,project}=await fixture();await app.close();const p=sofaOnly(project);
 const required=p.researchResults[0]!.offers[1]!;
 const unknown={...required,id:randomUUID(),priceMinor:25000,fulfillment:undefined};
 p.researchResults[0]!.offers=[unknown,required];
 const comfort=simulateScenarios(p)[2]!;assert.deepEqual(comfort.selectedOfferIds,[required.id]);
 const reordered=JSON.parse(JSON.stringify(p,(_key,value:unknown)=>value!==null&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).reverse()):value)) as LifeProject;
 assert.equal(scenarioFingerprint(p),scenarioFingerprint(reordered));
});
test('demo candidates require explicit provider mode and remain prominently fictional',async()=>{
 const {app,project}=await fixture();await app.close();const p=sofaOnly(project);p.researchResults=[research(offers('sofa',true),'demo')];
 assert(simulateScenarios(p).every(s=>s.selectedOfferIds.length===0));const demo=simulateScenarios(p,{includeDemo:true});assert.equal(new Set(demo.map(s=>s.estimatedTotalMinor)).size,3);assert(demo.every(s=>s.sourceMode==='demo'&&s.verifiedCostMinor===0&&s.missingData.some(v=>v.startsWith('DEMO:'))));
});
test('HTTP replacements protect chosen items, preserve ID and quantity, undo and survive restart',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'shopping-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));const config=loadConfig({AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'local',DATA_DIR:dir,LOG_LEVEL:'silent'});
 const app=await buildApp({config,search:search()});t.after(()=>app.close());let r=await app.inject({method:'POST',url:'/api/projects',payload:{message:'Move to Turku with EUR 2000'}});const id=r.json().project.id,base=`/api/projects/${id}`;
 const found=(await app.inject({method:'POST',url:base+'/research',payload:{category:'sofa'}})).json();const old=found.offers[2],next=found.offers[1];
 let cart=(await app.inject({method:'POST',url:base+'/cart/items',payload:{offerId:old.id,quantity:2,status:'selected'}})).json();const itemId=cart.items[0].id;
 const payload={offerId:next.id,approved:true,expectedRevision:cart.revision};
 assert.equal((await app.inject({method:'POST',url:base+`/cart/items/${itemId}/replace`,payload})).statusCode,409);
 r=await app.inject({method:'POST',url:base+`/cart/items/${itemId}/replace`,payload:{...payload,allowSelected:true}});assert.equal(r.statusCode,200,r.body);const p=r.json().project;
 assert.equal(p.cart.length,1);assert.equal(p.cart[0].id,itemId);assert.equal(p.cart[0].quantity,2);assert.equal(p.cart[0].imageUrl,next.imageUrl);assert.equal(p.cart[0].priceOrigin,'source_reported');assert.equal(p.budget.committedMinor,38000);
 assert.equal((await app.inject({method:'POST',url:base+`/cart/items/${itemId}/replace`,payload:{...payload,allowSelected:true}})).statusCode,409);
 await app.close();const restarted=await buildApp({config,search:search()});t.after(()=>restarted.close());const loaded=(await restarted.inject(base)).json().project;assert.equal(loaded.cart[0].offerId,next.id);
 r=await restarted.inject({method:'POST',url:base+`/cart/items/${itemId}/undo-replacement`,payload:{approved:true,allowSelected:true,expectedRevision:loaded.revision}});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().project.cart[0].offerId,old.id);assert.equal(r.json().project.budget.committedMinor,63000);
});
test('scenario application is atomic, idempotent, persisted and invalidates on real input changes',async t=>{
 const {app,project}=await fixture();t.after(()=>app.close());const base=`/api/projects/${project.id}`;
 await app.inject({method:'PATCH',url:base,payload:{preferences:{allowUsed:true,deliveryRequired:null},budget:{categories:[{id:'sofa',title:'Sofa',allocatedMinor:180000}],emergencyReserveMinor:20000}}});
 await app.inject({method:'POST',url:base+'/research',payload:{category:'sofa'}});
 let p=(await app.inject(base)).json().project;const s=p.scenarios[0];
 let r=await app.inject({method:'POST',url:base+'/scenarios/economy/apply',payload:{approved:true,expectedRevision:p.revision,expectedFingerprint:s.fingerprint}});assert.equal(r.statusCode,200,r.body);p=r.json().project;assert.equal(p.cart.length,1);assert.equal(p.cart[0].status,'proposed');assert.equal(p.scenarioSelection.id,'economy');assert.equal(p.budget.proposedMinor,12000);
 r=await app.inject({method:'POST',url:base+'/scenarios/economy/apply',payload:{approved:true,expectedRevision:p.revision,expectedFingerprint:p.scenarios[0].fingerprint}});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().project.cart.length,1);
 p=r.json().project;r=await app.inject({method:'POST',url:base+'/scenarios/comfort/apply',payload:{approved:true,expectedRevision:p.revision,expectedFingerprint:p.scenarios[2].fingerprint}});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().project.cart.length,1);assert.equal(r.json().project.budget.proposedMinor,33000);
 p=r.json().project;const oldFingerprint=scenarioFingerprint(p);r=await app.inject({method:'PATCH',url:base,payload:{tasks:p.tasks.slice(0,1).map((v:{id:string})=>({id:v.id,status:'done'}))}});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().project.scenarioSelection.needsReview,false,'task completion does not invalidate shopping');
 r=await app.inject({method:'PATCH',url:base,payload:{budget:{totalMinor:210000}}});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().project.scenarioSelection.needsReview,true);
 assert.equal((await app.inject({method:'POST',url:base+'/scenarios/economy/apply',payload:{approved:true,expectedRevision:r.json().project.revision,expectedFingerprint:oldFingerprint}})).statusCode,409);
});
test('public isolation, CSRF and paid research quotas cover the new shopping operations',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'shopping-security-'));t.after(()=>rm(dir,{recursive:true,force:true}));const origin='http://127.0.0.1:5999';
 const app=await buildApp({config:loadConfig({DATA_DIR:dir,STORAGE_MODE:'local',AI_MODE:'openai',OPENAI_API_KEY:'fixture-not-used',RESEARCH_MODE:'live',LOG_LEVEL:'silent',PUBLIC_ACCESS_ENABLED:'true',PUBLIC_AI_ENABLED:'true',PUBLIC_AI_REQUESTS_PER_DAY:'2',ADMIN_ACCESS_KEY:'fixture-admin-strong-key-over-32-characters',SESSION_COOKIE_SECURE:'false',ALLOWED_ORIGINS:origin,AI_INPUT_USD_PER_MILLION:'0.1',AI_OUTPUT_USD_PER_MILLION:'0.1',AI_WEB_SEARCH_USD_PER_CALL:'0.01'}),planner:createPlanner({mode:'local',model:'fixture',timeoutMs:1000}),search:search()});t.after(()=>app.close());
 async function visitor(){const r=await app.inject({method:'POST',url:'/api/session',headers:{origin},payload:{}});return {origin,cookie:String(r.headers['set-cookie']).split(';')[0]!,'x-csrf-token':r.json().csrfToken,'idempotency-key':randomUUID()};}
 const a=await visitor(),b=await visitor();const created=await app.inject({method:'POST',url:'/api/projects',headers:a,payload:{message:'Move to Turku with EUR 2000'}});assert.equal(created.statusCode,201,created.body);const base='/api/projects/'+created.json().project.id;
 const found=await app.inject({method:'POST',url:base+'/research',headers:{...a,'idempotency-key':randomUUID()},payload:{category:'sofa'}});assert.equal(found.statusCode,200,found.body);
 const denied=await app.inject({method:'POST',url:base+'/research',headers:{...a,'idempotency-key':randomUUID()},payload:{category:'beds'}});assert.equal(denied.statusCode,429,denied.body);
 for(const suffix of ['/scenarios/economy/apply',`/cart/items/${randomUUID()}/replace`,`/cart/items/${randomUUID()}/undo-replacement`]){
  assert.equal((await app.inject({method:'POST',url:base+suffix,headers:b,payload:{}})).statusCode,404);
  assert.equal((await app.inject({method:'POST',url:base+suffix,headers:{origin,cookie:a.cookie},payload:{}})).statusCode,403);
 }
 const p=(await app.inject({url:base,headers:a})).json().project;assert.equal(p.cart.length,0);assert.equal((await app.inject({url:'/api/session',headers:a})).json().usage.used,2);
});

test('insurance remains normalized to its saved horizon and is counted once alongside fixed spending',async()=>{
 const {app,project}=await fixture();await app.close();const p=sofaOnly(project);
 p.homeInsurance={details:{},quote:null,expense:{quoteId:randomUUID(),status:'proposed',premiumMinor:12000,billingPeriod:'annual',periodMonths:12,planningMonths:18,installments:2,plannedMinor:24000,annualEquivalentMinor:12000,createdAt:now}};
 p.cart=[CartItemSchema.parse({id:randomUUID(),offerId:null,title:'Fixed inspection',category:'inspection',quantity:1,unitPriceMinor:5000,deliveryCostMinor:0,currency:'EUR',status:'selected',sourceUrl:null,priceStatus:'estimated',priceOrigin:'user',addedAt:now})];
 const scenario=simulateScenarios(p)[0]!;assert.equal(scenario.estimatedTotalMinor,12000+24000+5000);assert.equal(scenario.remainingMinor,100000-41000);assert.equal(scenario.changes!.length,1);assert(scenario.tradeOffs.some(v=>v.includes('18 month')));
});

test('changing provider mode invalidates a saved demo preview before any plan application',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'shopping-mode-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const config=loadConfig({AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'local',DATA_DIR:dir,LOG_LEVEL:'silent'});
 const app=await buildApp({config,search:search('demo')});t.after(()=>app.close());
 const r=await app.inject({method:'POST',url:'/api/projects',payload:{message:'Move to Turku with EUR 2000 and need a sofa'}});const id=r.json().project.id,base='/api/projects/'+id;
 await app.inject({method:'POST',url:base+'/research',payload:{category:'sofa'}});
 const p=(await app.inject(base)).json().project;assert(p.scenarios.some((s:{sourceMode:string})=>s.sourceMode==='demo'));
 await app.close();const restart=await buildApp({config,search:search('live')});t.after(()=>restart.close());
 const loaded=(await restart.inject(base)).json().project;assert(loaded.scenarios.every((s:{selectedOfferIds:string[]})=>s.selectedOfferIds.length===0));assert.notEqual(loaded.scenarios[0].fingerprint,p.scenarios[0].fingerprint);
 const apply=await restart.inject({method:'POST',url:base+'/scenarios/economy/apply',payload:{approved:true,expectedRevision:p.revision,expectedFingerprint:p.scenarios[0].fingerprint}});assert.equal(apply.statusCode,409,apply.body);assert.equal((await restart.inject(base)).json().project.cart.length,0);
});
