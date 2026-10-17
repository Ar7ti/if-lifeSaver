import { useState } from 'react';
import { BedDouble, Briefcase, Package, Sofa, Truck, Refrigerator } from 'lucide-react';
import type { Offer } from '@contracts';
import { cn } from '@/lib/cn';

function iconFor(offer: Pick<Offer, 'category' | 'kind'>) {
  const c = offer.category;
  if (offer.kind === 'service') return /mov|van|transport/.test(c) ? Truck : Briefcase;
  if (/bed|mattress/.test(c)) return BedDouble;
  if (/sofa|chair|furniture|desk|table/.test(c)) return Sofa;
  if (/fridge|appliance|washer|oven/.test(c)) return Refrigerator;
  return Package;
}

/** Shows the listing's own photo when the offer data includes one; otherwise a neutral placeholder, never an invented image. */
export function OfferImage({ offer, className }: { offer: Pick<Offer, 'imageUrl' | 'title' | 'category' | 'kind'>; className?: string }) {
  const [failed, setFailed] = useState(false);
  const Icon = iconFor(offer);
  if (offer.imageUrl && !failed)
    return (
      <img
        src={offer.imageUrl}
        alt={offer.title}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn('aspect-[4/3] w-full rounded-[8px] bg-canvas object-cover outline outline-1 -outline-offset-1 outline-black/10', className)}
      />
    );
  return (
    <div className={cn('grid aspect-[4/3] w-full place-items-center rounded-[8px] bg-canvas', className)}>
      <div className="flex flex-col items-center gap-1.5 text-ink/30">
        <Icon className="size-7" strokeWidth={1.5} aria-hidden />
        <span className="text-[11px] font-medium text-graphite">No photo in listing</span>
      </div>
    </div>
  );
}
