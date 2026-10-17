import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {loadConfig} from '../src/config.js';
import {CreateProjectResponseSchema,ProjectResponseSchema,AssistantResponseSchema} from '../../shared/contracts/index.js';
// Explicit opt-in: consumes model credits; no research, purchase or message is executed.
const config=loadConfig();const origin=`http://127.0.0.1:${config.port}`;
async function request(path:string,payload?:unknown){const response=await fetch(origin+path,{method:payload===undefined?'GET':'POST',headers:{'content-type':'application/json',...(config.apiToken?{authorization:`Bearer ${config.apiToken}`}:{})},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(125000)});const body=await response.json();if(!response.ok)throw new Error(`${response.status} ${body.error?.code}: ${body.error?.message}`);return body;}
const checks:string[]=[];const report:Record<string,unknown>={testedAt:new Date().toISOString(),model:config.model,checks};
try{
 const {project}=CreateProjectResponseSchema.parse(await request('/api/projects',{message:"I'm going to Rome from Helsinki for five days with €900. Travel dates are 2027-05-02 to 2027-05-06 for two travelers.",locale:'en'}));
 report.projectId=project.id;assert.equal(project.scenarioType,'travel');assert.equal(project.budget.totalMinor,90000);assert.equal(project.preferences.durationDays,5);checks.push('Live creation preserved travel, Rome, five days and EUR900');
 const base=`/api/projects/${project.id}`;
 const first=AssistantResponseSchema.parse(await request(`${base}/assistant`,{message:'just want to chill there. help me to find some place to sleep, and aviatickets'}));
 const categories=first.proposedActions.flatMap(a=>a.command.type==='research_services'?[a.command.arguments.category]:[]);
 assert.ok(categories.includes('accommodation')&&categories.includes('transport'),JSON.stringify(first));assert.doesNotMatch(first.reply,/is this about|what.*budget|which.*dates|when.*trip/i);checks.push('Casual sleep and aviatickets yielded separate accommodation and flight proposals without re-asking known facts');report.firstReply=first.reply;
 const second=AssistantResponseSchema.parse(await request(`${base}/assistant`,{message:'Yes, it is.'}));assert.doesNotMatch(second.reply,/is this about|another real.life decision/i);checks.push('Short confirmation resumed current travel context');report.confirmationReply=second.reply;
 const saved=ProjectResponseSchema.parse(await request(base)).project;assert.equal(saved.budget.totalMinor,90000);assert.ok(saved.conversation?.turns.length);checks.push('Conversation and canonical facts survived GET reload');
 const {project:unknown}=CreateProjectResponseSchema.parse(await request('/api/projects',{message:'Plan a trip from Helsinki to Rome for five days.',locale:'en'}));
 const budgetReply=AssistantResponseSchema.parse(await request(`/api/projects/${unknown.id}/assistant`,{message:'€900.'}));
 const updated=ProjectResponseSchema.parse(await request(`/api/projects/${unknown.id}`)).project;assert.equal(updated.budget.totalMinor,90000);assert.equal(updated.budget.confirmed,true);assert.ok(!updated.questions.some(q=>/budget/i.test(q)));checks.push('Bare EUR900 answer updated the canonical budget and resolved its clarification');report.budgetReply=budgetReply.reply;
 report.passed=true;
}catch(error){report.passed=false;report.error=error instanceof Error?error.message:'Live conversation failed';process.exitCode=1;}
await mkdir(config.dataDir,{recursive:true});await writeFile(`${config.dataDir}/conversation-live-report.json`,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report,null,2));
