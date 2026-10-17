import { useRef } from 'react';
import { Composer, type ComposerHandle } from '@/features/create/Composer';
import { ExampleCards } from '@/features/create/ExampleCards';
import { PageContainer } from './PageHeader';
import { ServiceStatus } from './ServiceStatus';

export function NewProject() {
  const composer = useRef<ComposerHandle>(null);
  return (
    <PageContainer className="max-w-[900px] pt-12 sm:pt-20">
      <h1 className="text-center text-[36px] leading-[1.08] font-semibold tracking-[-1.2px] sm:text-display-sm">
        What are you{' '}
        <span className="inline-block rounded-full bg-peach px-[0.3em] leading-[1.15]">planning?</span>
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-center font-serif text-[18px] leading-[1.56] text-graphite">Describe it the way you would to a friend. We will build the workspace around it.</p>
      <Composer ref={composer} className="mt-10" autoFocus />
      <div className="mt-4 flex justify-center">
        <ServiceStatus />
      </div>
      <h2 className="mt-12 mb-3 text-body-sm font-medium text-graphite">Examples</h2>
      <ExampleCards className="lg:grid-cols-3" onPick={p => composer.current?.fill(p)} />
    </PageContainer>
  );
}
