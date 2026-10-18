import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { create } from 'zustand';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, Check, ChevronDown, Info, Loader2, PenLine, RotateCw, Search, SearchX, SlidersHorizontal, Sparkles } from 'lucide-react';
import { researchDismissed, researchFeedbackFor, furnitureItems, itemVisual, type ResearchFeedback, type ResearchInput, type CartItem, type Offer, type ResearchResult, type WorkspaceWidget } from '@contracts';
import { useWorkspace } from '@/features/workspace/context';
import { useUi, type FurnitureClass } from '@/stores/ui';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { hostOf, formatMoney, humanizeCategory, pluralize, relativeTime } from '@/lib/format';
import { toast } from '@/stores/toast';
import { cn } from '@/lib/cn';
import { OfferCard, offerReasons } from './OfferCard';
import {FurnitureSources} from './FurnitureSources';
import { CompareDialog } from './CompareDialog';
import { SellerMessageDialog } from './SellerMessageDialog';
import { ManualItemDialog } from './ManualItemDialog';
import { ReplaceItemDialog } from './ReplaceItemDialog';
import { STALE_PREFIX } from './labels';
import { CLASS_OPTIONS, CLASS_PREFERENCE, TIER_LABEL, tierMap } from './tiers';

type Kind = Offer['kind'];

/** Empty results carry no offers to infer their kind from, so remember which widget ran them. */
const useRunKinds = create<{ kinds: Record<string, Kind>; mark: (id: string, kind: Kind) => void }>(set => ({
  kinds: {},
  mark: (id, kind) => set(s => ({ kinds: { ...s.kinds, [id]: kind } })),
}));

const SERVICE_HINT = /mov|van|transport|truck|clean|storage|service|insur|electric|internet|broadband|lock|removal|accommodation|hotel|hostel|flight|train|rail|tour|course/;

function resultKind(r: ResearchResult, known: Record<string, Kind>): Kind {
  if (r.offers.length) return r.offers.some(o => o.kind === 'service') && !r.offers.some(o => o.kind === 'product') ? 'service' : 'product';
  return r.request?.kind ?? known[r.id] ?? (SERVICE_HINT.test(r.category) ? 'service' : 'product');
}

function toSlug(text: string) {
  let s = text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
  if (s && !/^[a-z]/.test(s)) s = `x_${s}`.slice(0, 50);
  return s;
}

/**
 * Files a search under the budget envelope it belongs to (a bed under Furniture), so the
 * offers it returns count against that envelope instead of a new, empty one.
 */
