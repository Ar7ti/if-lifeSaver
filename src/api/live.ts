import type { z } from 'zod';
import {
  CartResponseSchema, CreateProjectResponseSchema, ErrorResponseSchema, HealthResponseSchema, ProjectResponseSchema,
  ResearchResultSchema, ScenariosResponseSchema, SellerMessageResponseSchema, WorkspaceResponseSchema, AssistantResponseSchema,
  HomeInsuranceResponseSchema, ProtectionCapabilitiesSchema,
} from '@contracts';
import { ApiError, type LifeSimApi } from './types';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '/api';
/** Research and AI calls can legitimately take up to ~100 s (handoff doc); the server caps at 125 s. */
const LONG_TIMEOUT = 130_000;
const SHORT_TIMEOUT = 30_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  timeout?: number;
}

export function createLiveApi(getToken: () => string): LifeSimApi {
  async function request<S extends z.ZodTypeAny>(path: string, schema: S, opts: RequestOptions = {}): Promise<z.output<S>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeout ?? SHORT_TIMEOUT);
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let response: Response;
    try {
      response = await fetch(`${BASE}${path}`, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw new ApiError('TIMEOUT', 'The request timed out', 0);
      throw new ApiError('NETWORK', 'Network request failed', 0);
    } finally {
      clearTimeout(timer);
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = ErrorResponseSchema.safeParse(payload);
      if (parsed.success) throw new ApiError(parsed.data.error.code, parsed.data.error.message, response.status, parsed.data.error.details);
      // A proxy with no backend behind it answers 5xx without our error envelope.
      if (response.status >= 500 && payload === null) throw new ApiError('NETWORK', 'Service unreachable', response.status);
      throw new ApiError('HTTP_ERROR', `Request failed (${response.status})`, response.status);
    }
    // Responses are validated against the shared contract before anything renders them.
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      console.error('[life-sim] contract mismatch', path, parsed.error.issues.slice(0, 5));
      throw new ApiError('CONTRACT_MISMATCH', 'Response did not match the shared contract', response.status);
    }
    return parsed.data;
  }

  const p = (id: string) => `/projects/${encodeURIComponent(id)}`;

  return {
    source: 'live',
    protectionCapabilities:()=>request('/protection/capabilities',ProtectionCapabilitiesSchema),
    updateProtection:async(id,body)=>(await request(`${p(id)}/protection`,ProjectResponseSchema,{method:'PATCH',body})).project,
    saveCarInsuranceDraft:async(id,body)=>(await request(`${p(id)}/protection/car/draft`,ProjectResponseSchema,{method:'PATCH',body})).project,
    requestCarInsuranceQuote:async(id,body)=>(await request(`${p(id)}/protection/car/quote`,ProjectResponseSchema,{method:'POST',body,timeout:60000})).project,
    addCarInsuranceExpense:async(id,body)=>(await request(`${p(id)}/protection/car/expense`,ProjectResponseSchema,{method:'POST',body})).project,
    removeCarInsuranceExpense:async id=>(await request(`${p(id)}/protection/car/expense`,ProjectResponseSchema,{method:'DELETE'})).project,
    homeInsurance:id=>request(`${p(id)}/home-insurance`,HomeInsuranceResponseSchema),
    saveInsuranceDetails:async(id,body)=>(await request(`${p(id)}/home-insurance/details`,ProjectResponseSchema,{method:'PATCH',body})).project,
    requestInsuranceQuote:async(id,body)=>(await request(`${p(id)}/home-insurance/quote`,ProjectResponseSchema,{method:'POST',body,timeout:60000})).project,
    addInsuranceExpense:async(id,body)=>(await request(`${p(id)}/home-insurance/expense`,ProjectResponseSchema,{method:'POST',body})).project,
    removeInsuranceExpense:async id=>(await request(`${p(id)}/home-insurance/expense`,ProjectResponseSchema,{method:'DELETE'})).project,
    health: () => request('/health', HealthResponseSchema, { timeout: 5000 }),
    createProject: input => request('/projects', CreateProjectResponseSchema, { method: 'POST', body: input, timeout: LONG_TIMEOUT }),
    getProject: async id => (await request(p(id), ProjectResponseSchema)).project,
    patchProject: async (id, patch) => (await request(p(id), ProjectResponseSchema, { method: 'PATCH', body: patch })).project,
    assistant: (id, body) => request(`${p(id)}/assistant`, AssistantResponseSchema, { method: 'POST', body, timeout: LONG_TIMEOUT }),
    research: (id, body) => request(`${p(id)}/research`, ResearchResultSchema, { method: 'POST', body, timeout: LONG_TIMEOUT }),
    addCartItem: (id, body) => request(`${p(id)}/cart/items`, CartResponseSchema, { method: 'POST', body }),
    patchCartItem: (id, itemId, body) => request(`${p(id)}/cart/items/${encodeURIComponent(itemId)}`, CartResponseSchema, { method: 'PATCH', body }),
    deleteCartItem: (id, itemId) => request(`${p(id)}/cart/items/${encodeURIComponent(itemId)}`, CartResponseSchema, { method: 'DELETE' }),
    recalculateScenarios: id => request(`${p(id)}/scenarios`, ScenariosResponseSchema, { method: 'POST' }),
    patchWorkspace: (id, body) => request(`${p(id)}/workspace`, WorkspaceResponseSchema, { method: 'PATCH', body }),
    sellerMessage: (id, body) => request(`${p(id)}/seller-message`, SellerMessageResponseSchema, { method: 'POST', body }),
    confirmAction: async (id, actionId, body) =>
      (await request(`${p(id)}/actions/${encodeURIComponent(actionId)}/confirm`, ProjectResponseSchema, { method: 'POST', body, timeout: LONG_TIMEOUT })).project,
  };
}
