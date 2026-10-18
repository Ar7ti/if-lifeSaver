import {z} from 'zod';
import {ProductCurrencySchema,ProductImageUrlSchema,PublicUrlSchema,ProductMetadataSchema,productExponent,type ProductCurrency} from '../../../shared/contracts/index.js';
import type {ProductRecord} from './types.js';
// All extraction is pure: accepts already-authorized bytes/JSON, never fetches a URL or executes scripts.
const money=z.object({value:z.string().max(40),currency:z.string().max(3),convertedFromCurrency:z.string().max(3).optional(),convertedFromValue:z.string().max(40).optional()}).passthrough();
const image=z.object({imageUrl:z.string().max(2048)}).passthrough();
export const EbayItemSchema=z.object({itemId:z.string().min(1).max(200),title:z.string().min(1).max(2000),itemWebUrl:z.string().max(2048),price:money.optional(),image:image.optional(),additionalImages:z.array(image).max(50).optional(),condition:z.string().max(200).optional(),conditionId:z.string().max(20).optional(),buyingOptions:z.array(z.string().max(50)).max(10).optional(),shortDescription:z.string().max(10000).optional(),seller:z.object({username:z.string().max(200).optional()}).passthrough().optional(),itemLocation:z.object({city:z.string().max(200).optional(),country:z.string().max(2).optional()}).passthrough().optional(),shippingOptions:z.array(z.object({shippingCost:money.optional(),shippingCostType:z.string().optional(),shipToLocationUsedForEstimate:z.object({country:z.string().optional(),postalCode:z.string().optional()}).passthrough().optional()}).passthrough()).max(50).optional(),estimatedAvailabilities:z.array(z.object({estimatedAvailabilityStatus:z.string().optional(),estimatedAvailableQuantity:z.number().optional()}).passthrough()).max(30).optional(),itemEndDate:z.string().optional(),localizedAspects:z.array(z.object({name:z.string(),value:z.string()}).passthrough()).max(200).optional(),marketingPrice:z.object({originalPrice:money.optional()}).passthrough().optional()}).passthrough();
export function decimalMinor(value:unknown,currency:unknown):number|null{
 if(typeof value!=='string'&&typeof value!=='number'||!ProductCurrencySchema.safeParse(currency).success)return null;
 const text=String(value),exponent=productExponent(String(currency));if(!new RegExp(`^\\d{1,10}(?:\\.\\d{1,${Math.max(1,exponent)}})?$`).test(text))return null;
 const [whole,fraction='']=text.split('.');if(exponent===0&&fraction&&Number(fraction)!==0)return null;
 const n=BigInt(whole!)*10n**BigInt(exponent)+BigInt((fraction+'0'.repeat(exponent)).slice(0,exponent)||'0');return n<=1000000000n?Number(n):null;
}
const safeImage=(value:unknown)=>ProductImageUrlSchema.safeParse(value).success?value as string:null;
const text=(value:unknown,max=4000)=>typeof value==='string'?value.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
function ebayCondition(id:string|undefined):ProductRecord['condition']{
 // Numeric condition IDs from official eBay condition documentation; unknown future IDs stay unknown.
 if(id==='1000')return 'new';if(['2000','2010','2020','2030','2500'].includes(id??''))return 'refurbished';if(['3000','4000','5000','6000','2990','3010'].includes(id??''))return 'used';return 'unknown';
}
export function extractEbayItem(raw:unknown,context:{marketplaceId:string;country:string;mode:'production'|'sandbox';deliveryFiltered:boolean;postalCode?:string;now?:string}):ProductRecord{
 const item=EbayItemSchema.parse(raw),now=context.now??new Date().toISOString();const url=PublicUrlSchema.parse(item.itemWebUrl);
 if(!/(^|\.)ebay\.(?:com|de|co\.uk|fr|it|es|ca|com\.au|at|ch|ie|nl|pl|com\.sg|com\.hk|com\.be)$/.test(new URL(url).hostname))throw Error('INVALID_LISTING_HOST');
 const originalAmount=(amount:z.infer<typeof money>|undefined)=>amount?.convertedFromCurrency||amount?.convertedFromValue?{value:amount.convertedFromValue,currency:amount.convertedFromCurrency}:amount;
 const originalItem=originalAmount(item.price);const currency=ProductCurrencySchema.safeParse(originalItem?.currency);const code=currency.success?currency.data:null;
 const fixed=item.buyingOptions?.includes('FIXED_PRICE')===true;
 const priceMinor=fixed?decimalMinor(originalItem?.value,code):null;
 const provenance:ProductRecord['metadata']['fieldProvenance']={};const field=(name:string,path:string)=>{provenance[name]={path,method:'provider_api',retrievedAt:now};};
 field('title','title');field('source','itemWebUrl');field('sourceType','itemId / buyingOptions');if(item.seller?.username)field('seller','seller.username');if(item.localizedAspects?.length)field('attributes','localizedAspects');if(priceMinor!==null)field('price',item.price?.convertedFromCurrency?'price.convertedFromValue':'price');if(code)field('currency',item.price?.convertedFromCurrency?'price.convertedFromCurrency':'price.currency');
 const condition=ebayCondition(item.conditionId);if(condition!=='unknown')field('condition','conditionId');
 const country=item.itemLocation?.country&&/^[A-Z]{2}$/.test(item.itemLocation.country)?item.itemLocation.country:null;
 const location=[item.itemLocation?.city,country].filter(Boolean).join(', ')||null;if(location)field('location','itemLocation');
 const photos=[item.image?.imageUrl,...(item.additionalImages??[]).map(x=>x.imageUrl)].flatMap(value=>{const v=safeImage(value);return v?[v]:[];});if(photos.length)field('image','image.imageUrl / additionalImages');
 // A calculated fee needs the same destination/postal context, never a guessed zero.
 const validShipping=(item.shippingOptions??[]).filter(x=>originalAmount(x.shippingCost)?.currency===code&&(x.shippingCostType==='FIXED'||x.shippingCostType==='CALCULATED'&&x.shipToLocationUsedForEstimate?.country===context.country&&!!context.postalCode&&x.shipToLocationUsedForEstimate?.postalCode===context.postalCode));
 const costs=validShipping.map(x=>decimalMinor(originalAmount(x.shippingCost)?.value,code)).filter((n):n is number=>n!==null);const shipping=costs.length?Math.min(...costs):null;
 if(shipping!==null)field('delivery','shippingOptions.shippingCost');
 if(context.deliveryFiltered)field('deliveryCountry','request.filter.deliveryCountry');
 const unavailable=item.itemEndDate&&Date.parse(item.itemEndDate)<=Date.parse(now)||item.estimatedAvailabilities?.some(x=>x.estimatedAvailabilityStatus==='OUT_OF_STOCK'||x.estimatedAvailableQuantity===0);
 const stocked=item.estimatedAvailabilities?.some(x=>['IN_STOCK','LIMITED_STOCK'].includes(x.estimatedAvailabilityStatus??''));
 const availability=unavailable?'out_of_stock':stocked?'in_stock':'unknown';if(availability!=='unknown')field('availability','estimatedAvailabilities / itemEndDate');
 const attributes=Object.fromEntries((item.localizedAspects??[]).slice(0,19).map(x=>[text(x.name,80),text(x.value,300)]));
 if(item.conditionId)attributes.conditionId=item.conditionId;
 const original=originalAmount(item.marketingPrice?.originalPrice);const originalCurrency=ProductCurrencySchema.safeParse(original?.currency);const originalMinor=decimalMinor(original?.value,original?.currency);
 if(priceMinor!==null&&shipping!==null)provenance.knownTotalMinor={path:'price + selected shippingOptions.shippingCost',method:'calculation',retrievedAt:now};
 const displayedMinor=decimalMinor(item.price?.value,item.price?.currency),displayedCurrency=ProductCurrencySchema.safeParse(item.price?.currency);
 const metadata=ProductMetadataSchema.parse({...((item.price?.convertedFromCurrency||item.price?.convertedFromValue)&&displayedMinor!==null&&displayedCurrency.success?{providerConvertedPrice:{amountMinor:displayedMinor,currency:displayedCurrency.data}}:{}),provider:'ebay',sourceProductId:item.itemId,marketplaceId:context.marketplaceId,marketplaceCountry:context.country,sourceMode:context.mode,retrievalMethod:'provider_api',priceType:fixed?'fixed':item.buyingOptions?.includes('AUCTION')?'auction':'unknown',shippingCostType:shipping===null?'unknown':validShipping.find(x=>decimalMinor(originalAmount(x.shippingCost)?.value,code)===shipping)?.shippingCostType==='FIXED'?'fixed':'calculated',deliveryCountry:context.country,deliverySupported:context.deliveryFiltered?true:null,sellerCountry:country,additionalImages:[...new Set(photos)].slice(1,9),attributes,...(originalMinor!==null&&originalCurrency.success?{originalPrice:{amountMinor:originalMinor,currency:originalCurrency.data}}:{}),taxInformation:['DE','GB','FR','IT','ES'].includes(context.country)?'eBay reports VAT-inclusive price where applicable for this marketplace. Extra charges, import fees and tax applicability still require checking.':'Tax inclusion and additional charges are not established by this response.',knownTotalMinor:priceMinor!==null&&shipping!==null&&priceMinor+shipping<=1e9?priceMinor+shipping:null,fieldProvenance:provenance});
 return {title:item.title,description:text(item.shortDescription),url,imageUrl:photos[0]??null,priceMinor,currency:code,condition,availability,seller:item.seller?.username??null,location,shippingCostMinor:shipping,fetchedAt:now,metadata};
}

