import { z } from 'zod';
import path from 'node:path';

const EnvSchema = z.object({
  HOST: z.string().default('127.0.0.1'), PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  OPENAI_API_KEY: z.string().min(1).optional(), OPENAI_MODEL: z.string().min(1).default('gpt-6.1-sol'),
  AI_MODE: z.enum(['openai','local']).optional(), RESEARCH_MODE: z.enum(['live','demo','unavailable']).optional(),
  STORAGE_MODE: z.enum(['local','memory']).default('local'), DATA_DIR: z.string().default('data'),
  API_TOKEN: z.string().min(24).optional(), ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000), RESEARCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(90000),
  LOG_LEVEL: z.enum(['silent','error','warn','info','debug']).default('info'),
  PUBLIC_ACCESS_ENABLED:z.enum(['true','false']).default('false'), PUBLIC_AI_ENABLED:z.enum(['true','false']).default('false'),
  SECURITY_DB_PATH:z.string().optional(), ADMIN_ACCESS_KEY:z.string().min(32).max(512).optional(),
  SESSION_TTL_SECONDS:z.coerce.number().int().min(60).max(31536000).default(2592000),
  ADMIN_SESSION_TTL_SECONDS:z.coerce.number().int().min(60).max(86400).default(3600),
  SESSION_COOKIE_SECURE:z.enum(['true','false']).default('true'),
  PUBLIC_AI_REQUESTS_PER_DAY:z.coerce.number().int().min(0).max(10000).default(5),
  PUBLIC_MAX_CONCURRENT_AI_REQUESTS_PER_SESSION:z.coerce.number().int().min(1).max(10).default(1),
  GLOBAL_MAX_CONCURRENT_AI_REQUESTS:z.coerce.number().int().min(1).max(100).default(3),
  PUBLIC_MAX_WORKSPACES_PER_SESSION:z.coerce.number().int().min(1).max(100).default(5),
  GLOBAL_DAILY_AI_BUDGET_USD:z.coerce.number().min(0).max(10000).default(3),
  ADMIN_DAILY_AI_BUDGET_USD:z.coerce.number().min(0).max(10000).default(3),
  AI_INPUT_USD_PER_MILLION:z.coerce.number().min(0).max(10000).optional(),
  AI_OUTPUT_USD_PER_MILLION:z.coerce.number().min(0).max(10000).optional(),
  AI_WEB_SEARCH_USD_PER_CALL:z.coerce.number().min(0).max(100).optional(),
  AI_RESERVED_INPUT_TOKENS:z.coerce.number().int().min(10000).max(2000000).default(200000),
  NEW_SESSIONS_PER_HOUR:z.coerce.number().int().min(1).max(10000).default(10),
  GLOBAL_NEW_SESSIONS_PER_HOUR:z.coerce.number().int().min(1).max(100000).default(100),
  EBAY_ENABLED:z.enum(['true','false']).default('false'), EBAY_ACCESS_APPROVED:z.enum(['true','false']).default('false'), EBAY_FREE_API_CONFIRMED:z.enum(['true','false']).default('false'),
  EBAY_ENVIRONMENT:z.enum(['production','sandbox']).default('sandbox'), EBAY_CLIENT_ID:z.string().min(1).optional(), EBAY_CLIENT_SECRET:z.string().min(1).optional(),
  EBAY_TIMEOUT_MS:z.coerce.number().int().min(100).max(15000).default(8000), PRODUCT_REQUESTS_PER_DAY:z.coerce.number().int().min(1).max(100).default(20),
  GLOBAL_PRODUCT_REQUESTS_PER_DAY:z.coerce.number().int().min(1).max(4000).default(100),
  IF_CLIENT_ID:z.string().min(1).optional(), IF_CLIENT_SECRET:z.string().min(1).optional(), IF_SUBSCRIPTION_KEY:z.string().min(1).optional(), IF_PARTNER_ID:z.string().min(1).optional(),
  IF_ENVIRONMENT:z.enum(['sandbox','live']).default('sandbox'), IF_TIMEOUT_MS:z.coerce.number().int().min(100).max(15000).default(8000),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid server environment: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const e = parsed.data;
  const aiMode = e.AI_MODE ?? (e.OPENAI_API_KEY ? 'openai' : 'local');
  const researchMode = e.RESEARCH_MODE ?? (e.OPENAI_API_KEY ? 'live' : 'unavailable');
  if ((aiMode === 'openai' || researchMode === 'live') && !e.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required for OpenAI/live modes');
  if (!['127.0.0.1','localhost','::1'].includes(e.HOST) && !e.API_TOKEN) throw new Error('API_TOKEN required when binding beyond loopback');
  const publicEnabled=e.PUBLIC_ACCESS_ENABLED==='true';
  if(publicEnabled&&e.STORAGE_MODE!=='local')throw new Error('Public access requires persistent local project storage');
  if(publicEnabled&&e.SESSION_COOKIE_SECURE==='false'&&!['127.0.0.1','localhost','::1'].includes(e.HOST))throw new Error('Insecure session cookies are restricted to loopback development');
  if(publicEnabled&&e.ADMIN_ACCESS_KEY&&e.ADMIN_ACCESS_KEY===e.API_TOKEN)throw new Error('ADMIN_ACCESS_KEY must be independent of API_TOKEN');
  if(publicEnabled&&e.PUBLIC_AI_ENABLED==='true'&&(aiMode==='openai'||researchMode==='live')&&[e.AI_INPUT_USD_PER_MILLION,e.AI_OUTPUT_USD_PER_MILLION,e.AI_WEB_SEARCH_USD_PER_CALL].some(v=>v===undefined))throw new Error('Public paid AI requires explicit model and web-search pricing configuration');
  if(publicEnabled&&!e.ADMIN_ACCESS_KEY)throw new Error('Public access requires an independent ADMIN_ACCESS_KEY');
  const origins = e.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  if (origins.some(s => { try { const u = new URL(s); return !['http:','https:'].includes(u.protocol) || u.origin !== s; } catch { return true; } })) throw new Error('ALLOWED_ORIGINS must contain exact HTTP(S) origins');
  return {host:e.HOST, port:e.PORT, apiKey:e.OPENAI_API_KEY, model:e.OPENAI_MODEL, aiMode, researchMode, storageMode:e.STORAGE_MODE, dataDir:path.resolve(e.DATA_DIR), apiToken:e.API_TOKEN, origins, aiTimeoutMs:e.AI_TIMEOUT_MS, researchTimeoutMs:e.RESEARCH_TIMEOUT_MS, logLevel:e.LOG_LEVEL,
    publicAccess:{enabled:publicEnabled,aiEnabled:e.PUBLIC_AI_ENABLED==='true',dbPath:path.resolve(e.SECURITY_DB_PATH??path.join(e.DATA_DIR,'security.sqlite')),adminKey:e.ADMIN_ACCESS_KEY,secureCookie:e.SESSION_COOKIE_SECURE==='true',sessionTtl:e.SESSION_TTL_SECONDS,adminTtl:e.ADMIN_SESSION_TTL_SECONDS,dailyCalls:e.PUBLIC_AI_REQUESTS_PER_DAY,sessionConcurrency:e.PUBLIC_MAX_CONCURRENT_AI_REQUESTS_PER_SESSION,globalConcurrency:e.GLOBAL_MAX_CONCURRENT_AI_REQUESTS,maxProjects:e.PUBLIC_MAX_WORKSPACES_PER_SESSION,dailyBudget:e.GLOBAL_DAILY_AI_BUDGET_USD,adminBudget:e.ADMIN_DAILY_AI_BUDGET_USD,inputRate:e.AI_INPUT_USD_PER_MILLION,outputRate:e.AI_OUTPUT_USD_PER_MILLION,searchRate:e.AI_WEB_SEARCH_USD_PER_CALL,reservedInputTokens:e.AI_RESERVED_INPUT_TOKENS,newSessions:e.NEW_SESSIONS_PER_HOUR,globalNewSessions:e.GLOBAL_NEW_SESSIONS_PER_HOUR},
    products:{enabled:e.EBAY_ENABLED==='true',approved:e.EBAY_ACCESS_APPROVED==='true',freeApiConfirmed:e.EBAY_FREE_API_CONFIRMED==='true',environment:e.EBAY_ENVIRONMENT,clientId:e.EBAY_CLIENT_ID,clientSecret:e.EBAY_CLIENT_SECRET,timeoutMs:e.EBAY_TIMEOUT_MS,dailyRequests:e.PRODUCT_REQUESTS_PER_DAY,globalDailyRequests:e.GLOBAL_PRODUCT_REQUESTS_PER_DAY},
    ifInsurance:{clientId:e.IF_CLIENT_ID,clientSecret:e.IF_CLIENT_SECRET,subscriptionKey:e.IF_SUBSCRIPTION_KEY,partnerId:e.IF_PARTNER_ID,environment:e.IF_ENVIRONMENT,timeoutMs:e.IF_TIMEOUT_MS}};
}
export type Config = ReturnType<typeof loadConfig>;
