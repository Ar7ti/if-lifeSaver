import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,readdir,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LocalProjectRepository } from '../src/repository.js';
import { createIfInsuranceProvider,insuranceExpense,containsFinnishIdentityNumber } from '../src/if-insurance.js';
import { HomeInsuranceResponseSchema,LifeProjectSchema,IfQuoteRequestSchema,HomeInsuranceDraftSchema,type HomeInsuranceDetails } from '../../shared/contracts/index.js';

// All insurer responses and credentials in this file are synthetic test fixtures.
const pin='010106A9377'; // Official documentation's example; never sent to If.
const details:HomeInsuranceDetails={streetAddress:'Test street 1 A 2',city:'Turku',postalCode:'20100',policyHolderPostalCode:'00100',livingSpace:45,householderType:'Apartment',startDate:'2098-01-01'};
const price=(type='Monthly')=>({amountNet:12.50,amountGross:15,amountDiscount:2.50,discountPercentage:16.67,currency:'EUR',type});
const rawQuote=(type='Monthly')=>({id:'upstream-opaque-id',quoteValidTo:'2099-01-01',activationDateFrom:'2098-01-01',price:[price(type)],insuranceCoverages:[{insuranceBrand:'If',coverageName:'Test coverage',isSelected:true,isDefaultSuggestion:true,coverageItemsIncluded:['TestItem'],price:[price(type)]}],termsAndDetailedInformations:[{name:'Test terms',link:'https://www.if.fi/test-terms'}],links:[{href:'https://evil.example/never-fetch-this',type:'GET',rel:'coverage items'}]});
const config=()=>loadConfig({AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'memory',LOG_LEVEL:'silent'});
test('identity detection accepts a standalone identity but not a UUID fragment',()=>{
 assert.equal(containsFinnishIdentityNumber(`Identity: ${pin}.`),true);
 assert.equal(containsFinnishIdentityNumber('ace123456a123b-5678-90ab-cdef-123456789012'),false);
});
function provider(options:{type?:string;env?:'live'|'sandbox';quoteStatus?:number;coverageStatus?:number;invalid?:boolean}={}){
 const calls:{url:string;init:RequestInit}[]=[];
 const fetcher:typeof fetch=async(input,init)=>{
  const url=String(input);calls.push({url,init:init??{}});
  if(url.includes('oauth-token'))return Response.json({access_token:'test-token',expires_in:300});
  if(url.endsWith('/coverage-items'))return Response.json([{coverageItemId:'TestItem',coverageItemName:'Test item name',coverageItemDescription:'Only this returned description is displayed.'}],{status:options.coverageStatus??200});
  if(options.quoteStatus)return Response.json({detail:`Sensitive provider error: ${pin}`},{status:options.quoteStatus});
  return Response.json(options.invalid?{...rawQuote(),price:[{...price(),currency:'USD'}]}:rawQuote(options.type));
 };
 return {calls,api:createIfInsuranceProvider({clientId:'test-client',clientSecret:'test-secret',environment:options.env??'live',timeoutMs:100},fetcher)};
}
async function setup(t:TestContext,options:Parameters<typeof provider>[0]={}){
 const insurer=provider(options);const app=await buildApp({config:config(),ifInsurance:insurer.api});t.after(()=>app.close());
 const response=await app.inject({method:'POST',url:'/api/projects',payload:{message:'Moving to Turku with €2000'}});assert.equal(response.statusCode,201,response.body);
 return {app,insurer,project:LifeProjectSchema.parse(response.json().project),url:`/api/projects/${response.json().project.id}/home-insurance`};
}

test('unconfigured If is honestly unavailable, never returns a fabricated price or requests identity',async t=>{
 const app=await buildApp({config:config()});t.after(()=>app.close());const p=(await app.inject({method:'POST',url:'/api/projects',payload:{message:'Moving to Turku with €2000'}})).json().project;
 const url=`/api/projects/${p.id}/home-insurance`;const state=HomeInsuranceResponseSchema.parse((await app.inject(url)).json());assert.equal(state.status.available,false);assert.equal(state.state.quote,null);
 const r=await app.inject({method:'POST',url:`${url}/quote`,payload:{details,personalIdentityNumber:pin,consent:true}});assert.equal(r.statusCode,503);assert.equal(r.json().error.code,'IF_ACCESS_UNAVAILABLE');assert.ok(!r.body.includes(pin));
 assert.equal((await app.inject(`/api/projects/${p.id}`)).json().project.homeInsurance,undefined);
});

