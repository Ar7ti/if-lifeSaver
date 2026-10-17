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
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid server environment: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const e = parsed.data;
  const aiMode = e.AI_MODE ?? (e.OPENAI_API_KEY ? 'openai' : 'local');
  const researchMode = e.RESEARCH_MODE ?? (e.OPENAI_API_KEY ? 'live' : 'unavailable');
  if ((aiMode === 'openai' || researchMode === 'live') && !e.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required for OpenAI/live modes');
  if (!['127.0.0.1','localhost','::1'].includes(e.HOST) && !e.API_TOKEN) throw new Error('API_TOKEN required when binding beyond loopback');
  const origins = e.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  if (origins.some(s => { try { const u = new URL(s); return !['http:','https:'].includes(u.protocol) || u.origin !== s; } catch { return true; } })) throw new Error('ALLOWED_ORIGINS must contain exact HTTP(S) origins');
  return {host:e.HOST, port:e.PORT, apiKey:e.OPENAI_API_KEY, model:e.OPENAI_MODEL, aiMode, researchMode, storageMode:e.STORAGE_MODE, dataDir:path.resolve(e.DATA_DIR), apiToken:e.API_TOKEN, origins, aiTimeoutMs:e.AI_TIMEOUT_MS, researchTimeoutMs:e.RESEARCH_TIMEOUT_MS, logLevel:e.LOG_LEVEL};
}
export type Config = ReturnType<typeof loadConfig>;
