import { Link } from 'react-router-dom';
import { useMemo, useRef } from 'react';
import { Composer, type ComposerHandle } from '@/features/create/Composer';
import { ExampleCards } from '@/features/create/ExampleCards';
import { useProjects } from '@/stores/projects';
import { useSettings } from '@/stores/settings';
import { buttonClass } from '@/components/ui/Button';
import { PageContainer } from './PageHeader';
import { ProjectCard } from './ProjectCard';
import { ServiceStatus } from './ServiceStatus';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Home (Reference B): a calm, centered start with the composer and quick starts. */
export function Dashboard() {
  const source = useSettings(s => s.dataSource);
  const all = useProjects(s => s.projects);
  const projects = useMemo(() => all.filter(p => p.source === source), [all, source]);
  const composer = useRef<ComposerHandle>(null);

  return (
    <PageContainer className="max-w-[860px] pt-12 sm:pt-20">
      <div className="mb-8 flex justify-center">
        <ServiceStatus />
      </div>
      <h1 className="text-center text-[38px] leading-[1.1] font-normal tracking-[-1.2px] sm:text-[52px] sm:tracking-[-1.8px]">{greeting()}</h1>
      <p className="mt-3 text-center text-body text-graphite">What would you like to plan today?</p>

      <Composer ref={composer} size="md" className="mt-8" />

      <h2 className="mt-10 mb-3 text-[11px] font-medium tracking-[0.08em] text-graphite uppercase">Quick start</h2>
      <ExampleCards variant="quick" onPick={p => composer.current?.fill(p)} />

      {projects.length > 0 && (
        <section aria-labelledby="recent-heading" className="mt-12">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recent-heading" className="text-[11px] font-medium tracking-[0.08em] text-graphite uppercase">
              Recent projects
            </h2>
            {projects.length > 2 && (
              <Link to="/app/projects" className={buttonClass('text', 'sm', 'text-graphite')}>
                View all
              </Link>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.slice(0, 2).map(p => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </section>
      )}
    </PageContainer>
  );
}
