import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Config } from './config.js';
import type { Principal } from './access-context.js';
import { AppError } from './errors.js';

type Settings = Config['publicAccess'];
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const equalSecret = (a: string, b: string) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
export const csrfFor = (credential: string) => createHmac('sha256',credential).update('life-simulator-csrf-v1').digest('base64url');
export const utcDay = (now: number) => new Date(now).toISOString().slice(0,10);
const micros = (usd: number) => Math.ceil(usd*1_000_000);

/** One API process; SQLite transactions protect allowance reservations. No prompts or provider payloads are stored. */
export class SecurityStore {
  readonly db: DatabaseSync;
  constructor(readonly settings: Settings, readonly now: () => number = Date.now) {
    mkdirSync(path.dirname(settings.dbPath),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(settings.dbPath);
    chmodSync(settings.dbPath,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, credential_hash TEXT UNIQUE NOT NULL, role TEXT NOT NULL CHECK(role IN ('anonymous','admin')), created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS flags(name TEXT PRIMARY KEY,value INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS throttle(scope TEXT NOT NULL,identity TEXT NOT NULL,bucket INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(scope,identity,bucket));
      CREATE TABLE IF NOT EXISTS requests(session_id TEXT NOT NULL,key TEXT NOT NULL,fingerprint TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(session_id,key));
      CREATE TABLE IF NOT EXISTS charges(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,role TEXT NOT NULL,day TEXT NOT NULL,model TEXT NOT NULL,reserved INTEGER NOT NULL,charged INTEGER NOT NULL,status TEXT NOT NULL,input_tokens INTEGER,output_tokens INTEGER,search_calls INTEGER,created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS charges_day ON charges(day,role,session_id);
      CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,admin_id TEXT NOT NULL,event TEXT NOT NULL,resource TEXT,created_at INTEGER NOT NULL);
      UPDATE requests SET status='interrupted' WHERE status='pending';
      UPDATE charges SET status='interrupted' WHERE status='pending';`);
    this.cleanup();
  }
  close(){this.db.close();}
  private transaction<T>(fn:()=>T):T {
    this.db.exec('BEGIN IMMEDIATE');
    try {const result=fn();this.db.exec('COMMIT');return result;}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  cleanup(){
    const now=this.now();
    this.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
    this.db.prepare('DELETE FROM throttle WHERE bucket<?').run(now-48*3600000);
    this.db.prepare('DELETE FROM requests WHERE created_at<? AND status<>?').run(now-7*86400000,'pending');
    // Billing history is bounded, but today's reservations are never discarded.
    this.db.prepare('DELETE FROM charges WHERE created_at<? AND status<>?').run(now-90*86400000,'pending');
  }
  throttle(scope:string,identity:string,max:number,windowMs=3600000){
    const bucket=Math.floor(this.now()/windowMs)*windowMs;
    this.transaction(()=>{
      const row=this.db.prepare('SELECT count FROM throttle WHERE scope=? AND identity=? AND bucket=?').get(scope,hash(identity),bucket);
      if(Number(row?.count??0)>=max)throw new AppError('RATE_LIMITED','Too many attempts. Please try again later.',429);
      this.db.prepare('INSERT INTO throttle VALUES(?,?,?,1) ON CONFLICT(scope,identity,bucket) DO UPDATE SET count=count+1').run(scope,hash(identity),bucket);
    });
  }
  createSession(role:Principal['role'],ip:string){
    if(role==='anonymous'){
      this.throttle('new-session-ip',ip,this.settings.newSessions);
      this.throttle('new-session-global','all',this.settings.globalNewSessions);
    }
    this.cleanup();
    const credential=randomBytes(32).toString('base64url');
    const principal:Principal={id:randomUUID(),role,expiresAt:this.now()+1000*(role==='admin'?this.settings.adminTtl:this.settings.sessionTtl)};
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(principal.id,hash(credential),role,this.now(),principal.expiresAt);
    return {credential,principal};
  }
  authenticate(credential:string|undefined):Principal|null {
    if(!credential||!/^[A-Za-z0-9_-]{43}$/.test(credential))return null;
    const row=this.db.prepare('SELECT id,role,expires_at FROM sessions WHERE credential_hash=? AND expires_at>?').get(hash(credential),this.now());
    return row?{id:String(row.id),role:row.role as Principal['role'],expiresAt:Number(row.expires_at)}:null;
  }
  revoke(id:string){this.db.prepare('DELETE FROM sessions WHERE id=?').run(id);}
  renew(principal:Principal){
    const credential=randomBytes(32).toString('base64url');
    const expiresAt=principal.role==='admin'?principal.expiresAt:this.now()+1000*this.settings.sessionTtl;
    const result=this.db.prepare('UPDATE sessions SET credential_hash=?,expires_at=? WHERE id=? AND expires_at>?').run(hash(credential),expiresAt,principal.id,this.now());
    if(!result.changes)throw new AppError('SESSION_EXPIRED','Your session expired. Reload to start a new session.',401);
    return {credential,principal:{...principal,expiresAt}};
  }
  enabled(){return this.settings.aiEnabled&&this.db.prepare('SELECT value FROM flags WHERE name=?').get('public-ai')?.value!==0;}
  setEnabled(enabled:boolean,admin:Principal){
    this.db.prepare('INSERT INTO flags VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run('public-ai',enabled?1:0);
    this.audit(admin,'public-ai-switch',String(enabled));
  }
  audit(admin:Principal,event:string,resource:string|null=null){this.db.prepare('INSERT INTO audit VALUES(?,?,?,?,?)').run(randomUUID(),admin.id,event,resource,this.now());}
  usage(principal:Principal){
    const used=Number(this.db.prepare('SELECT COUNT(*) AS n FROM charges WHERE session_id=? AND day=?').get(principal.id,utcDay(this.now()))?.n??0);
    return {used,limit:principal.role==='admin'?null:this.settings.dailyCalls,remaining:principal.role==='admin'?null:Math.max(0,this.settings.dailyCalls-used),resetsAt:new Date(Date.parse(utcDay(this.now()))+86400000).toISOString(),publicAiEnabled:this.enabled()};
  }
  status(){
    const rows=this.db.prepare('SELECT role,COUNT(*) AS calls,SUM(charged) AS chargedMicroUsd,SUM(CASE WHEN status=\'pending\' THEN 1 ELSE 0 END) AS pending FROM charges WHERE day=? GROUP BY role').all(utcDay(this.now()));
    return {day:utcDay(this.now()),publicAiEnabled:this.enabled(),dailyBudgetUsd:this.settings.dailyBudget,adminDailyBudgetUsd:this.settings.adminBudget,usage:rows,costsAreEstimates:true};
  }
  beginRequest(principal:Principal,key:string,fingerprint:string){
    this.transaction(()=>{
      this.db.prepare('UPDATE requests SET status=? WHERE status=? AND created_at<?').run('interrupted','pending',this.now()-600000);
      if(this.db.prepare('SELECT 1 FROM requests WHERE session_id=? AND key=?').get(principal.id,key))throw new AppError('DUPLICATE_REQUEST','This request was already submitted. Reload your workspace before trying a new request.',409);
      const pending=Number(this.db.prepare('SELECT COUNT(*) AS n FROM requests WHERE session_id=? AND status=?').get(principal.id,'pending')?.n??0);
      if(pending>=this.settings.sessionConcurrency)throw new AppError('AI_BUSY','Another request is still running. Please wait.',429);
      this.db.prepare('INSERT INTO requests VALUES(?,?,?,?,?)').run(principal.id,key,fingerprint,'pending',this.now());
    });
  }
  finishRequest(principal:Principal,key:string){this.db.prepare('UPDATE requests SET status=? WHERE session_id=? AND key=?').run('done',principal.id,key);}
  async meter<T>(principal:Principal,body:unknown,dispatch:()=>Promise<T>):Promise<T>{
    const settings=this.settings;
    if(principal.role==='anonymous'&&!this.enabled())throw new AppError('PUBLIC_AI_DISABLED','Free AI is temporarily paused. Your saved workspaces remain available.',503);
    if(settings.inputRate===undefined||settings.outputRate===undefined||settings.searchRate===undefined)throw new AppError('AI_COST_CONFIG','Paid AI pricing has not been configured by the administrator.',503);
    const params=body as {model?:string;max_output_tokens?:number;max_tool_calls?:number;tools?:unknown[]};
    const bytes=Buffer.byteLength(JSON.stringify(body));
    if(bytes+4096>settings.reservedInputTokens)throw new AppError('AI_CONTEXT_LIMIT','This plan is too large for the public AI allowance. Shorten the request.',413);
    const tools=params.tools?.length?params.max_tool_calls??3:0;
    const reserved=Math.max(1,micros((settings.reservedInputTokens*settings.inputRate+(params.max_output_tokens??10000)*settings.outputRate)/1_000_000+tools*settings.searchRate));
    const id=randomUUID(),day=utcDay(this.now());
    this.transaction(()=>{
      if(!this.authenticatePrincipal(principal))throw new AppError('SESSION_EXPIRED','Your session expired. Reload to continue.',401);
      const usage=this.usage(principal);
      if(principal.role==='anonymous'&&usage.remaining===0)throw new AppError('AI_QUOTA_EXCEEDED',"You've used today's free AI requests. Your workspaces are still available. Come back after the daily UTC reset.",429,{resetsAt:usage.resetsAt});
      const globalPending=Number(this.db.prepare('SELECT COUNT(*) AS n FROM charges WHERE status=?').get('pending')?.n??0);
      const personalPending=Number(this.db.prepare('SELECT COUNT(*) AS n FROM charges WHERE status=? AND session_id=?').get('pending',principal.id)?.n??0);
      if(globalPending>=settings.globalConcurrency||personalPending>=settings.sessionConcurrency)throw new AppError('AI_BUSY','AI capacity is busy. Please try again shortly.',429);
      const charged=Number(this.db.prepare('SELECT COALESCE(SUM(charged),0) AS n FROM charges WHERE day=? AND role=?').get(day,principal.role)?.n??0);
      const budget=micros(principal.role==='admin'?settings.adminBudget:settings.dailyBudget);
      if(charged+reserved>budget)throw new AppError('GLOBAL_AI_BUDGET_EXCEEDED','The daily AI allowance is exhausted. Saved workspaces and manual tools remain available.',429);
      this.db.prepare('INSERT INTO charges VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,principal.id,principal.role,day,params.model??'configured-model',reserved,reserved,'pending',null,null,null,this.now());
    });
    // Once dispatched, failures/timeouts retain the full estimate: a failed HTTP response does not prove no provider charge.
    try{
      const result=await dispatch();
      const response=result as {usage?:{input_tokens?:number;output_tokens?:number};output?:{type?:string;action?:{type?:string}}[]};
      const input=response?.usage?.input_tokens,output=response?.usage?.output_tokens;
      const searches=response?.output?.filter(x=>x.type==='web_search_call').length??0;
      const known=Number.isSafeInteger(input)&&Number.isSafeInteger(output)&&input!>=0&&output!>=0;
      const charged=known?micros((input!*settings.inputRate+output!*settings.outputRate)/1_000_000+searches*settings.searchRate):reserved;
      this.db.prepare('UPDATE charges SET status=?,charged=?,input_tokens=?,output_tokens=?,search_calls=? WHERE id=?').run(known?'reconciled':'estimated',charged,input??null,output??null,searches,id);
      return result;
    }catch(error){this.db.prepare('UPDATE charges SET status=? WHERE id=?').run('failed-estimated',id);throw error;}
  }
  private authenticatePrincipal(principal:Principal){return Boolean(this.db.prepare('SELECT 1 FROM sessions WHERE id=? AND expires_at>?').get(principal.id,this.now()));}
}
