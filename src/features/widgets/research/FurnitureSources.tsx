import {itemVisual,type ResearchResult} from '@contracts';

/** Browser handoffs only. No photos, prices, selection or financial mutations. */
export function FurnitureSources({links}:{links:NonNullable<ResearchResult['furnitureSearchLinks']>}) {
  return <section aria-label="Furniture source searches" className="space-y-3">
    <div>
      <h4 className="text-body-sm font-semibold">Continue at the source</h4>
      <p className="mt-1 text-caption text-graphite">Search pages, not product listings. No exact price or availability is confirmed. Apply your location, condition, price and delivery filters on each site.</p>
    </div>
    <div className="grid grid-cols-1 gap-3 @md:grid-cols-3">{(['ikea','jysk','tori'] as const).map(source=>{
      const group=links.filter(l=>l.source===source);if(!group.length)return null;
      return <article key={source} aria-label={`${group[0]!.sourceName} search pages`} className="min-w-0 rounded-card border border-hairline bg-canvas p-3">
        <p className="text-caption text-graphite">Search pages · no price quoted</p>
        <h5 className="mt-1 text-body-sm font-semibold">{group[0]!.sourceName}</h5>
        <ul className="mt-3 space-y-2">{group.map(link=><li key={link.url}>
          <a href={link.url} target="_blank" rel="noopener noreferrer" title={link.notice} className="inline-flex min-h-9 items-center gap-2 rounded-md text-body-sm font-medium text-blue-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue">
            <span aria-hidden>{itemVisual(link.item).emoji}</span><span>{link.title} <span className="text-caption font-normal">({link.query})</span> ↗</span>
          </a>
        </li>)}</ul>
      </article>;
    })}</div>
  </section>;
}