test('only an explicit quote request calls verified Finnish endpoints; normalized coverage and billing period are returned',async t=>{
 const {app,insurer,url,project}=await setup(t);await app.inject(url);await app.inject({method:'PATCH',url:`${url}/details`,payload:details});assert.equal(insurer.calls.length,0);
 const r=await app.inject({method:'POST',url:`${url}/quote`,payload:{details,personalIdentityNumber:pin,consent:true}});assert.equal(r.statusCode,200,r.body);assert.equal(r.headers['cache-control'],'no-store');
 const p=LifeProjectSchema.parse(r.json().project);const q=p.homeInsurance!.quote!;assert.equal(q.premiums[0]!.amountMinor,1250);assert.equal(q.premiums[0]!.periodMonths,1);assert.equal(q.premiums[0]!.billingPeriod,'Monthly');assert.equal(q.coverages[0]!.items[0]!.name,'Test item name');
 assert.ok(insurer.calls.every(c=>!c.url.includes('evil.example')));const call=insurer.calls.find(c=>c.url.endsWith('/quotes'))!;
 assert.equal(call.url,'https://api.if-insurance.com/request-quote-householder-insurance-fi/v1/quotes');assert.equal(call.init.method,'POST');assert.equal(call.init.redirect,'error');
 assert.deepEqual(JSON.parse(String(call.init.body)),{policyHolder:{socialSecurityNumber:pin,postalCode:'00100'},address:{streetAddress:details.streetAddress,city:'Turku',postalCode:'20100'},livingSpace:45,householderType:'Apartment',startDate:details.startDate});
 assert.ok(insurer.calls.some(c=>String(c.init.body).includes('scope=householder.quote.fi')));assert.ok(insurer.calls.some(c=>String(c.init.body).includes('scope=householder.listcoverage.fi')));
 assert.ok(!JSON.stringify(p).includes(pin));assert.ok(!JSON.stringify(p).includes('upstream-opaque-id'));assert.equal(p.budget.proposedMinor,0);assert.equal(p.id,project.id);
});

test('recurring quote expense uses selected planning months, preserves allocations, and is idempotently guarded',async t=>{
 const {app,url,project}=await setup(t);const quoted=(await app.inject({method:'POST',url:`${url}/quote`,payload:{details,personalIdentityNumber:pin,consent:true}})).json().project;
 const body={quoteId:quoted.homeInsurance.quote.id,premiumIndex:0,planningMonths:12};
 const r=await app.inject({method:'POST',url:`${url}/expense`,payload:body});assert.equal(r.statusCode,200,r.body);const p=LifeProjectSchema.parse(r.json().project);
 assert.equal(p.homeInsurance!.expense!.plannedMinor,15000);assert.equal(p.homeInsurance!.expense!.status,'proposed');assert.equal(p.budget.committedMinor,0);assert.equal(p.budget.proposedMinor,15000);assert.equal(p.budget.recurringProposedMinor,15000);assert.equal(p.budget.allocatedMinor,project.budget.allocatedMinor);assert.equal(p.budget.availableMinor,project.budget.availableMinor-15000);assert.equal(p.cart.length,0);
 assert.ok(p.budget.warnings.some(w=>w.includes('12 planning month')));assert.ok(p.scenarios.every((s,i)=>s.estimatedTotalMinor===quoted.scenarios[i].estimatedTotalMinor+15000));
 assert.equal((await app.inject({method:'POST',url:`${url}/expense`,payload:body})).statusCode,409);
 assert.equal((await app.inject({method:'PATCH',url:`${url}/details`,payload:{...details,livingSpace:99}})).statusCode,409);
 const removed=(await app.inject({method:'DELETE',url:`${url}/expense`})).json().project;assert.equal(removed.budget.proposedMinor,0);assert.equal(removed.budget.recurringProposedMinor,0);
});

test('annual billing counts full installments for 1, 12 and 13 months, without dividing into a fake monthly charge',async()=>{
 const {api}=provider({type:'Annual'});const q=await api.quote(details,pin);
 assert.equal(insuranceExpense(q,0,1).plannedMinor,1250);assert.equal(insuranceExpense(q,0,12).plannedMinor,1250);assert.equal(insuranceExpense(q,0,13).plannedMinor,2500);assert.equal(insuranceExpense(q,0,13).annualEquivalentMinor,1250);
 assert.throws(()=>insuranceExpense({...q,validTo:'2000-01-01'},0,12),/expired/);
 assert.throws(()=>insuranceExpense(q,0,0),/horizon/);
});

test('sandbox quotes are labelled test data and cannot become real proposed expenses',async t=>{
 const {app,url,insurer}=await setup(t,{env:'sandbox'});const p=(await app.inject({method:'POST',url:`${url}/quote`,payload:{details,personalIdentityNumber:pin,consent:true}})).json().project;
 assert.equal(p.homeInsurance.quote.environment,'sandbox');assert.ok(p.homeInsurance.quote.warnings.some((w:string)=>w.includes('test data')));assert.ok(insurer.calls.some(c=>c.url==='https://authtest.if.eu/oauth/v2/oauth-token'));assert.ok(insurer.calls.some(c=>c.url.includes('/test/request-quote-')));
 const r=await app.inject({method:'POST',url:`${url}/expense`,payload:{quoteId:p.homeInsurance.quote.id,premiumIndex:0,planningMonths:12}});assert.equal(r.statusCode,409);assert.equal(r.json().error.code,'IF_TEST_QUOTE');
});