const ENVELOPE_GROUPS: [RegExp, RegExp][] = [
  [/car|vehicle/, /vehicle|purchase/],
  [/laptop|macbook|smartphone|iphone|phone/, /electronics|equipment|essentials|purchases/],
  [/hotel|hostel|accommodation|stay/, /accommodation|housing|lodging/],
  [/flight|train|rail|bus|airport/, /transport/],
  [/course|education|tuition/, /education/],
  [/bed|sofa|couch|desk|table|chair|wardrobe|shel|mattress|dresser|drawer|furniture/, /furnit/],
  [/fridge|freezer|washer|washing|oven|microwave|dishwasher|appliance|vacuum|kettle/, /applian/],
  [/towel|kitchen|lamp|curtain|bedding|essential|cutlery|pan|pot|plate/, /essential/],
  [/mov|van|truck|box|transport|removal/, /mov|transport/],
  [/clean|insur|internet|broadband|electric|service/, /service/],
];
function envelopeFor(text: string, categories: { id: string; title: string }[]) {
  const t = text.toLowerCase();
  for (const [query, envelope] of ENVELOPE_GROUPS) {
    if (!query.test(t)) continue;
    const hit = categories.find(c => envelope.test(c.id) || envelope.test(c.title.toLowerCase()));
    if (hit) return hit.id;
  }
  return null;
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
  const isProduct = kind === 'product';
  const reduce = useReducedMotion();
  const furnitureClass = useUi(s => s.furnitureClass[project.id]) ?? 'all';
  const setFurnitureClass = useUi(s => s.setFurnitureClass);

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

  const [showHidden,setShowHidden]=useState(false);
  const feedback=useMutation({mutationFn:({resultId,offerId,type}:{resultId:string;offerId:string;type:ResearchFeedback['type']|null})=>writer.api.researchFeedback(project.id,resultId,{offerId,type,expectedRevision:project.revision}),onSuccess:writer.setProject,onError:writer.fail});
  const [active, setActive] = useState<string | null>(null);
  const current = latest.find(r => r.category === active) ?? latest[0] ?? null;

  // ---- new search ----
  const [query, setQuery] = useState('');
  const [productSource,setProductSource]=useState<'auto'|'web'|'ebay'|'serpapi'>('auto');
  const [country,setCountry]=useState('');
  const [productCurrency,setProductCurrency]=useState<'EUR'|'GBP'|'USD'|'CAD'|'AUD'>('EUR');
  const [maxPrice, setMaxPrice] = useState('');
  const [prefs, setPrefs] = useState<string[]>([]);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [lastRequest, setLastRequest] = useState<string | null>(null);

  const research = useMutation({
    mutationFn: async (input: { text: string; max: number | undefined; prefs: string[];projectId:string;exact?:ResearchInput }) =>
      writer.api.research(input.projectId, input.exact??{
        category: toSlug(input.text),
        kind,
        ...(isProduct?{productSource:productSource==='auto'?undefined:productSource,country:country||undefined,currency:productCurrency,searchTerms:input.text.slice(0,100)}:{}),
        maxPrice: input.max,
        preferences: [`Looking for: ${input.text}`.slice(0, 200), ...input.prefs],
      }),
    onSuccess: async(result,input) => {
      if(input.projectId!==project.id)return;
      mark(result.id, kind);
      setActive(result.category);
      setFormOpen(false);
      await writer.refresh();
      if (result.status === 'unavailable') toast.info('Search returned no options', result.warnings[0]);
      else toast.success(!result.offers.length&&result.furnitureSearchLinks?.length?'Source searches ready':result.summary?`${result.summary.supportedCount} supported · ${result.summary.potentialCount} potential`:`${pluralize(result.offers.length, 'option')} found`, result.mode === 'demo' ? 'Fictional demo offers.' : 'Check each source before deciding.');
    },
    onError: writer.reloadOnConflict,
  });
  const elapsed = useElapsed(research.isPending);

  function startSearch(text: string, opts: { cls?: FurnitureClass; e?: FormEvent } = {}) {
    opts.e?.preventDefault();
    if(research.isPending)return;
    const t = text.trim();
    if (!toSlug(t)) {
      document.getElementById(`q-${widget.id}`)?.focus();
      return;
    }
    const max = maxPrice.trim() ? Number(maxPrice.replace(',', '.')) : undefined;
    const cls = opts.cls ?? furnitureClass;
    const classPref = isProduct && cls !== 'all' ? [CLASS_PREFERENCE[cls]] : [];
    setLastRequest(t);
    research.mutate({projectId:project.id, text: t, max: max !== undefined && Number.isFinite(max) && max >= 0 ? Math.round(max * 100) / 100 : undefined, prefs: [...classPref, ...prefs] });
  }

  function searchFurnitureSources() {
    if(research.isPending)return;
    const t=query.trim()||'Furniture';
    const max=maxPrice.trim()?Number(maxPrice.replace(',','.')):undefined;
    setLastRequest(t);
    research.mutate({projectId:project.id,text:t,max:undefined,prefs:[],exact:{category:'furniture',kind:'product',productSource:'web',country:'FI',currency:'EUR',location:project.location??undefined,
      ...(max!==undefined&&Number.isFinite(max)&&max>=0?{maxPrice:Math.round(max*100)/100}:{}),
      preferences:[`Looking for: ${t}`.slice(0,200),'Furniture sources: IKEA Finland, JYSK Finland, Tori.fi.',...prefs].slice(0,20)}});
  }

  // ---- filters ----
  const [moreFilters, setMoreFilters] = useState(false);
  const [text, setText] = useState('');
  const [sort, setSort] = useState<Sort>('recommended');
  useEffect(()=>setSort(current?.request?.sort??'recommended'),[current?.id]);
  const [condition, setCondition] = useState<'any' | 'new' | 'used'>('any');
  const [seller, setSeller] = useState<'any' | 'company' | 'private'>('any');
  const [fitBudget, setFitBudget] = useState(false);

  const envelope = project.budget.categories.find(c => c.id === current?.category || c.id === envelopeFor(current?.category ?? '', project.budget.categories));
  const envelopeLeft = envelope ? envelope.allocatedMinor - envelope.committedMinor - envelope.proposedMinor : null;
  const tiers = useMemo(() => (current&&!current.providerOrder ? tierMap(current.offers) : new Map()), [current]);

  const offers = useMemo(() => {
    if (!current) return [];
    let list = current.offers.filter(o=>showHidden||!researchDismissed(project,o)).filter(o => o.kind === kind || current.offers.every(x => x.kind !== kind));
    if (isProduct && !current.providerOrder && furnitureClass !== 'all') list = list.filter(o => tiers.get(o.id) === furnitureClass);
    if (text.trim()) list = list.filter(o => `${o.title} ${o.description} ${o.seller.name ?? ''} ${o.location ?? ''}`.toLowerCase().includes(text.trim().toLowerCase()));
    if (condition !== 'any') list = list.filter(o => (condition === 'used' ? o.condition === 'used' || o.condition === 'refurbished' : o.condition === 'new'));
    if (seller !== 'any') list = list.filter(o => o.seller.type === seller);
    if (fitBudget && envelopeLeft !== null) list = list.filter(o =>o.currency==='EUR'&& o.priceMinor !== null && o.priceMinor + (o.delivery.costMinor ?? 0) <= envelopeLeft);
    const price = (o:Offer) => current.request?.pricePeriod==='month'?(o.reportedRate?.period==='month'?o.reportedRate.amountMinor:Infinity):o.priceMinor??Infinity;
    if(current.providerOrder)return list;
    if(new Set(list.filter(o=>o.priceMinor!==null).map(o=>o.currency)).size>1)return list;
    return [...list].sort((a,b)=>Number(a.eligibilityStatus==='potential')-Number(b.eligibilityStatus==='potential')||(sort==='recommended'?b.score-a.score:!Number.isFinite(price(a))?Number.isFinite(price(b))?1:0:!Number.isFinite(price(b))?-1:sort==='price_asc'?price(a)-price(b):price(b)-price(a)));
  }, [current, kind, isProduct, furnitureClass, tiers, text, condition, seller, fitBudget, envelopeLeft, sort, showHidden, project.researchFeedback]);

  const stale = Boolean(current?.warnings.some(w => w.startsWith(STALE_PREFIX)));
  const activeFilters = [text.trim() !== '', condition !== 'any', seller !== 'any', fitBudget].filter(Boolean).length;

  const [replacement,setReplacement]=useState<{item:CartItem;offerId:string}|null>(null);
  const replaceTarget=(o:Offer)=>project.cart.find(i=>i.category===o.category||itemVisual(i.category,i.title,i.kind).category!=='unknown'&&itemVisual(i.category,i.title,i.kind).category===itemVisual(o.category,o.title,o.kind).category);
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

  const contextual = {
    moving: {products:PRODUCT_STARTERS.filter(x=>!(project.preferences.ownedItems??[]).some(item=>x.toLowerCase().includes(item.toLowerCase()))),services:SERVICE_STARTERS,prefs:SERVICE_PREFS},
    travel:{products:['Luggage','Travel essentials'],services:['Return flights','Accommodation','Airport transfer','Activities'],prefs:['Free cancellation','Total trip price','Direct route','Public transport']},
    car_purchase:{products:['Reliable used car','Small used car','Family car'],services:['Vehicle inspection','Ownership costs'],prefs:['Itemized quote','Public reviews','Local availability']},
    home_furnishing:{products:PRODUCT_STARTERS.filter(x=>!(project.preferences.ownedItems??[]).some(item=>x.toLowerCase().includes(item.toLowerCase()))),services:['Furniture delivery','Assembly service'],prefs:['Fixed price','Delivery and assembly','Weekend availability']},
    student_life:{products:['Study essentials','Laptop'],services:['Student housing','Public transport','Programming course'],prefs:['Student discount','Monthly cost','Flexible dates']},
    other:{products:['Essential purchases'],services:['Relevant local services'],prefs:['Fixed price','Local availability']},
  }[project.scenarioType];
  const starters = isProduct ? contextual.products : contextual.services;
  const prefOptions = isProduct ? PRODUCT_PREFS : contextual.prefs;
  const location = project.location ?? 'your destination';
  // Stays visible during the first search so the running suggestion is shown above the progress line.
  const showForm = formOpen || !current;

  return (
    <div className="@container flex flex-col gap-5">
      {isProduct&&Boolean(project.preferences.requiredItems?.length)&&<div aria-label="Planned shopping needs" className="flex flex-wrap gap-2">{project.preferences.requiredItems!.filter(id=>!(project.preferences.ownedItems??[]).includes(id)).map(id=>{
        const visual=itemVisual(id);const planned=project.cart.some(i=>itemVisual(i.category,i.title,i.kind).category===visual.category);
        return <button key={id} type="button" disabled={research.isPending} onClick={()=>startSearch(id)} className="flex items-center gap-2 rounded-[12px] border border-hairline bg-canvas px-3 py-2 text-left hover:border-hairline-strong"><span className="emoji text-[22px]" aria-hidden>{visual.emoji}</span><span><span className="block text-body-sm font-medium">{visual.label}</span><span className="block text-[11px] text-graphite">{planned?'In your plan':'Explore alternatives'}</span></span></button>;
      })}</div>}
      {/* Class selector: always visible for furniture, it shapes both results and new searches. */}
      {isProduct && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented label="Furniture class" value={furnitureClass} onChange={v => setFurnitureClass(project.id, v)} options={CLASS_OPTIONS} />
          {current && !showForm && (
            <Button size="sm" variant="text" icon={<Search />} onClick={() => setFormOpen(true)} disabled={research.isPending} className="text-graphite">
              New search
            </Button>
          )}
        </div>
      )}

      {/* Search */}
      {showForm ? (
        <form onSubmit={e => startSearch(query, { e })} className="flex flex-col gap-2.5">
          <div className="group/bar flex flex-col gap-1 rounded-[14px] bg-canvas p-1.5 transition-[background-color,box-shadow] duration-200 focus-within:bg-surface focus-within:shadow-[0_0_0_1px_rgb(0_0_0/0.1),0_6px_20px_rgb(0_0_0/0.06)] @lg:flex-row @lg:items-center">
            <label className="sr-only" htmlFor={`q-${widget.id}`}>
              {isProduct ? 'What are you looking for?' : 'Which service do you need?'}
            </label>
            <div className="relative flex min-w-0 flex-1 items-center">
              <Search className="pointer-events-none absolute left-3 size-4 text-stone transition-colors duration-200 group-focus-within/bar:text-blue-ink" aria-hidden />
              <input id={`q-${widget.id}`} value={query} maxLength={200} onChange={e => setQuery(e.target.value)} placeholder={`What are you looking for? e.g. ${starters[0] ?? 'Relevant options'}`} className="h-10 w-full rounded-[10px] bg-transparent pr-2 pl-9 text-body sm:text-body-sm placeholder:text-stone focus:outline-none" />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-[10px] px-3 text-body-sm text-graphite transition-colors duration-150 hover:bg-ink/[0.03] @lg:flex-none @lg:border-l @lg:border-hairline-strong @lg:rounded-none @lg:hover:bg-transparent" htmlFor={`max-${widget.id}`}>
                <span className="shrink-0">Max {isProduct?productCurrency:'EUR'}</span>
                <span className="sr-only">Maximum price in {isProduct?productCurrency:'EUR'}</span>
                <input id={`max-${widget.id}`} inputMode="decimal" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="Any" className="w-full min-w-0 bg-transparent text-body sm:text-body-sm text-ink tabular placeholder:text-stone focus:outline-none @lg:w-16" />
              </label>
              <Button type="submit" variant="primary" size="sm" className="h-9 shrink-0 rounded-[10px] px-3.5" icon={<Sparkles />} loading={research.isPending}>
                Research
              </Button>
            </div>
          </div>
          {isProduct&&<div className="flex flex-wrap gap-2 text-caption text-graphite">
            <label>Source <select aria-label="Product source" value={productSource} onChange={e=>setProductSource(e.target.value as typeof productSource)} className="h-8 rounded-button border border-hairline bg-surface px-2"><option value="auto">Automatic</option><option value="serpapi">Google Shopping · SerpApi</option><option value="ebay">eBay structured API</option><option value="web">Web research</option></select></label>
            <label>Country <select aria-label="Product country" value={country} onChange={e=>{const v=e.target.value;setCountry(v);setProductCurrency(v==='GB'?'GBP':v==='US'?'USD':v==='CA'?'CAD':v==='AU'?'AUD':'EUR');}} className="h-8 rounded-button border border-hairline bg-surface px-2"><option value="">Use project country</option><option value="FI">Finland</option><option value="DE">Germany</option><option value="GB">United Kingdom</option><option value="US">United States</option><option value="FR">France</option><option value="IT">Italy</option><option value="ES">Spain</option><option value="CA">Canada</option><option value="AU">Australia</option></select></label>
            <label>Currency <select aria-label="Product currency" value={productCurrency} onChange={e=>setProductCurrency(e.target.value as typeof productCurrency)} className="h-8 rounded-button border border-hairline bg-surface px-2">{['EUR','GBP','USD','CAD','AUD'].map(v=><option key={v}>{v}</option>)}</select></label>
          </div>}
          {isProduct&&project.scenarioType==='moving'&&(!query.trim()||furnitureItems(query).length>0||/furnitur|huonekal/i.test(query))&&(!country||country==='FI')&&/\b(?:Finland|Suomi|Turku|Helsinki|Espoo|Tampere|Vantaa|Oulu|Kuopio|Jyväskylä)\b/i.test(project.location??'')&&<Button type="button" size="sm" variant="outline" className="self-start" icon={<Search/>} disabled={research.isPending} onClick={searchFurnitureSources}>Search IKEA, JYSK &amp; Tori</Button>}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-caption text-graphite">
            {!current && (
              <>
                <span className="mr-0.5">Try</span>
                {starters.map(s => {
                  const running = research.isPending && lastRequest === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={research.isPending}
                      aria-busy={running || undefined}
                      onClick={() => { setQuery(s); startSearch(s); }}
                      className={cn('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 font-medium transition-[background-color,color,box-shadow,scale] duration-150 enabled:active:scale-[0.96] disabled:cursor-default', running ? 'bg-ink text-white' : 'text-ink/75 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] enabled:hover:bg-hover enabled:hover:text-ink disabled:opacity-60')}
                    >
                      {running && <Loader2 className="size-3 animate-spin" aria-hidden />}
                      {s}
                    </button>
                  );
                })}
              </>
            )}
            <span className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => setPrefsOpen(v => !v)} aria-expanded={prefsOpen} className="flex h-7 items-center gap-1 rounded-full px-2 font-medium transition-colors duration-150 hover:bg-hover hover:text-ink">
                <SlidersHorizontal className="size-3.5" aria-hidden /> Preferences
                {prefs.length > 0 && <span className="grid size-4 place-items-center rounded-full bg-ink text-[10px] text-white tabular">{prefs.length}</span>}
                <ChevronDown className={cn('size-3.5 transition-transform duration-200', prefsOpen && 'rotate-180')} aria-hidden />
              </button>
              {current && (
                <button type="button" onClick={() => setFormOpen(false)} className="h-7 rounded-full px-2 font-medium transition-colors duration-150 hover:bg-hover hover:text-ink">
                  Cancel
                </button>
              )}
            </span>
          </div>
          <AnimatePresence initial={false}>
            {prefsOpen && (
              <motion.fieldset key="prefs" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                <legend className="sr-only">Preferences</legend>
                <div className="flex flex-wrap gap-1.5 pt-0.5 pb-1">
                  {prefOptions.map(p => {
                    const on = prefs.includes(p);
                    return (
                      <label key={p} className={cn('relative inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-caption font-medium transition-[background-color,color,box-shadow] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue', on ? 'bg-sky-tint text-blue-ink shadow-[inset_0_0_0_1px_rgb(0_117_222/0.35)]' : 'text-ink/75 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] hover:bg-hover')}>
                        <input type="checkbox" className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0" checked={on} onChange={() => setPrefs(ps => (on ? ps.filter(x => x !== p) : [...ps, p]))} />
                        {on && <Check className="size-3" aria-hidden />}
                        {p}
                      </label>
                    );
                  })}
                </div>
              </motion.fieldset>
            )}
          </AnimatePresence>
          {!current && <p className="text-caption text-graphite">Searches public listings near {location}. Prices stay estimates until you confirm them at the source.</p>}
        </form>
      ) : (
        latest.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Your searches">
            {latest.map(r => (
              <button
                key={r.id}
                aria-pressed={current?.id === r.id}
                onClick={() => setActive(r.category)}
                className={cn('rounded-full px-3 py-1 text-body-sm font-medium transition-colors duration-200', current?.id === r.id ? 'bg-ink text-white' : 'bg-ink/[0.05] text-ink/75 hover:bg-ink/[0.09]')}
              >
                {humanizeCategory(r.category)} <span className="tabular opacity-60">{r.offers.length}</span>
              </button>
            ))}
          </div>
        )
      )}

      {/* Live progress */}
      {research.isPending && (
        <div role="status" className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <div className="relative h-[3px] overflow-hidden rounded-full bg-ink/[0.06]" aria-hidden>
              <span className="research-progress absolute inset-y-0 w-1/3 rounded-full bg-blue" />
            </div>
            <p className="flex items-center gap-2 text-body-sm text-graphite">
              <span className="min-w-0 flex-1">
                Researching <strong className="font-medium text-ink">{lastRequest}</strong>
                {isProduct && furnitureClass !== 'all' ? ` (${TIER_LABEL[furnitureClass]})` : ''} near {location}. No results yet; this can take up to 90 seconds.
              </span>
              <span className="tabular shrink-0 text-caption" aria-hidden>
                {elapsed}s
              </span>
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4" aria-hidden>
            {[0, 1, 2].map(i => (
              <div key={i} className={cn('rounded-card p-3 ring-1 ring-hairline', i === 2 && 'hidden @3xl:block')} style={{ animationDelay: `${i * 120}ms` }}>
                {isProduct && <Skeleton className="mb-3 aspect-[16/10] w-full" />}
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="mt-2 h-5 w-1/3" />
                <Skeleton className="mt-3 h-8 w-full" />
              </div>
            ))}
          </div>
        </div>
      )}

      {research.isError && (
        <div className="flex flex-col gap-2">
          <ErrorState error={research.error} onRetry={() => research.variables&&research.mutate(research.variables)} />
          {isProduct&&productSource!=='web'&&research.variables&&<Button size="sm" variant="outline" className="self-start" onClick={()=>{const input=research.variables!;research.mutate({...input,exact:{...(input.exact??{category:toSlug(input.text),kind:'product',searchTerms:input.text.slice(0,100),maxPrice:input.max,preferences:[`Looking for: ${input.text}`.slice(0,200),...input.prefs],country:country||undefined,currency:productCurrency}),productSource:'web'}});}}>Try Web Research instead (uses AI allowance)</Button>}
          <Button size="sm" variant="text" icon={<PenLine />} className="self-start" onClick={() => setManualOpen(true)}>
            Add your own estimate instead
          </Button>
        </div>
      )}

      {/* Results */}
      {current && !research.isPending && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-caption text-graphite">
            <span className={cn('inline-flex items-center gap-1.5 font-medium', current.mode === 'live' ? 'text-ok-ink' : current.mode === 'demo' ? 'text-warn-ink' : 'text-graphite')}>
              <span className={cn('size-1.5 rounded-full', current.mode === 'live' ? 'bg-ok-fill' : current.mode === 'demo' ? 'bg-saffron' : 'bg-ink/30')} aria-hidden />
              {current.mode === 'live' ? current.productDiagnostics?`${current.productDiagnostics.provider==='serpapi'?'Google Shopping · SerpApi':'eBay API'} · no OpenAI extraction`:`Live research${current.diagnostics?.toolExecuted?` · ${current.diagnostics.searchCalls} search tool call(s)`:''}` : current.mode === 'demo' ? 'Demo data' : 'Search unavailable'}
            </span>
            <span>
              {humanizeCategory(current.category)} · {pluralize(current.offers.length, 'option')} · {relativeTime(current.searchedAt)}
            </span>
            {envelopeLeft !== null && (
              <span>
                · {humanizeCategory(envelope!.title)}:{' '}
                <strong className={cn('font-semibold tabular', envelopeLeft < 0 ? 'text-danger-ink' : 'text-ink')}>{envelopeLeft < 0 ? `${formatMoney(-envelopeLeft)} over` : `${formatMoney(envelopeLeft)} left`}</strong>
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
            {current.offers.length > 0 && (
              <>
                <Select aria-label="Sort options" disabled={current.providerOrder} value={current.providerOrder?'recommended':sort} onChange={e => setSort(e.target.value as Sort)} className="h-8 w-auto border-transparent bg-transparent text-caption hover:bg-hover">
                  <option value="recommended">Best match</option>
                  <option value="price_asc">Lowest price</option>
                  <option value="price_desc">Highest price</option>
                </Select>
                <Button size="sm" variant="text" icon={<SlidersHorizontal />} onClick={() => setMoreFilters(v => !v)} aria-expanded={moreFilters} className="text-caption text-graphite">
                  Filters{activeFilters ? ` (${activeFilters})` : ''}
                </Button>
              </>
            )}
            {!isProduct && !showForm && (
              <Button size="sm" variant="text" icon={<Search />} onClick={() => setFormOpen(true)} disabled={research.isPending} className="text-caption text-graphite">
                New search
              </Button>
            )}
            </div>
          </div>

          {current.productRoutes?.map(route=><p key={route.provider} className="text-caption text-graphite">{route.provider}: {route.state.replaceAll('_',' ')} · {route.reason}</p>)}
          {current.request?.productSource&&current.request.productSource!=='web'&&current.status==='unavailable'&&<Button size="sm" variant="outline" onClick={()=>research.mutate({projectId:project.id,text:current.query,max:undefined,prefs:[],exact:{...current.request!,productSource:'web'}})}>Try Web research instead</Button>}
          {current.summary&&<p className="text-body-sm text-graphite" role="status">{current.summary.explanation}</p>}
          {!!current.furnitureSearchLinks?.length&&<FurnitureSources links={current.furnitureSearchLinks}/>}
          {!!current.sourceNotes?.length && <section aria-label="Research notes and sources" className="rounded-card border border-hairline bg-canvas p-4">
            <h4 className="text-body-sm font-semibold">Research notes and sources</h4>
            <p className="mt-1 text-caption text-graphite">Useful discovery, not confirmed shopping matches. Check your location, price, condition and delivery requirements at each source. No price here has been added to your plan.</p>
            <ul className="mt-3 space-y-3">{current.sourceNotes.map(note=><li key={note.url} className="min-w-0">
              <a href={note.url} target="_blank" rel="noopener noreferrer" className="break-words text-body-sm font-medium text-blue-ink hover:underline">{note.title} ↗</a>
              <p className="text-caption text-graphite">{hostOf(note.url)} · {note.evidence==='cited_summary'?'AI search summary with citation; not independently checked':'Discovered reference; page details not checked'}</p>
              {note.summary && <details className="mt-1 text-body-sm text-graphite"><summary className="cursor-pointer">Read research note</summary><p className="mt-2 whitespace-pre-wrap break-words">{note.summary}</p></details>}
            </li>)}</ul>
          </section>}
          {current.offers.some(o=>researchDismissed(project,o))&&<label className="flex items-center gap-2 text-caption text-graphite"><input type="checkbox" checked={showHidden} onChange={e=>setShowHidden(e.target.checked)}/> Show results hidden by your feedback</label>}
          {moreFilters && current.offers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-canvas p-2.5">
              <div className="relative min-w-40 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-stone" aria-hidden />
                <Input aria-label="Filter by name" value={text} onChange={e => setText(e.target.value)} placeholder="Filter by name" className="h-8 pl-8" />
              </div>
              {isProduct && (
                <Segmented size="sm" label="Condition" value={condition} onChange={setCondition} options={[{ value: 'any', label: 'Any' }, { value: 'new', label: 'New' }, { value: 'used', label: 'Used' }]} />
              )}
              <Select aria-label="Seller type" value={seller} onChange={e => setSeller(e.target.value as typeof seller)} className="h-8 w-auto">
                <option value="any">All sellers</option>
                <option value="company">Businesses</option>
                <option value="private">Private sellers</option>
              </Select>
              {envelopeLeft !== null && (
                <label className="flex cursor-pointer items-center gap-2 px-1.5 text-caption font-medium text-ink/80">
                  <input type="checkbox" checked={fitBudget} onChange={e => setFitBudget(e.target.checked)} className="size-3.5 accent-blue" />
                  Fits budget
                </label>
              )}
            </div>
          )}

          {stale && (
            <div className="flex flex-wrap items-center gap-3 rounded-[10px] bg-warn-tint px-4 py-3 text-body-sm text-warn-ink" role="status">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              <p className="min-w-0 flex-1">Your details changed after this search, so these options can&rsquo;t be added. Search again for matching ones.</p>
              <Button size="sm" variant="outline" icon={<RotateCw />} onClick={() => current.request?research.mutate({projectId:project.id,text:humanizeCategory(current.category),max:current.request.maxPrice,prefs:current.request.preferences,exact:current.request}):startSearch(humanizeCategory(current.category))}>
                Search again
              </Button>
            </div>
          )}

          {current.offers.length === 0 ? (
            <EmptyState
              icon={<SearchX />}
              title={current.status === 'unavailable' ? 'Research is unavailable right now' : current.furnitureSearchLinks?.length?'Explore the selected furniture sources':current.sourceNotes?.length?'Useful sources found — exact listings need checking':current.engineVersion===2?current.summary?.sourceCount?'No supported matches or useful leads':'No usable candidate sources':'No matching options found'}
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
              {current.summary?.explanation??current.warnings[0]??'Try a different description. Constraints change only after your approval.'}
            </EmptyState>
          ) : offers.length === 0 ? (
            <EmptyState
              icon={<SearchX />}
              title={isProduct && furnitureClass !== 'all' ? `No ${TIER_LABEL[furnitureClass].toLowerCase()} options in this search` : 'No options match these filters'}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {isProduct && furnitureClass !== 'all' && (
                    <Button size="sm" variant="ghost" icon={<Sparkles />} onClick={() => startSearch(humanizeCategory(current.category))}>
                      Search {TIER_LABEL[furnitureClass].toLowerCase()} {humanizeCategory(current.category).toLowerCase()}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => { setText(''); setCondition('any'); setSeller('any'); setFitBudget(false); setFurnitureClass(project.id, 'all'); }}>
                    Show all options
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="flex flex-col gap-5">{[
              {id:'supported',title:'Matches your criteria',items:offers.filter(o=>o.eligibilityStatus==='supported')},
              {id:'potential',title:'Potential matches — check details',items:offers.filter(o=>o.eligibilityStatus==='potential')},
              {id:'legacy',title:current.mode==='demo'?'Fictional demo options':'Earlier results — review details',items:offers.filter(o=>!o.eligibilityStatus)},
            ].filter(g=>g.items.length).map(group=><section key={group.id} aria-label={group.title} className="flex flex-col gap-3">
              <h3 className="text-body-sm font-medium">{group.title} <span className="ml-1 tabular text-graphite">{group.items.length}</span></h3>
              <ul className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4">
              {group.items.map((o, oi) => (
                <motion.li key={o.id} className="flex" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: Math.min(oi, 8) * 0.04 }}>
                  <OfferCard
                    offer={o}
                    tier={isProduct && current.offers.length > 1 ? tiers.get(o.id) : undefined}
                    reasons={offerReasons(o, envelopeLeft, project.location)}
                    inCart={cartByOffer.get(o.id)}
                    stale={stale}
                    comparing={compare.includes(o.id)}
                    adding={add.isPending && pendingOffer === o.id}
                    removing={remove.isPending && pendingOffer === o.id}
                    onAdd={() => add.mutate(o)}
                    onReplace={replaceTarget(o)?()=>setReplacement({item:replaceTarget(o)!,offerId:o.id}):undefined}
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
                    feedback={researchFeedbackFor(project,o)}
                    onFeedback={type=>feedback.mutate({resultId:current.id,offerId:o.id,type})}
                    feedbackPending={feedback.isPending}
                    onContact={() => setContact(o)}
                  />
                </motion.li>
              ))}
            </ul></section>)}</div>
          )}

          {current.warnings.filter(w => !w.startsWith(STALE_PREFIX)).length > 0 && (
            <details className="text-caption text-graphite">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium hover:text-ink [&::-webkit-details-marker]:hidden">
                <Info className="size-3.5" aria-hidden /> About these results
              </summary>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
                {current.warnings
                  .filter(w => !w.startsWith(STALE_PREFIX))
                  .map(w => (
                    <li key={w}>{w}</li>
                  ))}
              </ul>
            </details>
          )}

          {!!current.refinementSuggestions?.length&&<section aria-label="Improve this search" className="rounded-card bg-canvas p-3"><h3 className="text-body-sm font-medium">Improve this search</h3><p className="mt-1 text-caption text-graphite">Prepare a refinement for review. Nothing changes and no new search runs when you open the assistant.</p><div className="mt-2 flex flex-wrap gap-2">{current.refinementSuggestions.map(s=><Button key={s.id} size="sm" variant="outline" title={s.explanation} onClick={()=>ask(s.message)}>{s.title}</Button>)}</div></section>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Button size="sm" variant="text" icon={<Sparkles />} onClick={() => ask(`Find cheaper ${humanizeCategory(current.category).toLowerCase()} options`)} className="-ml-2 text-blue-ink">
              Ask for alternatives
            </Button>
            <Button size="sm" variant="text" icon={<PenLine />} onClick={() => setManualOpen(true)} className="text-graphite">
              Add your own estimate
            </Button>
          </div>
        </div>
      )}

      {!!project.researchFeedback?.length&&<details className="text-caption text-graphite"><summary className="cursor-pointer font-medium">Your research feedback</summary><ul className="mt-2 space-y-2">{project.researchFeedback.slice(-20).reverse().map(f=><li key={f.sourceKey} className="flex flex-wrap items-center justify-between gap-2"><span>{hostOf(f.sourceKey)??'Saved result'} · {f.type.replaceAll('_',' ')}</span><Button size="sm" variant="text" loading={feedback.isPending} onClick={()=>feedback.mutate({resultId:f.resultId,offerId:f.offerId,type:null})}>Clear feedback</Button></li>)}</ul><p className="mt-2">Saved in this workspace. Feedback adjusts suggestions; it does not retrain the AI or start research.</p></details>}

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
      {replacement&&<ReplaceItemDialog key={replacement.item.id} item={replacement.item} initialOfferId={replacement.offerId} onClose={()=>setReplacement(null)}/>}
      <ManualItemDialog open={manualOpen} onClose={() => setManualOpen(false)} defaultCategory={envelope?.id} />
    </div>
  );
}
