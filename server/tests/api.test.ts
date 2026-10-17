import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LocalProjectRepository, MemoryProjectRepository } from '../src/repository.js';
import type { Planner } from '../src/ai.js';
import type { SearchProvider } from '../src/research.js';
import { CreateProjectResponseSchema, LifeProjectSchema, CartResponseSchema, ResearchResultSchema, WorkspaceResponseSchema, AssistantResponseSchema, HealthResponseSchema, ScenariosResponseSchema, RisksResponseSchema, ErrorResponseSchema, OfferSchema, WorkspaceSchema, type LifeProject, type Offer } from '../../shared/contracts/index.js';

const config=()=>loadConfig({STORAGE_MODE:'memory',AI_MODE:'local',RESEARCH_MODE:'unavailable',LOG_LEVEL:'silent'});
const planner:Planner={
  async createProject() {return {
    title:'Move to Turku',scenarioType:'moving',location:'Turku, Finland',budgetMinor:200000,
    preferences:{moveDate:null,origin:null,householdSize:null,deliveryRequired:null,allowUsed:null,priorities:[],notes:''},
    assumptions:['Allocations are provisional planning envelopes.'],confirmedFacts:['Budget €2,000 and destination Turku were provided.'],questions:['What is your exact moving date?'],
    tasks:[{title:'Confirm the move date',category:'moving',dueDate:null,notes:''}],widgetTypes:['budget','product_catalog','shopping_cart','service_finder','scenario_comparison','risk_guardian','timeline','recommendations','task_list'],recommendations:['Compare current offers before selecting.'],allocation:null,aiMode:'local',
  };},
  async assistant(project) {return {reply:'Review this layout change before applying it.',commands:[{type:'update_workspace',arguments:{widgets:[{id:project.workspace.widgets[0]!.id,visible:false}]}}],explanations:['Hide the budget widget as requested.']};},
};
function makeOffer(overrides:Partial<Offer>={}):Offer{return OfferSchema.parse({id:randomUUID(),category:'beds',kind:'product',title:'Mock bed',description:'Mock source content for deterministic tests.',priceMinor:15000,currency:'EUR',priceStatus:'verified',sourceUrl:'https://example.com/test-bed',sourceName:'Mock search source',seller:{name:'Mock seller',type:'private',publicProfileUrl:null,verified:false},imageUrl:null,location:'Turku, Finland',delivery:{available:null,costMinor:null,details:'Delivery has not been confirmed.'},condition:'used',availability:'unknown',lastCheckedAt:new Date().toISOString(),verificationStatus:'source_checked',recommendation:'Verify delivery before selecting.',score:80,evidence:['Mock source text explicitly lists €150.'],...overrides});}
function mockSearch(offers:Offer[]=[makeOffer()]):SearchProvider{return {mode:'live',async search(request){return ResearchResultSchema.parse({id:randomUUID(),category:request.category,status:'limited',mode:'live',offers:offers.map(o=>({...o,category:request.category})),warnings:['Mock results; delivery not confirmed.'],searchedAt:new Date().toISOString(),query:`${request.category} ${request.location}`});}};}
async function setup(options:Parameters<typeof buildApp>[0]={}){const app=await buildApp({config:config(),planner,search:mockSearch(),...options});const response=await app.inject({method:'POST',url:'/api/projects',payload:{message:'Moving to Turku with €2,000',locale:'en'}});assert.equal(response.statusCode,201,response.body);const result=CreateProjectResponseSchema.parse(response.json());return {app,project:result.project};}
const base=(project:LifeProject)=>`/api/projects/${project.id}`;

