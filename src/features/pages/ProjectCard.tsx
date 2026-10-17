import { Link } from 'react-router-dom';
import { MapPin, Trash2 } from 'lucide-react';
import type { ProjectSummary } from '@/stores/projects';
import { formatMoney, relativeTime } from '@/lib/format';
import { Progress } from '@/components/ui/Progress';
import { Pill } from '@/components/ui/Pill';
import { Button } from '@/components/ui/Button';

export function ProjectCard({ project, onForget }: { project: ProjectSummary; onForget?: () => void }) {
  const pct = project.tasksTotal ? Math.round((project.tasksDone / project.tasksTotal) * 100) : 0;
  return (
    <div className="group relative flex flex-col gap-4 rounded-card border border-hairline bg-surface p-5 transition-colors duration-200 hover:border-hairline-strong">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-body font-semibold">
            <Link to={`/app/p/${project.id}`} className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-blue">
              {project.title}
            </Link>
          </h3>
          {project.location && (
            <p className="mt-0.5 flex items-center gap-1 text-body-sm text-graphite">
              <MapPin className="size-3.5" aria-hidden /> {project.location}
            </p>
          )}
        </div>
        {project.source === 'mock' && <Pill tone="warn">Demo</Pill>}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-body-sm">
        <div>
          <dt className="text-caption text-graphite">Budget</dt>
          <dd className="tabular font-semibold">{project.totalMinor ? formatMoney(project.totalMinor) : 'Not set'}</dd>
        </div>
        <div>
          <dt className="text-caption text-graphite">Planned</dt>
          <dd className="tabular font-semibold">{formatMoney(project.committedMinor)}</dd>
        </div>
      </dl>
      <div>
        <div className="mb-1.5 flex justify-between text-caption text-graphite">
          <span>
            {project.tasksDone} of {project.tasksTotal} tasks done
          </span>
          <span>Updated {relativeTime(project.updatedAt)}</span>
        </div>
        <Progress value={pct} label={`${project.title} task progress`} height={4} />
      </div>
      {onForget && (
        <Button
          size="icon-sm"
          variant="text"
          onClick={onForget}
          aria-label={`Remove ${project.title} from this list`}
          title="Remove from this list"
          icon={<Trash2 />}
          className="absolute right-3 bottom-3 z-10 text-graphite opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
        />
      )}
    </div>
  );
}
