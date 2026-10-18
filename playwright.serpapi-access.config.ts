import {defineConfig} from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
const dir=path.join(os.tmpdir(),`lifesim-serpapi-public-${process.pid}`);
export default defineConfig({testDir:'tests/serpapi-access',outputDir:path.join(dir,'results'),workers:1,timeout:30000,use:{baseURL:'http://127.0.0.1:5203',viewport:{width:1440,height:1000},trace:'retain-on-failure'},webServer:[
 {command:'./server/node_modules/.bin/tsx server/src/index.ts',url:'http://127.0.0.1:3103/api/health',reuseExistingServer:false,env:{HOST:'127.0.0.1',PORT:'3103',AI_MODE:'local',RESEARCH_MODE:'unavailable',STORAGE_MODE:'local',DATA_DIR:dir,SECURITY_DB_PATH:path.join(dir,'security.sqlite'),LOG_LEVEL:'silent',ALLOWED_ORIGINS:'http://127.0.0.1:5203',PUBLIC_ACCESS_ENABLED:'true',PUBLIC_AI_ENABLED:'false',SESSION_COOKIE_SECURE:'false',ADMIN_ACCESS_KEY:'synthetic-test-only-serpapi-admin'}},
 {command:'npm run dev -- --host 127.0.0.1 --port 5203 --strictPort',url:'http://127.0.0.1:5203',reuseExistingServer:false,env:{LIFE_SIM_API:'http://127.0.0.1:3103',VITE_API_BASE:'/api'}}
]});
