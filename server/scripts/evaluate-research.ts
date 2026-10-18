import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {CONTRACT_VERSION,ResearchResultSchema,HealthResponseSchema,SessionResponseSchema,CreateProjectResponseSchema,AssistantResponseSchema,type ResearchInput} from '../../shared/contracts/index.js';

const cases:{id:string;goal:string;request?:ResearchInput;messages?:string[]}[]=[
 {id:'furniture',goal:'Moving to Turku with EUR 2000',request:{category:'sofa',kind:'product',location:'Turku, Finland',condition:'used',maxPrice:200,limit:3,localOnly:true,sort:'price_asc'}},
 {id:'housing',goal:'Find rental housing in Turku with a monthly budget of EUR 750',request:{category:'housing',kind:'service',location:'Turku',maxPrice:750,pricePeriod:'month',localOnly:true,limit:3}},
 {id:'transport',goal:'Travel from Helsinki to Tampere on 2027-02-20 with EUR 500',request:{category:'transport',kind:'service',location:'Tampere',limit:3}},
 {id:'car',goal:'Buy a used Toyota Corolla in Finland under EUR 8000',request:{category:'vehicle',kind:'product',location:'Finland',condition:'used',maxPrice:8000,limit:3,preferences:['Toyota Corolla']}},
 {id:'insurance',goal:'Moving to Turku with EUR 2000',request:{category:'home_insurance',kind:'service',location:'Finland',purpose:'information',limit:3}},
 {id:'followup',goal:'Moving to Turku with EUR 2000',messages:['Find a sofa under €200 in Turku.','Only used ones, and show the cheapest first.']},
];
async function main(){
 const args=process.argv.slice(2),live=args.includes('--confirm-paid');
 const id=args[args.indexOf('--case')+1];
 const selected=args.includes('--all')?cases:cases.filter(c=>c.id===(args.includes('--case')?id:'furniture'));
 if(!selected.length)throw new Error('Unknown evaluation case.');
 if(!live){console.log(JSON.stringify({mode:'DRY_RUN',paidRequests:0,cases,instructions:'Configure the dedicated new staging service, verify limits, then run --confirm-paid --case furniture. --all explicitly opts into six bounded cases; no automatic retries.'},null,2));return;}
 const origin=process.env.LIVE_AI_STAGING_ORIGIN??'';
 const u=new URL(origin);if(u.protocol!=='https:'||u.origin!==origin||!u.hostname.includes('live-ai-staging')||/production|public-access-staging/.test(u.hostname))throw new Error('Only the explicit new HTTPS live-ai-staging origin is allowed.');
 const healthResponse=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(15000)});
 const health=HealthResponseSchema.parse(await healthResponse.json());
 if(healthResponse.headers.get('x-staging-providers')||health.configuration.providers?.ai!=='openai_sdk'||health.configuration.providers?.research!=='openai_sdk')throw new Error('Real SDK provider provenance is required.');
 if(health.configuration.ai!=='openai'||health.configuration.research!=='live'||health.contractVersion!==CONTRACT_VERSION)throw new Error('Expected the prepared LIVE AI/research contract, not mocks or a different deployment.');
 const records:unknown[]=[];
 for(const c of selected){
  let cookie='',csrf='';const started=Date.now();
  const request=async(path:string,body?:unknown)=>{
   const r=await fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':randomUUID()})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(130000)});
   const payload=await r.json();if(!r.ok){const code=payload?.error?.code;throw new Error(typeof code==='string'&&/^[A-Z_]+$/.test(code)?code:`HTTP_${r.status}`);}return {r,payload};
  };
  try{
   const opened=await request('/session',{});const session=SessionResponseSchema.parse(opened.payload);
   cookie=opened.r.headers.get('set-cookie')?.split(';')[0]??'';csrf=session.csrfToken??'';
   if(session.mode!=='public'||session.session?.role!=='anonymous'||!cookie||!csrf||!session.usage?.publicAiEnabled||(session.usage.limit===null||session.usage.limit>5))throw new Error('Staging session or reviewed public usage policy is unavailable.');
   const p=CreateProjectResponseSchema.parse((await request('/projects',{message:c.goal,locale:'en'})).payload).project;
   const base='/projects/'+p.id;
   if(c.messages){
    let latest;for(const message of c.messages)latest=AssistantResponseSchema.parse((await request(base+'/assistant',{message})).payload);
    const action=latest?.proposedActions.find(a=>a.command.type==='research_products');
    const query=action?.command.type==='research_products'?action.command.arguments:null;
    records.push({case:c.id,mode:'LIVE_HTTP',latencyMs:Date.now()-started,retainsCategory:query?.category==='sofa',retainsCeiling:query?.maxPrice===200,retainsLocation:query?.location?.startsWith('Turku'),usedOnly:query?.condition==='used',cheapestFirst:query?.sort==='price_asc',researchNotAutomaticallyExecuted:true,usage:(await request('/session')).payload.usage});
   }else{
    const r=ResearchResultSchema.parse((await request(base+'/research',c.request)).payload);const d=r.diagnostics;
    const matches=r.offers.filter(o=>(!c.request?.condition||c.request.condition==='any'||o.condition===c.request.condition)&&(!c.request?.maxPrice||((c.request.pricePeriod==='month'?o.reportedRate?.amountMinor:o.priceMinor)??Infinity)<=c.request.maxPrice*100));
    records.push({case:c.id,mode:r.mode,toolExecuted:d?.toolExecuted??false,searchCalls:d?.searchCalls??null,sourceCount:d?.sourceCount??null,candidateCount:d?.candidateCount??null,acceptedCount:r.offers.length,supportedCount:d?.supportedCount??r.summary?.supportedCount??null,potentialCount:d?.potentialCount??r.summary?.potentialCount??null,missingEvidenceCounts:d?.missingEvidenceCounts??{},sourceStrategy:d?.sourceStrategy??null,rejectedCount:d?.rejectedCount??null,rejectionReasons:d?.rejectionReasons??{},reportedConstraintMatchPercent:r.offers.length?matches.length/r.offers.length*100:null,directSourceUrls:r.offers.filter(o=>o.sourceUrl&&o.sourceType==='listing').length,usableOneTimePrices:r.offers.filter(o=>o.priceMinor!==null).length,reportedUnitRates:r.offers.filter(o=>o.reportedRate).length,usableImageUrls:r.offers.filter(o=>o.imageUrl).length,duplicateRate:d?.candidateCount?d.duplicateCount/d.candidateCount:null,researchEstimatedCostUsd:d?.estimatedCostUsd??null,latencyMs:Date.now()-started,sources:r.offers.map(o=>({title:o.title,url:o.sourceUrl,sourceType:o.sourceType,priceMinor:o.priceMinor,reportedRate:o.reportedRate,eligibilityStatus:o.eligibilityStatus,condition:o.condition,location:o.location,missingEvidence:o.missingEvidence,evidenceByField:o.evidenceByField})),usage:(await request('/session')).payload.usage,independentLinkAccessCheck:false});
   }
  }catch(error){records.push({case:c.id,mode:'LIVE_HTTP',errorCode:error instanceof Error&&/^[A-Z_0-9]+$/.test(error.message)?error.message:'EVALUATION_FAILED',latencyMs:Date.now()-started});}
 }
 const output={recordedAt:new Date().toISOString(),origin,mode:'LIVE_HTTP',costsAreEstimates:true,providerInvoiceTotal:null,notes:'Reported-constraint checks are not independent merchant verification. Research cost excludes workspace/assistant calls; provider invoice is authoritative. Cookies, keys and administrator credentials are never recorded.',cases:records};
 const dir=fileURLToPath(new URL('../docs/live-ai-staging/',import.meta.url));await mkdir(dir,{recursive:true});await writeFile(dir+'live-evaluation.json',JSON.stringify(output,null,2),{mode:0o600});
 console.log(JSON.stringify(output,null,2));
}
main().catch(()=>{console.error('Evaluation refused or could not start. Check the explicit new staging origin, mode, reviewed configuration, and --confirm-paid. No credentials are printed.');process.exitCode=1;});
