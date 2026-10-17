import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { create } from 'zustand';
import { AlertTriangle, ChevronDown, Info, Loader2, PenLine, RotateCw, Search, SearchX, Sparkles } from 'lucide-react';
import type { Offer, ResearchResult, WorkspaceWidget } from '@contracts';
import { useWorkspace } from '@/features/workspace/context';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Pill } from '@/components/ui/Pill';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { formatMoney, humanizeCategory, pluralize, relativeTime } from '@/lib/format';
import { toast } from '@/stores/toast';
import { cn } from '@/lib/cn';
import { OfferCard } from './OfferCard';
import { CompareDialog } from './CompareDialog';
import { SellerMessageDialog } from './SellerMessageDialog';
import { ManualItemDialog } from './ManualItemDialog';
import { STALE_PREFIX } from './labels';

type Kind = Offer['kind'];

/** Empty results carry no offers to infer their kind from, so remember which widget ran them. */
const useRunKinds = create<{ kinds: Record<string, Kind>; mark: (id: string, kind: Kind) => void }>(set => ({
  kinds: {},
  mark: (id, kind) => set(s => ({ kinds: { ...s.kinds, [id]: kind } })),
}));

const SERVICE_HINT = /mov|van|transport|truck|clean|storage|service|insur|electric|internet|broadband|lock|removal/;

function resultKind(r: ResearchResult, known: Record<string, Kind>): Kind {
  if (r.offers.length) return r.offers.some(o => o.kind === 'service') && !r.offers.some(o => o.kind === 'product') ? 'service' : 'product';
  return known[r.id] ?? (SERVICE_HINT.test(r.category) ? 'service' : 'product');
}

function toSlug(text: string) {
  let s = text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
  if (s && !/^[a-z]/.test(s)) s = `x_${s}`.slice(0, 50);
  return s;
}

const PRODUCT_PREFS = ['Used is fine', 'New only', 'Delivery needed', 'Local pickup', 'Compact size'];
const SERVICE_PREFS = ['Fixed price', 'Weekend availability', 'Includes packing', 'Insurance included'];
const SERVICE_STARTERS = ['Moving company', 'Van rental', 'Moving boxes', 'Cleaning service'];
const PRODUCT_STARTERS = ['Bed frame', 'Sofa', 'Desk', 'Fridge'];

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

type Sort = 'recommended' | 'price_asc' | 'price_desc';

