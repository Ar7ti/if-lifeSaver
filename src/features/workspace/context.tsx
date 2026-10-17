import { createContext, useContext } from 'react';
import type { LifeProject } from '@contracts';
import type { useProjectWriter } from '@/hooks/useProject';

export interface WorkspaceContextValue {
  project: LifeProject;
  writer: ReturnType<typeof useProjectWriter>;
  /** Opens the assistant, optionally with a message ready to send. */
  ask: (message?: string) => void;
  editDetails: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside a workspace');
  return ctx;
}
