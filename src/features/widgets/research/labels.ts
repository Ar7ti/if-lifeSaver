import type { Offer } from '@contracts';
import type { PillTone } from '@/components/ui/Pill';

export const priceStatusLabel: Record<Offer['priceStatus'], { label: string; tone: PillTone; hint: string }> = {
  verified: { label: 'Source-confirmed price', tone: 'ok', hint: 'Price confirmed at a checked source.' },
  estimated: { label: 'Estimated price', tone: 'warn', hint: 'Reported by search; confirm at the source before relying on it.' },
  unknown: { label: 'Price unknown', tone: 'neutral', hint: 'No reliable price was found.' },
  demo: { label: 'Demo price', tone: 'warn', hint: 'Fictional demo data.' },
};

export const verificationLabel: Record<Offer['verificationStatus'], { label: string; tone: PillTone; hint: string }> = {
  source_checked: { label: 'Source cited', tone: 'blue', hint: 'Backed by a cited public link. This confirms where the information came from, not that the seller is trustworthy.' },
  unverified: { label: 'Unverified', tone: 'neutral', hint: 'No source link supports these details yet.' },
  demo: { label: 'Demo', tone: 'warn', hint: 'Fictional demo listing.' },
};

export const sellerTypeLabel: Record<Offer['seller']['type'], string> = { company: 'Business', private: 'Private seller', unknown: 'Seller not stated' };

export const conditionLabel: Record<Offer['condition'], string | null> = { new: 'New', used: 'Used', refurbished: 'Refurbished', unknown: 'Condition not stated', not_applicable: null };

export const availabilityLabel: Record<Offer['availability'], string | null> = { in_stock: 'In stock', out_of_stock: 'Out of stock', unknown: null, demo: null };

export const STALE_PREFIX = 'Project constraints changed';
