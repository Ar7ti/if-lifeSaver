import { ArrowRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { scrollToSection } from '@/features/workspace/scroll';
import { formatMoney } from '@/lib/format';

/** Confirmation that a quote is now a proposed recurring expense in the budget. */
export function BudgetLinked({plannedMinor,months,monthlyMinor,annualMinor,premiumLine,demo,needsReview,monthlyBudgetMinor,busy,removing,onRemove}:{plannedMinor:number;months:number;monthlyMinor?:number;annualMinor?:number;premiumLine?:string;demo?:boolean;needsReview?:boolean;monthlyBudgetMinor?:number;busy:boolean;removing:boolean;onRemove:()=>void}){
 return <div className="rounded-[16px] bg-ok-tint p-4">
  <p className="flex items-center gap-2 text-body-sm font-semibold text-ok-ink"><span className="emoji" aria-hidden>💸</span>In your budget · proposed, not purchased</p>
  <p className="mt-2 text-[20px] font-semibold tracking-[-0.4px] text-ink tabular">{formatMoney(plannedMinor,{exact:true})}<span className="ml-1.5 text-body-sm font-normal text-graphite">over {months} {months===1?'month':'months'}</span></p>
  <p className="mt-1 text-caption text-ink/75">{[premiumLine,monthlyMinor!==undefined?`About ${formatMoney(monthlyMinor,{exact:true})} a month`:null,annualMinor!==undefined?`${formatMoney(annualMinor,{exact:true})} a year`:null,demo?'Fictional demo amount':null].filter(Boolean).join(' · ')}</p>
  {monthlyBudgetMinor!==undefined&&monthlyMinor!==undefined&&<p className="mt-1 text-caption text-ink/75">Monthly budget: {formatMoney(monthlyBudgetMinor)} · after insurance {formatMoney(monthlyBudgetMinor-monthlyMinor,{exact:true})}, before other monthly costs.</p>}
  {needsReview&&<p className="mt-2 text-caption font-medium text-warn-ink">This linked price needs review. It hasn&rsquo;t been replaced automatically.</p>}
  <div className="mt-3 flex flex-wrap items-center gap-1">
   <Button size="sm" variant="text" className="-ml-2 text-ok-ink" icon={<ArrowRight/>} onClick={()=>scrollToSection('w-budget')}>View budget</Button>
   <Button size="sm" variant="text" className="text-graphite" icon={<Trash2/>} loading={removing} disabled={busy} onClick={onRemove}>Remove</Button>
  </div>
 </div>;
}
