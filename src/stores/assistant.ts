import { create } from 'zustand';
import type { AgentAction } from '@contracts';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  /** Snapshot of proposals; live status is read from project.actions by id. */
  actions?: AgentAction[];
  at: string;
}

interface AssistantState {
  threads: Record<string, ChatMessage[]>;
  drafts: Record<string, string>;
  /** Bumped to ask the panel to focus its input. */
  focusTick: number;
  push: (projectId: string, message: Omit<ChatMessage, 'id' | 'at'>) => void;
  setDraft: (projectId: string, text: string) => void;
  requestFocus: () => void;
}

let n = 0;
export const useAssistant = create<AssistantState>(set => ({
  threads: {},
  drafts: {},
  focusTick: 0,
  push: (projectId, message) =>
    set(s => ({ threads: { ...s.threads, [projectId]: [...(s.threads[projectId] ?? []), { ...message, id: `m${++n}`, at: new Date().toISOString() }] } })),
  setDraft: (projectId, text) => set(s => ({ drafts: { ...s.drafts, [projectId]: text } })),
  requestFocus: () => set(s => ({ focusTick: s.focusTick + 1 })),
}));
