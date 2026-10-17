import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {CreateProjectResponseSchema,ResearchResultSchema,AssistantResponseSchema} from '../../shared/contracts/index.js';
import {loadConfig} from '../src/config.js';
// Explicit opt-in: consumes model/search credits; never purchases or sends messages.
const config=loadConfig();
async function post(path:string,body:unknown){
 const response=await fetch(`http://127.0.0.1:${config.port}${path}`,{method:'POST',headers:{'content-type':'application/json',...(config.apiToken?{authorization:`Bearer ${config.apiToken}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(125000)});
 const data=await response.json();if(!response.ok)throw new Error(`${response.status}: ${data.error?.code}: ${data.error?.message}`);return data;
}
const inputs=[
 {scenario:'moving',budget:200000,message:"I'm moving to Turku with a budget of €2,000. I already have a bed and desk.",category:'moving',kind:'service',forbidden:/furniture|\bbed\b|\bdesk\b/i},
 {scenario:'travel',budget:90000,message:'I want to travel from Helsinki to Rome for five days with a budget of €900.',category:'accommodation',kind:'service',forbidden:/furniture|moving/i},
 {scenario:'car_purchase',budget:400000,message:'I want to buy a reliable used car in Finland under €4,000.',category:'vehicle',kind:'product',forbidden:/furniture|moving/i},
] as const;
const results=await Promise.allSettled(inputs.map(async(input)=>{
 const started=Date.now();const {project}=CreateProjectResponseSchema.parse(await post('/api/projects',{message:input.message,locale:'en'}));
 assert.equal(project.aiMode,'openai');assert.equal(project.scenarioType,input.scenario);assert.equal(project.budget.totalMinor,input.budget);assert.equal(project.budget.committedMinor,0);
 assert.ok(project.budget.categories.every(c=>!input.forbidden.test(c.id)));assert.ok(project.questions.every(q=>!input.forbidden.test(q)));
 if(input.scenario==='travel'){assert.equal(project.location,'Rome');assert.equal(project.preferences.origin,'Helsinki');assert.equal(project.preferences.durationDays,5);}
 const planningMs=Date.now()-started;
 const research=ResearchResultSchema.parse(await post(`/api/projects/${project.id}/research`,{category:input.category,kind:input.kind,...(input.scenario==='car_purchase'?{maxPrice:4000}:{})}));
 assert.equal(research.mode,'live');assert.ok(research.offers.every(o=>o.sourceUrl?.startsWith('https://')&&o.priceStatus!=='verified'&&o.verificationStatus!=='demo'));
 const out=AssistantResponseSchema.parse(await post(`/api/projects/${project.id}/assistant`,{message:'Teach me Python programming.'}));assert.equal(out.proposedActions.length,0);assert.match(out.reply,/programming tutorials/);
 const follow=AssistantResponseSchema.parse(await post(`/api/projects/${project.id}/assistant`,{message:'Find cheaper options for my current project. Propose research for my review.'}));
 assert.ok(follow.proposedActions.every(a=>a.requiresConfirmation));
 return {scenario:input.scenario,projectId:project.id,title:project.title,planningMs,totalMs:Date.now()-started,categories:project.budget.categories.map(c=>c.id),questions:project.questions,widgets:project.workspace.widgets.map(w=>w.type),research:{status:research.status,offers:research.offers.map(o=>({title:o.title,priceMinor:o.priceMinor,priceStatus:o.priceStatus,sourceUrl:o.sourceUrl,location:o.location})),warnings:research.warnings},followupActions:follow.proposedActions.map(a=>a.command.type),passed:true};
}));
const report={testedAt:new Date().toISOString(),model:config.model,planningPassed:results.every(r=>r.status==='fulfilled'),marketDataComplete:results.every(r=>r.status==='fulfilled'&&r.value.research.offers.length>0),passed:results.every(r=>r.status==='fulfilled'),results:results.map((r,i)=>r.status==='fulfilled'?r.value:{scenario:inputs[i]!.scenario,passed:false,error:r.reason instanceof Error?r.reason.message:'Unknown integration failure'})};
await mkdir(config.dataDir,{recursive:true});await writeFile(`${config.dataDir}/context-live-test-report.json`,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
