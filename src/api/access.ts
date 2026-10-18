import { create } from 'zustand';
import { SessionResponseSchema, ProjectListResponseSchema, type SessionResponse } from '@contracts';
import { useProjects, setPublicProjectMode } from '@/stores/projects';
import { useAssistant } from '@/stores/assistant';
import { useSettings } from '@/stores/settings';
import { ApiError } from './types';

const BASE=(import.meta.env.VITE_API_BASE as string|undefined)?.replace(/\/$/,'')??'/api';
export const useAccess=create<{state:'idle'|'loading'|'ready'|'error';info:SessionResponse|null;error:Error|null}>(()=>({state:'idle',info:null,error:null}));
let bootstrap:Promise<SessionResponse>|null=null;
const identityChannel=typeof window!=='undefined'&&'BroadcastChannel' in window?new BroadcastChannel('lifesim-access'):null;
function sessionResponse(value:unknown){
  const parsed=SessionResponseSchema.safeParse(value);
  if(!parsed.success)throw new ApiError('CONTRACT_MISMATCH','The app and service versions do not match. Ask the administrator to update both.',502);
  return parsed.data;
}
async function call(path:string,method='GET',body?:unknown){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const csrf=useAccess.getState().info?.csrfToken;
    const r=await fetch(BASE+path,{method,credentials:'same-origin',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:controller.signal});
    const data=await r.json().catch(()=>null);
    if(!r.ok)throw new ApiError(data?.error?.code??'NETWORK',data?.error?.message??'Unable to connect to the service.',r.status);
    return data;
  }finally{clearTimeout(timer);}
}
function clearPrivateCache(){
  useProjects.setState(s=>({projects:s.projects.filter(p=>p.source!=='live')}));
  useAssistant.setState({threads:{},drafts:{}});
  window.dispatchEvent(new Event('lifesim:identity'));
}
export async function ensureAccess():Promise<SessionResponse>{
  const current=useAccess.getState();
  if(current.state==='ready'&&current.info)return current.info;
  if(current.state==='error')throw current.error;
  if(bootstrap)return bootstrap;
  useAccess.setState({state:'loading',error:null});
  bootstrap=(async()=>{
    let info=sessionResponse(await call('/session'));
    setPublicProjectMode(info.mode==='public');
    if(info.mode==='public'){
      useSettings.getState().setApiToken('');
      clearPrivateCache();
      if(new URL(BASE,window.location.origin).origin!==window.location.origin)throw new Error('Public sessions require the same-origin /api proxy. Ask the administrator to check deployment routing.');
      if(!info.session)info=sessionResponse(await call('/session','POST',{}));
      if(!info.session)throw new Error('A private session could not be established.');
      useAccess.setState({info});
      const list=ProjectListResponseSchema.parse(await call('/projects'));
      useProjects.setState(s=>({projects:[...s.projects.filter(p=>p.source!=='live'),...list.projects.map(p=>({...p,source:'live' as const}))]}));
    }
    useAccess.setState({state:'ready',info,error:null});return info;
  })().catch(error=>{useAccess.setState({state:'error',error:error instanceof Error?error:new Error('Unable to initialize your session.')});throw error;}).finally(()=>{bootstrap=null;});
  return bootstrap;
}
export function retryAccess(){clearPrivateCache();useAccess.setState({state:'idle',info:null,error:null});return ensureAccess();}
export async function refreshAccess(){
  if(useAccess.getState().info?.mode!=='public')return;
  try{
    const info=sessionResponse(await call('/session'));
    if(!info.session){clearPrivateCache();useAccess.setState({state:'error',info,error:new Error('Your private session expired. Reconnect to start a new session. Previous workspaces will not be reassigned.')});}
    else if(info.session.id!==useAccess.getState().info?.session?.id){
      clearPrivateCache();useAccess.setState({state:'idle',info:null});
    }else useAccess.setState({info});
  }catch{/* The actual operation remains the source of success/failure; no background retry loop. */}
}
export async function accessAction(path:string,body:unknown={},method='POST'){
  await call(path,method,body);identityChannel?.postMessage('changed');clearPrivateCache();useAccess.setState({state:'idle',info:null});return ensureAccess();
}
if(identityChannel)identityChannel.onmessage=()=>{void refreshAccess();};
