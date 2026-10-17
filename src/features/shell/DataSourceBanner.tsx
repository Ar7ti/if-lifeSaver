import { FlaskConical } from 'lucide-react';
import { useSettings } from '@/stores/settings';
import { Button } from '@/components/ui/Button';

/** Shown on every screen while the offline demo adapter is active, so demo data never passes as live. */
export function DataSourceBanner() {
  const { dataSource, setDataSource } = useSettings();
  if (dataSource !== 'mock') return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-midnight px-4 py-2 text-center text-body-sm text-white">
      <FlaskConical className="size-4 text-marigold" aria-hidden />
      <span>
        <strong className="font-semibold">Demo data.</strong> Offers and prices are fictional; nothing here is live.
      </span>
      <Button size="sm" variant="text" className="h-7 text-white hover:bg-white/10" onClick={() => setDataSource('live')}>
        Switch to live
      </Button>
    </div>
  );
}
