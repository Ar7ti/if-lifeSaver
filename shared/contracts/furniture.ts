/** Query vocabulary only: never evidence of a listing, price or condition. */
export const FURNITURE_TERMS = {
  sofa: { en: 'Sofas', fi: 'sohva', aliases: /\b(?:sofas?|couches?|\w*sohva\w*)\b/i },
  bed: { en: 'Beds', fi: 'sänky', aliases: /\b(?:beds?|bed frame|sanky\w*|sangy\w*|sangyn\w*|vuode\w*|vuote\w*)\b/i },
  desk: { en: 'Desks', fi: 'työpöytä', aliases: /\b(?:desks?|writing tables?|tyopoy\w*|kirjoituspoy\w*)\b/i },
  chair: { en: 'Chairs', fi: 'tuoli', aliases: /\b(?:chairs?|\w*tuoli\w*)\b/i },
  wardrobe: { en: 'Wardrobes', fi: 'vaatekaappi', aliases: /\b(?:wardrobes?|closets?|vaatekaap\w*)\b/i },
} as const;
export type FurnitureItem = keyof typeof FURNITURE_TERMS;
export function furnitureItems(text: string): FurnitureItem[] {
  const plain=text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replaceAll('_',' ');
  return (Object.keys(FURNITURE_TERMS) as FurnitureItem[]).filter(item=>FURNITURE_TERMS[item].aliases.test(plain));
}
