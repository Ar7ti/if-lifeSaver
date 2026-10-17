import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { IfQuoteSchema, type HomeInsuranceDetails, type IfQuote, type HomeInsuranceStatus, type IfPremium, type HomeInsuranceExpense } from '../../shared/contracts/index.js';
import { AppError } from './errors.js';

export const IF_DOCUMENTATION = 'https://developer.if-insurance.com/apis/property/householder-insurance-apis-finland/documentation' as const;
export interface IfInsuranceProvider {
  status():HomeInsuranceStatus;
  quote(details:HomeInsuranceDetails, personalIdentityNumber:string):Promise<IfQuote>;
}
export interface IfInsuranceConfig {clientId?:string;clientSecret?:string;subscriptionKey?:string;environment:'sandbox'|'live';timeoutMs:number}
const price = z.object({amountNet:z.number().finite().nonnegative(),amountGross:z.number().finite().nonnegative(),amountDiscount:z.number().finite().nonnegative(),currency:z.literal('EUR'),type:z.string().min(1).max(80)});
const quoteResponse = z.object({
  id:z.string().min(1),quoteValidTo:z.string().date(),activationDateFrom:z.string().date(),price:z.array(price).max(20),
  insuranceCoverages:z.array(z.object({insuranceBrand:z.string(),coverageName:z.string().min(1).max(200),isSelected:z.boolean(),isDefaultSuggestion:z.boolean(),coverageItemsIncluded:z.array(z.string().min(1).max(200)).max(100),price:z.array(price).max(20)})).max(20),
  termsAndDetailedInformations:z.array(z.object({name:z.string().nullable().optional(),link:z.string().nullable().optional()})).max(20).nullable().optional(),
});
const coverageResponse = z.array(z.object({coverageItemId:z.string(),coverageItemName:z.string().min(1).max(200),coverageItemDescription:z.string().min(1).max(10000)})).max(300);
function premium(value:z.infer<typeof price>):IfPremium {
  const cents=(n:number)=>{const v=Math.round(n*100);if(!Number.isSafeInteger(v)||v>1_000_000_000||Math.abs(n*100-v)>0.00001)throw new AppError('IF_RESPONSE_INVALID','If returned an unsupported premium amount',502);return v;};
  const period=value.type.toLowerCase();
  return {amountMinor:cents(value.amountNet),grossMinor:cents(value.amountGross),discountMinor:cents(value.amountDiscount),currency:'EUR',billingPeriod:value.type,periodMonths:period==='monthly'?1:['yearly','annual','annually'].includes(period)?12:null};
}
/** Fixed, verified If endpoints only. Never follows API-provided links or redirects. */
export function createIfInsuranceProvider(config:IfInsuranceConfig, fetcher:typeof fetch=fetch):IfInsuranceProvider {
  const enabled=Boolean(config.clientId&&config.clientSecret);
  const sandbox=config.environment==='sandbox';
  const root=`https://api.if-insurance.com/${sandbox?'test/':''}`;
  const tokens=new Map<string,{value:string;expires:number}>();
  async function json(url:string,init:RequestInit) {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),config.timeoutMs);
    try {
      const response=await fetcher(url,{...init,redirect:'error',signal:controller.signal});
      if(!response.ok){
        // Provider errors may echo the identity number. Do not consume, log or relay them.
        await response.body?.cancel();
        if(response.status===401||response.status===403)throw new AppError('IF_ACCESS_UNAVAILABLE','If partner access is unavailable or the required scope is not approved. No quote was returned.',503);
        if(response.status===400||response.status===422)throw new AppError('IF_INPUT_REJECTED','If could not quote these details. Check the address, identity number and start date.',422);
        throw new AppError('IF_UNAVAILABLE','If could not return a quote. Please try again later.',503);
      }
      const reader=response.body?.getReader();if(!reader)throw Error('Empty response');
      let size=0;const chunks:Uint8Array[]=[];
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1_048_576){await reader.cancel();throw Error('Oversized response');}chunks.push(value);}
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    }catch(error){if(error instanceof AppError)throw error;throw new AppError(controller.signal.aborted?'IF_TIMEOUT':'IF_UNAVAILABLE',controller.signal.aborted?'If did not respond in time. Please retry.':'The If service is unavailable. No quote was returned.',503);}
    finally{clearTimeout(timer);}
  }
  async function token(scope:string) {
    const cached=tokens.get(scope);if(cached&&cached.expires>Date.now()+30000)return cached.value;
    const body=new URLSearchParams({grant_type:'client_credentials',scope,client_id:config.clientId!,client_secret:config.clientSecret!});
    const response=z.object({access_token:z.string().min(1),expires_in:z.number().positive().max(86400).optional()}).safeParse(await json(`https://${sandbox?'authtest':'auth'}.if.eu/oauth/v2/oauth-token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}));
    if(!response.success)throw new AppError('IF_RESPONSE_INVALID','If authentication returned an unsupported response',502);
    tokens.set(scope,{value:response.data.access_token,expires:Date.now()+(response.data.expires_in??60)*1000});return response.data.access_token;
  }
  async function headers(scope:string) {return {'Content-Type':'application/json',Authorization:`Bearer ${await token(scope)}`,...(config.subscriptionKey?{'Ocp-Apim-Subscription-Key':config.subscriptionKey}:{})};}
  return {
    status:()=>({available:enabled,environment:enabled?config.environment:'unavailable',documentationUrl:IF_DOCUMENTATION,message:enabled?(sandbox?'If sandbox connected. Quotes use test data and are not live prices.':'Request a personal home insurance quote from If.'): 'Live If quotes are unavailable. Approved If partner credentials are required. You can prepare your home details below.'}),
    async quote(details,personalIdentityNumber){
      if(!enabled)throw new AppError('IF_ACCESS_UNAVAILABLE','Live If quotes are unavailable. Approved If partner credentials are required.',503);
      const raw=quoteResponse.safeParse(await json(`${root}request-quote-householder-insurance-fi/v1/quotes`,{method:'POST',headers:await headers('householder.quote.fi'),body:JSON.stringify({policyHolder:{socialSecurityNumber:personalIdentityNumber,postalCode:details.policyHolderPostalCode},address:{streetAddress:details.streetAddress,city:details.city,postalCode:details.postalCode},livingSpace:details.livingSpace,householderType:details.householderType,startDate:details.startDate})}));
      if(!raw.success)throw new AppError('IF_RESPONSE_INVALID','If returned a quote format this app cannot safely display',502);
      const warnings:string[]=[];
      let items:z.infer<typeof coverageResponse>=[];
      try{items=coverageResponse.parse(await json(`${root}list-coverage-items-householder-insurance-fi/v1/coverage-items`,{method:'GET',headers:await headers('householder.listcoverage.fi')}));}
      catch{warnings.push('Coverage descriptions are unavailable. Included identifiers below come from the quote; check the terms with If.');}
      const response=raw.data;
      const premiums=response.price.map(premium);
      if(premiums.some(p=>p.periodMonths===null))warnings.push('If returned an unfamiliar billing period. It cannot be added to the budget until its period is confirmed.');
      if(sandbox)warnings.push('If sandbox test data — not a live insurance offer. It cannot be added as a real expense.');
      // Keep only normalized quote data. Never persist the raw response or the upstream quote ID.
      return IfQuoteSchema.parse({id:randomUUID(),provider:'If',environment:config.environment,receivedAt:new Date().toISOString(),validTo:response.quoteValidTo,activationDateFrom:response.activationDateFrom,details,premiums,
        coverages:response.insuranceCoverages.filter(c=>c.insuranceBrand.toLowerCase()==='if').map(c=>({name:c.coverageName,selected:c.isSelected,suggested:c.isDefaultSuggestion,premiums:c.price.map(premium),items:c.coverageItemsIncluded.map(id=>{const item=items.find(i=>i.coverageItemId===id);return {id,name:item?.coverageItemName??id,description:item?.coverageItemDescription??null};})})),warnings,
        terms:(response.termsAndDetailedInformations??[]).flatMap(t=>{try{const u=new URL(t.link??'');return u.protocol==='https:'&&!u.username&&!u.password?[{name:t.name||'If terms',url:u.toString()}]:[];}catch{return [];}}),
      });
    },
  };
}

/** Full billing installments due over a user-selected horizon, never a one-off premium. */
export function insuranceExpense(quote:IfQuote,premiumIndex:number,planningMonths:number):HomeInsuranceExpense {
  if(quote.environment!=='live')throw new AppError('IF_TEST_QUOTE','Sandbox quotes cannot be added as real expenses',409);
  if(quote.validTo<new Date().toISOString().slice(0,10))throw new AppError('IF_QUOTE_EXPIRED','This quote expired. Request a new quote.',409);
  const chosen=quote.premiums[premiumIndex];
  if(!chosen||chosen.periodMonths===null)throw new AppError('IF_PERIOD_UNKNOWN','Choose a quote price with a confirmed monthly or annual billing period');
  if(!Number.isInteger(planningMonths)||planningMonths<1||planningMonths>36)throw new AppError('VALIDATION_ERROR','Choose a planning horizon from 1 to 36 months');
  const installments=Math.ceil(planningMonths/chosen.periodMonths);
  const plannedMinor=chosen.amountMinor*installments;
  const annualEquivalentMinor=chosen.amountMinor*(12/chosen.periodMonths);
  if(Math.max(plannedMinor,annualEquivalentMinor)>1_000_000_000)throw new AppError('INVALID_MONEY','Insurance plan exceeds the supported budget range');
  return {quoteId:quote.id,status:'proposed',premiumMinor:chosen.amountMinor,billingPeriod:chosen.billingPeriod,periodMonths:chosen.periodMonths,planningMonths,installments,plannedMinor,annualEquivalentMinor,createdAt:new Date().toISOString()};
}

export const containsFinnishIdentityNumber=(value:unknown):boolean=>typeof value==='string'?/(?<![a-z0-9])\d{6}[+\-ABCDEFUVWXY]\d{3}[0-9A-Y](?![a-z0-9])/i.test(value):Array.isArray(value)?value.some(containsFinnishIdentityNumber):Boolean(value&&typeof value==='object'&&Object.values(value).some(containsFinnishIdentityNumber));
