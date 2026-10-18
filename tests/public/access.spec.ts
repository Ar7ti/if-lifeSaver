import {test,expect} from '@playwright/test';

test('public visitors create isolated workspaces without a token and retain them after reload',async({page,browser})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/app/new');
  await page.getByRole('textbox',{name:'What are you planning?',exact:true}).fill('I am moving to Turku with EUR 2000.');
  await page.getByRole('button',{name:'Create my workspace',exact:true}).click();
  await expect(page).toHaveURL(/\/app\/p\/[a-f0-9-]+$/,{timeout:20000});
  const url=page.url();const id=url.split('/').at(-1)!;
  const title=(await (await page.request.get('/api/projects/'+id)).json()).project.title;
  expect(await page.evaluate(()=>localStorage.getItem('lifesim.projects'))).not.toContain(title);
  await expect(page.getByText('Private to this browser.',{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>document.cookie)).not.toContain('lifesim');
  const cookies=await page.context().cookies();const session=cookies.find(c=>c.name==='lifesim-dev');expect(session?.httpOnly).toBe(true);expect(session?.sameSite).toBe('Lax');
  await page.reload();await expect(page.getByRole('button',{name:'Edit details',exact:true})).toBeVisible();
  await page.goto('/app/settings');await expect(page.getByRole('heading',{name:'Access token',exact:true})).toHaveCount(0);
  await page.goto('/app/projects');await expect(page.getByRole('heading',{name:title,exact:true,level:3})).toBeVisible();
  const other=await browser.newContext();const second=await other.newPage();await second.goto('/app');
  await expect(second.getByRole('textbox',{name:'What are you planning?',exact:true})).toBeVisible();
  expect((await second.request.get(`/api/projects/${id}`)).status()).toBe(404);
  await second.goto('/app/projects');await expect(second.locator(`a[href="/app/p/${id}"]`)).toHaveCount(0);
  await other.close();expect(errors).toEqual([]);
});

test('independent administrator login is transient and logout restores anonymous access',async({page})=>{
  await page.goto('/app/settings');await page.getByText('Administrator access',{exact:true}).click();
  await page.getByLabel('Private administrator key').fill('public-browser-fixture-key-not-for-deployment');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sign out of administration',exact:true})).toBeVisible();
  const storage=await page.evaluate(()=>JSON.stringify(localStorage));expect(storage).not.toContain('public-browser-fixture-key');
  expect((await page.request.get('/api/admin/status')).status()).toBe(200);
  await page.getByRole('button',{name:'Sign out of administration',exact:true}).click();
  await page.getByText('Administrator access',{exact:true}).click();
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  expect((await page.request.get('/api/admin/status')).status()).toBe(404);
});

test('missing CSRF is rejected while non-AI project edits remain usable',async({page})=>{
  await page.goto('/app');await expect(page.getByRole('textbox',{name:'What are you planning?',exact:true})).toBeVisible();
  const r=await page.request.post('/api/projects',{data:{message:'Travel to Rome with EUR 900'},headers:{Origin:'http://127.0.0.1:5186'}});expect(r.status()).toBe(403);
  const session=await (await page.request.get('/api/session')).json();
  const headers={Origin:'http://127.0.0.1:5186','X-CSRF-Token':session.csrfToken,'Idempotency-Key':crypto.randomUUID()};
  const created=await page.request.post('/api/projects',{data:{message:'Travel to Rome with EUR 900'},headers});expect(created.status()).toBe(201);
  const {project}=await created.json();
  const patch=await page.request.patch('/api/projects/'+project.id,{data:{title:'My private holiday'},headers});expect(patch.status()).toBe(200);
  await page.goto('/app/p/'+project.id);await expect(page.getByRole('heading',{name:'My private holiday',exact:true})).toBeVisible();
});

test('quota errors leave the workspace and manual editing available',async({page})=>{
  await page.goto('/app/new');await page.getByRole('textbox',{name:'What are you planning?',exact:true}).fill('Plan a trip to Rome with EUR 900');await page.getByRole('button',{name:'Create my workspace',exact:true}).click();
  await expect(page).toHaveURL(/\/app\/p\/[a-f0-9-]+$/,{timeout:20000});
  await page.route('**/api/projects/*/assistant',route=>route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({error:{code:'AI_QUOTA_EXCEEDED',message:"You've used today's free AI requests. Your workspaces are still available. Come back after the daily UTC reset."}})}));
  await page.getByRole('button',{name:'Ask assistant',exact:true}).first().click();
  const input=page.getByRole('textbox',{name:'Message the assistant'});await input.fill('Find cheaper flights');await input.press('Enter');
  await expect(page.getByText(/You've used today's free AI requests/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Edit details',exact:true})).toBeEnabled();
});

test('admin logout clears privileged workspace caches in another tab',async({page,browser})=>{
  const other=await browser.newContext();const visitor=await other.newPage();await visitor.goto('/app');
  await expect(visitor.getByRole('textbox',{name:'What are you planning?',exact:true})).toBeVisible();
  const info=await (await visitor.request.get('/api/session')).json();
  const created=await visitor.request.post('/api/projects',{headers:{Origin:'http://127.0.0.1:5186','X-CSRF-Token':info.csrfToken,'Idempotency-Key':crypto.randomUUID()},data:{message:'Travel to Paris with EUR 1500'}});
  expect(created.status()).toBe(201);const {project}=await created.json();
  await page.goto('/app/settings');await page.getByText('Administrator access',{exact:true}).click();
  await page.getByLabel('Private administrator key').fill('public-browser-fixture-key-not-for-deployment');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sign out of administration',exact:true})).toBeVisible();
  const privileged=await page.context().newPage();await privileged.goto('/app/p/'+project.id);
  await expect(privileged.getByRole('heading',{name:project.title,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Sign out of administration',exact:true}).click();
  await expect(privileged.getByRole('heading',{name:project.title,exact:true})).toHaveCount(0);
  expect((await privileged.request.get('/api/projects/'+project.id)).status()).toBe(404);
  await privileged.close();await other.close();
});
