import { CartChoiceSchema, type Offer, type CartItem } from '../../shared/contracts/index.js';
export function offerChoice(offer:Offer) {
 return CartChoiceSchema.parse({product:offer.product,offerId:offer.id,title:offer.title,category:offer.category,unitPriceMinor:offer.priceMinor,
  deliveryCostMinor:offer.delivery.available===false?0:offer.delivery.costMinor,currency:offer.currency,sourceUrl:offer.sourceUrl,
  priceStatus:offer.priceStatus==='verified'?'verified':offer.priceStatus==='demo'?'demo':'estimated',
  priceOrigin:offer.priceOrigin??(offer.priceStatus==='demo'?'demo':offer.priceStatus==='verified'?'source_confirmed':offer.verificationStatus==='source_checked'?'source_reported':'ai_estimate'),
  imageUrl:offer.imageUrl,imageSource:offer.imageSource,imageType:offer.imageType,
  merchantName:offer.seller.name,condition:offer.condition,kind:offer.kind,lastCheckedAt:offer.lastCheckedAt});
}
export function rememberChoice(item:CartItem){
 const {id,quantity,status,addedAt,replacementHistory,...choice}=item;
 return [...(replacementHistory??[]),CartChoiceSchema.parse(choice)].slice(-5);
}
