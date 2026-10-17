import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LifeProject, ProjectTask } from '@contracts';
import { useWorkspace } from '@/features/workspace/context';

/** Optimistic task status change; rolls back if the server rejects it. */
export function useTaskStatus() {
  const { project, writer } = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: ProjectTask['status'] }) => writer.api.patchProject(project.id, { tasks: [v] }),
    onMutate: async v => {
      await qc.cancelQueries({ queryKey: writer.key });
      const previous = qc.getQueryData<LifeProject>(writer.key);
      qc.setQueryData<LifeProject>(writer.key, old => (old ? { ...old, tasks: old.tasks.map(t => (t.id === v.id ? { ...t, status: v.status } : t)) } : old));
      return { previous };
    },
    onError: (error, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(writer.key, ctx.previous);
      writer.fail(error);
    },
    onSuccess: p => writer.setProject(p),
  });
}