test('moving flow: research, cart CRUD, budgets, scenarios, risks, workspace and seller draft',async t=>{
  const {app,project}=await setup();t.after(()=>app.close());const url=base(project);
  assert.equal(project.budget.totalMinor,200000);
  assert.deepEqual(project.workspace.widgets.map(widget=>widget.type).sort(),['budget','recommendations','risk_guardian','scenario_comparison','service_finder','shopping_cart','task_list','timeline'].sort());
  assert.ok(!project.workspace.widgets.some(widget=>widget.type==='product_catalog'),'A move without a requested product does not require a product catalog');
  assert.equal(project.scenarios.length,3);assert.ok(project.tasks.length);
  const research=await app.inject({method:'POST',url:`${url}/research`,payload:{category:'beds',location:'Turku, Finland',maxPrice:250}});
  assert.equal(research.statusCode,200,research.body);const found=ResearchResultSchema.parse(research.json());assert.equal(found.offers.length,1);
  const insert=await app.inject({method:'POST',url:`${url}/cart/items`,payload:{offerId:found.offers[0]!.id}});
  assert.equal(insert.statusCode,201,insert.body);let cart=CartResponseSchema.parse(insert.json());assert.equal(cart.items.length,1);assert.equal(cart.budget.committedMinor,15000);assert.equal(cart.budget.remainingMinor,185000);
  const before=LifeProjectSchema.parse((await app.inject(`${url}`)).json().project);const firstScenario=before.scenarios[0]!;
  const changed=await app.inject({method:'PATCH',url:`${url}/cart/items/${cart.items[0]!.id}`,payload:{unitPriceMinor:10000,quantity:2,deliveryCostMinor:500}});
  assert.equal(changed.statusCode,200,changed.body);cart=CartResponseSchema.parse(changed.json());assert.equal(cart.budget.committedMinor,20500);assert.equal(cart.items[0]!.priceStatus,'estimated');
  const after=LifeProjectSchema.parse((await app.inject(`${url}`)).json().project);assert.equal(after.scenarios[0]!.estimatedTotalMinor-firstScenario.estimatedTotalMinor,5500);assert.equal(after.scenarios[0]!.basedOnRevision,after.revision);
  const scenarios=ScenariosResponseSchema.parse((await app.inject(`${url}/scenarios`)).json());assert.deepEqual(scenarios.scenarios.map(s=>s.name),['Economy','Balanced','Comfort']);
  const risks=RisksResponseSchema.parse((await app.inject(`${url}/risks`)).json());assert.ok(risks.risks.some(r=>r.category==='seller'));assert.ok(risks.risks.every(r=>r.evidence.length));
  const draft=await app.inject({method:'POST',url:`${url}/seller-message`,payload:{offerId:found.offers[0]!.id,language:'fi'}});assert.equal(draft.statusCode,200);assert.equal(draft.json().sent,false);assert.match(draft.json().draft,/Hei/);assert.equal(draft.json().handoffUrl,'https://example.com/test-bed');
  const widget=after.workspace.widgets[0]!;
  const layout=await app.inject({method:'PATCH',url:`${url}/workspace`,payload:{widgets:[{id:widget.id,position:{x:0,y:5,w:12,h:4},visible:false}],expectedRevision:after.revision}});assert.equal(layout.statusCode,200,layout.body);const ws=WorkspaceResponseSchema.parse(layout.json());assert.equal(ws.workspace.widgets[0]!.visible,false);
  const conflict=await app.inject({method:'PATCH',url:`${url}/workspace`,payload:{widgets:[],expectedRevision:after.revision}});assert.equal(conflict.statusCode,409);
  const del=await app.inject({method:'DELETE',url:`${url}/cart/items/${cart.items[0]!.id}`});assert.equal(del.statusCode,200);cart=CartResponseSchema.parse(del.json());assert.equal(cart.items.length,0);assert.equal(cart.budget.committedMinor,0);assert.equal(cart.budget.remainingMinor,200000);
});

test('assistant proposals only apply after explicit confirmation and cannot apply twice',async t=>{
  const {app,project}=await setup();t.after(()=>app.close());const url=base(project);
  const response=await app.inject({method:'POST',url:`${url}/assistant`,payload:{message:'Hide the budget widget',context:{activeCategory:'furniture'}}});assert.equal(response.statusCode,200,response.body);const result=AssistantResponseSchema.parse(response.json());const action=result.proposedActions[0]!;assert.equal(action.requiresConfirmation,true);
  let p=(await app.inject(url)).json().project as LifeProject;assert.equal(p.workspace.widgets[0]!.visible,true);
  const applied=await app.inject({method:'POST',url:`${url}/actions/${action.id}/confirm`,payload:{approved:true,expectedRevision:p.revision}});assert.equal(applied.statusCode,200,applied.body);p=applied.json().project;assert.equal(p.workspace.widgets[0]!.visible,false);assert.equal(p.actions[0]!.status,'applied');
  assert.equal((await app.inject({method:'POST',url:`${url}/actions/${action.id}/confirm`,payload:{approved:true}})).statusCode,409);
});

