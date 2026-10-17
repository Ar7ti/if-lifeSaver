import { Link } from 'react-router-dom';
import { buttonClass } from '@/components/ui/Button';

export function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 text-center">
      <div>
        <p className="text-caption font-medium text-graphite">404</p>
        <h1 className="mt-2 text-heading font-semibold">This page doesn&rsquo;t exist</h1>
        <p className="mt-2 text-body text-graphite">The link may be old or mistyped.</p>
        <Link to="/" className={buttonClass('primary', 'md', 'mt-6')}>
          Go to Life Simulator
        </Link>
      </div>
    </main>
  );
}
