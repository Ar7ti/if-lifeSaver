import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Responses,type ResponseCreateParamsNonStreaming} from 'openai/resources/responses/responses';
import {furnitureItems,FurnitureSearchLinkSchema,ResearchRequestSchema,ResearchResultSchema,type LifeProject} from '../../shared/contracts/index.js';
import {focusedFurniture,isFinnishFurnitureSource} from '../src/furniture-research.js';
import {normalizeResearchRequest} from '../src/research-constraints.js';
import {planResearch} from '../src/research-intent.js';
import {createSearchProvider} from '../src/research.js';
import {accessContext} from '../src/access-context.js';
import {buildApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {createPlanner} from '../src/ai.js';

const input=ResearchRequestSchema.parse({category:'furniture',kind:'product',location:'Turku, Finland',maxPrice:200,condition:'used',localOnly:true,preferences:['Looking for: affordable sofas, beds and desks using IKEA, JYSK and Tori.']});
async function project():Promise<LifeProject>{
 const app=await buildApp({config:loadConfig({AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'memory',LOG_LEVEL:'silent'})});
 try{return(await app.inject({method:'POST',url:'/api/projects',payload:{message:"I'm moving to Turku with EUR 2000."}})).json().project;}finally{await app.close();}
}
const url='https://www.ikea.com/fi/fi/p/fixture-sohva-00000001/';
// Explicitly synthetic source summaries, not a real IKEA product or price.
function search(text='Fixture sohva costs EUR 150. Condition: used. Location: Turku.',sourceUrl=url){
 const start=text.length,textWithCitation=text+' [source]';
 return{status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{type:'web_search_call',status:'completed',action:{type:'search',sources:[{type:'url',url:sourceUrl}]}},{type:'message',role:'assistant',content:[{type:'output_text',text:textWithCitation,annotations:[{type:'url_citation',url:sourceUrl,title:'Fixture sohva',start_index:start,end_index:textWithCitation.length}]}]}]};
}
function candidate(extra:Record<string,unknown>={}){return{sourceType:'listing',sourceUrl:url,title:'Fixture sohva',identityQuote:'Fixture sohva costs EUR 150.',priceMinor:15000,priceQuote:'Fixture sohva costs EUR 150.',condition:'used',conditionQuote:'Condition: used.',location:'Turku',locationQuote:'Location: Turku.',deliveryAvailable:null,deliveryCostMinor:null,deliveryQuote:null,availability:'unknown',availabilityQuote:null,...extra};}
function extracted(offers:unknown[]){return{status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({offers}),annotations:[]}]}]};}

