import {z} from 'zod';
import {ProductImageUrlSchema} from './shopping.js';
export const ProductCurrencySchema=z.enum(['EUR','GBP','USD','CAD','AUD','CHF','PLN','JPY']);
export type ProductCurrency=z.infer<typeof ProductCurrencySchema>;
export const productExponent=(currency:string)=>currency==='JPY'?0:2;
export const ProductSearchShape={
 productSource:z.enum(['auto','web','ebay','serpapi']).optional(),country:z.string().regex(/^[A-Z]{2}$/).optional(),currency:ProductCurrencySchema.optional(),
 searchTerms:z.string().trim().min(1).max(100).optional(),providerCategoryId:z.string().regex(/^\d{1,12}$/).optional(),deliveryPostalCode:z.string().regex(/^[A-Za-z0-9 -]{2,12}$/).optional(),
};
export const ProductMetadataSchema=z.object({
 provider:z.enum(['ebay','serpapi','structured_metadata']),sourceProductId:z.string().min(1).max(200),marketplaceId:z.string().max(40).nullable(),marketplaceCountry:z.string().regex(/^[A-Z]{2}$/).nullable(),
 sourceMode:z.enum(['production','sandbox','supplied_fixture']),retrievalMethod:z.enum(['provider_api','json_ld','product_metadata']),
 linkDestination:z.enum(['google_product','retailer','unknown']).optional(),
 priceType:z.enum(['fixed','auction','subscription','unknown']),shippingCostType:z.enum(['fixed','calculated','unknown']),
 deliveryCountry:z.string().regex(/^[A-Z]{2}$/).nullable(),deliverySupported:z.boolean().nullable(),
 sellerCountry:z.string().regex(/^[A-Z]{2}$/).nullable(),additionalImages:z.array(ProductImageUrlSchema).max(8),
 attributes:z.record(z.string().max(80),z.string().max(300)).refine(x=>Object.keys(x).length<=20),
 providerConvertedPrice:z.object({amountMinor:z.number().int().nonnegative().max(1e9),currency:ProductCurrencySchema}).strict().optional(),
 originalPrice:z.object({amountMinor:z.number().int().nonnegative().max(1e9),currency:ProductCurrencySchema}).strict().optional(),
 taxInformation:z.string().max(1000),knownTotalMinor:z.number().int().nonnegative().max(1e9).nullable(),
 fieldProvenance:z.record(z.string().max(80),z.object({path:z.string().max(200),method:z.enum(['provider_api','json_ld','product_metadata','calculation']),retrievedAt:z.string().datetime()}).strict()).refine(x=>Object.keys(x).length<=30),
}).strict();
export type ProductMetadata=z.infer<typeof ProductMetadataSchema>;
export const ProductRouteSchema=z.object({provider:z.string().max(80),state:z.enum(['available','requires_credentials','requires_partner_approval','discovery_only','unavailable','disabled']),reason:z.string().max(700),marketplace:z.string().max(40).nullable()}).strict();
export const ProductDiagnosticsSchema=z.object({provider:z.enum(['ebay','serpapi']),mode:z.enum(['production','sandbox']),durationMs:z.number().nonnegative(),apiRequests:z.number().int().nonnegative(),cacheHits:z.number().int().nonnegative(),candidateCount:z.number().int().nonnegative(),acceptedCount:z.number().int().nonnegative(),rejectedCount:z.number().int().nonnegative(),errorCategory:z.string().max(80).nullable(),estimatedOpenAiCostUsd:z.literal(0)}).strict();
export const ProductResearchShape={productRoutes:z.array(ProductRouteSchema).max(10).optional(),productDiagnostics:ProductDiagnosticsSchema.optional(),providerOrder:z.boolean().optional()};
