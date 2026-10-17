import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LocalProjectRepository } from '../src/repository.js';
import { createCarInsuranceProvider } from '../src/car-insurance.js';
import { containsFinnishIdentityNumber } from '../src/if-insurance.js';
import { CarQuoteRequestSchema } from '../../shared/contracts/index.js';
const config=()=>loadConfig({AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'memory',LOG_LEVEL:'silent'});
const draft={registrationNumber:'DEMO-001',driverBelow24:false,annualMileage:'15000' as const,carPriceMinor:800000};
const message="I'm planning to buy a 2018 BMW 320d for €8,000. My monthly budget is €1,500.";
async function create(app:Awaited<ReturnType<typeof buildApp>>,text=message){const r=await app.inject({method:'POST',url:'/api/projects',payload:{message:text}});assert.equal(r.statusCode,201,r.body);return r.json().project;}

test('life event registry detects home/car/travel once without asserting absence of cover',async t=>{
 const app=await buildApp({config:config()});t.after(()=>app.close());
 for(const [text,kind]of [['Moving to Turku with €2000','home'],[message,'car'],['Travel to Rome with €900','travel']]){const p=await create(app,text);assert.equal(p.protection.recommendations.length,1);assert.equal(p.protection.recommendations[0].insuranceType,kind);assert.equal(p.protection.recommendations[0].status,'suggested');assert.ok(!/you have no insurance/i.test(p.protection.recommendations[0].explanation));const reloaded=(await app.inject(`/api/projects/${p.id}`)).json().project;assert.equal(reloaded.protection.recommendations.length,1);}
});
test('explicit car purchase amount and monthly budget stay separate and vehicle data is reused',async t=>{
 const app=await buildApp({config:config()});t.after(()=>app.close());const p=await create(app);assert.equal(p.budget.totalMinor,800000);assert.equal(p.preferences.monthlyBudgetMinor,150000);assert.deepEqual(p.preferences.vehicle,{year:2018,make:'BMW',model:'320d',purchasePriceMinor:800000});assert.equal(p.protection.car.draft.carPriceMinor,800000);
});
test('monthly budget answers in chat never overwrite the one-time vehicle budget',async t=>{
 const app=await buildApp({config:config()});t.after(()=>app.close());const p=await create(app);const r=await app.inject({method:'POST',url:`/api/projects/${p.id}/assistant`,payload:{message:'My monthly budget is €2,000. Can I afford insurance?'}});assert.equal(r.statusCode,200,r.body);const saved=(await app.inject(`/api/projects/${p.id}`)).json().project;assert.equal(saved.budget.totalMinor,800000);assert.equal(saved.preferences.monthlyBudgetMinor,200000);
});
test('dismissal persists until material vehicle changes, not unrelated budget changes',async t=>{
 const app=await buildApp({config:config()});t.after(()=>app.close());const p=await create(app);const url=`/api/projects/${p.id}`;
 await app.inject({method:'PATCH',url:`${url}/protection`,payload:{product:'car',status:'dismissed'}});
 await app.inject({method:'PATCH',url,payload:{title:'Another title'}});assert.equal((await app.inject(url)).json().project.protection.recommendations[0].status,'dismissed');
 await app.inject({method:'PATCH',url,payload:{preferences:{vehicle:{...p.preferences.vehicle,model:'330d'}}}});assert.equal((await app.inject(url)).json().project.protection.recommendations[0].status,'suggested');
});
test('self-reported insurance and review do not imply purchase or active coverage',async t=>{
 const app=await buildApp({config:config()});t.after(()=>app.close());const p=await create(app);for(const status of ['already_insured_self_reported','reviewed']){const r=await app.inject({method:'PATCH',url:`/api/projects/${p.id}/protection`,payload:{product:'car',status}});assert.equal(r.json().project.protection.recommendations[0].status,status);assert.equal(r.json().project.protection.car.budgetLink,null);}
});
test('demo quote shares canonical state and never requires or stores a customer identity',async t=>{
 const app=await buildApp({config:config()});t.after(()=>app.close());const p=await create(app);const url=`/api/projects/${p.id}`;
 const missing=await app.inject({method:'POST',url:`${url}/protection/car/quote`,payload:{mode:'demo',draft:{registrationNumber:'DEMO-001'}}});assert.equal(missing.statusCode,400);
 const r=await app.inject({method:'POST',url:`${url}/protection/car/quote`,payload:{mode:'demo',draft}});assert.equal(r.statusCode,200,r.body);const saved=r.json().project;const q=saved.protection.car.quotes[0];assert.equal(q.sourceMode,'demo');assert.equal(q.provider,'Demo');assert.equal(q.sourceUrl,null);assert.match(q.warnings[0],/not an official If/);assert.equal(saved.budget.proposedMinor,0);assert.equal(saved.protection.recommendations[0].status,'quote_available');assert.equal(q.validUntil,null);
});
test('quote links are idempotent, recurring, distinguish fictional costs and require explicit replacement',async t=>{
 const app=await buildApp({config:config()});t.after(()=>app.close());const p=await create(app);const url=`/api/projects/${p.id}`;
 let saved=(await app.inject({method:'POST',url:`${url}/protection/car/quote`,payload:{mode:'demo',draft}})).json().project;const q=saved.protection.car.quotes[0];
 const expense={quoteId:q.id,optionId:'demo-basic',priceIndex:0,planningMonths:12};let r=await app.inject({method:'POST',url:`${url}/protection/car/expense`,payload:expense});assert.equal(r.statusCode,200,r.body);saved=r.json().project;assert.equal(saved.budget.proposedMinor,54000);assert.equal(saved.budget.committedMinor,0);assert.equal(saved.protection.car.budgetLink.monthlyEquivalentMinor,4500);assert.equal(saved.protection.car.budgetLink.sourceMode,'demo');assert.ok(saved.scenarios.every((s:{tradeOffs:string[]})=>s.tradeOffs.some(t=>t.includes('Fictional demo'))));
 assert.equal((await app.inject({method:'POST',url:`${url}/protection/car/expense`,payload:expense})).statusCode,409);
 assert.equal((await app.inject({method:'POST',url:`${url}/protection/car/expense`,payload:{...expense,optionId:'demo-plus'}})).json().error.code,'REPLACE_CONFIRMATION_REQUIRED');
 r=await app.inject({method:'POST',url:`${url}/protection/car/expense`,payload:{...expense,optionId:'demo-plus',replaceExisting:true}});assert.equal(r.statusCode,200);assert.equal(r.json().project.budget.proposedMinor,90000);assert.equal(r.json().project.protection.car.budgetLink.id,saved.protection.car.budgetLink.id);
 assert.equal((await app.inject({method:'DELETE',url:`${url}/protection/car/expense`})).json().project.budget.proposedMinor,0);
});
test('vehicle and rating input edits invalidate prices, retain old proposals, and do not automatically reprice',async t=>{
 const app=await buildApp({config:config()});t.after(()=>app.close());const p=await create(app);const url=`/api/projects/${p.id}`;
 let saved=(await app.inject({method:'POST',url:`${url}/protection/car/quote`,payload:{mode:'demo',draft}})).json().project;const q=saved.protection.car.quotes[0];await app.inject({method:'POST',url:`${url}/protection/car/expense`,payload:{quoteId:q.id,optionId:'demo-basic',priceIndex:0,planningMonths:1}});
 saved=(await app.inject({method:'PATCH',url:`${url}/protection/car/draft`,payload:{registrationNumber:'NEW-002'}})).json().project;assert.equal(saved.protection.car.quotes.length,1);assert.equal(saved.protection.car.quotes[0].status,'stale');assert.equal(saved.protection.car.budgetLink.needsReview,true);assert.equal(saved.budget.proposedMinor,4500);assert.equal(saved.protection.car.draft.driverBelow24,false);
 const blocked=await app.inject({method:'POST',url:`${url}/protection/car/expense`,payload:{quoteId:q.id,optionId:'demo-basic',priceIndex:0,planningMonths:12,replaceExisting:true}});assert.equal(blocked.json().error.code,'QUOTE_STALE');
});
test('assistant reopens the same recommendation through existing validated actions, with no autonomous pricing',async t=>{
 const app=await buildApp({config:config()});t.after(()=>app.close());const p=await create(app);const url=`/api/projects/${p.id}`;
 await app.inject({method:'PATCH',url:`${url}/protection`,payload:{product:'car',status:'dismissed'}});
 let r=await app.inject({method:'POST',url:`${url}/assistant`,payload:{message:'How much would insurance cost for this car?'}});assert.equal(r.statusCode,200,r.body);assert.match(r.json().reply,/No car price is saved/);const action=r.json().proposedActions[0];assert.equal(action.command.type,'protection_action');assert.equal(action.requiresConfirmation,true);
 r=await app.inject({method:'POST',url:`${url}/actions/${action.id}/confirm`,payload:{approved:true}});assert.equal(r.statusCode,200);assert.equal(r.json().project.protection.recommendations[0].status,'in_progress');assert.equal(r.json().project.protection.car.quotes.length,0);
 await app.inject({method:'POST',url:`${url}/protection/car/quote`,payload:{mode:'demo',draft}});r=await app.inject({method:'POST',url:`${url}/assistant`,payload:{message:'Show my saved insurance quote'}});assert.match(r.json().reply,/Demo quote — not an official If/);assert.match(r.json().reply,/45.00/);
});
test('provider errors preserve entered answers and never silently fall back to demo',async t=>{
 const app=await buildApp({config:config()});t.after(()=>app.close());const p=await create(app);const url=`/api/projects/${p.id}`;
 const failure=await app.inject({method:'POST',url:`${url}/protection/car/quote`,payload:{mode:'demo',draft,demoOutcome:'error'}});assert.equal(failure.statusCode,503);let saved=(await app.inject(url)).json().project;assert.equal(saved.protection.car.draft.annualMileage,'15000');assert.equal(saved.protection.car.quotes.length,0);
 const identity=[String(0).repeat(6),'-',String(0).repeat(4)].join('');const live=await app.inject({method:'POST',url:`${url}/protection/car/quote`,payload:{mode:'live',draft,personalIdentityNumber:identity,consent:true}});assert.equal(live.statusCode,503);assert.equal(live.json().error.code,'IF_ACCESS_UNAVAILABLE');saved=(await app.inject(url)).json().project;assert.equal(saved.protection.car.quotes.length,0);assert.ok(!JSON.stringify(saved).includes(identity));assert.equal(CarQuoteRequestSchema.safeParse({mode:'demo',draft,personalIdentityNumber:identity}).success,false);
});
test('the existing deployment token and scenario boundary protect new routes',async t=>{
 const app=await buildApp({config:loadConfig({AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'memory',LOG_LEVEL:'silent',API_TOKEN:'a'.repeat(24)})});t.after(()=>app.close());assert.equal((await app.inject('/api/protection/capabilities')).statusCode,401);
 const second=await buildApp({config:config()});t.after(()=>second.close());const p=await create(second,'Travel to Rome with €900');assert.equal((await second.inject({method:'POST',url:`/api/projects/${p.id}/protection/car/quote`,payload:{mode:'demo',draft}})).statusCode,422);
 assert.equal(containsFinnishIdentityNumber('12010101-1234-4000-8000-000000000001'),false,'UUIDs must not be mistaken for identity numbers');
});
test('live Finnish adapter uses its own verified scope, endpoint, exact fields and returned options',async()=>{
 const calls:{url:string;body:unknown}[]=[];const identity='transient-test-value';const price={amountNet:100,period:'Yearly',currency:'EUR'};
 const provider=createCarInsuranceProvider({clientId:'test',clientSecret:'test',environment:'live',timeoutMs:100},async(url,init)=>{calls.push({url:String(url),body:init?.body});if(String(url).includes('oauth-token'))return Response.json({access_token:'test-access',expires_in:300});return Response.json({priceCarInsuranceFI:{response:{returnCode:'000',insuranceBrand:'If',mtplNameFi:'Test MTPL',mtplPrice:{priceWithoutCasco:[price],priceWithCasco:[{...price,amountNet:80}]},cascoCoverages:[{coverageId:'T',name:'Returned test casco',deductibleUsedInCalculation:200,prices:[{...price,amountNet:300}],addOnCoverages:[]}],termsAndDetailedInformation:[{name:'Test terms',link:'https://www.if.fi/test-terms'}]}}});});
 const result=await provider.prices(draft,identity);assert.equal(result.sourceMode,'live');assert.equal(result.options[0]!.prices[0]!.amountMinor,10000);assert.equal(result.options[1]!.prices[0]!.amountMinor,38000);assert.equal(result.options[1]!.deductibleMinor,20000);assert.equal(result.terms?.[0]?.url,'https://www.if.fi/test-terms');assert.ok(String(calls[0]!.body).includes('scope=car.price'));assert.equal(calls[1]!.url,'https://api.if-insurance.com/request-price-car-insurance-fi/v1/prices/');assert.equal(JSON.parse(String(calls[1]!.body)).priceCarInsuranceFI.request.carPrice,8000);
});
test('If 206 and HTTP-200 business failures are sanitized instead of fabricated prices',async()=>{
 for(const kind of ['address','business']){const provider=createCarInsuranceProvider({clientId:'test',clientSecret:'test',environment:'sandbox',timeoutMs:100},async(url)=>String(url).includes('oauth-token')?Response.json({access_token:'test'}):Response.json(kind==='address'?{}:{priceCarInsuranceFI:{response:{returnCode:'002',returnTxt:'Never relay customer identity or raw errors'}}},{status:kind==='address'?206:200}));await assert.rejects(()=>provider.prices(draft,'transient-test'),e=>e instanceof Error&&!e.message.includes('Never relay'));}
});
test('actual TCP quote → budget → persisted reload workflow works without partner credentials',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'protection-'));t.after(()=>rm(dir,{recursive:true,force:true}));const app=await buildApp({config:config(),repository:new LocalProjectRepository(dir)});t.after(()=>app.close());const host=await app.listen({port:0,host:'127.0.0.1'});
 const post=async(url:string,body:unknown)=>{const r=await fetch(host+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json();};
 const p=(await post('/api/projects',{message})).project;const base=`/api/projects/${p.id}`;const q=(await post(`${base}/protection/car/quote`,{mode:'demo',draft})).project.protection.car.quotes[0];await post(`${base}/protection/car/expense`,{quoteId:q.id,optionId:'demo-basic',priceIndex:1,planningMonths:1});const saved=await new LocalProjectRepository(dir).get(p.id);assert.equal(saved.protection!.car.budgetLink!.plannedMinor,54000);assert.equal(saved.protection!.car.budgetLink!.monthlyEquivalentMinor,4500);assert.equal(saved.budget.proposedMinor,54000);assert.equal(saved.homeInsurance,undefined);
});