/** Parses supplied, permitted JSON-LD/metadata only. It is not a public URL scraper. */
export function extractStructuredProducts(input:unknown,context:{url:string;permitted:boolean;now?:string}):ProductRecord[]{
 if(!context.permitted)throw Error('SOURCE_PERMISSION_REQUIRED');const canonical=PublicUrlSchema.parse(context.url),now=context.now??new Date().toISOString();
 const serialized=typeof input==='string'?input:JSON.stringify(input);if(serialized.length>262144)throw Error('CONTENT_TOO_LARGE');
 let data:unknown=input;if(typeof input==='string'){
  const scripts=[...input.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)];
  data=scripts.length?scripts.slice(0,20).flatMap(m=>{try{return [JSON.parse(m[1]!)];}catch{return [];}}):JSON.parse(input);
 }
 const nodes:Record<string,unknown>[]=[];const walk=(v:unknown,depth=0)=>{if(depth>8||nodes.length>=50)return;if(Array.isArray(v)){v.slice(0,50).forEach(x=>walk(x,depth+1));return;}if(v&&typeof v==='object'){const n=v as Record<string,unknown>;nodes.push(n);if(n['@graph'])walk(n['@graph'],depth+1);}};walk(data);
 const records:ProductRecord[]=[];
 for(const n of nodes){if(!(Array.isArray(n['@type'])?n['@type']:[n['@type']]).some(t=>t==='Product'||t==='https://schema.org/Product')||typeof n.name!=='string')continue;
  const offers=Array.isArray(n.offers)?n.offers:[n.offers];const o=offers.length===1&&offers[0]&&typeof offers[0]==='object'?offers[0] as Record<string,unknown>:{};
  const currency=ProductCurrencySchema.safeParse(o.priceCurrency),code=currency.success?currency.data:null;
  // AggregateOffer lowPrice and subscription/unit pricing are not a purchasable exact price.
  const priceType=o['@type']==='Offer'&&!o.priceSpecification?'fixed':'unknown',price=priceType==='fixed'?decimalMinor(o.price,code):null;
  const imgs=Array.isArray(n.image)?n.image:[n.image];const photos=imgs.flatMap(v=>{const u=safeImage(typeof v==='object'&&v?v.url:v);return u?[u]:[];});
  const condition=String(o.itemCondition??n.itemCondition??'').split('/').at(-1),mapped=condition==='NewCondition'?'new':condition==='UsedCondition'?'used':condition==='RefurbishedCondition'?'refurbished':'unknown';
  const url=typeof o.url==='string'&&PublicUrlSchema.safeParse(o.url).success&&new URL(o.url).origin===new URL(canonical).origin?o.url:canonical;
  const fieldProvenance:ProductRecord['metadata']['fieldProvenance']={title:{path:'Product.name',method:'json_ld',retrievedAt:now}};
  for(const [field,known,path] of [['price',price!==null,'Product.offers.price'],['currency',code!==null,'Product.offers.priceCurrency'],['condition',mapped!=='unknown','Product.offers.itemCondition'],['image',photos.length>0,'Product.image']] as const)if(known)fieldProvenance[field]={path,method:'json_ld',retrievedAt:now};
  records.push({title:text(n.name,2000),description:text(n.description),url,imageUrl:photos[0]??null,priceMinor:price,currency:code,condition:mapped,availability:String(o.availability).endsWith('/OutOfStock')?'out_of_stock':String(o.availability).endsWith('/InStock')?'in_stock':'unknown',seller:typeof o.seller==='object'&&o.seller?text((o.seller as Record<string,unknown>).name,200)||null:null,location:null,shippingCostMinor:null,fetchedAt:now,metadata:{provider:'structured_metadata',sourceProductId:text(n.sku??n.productID??url,200),marketplaceId:null,marketplaceCountry:null,sourceMode:'supplied_fixture',retrievalMethod:'json_ld',priceType,shippingCostType:'unknown',deliveryCountry:null,deliverySupported:null,sellerCountry:null,additionalImages:photos.slice(1,9),attributes:{},taxInformation:'Unknown; supplied structured data is not independent verification.',knownTotalMinor:null,fieldProvenance}});
 }
 return records;
}

