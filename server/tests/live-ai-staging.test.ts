import test from 'node:test';
import assert from 'node:assert/strict';
import {liveStagingConfig} from '../src/live-ai-staging-config.js';
import {buildApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {createPlanner} from '../src/ai.js';
import {createSearchProvider} from '../src/research.js';

const fixture={RAILWAY_ENVIRONMENT_NAME:'live-ai-staging',LIVE_AI_STAGING_CONFIRMED:'true',HOST:'::',OPENAI_MODEL:'gpt-6.1-sol',OPENAI_API_KEY:'fixture-staging-not-a-real-key',API_TOKEN:'fixture-staging-only-token-32-characters',ADMIN_ACCESS_KEY:'fixture-independent-admin-key-32-characters',AI_MODE:'openai',RESEARCH_MODE:'live',STORAGE_MODE:'local',DATA_DIR:'/data',SECURITY_DB_PATH:'/data/security.sqlite',PUBLIC_ACCESS_ENABLED:'true',PUBLIC_AI_ENABLED:'false',ALLOWED_ORIGINS:'https://web-live-ai-staging.up.railway.app',AI_INPUT_USD_PER_MILLION:'4',AI_OUTPUT_USD_PER_MILLION:'15',AI_WEB_SEARCH_USD_PER_CALL:'0.01'};
test('isolated live staging fails closed for missing credentials, unsafe limits and the wrong environment',()=>{
 const c=liveStagingConfig(fixture);assert.equal(c.publicAccess.aiEnabled,false);assert.equal(c.researchMode,'live');
 for(const change of [{RAILWAY_ENVIRONMENT_NAME:'production'},{RAILWAY_ENVIRONMENT_NAME:'public-access-staging'},{LIVE_AI_STAGING_CONFIRMED:'false'},{OPENAI_API_KEY:undefined},{AI_MODE:'local'},{RESEARCH_MODE:'demo'},{STAGING_MOCK_PROVIDERS:'true'},{PUBLIC_ACCESS_ENABLED:'false'},{DATA_DIR:'/production'},{SECURITY_DB_PATH:'/tmp/security.sqlite'},{ALLOWED_ORIGINS:'https://web-production.up.railway.app'},{PUBLIC_AI_REQUESTS_PER_DAY:'51'},{PUBLIC_MAX_CONCURRENT_AI_REQUESTS_PER_SESSION:'11'},{GLOBAL_MAX_CONCURRENT_AI_REQUESTS:'31'},{PUBLIC_MAX_WORKSPACES_PER_SESSION:'51'},{GLOBAL_DAILY_AI_BUDGET_USD:'31'},{ADMIN_DAILY_AI_BUDGET_USD:'31'},{AI_INPUT_USD_PER_MILLION:'0.1'},{AI_OUTPUT_USD_PER_MILLION:'0.1'},{AI_WEB_SEARCH_USD_PER_CALL:'0'},{OPENAI_MODEL:'unverified-model'},{API_TOKEN:'<placeholder-do-not-deploy-value>'}])assert.throws(()=>liveStagingConfig({...fixture,...change}));
});
test('live staging accepts the tenfold beta limits',()=>{
 const c=liveStagingConfig({...fixture,PUBLIC_AI_REQUESTS_PER_DAY:'50',PUBLIC_MAX_CONCURRENT_AI_REQUESTS_PER_SESSION:'10',GLOBAL_MAX_CONCURRENT_AI_REQUESTS:'30',PUBLIC_MAX_WORKSPACES_PER_SESSION:'50',GLOBAL_DAILY_AI_BUDGET_USD:'30',ADMIN_DAILY_AI_BUDGET_USD:'30'});
 assert.deepEqual([c.publicAccess.dailyCalls,c.publicAccess.sessionConcurrency,c.publicAccess.globalConcurrency,c.publicAccess.maxProjects,c.publicAccess.dailyBudget,c.publicAccess.adminBudget],[50,10,30,50,30,30]);
});
test('health distinguishes real SDK implementation from injected mocks without exposing credentials',async()=>{
 const config=loadConfig({AI_MODE:'local',RESEARCH_MODE:'demo',STORAGE_MODE:'memory',LOG_LEVEL:'silent'});
 const injected=await buildApp({config,planner:createPlanner({mode:'local',model:'fixture',timeoutMs:1000}),search:createSearchProvider({mode:'demo',model:'fixture',timeoutMs:1000})});
 try{assert.deepEqual((await injected.inject('/api/health')).json().configuration.providers,{ai:'injected',research:'injected'});}finally{await injected.close();}
 const sdk=await buildApp({config:loadConfig({AI_MODE:'openai',RESEARCH_MODE:'live',OPENAI_API_KEY:'fixture-never-dispatched',STORAGE_MODE:'memory',LOG_LEVEL:'silent'})});
 try{const r=await sdk.inject('/api/health');assert.deepEqual(r.json().configuration.providers,{ai:'openai_sdk',research:'openai_sdk'});assert(!r.body.includes('fixture-never-dispatched'));}finally{await sdk.close();}
});
