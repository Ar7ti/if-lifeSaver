/** LOCAL BROWSER FIXTURE ONLY: fictional summaries, zero OpenAI/merchant calls. */
import {randomUUID} from 'node:crypto';
import {buildApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {AppError} from '../src/errors.js';
import {researchPresentation} from '../src/research-evidence.js';
import {OfferSchema,researchDismissed,type ResearchResult} from '../../shared/contracts/index.js';
if(process.env.RESEARCH_V2_UI_FIXTURE!=='true'||process.env.RAILWAY_ENVIRONMENT_NAME)throw Error('This fixture only runs explicitly on a local test server.');
const app=await buildApp({config:loadConfig({HOST:'127.0.0.1',PORT:'3097',AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'memory',LOG_LEVEL:'silent',ALLOWED_ORIGINS:'http://127.0.0.1:5197'}),search:{mode:'demo',async search(request,project){
 if(request.category.includes('timeout'))throw new AppError('RESEARCH_TIMEOUT','Controlled test timeout; no live search was run.',504);
 const now=new Date().toISOString();const offers=[['Synthetic supported sofa',18000,'supported'],['Synthetic condition lead',12000,'potential'],['Synthetic unknown-price lead',null,'potential']].map(([title,price,eligibility],i)=>OfferSchema.parse({
  id:randomUUID(),category:request.category,kind:'product',title,description:'Explicitly fictional browser fixture. Not a real listing.',priceMinor:price,currency:'EUR',priceStatus:price===null?'unknown':'demo',sourceUrl:`https://fixtures.example.org/sofa-${i}`,sourceName:'Fictional fixture source',sourceType:'listing',seller:{name:null,type:'unknown',publicProfileUrl:null,verified:false},imageUrl:i===0?'https://images.example.org/fixture-broken.png':null,imageType:'demo',imageSource:'demo',location:i===2?null:'Turku',condition:i===1?'unknown':'used',availability:'demo',delivery:{available:null,costMinor:null,details:'Fictional fixture: not known.'},lastCheckedAt:now,verificationStatus:'demo',score:70-i,recommendation:'Synthetic fixture only; never independently inspected.',eligibilityStatus:eligibility,missingEvidence:i===0?[]:[{field:i===1?'condition':'price',required:true,reason:i===1?'The source does not establish used condition.':'A reliable source-reported price is missing.'}],evidenceByField:{price:{status:price===null?'unknown':'estimated',snippet:price===null?null:'Fictional fixture price, not internet evidence.',provenance:'none'}},confidenceExplanation:'Synthetic fixture only; no live merchant was inspected.',evidence:['Synthetic fixture, not live search.']
 })).filter(o=>!researchDismissed(project,o));
 const legacy=request.category==='legacy';if(legacy)for(const o of offers){delete o.eligibilityStatus;delete o.evidenceByField;delete o.missingEvidence;delete o.confidenceExplanation;}
 const r:ResearchResult={id:randomUUID(),category:request.category,status:'limited',mode:'demo',offers:request.category==='missing'?[]:offers,warnings:['SYNTHETIC BROWSER FIXTURE. No real product, seller, price or hosted search.'],searchedAt:now,query:'Controlled test only',request};
 return legacy?r:researchPresentation(r,4);
}}});
await app.listen({host:'127.0.0.1',port:3097});
