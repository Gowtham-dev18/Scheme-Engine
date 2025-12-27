import {
    IProductItem,
    IScheme,
    IApplicableTo,
    FetchCandidateSchemesParams,
    FetchAllAvailableSchemesParams,
    FetchMissingExcludedSchemesParams,
    LoggerCallback,
    IProductDataProvider
} from '../../interfaces/scheme.interface';
import {
    ConditionType,
    MatchType,
    AggregationBasis,
    ConditionBasis,
    RewardType,
    SchemeStatus
} from '../../enums/scheme.enums';

/**
 * Create a mock product item
 */
export function createMockProduct(overrides?: Partial<IProductItem>): IProductItem {
    return {
        productId: 'PROD001',
        quantity: 5,
        unitPrice: 100,
        brandId: 'BRAND001',
        categoryId: 'CAT001',
        subcategoryId: 'SUBCAT001',
        uom: 'EA',
        ...overrides
    };
}

/**
 * Create a mock scheme
 */
export function createMockScheme(overrides?: Partial<IScheme>): IScheme {
    const now = new Date();
    return {
        schemeId: 'SCHEME001',
        schemeName: 'Test Scheme',
        description: 'Test Description',
        validFrom: new Date(now.getTime() - 86400000), // Yesterday
        validTo: new Date(now.getTime() + 86400000), // Tomorrow
        status: SchemeStatus.ACTIVE,
        maxRewardPerInvoice: 1000,
        createdBy: 'test-user',
        mutualExclusionGroup: undefined,
        applicableTo: {
            warehouseIds: ['WH001'],
            channelIds: ['CH001'],
            businessTypeIds: ['BT001'],
            productIds: [],
            brandIds: [],
            categoryIds: [],
            subcategoryIds: [],
            outletIds: []
        },
        conditions: [
            {
                conditionType: ConditionType.INVOICE,
                priority: 1,
                criteria: {
                    conditionBasis: ConditionBasis.AMOUNT,
                    minValue: 500
                },
                reward: {
                    type: RewardType.DISCOUNT_PERCENT,
                    value: 10,
                    maxRewardAmount: 100
                }
            }
        ],
        ...overrides
    };
}

/**
 * Create a mock applicableTo
 */
export function createMockApplicableTo(overrides?: Partial<IApplicableTo>): IApplicableTo {
    return {
        warehouseIds: ['WH001'],
        channelIds: ['CH001'],
        businessTypeIds: ['BT001'],
        productIds: [],
        brandIds: [],
        categoryIds: [],
        subcategoryIds: [],
        outletIds: [],
        ...overrides
    };
}

/**
 * Create a mock fetchCandidateSchemes callback
 */
export function createMockFetchCandidateSchemes(
    schemes: IScheme[] = []
): (params: FetchCandidateSchemesParams) => Promise<IScheme[]> {
    return async (params: FetchCandidateSchemesParams) => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 10));
        return schemes;
    };
}

/**
 * Create a mock fetchAllAvailableSchemes callback
 */
export function createMockFetchAllAvailableSchemes(
    schemes: IScheme[] = []
): (params: FetchAllAvailableSchemesParams) => Promise<IScheme[]> {
    return async (params: FetchAllAvailableSchemesParams) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return schemes;
    };
}

/**
 * Create a mock fetchMissingExcludedSchemes callback
 */
export function createMockFetchMissingExcludedSchemes(
    schemes: IScheme[] = []
): (params: FetchMissingExcludedSchemesParams) => Promise<IScheme[]> {
    return async (params: FetchMissingExcludedSchemesParams) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return schemes;
    };
}

/**
 * Create a mock logger callback
 */
export function createMockLogger(): LoggerCallback {
    const logs: Array<{ level: string; message: string }> = [];
    const logger = (level: 'log' | 'debug' | 'warn' | 'error', message: string) => {
        logs.push({ level, message });
    };
    logger.getLogs = () => logs;
    logger.clear = () => logs.length = 0;
    return logger as LoggerCallback & {
        getLogs: () => Array<{ level: string; message: string }>;
        clear: () => void;
    };
}

/**
 * Create a mock product data provider
 */
