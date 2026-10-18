import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page,category='sofa'){
 const response=await page.request.post('/api/projects',{data:{message:'Moving to Turku with EUR 2000. I need a sofa, bed and desk.'}});expect(response.status()).toBe(201);const {project}=await response.json();const base='/api/projects/'+project.id;
 await page.request.post(base+'/research',{data:{category,kind:'product',condition:'used',location:'Turku',maxPrice:200,localOnly:true,sort:'price_asc',limit:3}});
 await page.route('https://images.example.org/**',route=>route.abort());
 await page.goto('/app/p/'+project.id);const catalog=page.locator('#w-product_catalog');await catalog.scrollIntoViewIfNeeded();await expect(catalog.getByText('Demo data',{exact:true})).toBeVisible();return{base,catalog};
}
test('synthetic v2 groups show known and unknown evidence, never plan a potential lead, persist free feedback',async({page})=>{
 const {base,catalog}=await setup(page);const potential=catalog.getByRole('region',{name:'Potential matches — check details',exact:true});const supported=catalog.getByRole('region',{name:'Matches your criteria',exact:true});await expect(potential.getByRole('article')).toHaveCount(2);await expect(supported.getByRole('article')).toHaveCount(1);
 const lead=potential.getByRole('article',{name:'Synthetic condition lead'});await expect(lead).toContainText('does not establish used');await expect(lead.getByRole('button',{name:'Add to plan',exact:true})).toBeDisabled();await expect(lead.locator('a[href="https://fixtures.example.org/sofa-1"]')).toBeVisible();await expect(potential.getByText('Price unknown',{exact:true})).toBeVisible();
 await expect(supported.getByRole('img',{name:/category illustration/})).toBeVisible();
 let paidRequests=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/research'))paidRequests++;});
 await lead.getByLabel('Feedback on Synthetic condition lead').selectOption('not_relevant');await expect(lead).toHaveCount(0);let p=(await(await page.request.get(base)).json()).project;expect(p.researchFeedback[0].type).toBe('not_relevant');expect(p.budget.committedMinor).toBe(0);expect(p.cart).toHaveLength(0);
 await page.reload();await expect(catalog.getByRole('article',{name:'Synthetic condition lead'})).toHaveCount(0);
 await catalog.getByLabel('Show results hidden by your feedback').check();const restored=catalog.getByRole('article',{name:'Synthetic condition lead'});await restored.getByLabel('Feedback on Synthetic condition lead').selectOption('');await expect.poll(async()=>((await(await page.request.get(base)).json()).project.researchFeedback.length)).toBe(0);
 await restored.getByText('Why AI chose this',{exact:true}).click();await expect(restored.getByText('Cited summaries are not independent inspection',{exact:false})).toBeVisible();
 await catalog.getByRole('button',{name:'Review missing details',exact:true}).click();expect(paidRequests).toBe(0);await expect(page.getByRole('textbox',{name:/message|ask/i}).last()).toBeVisible();
 await page.getByRole('button',{name:'Close assistant',exact:true}).click();await catalog.scrollIntoViewIfNeeded();await page.screenshot({path:'server/docs/research-v2/desktop.png'});
});
test('synthetic v2 mobile is readable, keyboard accessible and source photos fail to a safe fallback',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});const {catalog}=await setup(page);
 const select=catalog.getByLabel('Feedback on Synthetic condition lead');await select.focus();await expect(select).toBeFocused();await select.selectOption('useful');await expect(select).toHaveValue('useful');
 await page.reload();await expect(catalog.getByLabel('Feedback on Synthetic condition lead')).toHaveValue('useful');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await catalog.scrollIntoViewIfNeeded();await page.screenshot({path:'server/docs/research-v2/mobile.png'});
});
test('synthetic v2 zero-candidate and prior-format results remain distinct and usable',async({page})=>{
 const {base,catalog}=await setup(page,'missing');await expect(catalog.getByText('No supported matches or useful leads',{exact:true})).toBeVisible();await expect(catalog.getByRole('region',{name:'Improve this search'})).toBeVisible();
 await page.request.post(base+'/research',{data:{category:'legacy'}});await page.reload();await expect(catalog.getByRole('region',{name:'Fictional demo options'})).toBeVisible();await expect(page.locator('#w-budget')).toContainText('€2,000');
});
test('source-grounded notes stay visible without product listings, persist and never change the budget',async({page})=>{
 const {base,catalog}=await setup(page,'notes');const notes=catalog.getByRole('region',{name:'Research notes and sources'});
 await expect(notes.getByRole('link',{name:/Synthetic furniture research guide/})).toHaveAttribute('href','https://fixtures.example.org/furniture-guide');
 await notes.getByText('Read research note',{exact:true}).click();await expect(notes).toContainText('No real listings or verified prices');
 await expect(catalog.getByText('Useful sources found — exact listings need checking',{exact:true})).toBeVisible();await expect(notes.getByRole('button',{name:'Add to plan'})).toHaveCount(0);
 await page.reload();await expect(notes).toBeVisible();const p=(await(await page.request.get(base)).json()).project;expect(p.budget.totalMinor).toBe(200000);expect(p.cart).toHaveLength(0);expect(p.researchResults.at(-1).sourceNotes).toHaveLength(1);
});
test('workspace content remains painted when animation playback is stalled',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});const {catalog}=await setup(page,'notes');
 await page.evaluate(()=>document.getAnimations().forEach(a=>a.pause()));
 const paint=await catalog.evaluate(el=>{const styles=[];for(let n:Element|null=el;n;n=n.parentElement)styles.push({opacity:getComputedStyle(n).opacity,visibility:getComputedStyle(n).visibility});return styles;});
 expect(paint.every(s=>Number(s.opacity)>0&&s.visibility==='visible')).toBe(true);
 await expect(catalog.getByRole('region',{name:'Research notes and sources'})).toBeVisible();
});
