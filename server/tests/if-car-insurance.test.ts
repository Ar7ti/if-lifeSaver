import assert from 'node:assert/strict';
import test from 'node:test';
import { createIfCarProvider } from '../src/if-car-insurance.js';

const syntheticIdentity=[String(0).repeat(6),'-',String(0).repeat(4)].join('');
const input={registrationNumberFI:'ABC-123',socialSecurityNumberFI:syntheticIdentity,driverBelow24YearsOfAge:false,maximumMileagePerYearInKilometers:'15000',postCode:'20100',streetAddress:'Test street 1',carPrice:8000,consent:true} as const;
const config={clientId:'test-client',clientSecret:'test-secret',partnerId:'test-partner',environment:'sandbox' as const,timeoutMs:1000};
const body={priceCarInsuranceFI:{response:{returnCode:'000',insuranceBrand:'If Ajoneuvovakuutus',mtplNameFi:'Liikennevakuutus',mtplPrice:{priceWithoutCasco:[{amountNet:32.5,period:'Monthly',currency:'EUR'}],priceWithCasco:[{amountNet:30,period:'Monthly',currency:'EUR'}]},cascoCoverages:[{name:'Osakasko',coverageRecommended:true,deductibleUsedInCalculation:200,prices:[{amountNet:24.5,period:'Monthly',currency:'EUR'}]}],termsAndDetailedInformation:[]}}};

test('unconfigured car pricing is unavailable without making a request',async()=>{
  const provider=createIfCarProvider({environment:'sandbox',timeoutMs:1000},async()=>{throw Error('unexpected fetch');});
  assert.equal(provider.status().available,false);
  await assert.rejects(provider.price(input),/partner credentials/);
});

test('car price uses documented Finnish used-car endpoint, scope and request fields',async()=>{
  const calls:{url:string;init:RequestInit}[]=[];
  const provider=createIfCarProvider(config,async(url,init)=>{
    calls.push({url:String(url),init:init??{}});
    return Response.json(calls.length===1?{access_token:'test-token',expires_in:300}:body);
  });
  const result=await provider.price(input);
  assert.equal(calls[0]?.url,'https://authtest.if.eu/oauth/v2/oauth-token');
  assert.match(String(calls[0]?.init.body),/scope=car.price/);
  assert.equal(calls[1]?.url,'https://api.if-insurance.com/test/request-price-car-insurance-fi/v1/prices/');
  assert.equal((calls[1]?.init.headers as Record<string,string>)['IfInsurance-API-Client-PartnerId'],'test-partner');
  assert.deepEqual(JSON.parse(String(calls[1]?.init.body)),{priceCarInsuranceFI:{request:{registrationNumberFI:'ABC-123',socialSecurityNumberFI:syntheticIdentity,driverBelow24YearsOfAge:false,maximumMileagePerYearInKilometers:'15000',postCode:'20100',streetAddress:'Test street 1',carPrice:8000}}});
  assert.equal(result.environment,'sandbox');
  assert.equal(result.mtplWithoutCasco[0]?.amountMinor,3250);
  assert.equal(result.cascoCoverages[0]?.prices[0]?.amountMinor,2450);
  assert.equal(JSON.stringify(result).includes(input.socialSecurityNumberFI),false);
});

test('non-success return code is not shown as an If price',async()=>{
  let count=0;
  const provider=createIfCarProvider(config,async()=>Response.json(++count===1?{access_token:'token'}:{priceCarInsuranceFI:{response:{...body.priceCarInsuranceFI.response,returnCode:'001'}}}));
  await assert.rejects(provider.price(input),/could not calculate a price/);
});
