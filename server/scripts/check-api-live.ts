import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { CreateProjectResponseSchema,ResearchResultSchema,CartResponseSchema,ScenariosResponseSchema,RisksResponseSchema,SellerMessageResponseSchema,AssistantResponseSchema,ProjectResponseSchema,HealthResponseSchema } from '../../shared/contracts/index.js';
import { loadConfig } from '../src/config.js';

// Explicit opt-in: uses the running local backend, consumes API credits, and
// leaves a real test project with a planning cart in the configured repository.
async function main() {
  const config=loadConfig();
  const origin=`http://127.0.0.1:${config.port}`;
  const checks:string[]=[];
  const report:Record<string,unknown>={testedAt:new Date().toISOString(),model:config.model,checks};
  const request=async(path:string,body?:unknown)=>{
    const started=Date.now();
    const response=await fetch(origin+path,{
      method:body===undefined?'GET':'POST',
      headers:{'content-type':'application/json',...(config.apiToken?{authorization:`Bearer ${config.apiToken}`}:{})},
      body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(125000),
    });
    const data=await response.json();
    if(!response.ok)throw new Error(`${response.status} ${data.error?.code??'API_ERROR'}: ${data.error?.message??'Request failed'}`);
    console.log(JSON.stringify({route:path,status:response.status,durationMs:Date.now()-started}));
    return data;
  };
  try {
    const health=HealthResponseSchema.parse(await request('/api/health'));
    assert.equal(health.configuration.ai,'openai');assert.equal(health.configuration.research,'live');
    checks.push('Backend is in live AI and research modes');
    const {project}=CreateProjectResponseSchema.parse(await request('/api/projects',{
      message:'I am moving to Turku, Finland next month with a budget of 2000 euros. I need a bed.',locale:'en',
    }));
    assert.equal(project.aiMode,'openai');assert.equal(project.budget.totalMinor,200000);
    const widgetTypes=new Set(project.workspace.widgets.map(widget=>widget.type));
    for(const type of ['budget','task_list','service_finder','timeline','shopping_cart','risk_guardian','scenario_comparison'] as const) assert.ok(widgetTypes.has(type),`Missing supported moving widget: ${type}`);
    assert.ok(project.budget.categories.some(category=>['bed','beds','furniture'].includes(category.id)),'The explicitly requested bed needs a relevant allocation');
    assert.ok(widgetTypes.has('product_catalog'),'The explicitly requested bed needs product research');
    assert.equal(widgetTypes.size,project.workspace.widgets.length,'Contextual widgets should not be duplicated');
    assert.equal(project.preferences.deliveryRequired,null);assert.equal(project.preferences.allowUsed,null);
    report.projectId=project.id;report.projectUrl=origin+`/api/projects/${project.id}`;
    checks.push(`${config.model} created a EUR 2000 moving project with supported moving and requested-bed widgets, and unconfirmed preferences`);
    const base=`/api/projects/${project.id}`;
    const research=ResearchResultSchema.parse(await request(`${base}/research`,{category:'beds',location:'Turku, Finland',maxPrice:250}));
    report.research={status:research.status,count:research.offers.length,warnings:research.warnings,offers:research.offers.map(o=>({title:o.title,priceMinor:o.priceMinor,priceStatus:o.priceStatus,sourceUrl:o.sourceUrl,delivery:o.delivery}))};
    const offer=research.offers.find(o=>o.priceMinor!==null);
    assert.ok(offer,'No usable priced live offers returned; the market-data portion is inconclusive');
    checks.push(`Live research returned ${research.offers.length} cited candidates with explicit price confidence`);
    const cart=CartResponseSchema.parse(await request(`${base}/cart/items`,{offerId:offer.id,quantity:1,status:'selected'}));
    assert.equal(cart.budget.committedMinor,offer.priceMinor!+(offer.delivery.costMinor??0));
    assert.equal(cart.budget.remainingMinor,200000-cart.budget.committedMinor);
    checks.push('Cart insertion and cent-based budget recalculation match');
    const scenarios=ScenariosResponseSchema.parse(await request(`${base}/scenarios`));assert.equal(scenarios.scenarios.length,3);
    checks.push('Economy, Balanced and Comfort simulations are available');
    const risks=RisksResponseSchema.parse(await request(`${base}/risks`));assert.ok(risks.risks.length);
    checks.push(`Risk Guardian exposes ${risks.risks.length} evidence-backed gaps`);
    const draft=SellerMessageResponseSchema.parse(await request(`${base}/seller-message`,{offerId:offer.id}));assert.equal(draft.sent,false);assert.ok(draft.draft);
    checks.push('Seller message draft created without transmission');
    const assistant=AssistantResponseSchema.parse(await request(`${base}/assistant`,{message:'Hide the budget widget. Propose the workspace update for my confirmation.'}));
    const action=assistant.proposedActions.find(a=>a.command.type==='update_workspace');assert.ok(action,'Assistant did not propose the requested workspace action');
    let current=ProjectResponseSchema.parse(await request(base)).project;
    assert.equal(current.workspace.widgets.find(w=>w.type==='budget')?.visible,true);
    current=ProjectResponseSchema.parse(await request(`${base}/actions/${action.id}/confirm`,{approved:true,expectedRevision:current.revision})).project;
    assert.equal(current.workspace.widgets.find(w=>w.type==='budget')?.visible,false);
    checks.push('Live assistant proposal waits for confirmation, then applies the workspace update');
    report.remainingMinor=current.budget.remainingMinor;report.passed=true;
  } catch(error) {
    report.passed=false;report.failure=error instanceof Error?error.message:'Live HTTP test failed';process.exitCode=1;
  }
  await mkdir(config.dataDir,{recursive:true,mode:0o700});
  await writeFile(`${config.dataDir}/live-test-report.json`,JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify(report,null,2));
}
main().catch(()=>{console.error('Could not complete the live API test. Check the local backend and server configuration.');process.exitCode=1;});
