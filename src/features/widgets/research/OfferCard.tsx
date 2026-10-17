import { Check, ExternalLink, MapPin, MessageSquareText, Plus, Truck, X } from 'lucide-react';
import type { CartItem, Offer } from '@contracts';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { formatMoney, hostOf } from '@/lib/format';
import { cn } from '@/lib/cn';
import { OfferImage } from './OfferImage';
import { availabilityLabel, conditionLabel, priceStatusLabel, sellerTypeLabel, verificationLabel } from './labels';

/** The server explains its score as "Score 75/100: … ; … . Sentence. Sentence." Split it into readable reasons. */
function reasons(offer: Offer) {
  const text = offer.recommendation.replace(/^Score \d+\/100:\s*/, '');
  return text
    .split(/(?<=\.)\s+|;\s*/)
    .map(s => s.trim().replace(/\.$/, ''))
    .filter(Boolean)
    .slice(0, 8);
}

export function OfferCard({ offer, inCart, stale, comparing, onAdd, onRemove, onCompare, onContact, adding, removing }: {
  offer: Offer;
  inCart: CartItem | undefined;
  stale: boolean;
  comparing: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onCompare: (on: boolean) => void;
  onContact: () => void;
  adding: boolean;
  removing: boolean;
}) {
  const price = priceStatusLabel[offer.priceStatus];
  const verify = verificationLabel[offer.verificationStatus];
  const condition = conditionLabel[offer.condition];
  const availability = availabilityLabel[offer.availability];
  const host = hostOf(offer.sourceUrl);
  const canAdd = offer.priceMinor !== null && offer.availability !== 'out_of_stock' && !stale;
  const canContact = offer.seller.type === 'private' || offer.kind === 'service';
  const why = reasons(offer);

  return (
    <article className={cn('flex min-w-0 flex-col rounded-[10px] border bg-surface p-3 transition-colors duration-200', inCart ? 'border-blue/40' : 'border-hairline hover:border-hairline-strong')} aria-label={offer.title}>
      <div className="relative">
        <OfferImage offer={offer} />
        <span className="absolute top-2 left-2 rounded-full bg-surface/95 px-2 py-0.5 text-caption font-semibold tabular shadow-[0_1px_2px_rgba(0,0,0,0.08)]" title="Match score from the research engine">
          {Math.round(offer.score)}
          <span className="font-normal text-graphite">/100 match</span>
        </span>
      </div>

      <div className="mt-3 flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="line-clamp-2 text-body-sm font-semibold leading-snug" title={offer.title}>
          {offer.title}
        </h3>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[20px] font-semibold tracking-[-0.4px] tabular">{offer.priceMinor === null ? 'Price unknown' : formatMoney(offer.priceMinor)}</span>
          {offer.priceMinor !== null && (
            <Pill tone={price.tone} title={price.hint}>
              {price.label}
            </Pill>
          )}
        </div>

        <dl className="flex flex-col gap-1 text-caption text-graphite">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Seller</dt>
            <dd className="truncate">
              <span className="font-medium text-ink/80">{offer.seller.name ?? host ?? offer.sourceName}</span> · {sellerTypeLabel[offer.seller.type]}
              {offer.seller.verified && ' · verified seller'}
            </dd>
          </div>
          {(condition || availability) && (
            <div>
              <dt className="sr-only">Condition</dt>
              <dd>{[condition, availability].filter(Boolean).join(' · ')}</dd>
            </div>
          )}
          <div className="flex items-start gap-1.5">
            <dt>
              <MapPin className="mt-px size-3.5" aria-hidden />
              <span className="sr-only">Location</span>
            </dt>
            <dd>{offer.location ?? 'Location not stated'}</dd>
          </div>
          <div className="flex items-start gap-1.5">
            <dt>
              <Truck className="mt-px size-3.5" aria-hidden />
              <span className="sr-only">Delivery</span>
            </dt>
            <dd className="line-clamp-2" title={offer.delivery.details}>
              {offer.delivery.costMinor !== null ? `Delivery ${formatMoney(offer.delivery.costMinor)}` : offer.delivery.available === false ? 'No delivery: pickup only' : 'Delivery cost unknown'}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-1">
          <Pill tone={verify.tone} title={verify.hint}>
            {verify.label}
          </Pill>
        </div>

        <details className="group rounded-button bg-canvas px-3 py-2 text-caption">
          <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-ink/85 [&::-webkit-details-marker]:hidden">
            Why did AI choose this?
            <Plus className="size-3.5 transition-transform duration-200 group-open:rotate-45" aria-hidden />
          </summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-graphite">
            {why.map(r => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {offer.evidence.length > 0 && (
            <>
              <p className="mt-2 font-medium text-ink/80">Evidence</p>
              <ul className="mt-1 flex flex-col gap-1 text-graphite">
                {offer.evidence.map(e => (
                  <li key={e} className="break-words">
                    {e}
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-hairline pt-3">
        {inCart ? (
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-body-sm font-medium text-blue-ink">
              <Check className="size-4" aria-hidden /> In your plan
            </span>
            <Button size="sm" variant="text" icon={<X />} loading={removing} onClick={onRemove}>
              Remove
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="md" icon={<Plus />} loading={adding} disabled={!canAdd} onClick={onAdd} className="w-full justify-center">
            Add to plan
          </Button>
        )}
        {!canAdd && !inCart && (
          <p className="text-caption text-graphite">{stale ? 'Search again: your constraints changed.' : offer.priceMinor === null ? 'Needs a confirmed price before it can be planned.' : 'Listed as out of stock.'}</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-1">
          <label className="flex cursor-pointer items-center gap-2 rounded-button px-1 py-1 text-caption font-medium text-ink/80 hover:bg-hover">
            <input type="checkbox" checked={comparing} onChange={e => onCompare(e.target.checked)} className="size-3.5 accent-blue" />
            Compare
          </label>
          <div className="flex items-center">
            {canContact && (
              <Button size="sm" variant="text" icon={<MessageSquareText />} onClick={onContact} className="px-2 text-caption">
                {offer.kind === 'service' ? 'Draft quote request' : 'Ask AI to contact seller'}
              </Button>
            )}
            {offer.sourceUrl && (
              <a href={offer.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-button px-2 text-caption font-medium text-blue-ink hover:bg-sky-tint" title={offer.sourceUrl}>
                {host ?? 'Source'} <ExternalLink className="size-3" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
