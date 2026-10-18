import { z } from 'zod';

export const ResearchConstraintsShape = {
  condition:z.enum(['new','used','refurbished','any']).optional(),
  limit:z.number().int().min(1).max(15).optional(),
  sort:z.enum(['recommended','price_asc']).optional(),
  localOnly:z.boolean().optional(),
  pricePeriod:z.enum(['one_time','month']).optional(),
  purpose:z.enum(['offers','information']).optional(),
};
export const ReportedRateSchema=z.object({amountMinor:z.number().int().min(0).max(1_000_000_000),period:z.enum(['month','night','person']),evidence:z.string().max(1800)}).strict();
export const EvidenceFieldSchema=z.enum(['title','category','price','condition','location','origin','availability','delivery','image','seller','dates','travelers','sourceType']);
export const FieldEvidenceSchema=z.object({
  status:z.enum(['source_supported','user_supplied','estimated','unknown','conflicting']),
  snippet:z.string().max(700).nullable(),
  provenance:z.enum(['cited_search_summary','provider_api','structured_metadata','user','none']),
}).strict();
export const MissingEvidenceSchema=z.object({field:EvidenceFieldSchema,required:z.boolean(),reason:z.string().max(300)}).strict();
export const ResearchCandidateShape={
  eligibilityStatus:z.enum(['supported','potential']).optional(),
  evidenceByField:z.record(EvidenceFieldSchema,FieldEvidenceSchema).optional(),
  missingEvidence:z.array(MissingEvidenceSchema).max(15).optional(),
  confidenceExplanation:z.string().max(800).optional(),
};
export const ResearchRejectionSchema=z.object({sourceUrl:z.string().url().max(2048).nullable(),title:z.string().max(300),reasons:z.array(z.string().max(80)).min(1).max(15)}).strict();
export const ResearchSummarySchema=z.object({supportedCount:z.number().int().nonnegative(),potentialCount:z.number().int().nonnegative(),rejectedCount:z.number().int().nonnegative(),sourceCount:z.number().int().nonnegative(),explanation:z.string().max(1500)}).strict();
export const ResearchRefinementSchema=z.object({id:z.enum(['review_details','expand_location','increase_budget','condition_any','retry_sources']),title:z.string().max(100),explanation:z.string().max(300),message:z.string().max(500)}).strict();
export const ResearchFeedbackTypeSchema=z.enum(['useful','not_relevant','outdated','incorrect_details']);
export const ResearchFeedbackInputSchema=z.object({offerId:z.string().uuid(),type:ResearchFeedbackTypeSchema.nullable(),expectedRevision:z.number().int().nonnegative().optional()}).strict();
export const ResearchFeedbackSchema=z.object({resultId:z.string().uuid(),offerId:z.string().uuid(),sourceKey:z.string().max(2048),type:ResearchFeedbackTypeSchema,updatedAt:z.string().datetime()}).strict();
export type EvidenceField=z.infer<typeof EvidenceFieldSchema>;
export type ResearchFeedbackInput=z.infer<typeof ResearchFeedbackInputSchema>;
export type ResearchFeedback=z.infer<typeof ResearchFeedbackSchema>;

/** Project-local source identity. Never used as authorization or a fetch URL. */
export function researchSourceKey(url:string|null|undefined,offerId:string){
 if(!url)return `offer:${offerId}`;
 try{const u=new URL(url);u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^(?:gclid|fbclid)$/i.test(k))u.searchParams.delete(k);u.searchParams.sort();return u.href;}catch{return `offer:${offerId}`;}
}
export function researchFeedbackFor(project:{researchFeedback?:ResearchFeedback[]},offer:{id:string;sourceUrl?:string|null}){
 const key=researchSourceKey(offer.sourceUrl,offer.id);
 return project.researchFeedback?.find(f=>f.sourceKey===key);
}
export function researchDismissed(project:{researchFeedback?:ResearchFeedback[]},offer:{id:string;sourceUrl?:string|null}){const f=researchFeedbackFor(project,offer);return !!f&&f.type!=='useful';}
export const ResearchDiagnosticsSchema=z.object({
  requestId:z.string().uuid(),operation:z.literal('research'),providerMode:z.literal('live'),model:z.string().max(200),
  stage:z.enum(['search','extraction','validation','completed','failed']),failureStage:z.enum(['search','extraction','validation']).optional(),toolExecuted:z.boolean(),searchCalls:z.number().int().nonnegative(),
  sourceCount:z.number().int().nonnegative(),passageCount:z.number().int().nonnegative(),candidateCount:z.number().int().nonnegative(),
  acceptedCount:z.number().int().nonnegative(),rejectedCount:z.number().int().nonnegative(),duplicateCount:z.number().int().nonnegative(),
  rejectionReasons:z.record(z.string().max(50),z.number().int().nonnegative()),durationMs:z.number().nonnegative(),
  inputTokens:z.number().int().nonnegative().nullable(),outputTokens:z.number().int().nonnegative().nullable(),
  estimatedCostUsd:z.number().nonnegative().nullable(),errorCode:z.string().max(80).nullable(),
  sourceStrategy:z.string().max(80).optional(),supportedCount:z.number().int().nonnegative().optional(),potentialCount:z.number().int().nonnegative().optional(),
  missingEvidenceCounts:z.record(z.string().max(50),z.number().int().nonnegative()).optional(),extractionFailures:z.number().int().nonnegative().optional(),
}).strict();
export type ResearchDiagnostics=z.infer<typeof ResearchDiagnosticsSchema>;
