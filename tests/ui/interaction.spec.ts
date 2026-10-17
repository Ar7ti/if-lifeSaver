import {test,expect,type Page} from '@playwright/test';
import type {LifeProject} from '../../shared/contracts/index';
const id='00000000-0000-4000-8000-000000000001';
const now='2026-10-17T10:00:00.000Z';
function fixture():LifeProject{return {
 id,revision:0,title:'Moving to Turku',scenarioType:'moving',location:'Turku, Finland',locale:'en',originalMessage:'Moving to Turku with 2000 euros',status:'planning',
 preferences:{moveDate:null,origin:null,householdSize:null,deliveryRequired:null,allowUsed:null,priorities:[],notes:''},assumptions:[],confirmedFacts:[],questions:[],
 budget:{totalMinor:200000,currency:'EUR',confirmed:true,categories:[{id:'moving',title:'Moving',allocatedMinor:180000,committedMinor:0,proposedMinor:0}],emergencyReserveMinor:20000,allocatedMinor:180000,committedMinor:0,proposedMinor:0,remainingMinor:200000,availableMinor:180000,warnings:[]},
 cart:[],tasks:[{id:'00000000-0000-4000-8000-000000000003',title:'Confirm addresses',category:'moving',status:'todo',dueDate:null,origin:'template',notes:''}],
 workspace:{id:'00000000-0000-4000-8000-000000000002',version:1,title:'Moving plan',updatedAt:now,widgets:[{id:'00000000-0000-4000-8000-000000000004',type:'budget',title:'Budget',position:{x:0,y:0,w:6,h:4},visible:true,dataRef:'budget',config:{}},{id:'00000000-0000-4000-8000-000000000005',type:'task_list',title:'Checklist',position:{x:6,y:0,w:6,h:4},visible:true,dataRef:'tasks',config:{}}]},researchResults:[],risks:[],scenarios:[],actions:[],recommendations:[],aiMode:'local',createdAt:now,updatedAt:now,
};}
async function openProject(page:Page){
 let project=fixture();const writes:string[]=[];
 await page.route('**/api/**',async route=>{
  const request=route.request();const url=new URL(request.url());
  if(!url.pathname.startsWith('/api/'))return route.continue();
  let body:unknown={project};
  if(url.pathname==='/api/health')body={status:'ok',ready:true,contractVersion:'1.1.0',configuration:{ai:'local',research:'unavailable',storage:'memory',authentication:false}};
  else if(request.method()==='POST'&&url.pathname.endsWith('/assistant')){writes.push('assistant');body={reply:'Please review your plan.',proposedActions:[],workspacePatch:null};}
  else if(request.method()==='PATCH'){writes.push(url.pathname);const patch=request.postDataJSON();project={...project,preferences:{...project.preferences,...patch.preferences},revision:project.revision+1};body={project};}
  await route.fulfill({json:body});
 });
 await page.goto(`/app/p/${id}`);await expect(page.getByRole('heading',{name:'Moving to Turku',exact:true})).toBeVisible();
 return writes;
}

test('chat typing, navigation keys, newline, undo and IME stay local',async({page})=>{
 const writes=await openProject(page);await page.getByRole('button',{name:'Ask assistant',exact:true}).first().click();
 const chat=page.getByRole('textbox',{name:'Message the assistant'});await chat.focus();
 await page.keyboard.type('A long planning message 123 with spaces.');
 await expect(chat).toHaveValue('A long planning message 123 with spaces.');
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('Backspace');await expect(chat).toHaveValue('A long planning message 123 with space.');
 // macOS maps End to "scroll to end of document"; end-of-line is Cmd+Right there.
 await page.keyboard.press(process.platform==='darwin'?'Meta+ArrowRight':'End');await page.keyboard.press('Shift+Enter');await page.keyboard.type('Second line');
 await expect(chat).toHaveValue(/\nSecond line$/);expect(writes).toEqual([]);
 await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('replacement');await page.keyboard.press('ControlOrMeta+Z');
 await expect(chat).not.toHaveValue('replacement');
 const before=await chat.inputValue();
 await chat.dispatchEvent('compositionstart',{data:''});await chat.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,keyCode:229});await chat.dispatchEvent('compositionend',{data:'日'});
 await expect(chat).toHaveValue(before);expect(writes).toEqual([]);
 await page.keyboard.press('Escape');await expect(chat).toBeFocused();
 await chat.fill('Compare my current options');await page.keyboard.press('Enter');
 await expect(page.getByText('Please review your plan.',{exact:true})).toBeVisible();expect(writes).toEqual(['assistant']);
 await expect(page).toHaveURL(new RegExp(`/app/p/${id}$`));
});

test('global handlers ignore editable and rich input roles without cancelling browser shortcuts',async({page})=>{
 await openProject(page);
 const result=await page.evaluate(async()=>{
  const {isEditableKeyboardEvent}=await import('/src/lib/keyboard.ts');
  const controls=['input','textarea','select','div[contenteditable]','div[role=textbox]','div[role=searchbox]','div[role=combobox]'];
  return controls.map(spec=>{const tag=spec.split('[')[0]!;const el=document.createElement(tag);if(spec.includes('contenteditable'))el.setAttribute('contenteditable','true');const role=/role=(\w+)/.exec(spec)?.[1];if(role)el.setAttribute('role',role);document.body.appendChild(el);let ignored=false;el.addEventListener('keydown',e=>{ignored=isEditableKeyboardEvent(e);});const e=new KeyboardEvent('keydown',{key:'c',ctrlKey:true,bubbles:true,cancelable:true});el.dispatchEvent(e);el.remove();return {spec,ignored,prevented:e.defaultPrevented};});
 });
 expect(result.every(r=>r.ignored&&!r.prevented)).toBeTruthy();
});

for(const viewport of [{width:1440,height:900},{width:768,height:600},{width:390,height:640},{width:390,height:360}]){
 test(`Edit Details stays within ${viewport.width}x${viewport.height} with reachable actions`,async({page})=>{
  await page.setViewportSize(viewport);const writes=await openProject(page);
  await page.getByRole('button',{name:'Edit details',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Plan details'});await expect(dialog).toBeVisible();
  const bounds=await dialog.boundingBox();expect(bounds).not.toBeNull();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(viewport.width+1);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(viewport.height+1);
  if(viewport.width>=768)expect(bounds!.width).toBeGreaterThanOrEqual(700);
  const body=dialog.locator(':scope > div');await body.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await expect(dialog.getByRole('button',{name:'Save details',exact:true})).toBeInViewport();await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeInViewport();
  await page.screenshot({path:`test-results/details-${viewport.width}x${viewport.height}.png`});
  await dialog.getByRole('textbox',{name:'Destination',exact:true}).fill('Helsinki, Finland');
  await dialog.getByRole('button',{name:'Save details',exact:true}).click();await expect(dialog).not.toBeVisible();expect(writes).toHaveLength(1);
 });
}
