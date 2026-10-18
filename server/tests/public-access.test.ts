import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPlanner, type Planner } from '../src/ai.js';
import { createSearchProvider } from '../src/research.js';
import { SecurityStore } from '../src/security-store.js';
import { SessionResponseSchema, type SessionResponse } from '../../shared/contracts/index.js';
import { Responses } from 'openai/resources/responses/responses';
import { AppError } from '../src/errors.js';

const origin='http://127.0.0.1:5999';
const adminKey='fixture-admin-key-independent-of-legacy-token';
const local=createPlanner({mode:'local',model:'mock',timeoutMs:1000});
function config(dir:string,extra:NodeJS.ProcessEnv={}){return loadConfig({DATA_DIR:dir,STORAGE_MODE:'local',AI_MODE:'openai',RESEARCH_MODE:'demo',OPENAI_API_KEY:'fixture-never-used',LOG_LEVEL:'silent',ALLOWED_ORIGINS:origin,PUBLIC_ACCESS_ENABLED:'true',PUBLIC_AI_ENABLED:'true',ADMIN_ACCESS_KEY:adminKey,SESSION_COOKIE_SECURE:'false',AI_INPUT_USD_PER_MILLION:'0.1',AI_OUTPUT_USD_PER_MILLION:'0.1',AI_WEB_SEARCH_USD_PER_CALL:'0.01',...extra});}
async function fixture(t:TestContext,extra:NodeJS.ProcessEnv={},planner:Planner=local){
  const dir=await mkdtemp(path.join(os.tmpdir(),'public-access-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const cfg=config(dir,extra);const app=await buildApp({config:cfg,planner,search:createSearchProvider({mode:'demo',model:'mock',timeoutMs:1000})});
  t.after(()=>app.close());return {app,dir,cfg};
}
type Visitor={cookie:string;csrf:string;info:SessionResponse};
async function visitor(app:FastifyInstance):Promise<Visitor>{
  const r=await app.inject({method:'POST',url:'/api/session',headers:{origin},payload:{}});assert.equal(r.statusCode,200,r.body);
  const info=SessionResponseSchema.parse(r.json());const cookie=String(r.headers['set-cookie']).split(';')[0]!;
  return {cookie,csrf:info.csrfToken!,info};
}
function request(app:FastifyInstance,v:Visitor,url:string,method:'GET'|'POST'|'PATCH'|'DELETE'='GET',payload?:unknown,key=randomUUID()){
  return app.inject({method,url,headers:{origin,cookie:v.cookie,'x-csrf-token':v.csrf,'idempotency-key':key},...(method==='GET'?{}:{payload:payload??{}})});
}
async function create(app:FastifyInstance,v:Visitor,message='I am moving to Turku with EUR 2000.'){
  const r=await request(app,v,'/api/projects','POST',{message});assert.equal(r.statusCode,201,r.body);return r.json().project;
}

test('sessions are explicit, hashed, CSRF-protected, host-only and persistent',async t=>{
  const {app,dir,cfg}=await fixture(t,{SESSION_COOKIE_SECURE:'true'});
  assert.equal((await app.inject('/api/health')).statusCode,200);
  const empty=await app.inject('/api/session');assert.equal(empty.json().session,null);assert.equal(empty.headers['set-cookie'],undefined);
  assert.equal((await app.inject({method:'POST',url:'/api/session',payload:{}})).statusCode,403);
  const r=await app.inject({method:'POST',url:'/api/session',headers:{origin},payload:{}});const set=String(r.headers['set-cookie']);
  assert.match(set,/^__Host-lifesim=/);assert.match(set,/HttpOnly/);assert.match(set,/Secure/);assert.match(set,/SameSite=Lax/);assert(!set.includes('Domain='));
  const v={cookie:set.split(';')[0]!,csrf:r.json().csrfToken,info:r.json()};
  assert.equal((await app.inject({method:'POST',url:'/api/projects',headers:{origin,cookie:v.cookie},payload:{message:'Move to Turku'}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/projects',headers:{origin:'https://evil.example',cookie:v.cookie,'x-csrf-token':v.csrf},payload:{message:'Move to Turku'}})).statusCode,403);
  const p=await create(app,v);assert.equal((await request(app,v,`/api/projects/${p.id}`)).headers['cache-control'],'no-store');
  const record=JSON.parse(await readFile(path.join(dir,p.id+'.json'),'utf8'));assert.equal(record.ownerId,v.info.session.id);assert.equal(record.project.id,p.id);
  await app.close();
  const dbBytes=await readFile(cfg.publicAccess.dbPath);assert(!dbBytes.includes(Buffer.from(v.cookie.split('=')[1]!)));
  const restarted=await buildApp({config:cfg,planner:local});t.after(()=>restarted.close());
  assert.equal((await request(restarted,v,`/api/projects/${p.id}`)).statusCode,200);
  assert.equal((await request(restarted,v,'/api/session')).json().usage.used,1);
  assert.equal((await restarted.inject({url:`/api/projects/${p.id}`,headers:{cookie:'__Host-lifesim=invalid'}})).statusCode,401);
  assert.equal((await request(restarted,v,'/api/session','POST')).headers['set-cookie'],undefined,'bootstrap is idempotent for existing sessions');
  const logout=await request(restarted,v,'/api/session','DELETE');assert.equal(logout.statusCode,200);assert.match(String(logout.headers['set-cookie']),/Max-Age=0/);
  assert.equal((await request(restarted,v,`/api/projects/${p.id}`)).statusCode,401);
});

test('every project route is isolated before validation or provider work',async t=>{
  const {app}=await fixture(t);const a=await visitor(app),b=await visitor(app);const pa=await create(app,a),pb=await create(app,b,'Travel to Rome with EUR 900');
  const root=`/api/projects/${pb.id}`;
  for(const [method,suffix] of [['GET',''],['PATCH',''],['GET','/workspace'],['PATCH','/workspace'],['GET','/cart'],['POST','/cart/items'],['PATCH','/cart/items/'+randomUUID()],['DELETE','/cart/items/'+randomUUID()],['GET','/risks'],['GET','/scenarios'],['POST','/scenarios'],['POST','/assistant'],['POST','/research'],['POST','/actions/'+randomUUID()+'/confirm'],['GET','/home-insurance'],['PATCH','/home-insurance/details'],['POST','/home-insurance/quote'],['POST','/home-insurance/expense'],['DELETE','/home-insurance/expense'],['PATCH','/protection'],['PATCH','/protection/car/draft'],['POST','/protection/car/quote'],['POST','/protection/car/expense'],['DELETE','/protection/car/expense'],['POST','/seller-message']] as const){
    const r=await request(app,a,root+suffix,method,{});assert.equal(r.statusCode,404,`${method} ${suffix}: ${r.body}`);
  }
  assert.equal((await request(app,a,`/api/projects/${pa.id}`)).statusCode,200);
  assert.equal((await request(app,b,root)).statusCode,200);
  const list=(await request(app,a,'/api/projects')).json().projects;assert.deepEqual(list.map((p:{id:string})=>p.id),[pa.id]);assert(!JSON.stringify(list).includes(pb.id));
  assert.equal((await request(app,a,'/api/projects','POST',{message:'Move to Turku',ownerId:b.info.session!.id})).statusCode,400);
  assert.equal((await request(app,a,'/api/session')).json().usage.used,1,'denied paths never spend AI quota');
});

test('legacy JSON remains unchanged and only independent administrator sessions can read it',async t=>{
  const {app,dir}=await fixture(t);const a=await visitor(app);const p=await create(app,a);
  const legacyId=randomUUID(),legacy={...p,id:legacyId};const text=JSON.stringify(legacy);await writeFile(path.join(dir,legacyId+'.json'),text);
  const oldSchemaId=randomUUID();await writeFile(path.join(dir,oldSchemaId+'.json'),JSON.stringify({id:oldSchemaId,title:'Legacy schema that must not be parsed for visitors'}));
  assert.equal((await request(app,a,`/api/projects/${legacyId}`)).statusCode,404);
  assert.equal((await request(app,a,`/api/projects/${oldSchemaId}`)).statusCode,404);
  assert.equal((await request(app,a,'/api/projects')).json().projects.length,1);
  // Remove the deliberately invalid schema fixture before the administrator listing.
  await rm(path.join(dir,oldSchemaId+'.json'));
  assert.equal((await request(app,a,'/api/admin/projects')).statusCode,404);
  assert.equal((await app.inject({url:`/api/projects/${legacyId}`,headers:{authorization:'Bearer '+adminKey}})).statusCode,401);
  assert.equal((await request(app,a,'/api/admin/login','POST',{key:'incorrect'})).statusCode,401);
  const login=await request(app,a,'/api/admin/login','POST',{key:adminKey});assert.equal(login.statusCode,200,login.body);
  const admin={cookie:a.cookie+'; '+String(login.headers['set-cookie']).split(';')[0],csrf:login.json().csrfToken,info:login.json()};
  assert.equal((await request(app,admin,`/api/projects/${legacyId}`)).statusCode,200);
  assert.equal((await request(app,admin,'/api/admin/status')).statusCode,200);
  assert.equal((await request(app,admin,'/api/admin/public-ai','PATCH',{enabled:false})).json().publicAiEnabled,false);
  assert.equal((await request(app,a,`/api/projects/${p.id}/assistant`,'POST',{message:'Find cheaper furniture'})).json().error.code,'PUBLIC_AI_DISABLED');
  assert.equal(await readFile(path.join(dir,legacyId+'.json'),'utf8'),text);
  assert.equal((await request(app,admin,'/api/admin/logout','POST')).statusCode,200);
  assert.equal((await request(app,admin,'/api/admin/status')).statusCode,404);
  assert.equal((await request(app,a,`/api/projects/${p.id}`)).statusCode,200);
});

test('five actual model calls, including creation, exhaust a durable UTC quota without blocking manual tools',async t=>{
  const {app,dir,cfg}=await fixture(t);const a=await visitor(app);const p=await create(app,a);
  for(let i=0;i<4;i++)assert.equal((await request(app,a,`/api/projects/${p.id}/assistant`,'POST',{message:'Find a cheaper bed'})).statusCode,200);
  const exhausted=await request(app,a,`/api/projects/${p.id}/assistant`,'POST',{message:'Find a cheaper bed'});assert.equal(exhausted.json().error.code,'AI_QUOTA_EXCEEDED');
  assert.equal((await request(app,a,`/api/projects/${p.id}`,'PATCH',{title:'Still editable'})).statusCode,200);
  await app.close();const restart=await buildApp({config:cfg,planner:local});t.after(()=>restart.close());
  assert.equal((await request(restart,a,'/api/session')).json().usage.remaining,0);
  assert.equal((await request(restart,a,`/api/projects/${p.id}/assistant`,'POST',{message:'Find a cheaper bed'})).json().error.code,'AI_QUOTA_EXCEEDED');
  assert.equal((await readdir(dir)).filter(x=>x.endsWith('.json')).length,1);
});

test('request reservations prevent concurrent duplicates and extra workspace creation',async t=>{
  const {app}=await fixture(t,{PUBLIC_MAX_WORKSPACES_PER_SESSION:'1'});const a=await visitor(app);const key=randomUUID();
  const pair=await Promise.all([request(app,a,'/api/projects','POST',{message:'Move to Turku'},key),request(app,a,'/api/projects','POST',{message:'Move to Turku'},key)]);
  assert.deepEqual(pair.map(x=>x.statusCode).sort(),[201,409]);
  assert.equal((await request(app,a,'/api/projects','POST',{message:'Move to Helsinki'})).json().error.code,'WORKSPACE_LIMIT');
  assert.equal((await request(app,a,'/api/session')).json().usage.used,1);
});

test('durable global reservation, failure accounting, daily reset, expiration and cleanup',async t=>{
  const {cfg}=await fixture(t,{GLOBAL_DAILY_AI_BUDGET_USD:'0.03',PUBLIC_AI_REQUESTS_PER_DAY:'2'});
  // Separate SQLite fixture to exercise the provider boundary directly, with no OpenAI requests.
  let now=Date.parse('2026-10-17T12:00:00Z');const store=new SecurityStore({...cfg.publicAccess,dbPath:path.join(path.dirname(cfg.publicAccess.dbPath),'meter.sqlite')},()=>now);t.after(()=>store.close());
  const a=store.createSession('anonymous','one'),b=store.createSession('anonymous','two');
  await assert.rejects(store.meter(a.principal,{model:'mock',max_output_tokens:10000},async()=>{throw new Error('provider failed');}),/provider failed/);
  assert.equal(store.usage(a.principal).used,1);
  let called=false;await assert.rejects(store.meter(b.principal,{},async()=>{called=true;}),e=>(e as {code:string}).code==='GLOBAL_AI_BUDGET_EXCEEDED');assert.equal(called,false);
  now+=86400000;assert.equal(store.usage(a.principal).used,0);
  await store.meter(a.principal,{},async()=>({usage:{input_tokens:10,output_tokens:10},output:[]}));
  const status=store.status();assert.equal(status.costsAreEstimates,true);
  now+=31*86400000;assert.equal(store.authenticate(a.credential),null);store.cleanup();assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n,0);
});

test('session creation throttling and admin expiry/revocation persist',async t=>{
  const {app,cfg}=await fixture(t,{NEW_SESSIONS_PER_HOUR:'1'});await visitor(app);
  assert.equal((await app.inject({method:'POST',url:'/api/session',headers:{origin},payload:{}})).statusCode,429);
  let now=Date.now();const store=new SecurityStore({...cfg.publicAccess,dbPath:cfg.publicAccess.dbPath+'.expiry'},()=>now);t.after(()=>store.close());
  const admin=store.createSession('admin','test');now+=cfg.publicAccess.adminTtl*1000+1;assert.equal(store.authenticate(admin.credential),null);
  const anon=store.createSession('anonymous','other');const renewed=store.renew(anon.principal);assert.equal(store.authenticate(anon.credential),null);assert.equal(store.authenticate(renewed.credential)!.id,anon.principal.id);store.revoke(anon.principal.id);assert.equal(store.authenticate(renewed.credential),null);
});

test('public feature flags default off and unsafe configurations are rejected',()=>{
  assert.equal(loadConfig({}).publicAccess.enabled,false);assert.equal(loadConfig({}).publicAccess.aiEnabled,false);
  assert.throws(()=>loadConfig({PUBLIC_ACCESS_ENABLED:'true',STORAGE_MODE:'memory'}),/persistent/);
  assert.throws(()=>loadConfig({PUBLIC_ACCESS_ENABLED:'true',HOST:'0.0.0.0',API_TOKEN:'a'.repeat(24),SESSION_COOKIE_SECURE:'false'}),/Insecure/);
  assert.throws(()=>loadConfig({PUBLIC_ACCESS_ENABLED:'true',PUBLIC_AI_ENABLED:'true',OPENAI_API_KEY:'mock'}),/pricing/);
  assert.throws(()=>loadConfig({PUBLIC_ACCESS_ENABLED:'true',ADMIN_ACCESS_KEY:'x'.repeat(32),API_TOKEN:'x'.repeat(32)}),/independent/);
  assert.throws(()=>loadConfig({PUBLIC_ACCESS_ENABLED:'true'}),/ADMIN_ACCESS_KEY/);
});

test('direct and confirmed research cannot bypass the provider allowance',async t=>{
  const {app,dir}=await fixture(t,{PUBLIC_AI_REQUESTS_PER_DAY:'2'});
  // Override with a mocked live provider; no OpenAI SDK or external request occurs.
  await app.close();
  const cfg=config(dir,{PUBLIC_AI_REQUESTS_PER_DAY:'2',RESEARCH_MODE:'live'});
  let searches=0;
  const research=createSearchProvider({mode:'demo',model:'mock',timeoutMs:1000});
  const live=await buildApp({config:cfg,planner:local,search:{mode:'live',search:async(input,project)=>{searches++;return research.search(input,project);}}});t.after(()=>live.close());
  const v=await visitor(live);const p=await create(live,v);
  const proposed=await request(live,v,`/api/projects/${p.id}/assistant`,'POST',{message:'Research moving services'});assert.equal(proposed.statusCode,200,proposed.body);
  const action=proposed.json().proposedActions.find((a:{command:{type:string}})=>a.command.type==='research_services');assert(action);
  const confirmed=await request(live,v,`/api/projects/${p.id}/actions/${action.id}/confirm`,'POST',{approved:true});assert.equal(confirmed.json().error.code,'AI_QUOTA_EXCEEDED');
  const direct=await request(live,v,`/api/projects/${p.id}/research`,'POST',{category:'moving',location:'Turku'});assert.equal(direct.json().error.code,'AI_QUOTA_EXCEEDED');assert.equal(searches,0);
});

test('per-session and global concurrent provider reservations are atomic',async t=>{
  const {cfg}=await fixture(t);const store=new SecurityStore({...cfg.publicAccess,dbPath:cfg.publicAccess.dbPath+'.concurrency'});t.after(()=>store.close());
  const users=[0,1,2,3].map(i=>store.createSession('anonymous','ip'+i).principal);
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const active=users.slice(0,3).map(p=>store.meter(p,{},async()=>{await gate;return {usage:{input_tokens:1,output_tokens:1}};}));
  await assert.rejects(store.meter(users[0]!,{},async()=>({})),e=>(e as {code:string}).code==='AI_BUSY');
  await assert.rejects(store.meter(users[3]!,{},async()=>({})),e=>(e as {code:string}).code==='AI_BUSY');
  release();await Promise.all(active);await store.meter(users[3]!,{},async()=>({}));
});

test('real HTTP cookies, CSRF, listing and updates enforce session ownership',async t=>{
  const {app}=await fixture(t);const base=await app.listen({host:'127.0.0.1',port:0});
  const start=await fetch(base+'/api/session',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});assert.equal(start.status,200);
  const info=await start.json() as SessionResponse;const cookie=start.headers.get('set-cookie')!.split(';')[0]!;
  const headers={origin,cookie,'content-type':'application/json','x-csrf-token':info.csrfToken!,'idempotency-key':randomUUID()};
  const created=await fetch(base+'/api/projects',{method:'POST',headers,body:JSON.stringify({message:'Travel to Rome with EUR 900'})});assert.equal(created.status,201);const {project}=await created.json() as {project:{id:string}};
  const read=await fetch(base+'/api/projects/'+project.id,{headers:{cookie}});assert.equal(read.status,200);
  const forbidden=await fetch(base+'/api/projects/'+project.id,{method:'PATCH',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({title:'bad'})});assert.equal(forbidden.status,403);
  assert.equal((await fetch(base+'/api/projects/'+project.id,{method:'PATCH',headers,body:JSON.stringify({title:'Private holiday'})})).status,200);
  const listed=await fetch(base+'/api/projects',{headers:{cookie}});assert.equal((await listed.json() as {projects:unknown[]}).projects.length,1);
});

test('disabling public mode cannot expose public-owned files through the legacy token',async t=>{
  const {app,cfg}=await fixture(t);const v=await visitor(app),p=await create(app,v);await app.close();
  const locked=await buildApp({config:{...cfg,apiToken:'fixture-old-shared-access-token',publicAccess:{...cfg.publicAccess,enabled:false}},planner:local});t.after(()=>locked.close());
  const r=await locked.inject({url:`/api/projects/${p.id}`,headers:{authorization:'Bearer fixture-old-shared-access-token'}});assert.equal(r.statusCode,404);
});

test('the real research SDK pipeline meters search and extraction separately without network traffic',async t=>{
  const {app,dir}=await fixture(t);await app.close();
  let calls=0;
  t.mock.method(Responses.prototype,'create',async()=>{
    calls++;
    if(calls===1)return {status:'completed',usage:{input_tokens:100,output_tokens:50},output:[
      {type:'web_search_call',status:'completed',action:{type:'search',sources:[{type:'url',url:'https://shop-a.fi/chair'}]}},
      {type:'message',role:'assistant',content:[{type:'output_text',text:'Chair Alpha [source]',annotations:[{type:'url_citation',url:'https://shop-a.fi/chair',title:'Fixture',start_index:12,end_index:20}]}]},
    ]};
    return {status:'completed',usage:{input_tokens:200,output_tokens:10},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({offers:[]}),annotations:[]}]}]};
  });
  const live=await buildApp({config:config(dir,{RESEARCH_MODE:'live'}),planner:local});t.after(()=>live.close());
  const v=await visitor(live),p=await create(live,v);
  const found=await request(live,v,`/api/projects/${p.id}/research`,'POST',{category:'chairs',location:'Turku'});assert.equal(found.statusCode,200,found.body);assert.equal(calls,2);
  const usage=(await request(live,v,'/api/session')).json().usage;assert.equal(usage.used,3,'one creation plus two actual research calls');
});

