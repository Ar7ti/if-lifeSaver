import type { Offer } from '@contracts';
import { Dialog } from '@/components/ui/Dialog';
import { Pill } from '@/components/ui/Pill';
import { formatMoney, hostOf } from '@/lib/format';
import { OfferImage } from './OfferImage';
import { conditionLabel, priceStatusLabel, sellerTypeLabel, verificationLabel } from './labels';

const ROWS: { label: string; render: (o: Offer) => React.ReactNode }[] = [
  { label: 'Price', render: o => <span className="font-semibold tabular">{formatMoney(o.priceMinor)}</span> },
  { label: 'Price source', render: o => <Pill tone={priceStatusLabel[o.priceStatus].tone}>{priceStatusLabel[o.priceStatus].label}</Pill> },
  { label: 'Delivery', render: o => (o.delivery.costMinor !== null ? formatMoney(o.delivery.costMinor) : o.delivery.available === false ? 'Pickup only' : 'Unknown') },
  { label: 'Condition', render: o => conditionLabel[o.condition] ?? '—' },
  { label: 'Seller', render: o => `${o.seller.name ?? hostOf(o.sourceUrl) ?? o.sourceName} · ${sellerTypeLabel[o.seller.type]}` },
  { label: 'Location', render: o => o.location ?? 'Not stated' },
  { label: 'Match score', render: o => <span className="tabular">{Math.round(o.score)}/100</span> },
  { label: 'Provenance', render: o => verificationLabel[o.verificationStatus].label },
];

export function CompareDialog({ offers, open, onClose }: { offers: Offer[]; open: boolean; onClose: () => void }) {
  const cheapest = Math.min(...offers.map(o => o.priceMinor ?? Infinity));
  return (
    <Dialog open={open} onClose={onClose} title={`Compare ${offers.length} options`} description="Unknown values are shown as unknown, never as zero." wide>
      <div className="-mx-6 overflow-x-auto px-6">
        <table className="w-full min-w-[520px] border-separate border-spacing-0 text-left text-body-sm">
          <caption className="sr-only">Side-by-side comparison of selected options</caption>
          <thead>
            <tr>
              <th scope="col" className="w-32 pb-3 align-bottom text-caption font-medium text-graphite">
                Option
              </th>
              {offers.map(o => (
                <th key={o.id} scope="col" className="px-2 pb-3 align-bottom font-semibold">
                  <OfferImage offer={o} className="mb-2 aspect-[16/10]" />
                  <span className="line-clamp-2">{o.title}</span>
                  {o.priceMinor === cheapest && offers.length > 1 && (
                    <Pill tone="ok" className="mt-1">
                      Lowest price
                    </Pill>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(row => (
              <tr key={row.label}>
                <th scope="row" className="border-t border-hairline py-2.5 pr-2 align-top text-caption font-medium text-graphite">
                  {row.label}
                </th>
                {offers.map(o => (
                  <td key={o.id} className="border-t border-hairline px-2 py-2.5 align-top">
                    {row.render(o)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
