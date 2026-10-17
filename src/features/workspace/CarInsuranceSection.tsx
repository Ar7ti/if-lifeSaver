import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CarFront, ExternalLink, ShieldCheck } from 'lucide-react';
import { CarPriceRequestSchema, type CarPriceRequest } from '@contracts';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { formatMoney } from '@/lib/format';
import { useWorkspace } from './context';

const mileageOptions=[5000,10000,15000,20000,25000,30000,40000,50000,50001] as const;
export function CarInsuranceSection(){
  const {project,writer}=useWorkspace();
  const [registration,setRegistration]=useState('');
  const [mileage,setMileage]=useState('15000');
  const [youngDriver,setYoungDriver]=useState(false);
  const [postCode,setPostCode]=useState('');
  const [streetAddress,setStreetAddress]=useState('');
  const [carPrice,setCarPrice]=useState('');
  const [consent,setConsent]=useState(false);
  const [error,setError]=useState('');
  const identity=useRef<HTMLInputElement>(null);
  const status=useQuery({queryKey:['if-car-status',writer.api.source,project.id],queryFn:()=>writer.api.carInsuranceStatus(project.id),retry:false,staleTime:30000});
  const price=useMutation({
    mutationFn:async()=>{
      const input=CarPriceRequestSchema.safeParse({registrationNumberFI:registration,socialSecurityNumberFI:identity.current?.value??'',driverBelow24YearsOfAge:youngDriver,maximumMileagePerYearInKilometers:mileage,postCode,streetAddress,carPrice:Number(carPrice),consent});
      if(identity.current)identity.current.value='';
      if(!input.success||!carPrice.trim())throw new Error('Complete the car, address and identity fields, then agree to request the price.');
      return writer.api.carInsurancePrice(project.id,input.data as CarPriceRequest);
    },
    onError:err=>setError(err instanceof Error?err.message:'If could not calculate a price.'),
  });
  const data=price.data;
  const changed=()=>{price.reset();setError('');};
  const showPrices=(items:{amountMinor:number;period:string}[])=>items.length?<ul className="mt-2 space-y-1">{items.map((p,i)=><li key={`${p.period}-${i}`} className="text-body-sm"><strong>{formatMoney(p.amountMinor,{exact:true})}</strong> / {p.period}</li>)}</ul>:<p className="mt-2 text-caption text-graphite">No price returned for this option.</p>;
  return <section aria-labelledby="if-car-title" className="card mb-7 overflow-hidden">
    <header className="flex items-start gap-3 border-b border-hairline bg-[#f7f4ef] p-5 sm:p-6"><span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-[#003b5c] font-serif text-[28px] italic text-white" aria-label="If">If</span><div><h2 id="if-car-title" className="text-subheading font-semibold">Car insurance with If</h2><p className="mt-1.5 text-body-sm text-graphite">Calculate a personal price for a used car before you buy it.</p></div></header>
    <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2"><div>
      <div className="mb-4 flex items-center gap-2"><CarFront className="size-4" aria-hidden/><h3 className="text-body-sm font-semibold">Car and driver details</h3></div>
      <fieldset disabled={price.isPending} className="grid gap-4 sm:grid-cols-2">
        <Field label="Registration number">{props=><Input {...props} value={registration} maxLength={8} placeholder="ABC-123" onChange={e=>{setRegistration(e.target.value.toUpperCase());changed();}}/>}</Field>
        <Field label="Car purchase price (€)">{props=><Input {...props} type="number" min={0} step="0.01" value={carPrice} onChange={e=>{setCarPrice(e.target.value);changed();}}/>}</Field>
        <Field label="Annual mileage">{props=><Select {...props} value={mileage} onChange={e=>{setMileage(e.target.value);changed();}}>{mileageOptions.map(n=><option key={n} value={n}>{n===50001?'Over 50,000':`Up to ${n.toLocaleString('en-US')} km`}</option>)}</Select>}</Field>
        <Field label="Postal code">{props=><Input {...props} inputMode="numeric" value={postCode} maxLength={5} onChange={e=>{setPostCode(e.target.value);changed();}}/>}</Field>
        <Field label="Street address" className="sm:col-span-2">{props=><Input {...props} value={streetAddress} maxLength={50} onChange={e=>{setStreetAddress(e.target.value);changed();}}/>}</Field>
        <Field label={status.data?.environment==='sandbox'?'Finnish test identity number':'Finnish personal identity number'} hint="Used for this price request only; it is not saved in the project." className="sm:col-span-2">{props=><Input {...props} ref={identity} type="password" autoComplete="off" maxLength={11} onChange={changed}/>}</Field>
      </fieldset>
      <label className="mt-4 flex items-center gap-2 text-body-sm"><input type="checkbox" checked={youngDriver} onChange={e=>{setYoungDriver(e.target.checked);changed();}} disabled={price.isPending}/>A driver is under 24</label>
      <label className="mt-3 flex items-start gap-2 text-caption text-graphite"><input type="checkbox" checked={consent} onChange={e=>{setConsent(e.target.checked);changed();}} className="mt-0.5" disabled={price.isPending}/>I agree to send these details to If to calculate a price. No insurance is purchased.</label>
      <Button variant="primary" className="mt-5" loading={price.isPending} disabled={status.isPending||!status.data?.available||price.isPending} onClick={()=>{setError('');price.mutate();}}>Calculate If price</Button>
      <p className="mt-3 text-caption text-graphite" role="status">{status.data?.message??(status.isPending?'Checking If access…':'If access could not be checked.')}</p>
      {error&&<p role="alert" className="mt-3 rounded-button bg-danger-tint p-3 text-body-sm text-danger-ink">{error}</p>}
    </div><div className="rounded-card bg-canvas p-5">
      <h3 className="flex items-center gap-2 text-body-sm font-semibold"><ShieldCheck className="size-4" aria-hidden/>If price result</h3>
      {!data?<p className="mt-4 text-body-sm text-graphite">Liability and optional casco prices will appear here after If responds.</p>:<>
        <p className="mt-3 text-caption text-graphite">{data.environment==='sandbox'?'Sandbox · test data':'Live If calculation'} · {data.insuranceBrand}</p>
        <div className="mt-4 rounded-button border border-hairline bg-surface p-3"><h4 className="text-body-sm font-medium">{data.mtplName} without casco</h4>{showPrices(data.mtplWithoutCasco)}</div>
        <div className="mt-3 rounded-button border border-hairline bg-surface p-3"><h4 className="text-body-sm font-medium">{data.mtplName} with casco</h4>{showPrices(data.mtplWithCasco)}</div>
        {data.cascoCoverages.map((c,i)=><div key={`${c.name}-${i}`} className="mt-3 rounded-button border border-hairline bg-surface p-3"><h4 className="text-body-sm font-medium">{c.name}{c.recommended?' · If recommended':''}</h4>{showPrices(c.prices)}{c.deductible!==null&&<p className="mt-2 text-caption text-graphite">Deductible: {formatMoney(c.deductible*100,{exact:true})}</p>}</div>)}
        <p className="mt-4 text-caption text-graphite">These are price components returned by If. Check the complete insurance terms before choosing a policy. {data.warning}</p>
        {data.terms.map(t=><a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-1 text-body-sm text-blue-ink hover:underline">{t.name}<ExternalLink className="size-3" aria-hidden/></a>)}
      </>}
      <a href="https://developer.if-insurance.com/apis/mobility/car-insurance-apis-finland/documentation" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-1 text-caption text-graphite hover:underline">About If's Finnish car price API <ExternalLink className="size-3" aria-hidden/></a>
    </div></div>
  </section>;
}