test('provider failure preserves confirmed facts while charging a conservative reservation',async t=>{
  const planner={...local,assistant:async()=>{throw new AppError('AI_UNAVAILABLE','Fixture provider failure',503);}};
  const {app}=await fixture(t,{},planner);const v=await visitor(app),p=await create(app,v);
  const failed=await request(app,v,`/api/projects/${p.id}/assistant`,'POST',{message:'My budget is EUR 3000.'});assert.equal(failed.statusCode,503);
  assert.equal((await request(app,v,`/api/projects/${p.id}`)).json().project.budget.totalMinor,300000);
  assert.equal((await request(app,v,'/api/session')).json().usage.used,2);
});

test('public paid-AI kill switch rejects before dispatch and admin budget remains bounded',async t=>{
  let dispatched=0;const planner={...local,createProject:async(input:Parameters<Planner['createProject']>[0])=>{dispatched++;return local.createProject(input);}};
  const {app,cfg}=await fixture(t,{PUBLIC_AI_ENABLED:'false'},planner);const v=await visitor(app);
  const stopped=await request(app,v,'/api/projects','POST',{message:'Move to Turku'});assert.equal(stopped.json().error.code,'PUBLIC_AI_DISABLED');assert.equal(dispatched,0);
  const store=new SecurityStore({...cfg.publicAccess,adminBudget:0,dbPath:cfg.publicAccess.dbPath+'.admin-budget'});t.after(()=>store.close());const admin=store.createSession('admin','fixture');
  await assert.rejects(store.meter(admin.principal,{},async()=>{dispatched++;}),e=>(e as {code:string}).code==='GLOBAL_AI_BUDGET_EXCEEDED');assert.equal(dispatched,0);
});
