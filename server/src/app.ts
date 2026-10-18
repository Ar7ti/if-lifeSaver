import path from 'node:path';
import {EbayBrowseProvider} from './products/ebay.js';
import {ProductRequestLimiter} from './products/limits.js';
import {createProductResearchRouter} from './products/router.js';
import {accessContext} from './access-context.js';
import type {ProductProvider} from './products/types.js';
import { ReplaceCartRequestSchema, UndoCartReplacementSchema, ApplyScenarioRequestSchema } from '../../shared/contracts/index.js';
import { movingProtectionTimeline } from './protection-timeline.js';
import { ProtectionMilestoneIdSchema, ProtectionMilestonePatchSchema } from '../../shared/contracts/index.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ZodError, z } from 'zod';
import { CONTRACT_VERSION, IdSchema, ResearchFeedbackInputSchema, CreateProjectRequestSchema, ProjectPatchSchema, AssistantRequestSchema, ResearchRequestSchema, AddCartItemRequestSchema, CartItemPatchSchema, WorkspacePatchSchema, SellerMessageRequestSchema, ConfirmActionRequestSchema, type LifeProject } from '../../shared/contracts/index.js';
import { loadConfig, type Config } from './config.js';
import { LocalProjectRepository, MemoryProjectRepository, type ProjectRepository } from './repository.js';
import { createPlanner, type Planner } from './ai.js';
import { createSearchProvider, type SearchProvider } from './research.js';
import { ProjectService } from './service.js';
import { AppError } from './errors.js';
import { HomeInsuranceDraftSchema, IfQuoteRequestSchema, AddIfExpenseRequestSchema } from '../../shared/contracts/index.js';
import { createIfInsuranceProvider, containsFinnishIdentityNumber, type IfInsuranceProvider } from './if-insurance.js';
import { createCarInsuranceProvider, type CarInsuranceProvider } from './car-insurance.js';
import { ProtectionUpdateSchema, CarInsuranceDraftSchema, CarQuoteRequestSchema, ProtectionBudgetRequestSchema } from '../../shared/contracts/index.js';
import { SecurityStore } from './security-store.js';
import { registerPublicAccess } from './public-access.js';
import { paidProviderCall } from './access-context.js';

