import { useState } from 'react';
import { itemVisual, ProductImageUrlSchema } from '@contracts';
import { cn } from '@/lib/cn';

type VisualItem={title:string;category:string;kind?:'product'|'service';imageUrl?:string|null;imageType?:'listing'|'category'|'demo';imageSource?:'provider'|'cited_summary'|'demo'};
type Props={item:VisualItem;compact?:boolean;className?:string};
export function ProductVisual(props:Props) {
 return <VisualContent key={`${props.item.imageUrl??''}:${props.item.imageType??''}`} {...props}/>;
}
function VisualContent({item,compact=false,className}:Props) {
 const [failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false);
 const visual=itemVisual(item.category,item.title,item.kind);
 const usable=item.imageUrl&&item.imageType!=='category'&&item.imageType!=='demo'&&ProductImageUrlSchema.safeParse(item.imageUrl).success&&!failed;
 const photoLabel=item.imageSource==='provider'?'Provider product photo':'Source-reported image · not independently verified';
 return <div className={cn('relative shrink-0 overflow-hidden rounded-[10px] bg-canvas',compact?'size-12':'aspect-[16/10] w-full',className)} title={usable?photoLabel:`${visual.label} category illustration; not a product photograph`}>
  {(!usable||!loaded)&&<div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-graphite" role="img" aria-label={`${visual.label} category illustration`}>
   <span className={cn('emoji',compact?'text-[23px]':'text-[38px]')} aria-hidden>{visual.emoji}</span>
   {!compact&&<span className="text-[11px]">Category illustration · no listing photo</span>}
  </div>}
  {usable&&<img src={item.imageUrl!} alt={compact?'':`${item.title} — source image`} width={320} height={200} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)} className={cn('absolute inset-0 h-full w-full object-contain transition-opacity motion-reduce:transition-none',loaded?'opacity-100':'opacity-0')} />}
  {usable&&loaded&&!compact&&<span className="absolute right-1 bottom-1 left-1 rounded bg-surface/95 px-1.5 py-1 text-[10px] text-graphite">{photoLabel}</span>}
 </div>;
}