export function ResearchCatalog({ kind, widget }: { kind: Kind; widget: WorkspaceWidget }) {
  const { project, writer, ask } = useWorkspace();
  const { kinds, mark } = useRunKinds();

  // ---- research runs for this widget ----
  const results = useMemo(
    () =>
      project.researchResults
        .filter(r => resultKind(r, kinds) === kind)
        .filter(r => !widget.config.category || r.category === widget.config.category)
        .sort((a, b) => a.searchedAt.localeCompare(b.searchedAt)),
    [project.researchResults, kinds, kind, widget.config.category],
  );
  const latest = useMemo(() => {
    const map = new Map<string, ResearchResult>();
    for (const r of results) map.set(r.category, r);
    return [...map.values()].reverse();
  }, [results]);

  const [active, setActive] = useState<string | null>(null);
  const current = latest.find(r => r.category === active) ?? latest[0] ?? null;

  // ---- new search ----
  const [query, setQuery] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [prefs, setPrefs] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [lastRequest, setLastRequest] = useState<string | null>(null);

  const research = useMutation({
    mutationFn: async (input: { text: string; max: number | undefined; prefs: string[] }) => {
      const category = toSlug(input.text);
      return writer.api.research(project.id, {
        category,
        kind,
        maxPrice: input.max,
        preferences: [`Looking for: ${input.text}`.slice(0, 200), ...input.prefs],
      });
    },
    onSuccess: result => {
      mark(result.id, kind);
      setActive(result.category);
      setFormOpen(false);
      void writer.refresh();
      if (result.status === 'unavailable') toast.info('Search returned no options', result.warnings[0]);
      else toast.success(`${pluralize(result.offers.length, 'option')} found`, result.mode === 'demo' ? 'Fictional demo offers.' : 'Check each source before deciding.');
    },
    onError: writer.reloadOnConflict,
  });
  const elapsed = useElapsed(research.isPending);

  function startSearch(text: string, e?: FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!toSlug(t)) {
      document.getElementById(`q-${widget.id}`)?.focus();
      return;
    }
    const max = maxPrice.trim() ? Number(maxPrice.replace(',', '.')) : undefined;
    setLastRequest(t);
    research.mutate({ text: t, max: max !== undefined && Number.isFinite(max) && max >= 0 ? Math.round(max * 100) / 100 : undefined, prefs });
  }

  // ---- filters ----
  const [text, setText] = useState('');
  const [sort, setSort] = useState<Sort>('recommended');
  const [condition, setCondition] = useState<'any' | 'new' | 'used'>('any');
  const [seller, setSeller] = useState<'any' | 'company' | 'private'>('any');
  const [fitBudget, setFitBudget] = useState(false);

  const envelope = project.budget.categories.find(c => c.id === current?.category);
  const envelopeLeft = envelope ? envelope.allocatedMinor - envelope.committedMinor - envelope.proposedMinor : null;

  const offers = useMemo(() => {
    if (!current) return [];
    let list = current.offers.filter(o => o.kind === kind || current.offers.every(x => x.kind !== kind));
    if (text.trim()) list = list.filter(o => `${o.title} ${o.description} ${o.seller.name ?? ''} ${o.location ?? ''}`.toLowerCase().includes(text.trim().toLowerCase()));
    if (condition !== 'any') list = list.filter(o => (condition === 'used' ? o.condition === 'used' || o.condition === 'refurbished' : o.condition === 'new'));
    if (seller !== 'any') list = list.filter(o => o.seller.type === seller);
    if (fitBudget && envelopeLeft !== null) list = list.filter(o => o.priceMinor !== null && o.priceMinor + (o.delivery.costMinor ?? 0) <= envelopeLeft);
    const price = (o: Offer) => o.priceMinor ?? Number.MAX_SAFE_INTEGER;
    return [...list].sort((a, b) => (sort === 'recommended' ? b.score - a.score : sort === 'price_asc' ? price(a) - price(b) : price(b) - price(a)));
  }, [current, kind, text, condition, seller, fitBudget, envelopeLeft, sort]);

  const stale = Boolean(current?.warnings.some(w => w.startsWith(STALE_PREFIX)));

  // ---- cart ----
  const cartByOffer = new Map(project.cart.filter(i => i.offerId).map(i => [i.offerId!, i]));
  const [pendingOffer, setPendingOffer] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: (offer: Offer) => writer.api.addCartItem(project.id, { offerId: offer.id, quantity: 1, status: 'selected' }),
    onMutate: offer => setPendingOffer(offer.id),
    onSuccess: (res, offer) => {
      writer.applyCart(res);
      toast.success('Added to your plan', `${offer.title}. Nothing has been bought.`);
    },
    onError: writer.fail,
    onSettled: () => setPendingOffer(null),
  });
  const remove = useMutation({
    mutationFn: (itemId: string) => writer.api.deleteCartItem(project.id, itemId),
    onMutate: id => setPendingOffer(project.cart.find(i => i.id === id)?.offerId ?? null),
    onSuccess: res => writer.applyCart(res),
    onError: writer.fail,
    onSettled: () => setPendingOffer(null),
  });

  // ---- compare + contact ----
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [contact, setContact] = useState<Offer | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const compareOffers = (current?.offers ?? []).filter(o => compare.includes(o.id));
  useEffect(() => setCompare([]), [current?.id]);

  const starters = kind === 'service' ? SERVICE_STARTERS : PRODUCT_STARTERS;
  const prefOptions = kind === 'service' ? SERVICE_PREFS : PRODUCT_PREFS;
  const location = project.location ?? 'your destination';
  const showForm = formOpen || (!current && !research.isPending);

  return (
    <div className="@container flex flex-col gap-4">
      {/* Search */}
      {showForm ? (
        <form onSubmit={e => startSearch(query, e)} className="flex flex-col gap-3 rounded-[10px] bg-canvas p-4">
          <div className="flex flex-col gap-2 @lg:flex-row">
            <label className="sr-only" htmlFor={`q-${widget.id}`}>
              {kind === 'service' ? 'Which service do you need?' : 'What are you looking for?'}
            </label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone" aria-hidden />
              <Input id={`q-${widget.id}`} value={query} maxLength={60} onChange={e => setQuery(e.target.value)} placeholder={kind === 'service' ? 'e.g. Moving company' : 'e.g. Bed frame 90×200'} className="h-10 pl-9" />
            </div>
            <div className="relative @lg:w-36">
              <label className="sr-only" htmlFor={`max-${widget.id}`}>
                Maximum price in euros
              </label>
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body-sm text-graphite" aria-hidden>
                Max €
              </span>
              <Input id={`max-${widget.id}`} inputMode="decimal" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="Any" className="h-10 pl-14" />
            </div>
            <Button type="submit" variant="ghost" size="md" className="h-10" icon={<Sparkles />}>
              Research
            </Button>
            {latest.length > 0 && (
              <Button variant="text" className="h-10" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
            )}
          </div>
          <fieldset className="flex flex-wrap items-center gap-1.5">
            <legend className="sr-only">Preferences</legend>
            {prefOptions.map(p => {
              const on = prefs.includes(p);
              return (
                <label key={p} className={cn('cursor-pointer rounded-full border px-2.5 py-1 text-caption font-medium transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue', on ? 'border-blue bg-sky-tint text-blue-ink' : 'border-hairline-strong bg-surface text-ink/75 hover:bg-hover')}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => setPrefs(ps => (on ? ps.filter(x => x !== p) : [...ps, p]))} />
                  {p}
                </label>
              );
            })}
          </fieldset>
          {starters.length > 0 && !current && (
            <div className="flex flex-wrap items-center gap-1.5 text-caption text-graphite">
              <span>Try:</span>
              {starters.map(s => (
                <button key={s} type="button" onClick={() => { setQuery(s); startSearch(s); }} className="rounded-small border border-ink/15 bg-surface px-2 py-0.5 font-medium text-ink/85 hover:bg-hover">
                  {s}
                </button>
              ))}
            </div>
          )}
          <p className="text-caption text-graphite">
            Searches public listings near {location}. Prices found by search are estimates until you confirm them at the source.
          </p>
        </form>
      ) : (
        latest.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5" role="group" aria-label="Your searches">
              {latest.map(r => (
                <button
                  key={r.id}
                  aria-pressed={current?.id === r.id}
                  onClick={() => setActive(r.category)}
                  className={cn('rounded-full px-3 py-1 text-body-sm font-medium transition-colors duration-200', current?.id === r.id ? 'bg-midnight text-white' : 'bg-ink/[0.05] text-ink/75 hover:bg-ink/[0.09]')}
                >
                  {humanizeCategory(r.category)} <span className={cn('tabular', current?.id === r.id ? 'text-white/70' : 'text-graphite')}>{r.offers.length}</span>
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" icon={<Search />} onClick={() => setFormOpen(true)} disabled={research.isPending}>
              New search
            </Button>
          </div>
        )
      )}

      {/* Live progress */}
      {research.isPending && (
        <div role="status" className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-[10px] bg-sky-tint px-4 py-3 text-body-sm text-blue-ink">
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            <p className="min-w-0 flex-1">
              Researching <strong className="font-semibold">{lastRequest}</strong> near {location}. Live research can take up to 90 seconds.
            </p>
            <span className="tabular shrink-0 text-caption" aria-hidden>
              {elapsed}s
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4" aria-hidden>
            {[0, 1, 2].map(i => (
              <div key={i} className={cn('rounded-[10px] border border-hairline p-3', i === 2 && 'hidden @3xl:block')}>
                <Skeleton className="aspect-[4/3] w-full" />
                <Skeleton className="mt-3 h-4 w-4/5" />
                <Skeleton className="mt-2 h-5 w-1/3" />
                <Skeleton className="mt-3 h-3 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      )}

      {research.isError && (
        <div className="flex flex-col gap-2">
          <ErrorState error={research.error} onRetry={() => lastRequest && startSearch(lastRequest)} />
          {['RESEARCH_UNAVAILABLE', 'UPSTREAM_TIMEOUT', 'TIMEOUT'].includes((research.error as { code?: string }).code ?? '') && (
            <Button size="sm" variant="text" icon={<PenLine />} className="self-start" onClick={() => setManualOpen(true)}>
              Add your own estimate instead
            </Button>
          )}
        </div>
      )}

      {/* Results */}
      {current && !research.isPending && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-caption text-graphite">
            <Pill tone={current.mode === 'live' ? 'ok' : current.mode === 'demo' ? 'warn' : 'neutral'}>{current.mode === 'live' ? 'Live research' : current.mode === 'demo' ? 'Demo data' : 'Search unavailable'}</Pill>
            {current.status === 'limited' && <Pill tone="neutral">Limited results</Pill>}
            <span>
              {pluralize(current.offers.length, 'option')} · searched {relativeTime(current.searchedAt)}
            </span>
            {envelopeLeft !== null && (
              <span className="ml-auto">
                {humanizeCategory(envelope!.title)} envelope:{' '}
                <strong className={cn('font-semibold tabular', envelopeLeft < 0 ? 'text-danger-ink' : 'text-ink')}>{envelopeLeft < 0 ? `${formatMoney(-envelopeLeft)} over` : `${formatMoney(envelopeLeft)} left`}</strong>
              </span>
            )}
          </div>

          {stale && (
            <div className="flex flex-wrap items-center gap-3 rounded-[10px] bg-warn-tint px-4 py-3 text-body-sm text-warn-ink" role="status">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              <p className="min-w-0 flex-1">Your constraints changed after this search, so these options can&rsquo;t be added. Search again for matching ones.</p>
              <Button size="sm" variant="outline" icon={<RotateCw />} onClick={() => startSearch(humanizeCategory(current.category))}>
                Search again
              </Button>
            </div>
          )}

          {current.warnings.filter(w => !w.startsWith(STALE_PREFIX)).length > 0 && (
            <details className="group rounded-[10px] border border-hairline px-4 py-2.5 text-body-sm">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-ink/85 [&::-webkit-details-marker]:hidden">
                <Info className="size-4 text-graphite" aria-hidden />
                About these results
                <span className="text-graphite">({current.warnings.filter(w => !w.startsWith(STALE_PREFIX)).length} notes)</span>
                <ChevronDown className="ml-auto size-4 text-graphite transition-transform duration-200 group-open:rotate-180" aria-hidden />
              </summary>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-graphite">
                {current.warnings
                  .filter(w => !w.startsWith(STALE_PREFIX))
                  .map(w => (
                    <li key={w}>{w}</li>
                  ))}
              </ul>
            </details>
          )}

          {current.offers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-40 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-stone" aria-hidden />
                <Input aria-label="Filter options" value={text} onChange={e => setText(e.target.value)} placeholder="Filter" className="h-8 pl-8" />
              </div>
              <Select aria-label="Sort options" value={sort} onChange={e => setSort(e.target.value as Sort)} className="h-8 w-auto">
                <option value="recommended">Best match</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </Select>
              {kind === 'product' && (
                <Segmented
                  size="sm"
                  label="Condition"
                  value={condition}
                  onChange={setCondition}
                  options={[
                    { value: 'any', label: 'Any' },
                    { value: 'new', label: 'New' },
                    { value: 'used', label: 'Used' },
                  ]}
                />
              )}
              <Select aria-label="Seller type" value={seller} onChange={e => setSeller(e.target.value as typeof seller)} className="h-8 w-auto">
                <option value="any">All sellers</option>
                <option value="company">Businesses</option>
                <option value="private">Private sellers</option>
              </Select>
              {envelopeLeft !== null && (
                <label className="flex cursor-pointer items-center gap-2 rounded-button px-1.5 py-1 text-caption font-medium text-ink/80 hover:bg-hover">
                  <input type="checkbox" checked={fitBudget} onChange={e => setFitBudget(e.target.checked)} className="size-3.5 accent-blue" />
                  Fits envelope
                </label>
              )}
            </div>
          )}

          {current.offers.length === 0 ? (
            <EmptyState
              icon={<SearchX />}
              title={current.status === 'unavailable' ? 'Research is unavailable right now' : 'No matching options found'}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" variant="outline" icon={<Search />} onClick={() => setFormOpen(true)}>
                    Try another search
                  </Button>
                  <Button size="sm" variant="text" icon={<PenLine />} onClick={() => setManualOpen(true)}>
                    Add your own estimate
                  </Button>
                </div>
              }
            >
              {current.warnings[0] ?? 'Try a broader description or a higher maximum price.'}
            </EmptyState>
          ) : offers.length === 0 ? (
            <EmptyState icon={<SearchX />} title="No options match these filters" action={<Button size="sm" variant="outline" onClick={() => { setText(''); setCondition('any'); setSeller('any'); setFitBudget(false); }}>Clear filters</Button>} />
          ) : (
            <ul className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4">
              {offers.map(o => (
                <li key={o.id} className="flex">
                  <OfferCard
                    offer={o}
                    inCart={cartByOffer.get(o.id)}
                    stale={stale}
                    comparing={compare.includes(o.id)}
                    adding={add.isPending && pendingOffer === o.id}
                    removing={remove.isPending && pendingOffer === o.id}
                    onAdd={() => add.mutate(o)}
                    onRemove={() => {
                      const item = cartByOffer.get(o.id);
                      if (item) remove.mutate(item.id);
                    }}
                    onCompare={on => {
                      if (on && compare.length >= 4) {
                        toast.info('Compare up to 4 options', 'Remove one to add another.');
                        return;
                      }
                      setCompare(c => (on ? [...c, o.id] : c.filter(x => x !== o.id)));
                    }}
                    onContact={() => setContact(o)}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button size="sm" variant="text" icon={<Sparkles />} onClick={() => ask(`Find cheaper ${humanizeCategory(current.category).toLowerCase()} options`)} className="text-blue-ink">
              Ask the assistant for alternatives
            </Button>
            <Button size="sm" variant="text" icon={<PenLine />} onClick={() => setManualOpen(true)}>
              Add your own estimate
            </Button>
          </div>
        </div>
      )}

      {compare.length > 0 && (
        <div className="sticky bottom-20 z-10 flex items-center gap-3 rounded-card bg-midnight px-4 py-2.5 text-body-sm text-white shadow-float md:bottom-4" role="region" aria-label="Comparison">
          <span className="min-w-0 flex-1">{compare.length === 1 ? 'Select one more to compare' : `${compare.length} options selected`}</span>
          <Button size="sm" variant="text" className="text-white hover:bg-white/10" onClick={() => setCompare([])}>
            Clear
          </Button>
          <Button size="sm" variant="ghost" disabled={compare.length < 2} onClick={() => setCompareOpen(true)}>
            Compare
          </Button>
        </div>
      )}

      <CompareDialog offers={compareOffers} open={compareOpen && compareOffers.length >= 2} onClose={() => setCompareOpen(false)} />
      <SellerMessageDialog offer={contact} onClose={() => setContact(null)} />
      <ManualItemDialog open={manualOpen} onClose={() => setManualOpen(false)} defaultCategory={envelope?.id} />
    </div>
  );
}
