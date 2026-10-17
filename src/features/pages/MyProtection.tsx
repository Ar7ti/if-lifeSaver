import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useApi } from '@/api';
import { useProjects } from '@/stores/projects';
import { projectKey,useProjectWriter } from '@/hooks/useProject';
import { PageContainer,PageHeader } from './PageHeader';
import { Button, buttonClass } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/States';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/cn';
import { PRODUCT_NAME, ProductTile, SourceBadge, StatusPill } from '@/features/protection/ui';
import type { LifeProject,ProtectionRecommendation } from '@contracts';

/** One compact row per recommendation: what, where, status, price, budget, next action. */
function ProtectionRow({project,rec}:{project:LifeProject;rec:ProtectionRecommendation}){
 const writer=useProjectWriter(project.id);const quote=project.protection?.car.quotes.at(-1);const home=project.homeInsurance?.quote;
 const reopen=async()=>{try{writer.setProject(await writer.api.updateProtection(project.id,{product:rec.insuranceType,status:'in_progress'}));}catch(e){writer.fail(e);}};
 const carLink=rec.insuranceType==='car'?project.protection?.car.budgetLink:null;
 const homeExpense=rec.insuranceType==='home'?project.homeInsurance?.expense:null;
 const price=rec.insuranceType==='car'&&quote?{source:quote.sourceMode,options:quote.options.map(o=>`${o.title}: ${o.prices.map(v=>`${formatMoney(v.amountMinor,{exact:true})} / ${v.billingPeriod}`).join(' · ')}`),valid:quote.validUntil?`Valid until ${quote.validUntil}`:'No expiry supplied · recheck before relying on it',state:quote.status}
  :rec.insuranceType==='home'&&home?{source:home.environment,options:[home.premiums.map(p=>`${formatMoney(p.amountMinor,{exact:true})} / ${p.billingPeriod}`).join(' · ')],valid:`Valid through ${home.validTo}`,state:'available' as const}:null;
 const note=rec.status==='already_insured_self_reported'?'You said you already have cover. It hasn’t been verified here.':rec.status==='reviewed'?'Marked as reviewed. This doesn’t mean insurance was bought.':rec.status==='dismissed'?'Postponed. Reopen it whenever you’re ready.':rec.explanation;
 return <li className="card p-4 sm:p-5">
  <div className="flex items-start gap-3.5">
   <ProductTile product={rec.insuranceType} size="sm"/>
   <div className="min-w-0 flex-1">
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
     <h3 className="text-body font-medium">{PRODUCT_NAME[rec.insuranceType]}<span className="font-normal text-graphite"> · {project.title}</span></h3>
     <StatusPill status={rec.status}/>
    </div>
    <p className="mt-1 text-body-sm text-graphite">{note}</p>
    {price&&<div className="mt-3 rounded-[12px] bg-canvas px-3.5 py-3">
     <SourceBadge source={price.source}/>
     {price.options.map(o=><p key={o} className="mt-2 text-body-sm font-medium tabular">{o}</p>)}
     <p className="mt-1 text-caption text-graphite">{price.valid}{price.state!=='available'?` · ${price.state}`:''}</p>
    </div>}
    {(carLink||homeExpense)&&<p className="mt-2 flex flex-wrap items-center gap-1.5 text-body-sm"><span className="emoji" aria-hidden>💸</span>In budget: <strong className="font-semibold tabular">{formatMoney((carLink??homeExpense)!.plannedMinor)}</strong><span className="text-graphite">over {(carLink??homeExpense)!.planningMonths} months · proposed{carLink?.needsReview?' · needs revalidation':''}</span></p>}
    <div className="mt-3 flex flex-wrap items-center gap-1">
     <Link to={`/app/p/${project.id}#protection`} onClick={()=>{if(['detected','suggested','dismissed'].includes(rec.status))void reopen();}} className={buttonClass('ghost','sm','group')}>Open in workspace<ArrowRight className="transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden/></Link>
     {rec.status!=='dismissed'&&<Button size="sm" variant="text" className="text-graphite" onClick={async()=>{try{writer.setProject(await writer.api.updateProtection(project.id,{product:rec.insuranceType,status:'dismissed'}));}catch(e){writer.fail(e);}}}>Not now</Button>}
    </div>
   </div>
  </div>
 </li>;
}

