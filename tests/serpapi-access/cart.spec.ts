import {test,expect} from '@playwright/test';
test('real anonymous CSRF guard: cart removal and scenario recalculation send JSON, preserve private data and spend no AI allowance',async({page})=>{
 await page.goto('/app');await expect(page.getByRole('textbox',{name:'What are you planning?',exact:true})).toBeVisible();
 const info=await(await page.request.get('/api/session')).json();const headers={Origin:'http://127.0.0.1:5203','X-CSRF-Token':info.csrfToken,'Idempotency-Key':crypto.randomUUID()};
 const created=await page.request.post('/api/projects',{headers,data:{message:"I'm moving to Turku, Finland with EUR 2000 and need a sofa"}});expect(created.status()).toBe(201);const {project}=await created.json();const base='/api/projects/'+project.id;
 const added=await page.request.post(base+'/cart/items',{headers,data:{title:'Synthetic public sofa',category:'sofa',unitPriceMinor:17900,status:'selected'}});expect(added.status()).toBe(201);const item=(await added.json()).items[0];
 // The backend must continue rejecting requests without the JSON CSRF boundary.
 const rejected=await page.request.delete(base+'/cart/items/'+item.id,{headers});expect(rejected.status()).toBe(403);
 await page.goto('/app/p/'+project.id);await expect(page.locator('#project-title')).toBeVisible();
 const removedPromise=page.waitForResponse(r=>r.url().endsWith('/cart/items/'+item.id)&&r.request().method()==='DELETE');await page.getByRole('button',{name:'Remove Synthetic public sofa',exact:true}).click();const removed=await removedPromise;expect(removed.status()).toBe(200);expect(removed.request().headers()['content-type']).toBe('application/json');expect(removed.request().postDataJSON()).toEqual({});
 const recalculated=page.waitForResponse(r=>r.url().endsWith('/scenarios')&&r.request().method()==='POST');await page.locator('#w-scenario_comparison').getByRole('button',{name:'Recalculate',exact:true}).click();const response=await recalculated;expect(response.status()).toBe(200);expect(response.request().postDataJSON()).toEqual({});
 await page.reload();const p=(await(await page.request.get(base)).json()).project;expect(p.cart).toHaveLength(0);expect(p.budget.committedMinor).toBe(0);expect(p.budget.totalMinor).toBe(200000);expect((await(await page.request.get('/api/session')).json()).usage.used).toBe(0);
});
