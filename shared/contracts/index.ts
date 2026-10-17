import { z } from 'zod';
import { ProtectionTimelineStateSchema, ProtectionTimelineResponseSchema } from './protection-timeline.js';
export * from './protection-timeline.js';
import { HomeInsuranceStateSchema } from './home-insurance.js';
export * from './home-insurance.js';
export * from './car-insurance.js';
import { ProtectionStateSchema, VehiclePlanningSchema, ProtectionCommandArgumentsSchema } from './protection.js';
export * from './protection.js';

/** Contract v1. All monetary fields ending in Minor are integer euro cents.
 * ResearchRequest.maxPrice is the sole major-unit input, e.g. 250 = €250.
 * All objects are declarative data; arbitrary code/HTML/config keys are rejected.
 */
export const CONTRACT_VERSION = '1.6.0';
export const ScenarioTypeSchema = z.enum(['moving','travel','car_purchase','home_furnishing','student_life','other']);
export type ScenarioType = z.infer<typeof ScenarioTypeSchema>;
export const IdSchema = z.string().uuid();
export const TimestampSchema = z.string().datetime();
export const MinorSchema = z.number().int().min(0).max(1_000_000_000);
export const CurrencySchema = z.literal('EUR');
export const TextSchema = z.string().trim().min(1).max(2000);
export const PublicUrlSchema = z.string().url().max(2048).refine(value => {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      host.includes('.') && !host.endsWith('.local') && !host.endsWith('.localhost') &&
      !host.endsWith('.internal') && !/^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.includes(':');
  } catch { return false; }
}, 'Expected a public HTTPS URL');
export const CategoryIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,49}$/);
export const WidgetTypeSchema = z.enum(['budget', 'product_catalog', 'shopping_cart', 'service_finder', 'scenario_comparison', 'risk_guardian', 'timeline', 'recommendations', 'task_list']);
export const WidgetConfigSchema = z.object({ category: CategoryIdSchema.optional(), sortBy: z.enum(['price', 'recommended', 'date']).optional(), compact: z.boolean().optional() }).strict();
export const GridSchema = z.object({ x: z.number().int().min(0).max(11), y: z.number().int().min(0).max(100), w: z.number().int().min(1).max(12), h: z.number().int().min(1).max(20) }).strict().refine(g => g.x + g.w <= 12, 'Widget exceeds 12-column grid');
export const WorkspaceWidgetSchema = z.object({ id: IdSchema, type: WidgetTypeSchema, title: z.string().min(1).max(100), position: GridSchema, visible: z.boolean(), dataRef: z.enum(['budget', 'researchResults', 'cart', 'scenarios', 'risks', 'tasks', 'recommendations']), config: WidgetConfigSchema }).strict();
export const WorkspaceSchema = z.object({ id: IdSchema, version: z.literal(1), title: z.string().min(1).max(120), widgets: z.array(WorkspaceWidgetSchema).max(20), updatedAt: TimestampSchema }).strict().refine(w => new Set(w.widgets.map(i => i.id)).size === w.widgets.length, 'Duplicate widget IDs');
export const WidgetPatchSchema = z.object({ id: IdSchema, position: GridSchema.optional(), visible: z.boolean().optional(), title: z.string().min(1).max(100).optional(), config: WidgetConfigSchema.optional() }).strict();
export const WorkspacePatchSchema = z.object({ widgets: z.array(WidgetPatchSchema).max(20), expectedRevision: z.number().int().nonnegative().optional() }).strict();
export const BudgetCategorySchema = z.object({ id: CategoryIdSchema, title: z.string().min(1).max(80), allocatedMinor: MinorSchema, committedMinor: MinorSchema, proposedMinor: MinorSchema }).strict();
export const BudgetSchema = z.object({ totalMinor: MinorSchema, currency: CurrencySchema, confirmed: z.boolean(), categories: z.array(BudgetCategorySchema).max(20), emergencyReserveMinor: MinorSchema, allocatedMinor: MinorSchema, committedMinor: MinorSchema, proposedMinor: MinorSchema, remainingMinor: z.number().int().safe(), availableMinor: z.number().int().safe(), warnings: z.array(z.string()), recurringProposedMinor: MinorSchema.optional() }).strict();
export const SellerSchema = z.object({ name: z.string().min(1).max(200).nullable(), type: z.enum(['company', 'private', 'unknown']), publicProfileUrl: PublicUrlSchema.nullable(), verified: z.boolean() }).strict();
export const OfferSchema = z.object({
  id: IdSchema, category: CategoryIdSchema, kind: z.enum(['product', 'service']), title: TextSchema, description: z.string().max(4000), priceMinor: MinorSchema.nullable(), currency: CurrencySchema,
  priceStatus: z.enum(['verified', 'estimated', 'unknown', 'demo']), sourceUrl: PublicUrlSchema.nullable(), sourceName: z.string().max(200), seller: SellerSchema, imageUrl: PublicUrlSchema.nullable(), location: z.string().max(200).nullable(),
  delivery: z.object({ available: z.boolean().nullable(), costMinor: MinorSchema.nullable(), details: z.string().max(2000) }).strict(),
  condition: z.enum(['new', 'used', 'refurbished', 'unknown', 'not_applicable']), availability: z.enum(['in_stock', 'out_of_stock', 'unknown', 'demo']),
  lastCheckedAt: TimestampSchema, verificationStatus: z.enum(['source_checked', 'unverified', 'demo']), recommendation: z.string().max(2000), score: z.number().min(0).max(100), evidence: z.array(z.string().max(2000)).max(20),
}).strict().superRefine((o, ctx) => {
  if (o.priceStatus === 'unknown' && o.priceMinor !== null) ctx.addIssue({code:'custom', message:'Unknown prices must be null', path:['priceMinor']});
  if (o.priceStatus === 'verified' && (o.priceMinor === null || !o.sourceUrl || o.verificationStatus !== 'source_checked')) ctx.addIssue({code:'custom', message:'Verified prices require a checked source and price'});
  if (o.verificationStatus === 'source_checked' && !o.sourceUrl) ctx.addIssue({code:'custom', message:'Checked sources require a source URL'});
});
export const CartItemSchema = z.object({ id: IdSchema, offerId: IdSchema.nullable(), title: TextSchema, category: CategoryIdSchema, quantity: z.number().int().min(1).max(100), unitPriceMinor: MinorSchema, deliveryCostMinor: MinorSchema.nullable(), currency: CurrencySchema, status: z.enum(['proposed', 'selected']), sourceUrl: PublicUrlSchema.nullable(), priceStatus: z.enum(['verified', 'estimated', 'demo']), addedAt: TimestampSchema }).strict();
export const ProjectTaskSchema = z.object({ id: IdSchema, title: TextSchema, category: CategoryIdSchema, status: z.enum(['todo', 'in_progress', 'done']), dueDate: z.string().date().nullable(), origin: z.enum(['user', 'ai', 'template']), notes: z.string().max(2000) }).strict();
export const RiskSchema = z.object({ id: z.string().min(1), category: z.enum(['budget', 'delivery', 'seller', 'transport', 'planning', 'contract']), severity: z.enum(['low', 'medium', 'high']), title: TextSchema, explanation: TextSchema, evidence: z.array(TextSchema).min(1), preventiveAction: TextSchema, status: z.enum(['open', 'acknowledged', 'resolved']), sourceUrl: PublicUrlSchema.nullable() }).strict();
export const SimulationScenarioSchema = z.object({ id: z.enum(['economy', 'balanced', 'comfort']), name: z.enum(['Economy', 'Balanced', 'Comfort']), estimatedTotalMinor: MinorSchema, verifiedCostMinor: MinorSchema, estimatedCostMinor: MinorSchema, remainingMinor: z.number().int().safe(), emergencyReserveMinor: MinorSchema, withinBudget: z.boolean(), convenience: z.enum(['low', 'medium', 'high']), effort: z.enum(['low', 'medium', 'high']), selectedOfferIds: z.array(IdSchema), lockedCartItemIds: z.array(IdSchema), risks: z.array(z.string()), tradeOffs: z.array(z.string()), missingData: z.array(z.string()), calculatedAt: TimestampSchema, basedOnRevision: z.number().int().nonnegative() }).strict();
export const ResearchRequestSchema = z.object({ category: CategoryIdSchema, location: z.string().trim().min(1).max(200).optional(), maxPrice: z.number().nonnegative().max(10_000_000).multipleOf(0.01).optional(), kind: z.enum(['product', 'service']).default('product'), preferences: z.array(z.string().max(200)).max(20).default([]) }).strict();
export const ResearchResultSchema = z.object({ id: IdSchema, category: CategoryIdSchema, status: z.enum(['completed', 'limited', 'unavailable']), mode: z.enum(['live', 'demo', 'unavailable']), offers: z.array(OfferSchema).max(30), warnings: z.array(z.string()), searchedAt: TimestampSchema, query: z.string().max(2000) }).strict();
export const TaskInputSchema = ProjectTaskSchema.pick({title:true, category:true, dueDate:true, notes:true});
export const AllocationInputSchema = z.object({ categories: z.array(z.object({ id: CategoryIdSchema, title: z.string().min(1).max(80), allocatedMinor: MinorSchema }).strict()).min(1).max(20), emergencyReserveMinor: MinorSchema }).strict();
export const ActionArguments = {
  protection_action: ProtectionCommandArgumentsSchema,
  propose_budget_allocation: AllocationInputSchema,
  research_products: ResearchRequestSchema,
  research_services: ResearchRequestSchema,
  update_workspace: WorkspacePatchSchema,
  create_tasks: z.object({ tasks: z.array(TaskInputSchema).max(20) }).strict(),
  propose_cart_item: z.object({ offerId: IdSchema, quantity: z.number().int().min(1).max(100) }).strict(),
  compare_scenarios: z.object({}).strict(),
  identify_risks: z.object({}).strict(),
  draft_seller_message: z.object({ offerId: IdSchema, language: z.enum(['en', 'fi']).default('en') }).strict(),
};
export const AgentCommandSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('protection_action'),arguments:ProtectionCommandArgumentsSchema}).strict(),
  z.object({type:z.literal('propose_budget_allocation'), arguments:ActionArguments.propose_budget_allocation}).strict(),
  z.object({type:z.literal('research_products'), arguments:ActionArguments.research_products}).strict(),
  z.object({type:z.literal('research_services'), arguments:ActionArguments.research_services}).strict(),
  z.object({type:z.literal('update_workspace'), arguments:ActionArguments.update_workspace}).strict(),
  z.object({type:z.literal('create_tasks'), arguments:ActionArguments.create_tasks}).strict(),
  z.object({type:z.literal('propose_cart_item'), arguments:ActionArguments.propose_cart_item}).strict(),
  z.object({type:z.literal('compare_scenarios'), arguments:ActionArguments.compare_scenarios}).strict(),
  z.object({type:z.literal('identify_risks'), arguments:ActionArguments.identify_risks}).strict(),
  z.object({type:z.literal('draft_seller_message'), arguments:ActionArguments.draft_seller_message}).strict(),
]);
export const AgentActionSchema = z.object({ id: IdSchema, command: AgentCommandSchema, status: z.enum(['proposed', 'applied', 'rejected', 'failed']), requiresConfirmation: z.boolean(), explanation: z.string().max(2000), result: z.string().max(4000).nullable(), createdAt: TimestampSchema }).strict();
export const PreferencesSchema = z.object({ vehicle:VehiclePlanningSchema.optional(), monthlyBudgetMinor:MinorSchema.optional(), moveDate: z.string().date().nullable(), origin: z.string().max(200).nullable(), householdSize: z.number().int().min(1).max(30).nullable(), deliveryRequired: z.boolean().nullable(), allowUsed: z.boolean().nullable(), priorities: z.array(z.string().max(200)).max(20), notes: z.string().max(4000), startDate: z.string().date().nullable().optional(), endDate: z.string().date().nullable().optional(), durationDays: z.number().int().min(1).max(366).nullable().optional(), travelers: z.number().int().min(1).max(30).nullable().optional(), ownsFurniture: z.boolean().nullable().optional(), ownedItems: z.array(z.string().max(80)).max(50).optional(), vehicleType: z.string().max(100).nullable().optional(), useCase: z.string().max(300).nullable().optional() }).strict();
export const ClarificationFieldSchema = z.enum(['context','budget','destination','origin','startDate','endDate','durationDays','travelers','moveDate','householdSize','ownsFurniture','ownedItems','vehicleType','useCase']);
export const ClarificationSchema = z.object({id:IdSchema,field:ClarificationFieldSchema,question:z.string().min(1).max(500),status:z.enum(['pending','answered','dismissed','superseded']),createdAt:TimestampSchema,updatedAt:TimestampSchema,context:z.object({scenarioType:ScenarioTypeSchema,request:z.string().max(2000)}).strict(),answer:z.string().max(2000).nullable(),attempts:z.number().int().min(1).max(3)}).strict();
export const ConversationSchema = z.object({id:IdSchema,activeRequest:z.string().max(2000).nullable(),turns:z.array(z.object({id:IdSchema,role:z.enum(['user','assistant']),content:z.string().max(4000),createdAt:TimestampSchema}).strict()).max(12),clarifications:z.array(ClarificationSchema).max(40)}).strict();
export type ClarificationField = z.infer<typeof ClarificationFieldSchema>;
export type Clarification = z.infer<typeof ClarificationSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export const LifeProjectSchema = z.object({ id: IdSchema, revision: z.number().int().nonnegative(), title: z.string().min(1).max(120), scenarioType: ScenarioTypeSchema, location: z.string().max(200).nullable(), locale: z.enum(['en', 'fi']), originalMessage: TextSchema, status: z.enum(['planning', 'active', 'completed']), preferences: PreferencesSchema, assumptions: z.array(z.string()), confirmedFacts: z.array(z.string()), questions: z.array(z.string()), budget: BudgetSchema, cart: z.array(CartItemSchema).max(100), tasks: z.array(ProjectTaskSchema).max(200), workspace: WorkspaceSchema, researchResults: z.array(ResearchResultSchema).max(30), risks: z.array(RiskSchema), scenarios: z.array(SimulationScenarioSchema), actions: z.array(AgentActionSchema).max(200), protectionTimeline:ProtectionTimelineStateSchema.optional(), protection:ProtectionStateSchema.optional(), homeInsurance: HomeInsuranceStateSchema.optional(), conversation: ConversationSchema.optional(), answeredQuestions: z.record(z.string().max(500),z.string().max(2000)).optional(), categoryReasons: z.array(z.object({id:CategoryIdSchema,reason:TextSchema}).strict()).optional(), recommendationDetails: z.array(z.object({title:TextSchema,explanation:TextSchema,priority:z.enum(['high','medium','low']),action:TextSchema,reason:TextSchema}).strict()).optional(), recommendations: z.array(z.string()), aiMode: z.enum(['openai', 'local']), createdAt: TimestampSchema, updatedAt: TimestampSchema }).strict();
export const CreateProjectRequestSchema = z.object({message:TextSchema, locale:z.enum(['en','fi']).default('en')}).strict();
export const CreateProjectResponseSchema = z.object({project:LifeProjectSchema, workspace:WorkspaceSchema, questions:z.array(z.string())}).strict();
export const ProjectPatchSchema = z.object({title:z.string().min(1).max(120).optional(), location:z.string().min(1).max(200).optional(), status:z.enum(['planning','active','completed']).optional(), preferences:PreferencesSchema.partial().strict().optional(), answers:z.array(z.object({question:z.string().min(1).max(500),answer:TextSchema}).strict()).max(10).optional(), budget:z.object({totalMinor:MinorSchema.optional(), ...AllocationInputSchema.shape}).partial().strict().optional(), tasks:z.array(z.object({id:IdSchema,status:z.enum(['todo','in_progress','done'])}).strict()).max(200).optional(), expectedRevision:z.number().int().nonnegative().optional()}).strict();
export const AssistantRequestSchema = z.object({message:TextSchema, context:z.object({activeCategory:CategoryIdSchema.optional()}).strict().optional()}).strict();
export const AssistantResponseSchema = z.object({reply:z.string(), proposedActions:z.array(AgentActionSchema), workspacePatch:WorkspacePatchSchema.nullable()}).strict();
export const AddCartItemRequestSchema = z.union([
 z.object({offerId:IdSchema,quantity:z.number().int().min(1).max(100).default(1),status:z.enum(['proposed','selected']).default('selected')}).strict(),
 z.object({title:TextSchema,category:CategoryIdSchema,quantity:z.number().int().min(1).max(100).default(1),unitPriceMinor:MinorSchema,deliveryCostMinor:MinorSchema.nullable().default(null),status:z.enum(['proposed','selected']).default('selected'),sourceUrl:PublicUrlSchema.nullable().default(null)}).strict(),
]);
export const CartItemPatchSchema = z.object({quantity:z.number().int().min(1).max(100).optional(),status:z.enum(['proposed','selected']).optional(),unitPriceMinor:MinorSchema.optional(),deliveryCostMinor:MinorSchema.nullable().optional()}).strict();
export const CartResponseSchema = z.object({items:z.array(CartItemSchema),budget:BudgetSchema,revision:z.number().int().nonnegative()}).strict();
export const SellerMessageRequestSchema = z.object({offerId:IdSchema,language:z.enum(['en','fi']).default('en'),notes:z.string().max(1000).default('')}).strict();
export const SellerMessageResponseSchema = z.object({draft:z.string(),handoffUrl:PublicUrlSchema.nullable(),sent:z.literal(false),warnings:z.array(z.string())}).strict();
export const ConfirmActionRequestSchema = z.object({approved:z.boolean(),expectedRevision:z.number().int().nonnegative().optional()}).strict();
export const ErrorResponseSchema = z.object({error:z.object({code:z.string(),message:z.string(),details:z.record(z.string(),z.unknown()).optional()}).strict()}).strict();
export const ProtectionMilestoneResponseSchema = z.object({project:LifeProjectSchema,timeline:ProtectionTimelineResponseSchema}).strict();
export const ProjectResponseSchema = z.object({project:LifeProjectSchema}).strict();
export const WorkspaceResponseSchema = z.object({workspace:WorkspaceSchema,revision:z.number().int().nonnegative()}).strict();
export const ScenariosResponseSchema = z.object({scenarios:z.array(SimulationScenarioSchema)}).strict();
export const RisksResponseSchema = z.object({risks:z.array(RiskSchema)}).strict();
export const HealthResponseSchema = z.object({status:z.literal('ok'),ready:z.boolean(),contractVersion:z.string(),configuration:z.object({ai:z.enum(['openai','local']),research:z.enum(['live','demo','unavailable']),storage:z.enum(['local','memory']),authentication:z.boolean()}).strict()}).strict();

