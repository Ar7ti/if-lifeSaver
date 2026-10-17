import { Link } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { Composer, type ComposerHandle } from '@/features/create/Composer';
import { ExampleCards } from '@/features/create/ExampleCards';
import { useProjects } from '@/stores/projects';
import { useSettings } from '@/stores/settings';
import { EmptyState } from '@/components/ui/States';
import { PageContainer, PageHeader } from './PageHeader';
import { ProjectCard } from './ProjectCard';
import { ServiceStatus } from './ServiceStatus';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Dashboard() {
  const source = useSettings(s => s.dataSource);
  const all = useProjects(s => s.projects);
  const projects = useMemo(() => all.filter(p => p.source === source), [all, source]);
  const composer = useRef<ComposerHandle>(null);

  return (
    <PageContainer>
      <PageHeader title={greeting()} description="Pick up where you left off, or plan something new." actions={<ServiceStatus />} />

      <section aria-labelledby="new-heading" className="mb-12">
        <h2 id="new-heading" className="mb-3 text-subheading font-semibold">
          Plan something new
        </h2>
        <Composer ref={composer} size="md" />
        <ExampleCards className="mt-3" onPick={p => composer.current?.fill(p)} />
      </section>

      <section aria-labelledby="recent-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent-heading" className="text-subheading font-semibold">
            Recent projects
          </h2>
          {projects.length > 3 && (
            <Link to="/app/projects" className="rounded-small border border-ink/20 px-2.5 py-1 text-body-sm font-medium text-ink/90 hover:bg-hover">
              View all
            </Link>
          )}
        </div>
        {projects.length === 0 ? (
          <EmptyState icon={<FolderOpen />} title="No projects yet">
            Describe what you are planning above and your first workspace will appear here.
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.slice(0, 3).map(p => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  );
}
