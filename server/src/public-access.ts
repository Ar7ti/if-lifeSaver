import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Config } from './config.js';
import type { ProjectRepository } from './repository.js';
import { accessContext, type Principal } from './access-context.js';
import { csrfFor, equalSecret, hash, SecurityStore } from './security-store.js';
import { AppError } from './errors.js';

export function registerPublicAccess(app:FastifyInstance,config:Config,repository:ProjectRepository,store:SecurityStore|null){
  const credentials=new WeakMap<FastifyRequest,{principal:Principal;credential:string}>();
  const operations=new WeakMap<FastifyRequest,{principal:Principal;key:string}>();
  const cookieName=(admin=false)=>`${config.publicAccess.secureCookie?'__Host-lifesim':'lifesim-dev'}${admin?'-admin':''}`;
  function credential(request:FastifyRequest,admin=false){
    const values=(request.headers.cookie??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookieName(admin)+'='));
    return values.length===1?values[0]!.slice(cookieName(admin).length+1):undefined;
  }
  function identify(request:FastifyRequest){
    for(const admin of [true,false]){const token=credential(request,admin);const principal=store?.authenticate(token);if(principal&&principal.role===(admin?'admin':'anonymous'))return {credential:token!,principal};}
    return null;
  }
  function setCookie(reply:FastifyReply,token:string,principal:Principal,clear=false){
    reply.header('Set-Cookie',`${cookieName(principal.role==='admin')}=${clear?'':token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear?0:Math.max(0,Math.floor((principal.expiresAt-store!.now())/1000))}${config.publicAccess.secureCookie?'; Secure':''}`);
  }
  const origin=(request:FastifyRequest)=>{
    if(typeof request.headers.origin!=='string'||!config.origins.includes(request.headers.origin))throw new AppError('CSRF_REJECTED','This request must come from the application.',403);
    if(request.headers['sec-fetch-site']==='cross-site')throw new AppError('CSRF_REJECTED','Cross-site requests are not supported.',403);
  };
  const response=(entry:ReturnType<typeof identify>)=>({mode:config.publicAccess.enabled?'public' as const:'legacy' as const,session:entry?{id:entry.principal.id,role:entry.principal.role,expiresAt:new Date(entry.principal.expiresAt).toISOString()}:null,csrfToken:entry?csrfFor(entry.credential):null,usage:entry?store!.usage(entry.principal):null});
  app.addHook('onRequest',(request,reply,done)=>{
    if(!store){
      if(request.url.startsWith('/api/admin/')||request.url.startsWith('/api/session/')||request.url==='/api/session'&&request.method!=='GET'){done(new AppError('PUBLIC_ACCESS_DISABLED','Public access has not been enabled.',503));return;}
      done();return;
    }
    reply.header('Cache-Control','no-store');
    const pathname=request.url.split('?')[0];
    if(pathname==='/api/health'||request.method==='OPTIONS'){done();return;}
    const entry=identify(request);
    const bootstrap=pathname==='/api/session'&&['GET','POST'].includes(request.method)||pathname==='/api/admin/login'&&request.method==='POST';
    if(!entry&&!bootstrap){done(new AppError('SESSION_REQUIRED','Your private session is missing or expired. Reload to reconnect.',401));return;}
    if(!['GET','HEAD','OPTIONS'].includes(request.method)){
      try{origin(request);if(!String(request.headers['content-type']??'').startsWith('application/json'))throw new AppError('CSRF_REJECTED','JSON requests are required.',403);
        if(!bootstrap&&(!entry||typeof request.headers['x-csrf-token']!=='string'||!equalSecret(request.headers['x-csrf-token'],csrfFor(entry.credential))))throw new AppError('CSRF_REJECTED','Your session changed. Reload and try again.',403);
      }catch(error){done(error as Error);return;}
    }
    if(pathname?.startsWith('/api/admin/')&&pathname!=='/api/admin/login'&&entry?.principal.role!=='admin'){done(new AppError('NOT_FOUND','Endpoint not found',404));return;}
    if(entry){credentials.set(request,entry);accessContext.run({principal:entry.principal,meter:(body,dispatch)=>store.meter(entry.principal,body,dispatch)},done);}else done();
  });
  app.addHook('preHandler',async request=>{
    if(!store)return;
    const entry=credentials.get(request);if(!entry)return;
    store.throttle('session-minute',entry.principal.id,120,60000);
    // Central guard applies to every current AND future nested project route, before provider work.
    const match=/^\/api\/projects\/([^/?]+)(?:\/|\?|$)/.exec(request.url);
    if(match){await repository.get(z.string().uuid().parse(match[1]));if(entry.principal.role==='admin')store.audit(entry.principal,request.method,match[1]!);}
    const pathname=request.url.split('?')[0]!;
    const expensive=request.method==='POST'&&(pathname==='/api/projects'||/\/(?:assistant|research|confirm|quote)$/.test(pathname));
    if(expensive){
      const key=z.string().uuid().safeParse(request.headers['idempotency-key']);
      if(!key.success)throw new AppError('IDEMPOTENCY_REQUIRED','A unique request ID is required.',400);
      store.beginRequest(entry.principal,key.data,hash(request.method+pathname));
      operations.set(request,{principal:entry.principal,key:key.data});
      if(pathname==='/api/projects'&&entry.principal.role!=='admin'&&(await repository.list!()).length>=config.publicAccess.maxProjects)throw new AppError('WORKSPACE_LIMIT','Your private session has reached its workspace limit.',429);
    }
  });
  app.addHook('onResponse',async request=>{const operation=operations.get(request);if(operation)store!.finishRequest(operation.principal,operation.key);});
  app.get('/api/session',async(_request,reply)=>{reply.header('Cache-Control','no-store');return response(store?identify(_request):null);});
  app.post('/api/session',async(request,reply)=>{
    if(!store)throw new AppError('PUBLIC_ACCESS_DISABLED','Public access has not been enabled.',503);
    z.object({}).strict().parse(request.body);
    const existing=identify(request);if(existing)return response(existing);
    const created=store.createSession('anonymous',request.ip);setCookie(reply,created.credential,created.principal);
    return response(created);
  });
  app.post('/api/session/renew',async(request,reply)=>{
    z.object({}).strict().parse(request.body);const entry=credentials.get(request)!;
    const renewed=store!.renew(entry.principal);setCookie(reply,renewed.credential,renewed.principal);return response(renewed);
  });
  app.delete('/api/session',async(request,reply)=>{
    z.object({}).strict().parse(request.body);const entry=credentials.get(request)!;
    store!.revoke(entry.principal.id);setCookie(reply,'',entry.principal,true);return {ok:true};
  });
  app.post('/api/admin/login',async(request,reply)=>{
    if(!store)throw new AppError('NOT_FOUND','Endpoint not found',404);
    store.throttle('admin-login',request.ip,5);
    const {key}=z.object({key:z.string().min(1).max(512)}).strict().parse(request.body);
    if(!config.publicAccess.adminKey||!equalSecret(key,config.publicAccess.adminKey))throw new AppError('UNAUTHORIZED','Administrator sign-in failed.',401);
    const previous=identify(request);if(previous?.principal.role==='admin')store.revoke(previous.principal.id);
    const created=store.createSession('admin',request.ip);setCookie(reply,created.credential,created.principal);store.audit(created.principal,'login');return response(created);
  });
  app.post('/api/admin/logout',async(request,reply)=>{
    z.object({}).strict().parse(request.body);const entry=credentials.get(request)!;
    store!.audit(entry.principal,'logout');store!.revoke(entry.principal.id);setCookie(reply,'',entry.principal,true);return {ok:true};
  });
  app.get('/api/admin/status',async()=>store!.status());
  app.patch('/api/admin/public-ai',async request=>{
    const {enabled}=z.object({enabled:z.boolean()}).strict().parse(request.body);
    store!.setEnabled(enabled,credentials.get(request)!.principal);return store!.status();
  });
  const list=async()=>({projects:(await repository.list!()).map(p=>({id:p.id,title:p.title,location:p.location,totalMinor:p.budget.totalMinor,committedMinor:p.budget.committedMinor,tasksDone:p.tasks.filter(t=>t.status==='done').length,tasksTotal:p.tasks.length,updatedAt:p.updatedAt}))});
  app.get('/api/projects',async()=>{if(!store)throw new AppError('NOT_FOUND','Endpoint not found',404);return list();});
  app.get('/api/admin/projects',async()=>{store!.audit(accessContext.getStore()!.principal,'list-projects');return list();});
}
