import { buildApp } from './app.js';
import { loadConfig } from './config.js';

async function main() {
  const config=loadConfig();
  const app=await buildApp({config});
  const stop=async()=>{await app.close();};
  process.once('SIGTERM',()=>{void stop();});
  process.once('SIGINT',()=>{void stop();});
  await app.listen({host:config.host,port:config.port});
}
main().catch(error=>{
  // Environment errors contain field names only; provider credentials are never logged.
  console.error(error instanceof Error && error.message.startsWith('Invalid server environment')?error.message:'Backend failed to start. Check server environment and data directory permissions.');
  process.exitCode=1;
});
