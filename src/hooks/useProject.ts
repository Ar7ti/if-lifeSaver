import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { CartResponse, LifeProject } from '@contracts';
import { ApiError, describeError, useApi } from '@/api';
import { useProjects } from '@/stores/projects';
import { toast } from '@/stores/toast';
import type { DataSource } from '@/stores/settings';

export const projectKey = (source: DataSource, id: string) => ['project', source, id] as const;

export function useProject(id: string) {
  const qc=useQueryClient();
  const api = useApi();
  const remember = useProjects(s => s.remember);
  return useQuery({
    queryKey: projectKey(api.source, id),
    queryFn: async () => {
      const fetched = await api.getProject(id);
      const cached=qc.getQueryData<LifeProject>(projectKey(api.source,id));
      const project=cached&&cached.revision>fetched.revision?cached:fetched;
      remember(project, api.source);
      return project;
    },
    retry: (count, error) => !(error instanceof ApiError && [400, 401, 404].includes(error.status)) && count < 2,
  });
}

/** Shared write helpers: every mutation result replaces the cached project, then derived data is refetched. */
export function useProjectWriter(id: string) {
  const api = useApi();
  const qc = useQueryClient();
  const remember = useProjects(s => s.remember);
  const key = projectKey(api.source, id);

  const setProject = useCallback(
    (project: LifeProject) => {
      void qc.cancelQueries({queryKey:key});
      const current=qc.setQueryData<LifeProject>(key,old=>old&&old.revision>project.revision?old:project);
      if(current)remember(current, api.source);
    },
    [qc, api.source, id, remember],
  );

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: key }), [qc, api.source, id]);

  /** Cart responses carry the recalculated budget; scenarios and risks come from a fresh GET. */
  const applyCart = useCallback(
    (response: CartResponse) => {
      qc.setQueryData<LifeProject>(key, old => (old&&old.revision>response.revision?old:old ? { ...old, cart: response.items, budget: response.budget, revision: response.revision } : old));
      void refresh();
    },
    [qc, refresh],
  );

  const fail = useCallback(
    (error: unknown) => {
      const { title, detail } = describeError(error);
      toast.error(title, detail);
      if (error instanceof ApiError && error.status === 409) void refresh();
    },
    [refresh],
  );

  /** For forms that show their own inline error: only reload on a stale-revision conflict. */
  const reloadOnConflict = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 409) void refresh();
    },
    [refresh],
  );

  return useMemo(() => ({ api, key, setProject, applyCart, refresh, fail, reloadOnConflict }), [api, api.source, id, setProject, applyCart, refresh, fail, reloadOnConflict]); // key derives from api.source + id
}
