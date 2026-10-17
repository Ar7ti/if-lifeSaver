import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, CheckCircle2, ExternalLink, Home, Info, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react';
import { HomeInsuranceDetailsSchema, HomeInsuranceDraftSchema, type HomeInsuranceDraft, type LifeProject } from '@contracts';
import { ApiError } from '@/api';
import { Button, buttonClass } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { formatDate, formatMoney } from '@/lib/format';
import { useWorkspace } from './context';

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

  return <section aria-labelledby="if-home-title" className="card mb-7 overflow-hidden">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline bg-[#f7f4ef] p-5 sm:p-6">
      <div className="flex min-w-0 items-start gap-3.5">
        <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-[#003b5c] font-serif text-[28px] italic text-white" aria-label="If">If</span>
        <div><p className="mb-1 text-caption font-medium uppercase tracking-[0.1em] text-graphite">A little more peace of mind</p>
          <h2 id="if-home-title" className="text-subheading font-semibold tracking-tight">Home insurance with If</h2>
          <p className="mt-1.5 max-w-xl text-body-sm text-graphite">Prepare for your new home. Request a personal quote, review the details, and decide what belongs in your plan.</p>
        </div>
      </div>
      <span className="flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5 text-caption font-medium text-graphite"><ShieldCheck className="size-3.5" aria-hidden/>Finland · Home insurance</span>
    </header>

    <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-hairline px-5 py-3 text-caption text-graphite sm:px-6" aria-label="Quote steps">
      {['Your home','Your quote','Your plan'].map((step,i)=><span key={step} className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-canvas text-[10px] font-semibold">{i===0&&project.homeInsurance?.details.streetAddress?<Check className="size-3" aria-hidden/>:i+1}</span>{step}</span>)}
    </div>

    <div className="grid gap-7 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,1fr)]">
      <div className="min-w-0">
        <div className="mb-4 flex items-center gap-2"><Home className="size-4 text-graphite" aria-hidden/><h3 className="text-body-sm font-semibold">Tell us about your home</h3></div>
        <form onSubmit={e=>e.preventDefault()}>
          <fieldset disabled={busy||Boolean(expense)} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <Field label="Street address" className="sm:col-span-2">{props=><Input {...props} autoComplete="off" value={details.streetAddress??''} maxLength={200} placeholder="Street, number and apartment" onChange={e=>changed('streetAddress',e.target.value||undefined)}/>}</Field>
            <Field label="Home postal code">{props=><Input {...props} inputMode="numeric" autoComplete="off" value={details.postalCode??''} maxLength={5} placeholder="20100" onChange={e=>changed('postalCode',e.target.value||undefined)}/>}</Field>
            <Field label="City" hint={project.location?'Reused from your project. Please check it.':undefined}>{props=><Input {...props} autoComplete="off" value={details.city??''} maxLength={200} placeholder="Turku" onChange={e=>changed('city',e.target.value||undefined)}/>}</Field>
            <Field label="Home type">{props=><Select {...props} value={details.householderType??''} onChange={e=>changed('householderType',(e.target.value||undefined) as HomeInsuranceDraft['householderType'])}><option value="">Choose home type</option><option value="Apartment">Apartment</option><option value="RowHouse">Terraced house</option><option value="PairHouse">Semi-detached house</option></Select>}</Field>
            <Field label="Living area (m²)">{props=><Input {...props} type="number" min={1} max={10000} step={1} placeholder="45" value={details.livingSpace??''} onChange={e=>changed('livingSpace',e.target.value?Number(e.target.value):undefined)}/>}</Field>
            <Field label="Requested start date" hint="Your moving date is reused when available.">{props=><Input {...props} type="date" min={new Date().toISOString().slice(0,10)} value={details.startDate??''} onChange={e=>changed('startDate',e.target.value||undefined)}/>}</Field>
            <Field label="Your current postal code" hint="Policyholder’s current address, which may differ from your new home.">{props=><Input {...props} inputMode="numeric" autoComplete="off" value={details.policyHolderPostalCode??''} maxLength={5} placeholder="00100" onChange={e=>changed('policyHolderPostalCode',e.target.value||undefined)}/>}</Field>
          </fieldset>
          {canQuote&&<div className="mt-5 space-y-3 rounded-card border border-hairline p-4">
            <Field label={availability?.environment==='sandbox'?'Finnish test identity number':'Finnish personal identity number'} hint={availability?.environment==='sandbox'?'Use only a test identity supplied by If. Do not enter a real identity number.':'Used only for this quote request. It is not saved or sent to the AI assistant.'}>{props=><Input {...props} ref={identity} type="password" autoComplete="off" maxLength={11} spellCheck={false} disabled={busy}/>}</Field>
            <label className="flex items-start gap-2.5 text-caption text-graphite"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-0.5" disabled={busy}/><span>I agree to send these details to If to calculate a quote. This does not purchase insurance.</span></label>
          </div>}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={<ArrowRight/>} loading={request.isPending} disabled={busy||Boolean(expense)||status.isPending} onClick={requestQuote}>Request If quote</Button>
            <Button variant="ghost" loading={save.isPending} disabled={busy||Boolean(expense)||!dirty} onClick={()=>{setError('');setNotice('');const result=HomeInsuranceDraftSchema.safeParse(details);if(!result.success){setError('Check the home details before saving. You can leave unknown fields empty.');return;}save.mutate();}}>Save home details</Button>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-caption text-graphite"><LockKeyhole className="mt-0.5 size-3 shrink-0" aria-hidden/>A quote is requested only when you click. No purchase or policy activation takes place here.</p>
        </form>
      </div>

      <div className="min-w-0 space-y-4">
        {!quote?<div className="flex min-h-64 flex-col rounded-card bg-canvas p-5">
          <div className="mb-6 flex items-center justify-between"><span className="text-caption font-medium uppercase tracking-[0.08em] text-graphite">Your personal quote</span><ShieldCheck className="size-5 text-[#003b5c]" aria-hidden/></div>
          <p className="font-serif text-[27px] leading-tight">A new place.<br/>A considered next step.</p>
          <p className="mt-3 text-body-sm text-graphite">Your price and available coverage details will appear here after If returns a quote.</p>
          <div className="mt-6 rounded-button border border-hairline bg-surface p-3.5" role="status"><p className="flex items-center gap-2 text-body-sm font-medium"><Info className="size-4 shrink-0 text-graphite" aria-hidden/>{status.isPending?'Checking availability…':availability?.available?(availability.environment==='sandbox'?'If sandbox · test data':'Ready to request'):'Live quote unavailable'}</p><p className="mt-1.5 text-caption text-graphite">{availability?.message??(status.isError?'Could not check the If connection. Your home details can still be prepared.':'Checking the If connection.')}</p></div>
        </div>:<div className="rounded-card border border-hairline p-5">
          <div className="mb-4 flex items-center justify-between gap-2"><h3 className="text-body-sm font-semibold">Quote returned by If</h3><span className="rounded-full bg-canvas px-2.5 py-1 text-caption">{quote.environment==='sandbox'?'Sandbox · test data':expired?'Review required':'Live quote'}</span></div>
          {quote.premiums.length>0?<><Field label="Price and billing period">{props=><Select {...props} value={selectedPremiumIndex} disabled={Boolean(expense)} onChange={e=>setPremiumIndex(Number(e.target.value))}>{quote.premiums.map((p,i)=><option key={i} value={i}>{formatMoney(p.amountMinor,{exact:true})} · {p.billingPeriod}</option>)}</Select>}</Field>
            <p className="mt-4 text-[32px] font-semibold tracking-tight">{formatMoney(premium?.amountMinor,{exact:true})}<span className="ml-2 text-body-sm font-normal text-graphite">/ {premium?.billingPeriod}</span></p>
            <p className="mt-1 text-caption text-graphite">Net premium returned by If. Gross: {formatMoney(premium?.grossMinor,{exact:true})}. Discount: {formatMoney(premium?.discountMinor,{exact:true})}.</p>
          </>:<p className="text-body-sm text-graphite">If did not return a total premium. This quote cannot be added to the budget.</p>}
          <p className="mt-3 text-caption text-graphite">Valid through {formatDate(quote.validTo)} · Earliest start {formatDate(quote.activationDateFrom)}</p>
          {quote.coverages.map((c,i)=><details key={i} className="mt-4 rounded-button bg-canvas p-3.5"><summary className="cursor-pointer text-body-sm font-medium">{c.name} {c.selected?'· Selected by If':'· Alternative'}</summary><ul className="mt-3 space-y-3">{c.items.map(item=><li key={item.id}><p className="text-body-sm font-medium">{item.name}</p><p className="mt-1 whitespace-pre-line text-caption text-graphite">{item.description??'Description unavailable. Verify this coverage with If.'}</p></li>)}</ul></details>)}
          {quote.terms.map(t=><a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-1.5 text-body-sm text-blue-ink hover:underline">{t.name}<ExternalLink className="size-3" aria-hidden/></a>)}
          {quote.warnings.map(w=><p key={w} className="mt-3 rounded-button bg-warn-tint p-3 text-caption text-warn-ink">{w}</p>)}
          {!expense&&<div className="mt-5 border-t border-hairline pt-4"><Field label="Months to include in your moving budget">{props=><Select {...props} value={months} onChange={e=>setMonths(Number(e.target.value))}>{[1,3,6,12,24,36].map(n=><option key={n} value={n}>{n} {n===1?'month':'months'}</option>)}</Select>}</Field>
            <p className="mt-3 text-body-sm">Proposed expense: <strong>{formatMoney(planned,{exact:true})}</strong></p><p className="mt-1 text-caption text-graphite">{installments??'Unknown'} billing installment(s) in this period. Annual billing counts a full annual premium, even for a shorter plan. Later renewals are excluded.</p>
            <Button variant="ghost" className="mt-4 h-auto min-h-9 w-full justify-center whitespace-normal py-2" icon={<CheckCircle2/>} loading={propose.isPending} disabled={busy||dirty||expired||quote.environment!=='live'||!premium?.periodMonths} onClick={()=>{setError('');propose.mutate();}}>Add quote as proposed expense</Button>
          </div>}
        </div>}

        {expense&&<div className="rounded-card border border-ok-ink/15 bg-ok-tint p-4"><p className="flex items-center gap-2 text-body-sm font-semibold text-ok-ink"><CheckCircle2 className="size-4" aria-hidden/>Proposed in your plan</p><p className="mt-2 text-body-sm">{formatMoney(expense.plannedMinor,{exact:true})} over {expense.planningMonths} month(s)</p><p className="mt-1 text-caption text-graphite">{formatMoney(expense.premiumMinor,{exact:true})} · {expense.billingPeriod}. Annual equivalent: {formatMoney(expense.annualEquivalentMinor,{exact:true})}. This is not a purchased policy.</p><Button variant="text" size="sm" className="mt-3 -ml-2" icon={<Trash2/>} loading={remove.isPending} onClick={()=>remove.mutate()}>Remove proposed expense</Button></div>}
        <a href="https://developer.if-insurance.com/apis/property/householder-insurance-apis-finland" target="_blank" rel="noopener noreferrer" className={buttonClass('text','sm','h-auto whitespace-normal px-0 text-graphite')}>About If’s Finnish home insurance API<ExternalLink className="size-3" aria-hidden/></a>
      </div>
    </div>
    {notice&&<p role="status" className="border-t border-hairline bg-canvas px-5 py-3 text-body-sm sm:px-6">{notice}</p>}
    {error&&<p role="alert" className="border-t border-danger-ink/10 bg-danger-tint px-5 py-3 text-body-sm text-danger-ink sm:px-6">{error}</p>}
  </section>;
}
