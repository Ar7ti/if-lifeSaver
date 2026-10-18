import os from 'node:os';
import path from 'node:path';
import {defineConfig} from '@playwright/test';
export default defineConfig({outputDir:path.join(os.tmpdir(),`lifesim-research-v2-browser-${process.pid}`),testDir:'tests/research-v2',workers:1,fullyParallel:false,timeout:30000,use:{baseURL:'http://127.0.0.1:5197',viewport:{width:1440,height:1000},trace:'retain-on-failure'},webServer:[{command:'RESEARCH_V2_UI_FIXTURE=true ./server/node_modules/.bin/tsx server/scripts/research-v2-ui-fixture.ts',url:'http://127.0.0.1:3097/api/health',reuseExistingServer:false},{command:'LIFE_SIM_API=http://127.0.0.1:3097 npm run dev -- --host 127.0.0.1 --port 5197 --strictPort',url:'http://127.0.0.1:5197',reuseExistingServer:false}]});
