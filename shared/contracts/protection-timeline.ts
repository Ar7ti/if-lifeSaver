import { z } from 'zod';

export const ProtectionMilestoneIdSchema = z.enum(['home_review','transport_check','confirm_details','moving_day','home_safety']);
export const ProtectionMilestoneStatusSchema = z.enum(['upcoming','ready','past_suggested_date','completed','needs_review']);
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const ProtectionTimelineRecordSchema = z.object({
  id:ProtectionMilestoneIdSchema,
  completedAt:z.string().datetime().nullable(),
  completedContext:fingerprint.nullable(),
  history:z.array(z.object({at:z.string().datetime(),action:z.enum(['completed','reopened']),contextFingerprint:fingerprint}).strict()).max(20),
}).strict().refine(r=>(r.completedAt===null)===(r.completedContext===null),'Completion time and context must be saved together');
export const ProtectionTimelineStateSchema = z.object({version:z.literal(1),records:z.array(ProtectionTimelineRecordSchema).max(5)}).strict()
  .refine(s=>new Set(s.records.map(r=>r.id)).size===s.records.length,'Duplicate protection milestones');
export const ProtectionMilestoneSchema = z.object({
  id:ProtectionMilestoneIdSchema,title:z.string().min(1).max(150),
  phase:z.enum(['before','during','after']),timing:z.string().max(100),suggestedDate:z.string().date().nullable(),
  status:ProtectionMilestoneStatusSchema,completedAt:z.string().datetime().nullable(),contextFingerprint:fingerprint,
  explanation:z.string().max(1000),overlooked:z.string().max(1000),steps:z.array(z.string().max(500)).max(5),
  resource:z.object({title:z.string().max(100),url:z.string().url().refine(u=>new URL(u).origin==='https://www.if.fi')}).strict(),
  reviewAction:z.boolean(),
}).strict();
export const ProtectionTimelineResponseSchema = z.object({
  scenario:z.literal('moving'),destination:z.string().nullable(),origin:z.string().nullable(),moveDate:z.string().date().nullable(),
  asOfDate:z.string().date(),reviewStatus:z.string().max(100),reviewNote:z.string().max(500),
  completed:z.number().int().min(0).max(5),total:z.literal(5),milestones:z.array(ProtectionMilestoneSchema).length(5),
}).strict();
export const ProtectionMilestonePatchSchema = z.object({
  completed:z.boolean(),expectedContextFingerprint:fingerprint,expectedRevision:z.number().int().nonnegative().optional(),
}).strict();
export type ProtectionMilestoneId = z.infer<typeof ProtectionMilestoneIdSchema>;
export type ProtectionTimelineState = z.infer<typeof ProtectionTimelineStateSchema>;
export type ProtectionTimeline = z.infer<typeof ProtectionTimelineResponseSchema>;
export type ProtectionMilestone = z.infer<typeof ProtectionMilestoneSchema>;
export type ProtectionMilestonePatch = z.infer<typeof ProtectionMilestonePatchSchema>;
