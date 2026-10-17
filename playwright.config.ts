import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/ui',timeout:30000,fullyParallel:false,workers:1,
  use:{baseURL:'http://127.0.0.1:5174',viewport:{width:1440,height:900},trace:'retain-on-failure'},
  webServer:[{command:'PORT=3002 AI_MODE=local RESEARCH_MODE=demo STORAGE_MODE=memory LOG_LEVEL=silent ALLOWED_ORIGINS=http://127.0.0.1:5174 npm run dev --prefix server',url:'http://127.0.0.1:3002/api/health',reuseExistingServer:true},{command:'LIFE_SIM_API=http://127.0.0.1:3002 npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',url:'http://127.0.0.1:5174',reuseExistingServer:true}],
});
