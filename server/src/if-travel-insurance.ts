import { z } from 'zod';
import { TravelPriceResponseSchema, type TravelPriceRequest, type TravelPriceResponse } from '../../shared/contracts/index.js';
import type { IfInsuranceConfig } from './if-insurance.js';
import { AppError } from './errors.js';

const rawPrice=z.object({amountNet:z.number().finite().nonnegative(),amountGross:z.number().finite().nonnegative(),amountDiscount:z.number().finite().nonnegative(),currency:z.literal('EUR'),type:z.string().min(1).max(80)});
const rawQuote=z.object({quoteValidTo:z.string().date(),activationDateFrom:z.string().date(),price:z.array(rawPrice).max(20),priceCalculationParameters:z.object({maximumTravelLength:z.object({numberOfDays:z.number().int().positive()})}),insuranceCoverages:z.array(z.object({insuranceBrand:z.string(),coverageName:z.string().min(1),isSelected:z.boolean(),price:z.array(rawPrice).max(20)})).max(20),termsAndDetailedInformations:z.array(z.object({name:z.string().nullable().optional(),link:z.string().nullable().optional()})).nullable().optional()});

export interface IfTravelProvider {
  status():{available:boolean;environment:'sandbox'|'live'|'unavailable';message:string};
  quote(input:TravelPriceRequest):Promise<TravelPriceResponse>;
}

export function createIfTravelProvider(config:IfInsuranceConfig,fetcher:typeof fetch=fetch):IfTravelProvider {
  const enabled=Boolean(config.clientId&&config.clientSecret);
  const sandbox=config.environment==='sandbox';
  async function json(url:string,init:RequestInit):Promise<unknown>{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),config.timeoutMs);
    try{
      const response=await fetcher(url,{...init,redirect:'error',signal:controller.signal});
      if(!response.ok){await response.body?.cancel();throw new AppError('IF_TRAVEL_UNAVAILABLE',response.status===401||response.status===403?'If has not granted access to the Finnish travel quote API.':'If could not calculate a travel quote. Check the inputs or try again later.',response.status===400||response.status===422?422:503);}
      const reader=response.body?.getReader();if(!reader)throw Error('Empty response');
      const chunks:Uint8Array[]=[];let size=0;
      while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1_048_576){await reader.cancel();throw Error('Oversized response');}chunks.push(part.value);}
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    }catch(error){if(error instanceof AppError)throw error;throw new AppError('IF_TRAVEL_UNAVAILABLE',controller.signal.aborted?'If did not respond in time.':'If is unavailable. No travel quote was returned.',503);}
    finally{clearTimeout(timer);}
  }
  let token:{value:string;expires:number}|null=null;
  async function accessToken(){
    if(token&&token.expires>Date.now()+30000)return token.value;
    const body=new URLSearchParams({grant_type:'client_credentials',scope:'travel.quote.fi',client_id:config.clientId!,client_secret:config.clientSecret!});
    const parsed=z.object({access_token:z.string().min(1),expires_in:z.number().positive().optional()}).safeParse(await json(`https://${sandbox?'authtest':'auth'}.if.eu/oauth/v2/oauth-token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}));
    if(!parsed.success)throw new AppError('IF_TRAVEL_UNAVAILABLE','If authentication did not return an access token.',503);
    token={value:parsed.data.access_token,expires:Date.now()+(parsed.data.expires_in??60)*1000};return token.value;
  }
  const cents=(value:number)=>{const n=Math.round(value*100);if(!Number.isSafeInteger(n)||n>1_000_000_000||Math.abs(n-value*100)>0.00001)throw new AppError('IF_TRAVEL_RESPONSE_INVALID','If returned an unsupported amount.',502);return n;};
  const prices=(items:z.infer<typeof rawPrice>[])=>items.map(p=>({amountMinor:cents(p.amountNet),grossMinor:cents(p.amountGross),discountMinor:cents(p.amountDiscount),billingPeriod:p.type}));
  return {
    status:()=>({available:enabled,environment:enabled?config.environment:'unavailable',message:enabled?(sandbox?'If test environment connected. Quotes are test data.':'Ready to request a personal If travel insurance quote.'):'If partner credentials are not configured. A live travel quote is unavailable.'}),
    async quote(input){
      if(!enabled)throw new AppError('IF_TRAVEL_UNAVAILABLE','If partner credentials are required for a travel quote.',503);
      const response=rawQuote.safeParse(await json(`https://api.if-insurance.com/${sandbox?'test/':''}request-quote-travel-insurance-fi/v1/quotes`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await accessToken()}`,...(config.subscriptionKey?{'Ocp-Apim-Subscription-Key':config.subscriptionKey}:{})},body:JSON.stringify({policyHolder:{socialSecurityNumber:input.personalIdentityNumber,postalCode:input.postalCode}})}));
      if(!response.success)throw new AppError('IF_TRAVEL_RESPONSE_INVALID','If returned a quote format this app cannot safely display.',502);
      const data=response.data;
      const terms=(data.termsAndDetailedInformations??[]).flatMap(t=>{try{const url=new URL(t.link??'');return url.protocol==='https:'&&!url.username&&!url.password?[{name:t.name||'If terms',url:url.toString()}]:[];}catch{return [];}});
      const quote=TravelPriceResponseSchema.parse({provider:'If',environment:config.environment,receivedAt:new Date().toISOString(),validTo:data.quoteValidTo,activationDateFrom:data.activationDateFrom,maximumTripDays:data.priceCalculationParameters.maximumTravelLength.numberOfDays,prices:prices(data.price),coverages:data.insuranceCoverages.filter(c=>c.insuranceBrand.toLowerCase()==='if').map(c=>({name:c.coverageName,selected:c.isSelected,prices:prices(c.price)})),terms,warning:sandbox?'If sandbox result: test prices, not a live offer.':'Travel insurance quote only. No policy has been purchased.'});
      if(JSON.stringify(quote).includes(input.personalIdentityNumber))throw new AppError('IF_TRAVEL_RESPONSE_INVALID','If returned unexpected personal information.',502);
      return quote;
    },
  };
}
