import type {
  AddCartItemInput, AssistantRequest, AssistantResponse, CartItemPatch, CartResponse, ConfirmActionInput,
  CreateProjectInput, CreateProjectResponse, HealthResponse, LifeProject, ProjectPatch, ResearchInput,
  ResearchResult, ScenariosResponse, SellerMessageInput, SellerMessageResponse, WorkspacePatch, WorkspaceResponse,
  HomeInsuranceDraft, HomeInsuranceResponseSchema, IfQuoteRequest, AddIfExpenseRequest,
} from '@contracts';
import type { z } from 'zod';
import type { DataSource } from '@/stores/settings';

/** One adapter per data source. Every method maps 1:1 to a route in server/docs/FRONTEND_HANDOFF.md. */
export interface LifeSimApi {
  readonly source: DataSource;
  health(): Promise<HealthResponse>;
  createProject(input: CreateProjectInput): Promise<CreateProjectResponse>;
  getProject(id: string): Promise<LifeProject>;
  patchProject(id: string, patch: ProjectPatch): Promise<LifeProject>;
  assistant(id: string, request: AssistantRequest): Promise<AssistantResponse>;
  research(id: string, request: ResearchInput): Promise<ResearchResult>;
  addCartItem(id: string, request: AddCartItemInput): Promise<CartResponse>;
  patchCartItem(id: string, itemId: string, patch: CartItemPatch): Promise<CartResponse>;
  deleteCartItem(id: string, itemId: string): Promise<CartResponse>;
  recalculateScenarios(id: string): Promise<ScenariosResponse>;
  patchWorkspace(id: string, patch: WorkspacePatch): Promise<WorkspaceResponse>;
  sellerMessage(id: string, request: SellerMessageInput): Promise<SellerMessageResponse>;
  confirmAction(id: string, actionId: string, body: ConfirmActionInput): Promise<LifeProject>;
  homeInsurance(id:string):Promise<z.infer<typeof HomeInsuranceResponseSchema>>;
  saveInsuranceDetails(id:string,details:HomeInsuranceDraft):Promise<LifeProject>;
  requestInsuranceQuote(id:string,body:IfQuoteRequest):Promise<LifeProject>;
  addInsuranceExpense(id:string,body:AddIfExpenseRequest):Promise<LifeProject>;
  removeInsuranceExpense(id:string):Promise<LifeProject>;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** A person-facing explanation that always names a way forward. */
export function describeError(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'NETWORK':
        return { title: "Can't reach Life Simulator", detail: 'Check that the service is running, then try again. You can also explore with demo data in Settings.' };
      case 'UPSTREAM_TIMEOUT':
      case 'TIMEOUT':
        return { title: 'This took too long', detail: 'The AI or search provider did not answer in time. Try again in a moment.' };
      case 'RATE_LIMITED':
        return { title: 'Too many requests', detail: 'Wait a few seconds, then try again.' };
      case 'AI_UNAVAILABLE':
        return { title: 'The AI planner is unavailable', detail: 'Try again shortly. Your saved plan is unchanged.' };
      case 'RESEARCH_UNAVAILABLE':
        return { title: 'Search is unavailable', detail: 'Live research is switched off or failing on the server. Add an option manually, or try again later.' };
      case 'CONFLICT':
        return { title: 'Your plan changed elsewhere', detail: `${error.message} The latest version has been loaded; try again.` };
      case 'STALE_RESEARCH':
        return { title: 'These results are out of date', detail: 'Your constraints changed after this search. Search again to get matching options.' };
      case 'NOT_FOUND':
        return { title: 'Not found', detail: `${error.message}. It may have been removed; go back to your projects.` };
      case 'UNAUTHORIZED':
        return { title: 'Access token required', detail: 'Add the shared access token in Settings, then try again.' };
      case 'CONTRACT_MISMATCH':
        return { title: 'Unexpected response', detail: 'The service answered in a format this app does not understand. Reload; if it persists, the app and API versions differ.' };
      default:
        return { title: 'Unable to complete that', detail: `${error.message.replace(/\.+$/, '')}. Try again in a moment.` };
    }
  }
  return { title: 'Unable to complete that', detail: 'Check your connection and try again. If it keeps happening, reload the page.' };
}
