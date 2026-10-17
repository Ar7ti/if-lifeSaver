import { isChatSubmitKey } from '@/lib/keyboard';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowUp, Loader2, X } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/context';
import { useAssistant } from '@/stores/assistant';
import { describeError } from '@/api';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { ActionCard } from './ActionCard';

const SUGGESTIONS = {moving:['Compare moving services','Review transport risks','Add a moving task'],travel:['Find cheaper accommodation','Compare transport options','Review my travel budget'],car_purchase:['Find cheaper cars','Compare ownership costs','Review vehicle inspection risks'],home_furnishing:['Compare furniture options','Review delivery costs','Find cheaper options'],student_life:['Review my student budget','Create a study logistics checklist','Find relevant courses'],other:['Review my budget','Create a checklist','Compare my options']};

function useElapsed(running: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return;
    setS(0);
    const start = Date.now();
    const t = setInterval(() => setS(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);
  return s;
}

/** Shared by the desktop side panel and the mobile sheet. */
export function AssistantPanel({ onClose, className }: { onClose?: () => void; className?: string }) {
  const { project, writer } = useWorkspace();
  const thread = useAssistant(s => s.threads[project.id]) ?? [];
  const draft = useAssistant(s => s.drafts[project.id]) ?? '';
  const focusTick = useAssistant(s => s.focusTick);
  const { push, setDraft } = useAssistant();
  const input = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const send = useMutation({
    mutationFn: (message: string) => writer.api.assistant(project.id, { message }),
    onSuccess: res => {
      push(project.id, { role: 'assistant', text: res.reply, actions: res.proposedActions });
      void writer.refresh();
    },
    onError: e => {
      const { title, detail } = describeError(e);
      push(project.id, { role: 'error', text: `${title}. ${detail}` });
      writer.reloadOnConflict(e);
    },
  });
  const elapsed = useElapsed(send.isPending);

  useEffect(() => {
    if (focusTick) input.current?.focus();
  }, [focusTick]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [thread.length, send.isPending]);

  function submit(text: string, e?: FormEvent) {
    e?.preventDefault();
    const message = text.trim();
    if (!message || send.isPending) {
      input.current?.focus();
      return;
    }
    push(project.id, { role: 'user', text: message });
    setDraft(project.id, '');
    send.mutate(message);
  }

  // Proposals from earlier sessions that still wait for a decision.
  const inThread = new Set(thread.flatMap(m => m.actions?.map(a => a.id) ?? []));
  const waiting = project.actions.filter(a => a.status === 'proposed' && !inThread.has(a.id));

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-surface', className)}>
      <header className="flex items-center gap-2 border-b border-hairline px-4 py-3">
        <img src="/illustrations/guide.png" alt="" width="36" height="36" className="size-9 shrink-0 object-contain" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-body-sm font-semibold">Assistant</h2>
          <p className="text-caption text-graphite">Proposes changes. You decide.</p>
        </div>
        {onClose && <Button size="icon-sm" variant="text" aria-label="Close assistant" icon={<X />} onClick={onClose} />}
      </header>

      <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
        {waiting.length > 0 && (
          <section aria-label="Waiting for your review" className="mb-4">
            <p className="mb-2 text-caption font-medium text-graphite">Waiting for your review</p>
            <div className="flex flex-col gap-2">
              {waiting.map(a => (
                <ActionCard key={a.id} action={a} />
              ))}
            </div>
          </section>
        )}

        {thread.length === 0 && waiting.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-body-sm text-graphite">Ask for changes in your own words. I&rsquo;ll suggest specific actions, and nothing changes until you apply it.</p>
            <ul className="flex flex-col gap-1.5">
              {SUGGESTIONS[project.scenarioType].map(s => (
                <li key={s}>
                  <button onClick={() => submit(s)} className="w-full rounded-button border border-hairline px-3 py-2 text-left text-body-sm text-ink/85 transition-colors duration-200 hover:border-hairline-strong hover:bg-hover">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ol className="flex flex-col gap-3">
          {thread.map(m => (
            <li key={m.id} className={cn('flex flex-col gap-2', m.role === 'user' && 'items-end')}>
              {m.role === 'user' ? (
                <p className="max-w-[85%] rounded-[12px] rounded-br-[4px] bg-sky-tint px-3 py-2 text-body-sm break-words text-ink">{m.text}</p>
              ) : m.role === 'error' ? (
                <p className="rounded-[10px] bg-danger-tint px-3 py-2 text-body-sm text-danger-ink" role="alert">
                  {m.text}
                </p>
              ) : (
                <>
                  <p className="text-body-sm break-words whitespace-pre-line text-ink/90">{m.text}</p>
                  {m.actions && m.actions.length > 0 && (
                    <div className="flex w-full flex-col gap-2">
                      {m.actions.map(a => (
                        <ActionCard key={a.id} action={a} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
          {send.isPending && (
            <li className="flex items-center gap-2 text-body-sm text-graphite" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Waiting for the AI planner{elapsed > 3 ? ` · ${elapsed}s` : ''}
            </li>
          )}
        </ol>
      </div>

      <form onSubmit={e => submit(draft, e)} className="border-t border-hairline p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2 rounded-card border border-hairline-strong bg-surface p-1.5 pl-3 focus-within:border-blue/60 focus-within:shadow-[0_0_0_3px_rgba(0,117,222,0.12)]">
          <label htmlFor={`assistant-${project.id}`} className="sr-only">
            Message the assistant
          </label>
          <textarea
            id={`assistant-${project.id}`}
            ref={input}
            rows={1}
            maxLength={2000}
            value={draft}
            onChange={e => setDraft(project.id, e.target.value)}
            onKeyDown={e => {
              if (isChatSubmitKey(e.nativeEvent)) submit(draft, e);
            }}
            placeholder="Ask to change your plan…"
            className="max-h-32 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-body sm:text-body-sm placeholder:text-stone focus:outline-none [field-sizing:content]"
          />
          <Button type="submit" size="icon-sm" variant="primary" aria-label="Send" icon={<ArrowUp />} disabled={send.isPending} />
        </div>
      </form>
    </div>
  );
}
