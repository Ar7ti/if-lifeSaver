import { isEditableKeyboardEvent } from '@/lib/keyboard';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CheckSquare, ChevronUp, FolderClosed, Home, LayoutGrid, PanelLeftClose, PanelLeftOpen, Plus, Settings as SettingsIcon, ShoppingBag, Sparkles, type LucideIcon } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { useUi } from '@/stores/ui';
import { useProjects, type ProjectSummary } from '@/stores/projects';
import { useSettings } from '@/stores/settings';
import { Logo, LogoMark } from './Logo';
import { DataSourceBanner } from './DataSourceBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface NavItem {
  to: string;
  label: string;
  short?: string;
  icon: LucideIcon;
  /** Decides the active state; hash links into the workspace need more than a path match. */
  isActive: (pathname: string, hash: string) => boolean;
}

function useRecentProjects() {
  const source = useSettings(s => s.dataSource);
  const all = useProjects(s => s.projects);
  return all.filter(p => p.source === source);
}

function useNavGroups(): { primary: NavItem[]; workspace: NavItem[] } {
  const recent = useRecentProjects()[0];
  const primary: NavItem[] = [
    { to: '/app', label: 'Home', icon: Home, isActive: p => p === '/app' },
    { to: '/app/projects', label: 'My projects', short: 'Projects', icon: FolderClosed, isActive: p => p === '/app/projects' },
  ];
  // Workspace shortcuts only appear when there is a workspace to open: no dead links.
  const workspace: NavItem[] = recent
    ? [
        { to: `/app/p/${recent.id}`, label: 'Active workspace', short: 'Workspace', icon: LayoutGrid, isActive: (p, h) => p.startsWith('/app/p/') && !h },
        { to: `/app/p/${recent.id}#tasks`, label: 'Tasks', icon: CheckSquare, isActive: (p, h) => p.startsWith('/app/p/') && h === '#tasks' },
        { to: `/app/p/${recent.id}#shopping`, label: 'Shopping', icon: ShoppingBag, isActive: (p, h) => p.startsWith('/app/p/') && h === '#shopping' },
        { to: `/app/p/${recent.id}#assistant`, label: 'AI Assistant', short: 'Assistant', icon: Sparkles, isActive: (p, h) => p.startsWith('/app/p/') && h === '#assistant' },
      ]
    : [];
  return { primary, workspace };
}

