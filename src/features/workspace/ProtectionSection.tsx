import { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useMutation,useQuery } from '@tanstack/react-query';
import { ArrowRight,ChevronDown,ExternalLink,LockKeyhole,MoreHorizontal,Save } from 'lucide-react';
import { CarInsuranceDraftSchema,type CarInsuranceDraft,type ProtectionUpdate } from '@contracts';
import { useWorkspace } from './context';
import { HomeInsuranceSection } from './HomeInsuranceSection';
import { Button } from '@/components/ui/Button';
import { Field,Input,Select } from '@/components/ui/Field';
import { Menu } from '@/components/ui/Menu';
import { formatMoney,parseEuros,centsToInput } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ChoiceGroup,FlowMessage,PriceHero,ProductTile,QuoteLoading,StatusPill,StepRail } from '@/features/protection/ui';
import { BudgetLinked } from '@/features/protection/BudgetLinked';

export const protectionLabels:Record<string,string>={detected:'Detected',suggested:'Not checked in this workspace',dismissed:'Postponed',in_progress:'In progress',quote_available:'Price available',quote_expired:'Expired — review needed',quote_unavailable:'Price needs review',already_insured_self_reported:'Existing cover · self-reported',reviewed:'Reviewed · not policy verification'};
const metadata={home:{title:'Protect your new home',cta:'Check home insurance',url:'https://developer.if-insurance.com/apis/property/householder-insurance-apis-finland'},car:{title:'Insurance for your new car',cta:'Get a price',url:'https://developer.if-insurance.com/apis/mobility/car-insurance-apis-finland'},travel:{title:'Travel insurance for this trip',cta:'Review travel cover',url:'https://developer.if-insurance.com/apis/person/travel-insurance-apis-finland'}};
/** Statuses where the person has not started yet; opening the flow records that it is in progress. */
const NOT_STARTED=['detected','suggested','dismissed'];

