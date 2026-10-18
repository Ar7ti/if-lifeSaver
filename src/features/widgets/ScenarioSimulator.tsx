import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { Check, Gauge, Info, Leaf, RotateCw, Scale, Sparkles } from 'lucide-react';
import type { SimulationScenario } from '@contracts';
import { useWorkspace } from '@/features/workspace/context';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { ProductVisual } from '@/components/ui/ProductVisual';
import { formatMoney, formatTime } from '@/lib/format';
import { toast } from '@/stores/toast';
import { cn } from '@/lib/cn';

const META={economy:{icon:Leaf,goal:'Spend as little as possible'},balanced:{icon:Scale,goal:'Price, practicality and convenience'},comfort:{icon:Sparkles,goal:'Ease and convenience first'}};
function Meter({label,value}:{label:string;value:SimulationScenario['convenience']}) {
 const level=value==='high'?3:value==='medium'?2:value==='low'?1:0;
 return <div><div className="flex flex-wrap justify-between gap-1 text-caption"><span className="text-graphite">{label}</span><span className="font-medium capitalize">{value==='unknown'?'Not enough information':value}</span></div>
  <div className="mt-2 flex gap-1" aria-hidden>{[1,2,3].map(i=><span key={i} className={cn('h-1 flex-1 rounded-full',i<=level?'bg-ink/70':'bg-ink/10')}/>)}</div>
 </div>;
}
export function ScenarioSimulator() {
 const {project,writer,ask}=useWorkspace();
 const [viewed,setViewed]=useState<SimulationScenario['id']>('balanced'),[confirm,setConfirm]=useState(false);
 const reduce=useReducedMotion();
 const chosenId=project.scenarioSelection?.id;
 const scenarios=project.scenarios;
 const current=scenarios.find(s=>s.id===viewed)??scenarios[0];
 const offers=new Map(project.researchResults.flatMap(r=>r.offers).map(o=>[o.id,o]));
 const recalc=useMutation({mutationFn:()=>writer.api.recalculateScenarios(project.id),onSuccess:()=>{void writer.refresh();toast.success('Scenarios recalculated');},onError:writer.fail});
 const apply=useMutation({mutationFn:()=>writer.api.applyScenario(project.id,current!.id,{approved:true,expectedRevision:project.revision,expectedFingerprint:current!.fingerprint!}),onSuccess:p=>{writer.setProject(p);setConfirm(false);toast.success('Plan saved','Proposed changes are saved. Nothing has been bought.');},onError:writer.reloadOnConflict});
 if(!current)return <EmptyState icon={<Gauge/>} title="No scenarios yet" action={<Button loading={recalc.isPending} onClick={()=>recalc.mutate()}>Calculate scenarios</Button>}>Set a budget to compare approaches.</EmptyState>;
 const changes=current.changes??[];
 const identical=scenarios.every(s=>s.estimatedTotalMinor===scenarios[0]!.estimatedTotalMinor&&s.selectedOfferIds.join()===scenarios[0]!.selectedOfferIds.join());
 const meta=META[current.id];
 const applyDisabled=!current.fingerprint||!current.withinBudget||apply.isPending;
 return <div className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-body-sm text-graphite">Three ways to reach your goal. Chosen items stay fixed; proposals can differ.</p><Button size="sm" onClick={()=>recalc.mutate()} icon={<RotateCw/>} loading={recalc.isPending}>Recalculate</Button></div>
  <div role="tablist" aria-label="Approaches" className="grid grid-cols-3 gap-1 rounded-[14px] bg-ink/[0.05] p-1" onKeyDown={e=>{
   if(!['ArrowRight','ArrowLeft'].includes(e.key))return;e.preventDefault();const i=scenarios.findIndex(s=>s.id===current.id),next=scenarios[(i+(e.key==='ArrowRight'?1:scenarios.length-1))%scenarios.length]!;setViewed(next.id);requestAnimationFrame(()=>document.getElementById(`scn-${project.id}-${next.id}`)?.focus());
  }}>{scenarios.map(s=>{const Icon=META[s.id].icon;return <button key={s.id} id={`scn-${project.id}-${s.id}`} role="tab" aria-selected={s.id===current.id} aria-controls={`scn-panel-${project.id}`} tabIndex={s.id===current.id?0:-1} onClick={()=>setViewed(s.id)} className={cn('min-w-0 rounded-[10px] px-1 py-2 text-center transition-colors',s.id===current.id?'bg-surface shadow-sm':'text-graphite hover:bg-surface/50')}>
   <span className="flex items-center justify-center gap-1 text-body-sm font-medium"><Icon className="size-3.5 max-sm:hidden" aria-hidden/>{s.name}{s.id===chosenId&&<><Check className="size-3 text-blue-ink"/><span className="sr-only">your plan</span></>}</span><span className="block text-caption tabular">{formatMoney(s.estimatedTotalMinor)}</span>
  </button>;})}</div>
  {identical&&<p className="flex items-start gap-2 text-caption text-graphite"><Info className="mt-px size-3.5 shrink-0" aria-hidden/><span>Same total for all three right now. {current.explanation??'Only the recorded choices and allocation estimates are available.'}</span></p>}
  <motion.div key={current.id} id={`scn-panel-${project.id}`} role="tabpanel" aria-labelledby={`scn-${project.id}-${current.id}`} initial={reduce?false:{opacity:0,y:4}} animate={{opacity:1,y:0}} transition={{duration:reduce?0:0.16}} className="rounded-[16px] bg-canvas p-4 sm:p-5">
   {(current.sourceMode==='demo'||current.sourceMode==='mixed')&&<p className="mb-3 rounded-full bg-warn-tint px-3 py-1 text-caption text-warn-ink">Fictional demo comparison · not real shopping prices</p>}
   <div className="flex flex-wrap justify-between gap-3"><div><p className="text-caption text-graphite">{meta.goal}</p><p className="mt-1 text-[30px] font-semibold tracking-tight tabular">{formatMoney(current.estimatedTotalMinor)} <span className="text-body-sm font-normal text-graphite">known + estimated total</span></p></div>
    {chosenId===current.id&&!project.scenarioSelection?.needsReview?<span className="inline-flex h-8 items-center gap-1 rounded-full bg-sky-tint px-3 text-body-sm text-blue-ink"><Check className="size-4"/>Your plan</span>:<Button variant="primary" size="sm" disabled={applyDisabled} loading={apply.isPending} onClick={()=>changes.length?setConfirm(true):apply.mutate()}>Plan with {current.name}</Button>}
   </div>
   <p className={cn('mt-2 text-body-sm',current.remainingMinor<0?'text-danger-ink':'text-graphite')}>{current.remainingMinor<0?`${formatMoney(-current.remainingMinor)} over budget`:`${formatMoney(current.remainingMinor)} left of ${formatMoney(project.budget.totalMinor)}`} · reserve {formatMoney(current.emergencyReserveMinor)}</p>
   {!current.withinBudget&&<p className="mt-1 text-caption text-warn-ink">{!project.budget.confirmed?'Confirm your budget before applying a scenario.':'This plan cannot fit the budget while preserving the reserve.'}</p>}
   {project.scenarioSelection?.needsReview&&<p className="mt-2 text-caption text-warn-ink">Your plan changed since the last scenario selection. Review it again before applying.</p>}
   <div className="mt-4 grid gap-4 sm:grid-cols-2"><Meter label="Convenience" value={current.convenience}/><Meter label="Effort" value={current.effort}/></div>
   <p className="mt-4 text-body-sm">{current.explanation??current.tradeOffs[0]}</p>
   <ul className="mt-2 space-y-1 text-caption text-graphite">{current.convenienceEvidence?.map(e=><li key={e}>{e}</li>)}</ul>
   {changes.length>0&&<div className="mt-4 border-t border-hairline pt-3"><p className="mb-2 text-caption font-semibold">What would change</p><ul className="space-y-2">{changes.map(c=>{const o=offers.get(c.offerId);return <li key={`${c.cartItemId??'new'}-${c.offerId}`} className="flex items-center gap-3 text-body-sm">{o&&<ProductVisual item={o} compact/>}<span className="min-w-0 flex-1"><span className="block font-medium">{c.kind==='replace'?'Replace proposal':'Add proposal'} · {c.title}</span><span className="text-caption text-graphite">{c.quantity} × item · {c.kind==='replace'?`${formatMoney(c.previousMinor)} → `:''}{formatMoney(c.totalMinor)}</span></span></li>;})}</ul></div>}
   <details className="mt-4 border-t border-hairline pt-3 text-caption"><summary className="cursor-pointer font-medium">Details</summary><div className="mt-3 space-y-3 text-graphite">
    <p>{formatMoney(current.verifiedCostMinor)} source-confirmed base prices · {formatMoney(current.estimatedCostMinor)} estimated / demo. Unknown fees are excluded.</p>
    <p>Included: {current.selectedOfferIds.map(id=>offers.get(id)?.title).filter(Boolean).join(' · ')||'Saved plan and provisional category allocations'}. {current.lockedCartItemIds.length} chosen item(s) remain fixed.</p>
    <ul className="list-disc space-y-1 pl-4">{[...current.tradeOffs,...current.missingData,...current.risks].map((v,i)=><li key={i} className="break-words">{v}</li>)}</ul>
   </div></details>
  </motion.div>
  {apply.isError&&!confirm&&<ErrorState error={apply.error}/>}
  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-caption text-graphite">Calculated at {formatTime(current.calculatedAt)}. No research runs when switching approaches.</p><Button size="sm" variant="text" onClick={()=>ask('Research more alternatives for this plan so I can compare price and convenience.')}>Research alternatives</Button></div>
  <Dialog open={confirm} onClose={()=>setConfirm(false)} title={`Apply ${current.name} to your plan?`} description="Only the proposals below will change. Chosen items and insurance expenses are preserved. Nothing is purchased." footer={<><Button onClick={()=>setConfirm(false)}>Cancel</Button><Button variant="primary" loading={apply.isPending} disabled={applyDisabled} onClick={()=>apply.mutate()}>Confirm plan changes</Button></>}>
   <ul className="divide-y divide-hairline">{changes.map(c=><li key={c.offerId} className="flex justify-between gap-3 py-3 text-body-sm"><span>{c.kind==='replace'?'Replace proposal: ':'Add proposal: '}{c.title}</span><strong className="shrink-0">{formatMoney(c.totalMinor)}</strong></li>)}</ul>
   <p className="mt-3 text-caption text-graphite">Other allocations remain estimates until supported by a priced offer. Applying a scenario does not create expenses for unresolved estimates.</p>
   {apply.isError&&<ErrorState error={apply.error}/>}
  </Dialog>
 </div>;
}
