import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/storage';
import type { SimulationScenario } from '@contracts';

type ScenarioId = SimulationScenario['id'];
export type FurnitureClass = 'all' | 'economy' | 'mid' | 'premium';

interface UiState {
  sidebarCollapsed: boolean;
  assistantOpen: boolean;
  /** Per-project, per-widget collapse state. Layout order/size/visibility live on the server. */
  collapsed: Record<string, Record<string, boolean>>;
  /** The scenario a person chose to plan around. The API has no field for this, so it stays local. */
  chosenScenario: Record<string, ScenarioId>;
  furnitureClass: Record<string, FurnitureClass>;
  /** Tasks a person starred as priority. The API has no priority field, so this stays local. */
  starred: Record<string, string[]>;
  toggleSidebar: () => void;
  setFurnitureClass: (projectId: string, value: FurnitureClass) => void;
  toggleStar: (projectId: string, taskId: string) => void;
  setAssistantOpen: (open: boolean) => void;
  toggleCollapsed: (projectId: string, widgetId: string) => void;
  chooseScenario: (projectId: string, id: ScenarioId | null) => void;
}

export const useUi = create<UiState>()(
  persist(
    set => ({
      sidebarCollapsed: false,
      assistantOpen: false,
      collapsed: {},
      chosenScenario: {},
      furnitureClass: {},
      starred: {},
      setFurnitureClass: (projectId, value) => set(s => ({ furnitureClass: { ...s.furnitureClass, [projectId]: value } })),
      toggleStar: (projectId, taskId) =>
        set(s => {
          const list = s.starred[projectId] ?? [];
          return { starred: { ...s.starred, [projectId]: list.includes(taskId) ? list.filter(x => x !== taskId) : [...list, taskId] } };
        }),
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setAssistantOpen: assistantOpen => set({ assistantOpen }),
      toggleCollapsed: (projectId, widgetId) =>
        set(s => {
          const forProject = { ...(s.collapsed[projectId] ?? {}) };
          forProject[widgetId] = !forProject[widgetId];
          return { collapsed: { ...s.collapsed, [projectId]: forProject } };
        }),
      chooseScenario: (projectId, id) =>
        set(s => {
          const next = { ...s.chosenScenario };
          if (id) next[projectId] = id;
          else delete next[projectId];
          return { chosenScenario: next };
        }),
    }),
    { name: 'lifesim.ui', storage: safeStorage },
  ),
);