export type LifeProject = z.infer<typeof LifeProjectSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type WorkspaceWidget = z.infer<typeof WorkspaceWidgetSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
export type BudgetCategory = z.infer<typeof BudgetCategorySchema>;
export type Offer = z.infer<typeof OfferSchema>;
export type Seller = z.infer<typeof SellerSchema>;
export type CartItem = z.infer<typeof CartItemSchema>;
export type SimulationScenario = z.infer<typeof SimulationScenarioSchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type ProjectTask = z.infer<typeof ProjectTaskSchema>;
export type AgentAction = z.infer<typeof AgentActionSchema>;
export type AgentCommand = z.infer<typeof AgentCommandSchema>;
export type ResearchResult = z.infer<typeof ResearchResultSchema>;
export type ResearchRequest = z.infer<typeof ResearchRequestSchema>;
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>;
export type ProjectPatch = z.infer<typeof ProjectPatchSchema>;
export type WorkspacePatch = z.infer<typeof WorkspacePatchSchema>;
export type AssistantRequest = z.infer<typeof AssistantRequestSchema>;
export type AssistantResponse = z.infer<typeof AssistantResponseSchema>;
export type AddCartItemRequest = z.infer<typeof AddCartItemRequestSchema>;
export type CartItemPatch = z.infer<typeof CartItemPatchSchema>;
export type CartResponse = z.infer<typeof CartResponseSchema>;
export type SellerMessageRequest = z.infer<typeof SellerMessageRequestSchema>;
export type SellerMessageResponse = z.infer<typeof SellerMessageResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;
export type WorkspaceResponse = z.infer<typeof WorkspaceResponseSchema>;
export type ScenariosResponse = z.infer<typeof ScenariosResponseSchema>;
export type RisksResponse = z.infer<typeof RisksResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Optional-default wire inputs for consumers constructing requests. Request types
 * above describe the normalized values returned after schema.parse(). */
export type CreateProjectInput = z.input<typeof CreateProjectRequestSchema>;
export type ResearchInput = z.input<typeof ResearchRequestSchema>;
export type AddCartItemInput = z.input<typeof AddCartItemRequestSchema>;
export type SellerMessageInput = z.input<typeof SellerMessageRequestSchema>;
export type ConfirmActionInput = z.input<typeof ConfirmActionRequestSchema>;
