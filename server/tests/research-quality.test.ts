import test,{after} from 'node:test';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Responses} from 'openai/resources/responses/responses';
import {buildApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {createSearchProvider} from '../src/research.js';
import {ResearchRequestSchema,type LifeProject,type ResearchDiagnostics} from '../../shared/contracts/index.js';
import {explicitResearchConstraints,normalizeResearchRequest} from '../src/research-constraints.js';

const evaluation:unknown[]=[];
function record(id:string,r:import('../../shared/contracts/index.js').ResearchResult){const d=r.diagnostics!;evaluation.push({case:id,verification:'MOCK_SDK',actualNetworkSearches:0,actualApiSpendingUsd:0,searchToolCallsInFixture:d.searchCalls,candidateSources:d.sourceCount,candidates:d.candidateCount,accepted:r.offers.length,rejected:d.rejectedCount,rejectionReasons:d.rejectionReasons,directSourceUrls:r.offers.filter(o=>o.sourceUrl).length,sourceReportedListings:r.offers.filter(o=>o.sourceType==='listing').length,usableOneTimePrices:r.offers.filter(o=>o.priceMinor!==null).length,reportedRates:r.offers.filter(o=>o.reportedRate).length,validImageUrls:r.offers.filter(o=>o.imageUrl).length,duplicateRate:d.candidateCount?d.duplicateCount/d.candidateCount:0,reportedConstraintMatchPercent:r.offers.length?100:null,fixtureEstimatedCostUsd:d.estimatedCostUsd,fixturePipelineLatencyMs:d.durationMs,independentMerchantVerification:false});}
after(async()=>{if(process.env.WRITE_RESEARCH_EVALUATION==='true'){const dir=fileURLToPath(new URL('../docs/live-ai-staging/',import.meta.url));await mkdir(dir,{recursive:true});await writeFile(dir+'mock-evaluation.json',JSON.stringify({mode:'MOCK_SDK',recordedAt:new Date().toISOString(),note:'Synthetic tokens, quotes and sources; matching percentages reflect asserted fixture constraints, not live merchant quality. Zero paid calls. Live evaluation BLOCKED until dedicated staging credentials and reviewed controls are available.',cases:evaluation},null,2));}});
const options={mode:'live' as const,apiKey:'fixture-never-sent',model:'gpt-6.1-sol',timeoutMs:1000,pricing:{input:2,output:10,search:0.01}};
const entry=(title:string,price:number,condition='used',location='Turku',url=`https://market.fi/listing/${encodeURIComponent(title)}`)=>{
 const identity=`${title} costs EUR ${price}.`;
 return {url,text:`${identity} Condition: ${condition}. Location: ${location}. In stock.`,candidate:{sourceUrl:url,sourceType:'listing',title,identityQuote:identity,priceMinor:price*100,priceQuote:identity,condition,conditionQuote:`Condition: ${condition}.`,availability:'in_stock',availabilityQuote:'In stock.',deliveryAvailable:null,deliveryCostMinor:null,deliveryQuote:null,location,locationQuote:`Location: ${location}.`}};
};
function searched(entries:ReturnType<typeof entry>[]){
 let text='';const annotations:unknown[]=[];
 for(const e of entries){if(text)text+='\n\n';text+=e.text;const start=text.length;text+=' [source]';annotations.push({type:'url_citation',url:e.url,title:'Fixture',start_index:start,end_index:text.length});}
 return {status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{type:'web_search_call',status:'completed',action:{type:'search',sources:entries.map(e=>({type:'url',url:e.url}))}},{type:'message',role:'assistant',content:[{type:'output_text',text,annotations}]}]};
}
function extracted(entries:ReturnType<typeof entry>[]){return {status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({offers:entries.map(e=>e.candidate)}),annotations:[]}]}]};}
async function project(scenario:'moving'|'travel'|'car_purchase'='moving'){
 const app=await buildApp({config:loadConfig({AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'memory',LOG_LEVEL:'silent'})});
 try{const r=await app.inject({method:'POST',url:'/api/projects',payload:{message:scenario==='travel'?'Travel from Helsinki to Tampere on 2027-02-20 with EUR 500':scenario==='car_purchase'?'Buy a used Toyota Corolla in Finland under EUR 8000':'Moving to Turku with EUR 2000'}});return r.json().project as LifeProject;}finally{await app.close();}
}

