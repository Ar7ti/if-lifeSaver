import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/storage';

export type DataSource = 'live' | 'mock';

interface SettingsState {
  /** live talks to the Life Simulator API; mock is an isolated, clearly labelled offline demo. */
  dataSource: DataSource;
  /** Optional shared deployment token (server API_TOKEN). Never an AI provider key. */
  apiToken: string;
  setDataSource: (source: DataSource) => void;
  setApiToken: (token: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    set => ({
      dataSource: 'live',
      apiToken: '',
      setDataSource: dataSource => set({ dataSource }),
      setApiToken: apiToken => set({ apiToken: apiToken.trim() }),
    }),
    { name: 'lifesim.settings', storage: safeStorage },
  ),
);
