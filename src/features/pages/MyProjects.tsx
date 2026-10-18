import { Link } from 'react-router-dom';
import { FolderOpen, Plus } from 'lucide-react';
import { useProjects } from '@/stores/projects';
import { useSettings } from '@/stores/settings';
import { toast } from '@/stores/toast';
import { EmptyState } from '@/components/ui/States';
import { buttonClass } from '@/components/ui/Button';
import { PageContainer, PageHeader } from './PageHeader';
import { ProjectCard } from './ProjectCard';
import { useAccess } from '@/api/access';

export function MyProjects() {
  const source = useSettings(s => s.dataSource);
  const all = useProjects(s => s.projects);
  const restore = useProjects(s => s.restore);
  const forget = useProjects(s => s.forget);
  const projects = all.filter(p => p.source === source);
  const publicMode=useAccess(s=>s.info?.mode==='public');

  return (
    <PageContainer>
      <PageHeader
        title="My projects"
        description={source === 'mock' ? 'Demo projects saved in this browser.' : publicMode?'Workspaces private to your current session.':'Projects created in this browser. They are stored by the Life Simulator service.'}
        actions={
          <Link to="/app/new" className={buttonClass('primary')}>
            <Plus className="size-4" aria-hidden /> New life project
          </Link>
        }
      />
      {projects.length === 0 ? (
        <EmptyState icon={<FolderOpen />} title="No projects in this browser yet" action={<Link to="/app/new" className="text-body-sm font-medium text-blue-ink underline-offset-2 hover:underline">Start a life project</Link>}>
          Projects you create will be listed here.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              onForget={() => {
                forget(p.id);
                toast.info(`Removed “${p.title}” from this list`, 'The project itself is still saved on the server.', { label: 'Undo', onClick: () => restore(p) });
              }}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
