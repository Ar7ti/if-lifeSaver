import { z } from 'zod';
import { CarPriceResponseSchema, type CarPriceRequest, type CarPriceResponse } from '../../shared/contracts/index.js';
import type { IfInsuranceConfig } from './if-insurance.js';
import { AppError } from './errors.js';

const rawPrice = z.object({amountNet:z.number().finite().nonnegative(),period:z.string().min(1).max(20),currency:z.literal('EUR')});
const raw = z.object({priceCarInsuranceFI:z.object({response:z.object({
  returnCode:z.string(),insuranceBrand:z.string().default('If'),mtplNameFi:z.string().default('Liikennevakuutus'),
  mtplPrice:z.object({priceWithCasco:z.array(rawPrice).default([]),priceWithoutCasco:z.array(rawPrice).default([])}),
  cascoCoverages:z.array(z.object({name:z.string().min(1),coverageRecommended:z.boolean().default(false),deductibleUsedInCalculation:z.number().int().nonnegative().optional(),prices:z.array(rawPrice).default([])})).default([]),
  termsAndDetailedInformation:z.array(z.object({name:z.string(),link:z.string()})).default([]),
})})});

export interface IfCarProvider {
  status():{available:boolean;environment:'sandbox'|'live'|'unavailable';message:string};
  price(request:CarPriceRequest):Promise<CarPriceResponse>;
}

export function createIfCarProvider(config:IfInsuranceConfig & {partnerId?:string}, fetcher:typeof fetch=fetch):IfCarProvider {
  const enabled=Boolean(config.clientId&&config.clientSecret);
  const sandbox=config.environment==='sandbox';
  async function json(url:string,init:RequestInit):Promise<unknown> {
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),config.timeoutMs);
    try {
      const response=await fetcher(url,{...init,redirect:'error',signal:controller.signal});
      if(!response.ok){await response.body?.cancel();throw new AppError('IF_CAR_UNAVAILABLE',response.status===401||response.status===403?'If has not granted access to the Finnish car price API.':'If could not calculate the car price. Check the inputs or try again later.',response.status===400||response.status===422?422:503);}
      const reader=response.body?.getReader();if(!reader)throw Error('Empty response');
      const chunks:Uint8Array[]=[];let size=0;
      while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1_048_576){await reader.cancel();throw Error('Oversized response');}chunks.push(part.value);}
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    }catch(error){if(error instanceof AppError)throw error;throw new AppError('IF_CAR_UNAVAILABLE',controller.signal.aborted?'If did not respond in time.':'If is unavailable. No car insurance price was returned.',503);}
    finally{clearTimeout(timer);}
  }
  let token:{value:string;expires:number}|null=null;
  async function accessToken():Promise<string>{
    if(token&&token.expires>Date.now()+30000)return token.value;
    const body=new URLSearchParams({grant_type:'client_credentials',scope:'car.price',client_id:config.clientId!,client_secret:config.clientSecret!});
    const parsed=z.object({access_token:z.string().min(1),expires_in:z.number().positive().optional()}).safeParse(await json(`https://${sandbox?'authtest':'auth'}.if.eu/oauth/v2/oauth-token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}));
    if(!parsed.success)throw new AppError('IF_CAR_UNAVAILABLE','If authentication did not return an access token.',503);
    token={value:parsed.data.access_token,expires:Date.now()+(parsed.data.expires_in??60)*1000};return token.value;
  }
  const cents=(amount:number)=>{const value=Math.round(amount*100);if(!Number.isSafeInteger(value)||value>1_000_000_000||Math.abs(value-amount*100)>0.00001)throw new AppError('IF_CAR_RESPONSE_INVALID','If returned an unsupported amount.',502);return value;};
  const prices=(items:z.infer<typeof rawPrice>[])=>items.map(item=>({amountMinor:cents(item.amountNet),period:item.period}));
  return {
    status:()=>({available:enabled,environment:enabled?config.environment:'unavailable',message:enabled?(sandbox?'If test environment connected. Prices are test data.':'Ready to calculate a personal If price for a used car.'):'If partner credentials are not configured. A live price is unavailable.'}),
    async price(input){
      if(!enabled)throw new AppError('IF_CAR_UNAVAILABLE','If partner credentials are required for a car insurance price.',503);
      const body={priceCarInsuranceFI:{request:{registrationNumberFI:input.registrationNumberFI,socialSecurityNumberFI:input.socialSecurityNumberFI,driverBelow24YearsOfAge:input.driverBelow24YearsOfAge,maximumMileagePerYearInKilometers:input.maximumMileagePerYearInKilometers,postCode:input.postCode,streetAddress:input.streetAddress,carPrice:input.carPrice}}};
      const result=raw.safeParse(await json(`https://api.if-insurance.com/${sandbox?'test/':''}request-price-car-insurance-fi/v1/prices/`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await accessToken()}`,'IfInsurance-API-Client-Id':config.clientId!,...(config.partnerId?{'IfInsurance-API-Client-PartnerId':config.partnerId}:{}),...(config.subscriptionKey?{'Ocp-Apim-Subscription-Key':config.subscriptionKey}:{})},body:JSON.stringify(body)}));
      if(!result.success)throw new AppError('IF_CAR_RESPONSE_INVALID','If returned a price format this app cannot safely display.',502);
      const data=result.data.priceCarInsuranceFI.response;
      if(data.returnCode!=='000')throw new AppError('IF_CAR_NO_PRICE','If could not calculate a price for these customer and vehicle details.',422);
      const terms=data.termsAndDetailedInformation.flatMap(t=>{try{const url=new URL(t.link);return url.protocol==='https:'&&!url.username&&!url.password?[{name:t.name,url:url.toString()}]:[];}catch{return [];}});
      const normalized=CarPriceResponseSchema.parse({provider:'If',environment:config.environment,receivedAt:new Date().toISOString(),insuranceBrand:data.insuranceBrand,mtplName:data.mtplNameFi,
        mtplWithoutCasco:prices(data.mtplPrice.priceWithoutCasco),mtplWithCasco:prices(data.mtplPrice.priceWithCasco),
        cascoCoverages:data.cascoCoverages.map(c=>({name:c.name,recommended:c.coverageRecommended,deductible:c.deductibleUsedInCalculation??null,prices:prices(c.prices)})),terms,
        warning:sandbox?'If sandbox result: test prices, not a live insurance offer.':'Price calculation only. No policy has been purchased.'});
      if(JSON.stringify(normalized).includes(input.socialSecurityNumberFI))throw new AppError('IF_CAR_RESPONSE_INVALID','If returned unexpected personal information.',502);
      return normalized;
    },
  };
}
