import {
  SchemeStatus,
  ConditionType,
  MatchType,
  AggregationBasis,
  ConditionBasis,
  RewardType
} from '../enums/scheme.enums';

export interface IApplicableTo {
  warehouseIds?: string[];
  channelIds?: string[];
  businessTypeIds?: string[];
  productIds?: string[];
  brandIds?: string[];
  categoryIds?: string[];
  subcategoryIds?: string[];
  outletIds?: string[];
}

export interface IProductCriteria {
  productId: string;
  minQty?: number;
  maxQty?: number;
  brandId?: string;
  categoryId?: string;
  subcategoryId?: string;
}

export interface IComboCriteria {
  matchType: MatchType;
  productIds: IProductCriteria[];
  minTotalQty?: number;
  maxTotalQty?: number;
}

export interface IAssortedCriteria {
  aggregationBasis: AggregationBasis;
  productIds: string[];
  brandIds?: string[];
  categoryIds?: string[];
  subcategoryIds?: string[];
  minValue: number;
  maxValue?: number;
}

export interface IInvoiceCriteria {
  conditionBasis: ConditionBasis;
  minValue: number;
  maxValue?: number;
}

export interface ILineItemFilter {
  category?: string;
  productIds?: string[];
  brandIds?: string[];
  categoryIds?: string[];
  subcategoryIds?: string[];
}

export interface ILineItemCriteria {
  filterBy: ILineItemFilter;
  minLineTotal: number;
  maxLineTotal?: number;
}

export interface IProratedCriteria {
  productIds: string[];
  brandIds?: string[];
  categoryIds?: string[];
  subcategoryIds?: string[];
  proratedPer: number;
  minQty?: number;
  maxQty?: number;
}

export interface IFlexibleProductCriteria {
  productIds?: string[];
  brandIds?: string[];
  categoryIds?: string[];
  subcategoryIds?: string[];
  allowAnyProduct?: boolean;
  minValue: number;
  maxValue?: number;
  minQty?: number;
  maxQty?: number;
}

export interface IFreeProductReward {
  productId: string;
  quantity: number;
  discountType?: string;
  discountValue?: number;
}

export interface IProductDiscountReward {
  productId: string;
  quantity: number;
  type: 'discountPercent' | 'discountFixed';
  value: number;
  maxDiscountAmount?: number;
}

export interface IReward {
  type: RewardType;
  value?: number;
  maxRewardAmount?: number;
  products?: IFreeProductReward[];
  discountedProducts?: IProductDiscountReward[];
  maxApplications?: number;
}

export interface ICondition {
  conditionType: ConditionType;
  priority: number;
  isProRated?: boolean;
  isAvailableForHalf?: boolean;
  criteria: IComboCriteria | IAssortedCriteria | IInvoiceCriteria | ILineItemCriteria | IProratedCriteria | IFlexibleProductCriteria;
  reward: IReward;
}

export interface IScheme {
  schemeId: string;
  schemeName: string;
  description: string;
  validFrom: Date;
  validTo: Date;
  maxRewardPerInvoice: number;
  applicableTo: IApplicableTo;
  conditions: ICondition[];
  status: SchemeStatus;
  createdBy: string;
  mutualExclusionGroup?: string;
}

export interface ISchemeResponse extends IScheme { }

export interface ISchemeListResponse {
  totalItems: number;
  totalPages: number;
  skip: number;
  limit: number;
  items: IScheme[];
}

