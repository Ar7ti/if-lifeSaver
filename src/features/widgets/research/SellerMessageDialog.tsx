import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, Info } from 'lucide-react';
import type { Offer } from '@contracts';
import { useWorkspace } from '@/features/workspace/context';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { hostOf } from '@/lib/format';

/** Drafts a message for the person to send themselves. Nothing is ever sent from here. */
export function SellerMessageDialog({ offer, onClose }: { offer: Offer | null; onClose: () => void }) {
  const { project, writer } = useWorkspace();
  const [language, setLanguage] = useState<'en' | 'fi'>(project.locale);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = useMutation({
    mutationFn: (lang: 'en' | 'fi') => writer.api.sellerMessage(project.id, { offerId: offer!.id, language: lang }),
    onSuccess: res => setDraft(res.draft),
  });

  useEffect(() => {
    if (!offer) return;
    setDraft('');
    setCopied(false);
    generate.mutate(language);
  }, [offer?.id]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const handoff = generate.data?.handoffUrl ?? offer?.sourceUrl ?? null;
  const isService = offer?.kind === 'service';

  return (
    <Dialog
      open={Boolean(offer)}
      onClose={onClose}
      title={isService ? 'Request a quote' : 'Contact the seller'}
      description={offer ? <>A draft about <strong className="font-medium text-ink">{offer.title}</strong>. Edit it, then send it yourself from the listing.</> : null}
      footer={
        <>
          {handoff && (
            <a href={handoff} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-button px-[15px] text-body-sm font-medium text-ink/90 hover:bg-hover">
              <ExternalLink className="size-4" aria-hidden /> Open listing on {hostOf(handoff)}
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
          <Button variant="primary" icon={copied ? <Check /> : <Copy />} onClick={copy} disabled={!draft}>
            {copied ? 'Copied' : 'Copy message'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-body-sm font-medium" id="draft-label">
            Your message
          </span>
          <Segmented
            size="sm"
            label="Message language"
            value={language}
            onChange={lang => {
              setLanguage(lang);
              generate.mutate(lang);
            }}
            options={[
              { value: 'en', label: 'English' },
              { value: 'fi', label: 'Suomi' },
            ]}
          />
        </div>
        {generate.isPending ? (
          <div className="flex flex-col gap-2 rounded-button border border-hairline p-3" aria-label="Writing draft">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : generate.isError ? (
          <ErrorState error={generate.error} onRetry={() => generate.mutate(language)} />
        ) : (
          <Textarea aria-labelledby="draft-label" rows={7} value={draft} onChange={e => setDraft(e.target.value)} />
        )}
        <ul className="flex flex-col gap-1.5">
          {(generate.data?.warnings ?? ['This is a draft. Copy and send it yourself after review.']).map(w => (
            <li key={w} className="flex items-start gap-2 text-body-sm text-graphite">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
