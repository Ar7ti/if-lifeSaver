import { create } from 'zustand';

export interface Toast {
  id: number;
  title: string;
  detail?: string;
  tone: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let next = 1;
export const useToasts = create<ToastState>(set => ({
  toasts: [],
  push: toast => {
    const id = next++;
    set(s => ({ toasts: [...s.toasts.slice(-2), { ...toast, id }] }));
    // Errors and toasts with an action (e.g. Undo) stay until dismissed (WCAG 2.2.1).
    if (toast.tone !== 'error' && !toast.action) setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 4500);
  },
  dismiss: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

type Action = Toast['action'];
export const toast = {
  success: (title: string, detail?: string, action?: Action) => useToasts.getState().push({ title, detail, tone: 'success', action }),
  error: (title: string, detail?: string, action?: Action) => useToasts.getState().push({ title, detail, tone: 'error', action }),
  info: (title: string, detail?: string, action?: Action) => useToasts.getState().push({ title, detail, tone: 'info', action }),
};
