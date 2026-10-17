import { randomUUID } from 'node:crypto';
import { AgentCommandSchema, LifeProjectSchema, type LifeProject, type ProjectPatch, type WorkspacePatch, type AddCartItemRequest, type CartItemPatch, type AssistantRequest, type AssistantResponse, type ResearchRequest, type SellerMessageRequest, type SellerMessageResponse, type AgentAction, type AgentCommand, type Offer, type CreateProjectRequest } from '../../shared/contracts/index.js';
import type { ProjectRepository } from './repository.js';
import type { Planner } from './ai.js';
import type { SearchProvider } from './research.js';
import { allocateBudget, recalculateBudget, simulateScenarios, analyzeRisks } from './finance.js';
import { createWorkspace, patchWorkspace } from './workspace.js';
import { AppError, notFound } from './errors.js';

export class ProjectService {
  constructor(readonly repository: ProjectRepository, private planner: Planner, private search: SearchProvider) {}
  private derive(project: LifeProject, revision = project.revision + 1) {
    project.budget = recalculateBudget(project.budget, project.cart);
    project.scenarios = simulateScenarios({...project,revision});
    project.risks = analyzeRisks(project);
  }
  async create(input: CreateProjectRequest) {
    const plan = await this.planner.createProject(input);
    const now = new Date().toISOString();
    let budget = allocateBudget(plan.budgetMinor ?? 0, plan.budgetMinor !== null);
    if (plan.allocation && plan.budgetMinor !== null) {
      // AI may propose allocations, but the deterministic engine checks every total.
      try { budget = recalculateBudget({...budget,...plan.allocation,categories:plan.allocation.categories.map(c=>({...c,committedMinor:0,proposedMinor:0}))},[]); }
      catch { plan.assumptions.push('The AI allocation did not fit the budget; a provisional template allocation is shown.'); }
    }
    const project: LifeProject = {
      id:randomUUID(),revision:0,title:plan.title,scenarioType:plan.scenarioType,location:plan.location,locale:input.locale,originalMessage:input.message,status:'planning',preferences:plan.preferences,
      assumptions:[...new Set([...plan.assumptions,'Category allocations and missing-data scenario costs are provisional planning estimates; review them before committing.'])],confirmedFacts:plan.confirmedFacts,questions:plan.questions,budget,cart:[],tasks:plan.tasks.slice(0,200).map(t=>({...t,id:randomUUID(),status:'todo',origin:plan.aiMode==='local'?'template':'ai'})),
      workspace:createWorkspace(plan.title,plan.scenarioType==='moving'?[...plan.widgetTypes,'budget','product_catalog','shopping_cart','service_finder','scenario_comparison','risk_guardian','timeline','recommendations','task_list']:plan.widgetTypes),researchResults:[],risks:[],scenarios:[],actions:[],recommendations:plan.recommendations,aiMode:plan.aiMode,createdAt:now,updatedAt:now,
    };
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
      if (patch.budget) {
        const {categories,...fields} = patch.budget;
        project.budget = {...project.budget,...fields,confirmed:true};
        if (categories) project.budget.categories = categories.map(c=>({...c,committedMinor:0,proposedMinor:0}));
      }
      if (patch.tasks) for (const update of patch.tasks) {
        const task = project.tasks.find(t=>t.id===update.id);
        if (!task) throw notFound('Task');
        task.status=update.status;
      }
      project.questions = project.questions.filter(question => {
        if (/exact move date/i.test(question) && project.preferences.moveDate) return false;
        if (/where are you moving\?/i.test(question) && project.location) return false;
        if (/where are you moving from.*how many/i.test(question) && project.preferences.origin && project.preferences.householdSize) return false;
        if (/what budget|budget in euros/i.test(question) && project.budget.confirmed) return false;
        return true;
      });
      // Research is retained for audit, but stale offers cannot enter new simulations/cart.
      if (patch.location !== undefined || patch.preferences?.deliveryRequired !== undefined || patch.preferences?.allowUsed !== undefined) {
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
    const snapshot=await this.get(id);
    const output=await this.planner.assistant(snapshot,request);
    const commands=output.commands.slice(0,5).map(command=>AgentCommandSchema.parse(command));
    let actions:AgentAction[]=[];
    await this.repository.update(id,p=>{
      actions=commands.map((command,i)=>({id:randomUUID(),command,status:'proposed',requiresConfirmation:true,explanation:output.explanations[i]??'Review and confirm this change.',result:null,createdAt:new Date().toISOString()}));
      p.actions=[...p.actions,...actions].slice(-200);
      // Proposals never mutate user selections; confirmation is a separate request.
      this.derive(p);
    },snapshot.revision);
    const workspace=commands.find(c=>c.type==='update_workspace');
    return {reply:output.reply,proposedActions:actions,workspacePatch:workspace?.type==='update_workspace'?workspace.arguments:null};
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
    const text=offer.kind==='service'?(request.language==='fi'?serviceFinnish:serviceEnglish):(request.language==='fi'?finnish:english);
    return {draft:text+(request.notes?`\n\n${request.notes}`:''),handoffUrl:offer.sourceUrl,sent:false,warnings:[...(offer.seller.type==='private'?['Inspect the item and verify the seller before making any payment.']:[]),...(offer.verificationStatus==='demo'?['Fictional demo offer; no real seller is available.']:[]),'This is a draft. Copy and send it yourself after review.']};
  }
  async sellerMessage(id: string,request: SellerMessageRequest) {return this.draft(await this.get(id),request);}
}
