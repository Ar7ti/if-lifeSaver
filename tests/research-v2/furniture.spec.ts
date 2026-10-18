import {test,expect} from '@playwright/test';

for(const mobile of [false,true])test(`focused furniture ${mobile?'mobile':'desktop'}: explicit search resolves into honest source cards and survives reload`,async({page})=>{
 if(mobile){await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});}
 const created=await page.request.post('/api/projects',{data:{message:"I'm moving to Turku with €2,000. Find affordable sofas, beds and desks using IKEA, JYSK and Tori."}});
 expect(created.status()).toBe(201);const {project}=await created.json();const base='/api/projects/'+project.id;
 await page.goto('/app/p/'+project.id);const catalog=page.locator('#w-product_catalog');await catalog.scrollIntoViewIfNeeded();
 await catalog.getByRole('textbox',{name:'What are you looking for?'}).fill('Affordable sofas, beds and desks');
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/research')&&r.request().method()==='POST');
 await catalog.getByRole('button',{name:'Search IKEA, JYSK & Tori',exact:true}).click();
 const response=await responsePromise;expect(response.ok()).toBe(true);
 const body=response.request().postDataJSON();expect(body.productSource).toBe('web');expect(body.preferences.join(' ')).toContain('IKEA Finland, JYSK Finland, Tori.fi');
 const cards=catalog.getByRole('region',{name:'Furniture source searches'});
 await expect(cards.getByRole('article')).toHaveCount(3);await expect(cards.getByRole('link')).toHaveCount(9);
 for(const source of ['IKEA Finland','JYSK Finland','Tori.fi']){
  const card=cards.getByRole('article',{name:source+' search pages'});await expect(card).toContainText('Search pages · no price quoted');
  await expect(card.getByRole('link')).toHaveCount(3);await expect(card.getByRole('button',{name:/Add to plan/})).toHaveCount(0);
 }
 const desk=cards.getByRole('article',{name:'JYSK Finland search pages'}).getByRole('link',{name:/Desks/});
 await expect(desk).toHaveAttribute('href','https://jysk.fi/search?query=ty%C3%B6p%C3%B6yt%C3%A4');await desk.focus();await expect(desk).toBeFocused();
 await expect(catalog.getByText('Explore the selected furniture sources',{exact:true})).toBeVisible();
 await expect(catalog.getByText(/Researching /)).toHaveCount(0);
 await page.reload();await expect(cards.getByRole('link')).toHaveCount(9);
 const p=(await(await page.request.get(base)).json()).project;expect(p.cart).toHaveLength(0);expect(p.budget.totalMinor).toBe(200000);expect(p.researchResults.at(-1).furnitureSearchLinks).toHaveLength(9);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await cards.scrollIntoViewIfNeeded();await page.screenshot({path:`server/docs/furniture-research/${mobile?'mobile':'desktop'}.png`});
});