test('A: explicit used/local/ceiling/count survives extraction, duplicates and cheapest-first ranking',async t=>{
 const entries=[entry('Sofa A',120),entry('Sofa B',100),entry('Sofa New',90,'new'),entry('Sofa Far',80,'used','Helsinki'),entry('Sofa Expensive',250),entry('Sofa B',100)];
 let calls=0;const logs:ResearchDiagnostics[]=[];t.mock.method(Responses.prototype,'create',async()=>calls++===0?searched(entries):extracted(entries));
 const request=ResearchRequestSchema.parse({category:'sofa',...explicitResearchConstraints('Find 3 used sofas in Turku, Finland, under €200.'),sort:'price_asc'});
 const r=await createSearchProvider({...options,diagnose:d=>logs.push(d)}).search(request,await project());
 assert.equal(calls,2);assert.equal(r.offers.length,2);assert.deepEqual(r.offers.map(o=>o.priceMinor),[10000,12000]);assert(r.offers.every(o=>o.condition==='used'&&o.location==='Turku'));
 assert.match(r.warnings.join(' '),/Requested 3 results; only 2/);assert.equal(r.diagnostics!.searchCalls,1);assert.equal(r.diagnostics!.candidateCount,6);assert.equal(r.diagnostics!.acceptedCount,2);assert.equal(r.diagnostics!.duplicateCount,1);assert(r.diagnostics!.rejectionReasons.condition);assert(r.diagnostics!.rejectionReasons.location);assert(r.diagnostics!.rejectionReasons.price);
 assert.equal(r.diagnostics!.estimatedCostUsd,0.0124);assert.equal(logs.length,1);assert(!JSON.stringify(logs).includes('Sofa A'));assert(!JSON.stringify(logs).includes('fixture-never-sent'));record('A_furniture',r);
});
test('B: monthly rental rate is source-reported and never a one-time purchase total',async t=>{
 const e=entry('Turku Studio Apartment',700,'unknown');e.text='Turku Studio Apartment costs EUR 700/month. Location: Turku.';e.candidate.identityQuote='Turku Studio Apartment costs EUR 700/month.';e.candidate.priceQuote=e.candidate.identityQuote;
 t.mock.method(Responses.prototype,'create',async()=>calls++===0?searched([e]):extracted([e]));let calls=0;
 const r=await createSearchProvider(options).search(ResearchRequestSchema.parse({category:'housing',kind:'service',maxPrice:750,pricePeriod:'month',localOnly:true,location:'Turku'}),await project());
 assert.equal(r.offers.length,1);assert.equal(r.offers[0]!.reportedRate!.amountMinor,70000);assert.equal(r.offers[0]!.reportedRate!.period,'month');assert.equal(r.offers[0]!.priceMinor,null);assert.equal(r.offers[0]!.priceStatus,'unknown');record('B_housing',r);
});
test('free-form UI queries retain a canonical category and line-separated citations remain isolated',async t=>{
 const input=normalizeResearchRequest(ResearchRequestSchema.parse({category:'find_3_used_sofas_in_turku_under_200',preferences:['Looking for: Find 3 used sofas in Turku under €200']}));
 assert.equal(input.category,'sofa');assert.equal(input.condition,'used');assert.equal(input.maxPrice,200);assert.equal(input.location,'Turku');assert.equal(input.limit,3);
 const entries=[entry('Sofa A',100),entry('Sofa B',120)];const response=searched(entries);const part=response.output[1] as any;
 const text=part.content[0].text as string;const first=text.indexOf('\n\n');part.content[0].text=text.replace('\n\n','\n');for(const annotation of part.content[0].annotations)if(annotation.start_index>first){annotation.start_index--;annotation.end_index--;}
 let calls=0;t.mock.method(Responses.prototype,'create',async()=>calls++===0?response:extracted(entries));
 const r=await createSearchProvider(options).search(input,await project());assert.equal(r.offers.length,2);assert.equal(r.diagnostics!.passageCount,2);
});
test('C: dated passenger transport preserves the route and excludes freight',async t=>{
 const entries=[entry('Train Helsinki Tampere',20,'unknown','Tampere'),entry('Furniture freight',10,'unknown','Tampere')];let calls=0;const bodies:unknown[]=[];
 t.mock.method(Responses.prototype,'create',async(body:unknown)=>{bodies.push(body);return calls++===0?searched(entries):extracted(entries);});
 const p=await project('travel');p.preferences.startDate='2027-02-20';p.preferences.origin='Helsinki';p.location='Tampere';
 const r=await createSearchProvider(options).search(ResearchRequestSchema.parse({category:'transport',kind:'service'}),p);
 assert.equal(r.offers.length,1);assert.match(r.offers[0]!.title,/Train/);assert.match(JSON.stringify(bodies[0]),/2027-02-20/);assert.match(JSON.stringify(bodies[0]),/Helsinki/);assert(r.diagnostics!.rejectionReasons.category);record('C_transport',r);
});
test('D: Toyota listing respects used condition and purchase ceiling, not rental/toy prices',async t=>{
 const entries=[entry('Toyota Corolla 2011',7500,'used','Finland'),entry('Toyota Corolla rental',30,'used','Finland'),entry('Toyota Corolla 2020',9000,'used','Finland')];let calls=0;
 t.mock.method(Responses.prototype,'create',async()=>calls++===0?searched(entries):extracted(entries));
 const r=await createSearchProvider(options).search(ResearchRequestSchema.parse({category:'vehicle',condition:'used',maxPrice:8000,location:'Finland'}),await project('car_purchase'));
 assert.deepEqual(r.offers.map(o=>o.title),['Toyota Corolla 2011']);assert(r.diagnostics!.rejectionReasons.category);assert.equal(r.offers[0]!.priceStatus,'estimated');record('D_car',r);
});
test('E: official insurance guidance uses a domain-filtered tool, never a personalized price',async t=>{
 const entries=[entry('If Home Insurance Finland',80,'unknown','Finland','https://www.if.fi/henkiloasiakkaat/vakuutukset/kotivakuutus'),entry('Home insurance broker',20,'unknown','Finland','https://broker.fi/home')];let calls=0;const bodies:any[]=[];
 t.mock.method(Responses.prototype,'create',async(body:unknown)=>{bodies.push(body);return calls++===0?searched(entries):extracted(entries);});
 const r=await createSearchProvider(options).search(ResearchRequestSchema.parse({category:'home_insurance',kind:'service',purpose:'information'}),await project());
 assert.deepEqual(bodies[0].tools,[{type:'web_search',filters:{allowed_domains:['if.fi']}}]);assert.equal(r.offers.length,1);assert.equal(r.offers[0]!.sourceType,'information');assert.equal(r.offers[0]!.priceMinor,null);assert.equal(r.offers[0]!.reportedRate,undefined);record('E_insurance',r);
});
test('F: actual HTTP assistant refinement retains sofa, Turku and ceiling without research or a scope loop',async t=>{
 const app=await buildApp({config:loadConfig({AI_MODE:'local',RESEARCH_MODE:'demo',STORAGE_MODE:'memory',LOG_LEVEL:'silent'})});t.after(()=>app.close());
 const r=await app.inject({method:'POST',url:'/api/projects',payload:{message:'Moving to Turku with EUR 2000'}});const base='/api/projects/'+r.json().project.id;
 const first=await app.inject({method:'POST',url:base+'/assistant',payload:{message:'Find a sofa under €200 in Turku.'}});assert.equal(first.statusCode,200,first.body);assert.equal(first.json().proposedActions[0].command.arguments.category,'sofa');
 const next=await app.inject({method:'POST',url:base+'/assistant',payload:{message:'Only used ones, and show the cheapest first.'}});assert.equal(next.statusCode,200,next.body);
 const command=next.json().proposedActions.find((a:any)=>a.command.type==='research_products').command;assert.equal(command.arguments.category,'sofa');assert.equal(command.arguments.maxPrice,200);assert.equal(command.arguments.location,'Turku');assert.equal(command.arguments.condition,'used');assert.equal(command.arguments.sort,'price_asc');assert(!/Is this about/.test(next.json().reply));
 const saved=(await app.inject(base)).json().project;assert.equal(saved.researchResults.length,0);assert.equal(saved.budget.totalMinor,200000);
 const official=await app.inject({method:'POST',url:base+'/assistant',payload:{message:'Find official information about If home insurance in Finland and what it covers.'}});assert.equal(official.statusCode,200,official.body);assert(official.json().proposedActions.some((a:any)=>a.command.type==='research_services'));assert(!official.json().proposedActions.some((a:any)=>a.command.type==='protection_action'));
});
test('G: timeout, absent search, invalid extraction and empty sources produce honest stage diagnostics',async t=>{
 for(const fault of ['timeout','no_tool','invalid','no_sources'] as const){
  let calls=0;const logs:ResearchDiagnostics[]=[];t.mock.method(Responses.prototype,'create',async()=>{calls++;if(fault==='timeout')return new Promise(()=>{});if(fault==='no_tool')return {status:'completed',output:[]};if(calls===1)return searched(fault==='no_sources'?[]:[entry('Sofa',120)]);return {status:'completed',output:[]};});
  const provider=createSearchProvider({...options,timeoutMs:10,diagnose:d=>logs.push(d)});const p=await project();
  if(fault==='no_sources'){const r=await provider.search(ResearchRequestSchema.parse({category:'sofa'}),p);assert.equal(r.offers.length,0);assert.equal(r.diagnostics!.toolExecuted,true);assert.equal(calls,1);}
  else {await assert.rejects(()=>provider.search(ResearchRequestSchema.parse({category:'sofa'}),p),(e:any)=>e.code===(fault==='timeout'?'RESEARCH_TIMEOUT':fault==='no_tool'?'WEB_SEARCH_NOT_EXECUTED':'INVALID_RESEARCH_RESPONSE'));assert.equal(logs[0]!.stage,'failed');assert.equal(logs[0]!.estimatedCostUsd,null,'A failed provider step may still be charged; partial observed tokens are not a total cost');assert.equal(logs[0]!.failureStage,fault==='invalid'?'validation':'search');}
  assert.equal(logs.length,1);t.mock.restoreAll();
 }
});
