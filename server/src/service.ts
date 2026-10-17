import { randomUUID } from 'node:crypto';
import { AgentCommandSchema, LifeProjectSchema, type LifeProject, type ProjectPatch, type WorkspacePatch, type AddCartItemRequest, type CartItemPatch, type AssistantRequest, type AssistantResponse, type ResearchRequest, type SellerMessageRequest, type SellerMessageResponse, type AgentAction, type AgentCommand, type Offer, type CreateProjectRequest } from '../../shared/contracts/index.js';
import type { ProjectRepository } from './repository.js';
import type { Planner } from './ai.js';
import type { SearchProvider } from './research.js';
import { allocateBudgetForPlan, recalculateBudget, simulateScenarios, analyzeRisks } from './finance.js';
import { createWorkspace, patchWorkspace } from './workspace.js';
import { AppError, notFound } from './errors.js';
import { buildScenarioProfile } from './scenario-profile.js';
import { classifyScope } from './scope-policy.js';
import {conversation,appendTurn,extractFacts,groundedInterpretationFacts,pendingClarification,reconcileClarifications,resolveClarification,askClarification,fieldForQuestion,knownField,affirmative,negative,dismisses,normalizePlanningMessage,type Facts} from './conversation.js';

export class ProjectService {
  constructor(readonly repository: ProjectRepository, private planner: Planner, private search: SearchProvider) {}
  private derive(project: LifeProject, revision = project.revision + 1) {
    project.budget = recalculateBudget(project.budget, project.cart);
    project.scenarios = simulateScenarios({...project,revision});
    project.risks = analyzeRisks(project);
  }
  private reconcile(project:LifeProject) {
    const profile=buildScenarioProfile({message:project.originalMessage,scenarioType:project.scenarioType,preferences:project.preferences,location:project.location,totalMinor:project.budget.confirmed?project.budget.totalMinor:undefined});
    project.questions=profile.questions.filter(question=>!project.answeredQuestions?.[question]&&project.conversation?.clarifications.findLast(c=>c.field===fieldForQuestion(question,project))?.status!=='dismissed');
    project.categoryReasons=profile.categories.map(({id,reason})=>({id,reason}));
    const missingTypes=profile.widgetTypes.filter(type=>!project.workspace.widgets.some(widget=>widget.type===type));
    if(missingTypes.length) {
      const additions=createWorkspace(project.title,missingTypes,project.scenarioType).widgets;
      const bottom=Math.max(0,...project.workspace.widgets.map(w=>w.position.y+w.position.h));
      additions.forEach(w=>{w.position.y=Math.min(100,w.position.y+bottom);});
      project.workspace.widgets.push(...additions);
      project.workspace.updatedAt=new Date().toISOString();
    }
    if(project.preferences.ownsFurniture===true && !profile.widgetTypes.includes('product_catalog')) project.workspace.widgets.filter(w=>w.type==='product_catalog').forEach(w=>{w.visible=false;});
    project.questions=project.questions.filter(question=>{const field=fieldForQuestion(question,project);return field==='context'||!knownField(project,field);});
    reconcileClarifications(project);
  }
  private applyFacts(project:LifeProject,facts:Facts,answer?:string) {
    const before=JSON.stringify({location:project.location,preferences:project.preferences});
    if(facts.location!==undefined)project.location=facts.location;
    if(facts.preferences)project.preferences={...project.preferences,...facts.preferences};
    if(project.preferences.startDate&&project.preferences.endDate&&project.preferences.endDate<project.preferences.startDate)throw new AppError('VALIDATION_ERROR','Return date must be on or after departure');
    if(facts.budgetMinor!==undefined) {
      if(!project.budget.confirmed) {
        const profile=buildScenarioProfile({message:project.originalMessage,scenarioType:project.scenarioType,preferences:project.preferences,location:project.location,totalMinor:facts.budgetMinor});
        project.budget=allocateBudgetForPlan(facts.budgetMinor,profile.categories,10,true);
      } else {
        if(project.budget.allocatedMinor+project.budget.emergencyReserveMinor>facts.budgetMinor)throw new AppError('BUDGET_ALLOCATION_CONFLICT','The new budget is below your current allocations. Adjust the allocation in Budget first, then retry.',409);
        project.budget={...project.budget,totalMinor:facts.budgetMinor,confirmed:true};
      }
      project.confirmedFacts=[...project.confirmedFacts.filter(f=>!/budget/i.test(f)),`User confirmed budget: EUR ${(facts.budgetMinor/100).toFixed(2)}.`].slice(-20);
    }
    if(before!==JSON.stringify({location:project.location,preferences:project.preferences}))for(const result of project.researchResults)if(!result.warnings.some(w=>w.startsWith('Project constraints changed')))result.warnings.push('Project constraints changed after this search; research again before selecting these offers.');
    if(answer)for(const entry of conversation(project).clarifications)if(entry.status==='pending'&&((entry.field==='budget'&&facts.budgetMinor!==undefined)||(entry.field==='destination'&&facts.location!==undefined)||(facts.preferences&&Object.hasOwn(facts.preferences,entry.field)))&&knownField(project,entry.field))resolveClarification(project,entry,'answered',answer);
    this.reconcile(project);
  }
  private repairInitialFacts(project:LifeProject) {
    const stated=buildScenarioProfile({message:project.originalMessage});
    if(project.scenarioType==='other'&&stated.scenarioType!=='other')project.scenarioType=stated.scenarioType;
    const facts:Facts={};
    if(!project.budget.confirmed&&stated.budgetMinor!==null)facts.budgetMinor=stated.budgetMinor;
    if(!project.location&&stated.location)facts.location=stated.location;
    const prefs:NonNullable<ProjectPatch['preferences']>={};
    for(const [field,value]of Object.entries(stated.preferences)){
      if(value===null||value===undefined||value===''||(Array.isArray(value)&&value.length===0))continue;
      const current=project.preferences[field as keyof LifeProject['preferences']];
      const hasConfirmedAnswer=project.conversation?.clarifications.some(c=>c.field===field&&c.status==='answered')||Object.keys(project.answeredQuestions??{}).some(q=>fieldForQuestion(q,project)===field);
      if(!hasConfirmedAnswer&&(current===null||current===undefined||(Array.isArray(current)&&current.length===0)))Object.assign(prefs,{[field]:value});
    }
    if(Object.keys(prefs).length)facts.preferences=prefs;
    if(Object.keys(facts).length)this.applyFacts(project,facts);else this.reconcile(project);
  }
  async create(input: CreateProjectRequest) {
    const scope = classifyScope(input.message);
    if(scope.classification==='AMBIGUOUS') throw new AppError('SCOPE_CLARIFICATION',scope.reply??'What practical life goal would you like to plan?',422);
    if (scope.classification === 'OUT_OF_SCOPE') throw new AppError('OUT_OF_SCOPE',scope.reply??'Please describe a practical life-planning goal.',422);
    const plan = await this.planner.createProject(input);
    const stated=buildScenarioProfile({message:input.message});
    if(stated.scenarioType!=='other')plan.scenarioType=stated.scenarioType;
    if(stated.budgetMinor!==null)plan.budgetMinor=stated.budgetMinor;
    if(stated.location)plan.location=stated.location;
    const explicitPrefs=Object.fromEntries(Object.entries(stated.preferences).filter(([,value])=>value!==null&&value!==undefined&&value!==''&&(!Array.isArray(value)||value.length>0)));
    const profile = buildScenarioProfile({message:input.message,scenarioType:plan.scenarioType,preferences:{...plan.preferences,...explicitPrefs},location:plan.location,totalMinor:plan.budgetMinor??undefined});
    const now = new Date().toISOString();
    let budget = allocateBudgetForPlan(plan.budgetMinor ?? 0,profile.categories,10,plan.budgetMinor !== null);
    if (plan.allocation && plan.budgetMinor !== null && plan.allocation.categories.every(c=>profile.categories.some(p=>p.id===c.id))) {
      // AI may propose allocations, but the deterministic engine checks every total.
      try { budget = recalculateBudget({...budget,...plan.allocation,categories:plan.allocation.categories.map(c=>({...c,committedMinor:0,proposedMinor:0}))},[]); }
      catch { plan.assumptions.push('The AI allocation did not fit the budget; a provisional template allocation is shown.'); }
    }
    const project: LifeProject = {
      id:randomUUID(),revision:0,title:plan.title,scenarioType:plan.scenarioType,location:plan.location,locale:input.locale,originalMessage:input.message,status:'planning',preferences:profile.preferences,
      assumptions:[...new Set([...plan.assumptions,'Category allocations and missing-data scenario costs are provisional planning estimates; review them before committing.'])],confirmedFacts:plan.confirmedFacts,questions:profile.questions,answeredQuestions:{},categoryReasons:profile.categories.map(({id,reason})=>({id,reason})),recommendationDetails:plan.recommendationDetails??profile.recommendationDetails,budget,cart:[],tasks:plan.tasks.slice(0,200).map(t=>({...t,id:randomUUID(),status:'todo',origin:plan.aiMode==='local'?'template':'ai'})),
      workspace:createWorkspace(plan.title,profile.widgetTypes,plan.scenarioType),researchResults:[],risks:[],scenarios:[],actions:[],recommendations:plan.recommendations,aiMode:plan.aiMode,createdAt:now,updatedAt:now,
    };
    this.reconcile(project);
    this.derive(project,0);
    return this.repository.create(LifeProjectSchema.parse(project));
  }
  get(id: string) { return this.repository.get(id); }
  patch(id: string, patch: ProjectPatch) {
    return this.repository.update(id, project => {
      if (patch.title !== undefined) project.title = patch.title;
      if (patch.status !== undefined) project.status = patch.status;
      if (patch.location !== undefined) project.location = patch.location;
      if (patch.preferences) project.preferences = {...project.preferences,...patch.preferences};
      if(project.preferences.startDate && project.preferences.endDate && project.preferences.endDate < project.preferences.startDate) throw new AppError('VALIDATION_ERROR','Return date must be on or after departure');
      if (patch.budget) {
        const wasKnown=project.budget.confirmed;
        const {categories,...fields} = patch.budget;
        project.budget = {...project.budget,...fields,confirmed:true};
        if (categories) project.budget.categories = categories.map(c=>({...c,committedMinor:0,proposedMinor:0}));
        else if(!wasKnown&&fields.totalMinor!==undefined){const profile=buildScenarioProfile({message:project.originalMessage,scenarioType:project.scenarioType,preferences:project.preferences,location:project.location,totalMinor:fields.totalMinor});project.budget=allocateBudgetForPlan(fields.totalMinor,profile.categories,10,true);}
      }
      if (patch.tasks) for (const update of patch.tasks) {
        const task = project.tasks.find(t=>t.id===update.id);
        if (!task) throw notFound('Task');
        task.status=update.status;
      }
      if (patch.answers) {
        project.answeredQuestions ??= {};
        const knownQuestions=new Set([...project.questions,...Object.keys(project.answeredQuestions)]);
        for (const answer of patch.answers) {
          if (!knownQuestions.has(answer.question) && !Object.hasOwn(project.answeredQuestions,answer.question)) throw new AppError('VALIDATION_ERROR','Answer must refer to a project question');
          project.answeredQuestions[answer.question]=answer.answer;
          const field=fieldForQuestion(answer.question,project);
          const entry=project.conversation?.clarifications.findLast(c=>c.field===field&&c.status==='pending');
          const matched=entry??askClarification(project,field,answer.question,project.originalMessage).clarification;
          this.applyFacts(project,extractFacts(project,answer.answer,matched),answer.answer);
        }
      }
      this.reconcile(project);
      // Research is retained for audit, but stale offers cannot enter new simulations/cart.
      if (patch.location !== undefined || patch.preferences?.deliveryRequired !== undefined || patch.preferences?.allowUsed !== undefined || patch.preferences?.startDate !== undefined || patch.preferences?.endDate !== undefined || patch.preferences?.durationDays !== undefined || patch.preferences?.travelers !== undefined || patch.preferences?.ownsFurniture !== undefined || patch.preferences?.ownedItems !== undefined || patch.preferences?.vehicleType !== undefined || patch.preferences?.useCase !== undefined) {
        project.researchResults.forEach(r=> { if (!r.warnings.includes('Project constraints changed after this search; research again before selecting these offers.')) r.warnings.push('Project constraints changed after this search; research again before selecting these offers.'); });
      }
      this.derive(project);
    },patch.expectedRevision);
  }
  workspace(id: string, patch: WorkspacePatch) {
    return this.repository.update(id,p=>{patchWorkspace(p.workspace,patch); this.derive(p);},patch.expectedRevision);
  }
  async research(id: string, request: ResearchRequest) {
    // Network work stays outside the state lock, then merges against the latest project.
    const snapshot = await this.get(id);
    const scope=classifyScope([request.category.replaceAll('_',' '),...request.preferences].join(' '),snapshot);
    if(scope.classification==='OUT_OF_SCOPE') throw new AppError('OUT_OF_SCOPE',scope.reply??'Research must relate to a practical life decision.',422);
    const query = {...request,location:request.location??snapshot.location??undefined};
    if (!query.location) throw new AppError('VALIDATION_ERROR','Provide a research location or set a project destination');
    const result = await this.search.search(query,snapshot);
    const stored = await this.repository.update(id,p=>{
      if (p.location !== snapshot.location || JSON.stringify(p.preferences)!==JSON.stringify(snapshot.preferences)) throw new AppError('CONFLICT','Project constraints changed during research; run the search again',409);
      p.researchResults = [...p.researchResults,result].slice(-30);
      this.derive(p);
    });
    return stored.researchResults.at(-1)!;
  }
  private findOffer(project: LifeProject, offerId: string) {
    for (const result of [...project.researchResults].reverse()) {
      const offer = result.offers.find(o=>o.id===offerId);
      if (offer) {
        if (result.warnings.some(w=>w.startsWith('Project constraints changed'))) throw new AppError('STALE_RESEARCH','Research again after changing project constraints',409);
        return offer;
      }
    }
    throw notFound('Offer');
  }
  private insertCart(project: LifeProject, input: AddCartItemRequest) {
    if (project.cart.length>=100) throw new AppError('LIMIT_EXCEEDED','Cart supports at most 100 lines');
    const now=new Date().toISOString();
    if ('offerId' in input) {
      const o=this.findOffer(project,input.offerId);
      if(o.priceMinor===null) throw new AppError('PRICE_UNKNOWN','Verify this offer price before adding it to the plan');
      if(o.availability==='out_of_stock') throw new AppError('OFFER_UNAVAILABLE','This offer is listed as out of stock');
      if(project.preferences.allowUsed===false&&o.condition==='used') throw new AppError('PREFERENCE_CONFLICT','Used offers are excluded by your preferences');
      if(project.preferences.deliveryRequired===true&&o.delivery.available===false) throw new AppError('PREFERENCE_CONFLICT','This offer does not provide required delivery');
      if(project.cart.some(i=>i.offerId===o.id)) throw new AppError('CONFLICT','Offer already in cart; update its quantity',409);
      project.cart.push({id:randomUUID(),offerId:o.id,title:o.title,category:o.category,quantity:input.quantity,unitPriceMinor:o.priceMinor,deliveryCostMinor:o.delivery.costMinor,currency:'EUR',status:input.status,sourceUrl:o.sourceUrl,priceStatus:o.priceStatus==='verified'?'verified':o.priceStatus==='demo'?'demo':'estimated',addedAt:now});
    } else project.cart.push({...input,id:randomUUID(),offerId:null,currency:'EUR',priceStatus:'estimated',addedAt:now});
  }
  addCart(id: string,input: AddCartItemRequest) { return this.repository.update(id,p=>{this.insertCart(p,input);this.derive(p);}); }
  patchCart(id: string,itemId: string,patch: CartItemPatch) {
    return this.repository.update(id,p=>{
      const item=p.cart.find(i=>i.id===itemId);if(!item) throw notFound('Cart item');
      Object.assign(item,patch);
      if(patch.unitPriceMinor!==undefined||patch.deliveryCostMinor!==undefined) item.priceStatus='estimated';
      this.derive(p);
    });
  }
  deleteCart(id: string,itemId: string) { return this.repository.update(id,p=>{const index=p.cart.findIndex(i=>i.id===itemId);if(index<0)throw notFound('Cart item');p.cart.splice(index,1);this.derive(p);}); }
  scenarios(id: string) { return this.repository.update(id,p=>this.derive(p)); }
  async assistant(id: string,request: AssistantRequest):Promise<AssistantResponse> {
    const initial=await this.get(id);
    let scope=classifyScope(request.message,initial);
    if(scope.classification==='OUT_OF_SCOPE')return {reply:scope.reply!,proposedActions:[],workspacePatch:null};
    const requestedGoal=buildScenarioProfile({message:request.message});
    if(requestedGoal.scenarioType!=='other'&&requestedGoal.scenarioType!==initial.scenarioType&&/\b(?:i want to|i am|i'm|new project|start (?:a|another))\b/i.test(request.message)&&initial.scenarioType!=='other')return {reply:`That sounds like a separate ${requestedGoal.scenarioType.replace('_',' ')} project. Start a new project for it so your ${initial.scenarioType.replace('_',' ')} details stay together.`,proposedActions:[],workspacePatch:null};
    const pending=pendingClarification(initial);
    let facts=extractFacts(initial,request.message,pending);
    let hasFacts=Object.keys(facts).length>0;
    let resumed:string|undefined;
    let dismissed=false;
    // Save explicit user facts before a model call. Later provider errors cannot discard them.
    let project=await this.repository.update(id,p=>{
      this.repairInitialFacts(p);
      facts=extractFacts(p,request.message,pending??pendingClarification(p));hasFacts=Object.keys(facts).length>0;
      const state=conversation(p);
      appendTurn(p,'user',request.message);
      if(pending&&dismisses(request.message)){const entry=state.clarifications.find(c=>c.id===pending.id)!;resolveClarification(p,entry,'dismissed',request.message);dismissed=true;}
      else if(pending?.field==='context'&&(affirmative(request.message)||negative(request.message))){
        const entry=state.clarifications.find(c=>c.id===pending.id)!;
        resolveClarification(p,entry,affirmative(request.message)?'answered':'dismissed',request.message);
        if(affirmative(request.message))resumed=entry.context.request;else {dismissed=true;state.activeRequest=null;}
      }
      this.applyFacts(p,facts,request.message);
      if(hasFacts&&pending&&knownField(p,pending.field))resumed=pending.context.request;
      if(!hasFacts&&!affirmative(request.message)&&!dismissed)state.activeRequest=request.message;
      this.derive(p);
    },initial.revision);
    const finish=async(reply:string,commands:AgentCommand[]=[],explanations:string[]=[]):Promise<AssistantResponse>=>{
      let actions:AgentAction[]=[];
      const saved=await this.repository.update(id,p=>{
        let text=reply;
        // A model cannot re-ask facts already in canonical state or restart a scope loop.
        for(const match of text.matchAll(/[^.!?\n]*\?/g)) {
          const question=match[0].trim();const field=fieldForQuestion(question,p);
          if((field!=='context'&&knownField(p,field))||/is this about|real.life decision/i.test(question)){text=text.replace(match[0],'');continue;}
          const entry=askClarification(p,field,question,conversation(p).activeRequest??request.message);
          if(entry.clarification.attempts>=3)text=text.replace(match[0],field==='context'?'You can tell me the specific next step, or start another project.':`The ${field} detail is still missing; you can add it in Plan details. I can prepare the rest of the plan meanwhile.`);
        }
        text=text.trim()||'I have your saved project details. We can continue with the next planning step.';
        actions=commands.map((command,i)=>p.actions.find(a=>a.status==='proposed'&&JSON.stringify(a.command)===JSON.stringify(command))??({id:randomUUID(),command,status:'proposed',requiresConfirmation:true,explanation:explanations[i]??'Review and confirm this change.',result:null,createdAt:new Date().toISOString()}));
        p.actions=[...p.actions,...actions.filter(action=>!p.actions.some(existing=>existing.id===action.id))].slice(-200);appendTurn(p,'assistant',text);reply=text;this.derive(p);
      },project.revision);
      project=saved;
      const workspace=commands.find(c=>c.type==='update_workspace');
      return {reply,proposedActions:actions,workspacePatch:workspace?.type==='update_workspace'?workspace.arguments:null};
    };
    if(dismissed)return finish('Understood. I have kept your saved project details. Tell me the next step you want to work on.');
    if(scope.reply&&scope.classification!=='AMBIGUOUS'&&!hasFacts&&!affirmative(request.message))return finish(scope.reply);
    if(scope.classification==='AMBIGUOUS'&&!hasFacts&&!resumed&&!affirmative(request.message)&&this.planner.interpret) {
      const interpreted=await this.planner.interpret(project,request);
      scope={classification:interpreted.classification,reason:'Structured contextual interpretation',reply:interpreted.reply};
      if(interpreted.classification==='OUT_OF_SCOPE')return finish(interpreted.reply||'I help with practical life planning and decisions.');
      const modelFacts=groundedInterpretationFacts(project,request.message,interpreted);
      if(Object.keys(modelFacts).length){project=await this.repository.update(id,p=>{this.applyFacts(p,modelFacts,request.message);this.derive(p);},project.revision);scope.classification='CONTEXTUAL_FOLLOW_UP';}
      if(scope.classification==='AMBIGUOUS'&&interpreted.clarification&&!knownField(project,interpreted.clarification.field))return finish(interpreted.clarification.question);
    }
    if(scope.classification==='AMBIGUOUS'&&!hasFacts&&!resumed&&!affirmative(request.message)) {
      const question=project.questions[0]??`Which part of your ${project.scenarioType.replace('_',' ')} plan would you like help with?`;
      return finish(question);
    }
    const defaults=project.scenarioType==='travel'?'Find accommodation and flights for my current trip':project.scenarioType==='car_purchase'?'Find vehicles for my current car purchase':project.scenarioType==='moving'?'Research moving services for my current move':'Continue planning the next steps for my current project';
    let effective=resumed??(affirmative(request.message)?project.conversation?.activeRequest??defaults:request.message);
    if(classifyScope(effective,project).classification==='AMBIGUOUS')effective=defaults;
    const output=await this.planner.assistant(project,{...request,message:normalizePlanningMessage(effective)});
    const seen=new Set<string>();const commands:AgentCommand[]=[];const explanations:string[]=[];
    for(const [i,raw] of output.commands.slice(0,5).entries()){const command=AgentCommandSchema.parse(raw);const key=JSON.stringify(command);if(!seen.has(key)){seen.add(key);commands.push(command);explanations.push(output.explanations[i]??'Review this proposed action.');}}
    let reply=output.reply;
    if(hasFacts)reply=`Your details are saved. ${reply}`;
    if((resumed||commands.length)&&!reply.includes('?')&&project.questions[0]&&!project.conversation?.turns.some(t=>t.role==='assistant'&&t.content.includes(project.questions[0]!)))reply+=` ${project.questions[0]}`;
    return finish(reply,commands,explanations);
  }
  private async applyCommand(project: LifeProject, command: AgentCommand):Promise<string> {
    switch(command.type) {
      case 'propose_budget_allocation': {
        project.budget = {...project.budget,...command.arguments,categories:command.arguments.categories.map(c=>({...c,committedMinor:0,proposedMinor:0})),confirmed:true};
        recalculateBudget(project.budget,project.cart);
        return 'Budget allocation updated after your confirmation.';
      }
      case 'propose_cart_item': this.insertCart(project,{...command.arguments,status:'selected'});return 'Item added to your plan. No purchase has been made.';
      case 'update_workspace':patchWorkspace(project.workspace,command.arguments);return 'Workspace layout updated.';
      case 'create_tasks': {
        if(project.tasks.length+command.arguments.tasks.length>200) throw new AppError('LIMIT_EXCEEDED','Project supports at most 200 tasks');
        project.tasks.push(...command.arguments.tasks.map(t=>({...t,id:randomUUID(),status:'todo' as const,origin:'ai' as const})));return 'Tasks added.';
      }
      case 'compare_scenarios':return 'Scenarios recalculated from current offers and constraints.';
      case 'identify_risks':return 'Risk analysis refreshed from available project evidence.';
      case 'draft_seller_message':return this.draft(project,{...command.arguments,notes:''}).draft;
      case 'research_products':case 'research_services': {
        const query={...command.arguments,kind:command.type==='research_services'?'service' as const:'product' as const,location:command.arguments.location??project.location??undefined};
        if(!query.location)throw new AppError('VALIDATION_ERROR','A research location is required');
        const result=await this.search.search(query,project);
        project.researchResults=[...project.researchResults,result].slice(-30);
        return `${result.status}: ${result.offers.length} offers. ${result.warnings.join(' ')}`.slice(0,4000);
      }
    }
  }
  async confirm(id: string,actionId: string,approved: boolean,expectedRevision?: number) {
    return this.repository.update(id,async p=>{
      const action=p.actions.find(a=>a.id===actionId);if(!action)throw notFound('Action');
      if(action.status!=='proposed')throw new AppError('CONFLICT','This action has already been reviewed',409);
      if(!approved) {action.status='rejected';action.result='Declined by user.';}
      else {action.result=await this.applyCommand(p,AgentCommandSchema.parse(action.command));action.status='applied';}
      this.derive(p);
    },expectedRevision);
  }
  private draft(project: LifeProject, request: SellerMessageRequest):SellerMessageResponse {
    const offer=this.findOffer(project,request.offerId);
    const destination=project.location??'my destination';
    const english=`Hello! I am interested in ${offer.title}. Is it still available? Could you confirm the condition, any damage, dimensions, the final price, and whether delivery to ${destination} is possible? Please also confirm delivery costs and pickup/payment arrangements. Thank you!`;
    const finnish=`Hei! Olen kiinnostunut kohteesta ${offer.title}. Onko se vielä saatavilla? Voisitko vahvistaa kunnon, mahdolliset vauriot, mitat ja lopullisen hinnan? Onnistuuko toimitus kohteeseen ${destination}, ja mitä se maksaa? Sovitaan myös noudosta ja maksutavasta. Kiitos!`;
    const route=`${project.preferences.origin?`from ${project.preferences.origin} `:''}to ${destination}${project.preferences.moveDate?` on ${project.preferences.moveDate}`:''}`;
    const serviceEnglish=`Hello! I am planning a move ${route} and am interested in ${offer.title}. Could you confirm availability and provide an itemized quote including transport, labor, stairs, packing, taxes and any extra charges? Please share the service scope, payment and cancellation terms, and the process for handling damage. Let me know what inventory and access details you need. Thank you!`;
    const serviceFinnish=`Hei! Suunnittelen muuttoa kohteeseen ${destination}${project.preferences.moveDate?` päivänä ${project.preferences.moveDate}`:''} ja olen kiinnostunut palvelusta ${offer.title}. Voisitteko vahvistaa saatavuuden ja antaa eritellyn tarjouksen, joka sisältää kuljetuksen, työn, portaat, pakkaamisen, verot ja mahdolliset lisämaksut? Pyydän myös palvelun sisällön sekä maksu-, peruutus- ja vahinkotilanteiden käsittelyehdot. Mitä tietoja tavaroista ja kulkuyhteyksistä tarvitsette? Kiitos!`;
    const contextualServiceEnglish=`Hello! I am interested in ${offer.title} for my ${project.scenarioType.replaceAll('_',' ')} plan in ${destination}${project.preferences.startDate?` from ${project.preferences.startDate}`:''}${project.preferences.endDate?` to ${project.preferences.endDate}`:''}. Could you confirm availability, the full price including taxes and extra charges, what is included, payment and cancellation terms, and any information you need from me? Thank you!`;
    const contextualServiceFinnish=`Hei! Olen kiinnostunut palvelusta ${offer.title} kohteessa ${destination}. Voisitteko vahvistaa saatavuuden, kokonaishinnan veroineen ja lisämaksuineen, palvelun sisällön sekä maksu- ja peruutusehdot? Mitä lisätietoja tarvitsette? Kiitos!`;
    const text=offer.kind==='service'?(project.scenarioType==='moving'?(request.language==='fi'?serviceFinnish:serviceEnglish):(request.language==='fi'?contextualServiceFinnish:contextualServiceEnglish)):(request.language==='fi'?finnish:english);
    return {draft:text+(request.notes?`\n\n${request.notes}`:''),handoffUrl:offer.sourceUrl,sent:false,warnings:[...(offer.seller.type==='private'?['Inspect the item and verify the seller before making any payment.']:[]),...(offer.verificationStatus==='demo'?['Fictional demo offer; no real seller is available.']:[]),'This is a draft. Copy and send it yourself after review.']};
  }
  async sellerMessage(id: string,request: SellerMessageRequest) {return this.draft(await this.get(id),request);}
}
