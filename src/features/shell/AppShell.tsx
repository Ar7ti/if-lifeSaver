import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FolderKanban, LayoutDashboard, LayoutGrid, PanelLeftClose, PanelLeftOpen, Plus, Settings as SettingsIcon, Home, ChevronUp } from 'lucide-react';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useUi } from '@/stores/ui';
import { useProjects } from '@/stores/projects';
import { useSettings } from '@/stores/settings';
import { Logo, LogoMark } from './Logo';
import { DataSourceBanner } from './DataSourceBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

function useNavItems(): NavItem[] {
  const source = useSettings(s => s.dataSource);
  const recent = useProjects(s => s.projects.find(p => p.source === source));
  const items: NavItem[] = [
    { to: '/app', label: 'Dashboard', icon: <LayoutDashboard />, end: true },
    { to: '/app/new', label: 'New life project', icon: <Plus /> },
    { to: '/app/projects', label: 'My projects', icon: <FolderKanban /> },
  ];
  // "Active workspace" only appears when there is one to open; no dead links.
  if (recent) items.push({ to: `/app/p/${recent.id}`, label: 'Active workspace', icon: <LayoutGrid /> });
  items.push({ to: '/app/settings', label: 'Settings', icon: <SettingsIcon /> });
  return items;
}

function SideLink({ item, compact }: { item: NavItem; compact: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      aria-label={compact ? item.label : undefined}
      title={compact ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex h-9 items-center gap-3 rounded-button px-2.5 text-body-sm font-medium transition-colors duration-200 [&_svg]:size-[18px] [&_svg]:shrink-0',
          isActive ? 'bg-sky-tint text-blue-ink' : 'text-ink/60 hover:bg-hover hover:text-ink',
          compact && 'justify-center px-0',
        )
      }
    >
      {item.icon}
      {!compact && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

function UserMenu({ compact }: { compact: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const source = useSettings(s => s.dataSource);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-56 rounded-card bg-surface p-1.5 shadow-float">
          <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-body-sm hover:bg-hover" onClick={() => { setOpen(false); navigate('/app/settings'); }}>
            <SettingsIcon className="size-4 text-graphite" aria-hidden /> Settings
          </button>
          <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-body-sm hover:bg-hover" onClick={() => { setOpen(false); navigate('/'); }}>
            <Home className="size-4 text-graphite" aria-hidden /> Life Simulator home
          </button>
        </div>
      )}
      <button
        aria-expanded={open}
        aria-label={compact ? 'Account menu' : undefined}
        onClick={() => setOpen(o => !o)}
        className={cn('flex w-full items-center gap-2.5 rounded-button p-1.5 text-left transition-colors duration-200 hover:bg-hover', compact && 'justify-center')}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-marigold bg-surface text-caption font-semibold" aria-hidden>
          You
        </span>
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm font-medium">Local planner</span>
              <span className="block truncate text-caption text-graphite">{source === 'mock' ? 'Demo data' : 'Saved in this browser'}</span>
            </span>
            <ChevronUp className="size-4 text-graphite" aria-hidden />
          </>
        )}
      </button>
    </div>
  );
}

function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUi();
  const items = useNavItems();
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-hairline bg-canvas px-3 py-4 transition-[width] duration-200 md:flex',
        // Tablet is always compact; desktop follows the person's choice.
        'md:w-[68px]',
        sidebarCollapsed ? 'lg:w-[68px]' : 'lg:w-[248px]',
      )}
      aria-label="Main navigation"
    >
      <div className={cn('mb-6 flex items-center px-1.5', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
        <NavLink to="/app" aria-label="Life Simulator dashboard" className="rounded-button">
          <span className={cn('hidden', !sidebarCollapsed && 'lg:inline-flex')}>
            <Logo />
          </span>
          <span className={cn(!sidebarCollapsed && 'lg:hidden')}>
            <LogoMark />
          </span>
        </NavLink>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {items.map(item => (
          <span key={item.to} className="contents">
            <span className="lg:hidden"><SideLink item={item} compact /></span>
            <span className="hidden lg:block"><SideLink item={item} compact={sidebarCollapsed} /></span>
          </span>
        ))}
      </nav>
      <div className="flex flex-col gap-1 border-t border-hairline pt-3">
        <button
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
          className={cn('hidden h-9 items-center gap-3 rounded-button px-2.5 text-body-sm font-medium text-ink/60 transition-colors duration-200 hover:bg-hover hover:text-ink lg:flex', sidebarCollapsed && 'justify-center px-0')}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="size-[18px]" aria-hidden /> : <PanelLeftClose className="size-[18px]" aria-hidden />}
          {!sidebarCollapsed && 'Collapse'}
        </button>
        <span className="lg:hidden"><UserMenu compact /></span>
        <span className="hidden lg:block"><UserMenu compact={sidebarCollapsed} /></span>
      </div>
    </aside>
  );
}

function MobileNav() {
  const items = useNavItems().filter(i => i.to !== '/app/settings');
  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-lg">
        {items.map(item => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn('flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium [&_svg]:size-5', isActive ? 'text-blue-ink' : 'text-graphite')
              }
            >
              {item.icon}
              <span className="max-w-full truncate px-1">{item.label.replace('New life project', 'New').replace('Active workspace', 'Workspace').replace('My projects', 'Projects')}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-canvas/95 px-4 backdrop-blur md:hidden">
      <NavLink to="/app" aria-label="Life Simulator dashboard">
        <Logo />
      </NavLink>
      <NavLink to="/app/settings" aria-label="Settings" className="grid size-9 place-items-center rounded-button text-graphite hover:bg-hover">
        <SettingsIcon className="size-5" aria-hidden />
      </NavLink>
    </header>
  );
}

export function AppShell() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    // Client-side navigation: move focus to the new view so screen readers follow.
    if (first.current) first.current = false;
    else mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded-button bg-surface px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <DataSourceBanner />
      <div className="flex">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <MobileTopBar />
          <main id="main" ref={mainRef} tabIndex={-1} className="pb-20 outline-none md:pb-0">
            <ErrorBoundary key={pathname}>
              <Suspense fallback={null}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
