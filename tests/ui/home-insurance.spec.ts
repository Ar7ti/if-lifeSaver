import { test,expect,type Page } from '@playwright/test';
import type { LifeProject,IfQuote } from '../../shared/contracts/index';

test.describe.configure({mode:'serial'});
let moving:LifeProject;let travel:LifeProject;
test.beforeAll(async({request})=>{
 for(const [scenario,message]of [['moving','Moving to Turku with €2000 on 2027-06-10'],['travel','Travel to Rome with €900']] as const){const r=await request.post('/api/projects',{data:{message}});expect(r.status()).toBe(201);const p=(await r.json()).project;if(scenario==='moving')moving=p;else travel=p;}
});
const section=(page:Page)=>page.getByRole('region',{name:'Home insurance with If'});

test('real backend unavailable flow prepares reusable details without collecting identity or requesting quotes',async({page})=>{
 let quotes=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/home-insurance/quote'))quotes++;});
 await page.goto(`/app/p/${moving.id}`);const card=section(page);await expect(card).toBeVisible();await expect(card.getByText('Live quote unavailable',{exact:true})).toBeVisible();
 await expect(card.getByLabel('City',{exact:true})).toHaveValue('Turku');await expect(card.getByLabel('Requested start date',{exact:true})).toHaveValue('2027-06-10');
 await expect(card.locator('input[type=password]')).toHaveCount(0);expect(quotes).toBe(0);
 await card.getByLabel('Street address',{exact:true}).fill('Test street 1 A 2');await card.getByLabel('Home postal code',{exact:true}).fill('20100');await card.getByLabel('Home type',{exact:true}).selectOption('Apartment');await card.getByLabel('Living area (m²)',{exact:true}).fill('45');await card.getByLabel('Your current postal code',{exact:true}).fill('00100');
 await card.getByRole('button',{name:'Save home details',exact:true}).click();await expect(card.getByRole('status').filter({hasText:'Home details saved'})).toBeVisible();
 const p=(await(await page.request.get(`/api/projects/${moving.id}`)).json()).project;expect(p.homeInsurance.details.livingSpace).toBe(45);expect(p.homeInsurance.quote).toBeNull();
 await page.reload();await expect(card.getByLabel('Street address',{exact:true})).toHaveValue('Test street 1 A 2');await card.getByRole('button',{name:'Request If quote',exact:true}).click();await expect(card.getByRole('status').filter({hasText:'Approved If partner credentials'}).last()).toBeVisible();expect(quotes).toBe(0);await expect(card).not.toContainText('€');
 await card.screenshot({path:'test-results/if-home-desktop.png'});
});

test('home insurance appears only in moving projects',async({page})=>{
 await page.goto(`/app/p/${travel.id}`);await expect(page.locator('#project-title')).toBeVisible();await expect(section(page)).toHaveCount(0);
});

test('mobile insurance form stays within the viewport with visible actions',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(`/app/p/${moving.id}`);const card=section(page);await expect(card).toBeVisible();
 const bounds=await card.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(391);
 expect(await card.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy();await card.getByRole('button',{name:'Request If quote',exact:true}).scrollIntoViewIfNeeded();await expect(card.getByRole('button',{name:'Request If quote',exact:true})).toBeInViewport();
 await card.screenshot({path:'test-results/if-home-mobile.png'});
});