test('rejecting an assistant action preserves user state and its audit record',async t=>{
  const {app,project}=await setup();t.after(()=>app.close());const url=base(project);
  const response=await app.inject({method:'POST',url:`${url}/assistant`,payload:{message:'Hide budget'}});const action=response.json().proposedActions[0];
  const rejected=await app.inject({method:'POST',url:`${url}/actions/${action.id}/confirm`,payload:{approved:false}});assert.equal(rejected.statusCode,200);assert.equal(rejected.json().project.actions[0].status,'rejected');assert.equal(rejected.json().project.workspace.widgets[0].visible,true);
});

test('project preferences and budgets update atomically; impossible allocations do not persist',async t=>{
  const {app,project}=await setup();t.after(()=>app.close());const url=base(project);
  const change=await app.inject({method:'PATCH',url,payload:{title:'My Turku move',preferences:{allowUsed:false,deliveryRequired:true,householdSize:2},budget:{totalMinor:300000},tasks:[{id:project.tasks[0]!.id,status:'done'}],expectedRevision:0}});assert.equal(change.statusCode,200,change.body);const p=LifeProjectSchema.parse(change.json().project);assert.equal(p.preferences.allowUsed,false);assert.equal(p.budget.totalMinor,300000);assert.equal(p.tasks[0]!.status,'done');assert.equal(p.scenarios[0]!.remainingMinor,300000-p.scenarios[0]!.estimatedTotalMinor);
  const bad=await app.inject({method:'PATCH',url,payload:{budget:{totalMinor:1}}});assert.equal(bad.statusCode,400);assert.equal((await app.inject(url)).json().project.budget.totalMinor,300000);
});

test('validation and errors have consistent envelopes; workspace data rejects arbitrary code',async t=>{
  const {app,project}=await setup();t.after(()=>app.close());const url=base(project);
  const cases=[
    {method:'POST',url:'/api/projects',payload:{message:'',javascript:'alert(1)'}},
    {method:'PATCH',url,payload:{budget:{totalMinor:-1}}},
    {method:'PATCH',url:`${url}/workspace`,payload:{widgets:[{id:project.workspace.widgets[0]!.id,config:{javascript:'alert(1)'}}]}},
    {method:'PATCH',url:`${url}/workspace`,payload:{widgets:[{id:project.workspace.widgets[0]!.id,position:{x:10,y:0,w:6,h:3}}]}},
    {method:'POST',url:`${url}/cart/items`,payload:{title:'Unsafe link',category:'furniture',unitPriceMinor:1000,sourceUrl:'http://127.0.0.1/secret'}},
    {method:'POST',url:`${url}/cart/items`,payload:{title:'Overly precise',category:'furniture',unitPriceMinor:10.5}},
  ] as const;
  for(const c of cases){const r=await app.inject(c);assert.equal(r.statusCode,400,r.body);assert.equal(ErrorResponseSchema.parse(r.json()).error.code,'VALIDATION_ERROR');}
  const missing=await app.inject(`/api/projects/${randomUUID()}`);assert.equal(missing.statusCode,404);ErrorResponseSchema.parse(missing.json());
  assert.equal((await app.inject('/api/unknown')).json().error.code,'NOT_FOUND');
  const malformed=await app.inject({method:'POST',url:'/api/projects',headers:{'content-type':'application/json'},payload:'{broken'});assert.equal(malformed.statusCode,400);ErrorResponseSchema.parse(malformed.json());
  const oversized=await app.inject({method:'POST',url:'/api/projects',payload:{message:'a'.repeat(40000)}});assert.equal(oversized.statusCode,413);ErrorResponseSchema.parse(oversized.json());
  assert.equal(WorkspaceSchema.safeParse({...project.workspace,widgets:[...project.workspace.widgets,project.workspace.widgets[0]!]}).success,false);
});

test('unknown prices cannot silently become free cart items and stale research is blocked',async t=>{
  const offers=[makeOffer({priceMinor:null,priceStatus:'unknown'}),makeOffer()];
  const {app,project}=await setup({search:mockSearch(offers)});t.after(()=>app.close());const url=base(project);
  await app.inject({method:'POST',url:`${url}/research`,payload:{category:'beds'}});
  const unknown=await app.inject({method:'POST',url:`${url}/cart/items`,payload:{offerId:offers[0]!.id}});assert.equal(unknown.statusCode,400);assert.equal(unknown.json().error.code,'PRICE_UNKNOWN');
  await app.inject({method:'PATCH',url,payload:{location:'Helsinki, Finland'}});
  const stale=await app.inject({method:'POST',url:`${url}/cart/items`,payload:{offerId:offers[1]!.id}});assert.equal(stale.statusCode,409);assert.equal(stale.json().error.code,'STALE_RESEARCH');
  const p=LifeProjectSchema.parse((await app.inject(url)).json().project);assert.equal(p.researchResults.length,1);assert.ok(p.scenarios.every(s=>!s.selectedOfferIds.includes(offers[1]!.id)));
});