const GROUPS=[
 {key:'attention',title:'Needs attention',filter:(r:ProtectionRecommendation)=>['quote_expired','quote_unavailable'].includes(r.status)},
 {key:'quotes',title:'Prices received',filter:(r:ProtectionRecommendation)=>r.status==='quote_available'},
 {key:'recommended',title:'Recommended for you',filter:(r:ProtectionRecommendation)=>['detected','suggested','in_progress'].includes(r.status)},
 {key:'done',title:'Reviewed or postponed',filter:(r:ProtectionRecommendation)=>['dismissed','reviewed','already_insured_self_reported'].includes(r.status)},
];

export function MyProtection(){
 const api=useApi();const known=useProjects(s=>s.projects).filter(p=>p.source===api.source);
 const results=useQueries({queries:known.map(p=>({queryKey:projectKey(api.source,p.id),queryFn:()=>api.getProject(p.id),retry:false}))});
 const rows=results.flatMap(q=>q.data?(q.data.protection?.recommendations??[]).map(rec=>({project:q.data!,rec})):[]);
 const loading=results.some(q=>q.isPending);
 const inBudget=rows.reduce((sum,r)=>sum+(r.rec.insuranceType==='car'?r.project.protection?.car.budgetLink?.plannedMinor??0:r.rec.insuranceType==='home'?r.project.homeInsurance?.expense?.plannedMinor??0:0),0);
 const counts=GROUPS.map(g=>({...g,count:rows.filter(r=>g.filter(r.rec)).length}));
 return <PageContainer className="max-w-[960px]"><PageHeader title="My Protection" description="Insurance planning across your workspaces. Not an If policy account: active cover isn’t verified here."/>
  {results.some(q=>q.isError)&&<p role="alert" className="mb-5 rounded-button bg-warn-tint px-3.5 py-2.5 text-body-sm text-warn-ink">Some workspaces couldn&rsquo;t be loaded. Check the connection and reload; nothing has been removed.</p>}
  {loading&&!rows.length?<div className="flex flex-col gap-3" role="status" aria-label="Loading protection"><Skeleton className="h-20 rounded-[20px]"/><Skeleton className="h-36 rounded-[20px]"/><Skeleton className="h-36 rounded-[20px]"/></div>
  :!rows.length?<div className="card flex flex-col items-center p-10 text-center"><img src="/illustrations/guide.png" alt="" width="72" height="72" className="size-16 object-contain" aria-hidden/><h2 className="mt-3 text-subheading font-medium">Nothing to protect yet</h2><p className="mt-2 max-w-sm text-body-sm text-graphite">Plan a move, a car purchase or a trip, and relevant insurance shows up here. Only workspaces from this browser are listed.</p><Link to="/app/new" className={buttonClass('primary','md','mt-5')}>Start a life project</Link></div>
  :<>
   <dl className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-[20px] bg-black/[0.06] shadow-[0_0_0_1px_rgb(0_0_0/0.04)] sm:grid-cols-4">
    {[...counts.slice(0,3).map(c=>({label:c.title,value:String(c.count),alert:c.key==='attention'&&c.count>0})),{label:'Planned in budgets',value:formatMoney(inBudget),alert:false}].map(s=><div key={s.label} className="bg-surface px-4 py-3.5"><dt className="text-caption text-graphite">{s.label}</dt><dd className={cn('mt-0.5 text-[22px] font-semibold tracking-[-0.5px] tabular',s.alert&&'text-warn-ink')}>{s.value}</dd></div>)}
   </dl>
   {counts.map(group=>{const items=rows.filter(r=>group.filter(r.rec));return items.length?<section key={group.key} aria-labelledby={`pg-${group.key}`} className="mb-8"><h2 id={`pg-${group.key}`} className="mb-3 flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] text-graphite uppercase">{group.title}<span className="tabular" aria-hidden>{items.length}</span></h2><ul className="flex flex-col gap-3">{items.map(r=><ProtectionRow key={`${r.project.id}-${r.rec.id}`} {...r}/>)}</ul></section>:null;})}
  </>}
 </PageContainer>;
}