test('explicit quote request shows sourced coverage and billing period; adding a proposal refreshes the budget',async({page})=>{
 // Synthetic UI fixture only. No request goes to If and no demo price is shipped in the app.
 let project=structuredClone(moving);let quoteRequests=0;let proposals=0;
 const testIdentity='010106A9377';
 const q:IfQuote={id:'00000000-0000-4000-8000-000000000099',provider:'If',environment:'live',receivedAt:new Date().toISOString(),validTo:'2099-01-01',activationDateFrom:'2027-06-10',details:{streetAddress:'Test street 1 A 2',city:'Turku',postalCode:'20100',policyHolderPostalCode:'00100',livingSpace:45,householderType:'Apartment',startDate:'2027-06-10'},premiums:[{amountMinor:1250,grossMinor:1500,discountMinor:250,currency:'EUR',billingPeriod:'Monthly',periodMonths:1}],coverages:[{name:'Test coverage',selected:true,suggested:true,items:[{id:'test',name:'Returned coverage item',description:'Coverage text returned by the test provider.'}],premiums:[]}],warnings:[],terms:[]};
 project.homeInsurance={details:q.details,quote:null,expense:null};
 await page.route(`**/api/projects/${moving.id}**`,async route=>{
  const url=new URL(route.request().url());let body:unknown={project};
  if(url.pathname.endsWith('/home-insurance'))body={status:{available:true,environment:'live',message:'Ready to request',documentationUrl:'https://developer.if-insurance.com/apis/property/householder-insurance-apis-finland/documentation'},state:project.homeInsurance??{details:{},quote:null,expense:null}};
  else if(url.pathname.endsWith('/quote')){quoteRequests++;expect(route.request().postDataJSON().personalIdentityNumber).toBe(testIdentity);project={...project,homeInsurance:{details:q.details,quote:q,expense:null}};body={project};}
  else if(url.pathname.endsWith('/expense')){proposals++;const months=route.request().postDataJSON().planningMonths;const amount=1250*months;project={...project,homeInsurance:{...project.homeInsurance!,expense:{quoteId:q.id,status:'proposed',premiumMinor:1250,billingPeriod:'Monthly',periodMonths:1,planningMonths:months,installments:months,plannedMinor:amount,annualEquivalentMinor:15000,createdAt:new Date().toISOString()}},budget:{...project.budget,proposedMinor:amount,recurringProposedMinor:amount,availableMinor:project.budget.availableMinor-amount}};body={project};}
  else if(url.pathname!==`/api/projects/${moving.id}`)return route.continue();
  await route.fulfill({json:body});
 });
 await page.goto(`/app/p/${moving.id}`);const card=section(page);await expect(card.getByText('Ready to request',{exact:true}).first()).toBeVisible();expect(quoteRequests).toBe(0);
 await card.getByLabel('Finnish personal identity number',{exact:true}).fill(testIdentity);await card.getByRole('checkbox').check();
 // Enter while editing must not implicitly send personal information to If.
 await card.getByLabel('Street address',{exact:true}).focus();await page.keyboard.press('Enter');await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));expect(quoteRequests).toBe(0);
 await card.getByRole('button',{name:'Request If quote',exact:true}).click();
 await expect(card.getByText('Quote returned by If',{exact:true})).toBeVisible();expect(quoteRequests).toBe(1);await expect(card).toContainText('€12.50');await expect(card).toContainText('Monthly');await expect(card.locator('input[type=password]')).toHaveValue('');
 await card.getByText('Test coverage · Selected by If',{exact:true}).click();await expect(card.getByText('Coverage text returned by the test provider.',{exact:true})).toBeVisible();
 await card.getByLabel('Months to include in your moving budget',{exact:true}).selectOption('3');await expect(card).toContainText('€37.50');await card.getByRole('button',{name:'Add quote as proposed expense',exact:true}).click();
 await expect(card.getByText('Proposed in your plan',{exact:true})).toBeVisible();expect(proposals).toBe(1);await expect(page.locator('#w-budget')).toContainText('Your 3-month plan includes €37.50');await expect(card).toContainText('This is not a purchased policy');
 const saved=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));expect(saved).not.toContain(testIdentity);await expect(page.locator('body')).not.toContainText(testIdentity);
 // A persisted annual choice must not reset to the first (monthly) price on reload.
 project.homeInsurance!.quote!.premiums.push({amountMinor:12000,grossMinor:12000,discountMinor:0,currency:'EUR',billingPeriod:'Annual',periodMonths:12});
 project.homeInsurance!.expense={...project.homeInsurance!.expense!,premiumMinor:12000,billingPeriod:'Annual',periodMonths:12,planningMonths:12,installments:1,plannedMinor:12000,annualEquivalentMinor:12000};
 await page.reload();await expect(card.getByLabel('Price and billing period',{exact:true})).toHaveValue('1');await expect(card.getByLabel('Price and billing period',{exact:true})).toBeDisabled();await expect(card).toContainText('€120.00');
});
