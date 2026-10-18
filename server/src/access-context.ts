import { AsyncLocalStorage } from 'node:async_hooks';

export interface Principal { id: string; role: 'anonymous' | 'admin'; expiresAt: number }
export interface AccessContext {
  principal: Principal;
  meter: <T>(body: unknown, dispatch: () => Promise<T>) => Promise<T>;
}
// Request-scoped identity, never supplied by a model or request body.
export const accessContext = new AsyncLocalStorage<AccessContext>();
export function paidProviderCall<T>(body: unknown, dispatch: () => Promise<T>): Promise<T> {
  const context = accessContext.getStore();
  return context ? context.meter(body, dispatch) : dispatch();
}
