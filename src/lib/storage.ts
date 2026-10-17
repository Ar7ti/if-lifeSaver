import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/** localStorage can be unavailable (private mode, blocked site data); never let that break the app. */
const safe: StateStorage = {
  getItem: name => {
    try { return localStorage.getItem(name); } catch { return null; }
  },
  setItem: (name, value) => {
    try { localStorage.setItem(name, value); } catch { /* preference only */ }
  },
  removeItem: name => {
    try { localStorage.removeItem(name); } catch { /* preference only */ }
  },
};

export const safeStorage = createJSONStorage(() => safe);
