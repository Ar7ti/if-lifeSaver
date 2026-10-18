import os from 'node:os';
import path from 'node:path';
import {defineConfig} from '@playwright/test';
export default defineConfig({outputDir:path.join(os.tmpdir(),`lifesim-products-browser-${process.pid}`),testDir:'tests/products',workers:1,fullyParallel:false,timeout:30000,use:{baseURL:'http://127.0.0.1:5198',viewport:{width:1440,height:1000},trace:'retain-on-failure'},webServer:[{command:'PRODUCT_UI_FIXTURE=true ./server/node_modules/.bin/tsx server/scripts/product-ui-fixture.ts',url:'http://127.0.0.1:3098/api/health',reuseExistingServer:false},{command:'LIFE_SIM_API=http://127.0.0.1:3098 npm run dev -- --host 127.0.0.1 --port 5198 --strictPort',url:'http://127.0.0.1:5198',reuseExistingServer:false}]});
