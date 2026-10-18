import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { itemVisual, type CartItem, type Offer } from '@contracts';
import { useWorkspace } from '@/features/workspace/context';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ProductVisual } from '@/components/ui/ProductVisual';
import { ErrorState } from '@/components/ui/States';
import { formatMoney } from '@/lib/format';
import { toast } from '@/stores/toast';

export function ReplaceItemDialog({item,onClose,initialOfferId}:{item:CartItem;onClose:()=>void;initialOfferId?:string}) {
 const {project,writer,ask}=useWorkspace();
 const [selected,setSelected]=useState<string|null>(initialOfferId??null),[allowSelected,setAllowSelected]=useState(false);
 const group=itemVisual(item.category,item.title,item.kind).category;
 const options=project.researchResults.filter(r=>!r.warnings.some(w=>w.startsWith('Project constraints changed'))).flatMap(r=>r.offers).filter(o=>o.currency===project.budget.currency&&o.eligibilityStatus!=='potential')
  .filter((o,index,all)=>all.findIndex(v=>v.id===o.id)===index&&o.id!==item.offerId&&o.priceMinor!==null&&o.availability!=='out_of_stock'&&
   (o.category===item.category||group!=='unknown'&&itemVisual(o.category,o.title,o.kind).category===group)&&!project.cart.some(i=>i.id!==item.id&&i.offerId===o.id));
 const choice=options.find(o=>o.id===selected);
 const before=item.unitPriceMinor*item.quantity+(item.deliveryCostMinor??0);
 const after=choice?choice.priceMinor!*item.quantity+(choice.delivery.available===false?0:choice.delivery.costMinor??0):0;
 const undo=useMutation({mutationFn:({revision}:{revision:number})=>writer.api.undoCartReplacement(project.id,item.id,{approved:true,allowSelected:true,expectedRevision:revision}),onSuccess:writer.setProject,onError:writer.fail});
 const save=useMutation({mutationFn:()=>writer.api.replaceCartItem(project.id,item.id,{offerId:choice!.id,approved:true,allowSelected,expectedRevision:project.revision}),onSuccess:p=>{
  writer.setProject(p);onClose();toast.success('Choice replaced',`${formatMoney(before)} → ${formatMoney(after)}. No purchase was made.`,{label:'Undo',onClick:()=>undo.mutate({revision:p.revision})});
 },onError:writer.reloadOnConflict});
 const priceLabel=(offer:Offer)=>offer.priceStatus==='demo'?'Fictional demo':offer.priceStatus==='verified'?'Source-confirmed':'Reported / estimated';
 return <Dialog open onClose={onClose} title={`Replace ${item.title}`} description="Choose an alternative for this line. Quantity and planning status stay the same; nothing is purchased." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!choice||(item.status==='selected'&&!allowSelected)} loading={save.isPending} onClick={()=>save.mutate()}>Replace item</Button></>}>
  <div className="space-y-3">
   <p className="text-body-sm text-graphite">Current known line cost: <strong className="text-ink">{formatMoney(before)}</strong></p>
   {options.length===0&&<div className="rounded-card bg-canvas p-4 text-body-sm"><p>No priced alternatives are saved for this item.</p><Button className="mt-2" variant="outline" onClick={()=>{onClose();ask(`Find cheaper ${item.category} alternatives for ${item.title}`);}}>Research alternatives</Button></div>}
   <div role="radiogroup" aria-label="Replacement alternatives" className="space-y-2">{options.map(o=><label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-[12px] border border-hairline p-3 has-[:checked]:border-blue">
    <input type="radio" name="replacement" value={o.id} checked={selected===o.id} onChange={()=>setSelected(o.id)} className="accent-blue"/><ProductVisual item={o} compact/>
    <span className="min-w-0 flex-1 text-body-sm"><span className="block font-medium">{o.title}</span><span className="text-caption text-graphite">{o.seller.name??o.sourceName} · {priceLabel(o)}</span></span>
    <span className="text-body-sm font-semibold">{formatMoney(o.priceMinor!*item.quantity+(o.delivery.available===false?0:o.delivery.costMinor??0))}</span>
   </label>)}</div>
   {choice&&<p className="rounded-[10px] bg-canvas p-3 text-body-sm">{after<before?`${formatMoney(before-after)} less`:after>before?`${formatMoney(after-before)} more`:'Same known cost'} for {item.quantity} item(s). {choice.delivery.costMinor===null&&choice.delivery.available!==false?'Delivery costs are unknown and excluded.':''}</p>}
   {item.status==='selected'&&<label className="flex items-start gap-2 text-body-sm"><input type="checkbox" checked={allowSelected} onChange={e=>setAllowSelected(e.target.checked)} className="mt-1 accent-blue"/>I approve replacing this chosen item.</label>}
   {save.isError&&<ErrorState error={save.error}/>}
  </div>
 </Dialog>;
}
