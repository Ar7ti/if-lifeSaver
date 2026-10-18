import { Check, ExternalLink, MessageSquareText, Plus, X } from 'lucide-react';
import type { CartItem, Offer, ResearchFeedback } from '@contracts';
import { Button } from '@/components/ui/Button';
import { formatMoney, hostOf } from '@/lib/format';
import { cn } from '@/lib/cn';
import { OfferImage } from './OfferImage';
import { conditionLabel, priceStatusLabel, sellerTypeLabel, verificationLabel } from './labels';
import { TIER_LABEL, type Tier } from './tiers';

/** Plain-language reasons, derived only from facts present in the offer data. */
export function offerReasons(offer: Offer, envelopeLeftMinor: number | null, city: string | null): string[] {
  const out: string[] = [];
  if (offer.currency==='EUR' && offer.priceMinor !== null && envelopeLeftMinor !== null && offer.priceMinor + (offer.delivery.costMinor ?? 0) <= envelopeLeftMinor) out.push(offer.delivery.costMinor===null?'Reported price within budget':'Known costs within budget');
  const place = city?.split(',')[0]?.trim();
  if (place && offer.location?.toLowerCase().includes(place.toLowerCase())) out.push(`In ${place}`);
  if (offer.kind==='product' && offer.delivery.costMinor !== null) out.push(offer.delivery.costMinor === 0 ? 'Free delivery' : 'Delivery price listed');
  if (offer.condition === 'new') out.push('New condition');
  if (offer.verificationStatus === 'source_checked') out.push(offer.product?'Provider API':'Cited source');
  return out.slice(0, 2);
}

