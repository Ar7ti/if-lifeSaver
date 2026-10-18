import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, Minus, PenLine, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { itemVisual, type CartItem } from '@contracts';
import { ProductVisual } from '@/components/ui/ProductVisual';
import { ReplaceItemDialog } from './research/ReplaceItemDialog';
import { useWorkspace } from '@/features/workspace/context';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Pill } from '@/components/ui/Pill';
import { Progress } from '@/components/ui/Progress';
import { EmptyState } from '@/components/ui/States';
import { formatMoney, hostOf, humanizeCategory } from '@/lib/format';
import { toast } from '@/stores/toast';
import { cn } from '@/lib/cn';
import { ManualItemDialog } from './research/ManualItemDialog';

const priceTone = { verified: 'ok', estimated: 'warn', demo: 'warn' } as const;
const priceText = { verified: 'Verified', estimated: 'Estimate', demo: 'Demo' } as const;

export function categoryEmoji(category:string){return itemVisual(category).emoji;}

export function ShoppingCart() {
  const { project, writer } = useWorkspace();
  const { cart, budget } = project;
  const offerImages = new Map(project.researchResults.flatMap(r => r.offers).map(o => [o.id, o.imageUrl]));
  const [replacing,setReplacing]=useState<CartItem|null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const patch = useMutation({
    mutationFn: (v: { item: CartItem; quantity?: number; status?: CartItem['status'] }) => writer.api.patchCartItem(project.id, v.item.id, { quantity: v.quantity, status: v.status }),
    onMutate: v => setBusy(v.item.id),
    onSuccess: res => writer.applyCart(res),
    onError: writer.fail,
    onSettled: () => setBusy(null),
  });

  const restore = useMutation({
    mutationFn: (item: CartItem) =>
      item.offerId
        ? writer.api.addCartItem(project.id, { offerId: item.offerId, quantity: item.quantity, status: item.status })
        : writer.api.addCartItem(project.id, { title: item.title, category: item.category, quantity: item.quantity, unitPriceMinor: item.unitPriceMinor, deliveryCostMinor: item.deliveryCostMinor, status: item.status, sourceUrl: item.sourceUrl }),
    onSuccess: res => {
      writer.applyCart(res);
      toast.success('Restored to your plan');
    },
    onError: writer.fail,
  });

  const remove = useMutation({
    mutationFn: (item: CartItem) => writer.api.deleteCartItem(project.id, item.id),
    onMutate: item => setBusy(item.id),
    onSuccess: (res, item) => {
      writer.applyCart(res);
      toast.info('Removed from your plan', item.title, { label: 'Undo', onClick: () => restore.mutate(item) });
    },
    onError: writer.fail,
    onSettled: () => setBusy(null),
  });

  const planned = budget.committedMinor + budget.proposedMinor;
  const knownOffers=new Map(project.researchResults.flatMap(r=>r.offers).map(o=>[o.id,o]));
  const isService=(item:CartItem)=> item.kind?item.kind==='service':item.offerId&&knownOffers.has(item.offerId)?knownOffers.get(item.offerId)!.kind==='service':/^(accommodation|hotel|hostel|flight|train|transport|moving|education|course|inspection|registration|assembly|delivery)(?:_|$)/i.test(item.category);
  const unknownDelivery = cart.filter(i => i.deliveryCostMinor === null);

  if (cart.length === 0)
    return (
      <>
        <EmptyState
          icon={<ShoppingBag />}
          title="Your plan is empty"
          action={
            <Button size="sm" variant="outline" icon={<PenLine />} onClick={() => setManualOpen(true)}>
              Add your own estimate
            </Button>
          }
        >
          Add options from research, or your own estimates. This is a planning list: nothing is bought from here.
        </EmptyState>
        <ManualItemDialog open={manualOpen} onClose={() => setManualOpen(false)} />
      </>
    );

  return (
    <div className="flex flex-col gap-4">
      {replacing&&<ReplaceItemDialog key={replacing.id} item={replacing} onClose={()=>setReplacing(null)}/>}
      <ul className="flex flex-col divide-y divide-hairline">
        {cart.map(item => {
          const line = item.unitPriceMinor * item.quantity + (item.deliveryCostMinor ?? 0);
          const host = hostOf(item.sourceUrl);
          return (
            <li key={item.id} className={cn('flex flex-col gap-2 py-3 first:pt-0 transition-opacity duration-200', busy === item.id && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <ProductVisual compact item={{...item,imageUrl:item.imageUrl??(item.offerId?offerImages.get(item.offerId):null)}} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-body-sm font-medium" title={item.title}>
                    {item.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-graphite">
                    <span>{humanizeCategory(item.category)}</span>
                    <Pill tone={priceTone[item.priceStatus]}>{item.priceOrigin==='user'?'Your price':item.priceOrigin==='source_reported'?'Source-listed':priceText[item.priceStatus]}</Pill>
                    {item.status === 'proposed' ? <Pill tone="blue">Proposed</Pill> : <Pill tone="neutral">Chosen · fixed in scenarios</Pill>}
                    {host && (
                      <a href={item.sourceUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-ink hover:underline">
                        {host} <ExternalLink className="size-3" aria-hidden />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-body-sm font-semibold">
                    <Money minor={line} />
                  </p>
                  <p className="text-caption text-graphite tabular">
                    {item.quantity > 1 && `${item.quantity} × ${formatMoney(item.unitPriceMinor)} · `}
                    {isService(item) ? item.deliveryCostMinor===null?'additional fees unconfirmed':`incl. ${formatMoney(item.deliveryCostMinor)} extra fees` : item.deliveryCostMinor === null ? 'delivery unknown' : item.deliveryCostMinor > 0 ? `incl. ${formatMoney(item.deliveryCostMinor)} delivery` : 'no delivery fee'}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center rounded-button border border-hairline-strong" role="group" aria-label={`Quantity of ${item.title}`}>
                  <button
                    className="grid size-7 place-items-center rounded-l-button text-graphite hover:bg-hover disabled:opacity-35"
                    aria-label="Decrease quantity"
                    disabled={item.quantity <= 1 || busy === item.id}
                    onClick={() => patch.mutate({ item, quantity: item.quantity - 1 })}
                  >
                    <Minus className="size-3.5" aria-hidden />
                  </button>
                  <span className="w-7 text-center text-caption font-semibold tabular" aria-live="polite">
                    {item.quantity}
                  </span>
                  <button
                    className="grid size-7 place-items-center rounded-r-button text-graphite hover:bg-hover disabled:opacity-35"
                    aria-label="Increase quantity"
                    disabled={item.quantity >= 100 || busy === item.id}
                    onClick={() => patch.mutate({ item, quantity: item.quantity + 1 })}
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="text" onClick={()=>setReplacing(item)} disabled={busy===item.id}>Replace</Button>
                  {item.status === 'proposed' && (
                    <Button size="sm" variant="ghost" onClick={() => patch.mutate({ item, status: 'selected' })} disabled={busy === item.id}>
                      Choose
                    </Button>
                  )}
                  <Button size="sm" variant="text" icon={<Trash2 />} onClick={() => remove.mutate(item)} disabled={busy === item.id} aria-label={`Remove ${item.title}`} className="text-graphite">
                    <span className="max-sm:sr-only">Remove</span>
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="rounded-[10px] bg-canvas p-4">
        <dl className="flex flex-col gap-1.5 text-body-sm">
          <div className="flex justify-between">
            <dt className="text-graphite">Planned spending</dt>
            <dd className="font-semibold">
              <Money minor={planned} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-graphite">Left of your budget</dt>
            <dd className={cn('font-semibold', budget.remainingMinor < 0 && 'text-danger-ink')}>
              <Money minor={budget.remainingMinor} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-graphite">Free to plan (after reserve)</dt>
            <dd className={cn('font-semibold', budget.availableMinor < 0 && 'text-danger-ink')}>
              <Money minor={budget.availableMinor} />
            </dd>
          </div>
        </dl>
        <Progress className="mt-3" value={planned} max={budget.totalMinor || 1} tone={planned > budget.totalMinor - budget.emergencyReserveMinor ? 'danger' : 'blue'} label={`Planned ${formatMoney(planned)} of ${formatMoney(budget.totalMinor)}`} />
        {unknownDelivery.length > 0 && (
          <p className="mt-3 flex items-start gap-2 text-caption text-warn-ink">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            {unknownDelivery.length === 1 ? '1 item has' : `${unknownDelivery.length} items have`} unconfirmed delivery or service fees, not included above. Confirm the full total with the provider.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-graphite">A planning list, not a checkout. Nothing is bought or reserved.</p>
        <Button size="sm" variant="text" icon={<PenLine />} onClick={() => setManualOpen(true)}>
          Add estimate
        </Button>
      </div>
      <ManualItemDialog open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}
