import { z } from 'zod';

const minor = z.number().int().min(0).max(1_000_000_000);
const date = z.string().date();
const text = z.string().trim().min(1).max(200);
/** Exact Finnish quote request fields, except the identity number, which is transient. */
export const HomeInsuranceDetailsSchema = z.object({
  streetAddress: text, city: text, postalCode: z.string().regex(/^\d{5}$/, 'Use a five-digit Finnish postal code'),
  policyHolderPostalCode: z.string().regex(/^\d{5}$/, 'Use a five-digit Finnish postal code'),
  livingSpace: z.number().int().min(1).max(10000),
  householderType: z.enum(['Apartment', 'RowHouse', 'PairHouse']), startDate: date,
}).strict();
export const HomeInsuranceDraftSchema = HomeInsuranceDetailsSchema.partial().strict();
export const IfPremiumSchema = z.object({
  amountMinor: minor, grossMinor: minor, discountMinor: minor, currency: z.literal('EUR'),
  billingPeriod: z.string().min(1).max(80), periodMonths: z.union([z.literal(1), z.literal(12)]).nullable(),
}).strict();
export const IfCoverageSchema = z.object({
  name: text, selected: z.boolean(), suggested: z.boolean(),
  items: z.array(z.object({id:text, name:text, description:z.string().max(10000).nullable()}).strict()).max(100),
  premiums: z.array(IfPremiumSchema).max(20),
}).strict();
export const IfQuoteSchema = z.object({
  id: z.string().uuid(), provider: z.literal('If'), environment: z.enum(['sandbox','live']),
  receivedAt: z.string().datetime(), validTo: date, activationDateFrom: date,
  details: HomeInsuranceDetailsSchema, inputFingerprint:z.string().optional(), premiums: z.array(IfPremiumSchema).max(20),
  coverages: z.array(IfCoverageSchema).max(20), warnings: z.array(z.string().max(1000)).max(20),
  terms: z.array(z.object({name:text, url:z.string().url().refine(s=>{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password;})}).strict()).max(20),
}).strict();
export const HomeInsuranceExpenseSchema = z.object({
  quoteId:z.string().uuid(), status:z.literal('proposed'), premiumMinor:minor,
  billingPeriod:z.string().min(1).max(80), periodMonths:z.union([z.literal(1),z.literal(12)]),
  planningMonths:z.number().int().min(1).max(36), installments:z.number().int().min(1).max(36),
  plannedMinor:minor, annualEquivalentMinor:minor, createdAt:z.string().datetime(),
}).strict();
export const HomeInsuranceStateSchema = z.object({
  details:HomeInsuranceDraftSchema, quote:IfQuoteSchema.nullable(), expense:HomeInsuranceExpenseSchema.nullable(),
}).strict();
export const HomeInsuranceStatusSchema = z.object({
  available:z.boolean(), environment:z.enum(['sandbox','live','unavailable']), message:z.string(),
  documentationUrl:z.literal('https://developer.if-insurance.com/apis/property/householder-insurance-apis-finland/documentation'),
}).strict();
export const HomeInsuranceResponseSchema = z.object({status:HomeInsuranceStatusSchema,state:HomeInsuranceStateSchema}).strict();
export const IfQuoteRequestSchema = z.object({
  details:HomeInsuranceDetailsSchema, personalIdentityNumber:z.string().trim().toUpperCase().regex(/^\d{6}[+\-ABCDEFUVWXY]\d{3}[0-9A-Y]$/, 'Enter a Finnish personal identity number'), consent:z.literal(true),
}).strict();
export const AddIfExpenseRequestSchema = z.object({quoteId:z.string().uuid(),premiumIndex:z.number().int().min(0).max(19),planningMonths:z.number().int().min(1).max(36)}).strict();
export type HomeInsuranceDetails = z.infer<typeof HomeInsuranceDetailsSchema>;
export type HomeInsuranceDraft = z.infer<typeof HomeInsuranceDraftSchema>;
export type HomeInsuranceState = z.infer<typeof HomeInsuranceStateSchema>;
export type HomeInsuranceStatus = z.infer<typeof HomeInsuranceStatusSchema>;
export type IfQuote = z.infer<typeof IfQuoteSchema>;
export type IfQuoteRequest = z.infer<typeof IfQuoteRequestSchema>;
export type IfPremium = z.infer<typeof IfPremiumSchema>;
export type HomeInsuranceExpense = z.infer<typeof HomeInsuranceExpenseSchema>;
export type AddIfExpenseRequest = z.infer<typeof AddIfExpenseRequestSchema>;