export function OfferCard({ offer, tier, reasons, inCart, stale, comparing, onAdd, onRemove, onCompare, onContact, adding, removing, onReplace, feedback, onFeedback, feedbackPending }: {
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
  onReplace?: () => void;
  feedback?:ResearchFeedback;
  onFeedback?:(type:ResearchFeedback['type']|null)=>void;
  feedbackPending?:boolean;
}) {
  const price = priceStatusLabel[offer.priceStatus];
  const host = hostOf(offer.sourceUrl);
  const canAdd = offer.currency==='EUR' && offer.eligibilityStatus!=='potential' && (!feedback||feedback.type==='useful') && offer.priceMinor !== null && offer.availability !== 'out_of_stock' && !stale;
  const canContact = offer.seller.type === 'private' || offer.kind === 'service';
  const condition = conditionLabel[offer.condition];
  const meta = [
    offer.seller.name ?? host ?? offer.sourceName,
    offer.seller.type === 'private' ? sellerTypeLabel.private : null,
    condition && offer.condition !== 'unknown' ? condition : offer.eligibilityStatus?'Condition unconfirmed':null,
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
        {offer.product&&<p className="text-caption text-graphite">{offer.product.provider==='serpapi'?'Google Shopping · SerpApi · source-reported':offer.product.provider!=='ebay'?'Product metadata · source-reported':offer.product.sourceMode==='sandbox'?'eBay Sandbox · test inventory':'eBay Browse API · provider-reported'}{offer.currency!=='EUR'?' · no EUR conversion':''}</p>}
        {offer.eligibilityStatus&&<p className={cn('text-caption font-medium',offer.eligibilityStatus==='potential'?'text-warn-ink':'text-ok-ink')}>{offer.eligibilityStatus==='potential'?'Potential match · check details':'Matches your criteria'}</p>}
        <h3 className="line-clamp-2 text-body-sm leading-snug font-medium" title={offer.title}>
          {offer.title}
        </h3>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[19px] font-semibold tracking-[-0.3px] tabular">{offer.priceMinor === null ? 'Price unknown' : formatMoney(offer.priceMinor,{currency:offer.currency})}</span>
          {offer.reportedRate&&<span className="text-caption text-graphite">{formatMoney(offer.reportedRate.amountMinor,{currency:offer.currency})}/{offer.reportedRate.period} source-listed · total unknown</span>}
          {offer.priceMinor !== null && offer.priceStatus !== 'verified' && (
            <span className="text-caption text-warn-ink" title={price.hint}>
              {offer.priceStatus === 'demo' ? 'demo price' : offer.priceOrigin==='source_reported'?'source-listed · confirm':'estimate'}
            </span>
          )}
        </p>
        <p className="text-caption text-graphite">{meta.join(' · ')}</p>
        {offer.product?.providerConvertedPrice&&<p className="text-caption text-graphite">Provider display conversion: {formatMoney(offer.product.providerConvertedPrice.amountMinor,{currency:offer.product.providerConvertedPrice.currency})}. No sourced FX rate/date; this conversion is not used for planning.</p>}
        {offer.product&&<p className="text-caption text-graphite">Shipping: {offer.delivery.costMinor===null?'unknown':formatMoney(offer.delivery.costMinor,{currency:offer.currency})}. Known subtotal: {offer.product.knownTotalMinor===null?'incomplete':formatMoney(offer.product.knownTotalMinor,{currency:offer.currency})}. Additional charges may apply.</p>}
        {offer.currency!=='EUR'&&<p className="text-caption text-warn-ink">Original currency retained. A sourced conversion is needed before adding this to the EUR plan.</p>}
        {offer.sourceType&&<p className="text-caption text-graphite">{offer.sourceType==='listing'?'Source-reported listing':offer.sourceType==='information'?'Information · not a personalized quote':offer.sourceType==='category'?'Category page · not a specific listing':'Unverified lead'} · link access not independently checked</p>}
        {offer.eligibilityStatus==='potential'&&<ul className="space-y-1 text-caption text-warn-ink">{offer.missingEvidence?.filter(m=>m.required).slice(0,3).map(m=><li key={m.field}>{m.reason}</li>)}</ul>}
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
          <summary className="cursor-pointer font-medium hover:text-ink">{offer.product?'Why this matches':'Why AI chose this'}</summary>
          <p className="mt-1.5 break-words">{offer.confidenceExplanation??offer.recommendation}</p>
          {offer.missingEvidence&&<ul className="mt-2 list-disc space-y-1 pl-4">{offer.missingEvidence.map(m=><li key={m.field}>{m.field}: {m.reason}{m.required?' Required for a supported match.':''}</li>)}</ul>}
          {offer.evidenceByField&&<dl className="mt-2 space-y-2">{Object.entries(offer.evidenceByField).map(([field,e])=>e&&<div key={field}><dt className="font-medium capitalize">{field} · {e.status==='source_supported'?'Supported by source':e.status.replaceAll('_',' ')}</dt>{e.snippet&&<dd className="mt-0.5 break-words">{e.snippet}</dd>}</div>)}</dl>}
          {offer.evidenceByField&&<p className="mt-2">{offer.product?'API fields are provider-reported; they are not independent inspection of the item, seller or current stock.':'Cited summaries are not independent inspection of the listing, seller or current stock.'}</p>}
          <p className="mt-1.5">
            {offer.product?'Provider-reported fields; current seller and inventory details need checking.':`${verificationLabel[offer.verificationStatus].label}: ${verificationLabel[offer.verificationStatus].hint}`}
          </p>
          {offer.location && <p className="mt-1.5">Location: {offer.location}</p>}
        </details>
      </div>

      {onFeedback&&<label className="mt-3 px-1.5 text-caption text-graphite">Feedback
        <select aria-label={`Feedback on ${offer.title}`} value={feedback?.type??''} disabled={feedbackPending} onChange={e=>onFeedback((e.target.value||null) as ResearchFeedback['type']|null)} className="mt-1 h-8 w-full rounded-button border border-hairline bg-surface px-2 text-caption text-ink">
          <option value="">No feedback</option><option value="useful">Useful</option><option value="not_relevant">Not relevant</option><option value="outdated">Outdated</option><option value="incorrect_details">Wrong price or details</option>
        </select>
      </label>}
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
        {!canAdd && !inCart && <p className="text-caption text-graphite">{offer.currency!=='EUR'?'Currency conversion is required before planning this expense.':offer.eligibilityStatus==='potential'?'Review the source and missing details before planning an expense.':feedback&&feedback.type!=='useful'?'Clear this source feedback before selecting.':stale ? 'Search again: your details changed.' : offer.priceMinor === null ? 'Needs a confirmed price first.' : 'Listed as out of stock.'}</p>}
        {onReplace&&!inCart&&<Button size="sm" variant="text" onClick={onReplace} disabled={!canAdd}>Replace a planned item</Button>}
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
                {offer.product?.linkDestination==='google_product'?'View on Google Shopping':host ?? 'Source'} <ExternalLink className="size-3" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
