import type { Offer } from '../../shared/contracts/index.js';

type FetchPage = (url: string, options: RequestInit) => Promise<Response>;
const MAX_HTML_BYTES = 1_000_000;
const PAGE_TIMEOUT_MS = 5_000;

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

function supportedListing(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return false;
    if (hostMatches(parsed.hostname, 'nettiauto.com')) return /\/(?:en\/)?[^/]+\/[^/]+\/\d+\/?$/.test(parsed.pathname);
    if (hostMatches(parsed.hostname, 'jysk.fi')) return parsed.pathname.split('/').filter(Boolean).length >= 4;
  } catch { /* Invalid URLs are never fetched. */ }
  return false;
}

function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#(?:\d+|x[\da-f]+));/gi, entity => {
    const simple: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (simple[entity.toLowerCase()]) return simple[entity.toLowerCase()]!;
    const number = entity[2]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(3, -1), 16) : Number.parseInt(entity.slice(2, -1), 10);
    return Number.isInteger(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
  });
}

function attrs(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    result[match[1]!.toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? '');
  }
  return result;
}

function metadata(html: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = attrs(match[0]);
    const name = (tag.property ?? tag.name ?? '').toLowerCase();
    if (name && tag.content && !result[name]) result[name] = tag.content;
  }
  return result;
}

function titleMatches(listingTitle: string, pageTitle: string): boolean {
  const words = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const listing = [...new Set(words(listingTitle).filter(w => !['jysk', 'nettiauto', 'sanky', 'sofa', 'car', 'used', 'new'].includes(w)))];
  const page = new Set(words(pageTitle));
  return listing.length > 0 && listing.filter(w => page.has(w)).length >= Math.min(2, listing.length);
}

function safeImage(raw: string, pageUrl: string): string | null {
  try {
    const page = new URL(pageUrl);
    const image = new URL(raw, page);
    if (image.protocol !== 'https:' || image.username || image.password || image.port) return null;
    const allowed = hostMatches(page.hostname, 'jysk.fi')
      ? ['jysk.fi', 'jysk.com', 'jyskcdn.com']
      : ['nettiauto.com', 'almamedia.fi'];
    if (!allowed.some(domain => hostMatches(image.hostname.toLowerCase(), domain))) return null;
    image.hash = '';
    return image.toString();
  } catch { return null; }
}

type ListingData = {imageUrl:string|null;priceMinor:number|null;availability:'in_stock'|'out_of_stock'|'unknown';condition:'new'|'used'|'refurbished'|'unknown'};
export function listingDataFromHtml(html:string,pageUrl:string,listingTitle:string):ListingData {
  const empty:ListingData={imageUrl:null,priceMinor:null,availability:'unknown',condition:'unknown'};
  if(!supportedListing(pageUrl))return empty;
  const meta=metadata(html);
  const pageTitle=meta['og:title']??meta['twitter:title']??'';
  if(!titleMatches(listingTitle,pageTitle))return empty;
  const image=meta['og:image:secure_url']??meta['og:image']??meta['twitter:image'];
  const data={...empty,imageUrl:image?safeImage(image,pageUrl):null};
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(attrs(match[1]??'').type!=='application/ld+json')continue;
    let products:unknown[];
    try{const parsed:unknown=JSON.parse(match[2]??'');products=Array.isArray(parsed)?parsed:[parsed];}catch{continue;}
    for(const product of products){
      if(!product||typeof product!=='object')continue;
      const p=product as Record<string,unknown>;
      const types=Array.isArray(p['@type'])?p['@type']:[p['@type']];
      if(!types.some(type=>type==='Product'||type==='Car')||typeof p.name!=='string'||!titleMatches(listingTitle,p.name))continue;
      const rawOffer=Array.isArray(p.offers)?p.offers[0]:p.offers;
      if(!rawOffer||typeof rawOffer!=='object')continue;
      const offer=rawOffer as Record<string,unknown>;
      if(offer.priceCurrency!=='EUR')continue;
      const price=typeof offer.price==='number'?offer.price:typeof offer.price==='string'&&/^\d+(?:\.\d{1,2})?$/.test(offer.price)?Number(offer.price):NaN;
      const minor=Math.round(price*100);
      if(Number.isFinite(price)&&price>=0&&Number.isSafeInteger(minor)&&minor<=1_000_000_000&&Math.abs(minor-price*100)<0.00001)data.priceMinor=minor;
      const availability=String(offer.availability??'');
      data.availability=availability.endsWith('/InStock')?'in_stock':availability.endsWith('/OutOfStock')?'out_of_stock':'unknown';
      const condition=String(offer.itemCondition??'');
      data.condition=condition.endsWith('/NewCondition')?'new':condition.endsWith('/UsedCondition')?'used':condition.endsWith('/RefurbishedCondition')?'refurbished':'unknown';
      const productImage=Array.isArray(p.image)?p.image[0]:p.image;
      if(!data.imageUrl&&typeof productImage==='string')data.imageUrl=safeImage(productImage,pageUrl);
      return data;
    }
  }
  return data;
}

/** Use only a listing's own metadata; never ask a model to invent an image URL. */
export function imageFromListing(html: string, pageUrl: string, listingTitle: string): string | null {
  return listingDataFromHtml(html,pageUrl,listingTitle).imageUrl;
}

async function readHtml(response: Response): Promise<string | null> {
  if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('text/html') || !response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_HTML_BYTES) return html;
      html += decoder.decode(part.value, { stream: true });
      if (/"@type"\s*:\s*(?:"Product"|\[\s*"Product"|\[\s*"Car")/.test(html) && /<\/script>/i.test(html.slice(html.lastIndexOf('"@type"')))) return html;
    }
    return html + decoder.decode();
  } finally { await reader.cancel().catch(() => undefined); }
}

/** Failures leave the offer intact. Page metadata is never used to invent missing products. */
export async function enrichListingDetails(offers: Offer[], fetchPage: FetchPage = fetch): Promise<void> {
  await Promise.all(offers.slice(0, 8).map(async offer => {
    if (!offer.sourceUrl || !supportedListing(offer.sourceUrl)) return;
    try {
      const response = await fetchPage(offer.sourceUrl, {
        method: 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        headers: { Accept: 'text/html' },
      });
      const html = await readHtml(response);
      if (html) {
        const data=listingDataFromHtml(html,offer.sourceUrl,offer.title);
        offer.imageUrl=data.imageUrl;
        if(data.priceMinor!==null){offer.priceMinor=data.priceMinor;offer.priceStatus='verified';offer.evidence=offer.evidence.filter(note=>!note.startsWith('Estimated reported EUR item price'));offer.evidence.push(`Price checked against the listing's Product structured data: EUR ${(data.priceMinor/100).toFixed(2)}.`);}
        if(data.availability!=='unknown')offer.availability=data.availability;
        if(data.condition!=='unknown')offer.condition=data.condition;
      }
    } catch { /* Some stores block automated page reads. Keep a neutral placeholder. */ }
  }));
}
