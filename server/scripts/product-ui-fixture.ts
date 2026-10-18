/** Explicit local-only browser fixture: all OAuth/listing data fictional, zero external requests. */
import {buildApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {EbayBrowseProvider} from '../src/products/ebay.js';
if(process.env.PRODUCT_UI_FIXTURE!=='true'||process.env.RAILWAY_ENVIRONMENT_NAME)throw Error('Fixture is restricted to explicit localhost testing.');
const provider=new EbayBrowseProvider({enabled:true,approved:true,freeApiConfirmed:true,environment:'sandbox',clientId:'fictional-fixture',clientSecret:'fictional-fixture',timeoutMs:1000,dailyRequests:20,globalDailyRequests:100},{fetch:(async(url:unknown)=>{
 if(String(url).includes('/oauth2/token'))return Response.json({access_token:'synthetic-token',expires_in:7200});
 const u=new URL(String(url)),q=u.searchParams.get('q')??'';
 if(q.includes('timeout'))throw new DOMException('Synthetic timeout','TimeoutError');
 const country=new URLSearchParams(u.search).get('filter')?.includes('deliveryCountry:GB')?'GB':'DE';const currency=country==='GB'?'GBP':'EUR';
 return Response.json({itemSummaries:q.includes('empty')?[]:[180,100,150].map((price,i)=>({itemId:`v1|fixture${i}|0`,title:`Synthetic sofa ${i+1}`,itemWebUrl:`https://sandbox.ebay.com/itm/fictional${i}`,price:{value:String(price),currency},buyingOptions:['FIXED_PRICE'],conditionId:i===2?undefined:'3000',itemLocation:{city:country==='GB'?'London':'Berlin',country},seller:{username:'Fictional test seller'},image:{imageUrl:`https://i.ebayimg.com/images/g/fixture${i}/s-l500.jpg`},shippingOptions:i===2?[]:[{shippingCost:{value:'10',currency},shippingCostType:'FIXED'}]}))});
}) as typeof fetch});
const app=await buildApp({config:loadConfig({HOST:'127.0.0.1',PORT:'3098',AI_MODE:'local',RESEARCH_MODE:'demo',STORAGE_MODE:'memory',LOG_LEVEL:'silent',ALLOWED_ORIGINS:'http://127.0.0.1:5198'}),productProviders:[provider]});await app.listen({host:'127.0.0.1',port:3098});
