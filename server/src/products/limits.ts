import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {AppError} from '../errors.js';
/** Separate zero-OpenAI provider allowance. SQLite reservations survive restart; failed dispatched requests count. */
export class ProductRequestLimiter{
 private db:DatabaseSync;
 constructor(file:string,private personal=20,private global=100,private now=Date.now){mkdirSync(path.dirname(file),{recursive:true,mode:0o700});this.db=new DatabaseSync(file);chmodSync(file,0o600);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS product_requests(id TEXT PRIMARY KEY,scope TEXT NOT NULL,day TEXT NOT NULL,status TEXT NOT NULL,started INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS product_requests_day ON product_requests(day,scope);`);}
 close(){this.db.close();}
 status(scope?:string){
  const day=new Date(this.now()).toISOString().slice(0,10);
  const total=Number(this.db.prepare('SELECT COUNT(*) AS n FROM product_requests WHERE day=?').get(day)?.n??0);
  const pending=Number(this.db.prepare("SELECT COUNT(*) AS n FROM product_requests WHERE status='pending'").get()?.n??0);
  const personal=scope?Number(this.db.prepare('SELECT COUNT(*) AS n FROM product_requests WHERE day=? AND scope=?').get(day,createHash('sha256').update(scope).digest('hex'))?.n??0):null;
  return {day,requests:total,limit:this.global,pending,personalRequests:personal,personalLimit:this.personal,timezone:'UTC',countsDispatchedFailures:true};
 }
 async run<T>(scope:string,dispatch:()=>Promise<T>):Promise<T>{
  const now=this.now(),day=new Date(now).toISOString().slice(0,10),key=createHash('sha256').update(scope).digest('hex'),id=randomUUID();
  this.db.exec('BEGIN IMMEDIATE');try{
   this.db.prepare("UPDATE product_requests SET status='interrupted' WHERE status='pending' AND started<?").run(now-60000);
   this.db.prepare("DELETE FROM product_requests WHERE started<? AND status<>'pending'").run(now-7*86400000);
   const count=(sql:string,...args:(string|number)[])=>Number(this.db.prepare(sql).get(...args)?.n??0);
   if(count('SELECT COUNT(*) AS n FROM product_requests WHERE day=?',day)>=this.global||count('SELECT COUNT(*) AS n FROM product_requests WHERE day=? AND scope=?',day,key)>=this.personal)throw new AppError('PRODUCT_QUOTA_EXCEEDED','The daily product API allowance is used. Saved results remain available.',429);
   if(count("SELECT COUNT(*) AS n FROM product_requests WHERE status='pending'")>=3||count("SELECT COUNT(*) AS n FROM product_requests WHERE status='pending' AND scope=?",key)>=1)throw new AppError('PRODUCT_BUSY','A product request is already running. Please wait.',429);
   this.db.prepare('INSERT INTO product_requests VALUES(?,?,?,?,?)').run(id,key,day,'pending',now);this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
  try{const result=await dispatch();this.db.prepare("UPDATE product_requests SET status='completed' WHERE id=?").run(id);return result;}catch(e){this.db.prepare("UPDATE product_requests SET status='failed' WHERE id=?").run(id);throw e;}
 }
}
