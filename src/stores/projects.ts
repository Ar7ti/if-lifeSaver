import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/storage';
import type { LifeProject } from '@contracts';
import type { DataSource } from './settings';

/** The API has no "list projects" route, so this browser remembers the projects it created. */
export interface ProjectSummary {
  id: string;
  title: string;
  location: string | null;
  totalMinor: number;
  committedMinor: number;
  tasksDone: number;
  tasksTotal: number;
  source: DataSource;
  updatedAt: string;
}

interface ProjectsState {
  projects: ProjectSummary[];
  remember: (project: LifeProject, source: DataSource) => void;
  forget: (id: string) => void;
  restore: (summary: ProjectSummary) => void;
}

export function summarize(project: LifeProject, source: DataSource): ProjectSummary {
  return {
    id: project.id,
    title: project.title,
    location: project.location,
    totalMinor: project.budget.totalMinor,
    committedMinor: project.budget.committedMinor,
    tasksDone: project.tasks.filter(t => t.status === 'done').length,
    tasksTotal: project.tasks.length,
    source,
    updatedAt: project.updatedAt,
  };
}

export const useProjects = create<ProjectsState>()(
  persist(
    set => ({
      projects: [],
      remember: (project, source) =>
        set(state => {
          const next = summarize(project, source);
          const rest = state.projects.filter(p => p.id !== project.id);
          return { projects: [next, ...rest].slice(0, 50) };
        }),
      forget: id => set(state => ({ projects: state.projects.filter(p => p.id !== id) })),
      restore: summary =>
        set(state => ({ projects: [...state.projects.filter(p => p.id !== summary.id), summary].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) })),
    }),
    { name: 'lifesim.projects', storage: safeStorage },
  ),
);
