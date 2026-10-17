import { Check, ExternalLink, MessageSquareText, Plus, X } from 'lucide-react';
import type { CartItem, Offer } from '@contracts';
import { Button } from '@/components/ui/Button';
import { formatMoney, hostOf } from '@/lib/format';
import { cn } from '@/lib/cn';
import { OfferImage } from './OfferImage';
import { conditionLabel, priceStatusLabel, sellerTypeLabel, verificationLabel } from './labels';
import { TIER_LABEL, type Tier } from './tiers';

/** Plain-language reasons, derived only from facts present in the offer data. */
export function offerReasons(offer: Offer, envelopeLeftMinor: number | null, city: string | null): string[] {
  const out: string[] = [];
  if (offer.priceMinor !== null && envelopeLeftMinor !== null && offer.priceMinor + (offer.delivery.costMinor ?? 0) <= envelopeLeftMinor) out.push(offer.delivery.costMinor===null?'Reported price within budget':'Known costs within budget');
  const place = city?.split(',')[0]?.trim();
  if (place && offer.location?.toLowerCase().includes(place.toLowerCase())) out.push(`In ${place}`);
  if (offer.kind==='product' && offer.delivery.costMinor !== null) out.push(offer.delivery.costMinor === 0 ? 'Free delivery' : 'Delivery price listed');
  if (offer.condition === 'new') out.push('New condition');
  if (offer.verificationStatus === 'source_checked') out.push('Cited source');
  return out.slice(0, 2);
}

export function OfferCard({ offer, tier, reasons, inCart, stale, comparing, onAdd, onRemove, onCompare, onContact, adding, removing }: {
  offer: Offer;
  tier: Tier | undefined;
  reasons: string[];
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
  const host = hostOf(offer.sourceUrl);
  const canAdd = offer.priceMinor !== null && offer.availability !== 'out_of_stock' && !stale;
  const canContact = offer.seller.type === 'private' || offer.kind === 'service';
  const condition = conditionLabel[offer.condition];
  const meta = [
    offer.seller.name ?? host ?? offer.sourceName,
    offer.seller.type === 'private' ? sellerTypeLabel.private : null,
    condition && offer.condition !== 'unknown' ? condition : null,
    offer.kind==='service' ? 'Confirm all fees and terms' : offer.delivery.costMinor !== null ? `Delivery ${formatMoney(offer.delivery.costMinor)}` : offer.delivery.available === false ? 'Pickup only' : 'Delivery unknown',
  ].filter(Boolean);

  return (
    <article
      className={cn('flex min-w-0 flex-1 flex-col rounded-card bg-surface p-2.5 ring-1 transition-[box-shadow] duration-200', inCart ? 'ring-blue/40' : 'ring-hairline hover:ring-hairline-strong')}
      aria-label={offer.title}
    >
      {/* Services rarely have photos: skip the empty image block instead of showing a large placeholder. */}
      {(offer.imageUrl || offer.kind !== 'service') && (
        <div className="relative">
          <OfferImage offer={offer} className="aspect-[16/10]" />
          {tier && <span className="absolute top-2 left-2 rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-medium text-ink/80">{TIER_LABEL[tier]}</span>}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-1.5 px-1.5 pt-3">
        <h3 className="line-clamp-2 text-body-sm leading-snug font-medium" title={offer.title}>
          {offer.title}
        </h3>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[19px] font-semibold tracking-[-0.3px] tabular">{offer.priceMinor === null ? 'Price unknown' : formatMoney(offer.priceMinor)}</span>
          {offer.priceMinor !== null && offer.priceStatus !== 'verified' && (
            <span className="text-caption text-warn-ink" title={price.hint}>
              {offer.priceStatus === 'demo' ? 'demo price' : 'estimate'}
            </span>
          )}
        </p>
        <p className="text-caption text-graphite">{meta.join(' · ')}</p>
        {reasons.length > 0 && (
          <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-ok-ink">
            {reasons.map(r => (
              <li key={r} className="flex items-center gap-1">
                <Check className="size-3" aria-hidden /> {r}
              </li>
            ))}
          </ul>
        )}
        <details className="text-caption text-graphite">
          <summary className="cursor-pointer font-medium hover:text-ink">Why AI chose this</summary>
          <p className="mt-1.5 break-words">{offer.recommendation}</p>
          <p className="mt-1.5">
            {verificationLabel[offer.verificationStatus].label}: {verificationLabel[offer.verificationStatus].hint}
          </p>
          {offer.location && <p className="mt-1.5">Location: {offer.location}</p>}
        </details>
      </div>

      <div className="mt-3 flex flex-col gap-1.5 px-1.5 pb-1">
        {inCart ? (
          <div className="flex h-9 items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-body-sm font-medium text-blue-ink">
              <Check className="size-4" aria-hidden /> In your plan
            </span>
            <Button size="sm" variant="text" icon={<X />} loading={removing} onClick={onRemove} className="text-graphite">
              Remove
            </Button>
          </div>
        ) : (
          <Button variant="ghost" icon={<Plus />} loading={adding} disabled={!canAdd} onClick={onAdd} className="w-full justify-center">
            Add to plan
          </Button>
        )}
        {!canAdd && !inCart && <p className="text-caption text-graphite">{stale ? 'Search again: your details changed.' : offer.priceMinor === null ? 'Needs a confirmed price first.' : 'Listed as out of stock.'}</p>}
        <div className="flex items-center justify-between gap-1">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-button py-1 pr-1 text-caption text-graphite hover:text-ink">
            <input type="checkbox" checked={comparing} onChange={e => onCompare(e.target.checked)} className="size-3.5 accent-blue" />
            Compare
          </label>
          <div className="flex items-center">
            {canContact && (
              <Button size="sm" variant="text" icon={<MessageSquareText />} onClick={onContact} className="h-8 px-2 text-caption text-graphite">
                {offer.kind === 'service' ? 'Request quote' : 'Contact seller'}
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
