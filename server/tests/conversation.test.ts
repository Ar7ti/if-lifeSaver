import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildApp} from '../src/app.js';
import {createPlannerWithClient} from '../src/ai.js';
import {loadConfig} from '../src/config.js';
import {MemoryProjectRepository} from '../src/repository.js';
import {allocateBudgetForPlan} from '../src/finance.js';
import {appendTurn,askClarification,extractFacts,groundedInterpretationFacts,pendingClarification,InterpretationSchema} from '../src/conversation.js';
import type {LifeProject} from '../../shared/contracts/index.js';
async function fixture(){const repository=new MemoryProjectRepository();const app=await buildApp({repository,config:loadConfig({AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'memory',LOG_LEVEL:'silent'})});const created=await app.inject({method:'POST',url:'/api/projects',payload:{message:'Plan a trip to Rome for five days'}});assert.equal(created.statusCode,201,created.body);return {app,repository,project:created.json().project as LifeProject};}

test('answers bind to the last actual assistant question, not the first missing project field',async t=>{
 const {app,project}=await fixture();t.after(()=>app.close());askClarification(project,'budget','What is your budget in euros?',project.originalMessage);appendTurn(project,'assistant','What is your budget in euros?');
 const pending=pendingClarification(project)!;assert.equal(pending.field,'budget');assert.equal(extractFacts(project,'900',pending).budgetMinor,90000);
 appendTurn(project,'assistant','How many people are traveling?');assert.equal(extractFacts(project,'two',pendingClarification(project)).preferences?.travelers,2);
});

test('structured interpretation uses compact project-scoped state and requires exact evidence',async t=>{
 const {app,project}=await fixture();t.after(()=>app.close());appendTurn(project,'assistant','How many people are traveling?');
 let sent='';const value=InterpretationSchema.parse({classification:'CONTEXTUAL_FOLLOW_UP',intent:'answer',facts:[{field:'travelers',value:'2',evidence:'two'}],clarification:null,reply:'Continue the trip.'});
 const planner=createPlannerWithClient({mode:'openai',model:'test-model',timeoutMs:1000},async body=>{sent=JSON.stringify(body);return {status:'completed',output:[],output_parsed:value};});
 const output=await planner.interpret!(project,{message:'There are two of us.'});assert.equal(output.classification,'CONTEXTUAL_FOLLOW_UP');assert.equal(groundedInterpretationFacts(project,'There are two of us.',output).preferences?.travelers,2);assert.match(sent,/contextual_interpretation/);assert.match(sent,/pending/);assert.match(sent,/How many people are traveling/);
 const invented=InterpretationSchema.parse({...value,facts:[{field:'budget',value:'90000',evidence:'€900'},{field:'destination',value:'Paris',evidence:'Paris'}]});assert.deepEqual(groundedInterpretationFacts(project,'Something cozy please',invented),{});
});

test('budget answers in PATCH reconcile canonical money even without a separate structured preference payload',async t=>{
 const {app,project}=await fixture();t.after(()=>app.close());const question=project.questions.find(q=>/budget/i.test(q))!;
 const response=await app.inject({method:'PATCH',url:`/api/projects/${project.id}`,payload:{answers:[{question,answer:'€900.'}]}});assert.equal(response.statusCode,200,response.body);const saved=response.json().project as LifeProject;assert.equal(saved.budget.totalMinor,90000);assert.equal(saved.budget.confirmed,true);assert.ok(!saved.questions.some(q=>/budget/i.test(q)));assert.ok(saved.conversation?.clarifications.some(c=>c.field==='budget'&&c.status==='answered'&&c.answer==='€900.'));
});

test('dismissed clarification stays dismissed, while an unrelated new scenario preserves the active project',async t=>{
 const {app,project}=await fixture();t.after(()=>app.close());const url=`/api/projects/${project.id}`;
 await app.inject({method:'POST',url:`${url}/assistant`,payload:{message:'skip this question'}});let saved=(await app.inject(url)).json().project as LifeProject;assert.ok(!saved.conversation?.clarifications.some(c=>c.field==='startDate'&&c.status==='pending'));assert.ok(saved.conversation?.clarifications.some(c=>c.field==='startDate'&&c.status==='dismissed'));
 const before=structuredClone(saved);const other=await app.inject({method:'POST',url:`${url}/assistant`,payload:{message:'I want to buy a car with a budget of €4000'}});assert.match(other.json().reply,/separate.*project/);saved=(await app.inject(url)).json().project;assert.deepEqual(saved,before);
});

test('legacy dropped initial facts are recovered from original user input without replacing selected cart choices',async t=>{
 const {app,repository,project}=await fixture();t.after(()=>app.close());await repository.update(project.id,p=>{p.originalMessage="I'm going to Rome for five days with €900.";p.scenarioType='other';p.location=null;p.budget=allocateBudgetForPlan(0,[{id:'general',title:'General',weight:1}],10,false);p.preferences.durationDays=null;p.conversation=undefined;p.cart.push({id:randomUUID(),offerId:null,title:'Existing choice',category:'accommodation',quantity:1,unitPriceMinor:10000,deliveryCostMinor:null,currency:'EUR',status:'selected',priceStatus:'estimated',sourceUrl:null,addedAt:new Date().toISOString()});});
 const response=await app.inject({method:'POST',url:`/api/projects/${project.id}/assistant`,payload:{message:'just wanna chill'}});assert.equal(response.statusCode,200,response.body);const saved=(await app.inject(`/api/projects/${project.id}`)).json().project as LifeProject;assert.equal(saved.scenarioType,'travel');assert.equal(saved.location,'Rome');assert.equal(saved.budget.totalMinor,90000);assert.equal(saved.preferences.durationDays,5);assert.equal(saved.cart[0]!.title,'Existing choice');
});