export function ProtectionSection(){
 const {project,writer}=useWorkspace();const location=useLocation();const rec=project.protection?.recommendations.find(r=>({home:'moving',car:'car_purchase',travel:'travel'}[r.insuranceType])===project.scenarioType);
 const [open,setOpen]=useState(false);const update=useMutation({mutationFn:(status:ProtectionUpdate['status'])=>writer.api.updateProtection(project.id,{product:rec!.insuranceType,status}),onSuccess:p=>writer.setProject(p),onError:writer.fail});
 useEffect(()=>{if(location.hash==='#protection'||rec?.status==='in_progress')setOpen(true);},[location.hash,rec?.status]);
 if(!rec)return project.scenarioType==='moving'?<div className="mb-6"><HomeInsuranceSection/></div>:null;
 const m=metadata[rec.insuranceType];const postponed=rec.status==='dismissed';
 const hi=project.homeInsurance;
 // Home flow opens on request, or by itself once the person has started (saved details, a quote or an expense).
 const homeVisible=rec.insuranceType==='home'&&(open||Boolean(hi?.quote||hi?.expense||Object.keys(hi?.details??{}).length));
 const expanded=rec.insuranceType==='home'?homeVisible:open;
 const start=()=>{setOpen(true);if(NOT_STARTED.includes(rec.status))update.mutate('in_progress');requestAnimationFrame(()=>document.getElementById('protection-flow')?.scrollIntoView({behavior:'smooth',block:'nearest'}));};
 return <section id="protection" aria-label="If Smart Protection" className="mb-6 scroll-mt-24">
  <div className="card p-5 sm:p-6">
   <div className="flex items-start gap-4">
    <ProductTile product={rec.insuranceType}/>
    <div className="min-w-0 flex-1">
     <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <p className="text-caption text-graphite"><span className="font-medium tracking-[0.06em] uppercase">Smart Protection</span><span aria-hidden> · </span>Prices from If when connected</p>
      <StatusPill status={rec.status}/>
     </div>
     <h2 id="protection-title" className="mt-1.5 text-[19px] leading-snug font-medium tracking-[-0.3px]">{m.title}</h2>
     <p className="mt-1 max-w-2xl text-body-sm text-graphite">{postponed?'Postponed. Reopen it whenever you want to review it.':rec.explanation}</p>
    </div>
   </div>
   <div className="mt-4 flex flex-wrap items-center gap-2 sm:pl-[60px]">
    {expanded&&!postponed
     ?<Button size="sm" variant="ghost" icon={<ChevronDown className="rotate-180"/>} onClick={()=>setOpen(false)} disabled={rec.insuranceType==='home'&&!open}>{rec.insuranceType==='home'&&!open?'Details below':'Hide details'}</Button>
     :<Button size="sm" variant="primary" icon={<ArrowRight/>} className="flex-row-reverse" disabled={update.isPending} onClick={start}>{postponed?'Reopen':m.cta}</Button>}
    {!postponed&&<Menu label="More protection actions" align="start" items={[
     {label:'Not now',onSelect:()=>{setOpen(false);update.mutate('dismissed');},disabled:update.isPending},
     {label:'I already have insurance',onSelect:()=>update.mutate('already_insured_self_reported'),disabled:update.isPending},
     {label:'Mark as reviewed',onSelect:()=>update.mutate('reviewed'),disabled:update.isPending},
    ]} trigger={props=><button {...props} className="inline-flex h-8 items-center gap-1.5 rounded-button px-3 text-body-sm font-medium text-ink/80 transition-colors duration-150 hover:bg-hover"><MoreHorizontal className="size-4" aria-hidden/>More</button>}/>}
    <Link to="/app/protection" className="ml-auto inline-flex items-center gap-1 rounded-button px-1 text-body-sm text-graphite transition-colors duration-150 hover:text-ink">My Protection<ArrowRight className="size-3.5" aria-hidden/></Link>
   </div>
   {open&&!postponed&&rec.insuranceType==='travel'&&<div className="mt-5 rounded-[14px] bg-canvas p-4 text-body-sm sm:ml-[60px]"><p className="text-ink/85">Check whether you already have cover, then compare the trip details with If. Travel quoting isn&rsquo;t enabled yet, so no price or policy is shown here.</p><a href={m.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 font-medium text-blue-ink hover:underline">Official If travel information<ExternalLink className="size-3.5" aria-hidden/><span className="sr-only">(opens in a new tab)</span></a></div>}
  </div>
  {!postponed&&homeVisible&&<div id="protection-flow" className="mt-3 scroll-mt-24"><HomeInsuranceSection/></div>}
  {!postponed&&rec.insuranceType==='car'&&open&&<div id="protection-flow" className="scroll-mt-24"><CarInsurancePanel/></div>}
 </section>;
}

const MILEAGE=['5000','10000','15000','20000','25000','30000','40000','50000','50001'] as const;

function CarInsurancePanel(){
 const {project,writer}=useWorkspace();const vehicle=project.preferences.vehicle;const state=project.protection!.car;
 const [draft,setDraft]=useState<Partial<CarInsuranceDraft>>(()=>({...state.draft}));const [dirty,setDirty]=useState(false);const [priceInput,setPriceInput]=useState(()=>state.draft.carPriceMinor===undefined?'':centsToInput(state.draft.carPriceMinor));const [identityEdited,setIdentityEdited]=useState(false);const current=useRef({draft,dirty});current.current={draft,dirty};
 const [mode,setMode]=useState<'demo'|'live'>('demo');const [outcome,setOutcome]=useState<'success'|'error'>('success');const [error,setError]=useState('');const [consent,setConsent]=useState(false);const identity=useRef<HTMLInputElement>(null);
 const [optionIndex,setOptionIndex]=useState(0);const [priceIndex,setPriceIndex]=useState(0);const [months,setMonths]=useState(12);const [notice,setNotice]=useState('');
 const caps=useQuery({queryKey:['protection-capabilities',writer.api.source],queryFn:()=>writer.api.protectionCapabilities(),retry:false});
 const quote=state.quotes.at(-1);const option=quote?.options[Math.min(optionIndex,Math.max(0,quote.options.length-1))];const premium=option?.prices[priceIndex];const link=state.budgetLink;
 const changed=<K extends keyof CarInsuranceDraft>(key:K,value:CarInsuranceDraft[K]|undefined)=>{setDraft(d=>({...d,[key]:value}));setDirty(true);setError('');setNotice('');};
 const fail=(e:unknown)=>{setError(e instanceof Error?e.message:'Request failed. Please retry.');void writer.refresh();};
 const save=useMutation({mutationFn:()=>writer.api.saveCarInsuranceDraft(project.id,CarInsuranceDraftSchema.partial().strict().parse(draft)),onSuccess:p=>{writer.setProject(p);setDirty(false);setNotice('Insurance details saved. Changed rating inputs require a new price.');},onError:fail});
 // Preserve only validated nonsensitive form answers when leaving this panel.
 useEffect(()=>()=>{const data=current.current;if(!data.dirty)return;const parsed=CarInsuranceDraftSchema.partial().safeParse(data.draft);if(parsed.success&&!/\d{6}[+\-ABCDEFUVWXY]\d{3}[0-9A-Y]/i.test(JSON.stringify(parsed.data)))void writer.api.saveCarInsuranceDraft(project.id,parsed.data).then(writer.setProject).catch(()=>{});},[project.id,writer.api]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(current.current.dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 const request=useMutation({mutationFn:async()=>{if(priceInput.trim()&&parseEuros(priceInput)===null)throw new Error('Enter a valid car price in euros.');const parsed=CarInsuranceDraftSchema.safeParse(draft);if(!parsed.success)throw new Error('Confirm the registration number, driver age group and annual mileage. Check optional address fields.');let pin:string|undefined;if(mode==='live'){pin=identity.current?.value.trim().toUpperCase();if(identity.current)identity.current.value='';if(!consent||!pin)throw new Error('Explicit consent and the dedicated identity field are required for live pricing.');}return writer.api.requestCarInsuranceQuote(project.id,{mode,draft:parsed.data,...(mode==='live'?{personalIdentityNumber:pin,consent:true}:{demoOutcome:outcome})});},onSuccess:p=>{writer.setProject(p);setDirty(false);setOptionIndex(0);setPriceIndex(0);setConsent(false);setIdentityEdited(false);setNotice('Prices returned. Review the source, billing period and coverage before adding a proposal.');},onError:e=>{setConsent(false);fail(e);}});
 const add=useMutation({mutationFn:(replaceExisting:boolean)=>writer.api.addCarInsuranceExpense(project.id,{quoteId:quote!.id,optionId:option!.id,priceIndex,planningMonths:months,replaceExisting}),onSuccess:p=>{writer.setProject(p);setNotice('Insurance added as a proposed recurring expense. No policy has been purchased.');},onError:fail});
 const remove=useMutation({mutationFn:()=>writer.api.removeCarInsuranceExpense(project.id),onSuccess:p=>{writer.setProject(p);setNotice('Insurance proposal removed.');},onError:fail});
 const busy=request.isPending||save.isPending||add.isPending||remove.isPending;
 const projected=premium?.periodMonths?premium.amountMinor*Math.ceil(months/premium.periodMonths):null;

 const stale=Boolean(quote&&(quote.status!=='available'||dirty||identityEdited));
 const addBlocked=busy||dirty||identityEdited||quote?.status!=='available'||quote?.sourceMode==='sandbox'||!premium?.periodMonths;
 const addBlockedReason=!quote?null:stale?'Request a new price first: your details changed or this price has expired.':quote.sourceMode==='sandbox'?'Sandbox test prices can’t be added to a budget.':!premium?.periodMonths?'This billing period can’t be planned in months.':null;
 const step:0|1|2|3=link?3:quote?1:0;
 const hasAddress=Boolean(draft.postalCode||draft.streetAddress);
 const vehicleLine=[vehicle?.year,vehicle?.make,vehicle?.model].filter(Boolean).join(' ');

 return <div className="card mt-3 overflow-hidden" aria-label="Car insurance pricing">
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4 sm:px-6">
   <div className="min-w-0"><h3 className="text-[17px] font-medium tracking-[-0.2px]">Car insurance price</h3><p className="mt-0.5 text-caption text-graphite">{vehicleLine||'Your planned car'}{vehicle?.purchasePriceMinor!==undefined?` · purchase plan ${formatMoney(vehicle.purchasePriceMinor)}`:''}</p></div>
   <StepRail step={step}/>
  </div>
  <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
   {/* Details */}
   <div className="min-w-0">
    <ChoiceGroup legend="Price source" value={mode} disabled={busy} onChange={v=>{setMode(v);setError('');setConsent(false);if(identity.current)identity.current.value='';}} options={[{value:'demo',label:'Demo',detail:'Fictional sample prices'},{value:'live',label:'If price',detail:caps.data?.carLiveAvailable?(caps.data.carSourceMode==='sandbox'?'If sandbox':'Authorized If API'):'Not connected'}]}
     hint={mode==='demo'?<span className="text-warn-ink">Fictional prices for trying the flow, not from If. Use a made-up registration and never a personal identity number.</span>:caps.data?.carLiveAvailable?(caps.data.carSourceMode==='sandbox'?'If sandbox: use only test identities supplied by If.':'Your details go to If only after you consent and request a price.'):'Live pricing is unavailable until approved If credentials are configured. There is no automatic demo fallback.'}/>
    <fieldset disabled={busy} className="mt-5 grid gap-4 sm:grid-cols-2">
     <legend className="sr-only">Car details</legend>
     <Field label="Registration number">{p=><Input {...p} value={draft.registrationNumber??''} maxLength={8} placeholder={mode==='demo'?'DEMO-001':'ABC-123'} autoCapitalize="characters" onChange={e=>changed('registrationNumber',e.target.value.toUpperCase()||undefined)}/>}</Field>
     <Field label="Planned car price (€)">{p=><Input {...p} inputMode="decimal" value={priceInput} placeholder="8000" onChange={e=>{setPriceInput(e.target.value);changed('carPriceMinor',parseEuros(e.target.value)??undefined);}}/>}</Field>
     <div className="sm:col-span-2"><ChoiceGroup legend="Will anyone under 24 drive it?" value={draft.driverBelow24===undefined?undefined:String(draft.driverBelow24) as 'true'|'false'} onChange={v=>changed('driverBelow24',v==='true')} options={[{value:'false',label:'No'},{value:'true',label:'Yes'}]}/></div>
     <Field label="Yearly kilometres" className="sm:col-span-2">{p=><Select {...p} value={draft.annualMileage??''} onChange={e=>changed('annualMileage',(e.target.value||undefined) as CarInsuranceDraft['annualMileage'])}><option value="">Choose a range</option>{MILEAGE.map(n=><option key={n} value={n}>{n==='50001'?'Over 50,000 km':`Up to ${Number(n).toLocaleString('en')} km`}</option>)}</Select>}</Field>
    </fieldset>
    <details className="group mt-4 rounded-[12px] bg-canvas px-4 py-3" open={hasAddress||undefined}>
     <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-body-sm font-medium text-ink/85 [&::-webkit-details-marker]:hidden">Current address <span className="flex items-center gap-1 text-caption font-normal text-graphite">Only if If asks<ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" aria-hidden/></span></summary>
     <fieldset disabled={busy} className="mt-3 grid gap-4 sm:grid-cols-2"><legend className="sr-only">Current address</legend>
      <Field label="Postal code">{p=><Input {...p} inputMode="numeric" maxLength={5} placeholder="00100" value={draft.postalCode??''} onChange={e=>changed('postalCode',e.target.value||undefined)}/>}</Field>
      <Field label="Street address">{p=><Input {...p} maxLength={50} autoComplete="off" value={draft.streetAddress??''} onChange={e=>changed('streetAddress',e.target.value||undefined)}/>}</Field>
     </fieldset>
    </details>
    {mode==='demo'&&<details className="group mt-2 rounded-[12px] px-4 py-2"><summary className="flex cursor-pointer list-none items-center gap-1 text-caption font-medium text-graphite hover:text-ink [&::-webkit-details-marker]:hidden">Demo options<ChevronDown className="size-3.5 transition-transform duration-200 group-open:rotate-180" aria-hidden/></summary><div className="mt-2"><Field label="Demo outcome">{p=><Select {...p} value={outcome} onChange={e=>setOutcome(e.target.value as 'success'|'error')}><option value="success">Successful example</option><option value="error">Simulated provider error</option></Select>}</Field></div></details>}
    {mode==='live'&&caps.data?.carLiveAvailable&&<div className="mt-4 space-y-3 rounded-[14px] p-4 shadow-[0_0_0_1px_rgb(0_0_0/0.08)]"><Field label={caps.data.carSourceMode==='sandbox'?'If-supplied test identity':'Finnish personal identity number'} hint="Used only for this request. Never saved in the workspace, your browser or the AI assistant.">{p=><Input {...p} ref={identity} type="password" onChange={()=>setIdentityEdited(true)} maxLength={11} autoComplete="off" spellCheck={false} disabled={busy}/>}</Field><label className="flex cursor-pointer items-start gap-2.5 text-body-sm text-ink/85"><input type="checkbox" className="mt-0.5 size-4 accent-blue" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={busy}/>I agree to send these details to If for a price. This does not buy insurance.</label></div>}
    <div className="mt-5 flex flex-wrap items-center gap-2">
     <Button variant={quote?'ghost':'primary'} icon={<ArrowRight/>} className="flex-row-reverse" loading={request.isPending} disabled={busy||(mode==='live'&&!caps.data?.carLiveAvailable)} onClick={()=>{setError('');setNotice('');request.mutate();}}>{mode==='live'?'Request If price':quote?'Get a new demo price':'See demo price'}</Button>
     <Button variant="text" icon={<Save/>} loading={save.isPending} disabled={busy||!dirty} onClick={()=>save.mutate()}>Save details</Button>
    </div>
    <p className="mt-3 flex items-start gap-1.5 text-caption text-graphite"><LockKeyhole className="mt-0.5 size-3 shrink-0" aria-hidden/>Nothing is sent until you ask for a price. Unsaved details are kept when you close this panel.</p>
   </div>

   {/* Price */}
   <div className="min-w-0">
    {request.isPending?<QuoteLoading label={mode==='demo'?'Preparing a demo price…':'Asking If for a price…'}/>
    :!quote?<div className="flex h-full min-h-56 flex-col items-center justify-center rounded-[16px] bg-canvas p-6 text-center"><img src="/illustrations/first-car.png" alt="" width="72" height="72" className="size-16 object-contain" aria-hidden/><p className="mt-3 text-body font-medium">Your price will appear here</p><p className="mt-1 max-w-xs text-body-sm text-graphite">Confirm the four details on the left, then ask for a price. The purchase price alone isn&rsquo;t enough for If to quote.</p></div>
    :<div className="flex flex-col gap-4">
     {stale&&<p role="status" className="rounded-button bg-warn-tint px-3.5 py-2.5 text-body-sm text-warn-ink">Your details changed, so this price needs a new request. Any budget proposal stays until you review it.</p>}
     {quote.options.length>1&&<fieldset disabled={busy}><legend className="mb-1.5 text-body-sm font-medium text-ink/90">Coverage</legend><div className="grid gap-1.5">{quote.options.map((o,i)=>{const sel=option?.id===o.id;const from=o.prices[0];return <label key={o.id} className={cn('relative flex cursor-pointer items-center justify-between gap-3 rounded-[12px] px-4 py-3 transition-[background-color,box-shadow] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue',sel?'bg-surface shadow-[0_0_0_1.5px_var(--color-ink)]':'bg-canvas hover:bg-fill')}><input type="radio" name="car-coverage" className="absolute inset-0 size-full cursor-pointer appearance-none rounded-[12px] opacity-0" checked={sel} onChange={()=>{setOptionIndex(i);setPriceIndex(0);}}/><span className="min-w-0 text-body-sm font-medium">{o.title}</span>{from&&<span className="shrink-0 text-caption text-graphite tabular">from {formatMoney(from.amountMinor,{exact:true})} / {from.billingPeriod}</span>}</label>;})}</div></fieldset>}
     {option&&option.prices.length>1&&<ChoiceGroup legend="Billing" disabled={busy} value={String(priceIndex)} onChange={v=>setPriceIndex(Number(v))} options={option.prices.map((v,i)=>({value:String(i),label:v.billingPeriod,detail:formatMoney(v.amountMinor,{exact:true})}))}/>}
     <PriceHero amountMinor={premium?.amountMinor} period={premium?.billingPeriod} source={quote.sourceMode}>
      {option&&quote.options.length===1&&<p className="text-body-sm text-ink/85">{option.title}</p>}
      <p>{quote.validUntil?`Valid until ${quote.validUntil}`:'No expiry supplied. Recheck before relying on this price.'}{option?.deductibleMinor!=null?` · Deductible ${formatMoney(option.deductibleMinor)}`:''}</p>
     </PriceHero>
     {(option?.coverageDetails.length||quote.terms?.length||quote.warnings.length)?<details className="group rounded-[12px] px-1"><summary className="flex cursor-pointer list-none items-center gap-1 text-body-sm font-medium text-ink/85 hover:text-ink [&::-webkit-details-marker]:hidden">What&rsquo;s covered<ChevronDown className="size-4 text-graphite transition-transform duration-200 group-open:rotate-180" aria-hidden/></summary>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-body-sm text-graphite">{option?.coverageDetails.map(t=><li key={t}>{t}</li>)}</ul>
      {(quote.terms??[]).map(t=><a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1 text-body-sm text-blue-ink hover:underline">{t.name}<ExternalLink className="size-3" aria-hidden/><span className="sr-only">(opens in a new tab)</span></a>)}
      {quote.warnings.map(w=><p key={w} className="mt-2 text-caption text-graphite">{w}</p>)}
      {quote.sourceMode!=='demo'&&quote.sourceUrl&&<a href={quote.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-caption text-blue-ink hover:underline">Official API source<ExternalLink className="size-3" aria-hidden/><span className="sr-only">(opens in a new tab)</span></a>}
     </details>:null}

     {/* Budget */}
     <div className="border-t border-hairline pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
       <Field label="Plan for" className="w-36">{p=><Select {...p} value={months} disabled={busy} onChange={e=>setMonths(Number(e.target.value))}>{[1,3,6,12,24,36].map(n=><option key={n} value={n}>{n} {n===1?'month':'months'}</option>)}</Select>}</Field>
       <div className="text-right"><p className="text-caption text-graphite">Planned insurance cost</p><p className="text-[20px] font-semibold tracking-[-0.4px] tabular">{formatMoney(projected,{exact:true})}</p></div>
      </div>
      <p className="mt-2 text-caption text-graphite">Counts each full bill in this period; later renewals aren&rsquo;t included.</p>
      {(!link||stale||link.optionId!==option?.id||link.priceIndex!==priceIndex||link.planningMonths!==months)&&<Button variant={link?'ghost':'primary'} className="mt-4 h-auto min-h-10 w-full justify-center whitespace-normal py-2" loading={add.isPending} disabled={addBlocked} onClick={()=>{setError('');if(!link||window.confirm('Replace the existing proposed insurance expense with this choice? No purchase will be made.'))add.mutate(Boolean(link));}}>{link?'Replace in budget with this choice':'Add to budget'}</Button>}
      {addBlockedReason&&<p className="mt-2 text-caption text-graphite">{addBlockedReason}</p>}
     </div>
     {link&&<BudgetLinked plannedMinor={link.plannedMinor} months={link.planningMonths} monthlyMinor={link.monthlyEquivalentMinor} demo={link.sourceMode==='demo'} needsReview={link.needsReview} monthlyBudgetMinor={project.preferences.monthlyBudgetMinor} busy={busy} removing={remove.isPending} onRemove={()=>remove.mutate()}/>}
    </div>}
   </div>
  </div>
  {(notice||error)&&<div className="border-t border-hairline px-5 py-3 sm:px-6">{error?<FlowMessage tone="error">{error}</FlowMessage>:<FlowMessage tone="info">{notice}</FlowMessage>}</div>}
 </div>;
}
