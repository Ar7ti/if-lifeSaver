import { z } from 'zod';

const identity = z.string().trim().toUpperCase().regex(/^\d{6}[+\-ABCDEFUVWXY]\d{3}[0-9A-Y]$/);
export const CarPriceRequestSchema = z.object({
  registrationNumberFI: z.string().trim().toUpperCase().min(2).max(8),
  socialSecurityNumberFI: identity,
  driverBelow24YearsOfAge: z.boolean(),
  maximumMileagePerYearInKilometers: z.enum(['5000','10000','15000','20000','25000','30000','40000','50000','50001']),
  postCode: z.string().regex(/^\d{5}$/),
  streetAddress: z.string().trim().min(1).max(50),
  carPrice: z.number().finite().min(0).max(9999999.99),
  consent: z.literal(true),
}).strict();

const PriceSchema = z.object({amountMinor:z.number().int().min(0).max(1_000_000_000),period:z.string().min(1).max(20)}).strict();
export const CarPriceResponseSchema = z.object({
  provider:z.literal('If'), environment:z.enum(['sandbox','live']), receivedAt:z.string().datetime(),
  insuranceBrand:z.string().max(100), mtplName:z.string().max(50),
  mtplWithoutCasco:z.array(PriceSchema).max(3), mtplWithCasco:z.array(PriceSchema).max(3),
  cascoCoverages:z.array(z.object({name:z.string().min(1).max(80),recommended:z.boolean(),deductible:z.number().int().nonnegative().nullable(),prices:z.array(PriceSchema).max(3)}).strict()).max(10),
  terms:z.array(z.object({name:z.string().min(1).max(100),url:z.string().url()}).strict()).max(10),
  warning:z.string().max(500),
}).strict();
export const CarPriceStatusSchema = z.object({available:z.boolean(),environment:z.enum(['sandbox','live','unavailable']),message:z.string()}).strict();
export type CarPriceRequest = z.infer<typeof CarPriceRequestSchema>;
export type CarPriceResponse = z.infer<typeof CarPriceResponseSchema>;
