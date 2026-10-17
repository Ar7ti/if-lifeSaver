import type { Offer } from '@contracts';
import type { FurnitureClass } from '@/stores/ui';

export type Tier = Exclude<FurnitureClass, 'all'>;

export const CLASS_OPTIONS: { value: FurnitureClass; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'economy', label: 'Economy' },
  { value: 'mid', label: 'Mid-range' },
  { value: 'premium', label: 'Premium' },
];

export const TIER_LABEL: Record<Tier, string> = { economy: 'Economy', mid: 'Mid-range', premium: 'Premium' };

/** Search hint sent with new research so results lean toward the chosen class. */
export const CLASS_PREFERENCE: Record<Tier, string> = {
  economy: 'Economy class: budget-friendly, lowest reasonable price',
  mid: 'Mid-range class: good value, solid everyday quality',
  premium: 'Premium class: higher quality materials and brands',
};

/**
 * Splits one search's priced offers into price thirds. Tiers are relative to what was
 * found, not a judgement of the product: they make "show me the cheaper ones" one click.
 */
export function tierMap(offers: Offer[]): Map<string, Tier> {
  const priced = offers.filter(o => o.priceMinor !== null).sort((a, b) => a.priceMinor! - b.priceMinor!);
  const map = new Map<string, Tier>();
  const n = priced.length;
  priced.forEach((o, i) => {
    if (n === 1) map.set(o.id, 'mid');
    else if (n === 2) map.set(o.id, i === 0 ? 'economy' : 'premium');
    else map.set(o.id, i < n / 3 ? 'economy' : i < (2 * n) / 3 ? 'mid' : 'premium');
  });
  return map;
}
