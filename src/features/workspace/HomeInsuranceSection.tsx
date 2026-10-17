import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, ChevronDown, ExternalLink, Info, LockKeyhole } from 'lucide-react';
import { HomeInsuranceDetailsSchema, HomeInsuranceDraftSchema, type HomeInsuranceDraft, type LifeProject } from '@contracts';
import { ApiError } from '@/api';
import { Button, buttonClass } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { formatDate, formatMoney } from '@/lib/format';
import { useWorkspace } from './context';
import { ChoiceGroup, FlowMessage, PriceHero, QuoteLoading, StepRail } from '@/features/protection/ui';
import { BudgetLinked } from '@/features/protection/BudgetLinked';

function initialDetails(project:LifeProject):HomeInsuranceDraft {
  return {city:project.location?.split(',')[0]?.trim()||undefined,startDate:project.preferences.moveDate??undefined,...project.homeInsurance?.details};
}

/** This form never puts an identity number in project state, query variables, or assistant context. */
export function HomeInsuranceSection(){
  const {project,writer}=useWorkspace();
  const [details,setDetails]=useState<HomeInsuranceDraft>(()=>initialDetails(project));
  const [dirty,setDirty]=useState(false);
  const [consent,setConsent]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [months,setMonths]=useState(12);
  const [premiumIndex,setPremiumIndex]=useState(0);
  const identity=useRef<HTMLInputElement>(null);
  const status=useQuery({queryKey:['if-insurance',writer.api.source,project.id],queryFn:()=>writer.api.homeInsurance(project.id),retry:false,staleTime:30000});
  const availability=status.data?.status;
  const quote=project.homeInsurance?.quote;
  const expense=project.homeInsurance?.expense;
  useEffect(()=>{if(!dirty)setDetails(initialDetails(project));},[project.homeInsurance?.details,project.location,project.preferences.moveDate,dirty]);
  const changed=<K extends keyof HomeInsuranceDraft>(key:K,value:HomeInsuranceDraft[K])=>{setDirty(true);setDetails(d=>({...d,[key]:value}));setNotice('');setError('');};
  const message=(err:unknown)=>err instanceof ApiError?err.message:'The request could not be completed. Please retry.';
  const save=useMutation({mutationFn:()=>writer.api.saveInsuranceDetails(project.id,HomeInsuranceDraftSchema.parse(details)),onSuccess:p=>{writer.setProject(p);setDirty(false);setNotice('Home details saved to your moving plan.');},onError:e=>setError(message(e))});
  const request=useMutation({
    mutationFn:async()=>{
      const parsed=HomeInsuranceDetailsSchema.safeParse(details);
      if(!parsed.success)throw new Error('Complete all home details, including both postal codes and the start date.');
      const personalIdentityNumber=identity.current?.value.trim().toUpperCase()??'';
      if(identity.current)identity.current.value='';
      if(!consent||!/^\d{6}[+\-ABCDEFUVWXY]\d{3}[0-9A-Y]$/.test(personalIdentityNumber))throw new Error('Enter a Finnish personal identity number and agree to request your quote.');
      return writer.api.requestInsuranceQuote(project.id,{details:parsed.data,personalIdentityNumber,consent:true});
    },
    onSuccess:p=>{writer.setProject(p);setDirty(false);setConsent(false);setPremiumIndex(0);setNotice('Quote returned by If. Review its price, period and terms below.');},
    onError:e=>{setConsent(false);setError(e instanceof Error?e.message:message(e));void writer.refresh();},
  });
  const propose=useMutation({mutationFn:()=>writer.api.addInsuranceExpense(project.id,{quoteId:quote!.id,premiumIndex:selectedPremiumIndex,planningMonths:months}),onSuccess:p=>{writer.setProject(p);setNotice('Added as a proposed expense. No insurance has been purchased.');},onError:e=>setError(message(e))});
  const remove=useMutation({mutationFn:()=>writer.api.removeInsuranceExpense(project.id),onSuccess:p=>{writer.setProject(p);setNotice('Proposed insurance expense removed.');},onError:e=>setError(message(e))});
  const busy=save.isPending||request.isPending||propose.isPending||remove.isPending;
  // A saved proposal can use a different billing option from the initial dropdown.
  // Reconstruct that choice on reload instead of displaying the first premium.
  const savedPremiumIndex=expense?quote?.premiums.findIndex(p=>p.amountMinor===expense.premiumMinor&&p.billingPeriod===expense.billingPeriod)??-1:-1;
  const selectedPremiumIndex=savedPremiumIndex>=0?savedPremiumIndex:Math.min(premiumIndex,Math.max(0,(quote?.premiums.length??1)-1));
  const premium=quote?.premiums[selectedPremiumIndex];
  const installments=premium?.periodMonths?Math.ceil(months/premium.periodMonths):null;
  const planned=premium&&installments?premium.amountMinor*installments:null;
  const expired=Boolean(quote&&(quote.validTo<new Date().toISOString().slice(0,10)||project.protection?.recommendations.some(r=>r.insuranceType==='home'&&r.status==='quote_unavailable')));
  const canQuote=availability?.available&&!expense;
  const requestQuote=()=>{setError('');setNotice('');if(canQuote)request.mutate();else{setNotice(availability?.message??'Quote availability could not be checked. Please retry.');void status.refetch();}};

  const step:0|1|2|3=expense?3:quote?1:0;
  const addReason=!quote||expense?null:dirty?'Save or request again: your home details changed.':expired?'This quote has expired. Request a new one first.':quote.environment!=='live'?'Sandbox test quotes can’t be added to a budget.':!premium?.periodMonths?'This billing period can’t be planned in months.':null;

  return <section aria-labelledby="if-home-title" className="card overflow-hidden">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <h2 id="if-home-title" className="text-[17px] font-medium tracking-[-0.2px]">Home insurance quote</h2>
        <p className="mt-0.5 text-caption text-graphite">Prepared from your moving plan · prices from If when connected</p>
      </div>
      <StepRail step={step}/>
    </header>

    <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
      <div className="min-w-0">
        <form onSubmit={e=>e.preventDefault()}>
          <fieldset disabled={busy||Boolean(expense)} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-body-sm font-semibold">Your new home</legend>
            <Field label="Street address" className="sm:col-span-2">{props=><Input {...props} autoComplete="off" value={details.streetAddress??''} maxLength={200} placeholder="Street, number and apartment" onChange={e=>changed('streetAddress',e.target.value||undefined)}/>}</Field>
            <Field label="Postal code">{props=><Input {...props} inputMode="numeric" autoComplete="off" value={details.postalCode??''} maxLength={5} placeholder="20100" onChange={e=>changed('postalCode',e.target.value||undefined)}/>}</Field>
            <Field label="City" hint={project.location?'From your plan. Please check it.':undefined}>{props=><Input {...props} autoComplete="off" value={details.city??''} maxLength={200} placeholder="Turku" onChange={e=>changed('city',e.target.value||undefined)}/>}</Field>
            <div className="sm:col-span-2"><ChoiceGroup legend="Home type" value={details.householderType} onChange={v=>changed('householderType',v)} options={[{value:'Apartment',label:'Apartment'},{value:'RowHouse',label:'Terraced'},{value:'PairHouse',label:'Semi-detached'}]}/></div>
            <Field label="Living area (m²)">{props=><Input {...props} type="number" min={1} max={10000} step={1} placeholder="45" value={details.livingSpace??''} onChange={e=>changed('livingSpace',e.target.value?Number(e.target.value):undefined)}/>}</Field>
            <Field label="Cover starts" hint="Your moving date when known.">{props=><Input {...props} type="date" min={new Date().toISOString().slice(0,10)} value={details.startDate??''} onChange={e=>changed('startDate',e.target.value||undefined)}/>}</Field>
            <Field label="Your current postal code" className="sm:col-span-2" hint="Where you live now. It may differ from the new home.">{props=><Input {...props} inputMode="numeric" autoComplete="off" value={details.policyHolderPostalCode??''} maxLength={5} placeholder="00100" onChange={e=>changed('policyHolderPostalCode',e.target.value||undefined)}/>}</Field>
          </fieldset>
          {canQuote&&<div className="mt-5 space-y-3 rounded-[14px] p-4 shadow-[0_0_0_1px_rgb(0_0_0/0.08)]">
            <Field label={availability?.environment==='sandbox'?'Finnish test identity number':'Finnish personal identity number'} hint={availability?.environment==='sandbox'?'Use only a test identity supplied by If. Never a real one.':'Used only for this request. Not saved, and never sent to the AI assistant.'}>{props=><Input {...props} ref={identity} type="password" autoComplete="off" maxLength={11} spellCheck={false} disabled={busy}/>}</Field>
            <label className="flex cursor-pointer items-start gap-2.5 text-body-sm text-ink/85"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-0.5 size-4 accent-blue" disabled={busy}/><span>I agree to send these details to If for a quote. This does not buy insurance.</span></label>
          </div>}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button variant={quote?'ghost':'primary'} icon={<ArrowRight/>} className="flex-row-reverse" loading={request.isPending} disabled={busy||Boolean(expense)||status.isPending} onClick={requestQuote}>{quote?'Request a new quote':'Request If quote'}</Button>
            <Button variant="text" loading={save.isPending} disabled={busy||Boolean(expense)||!dirty} onClick={()=>{setError('');setNotice('');const result=HomeInsuranceDraftSchema.safeParse(details);if(!result.success){setError('Check the home details before saving. You can leave unknown fields empty.');return;}save.mutate();}}>Save details</Button>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-caption text-graphite"><LockKeyhole className="mt-0.5 size-3 shrink-0" aria-hidden/>A quote is requested only when you click. Nothing is bought or activated here.</p>
        </form>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {request.isPending?<QuoteLoading label="Asking If for a home quote…"/>
        :!quote?<div className="flex min-h-64 flex-col items-center justify-center rounded-[16px] bg-canvas p-6 text-center">
          <img src="/illustrations/first-home.png" alt="" width="64" height="64" className="size-16 object-contain" aria-hidden/>
          <p className="mt-3 text-body font-medium">Your quote will appear here</p>
          <p className="mt-1 max-w-xs text-body-sm text-graphite">Fill in the home details, then request a quote. You decide whether it goes into your plan.</p>
          <p role="status" className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-caption font-medium ${availability?.available?'bg-sky-tint text-blue-ink':'bg-ink/[0.05] text-ink/75'}`}><Info className="size-3.5" aria-hidden/>{status.isPending?'Checking the If connection…':availability?.available?(availability.environment==='sandbox'?'If sandbox · test data':'Ready to request'):'Live quote unavailable'}</p>
          {(availability?.message||status.isError)&&<p className="mt-2 max-w-xs text-caption text-graphite">{availability?.message??'Could not check the If connection. You can still prepare your details.'}</p>}
        </div>
        :<>
          {expired&&<p role="status" className="rounded-button bg-warn-tint px-3.5 py-2.5 text-body-sm text-warn-ink">This quote needs review: it has expired or If could not confirm it. Request a new quote before relying on it.</p>}
          {quote.premiums.length>1&&<ChoiceGroup legend="Billing" disabled={Boolean(expense)} value={String(selectedPremiumIndex)} onChange={v=>setPremiumIndex(Number(v))} options={quote.premiums.map((p,i)=>({value:String(i),label:p.billingPeriod,detail:formatMoney(p.amountMinor,{exact:true})}))}/>}
          {quote.premiums.length>0?<PriceHero amountMinor={premium?.amountMinor} period={premium?.billingPeriod} source={quote.environment}>
            <p>Net premium from If · gross {formatMoney(premium?.grossMinor,{exact:true})}, discount {formatMoney(premium?.discountMinor,{exact:true})}</p>
            <p>Valid through {formatDate(quote.validTo)} · earliest start {formatDate(quote.activationDateFrom)}</p>
          </PriceHero>:<p className="rounded-[16px] bg-canvas p-5 text-body-sm text-graphite">If didn&rsquo;t return a total premium, so this quote can&rsquo;t be added to the budget.</p>}
          {(quote.coverages.length>0||quote.terms.length>0||quote.warnings.length>0)&&<details className="group rounded-[12px] px-1"><summary className="flex cursor-pointer list-none items-center gap-1 text-body-sm font-medium text-ink/85 hover:text-ink [&::-webkit-details-marker]:hidden">What&rsquo;s covered<ChevronDown className="size-4 text-graphite transition-transform duration-200 group-open:rotate-180" aria-hidden/></summary>
            {quote.coverages.map((c,i)=><details key={i} className="mt-2 rounded-[12px] bg-canvas px-3.5 py-2.5"><summary className="cursor-pointer text-body-sm font-medium">{c.name}<span className="font-normal text-graphite"> · {c.selected?'selected by If':'alternative'}</span></summary><ul className="mt-2 space-y-2.5">{c.items.map(item=><li key={item.id}><p className="text-body-sm font-medium">{item.name}</p><p className="mt-0.5 whitespace-pre-line text-caption text-graphite">{item.description??'Description unavailable. Verify this coverage with If.'}</p></li>)}</ul></details>)}
            {quote.terms.map(t=><a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1.5 text-body-sm text-blue-ink hover:underline">{t.name}<ExternalLink className="size-3" aria-hidden/><span className="sr-only">(opens in a new tab)</span></a>)}
            {quote.warnings.map(w=><p key={w} className="mt-2 text-caption text-graphite">{w}</p>)}
          </details>}
          {!expense&&<div className="border-t border-hairline pt-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Field label="Plan for" className="w-36">{props=><Select {...props} value={months} onChange={e=>setMonths(Number(e.target.value))}>{[1,3,6,12,24,36].map(n=><option key={n} value={n}>{n} {n===1?'month':'months'}</option>)}</Select>}</Field>
              <div className="text-right"><p className="text-caption text-graphite">Planned insurance cost</p><p className="text-[20px] font-semibold tracking-[-0.4px] tabular">{formatMoney(planned,{exact:true})}</p></div>
            </div>
            <p className="mt-2 text-caption text-graphite">{installments??'Unknown'} {installments===1?'bill':'bills'} in this period. A yearly bill counts in full; later renewals aren&rsquo;t included.</p>
            <Button variant="primary" className="mt-4 h-auto min-h-10 w-full justify-center whitespace-normal py-2" icon={<CheckCircle2/>} loading={propose.isPending} disabled={busy||dirty||expired||quote.environment!=='live'||!premium?.periodMonths} onClick={()=>{setError('');propose.mutate();}}>Add to budget</Button>
            {addReason&&<p className="mt-2 text-caption text-graphite">{addReason}</p>}
          </div>}
        </>}

        {expense&&<BudgetLinked plannedMinor={expense.plannedMinor} months={expense.planningMonths} annualMinor={expense.annualEquivalentMinor} premiumLine={`${formatMoney(expense.premiumMinor,{exact:true})} · ${expense.billingPeriod}`} busy={busy} removing={remove.isPending} onRemove={()=>remove.mutate()}/>}
        <a href="https://developer.if-insurance.com/apis/property/householder-insurance-apis-finland" target="_blank" rel="noopener noreferrer" className={buttonClass('text','sm','h-auto self-start whitespace-normal px-0 text-graphite')}>About If&rsquo;s Finnish home insurance API<ExternalLink className="size-3" aria-hidden/><span className="sr-only">(opens in a new tab)</span></a>
      </div>
    </div>
    {(notice||error)&&<div className="border-t border-hairline px-5 py-3 sm:px-6">{error?<FlowMessage tone="error">{error}</FlowMessage>:<FlowMessage tone="info">{notice}</FlowMessage>}</div>}
  </section>;
}
