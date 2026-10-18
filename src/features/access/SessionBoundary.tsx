import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ensureAccess, retryAccess, useAccess, accessAction, refreshAccess } from '@/api/access';
import { useSettings } from '@/stores/settings';
import { Button } from '@/components/ui/Button';

export function SessionBoundary({children}:{children:ReactNode}){
  const {pathname}=useLocation();
  const source=useSettings(s=>s.dataSource);
  const state=useAccess(s=>s.state);
  const error=useAccess(s=>s.error);
  const qc=useQueryClient();
  const active=source==='live'&&(pathname.startsWith('/app')||pathname==='/create');
  useEffect(()=>{const clear=()=>qc.clear();window.addEventListener('lifesim:identity',clear);return()=>window.removeEventListener('lifesim:identity',clear);},[qc]);
  useEffect(()=>{if(active&&state==='idle')void ensureAccess().catch(()=>{});},[active,state]);
  useEffect(()=>{
    if(!active)return;
    const refresh=()=>{void refreshAccess();};
    window.addEventListener('focus',refresh);
    return()=>window.removeEventListener('focus',refresh);
  },[active]);
  if(active&&state!=='ready')return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6" role="status">
      <h1 className="text-heading-sm font-semibold">{state==='error'?'Unable to connect':'Opening your private workspace'}</h1>
      <p className="text-body-sm text-graphite">{state==='error'?error?.message:'Establishing your session…'}</p>
      {state==='error'&&<>
        <Button onClick={()=>void retryAccess().catch(()=>{})}>Reconnect</Button>
        <Button variant="outline" onClick={()=>useSettings.getState().setDataSource('mock')}>Use offline demo</Button>
      </>}
    </main>
  );
  return children;
}
export function AccessStatus(){
  const info=useAccess(s=>s.info);
  if(info?.mode!=='public'||!info.usage)return null;
  const label=info.session?.role==='admin'
    ? 'Administrator session · separate daily AI safety budget'
    : info.usage.publicAiEnabled
      ? `${info.usage.remaining} of ${info.usage.limit} free AI provider calls remaining today · resets at 00:00 UTC`
      : 'Public paid AI is paused. Saved workspaces and manual tools remain available.';
  return <div className="border-b border-hairline px-4 py-2 text-caption text-graphite" role="status">
    {label}<span className="block">Private to this browser. Clearing cookies can permanently lose access.</span>
  </div>;
}
export function AccessSettings(){
  const info=useAccess(s=>s.info);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  if(info?.mode!=='public')return null;
  const act=async(path:string,body:unknown={},method='POST')=>{
    setBusy(true);setError('');
    try{await accessAction(path,body,method);}
    catch(e){setError(e instanceof Error?e.message:'Unable to complete the request.');}
    finally{setBusy(false);}
  };
  return <section className="card flex flex-col gap-3 p-5">
    <h2 className="text-heading-sm font-semibold">Private session</h2>
    <p className="text-body-sm text-graphite">Your workspaces belong to this browser session. Clearing cookies or starting a new session can permanently lose access. Workspace links alone cannot restore access.</p>
    <Button disabled={busy} variant="outline" onClick={()=>void act('/session/renew')}>
      {info.session?.role==='admin'?'Rotate admin session cookie':'Extend this session'}
    </Button>
    <details open={info.session?.role==='admin'||undefined}>
      <summary className="cursor-pointer text-body-sm font-medium">Administrator access</summary>
      {info.session?.role==='admin'?(
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={()=>void act('/admin/logout')}>Sign out of administration</Button>
          <Button disabled={busy} variant="outline" onClick={()=>void act('/admin/public-ai',{enabled:!info.usage?.publicAiEnabled},'PATCH')}>
            {info.usage?.publicAiEnabled?'Pause public AI':'Enable public AI'}
          </Button>
        </div>
      ):(
        <form className="mt-3 flex flex-col gap-3" onSubmit={e=>{
          e.preventDefault();const form=e.currentTarget;
          const key=String(new FormData(form).get('admin-key')??'');
          form.reset();void act('/admin/login',{key});
        }}>
          <label className="text-body-sm">Private administrator key
            <input name="admin-key" type="password" autoComplete="off" required minLength={32} className="mt-1 block w-full rounded-button border border-hairline bg-surface px-3 py-2"/>
          </label>
          <Button disabled={busy} type="submit">Sign in</Button>
        </form>
      )}
    </details>
    {error&&<p role="alert" className="text-body-sm text-danger-ink">{error}</p>}
  </section>;
}