export interface ISchemeQuery {
  schemeId?: string;
  schemeName?: string;
  status?: SchemeStatus;
  validFrom?: Date;
  validTo?: Date;
  createdBy?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface IProductItem {
  productId: string;
  quantity: number;
  unitPrice?: number;
  weight?: number;
  brandId?: string;
  categoryId?: string;
  subcategoryId?: string;
  uom?: string; // Unit of Measurement (e.g., 'BOX', 'EA', 'KG')
  unitPerCase?: Array<{
    numerator: number;
    buom: string; // Base UOM
    denominator: number;
    auom: string; // Alternate UOM
  }>; // UOM conversion factors
}

export interface ICalculatedReward {
  schemeId: string;
  schemeName: string;
  conditionType: ConditionType;
  priority: number;
  rewardType: RewardType;
  rewardValue: number;
  rewardAmount: number;
  freeProducts?: IFreeProductReward[];
  discountedProducts?: IProductDiscountReward[];
  appliedQuantity: number;
  totalDiscount: number;
  description: string;
  discountPercentage?: number;
  isCapped?: boolean;
  maxRewardAmount?: number;
  calculatedDiscountAmount?: number;
}

export interface ISchemeApplicability {
  schemeId: string;
  schemeName: string;
  reason?: string;
  blockingSchemes?: string[];
  status?: 'applied' | 'blocked' | 'not_applicable' | 'excluded';
}

export interface IRewardCalculationResponse {
  totalDiscount: number;
  totalRewardAmount: number;
  appliedSchemes: ICalculatedReward[];
  availableSchemes: ISchemeApplicability[];
  summary: {
    totalProducts: number;
    totalQuantity: number;
    totalValue: number;
    totalValueAfterDiscount: number;
    schemesApplied: number;
    freeProducts: IFreeProductReward[];
    discountedProducts?: IProductDiscountReward[];
    discountValue: number;
  };
}

export interface IProductRecommendation {
  productId: string;
  productName?: string;
  unitPrice?: number;
  brandId?: string;
  categoryId?: string;
  subcategoryId?: string;
  recommendedQuantity: number;
  additionalCost: number;
  potentialDiscount: number;
  schemeId: string;
  schemeName: string;
  conditionType: ConditionType;
  description: string;
  priority: number;
}

export interface ISchemeRecommendationResponse {
  recommendations: IProductRecommendation[];
  summary: {
    totalRecommendations: number;
    totalAdditionalCost: number;
    totalPotentialDiscount: number;
    schemesConsidered: number;
  };
}

/**
 * Parameters for fetching candidate schemes
 */
export interface FetchCandidateSchemesParams {
  warehouseId: string;
  channelId: string;
  businessTypeId: string;
  includeSchemes?: string[];
  excludeSchemes?: string[];
  now: Date;
}

/**
* Parameters for fetching missing excluded schemes
*/
export interface FetchMissingExcludedSchemesParams {
  schemeIds: string[];
  now: Date;
}

/**
* Parameters for fetching all available schemes
*/
export interface FetchAllAvailableSchemesParams {
  warehouseId: string;
  channelId: string;
  businessTypeId: string;
  outletId?: string;
  now: Date;
}

/**
 * Logger callback function type
 */
export type LoggerCallback = (level: 'log' | 'debug' | 'warn' | 'error', message: string) => void;

/**
 * Product data provider callbacks for fetching product-related data
 * These replace HTTP service calls - service layer implements these callbacks
 */
export interface IProductDataProvider {
  /**
   * Get product capacity in kg
   * @param productId Product ID
   * @returns Capacity in kg, or 0 if not available
   */
  getProductCapacityInKg?: (productId: string) => Promise<number>;

  /**
   * Get product UOM details (baseUOM, unitPerCase)
   * @param productId Product ID
   * @returns UOM details or null if not available
   */
  getProductUomDetails?: (productId: string) => Promise<{
    baseUom?: string;
    unitPerCase?: Array<{
      numerator: number;
      buom: string;
      denominator: number;
      auom: string;
    }>;
  } | null>;

  /**
   * Get pricing group products mapping
   * @param productIds Array of product IDs
   * @returns Array of pricing group product mappings
   */
  getPricingGroupProducts?: (productIds: string[]) => Promise<any[]>;

  /**
   * Get pricing groups
   * @param groupIds Array of pricing group IDs
   * @returns Array of pricing groups
   */
  getPricingGroups?: (groupIds: string[]) => Promise<any[]>;
}

/**
* Parameters for calculateReward function
*/
export interface CalculateRewardParams {
  products: IProductItem[];
  warehouseId: string;
  channelId?: string;
  businessTypeId?: string;
  outletId?: string;
  includeSchemes?: string[];
  excludeSchemes?: string[];

  // Required callback functions - service layer handles query building
  fetchCandidateSchemes: (params: FetchCandidateSchemesParams) => Promise<IScheme[]>;
  fetchMissingExcludedSchemes?: (params: FetchMissingExcludedSchemesParams) => Promise<IScheme[]>;
  fetchAllAvailableSchemes: (params: FetchAllAvailableSchemesParams) => Promise<IScheme[]>;
  logger?: LoggerCallback;

  // Optional product data provider callbacks - replaces HTTP service calls
  productDataProvider?: IProductDataProvider;

  // Optional performance monitoring callback
  performanceMonitor?: PerformanceMonitorCallback;
}

/**
 * Performance metrics collected during reward calculation
 */
export interface IPerformanceMetrics {
  totalDuration: number; // Total calculation time in milliseconds
  fetchSchemesDuration?: number; // Time spent fetching schemes
  evaluationDuration?: number; // Time spent evaluating schemes
  callbackDurations?: {
    fetchCandidateSchemes?: number;
    fetchMissingExcludedSchemes?: number;
    fetchAllAvailableSchemes?: number;
    getProductCapacityInKg?: number;
    getProductUomDetails?: number;
    getPricingGroupProducts?: number;
    getPricingGroups?: number;
  };
  schemeCounts?: {
    candidateSchemes: number;
    evaluatedSchemes: number;
    appliedSchemes: number;
    availableSchemes: number;
  };
}

/**
 * Performance monitoring callback function
 * Called after calculation completes with performance metrics
 */
export type PerformanceMonitorCallback = (metrics: IPerformanceMetrics) => void;


export interface IApplicableTo {
  warehouseIds?: string[];
  channelIds?: string[];
  businessTypeIds?: string[];
  productIds?: string[];
  brandIds?: string[];
  categoryIds?: string[];
  subcategoryIds?: string[];
  outletIds?: string[];
}