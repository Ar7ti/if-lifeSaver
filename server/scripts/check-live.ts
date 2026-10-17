import { createPlanner } from '../src/ai.js';
import { createSearchProvider } from '../src/research.js';
import { ProjectService } from '../src/service.js';
import { MemoryProjectRepository } from '../src/repository.js';
import { loadConfig } from '../src/config.js';

/** Opt-in integration smoke check; it consumes API credits and stores nothing on disk. */
async function main() {
  const config=loadConfig();
  if(!config.apiKey)throw new Error('Set OPENAI_API_KEY in server/.env before running check:live.');
  const planner=createPlanner({mode:'openai',apiKey:config.apiKey,model:config.model,timeoutMs:config.aiTimeoutMs});
  const search=createSearchProvider({mode:'live',apiKey:config.apiKey,model:config.model,timeoutMs:config.researchTimeoutMs});
  const service=new ProjectService(new MemoryProjectRepository(),planner,search);
  const project=await service.create({message:'I am moving to Turku, Finland with a budget of 2000 euros. I need a bed.',locale:'en'});
  const result=await service.research(project.id,{category:'beds',location:'Turku, Finland',maxPrice:250,kind:'product',preferences:[]});
  console.log(JSON.stringify({project:{scenarioType:project.scenarioType,aiMode:project.aiMode,budgetMinor:project.budget.totalMinor,widgetCount:project.workspace.widgets.length},research:{status:result.status,mode:result.mode,count:result.offers.length,warnings:result.warnings,offers:result.offers.map(o=>({title:o.title,priceMinor:o.priceMinor,priceStatus:o.priceStatus,sourceUrl:o.sourceUrl}))}},null,2));
}
main().catch(error=>{
  console.error(error instanceof Error?error.message:'Live integration check failed.');
  process.exitCode=1;
});