test('coverage access failure preserves quote with explicit missing-description warning',async()=>{
 const q=await provider({coverageStatus:403}).api.quote(details,pin);assert.equal(q.coverages[0]!.items[0]!.description,null);assert.ok(q.warnings.some(w=>w.includes('descriptions are unavailable')));
});

test('unknown billing periods and non-EUR responses are not silently budgeted',async()=>{
 const q=await provider({type:'Unspecified'}).api.quote(details,pin);assert.equal(q.premiums[0]!.periodMonths,null);assert.throws(()=>insuranceExpense(q,0,12),/confirmed/);
 await assert.rejects(()=>provider({invalid:true}).api.quote(details,pin),/format/);
});

for(const code of [400,401,403,500])test(`If ${code} errors are recoverable and never relay upstream identity details`,async t=>{
 const {app,url,project}=await setup(t,{quoteStatus:code});const r=await app.inject({method:'POST',url:`${url}/quote`,payload:{details,personalIdentityNumber:pin,consent:true}});assert.ok([422,503].includes(r.statusCode));assert.ok(!r.body.includes(pin));const saved=(await app.inject(`/api/projects/${project.id}`)).json().project;assert.equal(saved.homeInsurance,undefined);
});

test('provider timeouts are bounded and sanitized',async()=>{
 const api=createIfInsuranceProvider({clientId:'test',clientSecret:'test',environment:'live',timeoutMs:10},async(_url,init)=>new Promise((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(Error(`Do not expose ${pin}`)))));
 await assert.rejects(()=>api.quote(details,pin),e=>e instanceof Error&&e.message.includes('respond in time')&&!e.message.includes(pin));
});

test('identity cannot enter chat, draft details, project creation, research or persisted answers',async t=>{
 const {app,project,url,insurer}=await setup(t);
 for(const request of [{method:'POST',url:'/api/projects',payload:{message:`Moving with ${pin}`}},{method:'POST',url:`/api/projects/${project.id}/assistant`,payload:{message:`My identity is ${pin}`}},{method:'PATCH',url:`/api/projects/${project.id}`,payload:{preferences:{notes:pin}}},{method:'PATCH',url:`${url}/details`,payload:{city:pin}},{method:'POST',url:`/api/projects/${project.id}/research`,payload:{category:'moving',preferences:[pin]}}] as const){const r=await app.inject(request);assert.equal(r.statusCode,400);assert.equal(r.json().error.code,'SENSITIVE_INPUT');assert.ok(!r.body.includes(pin));}
 assert.equal(insurer.calls.length,0);assert.equal((await app.inject(`/api/projects/${project.id}`)).json().project.revision,0);
 assert.equal(IfQuoteRequestSchema.safeParse({details,personalIdentityNumber:pin,consent:false}).success,false);assert.equal(HomeInsuranceDraftSchema.safeParse({personalIdentityNumber:pin}).success,false);
});

test('travel/car projects cannot request home insurance or cross-contaminate moving state',async t=>{
 const {app,insurer}=await setup(t);
 for(const message of ['Travel to Rome for €900','Buy a used car for €4000']){const p=(await app.inject({method:'POST',url:'/api/projects',payload:{message}})).json().project;const url=`/api/projects/${p.id}/home-insurance`;assert.equal((await app.inject(url)).statusCode,422);assert.equal((await app.inject({method:'POST',url:`${url}/quote`,payload:{details,personalIdentityNumber:pin,consent:true}})).statusCode,422);}
 assert.equal(insurer.calls.length,0);
});

test('real HTTP workflow and disk reload preserve safe details, quote and recurring expense without identity',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lifesim-if-'));t.after(()=>rm(dir,{recursive:true,force:true}));const insurer=provider();
 const app=await buildApp({config:config(),repository:new LocalProjectRepository(dir),ifInsurance:insurer.api});t.after(()=>app.close());const address=await app.listen({host:'127.0.0.1',port:0});
 const response=await fetch(`${address}/api/projects`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Moving to Turku with €2000'})});const p=(await response.json()).project;const url=`${address}/api/projects/${p.id}/home-insurance`;
 let r=await fetch(`${url}/quote`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({details,personalIdentityNumber:pin,consent:true})});assert.equal(r.status,200);const quoted=(await r.json()).project;
 r=await fetch(`${url}/expense`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quoteId:quoted.homeInsurance.quote.id,premiumIndex:0,planningMonths:3})});assert.equal(r.status,200);
 const reloaded=await new LocalProjectRepository(dir).get(p.id);assert.equal(reloaded.homeInsurance!.details.livingSpace,45);assert.equal(reloaded.budget.proposedMinor,3750);assert.equal(reloaded.homeInsurance!.expense!.planningMonths,3);
 for(const file of await readdir(dir))assert.ok(!(await readFile(path.join(dir,file),'utf8')).includes(pin));
});
