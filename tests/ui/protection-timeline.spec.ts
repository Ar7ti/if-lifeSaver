import { test, expect, type Page } from '@playwright/test';
import type { LifeProject } from '../../shared/contracts/index';

// This suite shares the actual server rate limiter with existing UI tests. Honor it.
test.setTimeout(120_000);
async function create(page:Page, message='I am moving to Turku with EUR 2000. I already own a bed and desk.') {
 let response=await page.request.post('/api/projects',{data:{message}});
 if(response.status()===429){
  const seconds=Number(response.headers()['retry-after']);
  if(Number.isFinite(seconds)&&seconds>=0&&seconds<=60){await page.waitForTimeout(seconds*1000+150);response=await page.request.post('/api/projects',{data:{message}});}
 }
 expect(response.status()).toBe(201);
 const {project}=await response.json();
 await page.goto(`/app/p/${project.id}`);
 return {id:project.id as string,read:async()=>((await (await page.request.get(`/api/projects/${project.id}`)).json()).project as LifeProject)};
}
const first='Review your existing home protection';

test('moving protection persists, reschedules, reopens and leaves budgets and tasks unchanged',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const {id,read}=await create(page);const original=await read();
 const timeline=page.getByRole('region',{name:'If Protection Timeline',exact:true});
 await expect(timeline).toBeVisible();await expect(timeline.getByText('Move date not set',{exact:true})).toBeVisible();
 await timeline.getByRole('button',{name:'Add move date',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Plan details'});await dialog.getByLabel('Move date',{exact:true}).fill('2027-11-15');
 await dialog.getByRole('button',{name:'Save details',exact:true}).click();await expect(dialog).not.toBeVisible();
 await expect(timeline.getByText('15 Nov 2027',{exact:true}).first()).toBeVisible();
 const toggle=timeline.getByRole('button',{name:`Complete: ${first}`,exact:true});
 await toggle.click();await expect(timeline.getByText('1 of 5 steps completed')).toBeVisible();
 await timeline.getByRole('button',{name:'Complete: Check safety in your new home',exact:true}).click();await expect(timeline.getByText('2 of 5 steps completed')).toBeVisible();
 await page.reload();await expect(timeline.getByText('2 of 5 steps completed')).toBeVisible();
 await timeline.getByRole('button',{name:'Edit move date',exact:true}).click();await dialog.getByLabel('Move date',{exact:true}).fill('2027-11-20');await dialog.getByRole('button',{name:'Save details',exact:true}).click();
 await expect(timeline.getByText('Needs renewed review',{exact:true})).toHaveCount(1);await expect(timeline.getByText('1 of 5 steps completed')).toBeVisible();
 const protectionBeforeToggles=(await read()).protection;
 const expand=timeline.getByRole('button',{name:new RegExp(`^${first}`)});await expand.focus();await page.keyboard.press('Enter');await expect(expand).toHaveAttribute('aria-expanded','true');
 const link=timeline.getByRole('link',{name:'Read If’s moving guidance'});await expect(link).toHaveAttribute('href','https://www.if.fi/henkiloasiakkaat/vakuutukset/kotivakuutus/muuttaminen/muuttoilmoitus');await expect(link).toHaveAttribute('rel','noopener noreferrer');
 await timeline.getByRole('button',{name:`Complete: ${first}`,exact:true}).click();await expect(timeline.getByText('2 of 5 steps completed')).toBeVisible();
 await timeline.getByRole('button',{name:`Reopen: ${first}`,exact:true}).click();await expect(timeline.getByText('1 of 5 steps completed')).toBeVisible();
 const saved=await read();expect(saved.protectionTimeline?.records).toHaveLength(2);expect(saved.protectionTimeline?.records[0]?.history).toHaveLength(3);
 expect(saved.budget).toEqual(original.budget);expect(saved.tasks.map(t=>[t.id,t.status])).toEqual(original.tasks.map(t=>[t.id,t.status]));
 expect(saved.protection).toEqual(protectionBeforeToggles);
 await timeline.getByRole('button',{name:'Review home protection',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/app/p/${id}#protection$`));
 await expect(page.getByRole('region',{name:'If Smart Protection',exact:true})).toBeInViewport();
 expect(errors).toEqual([]);
});

for(const viewport of [{width:1440,height:1000},{width:390,height:844}])test(`native protection layout at ${viewport.width}px, keyboard and reduced motion`,async({page})=>{
 await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});
 const {id}=await create(page);
 await page.request.patch(`/api/projects/${id}`,{data:{preferences:{moveDate:'2027-11-15',origin:'Helsinki'}}});await page.reload();
 const timeline=page.getByRole('region',{name:'If Protection Timeline',exact:true});await expect(timeline).toBeVisible();
 const expand=timeline.getByRole('button',{name:new RegExp(`^${first}`)});await expand.focus();await page.keyboard.press('Enter');await expect(expand).toHaveAttribute('aria-expanded','true');
 await expect(timeline.getByText('Official If guidance · Finnish. Opening a link does not complete a review.')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 const rect=await timeline.boundingBox();expect(rect?.width).toBeLessThanOrEqual(viewport.width);
 await timeline.getByRole('button',{name:`Complete: ${first}`,exact:true}).click();await expect(timeline.getByText('1 of 5 steps completed')).toBeVisible();
 await timeline.getByRole('button',{name:'Complete: Protect belongings and keep documentation',exact:true}).click();await expect(timeline.getByText('2 of 5 steps completed')).toBeVisible();
 await expand.evaluate(el=>(el as HTMLElement).blur());
 await timeline.evaluate(el=>window.scrollTo({top:window.scrollY+el.getBoundingClientRect().top-135,behavior:'instant'}));
 await page.screenshot({path:`server/docs/protection-timeline/${viewport.width===390?'mobile':'desktop'}.png`});
 await expand.press('Enter');await expect(expand).toHaveAttribute('aria-expanded','false');
 await timeline.getByRole('button',{name:'Edit move date',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Plan details'});await expect(dialog).toBeVisible();await expect(dialog.getByLabel('Move date',{exact:true})).toHaveValue('2027-11-15');await expect(dialog.getByRole('button',{name:'Save details',exact:true})).toBeInViewport();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
});

test('other scenarios retain their existing timeline and postponed review stays optional',async({page})=>{
 for(const message of ['I want to travel to Rome with EUR 900','I want to buy a used car with EUR 4000']){
  await create(page,message);await expect(page.getByRole('region',{name:'If Protection Timeline',exact:true})).toHaveCount(0);
 }
 const {id,read}=await create(page);await page.request.patch(`/api/projects/${id}/protection`,{data:{product:'home',status:'dismissed'}});await page.reload();
 const timeline=page.getByRole('region',{name:'If Protection Timeline',exact:true});await expect(timeline.getByText(/You postponed home protection review/)).toBeVisible();
 await timeline.getByRole('button',{name:new RegExp(`^${first}`)}).click();await timeline.getByRole('button',{name:'Review when ready',exact:true}).click();
 await expect(page.getByRole('region',{name:'If Smart Protection',exact:true}).getByRole('button',{name:'Reopen',exact:true})).toBeVisible();expect((await read()).protection?.recommendations[0]?.status).toBe('dismissed');
});
