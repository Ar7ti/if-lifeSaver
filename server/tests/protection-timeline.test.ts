import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { addCalendarDays, movingProtectionTimeline, updateProtectionMilestone } from '../src/protection-timeline.js';
import { LifeProjectSchema, ProtectionTimelineStateSchema, type LifeProject } from '../../shared/contracts/index.js';

const config=loadConfig({AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'memory',LOG_LEVEL:'silent'});
async function moving(){
 const app=await buildApp({config});
 try {const r=await app.inject({method:'POST',url:'/api/projects',payload:{message:'I am moving to Turku with EUR 2000. I already own furniture.'}});assert.equal(r.statusCode,201,r.body);return r.json().project as LifeProject;}finally{await app.close();}
}
test('date-only scheduling handles DST, leap years and year boundaries',()=>{
 assert.equal(addCalendarDays('2026-11-15',-14),'2026-11-01');
 assert.equal(addCalendarDays('2026-03-29',1),'2026-03-30');
 assert.equal(addCalendarDays('2026-10-25',-1),'2026-10-24');
 assert.equal(addCalendarDays('2028-03-01',-1),'2028-02-29');
 assert.equal(addCalendarDays('2027-01-01',-1),'2026-12-31');
 assert.throws(()=>addCalendarDays('2026-02-30',0));
});
test('dated, undated and past moving plans use actual facts without mutating old projects',async()=>{
 const p=await moving();const before=JSON.stringify(p);
 const undated=movingProtectionTimeline(p,'2026-10-17');assert.equal(undated.moveDate,null);assert(undated.milestones.every(m=>m.suggestedDate===null&&m.status==='ready'));assert.match(undated.reviewNote,/not been checked/);assert.equal(JSON.stringify(p),before);
 p.preferences.moveDate='2026-11-15';p.preferences.origin='Helsinki';
 const view=movingProtectionTimeline(p,'2026-10-17');assert.equal(view.destination,p.location);assert.equal(view.origin,'Helsinki');assert.deepEqual(view.milestones.map(m=>m.suggestedDate),['2026-11-01','2026-11-08','2026-11-14','2026-11-15','2026-11-18']);assert(view.milestones.every(m=>m.status==='upcoming'));
 assert.equal(movingProtectionTimeline(p,'2026-11-01').milestones[0]!.status,'ready');assert(movingProtectionTimeline(p,'2026-12-01').milestones.every(m=>m.status==='past_suggested_date'));
 p.location='Espoo';assert.equal(movingProtectionTimeline(p).destination,'Espoo');
 for(const scenario of ['travel','car_purchase'] as const){assert.throws(()=>movingProtectionTimeline({...p,scenarioType:scenario}),/moving projects only/);}
 assert(LifeProjectSchema.safeParse(JSON.parse(before)).success);
});
test('review and postponed states are contextual without declaring active cover',async()=>{
 const p=await moving();assert(p.protection);const recommendation=p.protection.recommendations.find(r=>r.insuranceType==='home')!;
 for(const [status,text] of [['reviewed',/not independent/],['dismissed',/postponed/],['already_insured_self_reported',/not been verified/],['quote_available',/not a purchased/]] as const){recommendation.status=status;const v=movingProtectionTimeline(p);assert.match(v.reviewNote,text);assert.equal(v.completed,0);assert.equal(v.reviewStatus,status);}
});
test('stable milestone identities preserve history while changed context requires renewed review',async()=>{
 const p=await moving();p.preferences.moveDate='2026-11-15';const oldBudget=JSON.stringify(p.budget),oldTasks=JSON.stringify(p.tasks),oldProtection=JSON.stringify(p.protection);
 for(const item of movingProtectionTimeline(p).milestones)updateProtectionMilestone(p,item.id,{completed:true,expectedContextFingerprint:item.contextFingerprint},'2026-10-17T12:00:00Z');
 assert.equal(movingProtectionTimeline(p).completed,5);
 const original=movingProtectionTimeline(p).milestones[0]!;p.preferences.moveDate='2026-11-20';
 const changed=movingProtectionTimeline(p);assert.equal(changed.completed,2);assert(changed.milestones.slice(0,3).every(m=>m.status==='needs_review'));assert.equal(changed.milestones[3]!.suggestedDate,'2026-11-20');assert.equal(p.protectionTimeline!.records.length,5);
 assert.throws(()=>updateProtectionMilestone(p,original.id,{completed:true,expectedContextFingerprint:original.contextFingerprint}),/details changed/);
 const renewed=changed.milestones[0]!;updateProtectionMilestone(p,renewed.id,{completed:true,expectedContextFingerprint:renewed.contextFingerprint});assert.equal(p.protectionTimeline!.records[0]!.history.length,2);
 updateProtectionMilestone(p,renewed.id,{completed:false,expectedContextFingerprint:renewed.contextFingerprint});assert.equal(p.protectionTimeline!.records[0]!.completedAt,null);
 p.location='Tampere';assert(movingProtectionTimeline(p).milestones.filter(m=>m.completedAt).every(m=>m.status==='needs_review'));
 assert.equal(JSON.stringify(p.budget),oldBudget);assert.equal(JSON.stringify(p.tasks),oldTasks);assert.equal(JSON.stringify(p.protection),oldProtection);
 assert(ProtectionTimelineStateSchema.safeParse(p.protectionTimeline).success);
 assert(!ProtectionTimelineStateSchema.safeParse({version:1,records:[p.protectionTimeline!.records[0],p.protectionTimeline!.records[0]]}).success);
});
test('real HTTP creation, completion, restart, reopen and context conflict persist correctly',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'protection-timeline-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const cfg=loadConfig({AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'local',DATA_DIR:dir,LOG_LEVEL:'silent'});
 const app=await buildApp({config:cfg});t.after(()=>app.close());await app.listen({host:'127.0.0.1',port:0});const root=`http://127.0.0.1:${(app.server.address() as {port:number}).port}/api/projects`;
 const send=async(url:string,method='GET',body?:unknown)=>{const r=await fetch(url,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 const created=await send(root,'POST',{message:'I am moving to Turku with EUR 2000'});assert.equal(created.status,201);const p=created.data.project;
 const url=root+'/'+p.id,view=(await send(url+'/protection-timeline')).data,item=view.milestones[0];
 const patch={completed:true,expectedContextFingerprint:item.contextFingerprint,expectedRevision:p.revision};
 const saved=await send(url+'/protection-timeline/'+item.id,'PATCH',patch);assert.equal(saved.status,200);assert.equal(saved.data.timeline.completed,1);assert.equal(saved.data.project.protectionTimeline.records.length,1);
 assert.equal((await send(url+'/protection-timeline/'+item.id,'PATCH',patch)).status,409);
 assert.equal((await send(url+'/protection-timeline/not-supported','PATCH',patch)).status,400);
 assert.equal((await send(url+'/protection-timeline/'+item.id,'PATCH',{...patch,arbitraryCode:'x'})).status,400);
 await app.close();const restart=await buildApp({config:cfg});t.after(()=>restart.close());
 const loaded=await restart.inject(`/api/projects/${p.id}/protection-timeline`);assert.equal(loaded.json().completed,1);
 const reopen=await restart.inject({method:'PATCH',url:`/api/projects/${p.id}/protection-timeline/home_review`,payload:{completed:false,expectedContextFingerprint:item.contextFingerprint}});assert.equal(reopen.statusCode,200,reopen.body);assert.equal(reopen.json().timeline.completed,0);
 const reload=await restart.inject(`/api/projects/${p.id}`);assert.equal(reload.json().project.protectionTimeline.records[0].history.length,2);
});
test('main authentication protects both timeline routes before reading or changing a project',async t=>{
 const token='fictional-test-token-over-24-characters';
 const app=await buildApp({config:loadConfig({AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'memory',LOG_LEVEL:'silent',API_TOKEN:token})});t.after(()=>app.close());
 const headers={authorization:`Bearer ${token}`};
 const created=await app.inject({method:'POST',url:'/api/projects',headers,payload:{message:'I am moving to Turku with EUR 2000'}});assert.equal(created.statusCode,201,created.body);
 const url=`/api/projects/${created.json().project.id}/protection-timeline`;
 assert.equal((await app.inject(url)).statusCode,401);
 assert.equal((await app.inject({method:'PATCH',url:url+'/home_review',payload:{}})).statusCode,401);
 assert.equal((await app.inject({url,headers:{authorization:'Bearer invalid'}})).statusCode,401);
 const own=await app.inject({url,headers});assert.equal(own.statusCode,200,own.body);
 const saved=await app.inject({method:'PATCH',url:url+'/home_review',headers,payload:{completed:true,expectedContextFingerprint:own.json().milestones[0].contextFingerprint}});assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().timeline.completed,1);
});