export function createMockProductDataProvider(
    overrides?: Partial<IProductDataProvider>
): IProductDataProvider {
    return {
        getProductCapacityInKg: async (productId: string) => {
            await new Promise(resolve => setTimeout(resolve, 5));
            return 10; // Default 10kg
        },
        getProductUomDetails: async (productId: string) => {
            await new Promise(resolve => setTimeout(resolve, 5));
            return {
                baseUom: 'EA',
                unitPerCase: [
                    { numerator: 1, buom: 'EA', denominator: 1, auom: 'BOX' }
                ]
            };
        },
        getPricingGroupProducts: async (productIds: string[]) => {
            await new Promise(resolve => setTimeout(resolve, 5));
            return productIds.map(id => ({
                productId: id,
                groupId: 'GROUP001'
            }));
        },
        getPricingGroups: async (groupIds: string[]) => {
            await new Promise(resolve => setTimeout(resolve, 5));
            return groupIds.map(id => ({
                groupId: id,
                warehouse: [{ warehouseId: 'WH001' }]
            }));
        },
        ...overrides
    };
}

/**
 * Create multiple mock schemes for testing
 */
export function createMockSchemes(count: number, baseScheme?: Partial<IScheme>): IScheme[] {
    return Array.from({ length: count }, (_, i) =>
        createMockScheme({
            schemeId: `SCHEME${String(i + 1).padStart(3, '0')}`,
            schemeName: `Test Scheme ${i + 1}`,
            ...baseScheme
        })
    );
}

/**
 * Create multiple mock products for testing
 */
export function createMockProducts(count: number, baseProduct?: Partial<IProductItem>): IProductItem[] {
    return Array.from({ length: count }, (_, i) =>
        createMockProduct({
            productId: `PROD${String(i + 1).padStart(3, '0')}`,
            ...baseProduct
        })
    );
}

/**
 * Wait for a specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a scheme with combo condition
 */
export function createComboScheme(overrides?: Partial<IScheme>): IScheme {
    return createMockScheme({
        conditions: [
            {
                conditionType: ConditionType.COMBO,
                priority: 1,
                criteria: {
                    matchType: MatchType.ALL,
                    productIds: [
                        { productId: 'PROD001', minQty: 2 },
                        { productId: 'PROD002', minQty: 1 }
                    ]
                },
                reward: {
                    type: RewardType.FREE_PRODUCT,
                    products: [{
                        productId: 'PROD003',
                        quantity: 1
                    }]
                }
            }
        ],
        ...overrides
    });
}

/**
 * Create a scheme with line item condition
 */
export function createLineItemScheme(overrides?: Partial<IScheme>): IScheme {
    return createMockScheme({
        conditions: [
            {
                conditionType: ConditionType.LINE_ITEM,
                priority: 1,
                criteria: {
                    filterBy: {
                        productIds: ['PROD001', 'PROD002']  // Allow multiple products to match the 2-product requirement
                    },
                    minLineTotal: 1  // Changed from 3 to 1 - checks number of products, not quantity
                },
                reward: {
                    type: RewardType.DISCOUNT_PERCENT,
                    value: 20,
                    maxRewardAmount: 100
                }
            }
        ],
        ...overrides
    });
}

/**
 * Create a scheme with assorted condition
 */
export function createAssortedScheme(overrides?: Partial<IScheme>): IScheme {
    return createMockScheme({
        conditions: [
            {
                conditionType: ConditionType.ASSORTED,
                priority: 1,
                criteria: {
                    aggregationBasis: AggregationBasis.AMOUNT,
                    productIds: ['PROD001', 'PROD002'],
                    minValue: 500
                },
                reward: {
                    type: RewardType.DISCOUNT_PERCENT,
                    value: 15,
                    maxRewardAmount: 200
                }
            }
        ],
        ...overrides
    });
}

/**
 * Create a scheme with invoice condition
 */
export function createInvoiceScheme(overrides?: Partial<IScheme>): IScheme {
    return createMockScheme({
        conditions: [
            {
                conditionType: ConditionType.INVOICE,
                priority: 1,
                criteria: {
                    conditionBasis: ConditionBasis.AMOUNT,
                    minValue: 1000
                },
                reward: {
                    type: RewardType.DISCOUNT_PERCENT,
                    value: 10,
                    maxRewardAmount: 500
                }
            }
        ],
        ...overrides
    });
}

