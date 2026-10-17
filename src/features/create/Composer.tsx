import { isChatSubmitKey } from '@/lib/keyboard';
import { forwardRef, useImperativeHandle, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useReducedMotion } from 'motion/react';
import { useTypewriter } from './useTypewriter';

export interface ComposerHandle {
  fill: (text: string) => void;
}

const MAX = 2000;

/** The natural-language entry point. Submitting hands the message to the creation screen. */
export const Composer = forwardRef<ComposerHandle, { className?: string; autoFocus?: boolean; size?: 'lg' | 'md'; typingExamples?: string[] }>(function Composer(
  { className, autoFocus, size = 'lg', typingExamples },
  ref,
) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const reduce = useReducedMotion();
  // Decorative only: the label stays "What are you planning?" for assistive tech.
  const typed = useTypewriter(typingExamples ?? [], Boolean(typingExamples?.length) && !focused && value === '' && !reduce);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

  useImperativeHandle(ref, () => ({
    fill: text => {
      setValue(text);
      setError(null);
      requestAnimationFrame(() => {
        const el = textarea.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(text.length, text.length);
      });
    },
  }));

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const message = value.trim();
    if (message.length < 8) {
      setError('Tell us a little more: what are you planning, where, and roughly what budget?');
      textarea.current?.focus();
      return;
    }
    navigate('/create', { state: { message } });
  }

  return (
    <form onSubmit={submit} className={cn('w-full', className)} noValidate>
      <div
        className={cn(
          'card group relative flex flex-col text-left transition-[border-color,box-shadow] duration-200 focus-within:border-blue/60 focus-within:shadow-[0_0_0_4px_rgba(0,117,222,0.12)]',
          error && 'border-danger-ink/50',
        )}
      >
        <label htmlFor="life-prompt" className="sr-only">
          What are you planning?
        </label>
        <textarea
          id="life-prompt"
          ref={textarea}
          value={value}
          autoFocus={autoFocus}
          maxLength={MAX}
          rows={size === 'lg' ? 3 : 4}
          onChange={e => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={e => {
            if (isChatSubmitKey(e.nativeEvent)) submit(e);
          }}
          placeholder={typed ? `${typed}▍` : 'What are you planning?'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'life-prompt-error' : 'life-prompt-hint'}
          className={cn(
            'w-full resize-none bg-transparent px-5 pt-5 text-ink placeholder:text-stone focus:outline-none',
            size === 'lg' ? 'text-[18px] leading-[1.5] sm:text-subheading sm:leading-[1.45]' : 'text-body',
          )}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-2 pb-4 sm:pl-5">
          <p id="life-prompt-hint" className="flex items-center gap-1.5 text-caption text-stone">
            <Sparkles className="size-3.5" aria-hidden />
            Mention where, when and your budget for a sharper plan.
          </p>
          <Button type="submit" variant="primary" size={size === 'lg' ? 'lg' : 'md'} icon={<ArrowRight />} className="flex-row-reverse max-sm:w-full max-sm:justify-center">
            Create my workspace
          </Button>
        </div>
      </div>
      {error && (
        <p id="life-prompt-error" role="alert" className="mt-2 text-left text-body-sm text-danger-ink">
          {error}
        </p>
      )}
    </form>
  );
});
