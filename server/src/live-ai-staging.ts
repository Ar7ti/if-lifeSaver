import {buildApp} from './app.js';
import {liveStagingConfig} from './live-ai-staging-config.js';

async function main(){
 const config=liveStagingConfig(process.env);
 const app=await buildApp({config});
 process.once('SIGTERM',()=>{void app.close();});process.once('SIGINT',()=>{void app.close();});
 await app.listen({host:config.host,port:config.port});
}
main().catch(()=>{console.error('Live AI staging refused to start. Check isolated environment, dedicated credentials, volume, origins, and reviewed cost controls.');process.exitCode=1;});