/** Product-specific Open Graph is a fallback for supplied, authorized HTML, never generic social cards. */
export function extractProductMetadata(html:string,context:{url:string;permitted:boolean;now?:string}):ProductRecord[]{
 if(!context.permitted)throw Error('SOURCE_PERMISSION_REQUIRED');if(html.length>262144)throw Error('CONTENT_TOO_LARGE');PublicUrlSchema.parse(context.url);
 const fields:Record<string,string>={};for(const tag of html.matchAll(/<meta\b[^>]{0,4096}>/gi)){
  const attributes:Record<string,string>={};for(const m of tag[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g))attributes[m[1]!.toLowerCase()]=m[3]!.replaceAll('&amp;','&').replaceAll('&quot;','"');
  const key=attributes.property??attributes.name;if(key&&attributes.content!==undefined)fields[key]=attributes.content;
 }
 if(fields['og:type']!=='product'||!fields['product:retailer_item_id']||!fields['og:title'])return [];
 if(fields['og:url']&&new URL(fields['og:url'],context.url).href!==new URL(context.url).href)return [];
 const records=extractStructuredProducts({'@type':'Product',name:fields['og:title'],productID:fields['product:retailer_item_id'],image:fields['og:image'],description:fields['og:description'],offers:{'@type':'Offer',url:context.url,price:fields['product:price:amount'],priceCurrency:fields['product:price:currency']}},context);
 for(const record of records){record.metadata.retrievalMethod='product_metadata';for(const provenance of Object.values(record.metadata.fieldProvenance))provenance.method='product_metadata';}
 return records;
}
