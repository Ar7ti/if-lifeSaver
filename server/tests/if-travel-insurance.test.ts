import assert from 'node:assert/strict';
import test from 'node:test';
import { createIfTravelProvider } from '../src/if-travel-insurance.js';

const input={personalIdentityNumber:'010198-123A',postalCode:'20100',consent:true} as const;
const config={clientId:'test-client',clientSecret:'test-secret',environment:'sandbox' as const,timeoutMs:1000};
const p={amountNet:12.5,amountGross:15,amountDiscount:2.5,currency:'EUR',type:'Monthly'};
const result={id:'private-upstream-id',quoteValidTo:'2098-12-31',activationDateFrom:'2098-01-01',price:[p],insuranceCoverages:[{insuranceBrand:'If',coverageName:'Large',isSelected:true,isDefaultSuggestion:true,coverageItemsIncluded:['Assistance'],price:[p]}],priceCalculationParameters:{covered:'PolicyHolderOnly',maximumTravelLength:{numberOfDays:45}},termsAndDetailedInformations:[]};

test('unconfigured travel quote is unavailable without making a request',async()=>{
  const provider=createIfTravelProvider({environment:'sandbox',timeoutMs:1000},async()=>{throw Error('unexpected fetch');});
  assert.equal(provider.status().available,false);
  await assert.rejects(provider.quote(input),/partner credentials/);
});

test('travel quote uses documented Finnish endpoint and does not expose identity or upstream quote id',async()=>{
  const calls:{url:string;init:RequestInit}[]=[];
  const provider=createIfTravelProvider(config,async(url,init)=>{
    calls.push({url:String(url),init:init??{}});
    return Response.json(calls.length===1?{access_token:'test-token',expires_in:300}:result,{status:calls.length===1?200:201});
  });
  const quote=await provider.quote(input);
  assert.equal(calls[0]?.url,'https://authtest.if.eu/oauth/v2/oauth-token');
  assert.match(String(calls[0]?.init.body),/scope=travel.quote.fi/);
  assert.equal(calls[1]?.url,'https://api.if-insurance.com/test/request-quote-travel-insurance-fi/v1/quotes');
  assert.deepEqual(JSON.parse(String(calls[1]?.init.body)),{policyHolder:{socialSecurityNumber:'010198-123A',postalCode:'20100'}});
  assert.equal(quote.prices[0]?.amountMinor,1250);
  assert.equal(quote.maximumTripDays,45);
  assert.equal(quote.environment,'sandbox');
  assert.equal(JSON.stringify(quote).includes(input.personalIdentityNumber),false);
  assert.equal(JSON.stringify(quote).includes(result.id),false);
});