export interface AppDependencies {config?:Config; repository?:ProjectRepository; planner?:Planner; search?:SearchProvider;productProviders?:ProductProvider[]; ifInsurance?:IfInsuranceProvider;carInsurance?:CarInsuranceProvider}
const ProjectParams = z.object({projectId:IdSchema}).strict();
const ItemParams = ProjectParams.extend({itemId:IdSchema});
const ActionParams = ProjectParams.extend({actionId:IdSchema});
function cart(project: LifeProject) {return {items:project.cart,budget:project.budget,revision:project.revision};}
export async function buildApp(deps: AppDependencies={}) {
  const config=deps.config??loadConfig();
  const repository=deps.repository??(config.storageMode==='local'?new LocalProjectRepository(config.dataDir):new MemoryProjectRepository());
  let planner=deps.planner??createPlanner({mode:config.aiMode,apiKey:config.apiKey,model:config.model,timeoutMs:config.aiTimeoutMs});
  let search=deps.search??createSearchProvider({mode:config.researchMode,apiKey:config.apiKey,model:config.model,timeoutMs:config.researchTimeoutMs,pricing:config.publicAccess.inputRate!==undefined&&config.publicAccess.outputRate!==undefined&&config.publicAccess.searchRate!==undefined?{input:config.publicAccess.inputRate,output:config.publicAccess.outputRate,search:config.publicAccess.searchRate}:undefined,diagnose:event=>app.log.info({research:event},'research_diagnostic')});
  // Injected test providers exercise the identical allowance boundary without network calls.
  if(config.publicAccess.enabled&&deps.planner&&config.aiMode==='openai'){
    const original=planner;planner={createProject:input=>paidProviderCall({model:config.model},()=>original.createProject(input)),assistant:(project,input)=>paidProviderCall({model:config.model},()=>original.assistant(project,input)),...(original.interpret?{interpret:(project:LifeProject,input:import('../../shared/contracts/index.js').AssistantRequest)=>paidProviderCall({model:config.model},()=>original.interpret!(project,input))}:{})};
  }
  if(config.publicAccess.enabled&&deps.search&&search.mode==='live'){const original=search;search={mode:'live',search:(input,project)=>paidProviderCall({model:config.model,max_tool_calls:3,tools:[{type:'web_search'}]},()=>original.search(input,project))};}
  await repository.ready();
  if(config.publicAccess.enabled){if(!repository.enableAccessControl||!repository.list)throw new Error('Public access requires an ownership-aware repository');repository.enableAccessControl(config.publicAccess.maxProjects);}
  const productLimiter=config.products.enabled?new ProductRequestLimiter(path.join(config.dataDir,'product-usage.sqlite'),config.products.dailyRequests,config.products.globalDailyRequests):null;
  const productProviders=deps.productProviders??[new EbayBrowseProvider(config.products,{limit:(scope,dispatch)=>productLimiter?productLimiter.run(scope,dispatch):dispatch(),allow:()=>!config.publicAccess.enabled||accessContext.getStore()?.principal.role==='admin'||security?.enabled()===true,diagnose:event=>app.log.info({product:event},'product_provider_diagnostic')})];
  search=createProductResearchRouter(search,productProviders,{diagnose:event=>app.log.info({product:event},'product_research_diagnostic')});
  const service=new ProjectService(repository,planner,search);
  const ifInsurance=deps.ifInsurance??createIfInsuranceProvider(config.ifInsurance);
  const carInsurance=deps.carInsurance??createCarInsuranceProvider(config.ifInsurance);
  // A quiet socket must outlive the maximum bounded provider call (120 seconds).
  // connectionTimeout applies while an async handler is waiting, too.
  const app=Fastify({bodyLimit:32*1024,requestTimeout:125000,connectionTimeout:130000,logger:config.logLevel==='silent'?false:{level:config.logLevel,serializers:{req:(request:{method?:string;url?:string})=>({method:request.method,url:request.url?.split('?')[0]})},redact:['req.headers.authorization','req.headers.cookie','req.headers["x-csrf-token"]','req.body','res.body','res.headers["set-cookie"]']},trustProxy:false});
  await app.register(helmet);
  await app.register(cors,{origin:config.origins,methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization']});
  await app.register(rateLimit,{max:120,timeWindow:'1 minute',errorResponseBuilder:()=>new AppError('RATE_LIMITED','Too many requests; please try again shortly.',429)});
  app.addHook('onRequest',async request=>{
    const origin=request.headers.origin;
    if(origin&&!config.origins.includes(origin))throw new AppError('ORIGIN_NOT_ALLOWED','Request origin is not allowed',403);
    if(!config.publicAccess.enabled&&config.apiToken&&!['/api/health','/api/session'].includes(request.url.split('?')[0]!)&&request.method!=='OPTIONS'){
      const digest=(s:string)=>createHash('sha256').update(s).digest();
      if(!timingSafeEqual(digest(request.headers.authorization??''),digest(`Bearer ${config.apiToken}`)))throw new AppError('UNAUTHORIZED','A valid API access token is required',401);
    }
  });
  const security=config.publicAccess.enabled?new SecurityStore(config.publicAccess):null;
  registerPublicAccess(app,config,repository,security);
  app.addHook('onClose',async()=>{security?.close();productLimiter?.close();});
  app.setErrorHandler((error,request,reply)=>{
    // Contracts may be consumed from a separate package with its own Zod instance.
    if(error instanceof ZodError || (error instanceof Error && error.name==='ZodError' && Array.isArray((error as ZodError).issues))) {
      return reply.code(400).send({error:{code:'VALIDATION_ERROR',message:'Invalid request',details:{issues:(error as ZodError).issues.map(i=>({path:i.path.join('.'),message:i.message}))}}});
    }
    if(error instanceof AppError)return reply.code(error.statusCode).send({error:{code:error.code,message:error.message,...(error.details?{details:error.details}:{})}});
    const e=error as {statusCode?:number;code?:string};
    if(e.statusCode===429)return reply.code(429).send({error:{code:'RATE_LIMITED',message:'Too many requests; please try again shortly.'}});
    if(e.statusCode&&e.statusCode>=400&&e.statusCode<500)return reply.code(e.statusCode).send({error:{code:e.statusCode===413?'BODY_TOO_LARGE':'VALIDATION_ERROR',message:e.statusCode===413?'Request body is too large':'Invalid request body'}});
    request.log.error({code:e.code??'UNKNOWN'},'Request failed');
    return reply.code(500).send({error:{code:'INTERNAL_ERROR',message:'The request could not be completed'}});
  });
  app.setNotFoundHandler((_request,reply)=>reply.code(404).send({error:{code:'NOT_FOUND',message:'Endpoint not found'}}));
  app.addHook('preValidation',async request=>{
    // Identity numbers may only enter the isolated quote request, never chat or persisted project data.
    const isQuote=request.method==='POST'&&/^\/api\/projects\/[^/]+\/(?:home-insurance\/quote|protection\/car\/quote)$/.test(request.url);
    const body=isQuote&&request.body&&typeof request.body==='object'?Object.fromEntries(Object.entries(request.body).filter(([key])=>key!=='personalIdentityNumber')):request.body;
    if(containsFinnishIdentityNumber(body))throw new AppError('SENSITIVE_INPUT','Enter identity numbers only in the dedicated If quote field. They cannot be saved in your project or sent to the assistant.',400);
  });
  app.get('/api/products/capabilities',async()=>({providers:productProviders.map(p=>p.getCapabilities()),webResearchAvailable:config.researchMode==='live'}));
  app.get('/api/health',async()=>({status:'ok' as const,ready:true,contractVersion:CONTRACT_VERSION,configuration:{ai:config.aiMode,research:search.mode,storage:repository.mode,authentication:Boolean(config.apiToken),providers:{ai:deps.planner?'injected':config.aiMode==='openai'?'openai_sdk':'local',research:deps.search?'injected':config.researchMode==='live'?'openai_sdk':config.researchMode}}}));
  app.post('/api/projects',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(request,reply)=>{
    const project=await service.create(CreateProjectRequestSchema.parse(request.body));
    return reply.code(201).send({project,workspace:project.workspace,questions:project.questions});
  });
  app.get('/api/projects/:projectId',async request=>({project:await service.get(ProjectParams.parse(request.params).projectId)}));
  app.get('/api/projects/:projectId/protection-timeline',async request=>service.protectionTimeline(ProjectParams.parse(request.params).projectId));
  app.patch('/api/projects/:projectId/protection-timeline/:milestoneId',async request=>{const {projectId,milestoneId}=ProjectParams.extend({milestoneId:ProtectionMilestoneIdSchema}).parse(request.params);const project=await service.protectionMilestone(projectId,milestoneId,ProtectionMilestonePatchSchema.parse(request.body));return {project,timeline:movingProtectionTimeline(project)};});
  app.get('/api/projects/:projectId/home-insurance',async request=>service.homeInsurance(ProjectParams.parse(request.params).projectId,ifInsurance));
  app.get('/api/protection/capabilities',async()=>carInsurance.capabilities());
  app.patch('/api/projects/:projectId/protection',async request=>({project:await service.protectionUpdate(ProjectParams.parse(request.params).projectId,ProtectionUpdateSchema.parse(request.body))}));
  app.patch('/api/projects/:projectId/protection/car/draft',async request=>({project:await service.carDraft(ProjectParams.parse(request.params).projectId,CarInsuranceDraftSchema.partial().strict().parse(request.body))}));
  app.post('/api/projects/:projectId/protection/car/quote',{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(request,reply)=>{reply.header('Cache-Control','no-store');return {project:await service.carQuote(ProjectParams.parse(request.params).projectId,CarQuoteRequestSchema.parse(request.body),carInsurance)};});
  app.post('/api/projects/:projectId/protection/car/expense',async request=>({project:await service.carExpense(ProjectParams.parse(request.params).projectId,ProtectionBudgetRequestSchema.parse(request.body))}));
  app.delete('/api/projects/:projectId/protection/car/expense',async request=>({project:await service.removeCarExpense(ProjectParams.parse(request.params).projectId)}));
  app.patch('/api/projects/:projectId/home-insurance/details',async request=>({project:await service.saveInsuranceDetails(ProjectParams.parse(request.params).projectId,HomeInsuranceDraftSchema.parse(request.body))}));
  app.post('/api/projects/:projectId/home-insurance/quote',{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    const project=await service.requestInsuranceQuote(ProjectParams.parse(request.params).projectId,IfQuoteRequestSchema.parse(request.body),ifInsurance);
    return {project};
  });
  app.post('/api/projects/:projectId/home-insurance/expense',async request=>({project:await service.addInsuranceExpense(ProjectParams.parse(request.params).projectId,AddIfExpenseRequestSchema.parse(request.body))}));
  app.delete('/api/projects/:projectId/home-insurance/expense',async request=>({project:await service.removeInsuranceExpense(ProjectParams.parse(request.params).projectId)}));
  app.patch('/api/projects/:projectId',async request=>({project:await service.patch(ProjectParams.parse(request.params).projectId,ProjectPatchSchema.parse(request.body))}));
  app.post('/api/projects/:projectId/assistant',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async request=>service.assistant(ProjectParams.parse(request.params).projectId,AssistantRequestSchema.parse(request.body)));
  app.post('/api/projects/:projectId/research/:resultId/feedback',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async request=>{
    const {projectId,resultId}=ProjectParams.extend({resultId:IdSchema}).parse(request.params);
    return {project:await service.researchFeedback(projectId,resultId,ResearchFeedbackInputSchema.parse(request.body))};
  });
  app.post('/api/projects/:projectId/research',{config:{rateLimit:{max:8,timeWindow:'1 minute'}}},async request=>service.research(ProjectParams.parse(request.params).projectId,ResearchRequestSchema.parse(request.body)));
  app.post('/api/projects/:projectId/cart/items/:itemId/replace',async request=>{const {projectId,itemId}=ItemParams.parse(request.params);return {project:await service.replaceCart(projectId,itemId,ReplaceCartRequestSchema.parse(request.body))};});
  app.post('/api/projects/:projectId/cart/items/:itemId/undo-replacement',async request=>{const {projectId,itemId}=ItemParams.parse(request.params);return {project:await service.undoCartReplacement(projectId,itemId,UndoCartReplacementSchema.parse(request.body))};});
  app.post('/api/projects/:projectId/scenarios/:scenarioId/apply',async request=>{const {projectId,scenarioId}=ProjectParams.extend({scenarioId:z.enum(['economy','balanced','comfort'])}).parse(request.params);return {project:await service.applyScenario(projectId,scenarioId,ApplyScenarioRequestSchema.parse(request.body))};});
  app.get('/api/projects/:projectId/cart',async request=>cart(await service.get(ProjectParams.parse(request.params).projectId)));
  app.post('/api/projects/:projectId/cart/items',async(request,reply)=>reply.code(201).send(cart(await service.addCart(ProjectParams.parse(request.params).projectId,AddCartItemRequestSchema.parse(request.body)))));
  app.patch('/api/projects/:projectId/cart/items/:itemId',async request=>{const {projectId,itemId}=ItemParams.parse(request.params);return cart(await service.patchCart(projectId,itemId,CartItemPatchSchema.parse(request.body)));});
  app.delete('/api/projects/:projectId/cart/items/:itemId',async request=>{const {projectId,itemId}=ItemParams.parse(request.params);return cart(await service.deleteCart(projectId,itemId));});
  app.post('/api/projects/:projectId/scenarios',async request=>{if(request.body!==undefined)z.object({}).strict().parse(request.body);return {scenarios:(await service.scenarios(ProjectParams.parse(request.params).projectId)).scenarios};});
  app.get('/api/projects/:projectId/scenarios',async request=>({scenarios:(await service.get(ProjectParams.parse(request.params).projectId)).scenarios}));
  app.get('/api/projects/:projectId/risks',async request=>({risks:(await service.get(ProjectParams.parse(request.params).projectId)).risks}));
  app.get('/api/projects/:projectId/workspace',async request=>{const p=await service.get(ProjectParams.parse(request.params).projectId);return {workspace:p.workspace,revision:p.revision};});
  app.patch('/api/projects/:projectId/workspace',async request=>{const p=await service.workspace(ProjectParams.parse(request.params).projectId,WorkspacePatchSchema.parse(request.body));return {workspace:p.workspace,revision:p.revision};});
  app.post('/api/projects/:projectId/seller-message',async request=>service.sellerMessage(ProjectParams.parse(request.params).projectId,SellerMessageRequestSchema.parse(request.body)));
  app.post('/api/projects/:projectId/actions/:actionId/confirm',{config:{rateLimit:{max:12,timeWindow:'1 minute'}}},async request=>{const {projectId,actionId}=ActionParams.parse(request.params);const body=ConfirmActionRequestSchema.parse(request.body);return {project:await service.confirm(projectId,actionId,body.approved,body.expectedRevision)};});
  return app;
}
