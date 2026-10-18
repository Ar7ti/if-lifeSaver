import { z } from 'zod';

/** Browser images only: no proxy fetch, credentials, private literals, data URLs or SVG documents. */
export const ProductImageUrlSchema = z.string().url().max(2048).refine(value => {
  try {
    const u = new URL(value), host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && host.includes('.') &&
      !host.endsWith('.') && !host.includes(':') && !/^\d+(?:\.\d+)*$/.test(host) &&
      !/(?:^|\.)(?:localhost|local|internal|lan|home|invalid|test|onion)$/.test(host) &&
      !/\.(?:svgz?|html?)(?:$|[/?])/i.test(u.pathname) && !/[\u0000-\u0020\u007f]/.test(value);
  } catch { return false; }
}, 'Expected a public HTTPS product image URL');
// Older records allowed generic public URLs, including SVG documents. Preserve
// the project while dropping an image that no longer meets rendering policy.
export const StoredProductImageSchema = z.string().url().max(2048).nullable().transform(value=>
  value!==null&&ProductImageUrlSchema.safeParse(value).success?value:null);
export const ImageMetadataShape = {
  imageUrl: StoredProductImageSchema.optional(),
  imageType: z.enum(['listing', 'category', 'demo']).optional(),
  imageSource: z.enum(['provider', 'cited_summary', 'demo']).optional(),
  priceOrigin: z.enum(['user', 'ai_estimate', 'source_reported', 'source_confirmed', 'demo']).optional(),
};
const id = z.string().uuid(), minor = z.number().int().min(0).max(1_000_000_000);
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const ScenarioChangeSchema = z.object({
  kind: z.enum(['add', 'replace']), cartItemId: id.nullable(), offerId: id,
  category: z.string().max(50), title: z.string().max(2000), quantity: z.number().int().min(1).max(100),
  previousMinor: minor, totalMinor: minor,
}).strict();
export const ScenarioSelectionSchema = z.object({
  id: z.enum(['economy', 'balanced', 'comfort']), appliedAt: z.string().datetime(),
  fingerprint, needsReview: z.boolean(),
}).strict();
export const ReplaceCartRequestSchema = z.object({
  offerId: id, approved: z.literal(true), allowSelected: z.boolean().default(false),
  expectedRevision: z.number().int().nonnegative(),
}).strict();
export const UndoCartReplacementSchema = ReplaceCartRequestSchema.omit({offerId:true});
export const ApplyScenarioRequestSchema = z.object({
  approved: z.literal(true), expectedRevision: z.number().int().nonnegative(), expectedFingerprint: fingerprint,
}).strict();
export type ReplaceCartRequest = z.input<typeof ReplaceCartRequestSchema>;
export type UndoCartReplacement = z.input<typeof UndoCartReplacementSchema>;
export type ApplyScenarioRequest = z.infer<typeof ApplyScenarioRequestSchema>;
