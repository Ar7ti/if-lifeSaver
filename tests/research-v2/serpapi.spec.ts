import {test,expect} from '@playwright/test';

for(const mobile of [false,true])test(`SerpApi synthetic ${mobile?'mobile':'desktop'}: source image, Google destination, plan totals and reload`,async({page})=>{
 if(mobile){await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});}
 // Deterministic image bytes: no Google, merchant or paid API requests.
 await page.route('https://images.example.org/serpapi-synthetic-sofa.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ZkAAAAASUVORK5CYII=','base64')}));
 const created=await page.request.post('/api/projects',{data:{message:"I'm moving to Turku, Finland with EUR 2000 and need a sofa, bed and desk"}});expect(created.status()).toBe(201);const {project}=await created.json();const base='/api/projects/'+project.id;
 await page.goto('/app/p/'+project.id);const catalog=page.locator('#w-product_catalog');await catalog.scrollIntoViewIfNeeded();
 await catalog.getByRole('combobox',{name:'Product source'}).selectOption('serpapi');
 await catalog.getByRole('combobox',{name:'Product country'}).selectOption('FI');
 await catalog.getByRole('textbox',{name:'What are you looking for?'}).fill('sofa');
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/research')&&r.request().method()==='POST');await catalog.getByRole('button',{name:'Research',exact:true}).click();const response=await responsePromise;expect(response.ok()).toBe(true);expect(response.request().postDataJSON().productSource).toBe('serpapi');
 const card=catalog.getByRole('article',{name:'Synthetic SerpApi sofa',exact:true});await expect(card).toBeVisible();await expect(card).toContainText('demo price');await expect(card).toContainText('Google Shopping · SerpApi · source-reported');await expect(card).toContainText('Shipping: unknown');await expect(card.getByRole('link',{name:/View on Google Shopping/})).toHaveAttribute('href','https://www.google.com/search?prds=catalogid:synthetic-1');
 await expect(card.locator('img')).toHaveAttribute('src','https://images.example.org/serpapi-synthetic-sofa.png');await expect.poll(()=>card.locator('img').evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
 await card.getByRole('button',{name:'Add to plan',exact:true}).click();await expect(card).toContainText('In your plan');const saved=(await(await page.request.get(base)).json()).project;expect(saved.cart).toHaveLength(1);expect(saved.cart[0].unitPriceMinor).toBe(17900);expect(saved.cart[0].deliveryCostMinor).toBeNull();expect(saved.budget.committedMinor).toBe(17900);expect(saved.budget.proposedMinor).toBe(0);
 await page.reload();await expect(card).toContainText('In your plan');expect((await(await page.request.get(base)).json()).project.cart).toHaveLength(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const used=await page.request.post(base+'/research',{data:{category:'sofa',searchTerms:'sofa',kind:'product',productSource:'serpapi',country:'FI',currency:'EUR',condition:'used'}});expect(used.ok()).toBe(true);const usedResult=await used.json();expect(usedResult.summary.supportedCount).toBe(1);expect(usedResult.summary.potentialCount).toBe(1);expect(usedResult.offers.find((o:{title:string})=>o.title==='Synthetic SerpApi sofa').eligibilityStatus).toBe('potential');
});
