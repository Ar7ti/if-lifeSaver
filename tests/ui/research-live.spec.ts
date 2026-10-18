import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';

test('controlled research response: timeout/error recovery, empty result, unit rate and quota keep the workspace usable',async({page})=>{
 const created=await page.request.post('/api/projects',{data:{message:'Moving to Turku with EUR 2000'}});expect(created.status()).toBe(201);const {project}=await created.json();const base='/api/projects/'+project.id;
 let result:any=null,count=0;
 await page.route('**'+base,async route=>{if(route.request().method()!=='GET')return route.continue();const response=await route.fetch();const body=await response.json();if(result){body.project.researchResults=[result];body.project.revision+=count;}await route.fulfill({json:body});});
 await page.route('**'+base+'/research',async route=>{
  count++;await new Promise(resolve=>setTimeout(resolve,100));
  if(count===1)return route.fulfill({status:504,json:{error:{code:'RESEARCH_TIMEOUT',message:'Research timed out. No results were fabricated.'}}});
  if(count===5)return route.fulfill({status:200,contentType:'application/json',body:'{not json}'});
  if(count===4)return route.fulfill({status:429,json:{error:{code:'AI_QUOTA_EXCEEDED',message:"You've used today's free AI requests. Your workspaces are still available."}}});
  const now=new Date().toISOString();
  result={id:randomUUID(),category:'housing',status:'limited',mode:'live',offers:[],warnings:['Controlled browser fixture; not actual live search.'],searchedAt:now,query:'Controlled rental test',request:{category:'housing',kind:'service',preferences:[]}};
  if(count===3)result.offers=[{id:randomUUID(),category:'housing',kind:'service',title:'Controlled test apartment',description:'Explicitly fictional browser fixture, not a real rental.',priceMinor:null,currency:'EUR',priceStatus:'unknown',sourceType:'listing',reportedRate:{amountMinor:70000,period:'month',evidence:'Controlled test rate'},sourceUrl:'https://rentals.example.org/test-only',sourceName:'Controlled fixture',seller:{name:null,type:'unknown',publicProfileUrl:null,verified:false},imageUrl:null,location:'Turku',delivery:{available:null,costMinor:null,details:'Not applicable'},condition:'not_applicable',availability:'unknown',lastCheckedAt:now,verificationStatus:'source_checked',recommendation:'Controlled UI fixture; no actual search was executed.',score:0,evidence:['Browser mock only']}];
  await route.fulfill({json:result});
 });
 await page.goto('/app/p/'+project.id);const catalog=page.locator('#w-service_finder');await expect(catalog).toBeVisible();await catalog.getByLabel('Which service do you need?').fill('Rental apartments in Turku under €750/month');
 await catalog.getByRole('button',{name:'Research',exact:true}).click();await expect(catalog.getByText('Research timed out. No results were fabricated.',{exact:false})).toBeVisible();
 await catalog.getByRole('button',{name:/try again|retry/i}).click();await expect(catalog.getByText('0 options',{exact:false})).toBeVisible();
 await catalog.getByRole('button',{name:'New search',exact:true}).click();await catalog.getByRole('button',{name:'Research',exact:true}).click();await expect(catalog.getByRole('heading',{name:'Controlled test apartment'})).toBeVisible();
 await expect(catalog.getByText('€700/month source-listed · total unknown')).toBeVisible();await expect(catalog.getByRole('button',{name:'Add to plan',exact:true})).toBeDisabled();await expect(catalog.locator('a[href="https://rentals.example.org/test-only"]')).toBeVisible();
 await catalog.getByRole('button',{name:'New search',exact:true}).click();await catalog.getByRole('button',{name:'Research',exact:true}).click();await expect(catalog.getByText(/used today's free AI requests/)).toBeVisible();
 await expect(page.locator('#w-budget')).toContainText('€2,000');await expect(catalog.getByRole('button',{name:'Research',exact:true})).toBeEnabled();expect(count).toBe(4);
 await catalog.getByRole('button',{name:'Research',exact:true}).click();await expect(catalog.getByText(/server response could not be read/)).toBeVisible();await expect(catalog.getByRole('button',{name:'Research',exact:true})).toBeEnabled();expect(count).toBe(5);
});
