import type { Offer } from '@contracts';
import { ProductVisual } from '@/components/ui/ProductVisual';
export function OfferImage({offer,className}:{offer:Pick<Offer,'imageUrl'|'title'|'category'|'kind'|'imageSource'|'imageType'>;className?:string}) {
 return <ProductVisual item={offer} className={className}/>;
}