test('health configuration exposes no secret; auth, origin and rate limits are enforced',async t=>{
  const token='a-private-demo-token-with-at-least-24-characters';const app=await buildApp({config:{...config(),apiToken:token},planner,search:mockSearch()});t.after(()=>app.close());
  const health=await app.inject('/api/health');HealthResponseSchema.parse(health.json());assert.ok(!health.body.includes(token));assert.ok(!health.body.includes('apiKey'));
  assert.equal((await app.inject({method:'POST',url:'/api/projects',payload:{message:'Move to Turku'}})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/projects',headers:{authorization:`Bearer ${token}`,origin:'https://untrusted.example'},payload:{message:'Move to Turku'}})).statusCode,403);
  const allowed=await app.inject({method:'POST',url:'/api/projects',headers:{authorization:`Bearer ${token}`,origin:'http://localhost:5173'},payload:{message:'Move to Turku'}});assert.equal(allowed.statusCode,201,allowed.body);
  for(let i=0;i<9;i++) await app.inject({method:'POST',url:'/api/projects',headers:{authorization:`Bearer ${token}`},payload:{message:'Move to Turku'}});
  const limited=await app.inject({method:'POST',url:'/api/projects',headers:{authorization:`Bearer ${token}`},payload:{message:'Move to Turku'}});assert.equal(limited.statusCode,429);assert.equal(limited.json().error.code,'RATE_LIMITED');
});

test('local repository survives restart and serializes concurrent updates without lost changes',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'life-simulator-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const first=new LocalProjectRepository(directory);const {app,project}=await setup({repository:first});t.after(()=>app.close());
  const url=base(project);
  const research=await app.inject({method:'POST',url:`${url}/research`,payload:{category:'beds'}});
  await app.inject({method:'POST',url:`${url}/cart/items`,payload:{offerId:research.json().offers[0].id}});
  await app.inject({method:'PATCH',url:`${url}/workspace`,payload:{widgets:[{id:project.workspace.widgets[0]!.id,visible:false}]}});
  const second=new LocalProjectRepository(directory);const restored=await second.get(project.id);assert.equal(restored.cart.length,1);assert.equal(restored.researchResults.length,1);assert.equal(restored.workspace.widgets[0]!.visible,false);
  const revision=restored.revision;
  await Promise.all(Array.from({length:8},(_,i)=>second.update(project.id,p=>{p.recommendations.push(`Concurrent ${i}`);})));const current=await second.get(project.id);assert.equal(current.revision,revision+8);assert.equal(current.recommendations.length,restored.recommendations.length+8);
  await assert.rejects(second.update(project.id,()=>{},revision),/Project changed/);
});

test('repository gives detached snapshots and failed writes roll back',async()=>{
  const repository=new MemoryProjectRepository();const {app,project}=await setup({repository});try{
    const read=await repository.get(project.id);read.title='mutated outside repo';assert.notEqual((await repository.get(project.id)).title,read.title);
    await assert.rejects(repository.update(project.id,p=>{p.title='';}));assert.equal((await repository.get(project.id)).title,project.title);
  }finally{await app.close();}
});

test('service inquiry drafts use recorded route and quote terms without contacting a provider',async t=>{
  const {app,project}=await setup({search:mockSearch([makeOffer({kind:'service',category:'moving',condition:'not_applicable',title:'Mock moving service',seller:{name:null,type:'company',publicProfileUrl:null,verified:false}})])});
  t.after(()=>app.close());const url=base(project);
  await app.inject({method:'PATCH',url,payload:{preferences:{origin:'Helsinki',moveDate:'2026-11-15'}}});
  const research=await app.inject({method:'POST',url:`${url}/research`,payload:{category:'moving',kind:'service'}});
  const draft=await app.inject({method:'POST',url:`${url}/seller-message`,payload:{offerId:research.json().offers[0].id}});
  assert.equal(draft.statusCode,200,draft.body);assert.equal(draft.json().sent,false);
  assert.match(draft.json().draft,/from Helsinki to Turku, Finland on 2026-11-15/);
  assert.match(draft.json().draft,/itemized quote/);assert.match(draft.json().draft,/cancellation terms/);
});
