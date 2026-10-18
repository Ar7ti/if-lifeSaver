import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings, type DataSource } from '@/stores/settings';
import { useProjects } from '@/stores/projects';
import { clearMockProjects } from '@/api/mock';
import { toast } from '@/stores/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { PageContainer, PageHeader } from './PageHeader';
import { ServiceStatus } from './ServiceStatus';
import { AccessSettings } from '@/features/access/SessionBoundary';
import { useAccess } from '@/api/access';

const SOURCES: { value: DataSource; title: string; body: string }[] = [
  { value: 'live', title: 'Live service', body: 'Uses the Life Simulator API: AI planning, real web research and saved projects.' },
  { value: 'mock', title: 'Demo data', body: 'Works offline with fictional offers and prices. Clearly labelled everywhere; never mixed with live results.' },
];

export function Settings() {
  const { dataSource, setDataSource, apiToken, setApiToken } = useSettings();
  const [token, setToken] = useState(apiToken);
  const [confirmClear, setConfirmClear] = useState(false);
  const projects = useProjects(s => s.projects);
  const qc = useQueryClient();
  const publicMode=useAccess(s=>s.info?.mode==='public');

  return (
    <PageContainer className="max-w-[760px]">
      <PageHeader title="Settings" description="Preferences are stored in this browser only." />

      <div className="flex flex-col gap-4">
        <AccessSettings />
        <Card>
          <fieldset>
            <legend className="text-heading-sm font-semibold">Data source</legend>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {SOURCES.map(s => (
                <label
                  key={s.value}
                  className={cn(
                    'flex cursor-pointer flex-col gap-1 rounded-[10px] border p-4 transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue',
                    dataSource === s.value ? 'border-blue bg-sky-tint/60' : 'border-hairline-strong hover:bg-hover',
                  )}
                >
                  <span className="flex items-center gap-2 text-body-sm font-semibold">
                    <input
                      type="radio"
                      name="source"
                      value={s.value}
                      checked={dataSource === s.value}
                      onChange={() => {
                        setDataSource(s.value);
                        qc.clear();
                      }}
                      className="size-4 accent-blue"
                    />
                    {s.title}
                  </span>
                  <span className="pl-6 text-body-sm text-graphite">{s.body}</span>
                </label>
              ))}
            </div>
            <div className="mt-4">
              <ServiceStatus />
            </div>
          </fieldset>
        </Card>

        {!publicMode&&<Card>
          <h2 className="text-heading-sm font-semibold">Access token</h2>
          <p className="mt-1 text-body-sm text-graphite">Only needed when the service runs with a shared API token. This is not an AI provider key.</p>
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={e => {
              e.preventDefault();
              setApiToken(token);
              qc.invalidateQueries();
              toast.success(token ? 'Access token saved' : 'Access token removed');
            }}
          >
            <Field label="Shared access token" className="flex-1">
              {props => <Input {...props} type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Leave empty for local use" />}
            </Field>
            <Button type="submit" variant="outline">
              Save token
            </Button>
          </form>
        </Card>}

        <Card>
          <h2 className="text-heading-sm font-semibold">This browser</h2>
          <p className="mt-1 text-body-sm text-graphite">
            {projects.length === 0 ? 'No projects are remembered here.' : `${projects.length} project${projects.length === 1 ? ' is' : 's are'} remembered here.`} Forgetting them removes the list from this browser; live projects stay on the server.
          </p>
          <Button variant="danger" className="mt-4" disabled={projects.length === 0} onClick={() => setConfirmClear(true)}>
            Forget all projects…
          </Button>
        </Card>
      </div>

      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Forget all projects in this browser?"
        description={publicMode?'This clears the browser list and demo projects. Live workspaces remain private to your session and return after reload. It does not delete your session cookie.':'Your list of projects will be cleared from this browser. Demo projects will be lost. Live projects remain on the server, but you will need their links to open them.'}
        footer={
          <>
            <Button variant="text" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              className="border border-danger-ink/30"
              onClick={() => {
                useProjects.setState({ projects: [] });
                clearMockProjects();
                qc.clear();
                setConfirmClear(false);
                toast.success('Projects forgotten');
              }}
            >
              Forget all projects
            </Button>
          </>
        }
      >
        <p className="text-body-sm text-graphite">This cannot be undone.</p>
      </Dialog>
    </PageContainer>
  );
}