test('five furniture categories have deterministic English and Finnish vocabulary',()=>{
 assert.deepEqual(furnitureItems('sofas beds desks chairs wardrobes'),['sofa','bed','desk','chair','wardrobe']);
 assert.deepEqual(furnitureItems('sohva sängyt työpöytä tuoli vaatekaappi'),['sofa','bed','desk','chair','wardrobe']);
 assert.deepEqual(furnitureItems('flights and car insurance'),[]);
});
test('multi-item requests preserve all items and hard constraints rather than collapsing into sofa',()=>{
 const r=normalizeResearchRequest(input);
 assert.equal(r.category,'furniture');assert.equal(r.maxPrice,200);assert.equal(r.condition,'used');assert.equal(r.localOnly,true);
 assert.deepEqual(furnitureItems(r.preferences.join(' ')),['sofa','bed','desk']);
});
test('existing assistant action retains the exact three-item source request for user confirmation',async()=>{
 const p=await project(),planner=createPlanner({mode:'local',model:'fixture',timeoutMs:1000});
 const response=await planner.assistant(p,{message:"I'm moving to Turku with €2,000. Find affordable sofas, beds and desks using IKEA, JYSK and Tori."});
 const command=response.commands.find(c=>c.type==='research_products');assert(command&&command.type==='research_products');
 assert.equal(command.arguments.category,'furniture');assert.deepEqual(planResearch(command.arguments,p).furniture?.items,['sofa','bed','desk']);
 assert.equal(p.researchResults.length,0);assert.equal(p.cart.length,0);
});
test('the exact demo creation request includes a shopping workspace before research runs',async()=>{
 const planner=createPlanner({mode:'local',model:'fixture',timeoutMs:1000});
 const plan=await planner.createProject({message:"I'm moving to Turku with €2,000. Find affordable sofas, beds and desks using IKEA, JYSK and Tori.",locale:'en'});
 assert.equal(plan.budgetMinor,200000);
 // The shared deterministic scenario profile controls initial widget relevance.
 const {buildScenarioProfile}=await import('../src/scenario-profile.js');
 const profile=buildScenarioProfile({message:"I'm moving to Turku with €2,000. Find affordable sofas, beds and desks using IKEA, JYSK and Tori.",scenarioType:'moving',location:'Turku',preferences:(await project()).preferences});
 assert(profile.widgetTypes.includes('product_catalog'));
});
test('moving Finland uses three reviewed sources and nine separate nonfinancial handoffs',async()=>{
 const p=await project(),plan=planResearch(input,p),f=plan.furniture!;
 assert.equal(plan.strategy.id,'moving_furniture_finland');assert.equal(f.queries.length,3);
 assert.deepEqual(f.allowedDomains,['ikea.com','jysk.fi','tori.fi']);assert.equal(f.searchLinks.length,9);
 for(const query of f.queries){assert.match(query,/sohva/);assert.match(query,/sänky/);assert.match(query,/työpöytä/);assert.match(query,/Turku/);assert.match(query,/under EUR 200.00/);}
 for(const link of f.searchLinks){assert.equal(FurnitureSearchLinkSchema.safeParse(link).success,true);assert.equal(link.kind,'source_search');assert.equal('priceMinor' in link,false);assert.match(link.notice,/does not apply these filters/);assert.equal(new URL(link.url).searchParams.get(link.source==='jysk'?'query':'q'),link.query);}
 assert.equal(FurnitureSearchLinkSchema.safeParse({...f.searchLinks[0],url:'javascript:alert(1)'}).success,false);
});
test('unrelated scenarios, countries, services and unselected generic research keep their existing flow',async()=>{
 const p=await project();
 for(const q of [{...p,scenarioType:'travel' as const},{...p,scenarioType:'car_purchase' as const}])assert.equal(focusedFurniture(input,q),null);
 assert.equal(focusedFurniture({...input,country:'DE'},p),null);
 assert.equal(focusedFurniture({...input,kind:'service'},p),null);
 assert.equal(focusedFurniture({...input,preferences:[]},p),null);
 assert.equal(focusedFurniture({...input,location:'Berlin, Germany'},p),null);
});
test('source validation excludes foreign IKEA markets and spoofed hosts',()=>{
 for(const u of ['https://www.ikea.com/us/en/p/sofa','https://jysk.fi.evil.test/item','https://tori.fi.evil.test/item','http://jysk.fi/item'])assert.equal(isFinnishFurnitureSource(u),false);
 for(const u of [url,'https://jysk.fi/olohuone/sohvat/fixture','https://www.tori.fi/recommerce/forsale/item/123'])assert.equal(isFinnishFurnitureSource(u),true);
});
test('an explicitly selected source is not silently expanded to all three stores',async()=>{
 const f=focusedFurniture({...input,preferences:['Find a sofa using only IKEA Finland']},await project())!;
 assert.deepEqual(f.allowedDomains,['ikea.com']);assert.equal(f.searchLinks.length,1);
});
test('focused hosted discovery remains required, bounded and metered; price evidence remains source-reported',async t=>{
 const p=await project(),calls:ResponseCreateParamsNonStreaming[]=[],metered:unknown[]=[];
 t.mock.method(Responses.prototype,'create',((body:ResponseCreateParamsNonStreaming)=>{calls.push(body);return Promise.resolve(calls.length===1?search():extracted([candidate()]));}) as unknown as Responses['create']);
 const provider=createSearchProvider({mode:'live',apiKey:'synthetic-test-key',model:'fixture-model',timeoutMs:1000});
 const result=await accessContext.run({principal:{id:randomUUID(),role:'anonymous',expiresAt:Date.now()+10000},meter:async(body,dispatch)=>{metered.push(body);return dispatch();}},()=>provider.search(input,p));
 assert.equal(calls.length,2);assert.equal(metered.length,2);assert.equal(calls[0]!.tool_choice,'required');
 assert.equal((calls[0] as {max_tool_calls?:number}).max_tool_calls,3);
 assert.deepEqual(calls[0]!.tools,[{type:'web_search',filters:{allowed_domains:['ikea.com','jysk.fi','tori.fi']}}]);
 assert.equal(result.diagnostics?.toolExecuted,true);assert.equal(result.furnitureSearchLinks?.length,9);
 assert.equal(result.offers[0]?.priceMinor,15000);assert.equal(result.offers[0]?.priceStatus,'estimated');assert.equal(result.offers[0]?.imageUrl,null);
 assert.equal(ResearchResultSchema.safeParse(JSON.parse(JSON.stringify(result))).success,true);
 assert.equal(p.cart.length,0);assert.equal(p.budget.totalMinor,200000);
});
test('zero extracted listings still return useful labelled searches without inventing products',async t=>{
 let calls=0;t.mock.method(Responses.prototype,'create',(()=>Promise.resolve(++calls===1?search():extracted([]))) as unknown as Responses['create']);
 const r=await createSearchProvider({mode:'live',apiKey:'synthetic',model:'fixture',timeoutMs:1000}).search(input,await project());
 assert.equal(r.offers.length,0);assert.equal(r.furnitureSearchLinks?.length,9);assert.match(r.summary!.explanation,/links are not listings/);
});
test('Finnish source-reported zero-cent price notation is parsed precisely, never a price range',async t=>{
 let calls=0,priceText='199,- EUR',amount=19900;
 t.mock.method(Responses.prototype,'create',(()=>Promise.resolve(++calls%2===1?search(`Fixture sohva costs ${priceText}. Condition: used. Location: Turku.`):extracted([candidate({priceMinor:amount,identityQuote:`Fixture sohva costs ${priceText}.`,priceQuote:`Fixture sohva costs ${priceText}.`})]))) as unknown as Responses['create']);
 const provider=createSearchProvider({mode:'live',apiKey:'synthetic',model:'fixture',timeoutMs:1000}),p=await project();
 let r=await provider.search(input,p);assert.equal(r.offers[0]?.priceMinor,19900);assert.equal(r.offers[0]?.priceStatus,'estimated');assert.match(r.offers[0]!.evidenceByField!.price!.snippet!,/199,- EUR/);
 priceText='100,- - 199,- EUR';r=await provider.search(input,p);assert.equal(r.offers[0]?.priceMinor,null);
 amount=63900;priceText='639,- EUR';r=await provider.search({...input,maxPrice:700},p);assert.equal(r.offers[0]?.priceMinor,63900);
});
test('known over-budget listings and unapproved source domains are not rescued into product matches',async t=>{
 let calls=0;t.mock.method(Responses.prototype,'create',(()=>Promise.resolve(++calls===1?search('Fixture sohva costs EUR 450. Condition: used. Location: Turku.'):extracted([candidate({priceMinor:45000,priceQuote:'Fixture sohva costs EUR 450.',identityQuote:'Fixture sohva costs EUR 450.'}),candidate({sourceUrl:'https://other.fi/sofa'})]))) as unknown as Responses['create']);
 const r=await createSearchProvider({mode:'live',apiKey:'synthetic',model:'fixture',timeoutMs:1000}).search(input,await project());
 assert.equal(r.offers.length,0);assert.equal(r.furnitureSearchLinks?.length,9);
 assert(r.rejections?.some(r=>r.reasons.includes('price')));assert(r.rejections?.some(r=>r.reasons.includes('source_scope')));
});
test('unknown condition remains a potential lead and an unsupported image is not displayed',async t=>{
 let calls=0;t.mock.method(Responses.prototype,'create',(()=>Promise.resolve(++calls===1?search('Fixture sohva costs EUR 150. Location: Turku.'):extracted([candidate({condition:'unknown',conditionQuote:null,imageUrl:'https://www.ikea.com/unproven.jpg',imageQuote:null})]))) as unknown as Responses['create']);
 const r=await createSearchProvider({mode:'live',apiKey:'synthetic',model:'fixture',timeoutMs:1000}).search(input,await project());
 assert.equal(r.offers[0]?.eligibilityStatus,'potential');assert.equal(r.offers[0]?.condition,'unknown');assert.equal(r.offers[0]?.imageUrl,null);
});
test('multi-item furniture research cannot accept an unrelated chair as a requested sofa, bed or desk',async t=>{
 let calls=0;t.mock.method(Responses.prototype,'create',(()=>Promise.resolve(++calls===1?search('Fixture tuoli costs EUR 150. Condition: used. Location: Turku.'):extracted([candidate({title:'Fixture tuoli',identityQuote:'Fixture tuoli costs EUR 150.',priceQuote:'Fixture tuoli costs EUR 150.'})]))) as unknown as Responses['create']);
 const r=await createSearchProvider({mode:'live',apiKey:'synthetic',model:'fixture',timeoutMs:1000}).search(input,await project());
 assert.equal(r.offers.length,0);assert(r.rejections?.some(r=>r.reasons.includes('category')));
});
test('extraction failure after real discovery returns source handoffs, no retries or fake prices',async t=>{
 let calls=0;t.mock.method(Responses.prototype,'create',(()=>{if(++calls===1)return Promise.resolve(search());return Promise.reject(new Error('controlled extraction timeout'));}) as unknown as Responses['create']);
 const r=await createSearchProvider({mode:'live',apiKey:'synthetic',model:'fixture',timeoutMs:1000}).search(input,await project());
 assert.equal(calls,2);assert.equal(r.offers.length,0);assert.equal(r.furnitureSearchLinks?.length,9);assert.match(r.warnings.join(' '),/No automatic retry/);
});
test('an exhausted allowance blocks focused discovery before any provider call',async t=>{
 let sdkCalls=0;t.mock.method(Responses.prototype,'create',(()=>{sdkCalls++;throw Error('must not dispatch');}) as unknown as Responses['create']);
 const p=await project(),provider=createSearchProvider({mode:'live',apiKey:'synthetic',model:'fixture',timeoutMs:1000});
 await assert.rejects(accessContext.run({principal:{id:randomUUID(),role:'anonymous',expiresAt:Date.now()+10000},meter:async()=>{throw Error('quota exhausted');}},()=>provider.search(input,p)));
 assert.equal(sdkCalls,0);
});
