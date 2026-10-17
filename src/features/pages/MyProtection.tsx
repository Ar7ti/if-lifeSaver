import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { ShieldCheck,ArrowRight } from 'lucide-react';
import { useApi } from '@/api';
import { useProjects } from '@/stores/projects';
import { projectKey,useProjectWriter } from '@/hooks/useProject';
import { PageContainer,PageHeader } from './PageHeader';
import { protectionLabels } from '@/features/workspace/ProtectionSection';
import { Button } from '@/components/ui/Button';
import { formatMoney } from '@/lib/format';
import type { LifeProject,ProtectionRecommendation } from '@contracts';

function ProtectionRow({project,rec}:{project:LifeProject;rec:ProtectionRecommendation}){
 const writer=useProjectWriter(project.id);const quote=project.protection?.car.quotes.at(-1);const home=project.homeInsurance?.quote;
 const reopen=async()=>{try{writer.setProject(await writer.api.updateProtection(project.id,{product:rec.insuranceType,status:'in_progress'}));}catch(e){writer.fail(e);}};
 return <article className="card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-caption font-medium uppercase tracking-[0.08em] text-graphite">{rec.insuranceType} · {project.title}</p><h3 className="mt-2 text-body font-semibold">{protectionLabels[rec.status]}</h3></div><ShieldCheck className="size-5 text-[#003b5c]"/></div>
  <p className="mt-3 text-body-sm text-graphite">{rec.status==='already_insured_self_reported'?'Existing insurance was reported by you. No policy or coverage has been independently verified.':rec.status==='reviewed'?'You marked this reviewed. This does not mean insurance was purchased.':rec.explanation}</p>
  {rec.insuranceType==='car'&&quote&&<div className="mt-3 rounded-button bg-canvas p-3 text-body-sm"><p className="font-medium">{quote.sourceMode==='demo'?'Demo quote — not an official If insurance price.':quote.sourceMode==='sandbox'?'If sandbox test data':'If returned prices'} · {quote.status}</p>{quote.options.map(o=><p key={o.id} className="mt-1">{o.title}: {o.prices.map(v=>`${formatMoney(v.amountMinor,{exact:true})} / ${v.billingPeriod}`).join(' · ')}</p>)}<p className="mt-2 text-caption">{quote.validUntil?`Valid until ${quote.validUntil}`:'No expiry supplied. Recheck before relying on the price.'}</p></div>}
  {rec.insuranceType==='home'&&home&&<p className="mt-3 rounded-button bg-canvas p-3 text-body-sm">{home.environment==='sandbox'?'If sandbox test quote':'Saved If home quote'} · {home.premiums.map(p=>`${formatMoney(p.amountMinor,{exact:true})} / ${p.billingPeriod}`).join(' · ')} · Valid through {home.validTo}</p>}
  {rec.insuranceType==='car'&&project.protection?.car.budgetLink&&<p className="mt-3 text-body-sm">Proposed ownership expense: {formatMoney(project.protection.car.budgetLink.plannedMinor)} / {project.protection.car.budgetLink.planningMonths} planning months{project.protection.car.budgetLink.needsReview?' · Needs revalidation':''}.</p>}
  {rec.insuranceType==='home'&&project.homeInsurance?.expense&&<p className="mt-3 text-body-sm">Proposed home expense: {formatMoney(project.homeInsurance.expense.plannedMinor)} / {project.homeInsurance.expense.planningMonths} planning months.</p>}
  <div className="mt-4 flex flex-wrap items-center gap-3"><Link to={`/app/p/${project.id}#protection`} onClick={()=>void reopen()} className="inline-flex items-center gap-1.5 text-body-sm font-medium text-blue-ink hover:underline">Open protection in workspace<ArrowRight className="size-3"/></Link>{rec.status!=='dismissed'&&<Button size="sm" onClick={async()=>{try{writer.setProject(await writer.api.updateProtection(project.id,{product:rec.insuranceType,status:'dismissed'}));}catch(e){writer.fail(e);}}}>Not now</Button>}</div>
 </article>;
}
export function MyProtection(){
 const api=useApi();const known=useProjects(s=>s.projects).filter(p=>p.source===api.source);
 const results=useQueries({queries:known.map(p=>({queryKey:projectKey(api.source,p.id),queryFn:()=>api.getProject(p.id),retry:false}))});
 const rows=results.flatMap(q=>q.data?(q.data.protection?.recommendations??[]).map(rec=>({project:q.data!,rec})):[]);
 return <PageContainer><PageHeader title="My Protection" description="Insurance planning across your workspaces. This is not an official If policy account; active cover is not verified here."/>
  {results.some(q=>q.isPending)&&<p role="status" className="mb-5 text-body-sm text-graphite">Loading protection from your saved workspaces…</p>}
  {results.some(q=>q.isError)&&<p role="alert" className="mb-5 rounded-button bg-warn-tint p-3 text-body-sm text-warn-ink">Some workspaces could not be loaded. Check the connection and reload; their records have not been removed.</p>}
  {!rows.length&&!results.some(q=>q.isPending)&&<div className="card p-8"><ShieldCheck className="mb-4 size-7 text-graphite"/><h2 className="text-subheading font-semibold">Plan your next chapter first</h2><p className="mt-2 text-body-sm text-graphite">Open or create a moving, car purchase or travel workspace to see relevant protection. Only workspaces known to this browser are listed.</p><Link to="/app/new" className="mt-4 inline-block text-blue-ink hover:underline">Create a workspace</Link></div>}
  {[{title:'Needs attention',filter:(r:ProtectionRecommendation)=>['quote_expired','quote_unavailable'].includes(r.status)},{title:'Quotes and estimates',filter:(r:ProtectionRecommendation)=>r.status==='quote_available'},{title:'Recommended for you',filter:(r:ProtectionRecommendation)=>['detected','suggested','in_progress'].includes(r.status)},{title:'Already reviewed or postponed',filter:(r:ProtectionRecommendation)=>['dismissed','reviewed','already_insured_self_reported'].includes(r.status)}].map(group=>{const items=rows.filter(r=>group.filter(r.rec));return items.length?<section key={group.title} className="mb-8"><h2 className="mb-3 text-subheading font-semibold">{group.title}</h2><div className="grid gap-4 lg:grid-cols-2">{items.map(r=><ProtectionRow key={r.rec.id} {...r}/>)}</div></section>:null;})}
 </PageContainer>;
}
