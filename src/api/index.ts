import { useSettings } from '@/stores/settings';
import { createLiveApi } from './live';
import { mockApi } from './mock';
import type { LifeSimApi } from './types';

export const liveApi = createLiveApi(() => useSettings.getState().apiToken);

/** The single entry point components use. Mock data is never mixed into live results. */
export function useApi(): LifeSimApi {
  const source = useSettings(s => s.dataSource);
  return source === 'mock' ? mockApi : liveApi;
}

export { ApiError, describeError } from './types';
export type { LifeSimApi } from './types';
