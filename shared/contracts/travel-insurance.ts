import { z } from 'zod';

export const TravelPriceRequestSchema=z.object({
  personalIdentityNumber:z.string().trim().toUpperCase().regex(/^\d{6}[+\-ABCDEFUVWXY]\d{3}[0-9A-Y]$/),
  postalCode:z.string().regex(/^\d{5}$/),consent:z.literal(true),
}).strict();
const price=z.object({amountMinor:z.number().int().nonnegative(),grossMinor:z.number().int().nonnegative(),discountMinor:z.number().int().nonnegative(),billingPeriod:z.string().min(1).max(80)}).strict();
export const TravelPriceResponseSchema=z.object({provider:z.literal('If'),environment:z.enum(['sandbox','live']),receivedAt:z.string().datetime(),validTo:z.string().date(),activationDateFrom:z.string().date(),maximumTripDays:z.number().int().positive(),prices:z.array(price).max(20),coverages:z.array(z.object({name:z.string().min(1).max(200),selected:z.boolean(),prices:z.array(price).max(20)}).strict()).max(20),terms:z.array(z.object({name:z.string().min(1).max(200),url:z.string().url()}).strict()).max(20),warning:z.string().max(500)}).strict();
export const TravelPriceStatusSchema=z.object({available:z.boolean(),environment:z.enum(['sandbox','live','unavailable']),message:z.string()}).strict();
export type TravelPriceRequest=z.infer<typeof TravelPriceRequestSchema>;
export type TravelPriceResponse=z.infer<typeof TravelPriceResponseSchema>;
