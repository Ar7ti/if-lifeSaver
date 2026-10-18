import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Toaster } from '@/components/ui/Toaster';
import { Landing } from '@/features/landing/Landing';
import { NotFound } from '@/features/pages/NotFound';
import { SessionBoundary } from '@/features/access/SessionBoundary';

// The landing page ships first; the app (API client, contracts, widgets) loads on demand.
const AppShell = lazy(() => import('@/features/shell/AppShell').then(m => ({ default: m.AppShell })));
const Dashboard = lazy(() => import('@/features/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const NewProject = lazy(() => import('@/features/pages/NewProject').then(m => ({ default: m.NewProject })));
const MyProjects = lazy(() => import('@/features/pages/MyProjects').then(m => ({ default: m.MyProjects })));
const MyProtection = lazy(() => import('@/features/pages/MyProtection').then(m => ({ default: m.MyProtection })));
const Settings = lazy(() => import('@/features/pages/Settings').then(m => ({ default: m.Settings })));
const CreateWorkspace = lazy(() => import('@/features/create/CreateWorkspace').then(m => ({ default: m.CreateWorkspace })));
const WorkspacePage = lazy(() => import('@/features/workspace/WorkspacePage').then(m => ({ default: m.WorkspacePage })));

function Loading() {
  return (
    <div className="grid min-h-[60dvh] place-items-center text-graphite" role="status">
      <Loader2 className="size-5 animate-spin" aria-label="Loading" />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SessionBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/create" element={<CreateWorkspace />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="new" element={<NewProject />} />
            <Route path="projects" element={<MyProjects />} />
            <Route path="p/:projectId" element={<WorkspacePage />} />
            <Route path="settings" element={<Settings />} />
            <Route path="protection" element={<MyProtection />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Toaster />
      </SessionBoundary>
    </BrowserRouter>
  );
}
