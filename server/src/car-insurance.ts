import { ProtectionOptionSchema, type CarInsuranceDraft, type ProtectionCapabilities } from '../../shared/contracts/index.js';
import type { z } from 'zod';
import { AppError } from './errors.js';
import type { IfInsuranceConfig } from './if-insurance.js';
import { createIfCarProvider } from './if-car-insurance.js';
export const CAR_DOCUMENTATION='https://developer.if-insurance.com/apis/mobility/car-insurance-apis-finland/documentation';
type Option=z.infer<typeof ProtectionOptionSchema>;
export interface CarPriceResult {sourceMode:'live'|'sandbox'|'demo';options:Option[];terms?:{name:string;url:string}[];warnings:string[]}
export interface CarInsuranceProvider {capabilities():ProtectionCapabilities;prices(draft:CarInsuranceDraft,identity:string):Promise<CarPriceResult>}
/** Smart Protection adapter around the existing Finnish If price provider. */
export function createCarInsuranceProvider(config:IfInsuranceConfig,fetcher:typeof fetch=fetch):CarInsuranceProvider {
 const provider=createIfCarProvider(config,fetcher);
 const normalize=(p:{amountMinor:number;period:string})=>({amountMinor:p.amountMinor,currency:'EUR' as const,billingPeriod:p.period,periodMonths:p.period==='Monthly'?1 as const:p.period==='Yearly'?12 as const:null});
 return {
  capabilities:()=>({carLiveAvailable:provider.status().available,carSourceMode:provider.status().environment,demoAvailable:true,carDocumentation:CAR_DOCUMENTATION,travelQuotingAvailable:false}),
  async prices(draft,identity){
   if(!provider.status().available)throw new AppError('IF_ACCESS_UNAVAILABLE','Live car prices require approved If credentials with car.price access. Choose the explicitly fictional demo to explore.',503);
   const result=await provider.price({registrationNumberFI:draft.registrationNumber,socialSecurityNumberFI:identity,driverBelow24YearsOfAge:draft.driverBelow24,maximumMileagePerYearInKilometers:draft.annualMileage,postCode:draft.postalCode,streetAddress:draft.streetAddress,carPrice:draft.carPriceMinor===undefined?undefined:draft.carPriceMinor/100,consent:true});
   const options:Option[]=[];
   if(result.mtplWithoutCasco.length)options.push({id:'mtpl',title:result.mtplName,prices:result.mtplWithoutCasco.map(normalize),coverageDetails:['MTPL option returned by If. Review the applicable terms with If.'],deductibleMinor:null});
   result.cascoCoverages.forEach((c,index)=>{const prices=c.prices.flatMap(p=>{const mtpl=result.mtplWithCasco.find(v=>v.period===p.period);return mtpl?[{...normalize(p),amountMinor:p.amountMinor+mtpl.amountMinor}]:[];});if(prices.length)options.push({id:`casco-${index}`,title:`${result.mtplName} + ${c.name}`,prices,coverageDetails:['Combined returned MTPL-with-casco and casco prices for the same period.','Deductible is the value used in this calculation; this API has no request field for changing it. Optional add-ons are not added to these totals. Confirm all inclusions and terms with If.'],deductibleMinor:c.deductible===null?null:c.deductible*100});});
   const parsed=ProtectionOptionSchema.array().safeParse(options);if(!parsed.success||!parsed.data.length)throw new AppError('IF_RESPONSE_INVALID','If did not return safely displayable price options',502);
   return {sourceMode:result.environment,options:parsed.data,terms:result.terms,warnings:[result.warning,'If’s Car Price API does not return a quote expiry or policy reference. Recheck before relying on a price.']};
  },
 };
}

/** Deliberately fictional, fixed sample options. No customer identity or insurer model involved. */
export function demoCarPrices(outcome:'success'|'error'='success'):CarPriceResult {
 if(outcome==='error')throw new AppError('DEMO_PROVIDER_ERROR','Simulated demo provider error. Choose “Successful example” and retry; your saved plan is unchanged.',503);
 return {sourceMode:'demo',warnings:['Demo quote — not an official If insurance price. Fixed fictional examples, not If underwriting or pricing.'],options:[
  {id:'demo-basic',title:'Demo Basic protection',prices:[{amountMinor:4500,currency:'EUR',billingPeriod:'Monthly',periodMonths:1},{amountMinor:54000,currency:'EUR',billingPeriod:'Yearly',periodMonths:12}],coverageDetails:['Fictional basic cover for demonstrating the planning workflow. No real cover is provided.'],deductibleMinor:null},
  {id:'demo-plus',title:'Demo Extended protection',prices:[{amountMinor:7500,currency:'EUR',billingPeriod:'Monthly',periodMonths:1},{amountMinor:90000,currency:'EUR',billingPeriod:'Yearly',periodMonths:12}],coverageDetails:['Fictional extended cover. These descriptions are not If policy terms.'],deductibleMinor:30000},
 ]};
}
