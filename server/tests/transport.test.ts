import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { buildApp } from '../src/app.js';
import { createPlanner } from '../src/ai.js';
import { loadConfig } from '../src/config.js';

// Reproduces the socket closure found during the live model smoke test. Fastify
// injection does not use TCP and cannot catch this class of connection timeout.
test('HTTP project creation survives an upstream response taking longer than ten seconds',{timeout:20000},async t=>{
  const planner=createPlanner({mode:'local',model:'unused',timeoutMs:60000});
  const app=await buildApp({
    config:loadConfig({AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'memory',LOG_LEVEL:'silent'}),
    planner:{...planner,async createProject(input){await delay(11000);return planner.createProject(input);}},
  });
  t.after(()=>app.close());
  const address=await app.listen({host:'127.0.0.1',port:0});
  const response=await fetch(`${address}/api/projects`,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({message:'Moving to Turku with a budget of 2000 euros',locale:'en'}),
    signal:AbortSignal.timeout(15000),
  });
  assert.equal(response.status,201);
  const body=await response.json();
  assert.equal(body.project.budget.totalMinor,200000);
  assert.ok(body.workspace.widgets.some((widget:{type:string})=>widget.type==='service_finder'));
  assert.ok(!body.workspace.widgets.some((widget:{type:string})=>widget.type==='product_catalog'));
});