function SideLink({ item, compact }: { item: NavItem; compact: boolean }) {
  const { pathname, hash } = useLocation();
  const active = item.isActive(pathname, hash);
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      aria-label={compact ? item.label : undefined}
      title={compact ? item.label : undefined}
      className={cn(
        'flex h-9 items-center gap-3 rounded-button px-2.5 text-body-sm transition-colors duration-150',
        active ? 'bg-surface font-medium text-ink shadow-[0_0_0_1px_rgb(0_0_0/0.04),0_1px_2px_rgb(0_0_0/0.05)]' : 'text-ink/70 hover:bg-black/[0.04] hover:text-ink',
        compact && 'justify-center px-0',
      )}
    >
      <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
      {!compact && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function Separator() {
  return <div className="mx-2.5 my-3 h-px bg-black/[0.07]" aria-hidden />;
}

function RecentLink({ project }: { project: ProjectSummary }) {
  const { pathname } = useLocation();
  const active = pathname === `/app/p/${project.id}`;
  return (
    <Link
      to={`/app/p/${project.id}`}
      aria-current={active ? 'page' : undefined}
      className={cn('block rounded-button px-2.5 py-2 transition-colors duration-150', active ? 'bg-black/[0.05]' : 'hover:bg-black/[0.04]')}
    >
      <span className="block truncate text-body-sm font-medium text-ink">{project.title}</span>
      <span className="block truncate text-caption text-graphite">
        {[project.location?.split(',')[0], project.totalMinor ? formatMoney(project.totalMinor) : null, `${project.tasksDone}/${project.tasksTotal} tasks`].filter(Boolean).join(' · ')}
      </span>
    </Link>
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
      if (e instanceof KeyboardEvent) {
        if (e.defaultPrevented || e.isComposing || isEditableKeyboardEvent(e)) return;
        if (e.key === 'Escape') setOpen(false);
      } else if (!ref.current?.contains(e.target as Node)) setOpen(false);
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
        className={cn('flex w-full items-center gap-3 rounded-button p-1.5 text-left transition-colors duration-150 hover:bg-black/[0.04]', compact && 'justify-center')}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-midnight text-body-sm font-semibold text-white" aria-hidden>
          Y
        </span>
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm font-medium">You</span>
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
  const { primary, workspace } = useNavGroups();
  const recents = useRecentProjects().slice(0, 5);
  const { pathname } = useLocation();

  const body = (compact: boolean) => (
    <>
      <div className={cn('mb-5 flex items-center', compact ? 'flex-col gap-3' : 'justify-between pl-2.5')}>
        <Link to="/app" aria-label="Life Simulator home" className="rounded-button">
          {compact ? <LogoMark /> : <Logo />}
        </Link>
        <button
          onClick={toggleSidebar}
          aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!compact}
          className="hidden size-8 place-items-center rounded-button text-graphite transition-colors duration-150 hover:bg-black/[0.05] hover:text-ink lg:grid"
        >
          {compact ? <PanelLeftOpen className="size-[18px]" strokeWidth={1.75} aria-hidden /> : <PanelLeftClose className="size-[18px]" strokeWidth={1.75} aria-hidden />}
        </button>
      </div>

      <nav aria-label="Main navigation" className="flex flex-col gap-0.5">
        <Link
          to="/app/new"
          aria-current={pathname === '/app/new' ? 'page' : undefined}
          aria-label={compact ? 'New life project' : undefined}
          title={compact ? 'New life project' : undefined}
          className={cn('flex h-9 items-center gap-3 rounded-button px-2.5 text-body-sm font-medium text-ink transition-colors duration-150 hover:bg-black/[0.04]', compact && 'justify-center px-0', pathname === '/app/new' && 'bg-surface')}
        >
          <Plus className="size-[18px] shrink-0 text-blue" strokeWidth={2} aria-hidden />
          {!compact && 'New life project'}
        </Link>
        {primary.map(item => (
          <SideLink key={item.to} item={item} compact={compact} />
        ))}
        {workspace.length > 0 && (
          <>
            <Separator />
            {workspace.map(item => (
              <SideLink key={item.to} item={item} compact={compact} />
            ))}
          </>
        )}
      </nav>

      {!compact && recents.length > 0 && (
        <section aria-labelledby="recents-label" className="scrollbar-thin mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Separator />
          <h2 id="recents-label" className="mb-1 px-2.5 text-[11px] font-medium tracking-[0.08em] text-graphite uppercase">
            Recents
          </h2>
          <ul className="flex flex-col gap-0.5">
            {recents.map(p => (
              <li key={p.id}>
                <RecentLink project={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={cn('mt-auto flex flex-col gap-0.5 pt-3', (compact || recents.length === 0) && 'flex-1 justify-end')}>
        <SideLink item={{ to: '/app/settings', label: 'Settings', icon: SettingsIcon, isActive: p => p === '/app/settings' }} compact={compact} />
        <div className="mx-2.5 my-2 h-px bg-black/[0.07]" aria-hidden />
        <UserMenu compact={compact} />
      </div>
    </>
  );

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col px-3 py-4 transition-[width] duration-200 md:flex',
        'md:w-[72px]',
        sidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-[268px]',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">{body(true)}</div>
      <div className="hidden min-h-0 flex-1 flex-col lg:flex">{body(sidebarCollapsed)}</div>
    </aside>
  );
}

function MobileNav() {
  const { primary, workspace } = useNavGroups();
  const { pathname, hash } = useLocation();
  const items: NavItem[] = [
    primary[0]!,
    { to: '/app/new', label: 'New', icon: Plus, isActive: p => p === '/app/new' },
    primary[1]!,
    ...(workspace[0] ? [workspace[0]] : []),
  ];
  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-lg">
        {items.map(item => {
          const active = item.isActive(pathname, hash);
          return (
            <li key={item.to} className="flex-1">
              <Link to={item.to} aria-current={active ? 'page' : undefined} className={cn('flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', active ? 'text-ink' : 'text-graphite')}>
                <item.icon className="size-5" strokeWidth={active ? 2 : 1.75} aria-hidden />
                <span className="max-w-full truncate px-1">{item.short ?? item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-canvas/95 px-4 backdrop-blur md:hidden">
      <NavLink to="/app" aria-label="Life Simulator home">
        <Logo />
      </NavLink>
      <NavLink to="/app/settings" aria-label="Settings" className="grid size-9 place-items-center rounded-button text-graphite hover:bg-hover">
        <SettingsIcon className="size-5" strokeWidth={1.75} aria-hidden />
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
    <div className="min-h-dvh bg-canvas md:bg-backdrop">
      <a href="#main" className="sr-only z-50 rounded-button bg-surface px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <DataSourceBanner />
      <div className="flex">
        <Sidebar />
        <div className="min-w-0 flex-1 md:py-2 md:pr-2">
          <MobileTopBar />
          {/* The framed app panel (Reference A). */}
          <main id="main" ref={mainRef} tabIndex={-1} className="min-h-[calc(100dvh-1rem)] pb-20 outline-none md:rounded-[24px] md:bg-canvas md:pb-0 md:shadow-[0_0_0_1px_rgb(0_0_0/0.04)]">
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
