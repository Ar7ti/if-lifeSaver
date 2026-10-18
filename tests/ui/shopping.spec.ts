import { test,expect,type Page } from '@playwright/test';
import type { LifeProject } from '../../shared/contracts/index';
test.setTimeout(120000);
// Keep the real shared 120/min limiter enabled. This request-heavy fixture waits
// for its advertised window before/after running so other suites retain their allowance.
async function allowServerWindow(request:import('@playwright/test').APIRequestContext){
 const response=await request.get('/api/health');
 const remaining=Number(response.headers()['x-ratelimit-remaining']);
 const seconds=Number(response.headers()['retry-after']??response.headers()['x-ratelimit-reset']);
 if(Number.isFinite(remaining)&&remaining<110&&Number.isFinite(seconds)&&seconds>0&&seconds<=60)
  await new Promise(resolve=>setTimeout(resolve,seconds*1000+150));
}
test.beforeAll(async({request},info)=>{info.setTimeout(75000);await allowServerWindow(request);});
test.afterAll(async({request},info)=>{info.setTimeout(75000);await allowServerWindow(request);});
async function create(page:Page){
 let r=await page.request.post('/api/projects',{data:{message:'I am moving to Turku with EUR 2000 and need a sofa, bed and desk.'}});
 if(r.status()===429){await page.waitForTimeout(Number(r.headers()['retry-after']??60)*1000+150);r=await page.request.post('/api/projects',{data:{message:'I am moving to Turku with EUR 2000 and need a sofa, bed and desk.'}});}
 expect(r.status()).toBe(201);const {project}=await r.json();const base=`/api/projects/${project.id}`;
 // Explicit fictional planning allocation; not a provider quote.
 await page.request.patch(base,{data:{budget:{categories:[{id:'moving',title:'Moving',allocatedMinor:100000},{id:'furniture',title:'Furniture',allocatedMinor:80000}],emergencyReserveMinor:20000}}});
 await page.goto(`/app/p/${project.id}`);await expect(page.locator('#project-title')).toBeVisible();
 return {id:project.id as string,base,read:async()=>((await(await page.request.get(base)).json()).project as LifeProject)};
}
test('moving visual shopping: research, genuine scenario differences, apply, cheaper substitution, undo and reload',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const {base,read}=await create(page);
 const needs=page.getByLabel('Planned shopping needs',{exact:true});await expect(needs.getByRole('button',{name:/Sofa/})).toBeVisible();await expect(needs.getByRole('button',{name:/Bed/})).toBeVisible();await expect(needs.getByRole('button',{name:/Desk/})).toBeVisible();
 for(const name of ['Sofa','Bed','Desk']){const searched=page.waitForResponse(r=>r.url().endsWith('/research')&&r.request().method()==='POST');await needs.getByRole('button',{name:new RegExp(name)}).click();expect((await(await searched).json()).mode).toBe('demo');await expect(page.locator('#w-product_catalog').getByText(/Category illustration · no listing photo/).first()).toBeVisible();}
 await expect.poll(async()=>new Set((await read()).scenarios.map(s=>s.estimatedTotalMinor)).size).toBe(3);
 const compare=page.locator('#w-scenario_comparison');await expect(compare).toContainText('Fictional demo comparison');
 await compare.getByRole('tab',{name:/Comfort/}).click();await compare.getByRole('button',{name:'Plan with Comfort',exact:true}).click();const confirm=page.getByRole('dialog',{name:'Apply Comfort to your plan?'});await expect(confirm).toBeVisible();expect((await read()).cart).toHaveLength(0);
 await confirm.getByRole('button',{name:'Confirm plan changes',exact:true}).click();await expect(confirm).not.toBeVisible();await expect.poll(async()=>(await read()).cart.length).toBe(3);
 let p=await read();expect(p.scenarioSelection?.id).toBe('comfort');const before=p.budget.proposedMinor;const target=p.cart.find(i=>i.unitPriceMinor>12000)!;expect(target).toBeTruthy();
 const cart=page.locator('#w-shopping_cart');const row=cart.locator('li').filter({hasText:target.title}).first();await row.getByRole('button',{name:'Replace',exact:true}).click();const replace=page.getByRole('dialog',{name:`Replace ${target.title}`,exact:true});await expect(replace).toBeVisible();
 await replace.getByRole('radio').first().check();await replace.getByRole('button',{name:'Replace item',exact:true}).click();await expect(replace).not.toBeVisible();await expect.poll(async()=>(await read()).budget.proposedMinor).toBeLessThan(before);
 await page.getByRole('button',{name:'Undo',exact:true}).last().click();await expect.poll(async()=>(await read()).budget.proposedMinor).toBe(before);
 await cart.locator('li').filter({hasText:target.title}).first().getByRole('button',{name:'Replace',exact:true}).click();await replace.getByRole('radio').first().check();await replace.getByRole('button',{name:'Replace item',exact:true}).click();
 await expect.poll(async()=>(await read()).budget.proposedMinor).toBeLessThan(before);p=await read();expect(p.cart).toHaveLength(3);expect(p.scenarioSelection?.needsReview).toBe(true);
 await page.reload();await expect(page.locator('#project-title')).toBeVisible();expect((await read()).cart.map(i=>[i.id,i.offerId,i.unitPriceMinor])).toEqual(p.cart.map(i=>[i.id,i.offerId,i.unitPriceMinor]));expect((await read()).scenarioSelection?.id).toBe('comfort');expect(errors).toEqual([]);
 await compare.scrollIntoViewIfNeeded();await page.screenshot({path:'server/docs/shopping/desktop.png'});
 const response=await page.request.get(base);expect(response.ok()).toBeTruthy();
});
test('source image uses its own URL, deferred loading never blocks the workspace, broken photos fall back',async({page})=>{
 const {base}=await create(page);await page.request.post(base+'/research',{data:{category:'sofa'}});
 await page.route('**'+base,async route=>{const r=await route.fetch();const value=await r.json();value.project.researchResults[0].offers.forEach((o:Record<string,unknown>,i:number)=>{o.imageUrl=`https://images.example.org/${i===0?'source':'broken'}-${i}.png`;o.imageType='listing';o.imageSource='provider';});await route.fulfill({json:value});});
 let releaseImage:()=>void=()=>{};const gate=new Promise<void>(resolve=>{releaseImage=resolve;});
 await page.route('https://images.example.org/**',async route=>{if(route.request().url().includes('broken'))await route.abort();else{await gate;await route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY1sAAAAASUVORK5CYII=','base64')});}});
 await page.reload();await expect(page.locator('#project-title')).toBeVisible();const catalog=page.locator('#w-product_catalog');await catalog.scrollIntoViewIfNeeded();
 const img=catalog.locator('img[src="https://images.example.org/source-0.png"]');await expect(img).toHaveAttribute('loading','lazy');await expect(img).toHaveAttribute('referrerpolicy','no-referrer');
 await expect(page.locator('#w-budget')).toContainText('€2,000');releaseImage();await expect.poll(()=>img.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBe(1);
 await expect(catalog.getByText('Provider product photo')).toBeVisible();
 await page.reload();await catalog.scrollIntoViewIfNeeded();await expect.poll(()=>catalog.locator('img[src="https://images.example.org/source-0.png"]').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBe(1);await expect(catalog.getByText('Provider product photo')).toBeVisible();
 await expect(catalog.getByRole('img',{name:'Sofa category illustration'}).first()).toBeVisible();
});
test('mobile replacement requires explicit approval for chosen items and layout remains usable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});const {base,read}=await create(page);
 const research=await(await page.request.post(base+'/research',{data:{category:'sofa'}})).json();const expensive=research.offers.find((o:{priceMinor:number})=>o.priceMinor===30000);await page.request.post(base+'/cart/items',{data:{offerId:expensive.id,status:'selected'}});await page.reload();
 const cart=page.locator('#w-shopping_cart');await cart.getByRole('button',{name:'Replace',exact:true}).click();const dialog=page.getByRole('dialog',{name:`Replace ${expensive.title}`,exact:true});await dialog.getByRole('radio').first().check();await expect(dialog.getByRole('button',{name:'Replace item',exact:true})).toBeDisabled();await dialog.getByRole('checkbox',{name:'I approve replacing this chosen item.'}).check();await dialog.getByRole('button',{name:'Replace item',exact:true}).click();
 await expect(dialog).not.toBeVisible();await expect.poll(async()=>(await read()).budget.committedMinor).toBeLessThan(33000);expect((await read()).cart).toHaveLength(1);
 const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1;}).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent?.slice(0,100),right:el.getBoundingClientRect().right})).slice(0,18));
 expect(overflow).toEqual([]);await cart.scrollIntoViewIfNeeded();await page.screenshot({path:'server/docs/shopping/mobile.png'});
});
