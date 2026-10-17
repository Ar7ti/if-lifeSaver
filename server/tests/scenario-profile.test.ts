import assert from 'node:assert/strict';
import test from 'node:test';
import {buildScenarioProfile} from '../src/scenario-profile.js';

test('moving profile respects owned furniture and a price is not a total budget', () => {
  const profile = buildScenarioProfile({message:'I am moving to Turku on 2027-04-05 from Helsinki. I already own my bed and desk. I saw a sofa for €250.'});
  assert.equal(profile.scenarioType,'moving');
  assert.equal(profile.location,'Turku, Finland');
  assert.equal(profile.budgetMinor,null);
  assert.equal(profile.preferences.moveDate,'2027-04-05');
  assert.equal(profile.preferences.origin,'Helsinki');
  assert.deepEqual(profile.preferences.ownedItems?.sort(),['bed','desk']);
  assert.ok(!profile.categories.some(c=>c.id==='bed' || c.id==='furniture'));
  assert.ok(profile.categories.every(c=>c.reason));
  assert.ok(profile.questions.length<=3);
});

test('travel profile extracts stay length and travelers without furniture', () => {
  const profile=buildScenarioProfile({message:'Plan a trip to Paris for 5 nights from 2027-05-02 with 2 travelers and a budget of €1,500. Include museum activities.'});
  assert.equal(profile.scenarioType,'travel');
  assert.equal(profile.location,'Paris');
  assert.equal(profile.preferences.startDate,'2027-05-02');
  assert.equal(profile.preferences.endDate,'2027-05-07');
  assert.equal(profile.preferences.durationDays,6);
  assert.equal(profile.preferences.travelers,2);
  assert.equal(profile.budgetMinor,150000);
  assert.deepEqual(profile.categories.map(c=>c.id),['transport','accommodation','food','activities']);
  assert.ok(!profile.tasks.some(t=>/mov|furniture|bed/i.test(t.title)));
  assert.ok(!profile.questions.some(q=>/traveling|budget|when/i.test(q)));
});

test('car purchase profile has vehicle costs rather than movers', () => {
  const profile=buildScenarioProfile({message:'I want to buy a used car for commuting, budget €8,000.'});
  assert.equal(profile.scenarioType,'car_purchase');
  assert.deepEqual(profile.categories.map(c=>c.id),['vehicle','running_costs','inspection','registration']);
  assert.ok(profile.widgetTypes.includes('product_catalog'));
  assert.ok(!profile.categories.some(c=>/moving|furniture/.test(c.id)));
});

test('furnishing profile excludes owned items and scopes delivery and assembly', () => {
  const profile=buildScenarioProfile({message:'Furnish my apartment. I already own a bed and desk, but need a sofa with delivery and assembly.'});
  assert.equal(profile.scenarioType,'home_furnishing');
  assert.deepEqual(profile.categories.map(c=>c.id),['sofa','delivery','assembly']);
  assert.ok(!profile.categories.some(c=>c.id==='bed'||c.id==='desk'));
});

test('student and generic profiles include only stated needs', () => {
  const student=buildScenarioProfile({message:'I am a university student planning a dorm room and bus commute.'});
  assert.equal(student.scenarioType,'student_life');
  assert.deepEqual(student.categories.map(c=>c.id),['education','housing','logistics']);
  const generic=buildScenarioProfile({message:'Plan a graduation party'});
  assert.equal(generic.scenarioType,'other');
  assert.deepEqual(generic.categories.map(c=>c.id),['general']);
  assert.ok(!generic.widgetTypes.includes('service_finder'));
});

test('persisted answers and notes suppress repeated questions', () => {
  const initial=buildScenarioProfile({message:'Plan a trip to Paris'});
  const profile=buildScenarioProfile({message:'Plan a trip to Paris',preferences:{...initial.preferences,startDate:'2027-05-02',travelers:2,notes:'Budget: €1000. Q: Where are you traveling? A: Paris.'}});
  assert.ok(!profile.questions.some(q=>/when|travelers|budget|where/i.test(q)));
});

test('travel route and word duration are extracted from the stated goal', () => {
  const profile=buildScenarioProfile({message:'I want to travel from Helsinki to Rome for five days with a budget of €900'});
  assert.equal(profile.scenarioType,'travel');
  assert.equal(profile.location,'Rome');
  assert.equal(profile.preferences.origin,'Helsinki');
  assert.equal(profile.preferences.durationDays,5);
  assert.equal(profile.budgetMinor,90000);
});

test('car ceiling, location, condition, and vehicle description are grounded', () => {
  const profile=buildScenarioProfile({message:'buy a reliable used car in Finland under €4,000'});
  assert.equal(profile.scenarioType,'car_purchase');
  assert.equal(profile.budgetMinor,400000);
  assert.equal(profile.location,'Finland');
  assert.equal(profile.preferences.allowUsed,true);
  assert.match(profile.preferences.vehicleType ?? '',/reliable used car/i);
});

test('a standalone course goal is student life and saved null preferences remain unknown', () => {
  const course=buildScenarioProfile({message:'find programming course'});
  assert.equal(course.scenarioType,'student_life');
  const travel=buildScenarioProfile({message:'travel from Helsinki to Rome for five days'});
  const rebuilt=buildScenarioProfile({message:'travel from Helsinki to Rome for five days',preferences:{...travel.preferences,origin:null,durationDays:null}});
  assert.equal(rebuilt.preferences.origin,null);
  assert.equal(rebuilt.preferences.durationDays,null);
});

test('widgets expose supported decisions without adding unrelated catalogs', () => {
  const moving=buildScenarioProfile({message:'Move to Turku with €2,000. I already own all my furniture.'});
  assert.ok(moving.widgetTypes.includes('shopping_cart'));
  assert.ok(moving.widgetTypes.includes('risk_guardian'));
  assert.ok(moving.widgetTypes.includes('scenario_comparison'));
  assert.ok(!moving.widgetTypes.includes('product_catalog'));
  const travel=buildScenarioProfile({message:'Travel to Rome with a budget of €900'});
  assert.ok(travel.widgetTypes.includes('shopping_cart'));
  assert.ok(travel.widgetTypes.includes('risk_guardian'));
  assert.ok(!travel.widgetTypes.includes('product_catalog'));
  const furnishing=buildScenarioProfile({message:'Furnish a room with a sofa and assembly.'});
  assert.ok(furnishing.widgetTypes.includes('service_finder'));
  assert.ok(furnishing.widgetTypes.length<9);
});

test('a day trip or already arranged accommodation does not allocate another stay',()=>{
  const day=buildScenarioProfile({message:'Plan a day trip to Rome with €100'});
  assert.equal(day.scenarioType,'travel');assert.ok(!day.categories.some(c=>c.id==='accommodation'));
  const booked=buildScenarioProfile({message:'Travel to Rome with €900. My hotel is already booked.'});
  assert.ok(!booked.categories.some(c=>c.id==='accommodation'));
});

test('a known trip duration still asks for missing departure dates',()=>{
  const profile=buildScenarioProfile({message:'Travel from Helsinki to Rome for five days with €900'});
  assert.ok(profile.questions.some(q=>/when|start/i.test(q)));assert.ok(!profile.questions.some(q=>/how long/i.test(q)));
});

test('explicitly edited owned inventory overrides the original stated inventory',()=>{
 const first=buildScenarioProfile({message:'Moving to Turku with €2000. I own a bed and desk.'});
 const changed=buildScenarioProfile({message:'Moving to Turku with €2000. I own a bed and desk.',preferences:{...first.preferences,ownedItems:[]}});
 assert.deepEqual(changed.preferences.ownedItems,[]);
});
