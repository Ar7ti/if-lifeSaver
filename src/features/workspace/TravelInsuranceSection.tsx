import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLink, Plane, ShieldCheck } from 'lucide-react';
import { TravelPriceRequestSchema } from '@contracts';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { formatDate, formatMoney } from '@/lib/format';
import { useWorkspace } from './context';

export function TravelInsuranceSection(){
  const {project,writer}=useWorkspace();
  const [postalCode,setPostalCode]=useState('');
  const [consent,setConsent]=useState(false);
  const [error,setError]=useState('');
  const identity=useRef<HTMLInputElement>(null);
  const status=useQuery({queryKey:['if-travel-status',writer.api.source,project.id],queryFn:()=>writer.api.travelInsuranceStatus(project.id),retry:false,staleTime:30000});
  const quote=useMutation({
    mutationFn:async()=>{
      const input=TravelPriceRequestSchema.safeParse({personalIdentityNumber:identity.current?.value??'',postalCode,consent});
      if(identity.current)identity.current.value='';
      if(!input.success)throw new Error('Enter a Finnish postal code and identity number, then agree to request the quote.');
      return writer.api.travelInsuranceQuote(project.id,input.data);
    },
    onError:err=>setError(err instanceof Error?err.message:'If could not return a travel quote.'),
  });
  const data=quote.data;
  return <section aria-labelledby="if-travel-title" className="card mb-7 overflow-hidden">
    <header className="flex items-start gap-3 border-b border-hairline bg-[#f7f4ef] p-5 sm:p-6"><span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-[#003b5c] font-serif text-[28px] italic text-white" aria-label="If">If</span><div><h2 id="if-travel-title" className="text-subheading font-semibold">Travel insurance with If</h2><p className="mt-1.5 text-body-sm text-graphite">See a personal insurance quote while planning your trip.</p></div></header>
    <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2"><div>
      <div className="mb-4 flex items-center gap-2"><Plane className="size-4" aria-hidden/><h3 className="text-body-sm font-semibold">Your details</h3></div>
      <p className="mb-4 text-caption text-graphite">If’s Finnish quote API calculates a travel insurance product from policyholder details. Your trip dates and destination are not submitted as pricing inputs.</p>
      <fieldset disabled={quote.isPending} className="grid gap-4">
        <Field label="Your postal code">{props=><Input {...props} inputMode="numeric" value={postalCode} maxLength={5} onChange={e=>{setPostalCode(e.target.value);quote.reset();setError('');}} placeholder="20100"/>}</Field>
        <Field label={status.data?.environment==='sandbox'?'Finnish test identity number':'Finnish personal identity number'} hint="Used only for this quote request; it is not saved or sent to the AI assistant.">{props=><Input {...props} ref={identity} type="password" autoComplete="off" maxLength={11} onChange={()=>{quote.reset();setError('');}}/>}</Field>
      </fieldset>
      <label className="mt-4 flex items-start gap-2 text-caption text-graphite"><input type="checkbox" checked={consent} onChange={e=>{setConsent(e.target.checked);quote.reset();}} className="mt-0.5" disabled={quote.isPending}/>I agree to send these details to If to request a quote. No insurance is purchased.</label>
      <Button variant="primary" className="mt-5" loading={quote.isPending} disabled={status.isPending||!status.data?.available||quote.isPending} onClick={()=>{setError('');quote.mutate();}}>Request If quote</Button>
      <p className="mt-3 text-caption text-graphite" role="status">{status.data?.message??(status.isPending?'Checking If access…':'If access could not be checked.')}</p>
      {error&&<p role="alert" className="mt-3 rounded-button bg-danger-tint p-3 text-body-sm text-danger-ink">{error}</p>}
    </div><div className="rounded-card bg-canvas p-5">
      <h3 className="flex items-center gap-2 text-body-sm font-semibold"><ShieldCheck className="size-4" aria-hidden/>If travel quote</h3>
      {!data?<p className="mt-4 text-body-sm text-graphite">Price, billing period and coverage options will appear here after If responds.</p>:<>
        <p className="mt-3 text-caption text-graphite">{data.environment==='sandbox'?'Sandbox · test data':'Live If quote'} · Valid through {formatDate(data.validTo)}</p>
        <p className="mt-3 text-body-sm">Maximum trip length covered by this quote: <strong>{data.maximumTripDays} days</strong>. Check the terms for your planned trip.</p>
        {data.prices.map((p,i)=><div key={i} className="mt-3 rounded-button border border-hairline bg-surface p-3"><p className="text-[24px] font-semibold">{formatMoney(p.amountMinor,{exact:true})}<span className="ml-2 text-body-sm font-normal text-graphite">/ {p.billingPeriod}</span></p><p className="mt-1 text-caption text-graphite">Gross {formatMoney(p.grossMinor,{exact:true})} · discount {formatMoney(p.discountMinor,{exact:true})}</p></div>)}
        {data.coverages.map((c,i)=><div key={i} className="mt-3 rounded-button border border-hairline bg-surface p-3"><p className="text-body-sm font-medium">{c.name}{c.selected?' · Selected by If':' · Alternative'}</p><p className="mt-1 text-caption text-graphite">{c.prices.map(p=>`${formatMoney(p.amountMinor,{exact:true})} / ${p.billingPeriod}`).join(' · ')||'Price not returned'}</p></div>)}
        <p className="mt-4 text-caption text-graphite">{data.warning}</p>
        {data.terms.map(t=><a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-1 text-body-sm text-blue-ink hover:underline">{t.name}<ExternalLink className="size-3" aria-hidden/></a>)}
      </>}
      <a href="https://developer.if-insurance.com/apis/person/travel-insurance-apis-finland/documentation" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-1 text-caption text-graphite hover:underline">About If’s Finnish travel quote API <ExternalLink className="size-3" aria-hidden/></a>
    </div></div>
  </section>;
}
