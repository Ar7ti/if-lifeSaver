import path from 'node:path';
import {loadConfig} from './config.js';

/** Explicit entry point only; never changes production or mock-staging defaults. */
export function liveStagingConfig(env:NodeJS.ProcessEnv){
 if(env.RAILWAY_ENVIRONMENT_NAME!=='live-ai-staging'||env.LIVE_AI_STAGING_CONFIRMED!=='true')throw new Error('Live staging requires its isolated environment and explicit confirmation.');
 const config=loadConfig(env),p=config.publicAccess;
 if(config.aiMode!=='openai'||config.researchMode!=='live'||!config.apiKey||env.STAGING_MOCK_PROVIDERS==='true')throw new Error('Live staging requires real server-side providers.');
 if(config.model!=='gpt-6.1-sol')throw new Error('Verify model capability and pricing before changing the staging model.');
 // Conservative long-context Standard rates checked against official docs on
 // 2026-10-18; this is an estimate, never a guaranteed provider spending cap.
 if((p.inputRate??0)<4||(p.outputRate??0)<15||(p.searchRate??0)<0.01||p.reservedInputTokens<200000)throw new Error('Live staging requires reviewed conservative token/search reservations.');
 if(!p.enabled||!p.secureCookie||config.storageMode!=='local'||config.dataDir!=='/data'||!p.dbPath.startsWith('/data/'))throw new Error('Live staging requires secure persistent sessions on its own /data volume.');
 if(!p.adminKey||!config.apiToken||p.adminKey===config.apiToken||/[<>]/.test(p.adminKey+config.apiToken+config.apiKey))throw new Error('Configure fresh staging-only secrets through private Railway variables.');
 if(p.dailyCalls>5||p.sessionConcurrency!==1||p.globalConcurrency>3||p.maxProjects>5||p.dailyBudget>3||p.adminBudget>3)throw new Error('Live staging limits exceed the reviewed beta safety policy.');
 if(!config.origins.length||config.origins.some(origin=>{const u=new URL(origin);return u.protocol!=='https:'||!u.hostname.includes('live-ai-staging')||/public-access-staging|production/.test(u.hostname);}))throw new Error('Live staging origins must identify the new HTTPS environment only.');
 if(path.resolve(p.dbPath)===config.dataDir)throw new Error('Security storage needs a SQLite filename.');
 return config;
}
