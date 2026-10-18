import type {LifeProject,ResearchRequest,ProductCurrency,ProductMetadata} from '../../../shared/contracts/index.js';
export interface ProductRecord {
 title:string;description:string;url:string;imageUrl:string|null;priceMinor:number|null;currency:ProductCurrency|null;
 condition:'new'|'used'|'refurbished'|'unknown';availability:'in_stock'|'out_of_stock'|'unknown';seller:string|null;location:string|null;shippingCostMinor:number|null;fetchedAt:string;metadata:ProductMetadata;
}
export interface ProductContext {request:ResearchRequest;project:LifeProject;country:string|null;currency:ProductCurrency;scopeKey:string}
export interface ProductCapabilities {id:string;environment?:'production'|'sandbox';countries:readonly string[];categories:readonly string[];excludedCategories?:readonly string[];conditionFilters:readonly string[];images:boolean;shipping:boolean;requiresAuthentication:boolean;details:boolean;state:'available'|'requires_credentials'|'requires_partner_approval'|'disabled';reason:string}
export interface ProductProvider {getCapabilities():ProductCapabilities;supports(context:ProductContext):boolean;searchProducts(context:ProductContext,signal?:AbortSignal):Promise<{records:ProductRecord[];candidateCount:number;invalidCount:number}>;getProductDetails(id:string,context:ProductContext,signal?:AbortSignal):Promise<ProductRecord>}
