import {test,expect} from '@playwright/test';
import type {LifeProject} from '../../shared/contracts/index';
const cases=[
 {name:'moving',message:"I'm moving to Turku with a budget of €2,000. I already have a bed and desk.",scenario:'moving',budget:200000,starter:'Moving company',forbidden:/furniture|\bbed\b|\bdesk\b/i},
 {name:'travel',message:'I want to travel from Helsinki to Rome for five days with a budget of €900.',scenario:'travel',budget:90000,starter:'Accommodation',forbidden:/furniture|moving|\bbed\b/i},
 {name:'car purchase',message:'I want to buy a reliable used car in Finland under €4,000.',scenario:'car_purchase',budget:400000,starter:'Reliable used car',forbidden:/furniture|moving/i},
];
for(const c of cases)test(`${c.name}: real creation, details, research, cart, assistant and refresh`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/app/new');await page.getByRole('textbox',{name:'What are you planning?',exact:true}).fill(c.message);await page.getByRole('button',{name:'Create my workspace',exact:true}).click();
 await expect(page).toHaveURL(/\/app\/p\/[a-f0-9-]+$/,{timeout:20000});
 const id=page.url().split('/').at(-1)!;const base=`/api/projects/${id}`;
 const read=async()=> (await (await page.request.get(base)).json()).project as LifeProject;
 let project=await read();expect(project.scenarioType).toBe(c.scenario);expect(project.budget.totalMinor).toBe(c.budget);expect(project.budget.committedMinor).toBe(0);
 expect(project.budget.categories.every(x=>!c.forbidden.test(x.id))).toBeTruthy();expect(project.questions.every(q=>!c.forbidden.test(q))).toBeTruthy();
 if(c.scenario==='travel'){expect(project.preferences.origin).toBe('Helsinki');expect(project.location).toBe('Rome');expect(project.preferences.durationDays).toBe(5);expect(project.workspace.widgets.some(w=>w.type==='product_catalog')).toBeFalsy();}
 if(c.scenario==='moving')expect(project.preferences.ownedItems).toEqual(expect.arrayContaining(['bed','desk']));
 await page.getByRole('button',{name:'Edit details',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Plan details'});await expect(dialog).toBeVisible();
 if(c.scenario==='travel'){await dialog.getByLabel('Departure date',{exact:true}).fill('2027-05-10');await dialog.getByLabel('Travelers',{exact:true}).fill('2');}
 else if(c.scenario==='car_purchase')await dialog.getByLabel('Primary use',{exact:true}).fill('Daily commute');
 else await dialog.getByLabel('Move date',{exact:true}).fill('2027-05-10');
 await dialog.getByRole('button',{name:'Save details',exact:true}).click();await expect(dialog).not.toBeVisible();
 const found=page.waitForResponse(r=>r.url().endsWith('/research')&&r.request().method()==='POST');await page.getByRole('button',{name:c.starter,exact:true}).click();const result=await (await found).json();expect(result.mode).toBe('demo');expect(result.offers.length).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Add to plan',exact:true}).first().click();await expect.poll(async()=>(await read()).cart.length).toBe(1);
 project=await read();expect(project.budget.remainingMinor).toBe(c.budget-project.budget.committedMinor);expect(project.scenarios).toHaveLength(3);
 await page.getByRole('button',{name:'Ask assistant',exact:true}).first().click();const chat=page.getByRole('textbox',{name:'Message the assistant'});await chat.fill('Teach me Python programming.');await chat.press('Enter');await expect(page.getByText(/general programming tutorials are outside/)).toBeVisible();
 await chat.fill('Find cheaper options');await chat.press('Enter');await expect.poll(async()=>(await read()).actions.length).toBeGreaterThan(0);
 project=await read();const action=project.actions.at(-1)!;expect(action.status).toBe('proposed');expect(action.requiresConfirmation).toBe(true);expect(project.cart).toHaveLength(1);
 await page.reload();await expect(page.getByRole('heading',{name:project.title,exact:true})).toBeVisible();expect((await read()).cart).toHaveLength(1);expect(errors).toEqual([]);
 await expect.poll(()=>page.locator('#w-budget').evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(1);
 await page.screenshot({path:`test-results/${c.scenario}-workspace.png`,fullPage:false});
});

test('travel question form saves structured answers across reload',async({page})=>{
 const response=await page.request.post('/api/projects',{data:{message:'Plan a trip to Paris with €1,500',locale:'en'}});expect(response.status()).toBe(201);
 const {project}=await response.json();const base=`/api/projects/${project.id}`;
 await page.goto(`/app/p/${project.id}`);const questions=page.locator('#questions');
 await questions.getByLabel('Start date',{exact:true}).fill('2027-06-10');await questions.getByLabel('Days',{exact:true}).fill('5');
 await questions.getByRole('button',{name:'Save and continue',exact:true}).click();
 await expect.poll(async()=>((await (await page.request.get(base)).json()).project.preferences.startDate)).toBe('2027-06-10');
 await expect(questions.getByLabel('Travelers',{exact:true})).toBeVisible();await questions.getByLabel('Travelers',{exact:true}).fill('2');await questions.getByRole('button',{name:/Save answer|Save and continue/}).click();
 await expect.poll(async()=>((await (await page.request.get(base)).json()).project.preferences.travelers)).toBe(2);
 await page.reload();await expect(page.getByRole('heading',{name:'Trip to Paris',exact:true})).toBeVisible();
 const saved=(await (await page.request.get(base)).json()).project as LifeProject;expect(saved.preferences.durationDays).toBe(5);expect(Object.keys(saved.answeredQuestions??{})).toHaveLength(2);expect(saved.questions).toEqual([]);
 await expect(questions.getByText(/All questions answered/)).toBeVisible();
});
