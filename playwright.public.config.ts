import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
const dir=path.join(os.tmpdir(),`lifesim-public-browser-${process.pid}`);
export default defineConfig({
  testDir:'tests/public',outputDir:path.join(dir,'browser-results'),timeout:45000,workers:1,fullyParallel:false,
  use:{baseURL:'http://127.0.0.1:5186',viewport:{width:1440,height:900},trace:'retain-on-failure'},
  webServer:[
    {command:'npm run dev --prefix server',url:'http://127.0.0.1:3016/api/health',reuseExistingServer:false,env:{HOST:'127.0.0.1',PORT:'3016',AI_MODE:'local',RESEARCH_MODE:'demo',STORAGE_MODE:'local',DATA_DIR:dir,SECURITY_DB_PATH:path.join(dir,'security.sqlite'),LOG_LEVEL:'silent',ALLOWED_ORIGINS:'http://127.0.0.1:5186',PUBLIC_ACCESS_ENABLED:'true',PUBLIC_AI_ENABLED:'false',SESSION_COOKIE_SECURE:'false',ADMIN_ACCESS_KEY:'public-browser-fixture-key-not-for-deployment'}},
    {command:'npm run dev -- --host 127.0.0.1 --port 5186 --strictPort',url:'http://127.0.0.1:5186',reuseExistingServer:false,env:{LIFE_SIM_API:'http://127.0.0.1:3016',VITE_API_BASE:'/api'}},
  ],
});
