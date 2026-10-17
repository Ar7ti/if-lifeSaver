import { Reveal } from './motion-kit';

const SCENARIOS = [
  { src: '/illustrations/moving-box.png', label: 'Moving to a new city' },
  { src: '/illustrations/first-car.png', label: 'Buying a first car' },
  { src: '/illustrations/sofa.png', label: 'Furnishing a home' },
  { src: '/illustrations/travel-case.png', label: 'Planning a big trip' },
  { src: '/illustrations/first-home.png', label: 'A first apartment' },
  { src: '/illustrations/guide.png', label: 'Starting student life' },
];

function Row({ hidden }: { hidden?: boolean }) {
  return (
    <ul className="flex shrink-0 gap-3 pr-3" aria-hidden={hidden || undefined}>
      {SCENARIOS.map(s => (
        <li key={s.label} className="card flex shrink-0 items-center gap-3 py-2.5 pr-5 pl-2.5">
          <span className="grid size-12 place-items-center rounded-[12px] bg-canvas">
            <img src={s.src} alt="" width="44" height="44" loading="lazy" className="size-11 object-contain" />
          </span>
          <span className="text-body font-medium whitespace-nowrap">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** "Built for every big moment": a slow band of life scenarios. */
export function ScenarioMarquee() {
  return (
    <section aria-labelledby="moments-heading" className="overflow-hidden py-20">
      <Reveal className="mx-auto mb-10 max-w-[1200px] px-4 text-center sm:px-8">
        <h2 id="moments-heading" className="text-[34px] leading-[1.08] font-semibold tracking-[-1.1px] sm:text-[44px]">
          Built for every big moment.
        </h2>
        <p className="mx-auto mt-3 max-w-lg font-serif text-[18px] leading-[1.56] text-graphite">One calm workspace, shaped around whatever you are planning.</p>
      </Reveal>
      <div className="marquee relative [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <div className="marquee-track flex w-max py-2">
          <Row />
          <Row hidden />
        </div>
      </div>
    </section>
  );
}
