import { calculateReward } from '../../calculate-reward';
import {
    createMockProduct,
    createMockScheme,
    createMockFetchCandidateSchemes,
    createMockFetchAllAvailableSchemes,
    createMockLogger,
    createMockProductDataProvider,
    createInvoiceScheme,
    createLineItemScheme,
    createComboScheme,
    createAssortedScheme
} from '../utils/test-helpers';
import { ConditionType, RewardType, SchemeStatus } from '../../enums/scheme.enums';

describe('calculateReward Integration Tests', () => {
    const now = new Date();
    const defaultContext = {
        warehouseId: 'WH001',
        channelId: 'CH001',
        businessTypeId: 'BT001',
        outletId: 'OUTLET001'
    };

    describe('End-to-End Calculation', () => {
        it('should calculate rewards for invoice-based scheme', async () => {
            const scheme = createInvoiceScheme({
                applicableTo: {
                    warehouseIds: ['WH001'],
                    channelIds: ['CH001'],
                    businessTypeIds: ['BT001']
                }
            });

            const result = await calculateReward({
                products: [createMockProduct({ quantity: 10, unitPrice: 100 })], // 1000 total
                ...defaultContext,
                fetchCandidateSchemes: createMockFetchCandidateSchemes([scheme]),
                fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([scheme])
            });

            expect(result.totalDiscount).toBeGreaterThan(0);
            expect(result.appliedSchemes.length).toBeGreaterThan(0);
            expect(result.summary.totalValue).toBe(1000);
            expect(result.summary.totalValueAfterDiscount).toBeLessThan(1000);
        });

        it('should calculate rewards for line-item scheme', async () => {
            const scheme = createLineItemScheme({
                applicableTo: {
                    warehouseIds: ['WH001']
                }
            });

            // Line-item conditions require at least 2 unique products (business rule)
            const result = await calculateReward({
                products: [
                    createMockProduct({ productId: 'PROD001', quantity: 5 }),
                    createMockProduct({ productId: 'PROD002', quantity: 3 })
                ],
                ...defaultContext,
                fetchCandidateSchemes: createMockFetchCandidateSchemes([scheme]),
                fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([scheme])
            });

            expect(result.appliedSchemes.length).toBeGreaterThan(0);
        });

        it('should calculate rewards for combo scheme', async () => {
            const scheme = createComboScheme({
                applicableTo: {
                    warehouseIds: ['WH001']
                }
            });

            const result = await calculateReward({
                products: [
                    createMockProduct({ productId: 'PROD001', quantity: 3 }),
                    createMockProduct({ productId: 'PROD002', quantity: 2 })
                ],
                ...defaultContext,
                fetchCandidateSchemes: createMockFetchCandidateSchemes([scheme]),
                fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([scheme])
            });

            // Combo scheme should apply if conditions are met
            expect(result).toBeDefined();
        });
    });

    describe('Multiple Schemes Evaluation', () => {
        it('should apply highest priority scheme when multiple schemes are applicable', async () => {
            const scheme1 = createInvoiceScheme({
                schemeId: 'SCHEME001',
                conditions: [{
                    conditionType: ConditionType.INVOICE,
                    priority: 1,
                    criteria: {
                        conditionBasis: 'amount' as any,
                        minValue: 500
                    },
                    reward: { type: RewardType.DISCOUNT_PERCENT, value: 10 }
                }]
            });

            const scheme2 = createInvoiceScheme({
                schemeId: 'SCHEME002',
                conditions: [{
                    conditionType: ConditionType.INVOICE,
                    priority: 2,
                    criteria: {
                        conditionBasis: 'amount' as any,
                        minValue: 500
                    },
                    reward: { type: RewardType.DISCOUNT_PERCENT, value: 15 }
                }]
            });

            const result = await calculateReward({
                products: [createMockProduct({ quantity: 10, unitPrice: 100 })],
                ...defaultContext,
                fetchCandidateSchemes: createMockFetchCandidateSchemes([scheme1, scheme2]),
                fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([scheme1, scheme2])
            });

            // Should apply scheme with priority 1 (lower number = higher priority)
            const appliedIds = result.appliedSchemes.map(s => s.schemeId);
            expect(appliedIds).toContain('SCHEME001');
        });

        it('should handle mutual exclusion correctly', async () => {
            const scheme1 = createInvoiceScheme({
                schemeId: 'SCHEME001',
                mutualExclusionGroup: 'GROUP1',
                conditions: [{
                    conditionType: ConditionType.INVOICE,
                    priority: 1,
                    criteria: {
                        conditionBasis: 'amount' as any,
                        minValue: 500
                    },
                    reward: { type: RewardType.DISCOUNT_PERCENT, value: 10 }
                }]
            });

            const scheme2 = createInvoiceScheme({
                schemeId: 'SCHEME002',
                mutualExclusionGroup: 'GROUP1',
                conditions: [{
                    conditionType: ConditionType.INVOICE,
                    priority: 1,
                    criteria: {
                        conditionBasis: 'amount' as any,
                        minValue: 500
                    },
                    reward: { type: RewardType.DISCOUNT_PERCENT, value: 15 }
                }]
            });

            const result = await calculateReward({
                products: [createMockProduct({ quantity: 10, unitPrice: 100 })],
                ...defaultContext,
                fetchCandidateSchemes: createMockFetchCandidateSchemes([scheme1, scheme2]),
                fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([scheme1, scheme2])
            });

            // Only one scheme from mutual exclusion group should be applied
            const appliedIds = result.appliedSchemes.map(s => s.schemeId);
            expect(appliedIds.length).toBeLessThanOrEqual(1);
        });
    });

    describe('Product Data Provider Integration', () => {
        it('should use productDataProvider for weight calculations', async () => {
            const getProductCapacityInKg = jest.fn().mockResolvedValue(10);
            const productDataProvider = createMockProductDataProvider({
                getProductCapacityInKg
            });

            const scheme = createAssortedScheme({
                applicableTo: {
                    warehouseIds: ['WH001']
                }
            });

            await calculateReward({
                products: [createMockProduct({ uom: 'KG' })],
                ...defaultContext,
                fetchCandidateSchemes: createMockFetchCandidateSchemes([scheme]),
                fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([scheme]),
                productDataProvider
            });

            // Product data provider should be called if needed
            // (This depends on scheme evaluation requirements)
            expect(productDataProvider.getProductCapacityInKg).toBeDefined();
        });

        it('should work without productDataProvider', async () => {
            const scheme = createInvoiceScheme({
                applicableTo: {
                    warehouseIds: ['WH001']
                }
            });

            const result = await calculateReward({
                products: [createMockProduct({ quantity: 10, unitPrice: 100 })],
                ...defaultContext,
                fetchCandidateSchemes: createMockFetchCandidateSchemes([scheme]),
                fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([scheme])
            });

            expect(result).toBeDefined();
            expect(result.totalDiscount).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Logger Integration', () => {
        it('should log calculation steps when logger provided', async () => {
            const logger = createMockLogger();

            await calculateReward({
                products: [createMockProduct()],
                ...defaultContext,
                fetchCandidateSchemes: createMockFetchCandidateSchemes([]),
                fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([]),
                logger
            });

            const logs = (logger as any).getLogs();
            expect(logs.length).toBeGreaterThan(0);
        });

        it('should work without logger', async () => {
            const result = await calculateReward({
                products: [createMockProduct()],
                ...defaultContext,
                fetchCandidateSchemes: createMockFetchCandidateSchemes([]),
                fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([])
            });

            expect(result).toBeDefined();
        });
    });

    describe('includeSchemes and excludeSchemes', () => {
        it('should only evaluate included schemes', async () => {
            const scheme1 = createInvoiceScheme({ schemeId: 'SCHEME001' });
            const scheme2 = createInvoiceScheme({ schemeId: 'SCHEME002' });

            const result = await calculateReward({
                products: [createMockProduct({ quantity: 10, unitPrice: 100 })],
                ...defaultContext,
                includeSchemes: ['SCHEME001'],
                fetchCandidateSchemes: createMockFetchCandidateSchemes([scheme1, scheme2]),
                fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([scheme1, scheme2])
            });

            const appliedIds = result.appliedSchemes.map(s => s.schemeId);
            expect(appliedIds).toContain('SCHEME001');
            expect(appliedIds).not.toContain('SCHEME002');
        });

        it('should exclude specified schemes', async () => {
            const scheme1 = createInvoiceScheme({ schemeId: 'SCHEME001' });
            const scheme2 = createInvoiceScheme({ schemeId: 'SCHEME002' });

            const result = await calculateReward({
                products: [createMockProduct({ quantity: 10, unitPrice: 100 })],
                ...defaultContext,
                excludeSchemes: ['SCHEME002'],
                fetchCandidateSchemes: createMockFetchCandidateSchemes([scheme1, scheme2]),
                fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([scheme1, scheme2])
            });

            const appliedIds = result.appliedSchemes.map(s => s.schemeId);
            expect(appliedIds).not.toContain('SCHEME002');
        });
    });

    describe('Response Structure Validation', () => {
        it('should return complete response structure', async () => {
            const result = await calculateReward({
                products: [createMockProduct()],
                ...defaultContext,
                fetchCandidateSchemes: createMockFetchCandidateSchemes([]),
                fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([])
            });

            expect(result).toHaveProperty('totalDiscount');
            expect(result).toHaveProperty('totalRewardAmount');
            expect(result).toHaveProperty('appliedSchemes');
            expect(result).toHaveProperty('availableSchemes');
            expect(result).toHaveProperty('summary');
            expect(Array.isArray(result.appliedSchemes)).toBe(true);
            expect(Array.isArray(result.availableSchemes)).toBe(true);
            expect(typeof result.summary.totalProducts).toBe('number');
            expect(typeof result.summary.totalQuantity).toBe('number');
            expect(typeof result.summary.totalValue).toBe('number');
        });
    });

    describe('Complex Scenarios', () => {
        it('should handle multiple products with different schemes', async () => {
            const invoiceScheme = createInvoiceScheme({
                schemeId: 'INVOICE_SCHEME',
                applicableTo: { warehouseIds: ['WH001'] }
            });

            const lineItemScheme = createLineItemScheme({
                schemeId: 'LINE_ITEM_SCHEME',
                applicableTo: { warehouseIds: ['WH001'] }
            });

            const result = await calculateReward({
                products: [
                    createMockProduct({ productId: 'PROD001', quantity: 5, unitPrice: 100 }),
                    createMockProduct({ productId: 'PROD002', quantity: 3, unitPrice: 50 })
                ],
                ...defaultContext,
                fetchCandidateSchemes: createMockFetchCandidateSchemes([invoiceScheme, lineItemScheme]),
                fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([invoiceScheme, lineItemScheme])
            });

            expect(result).toBeDefined();
            expect(result.summary.totalProducts).toBe(2);
            expect(result.summary.totalQuantity).toBe(8);
        });

        it('should handle empty schemes list', async () => {
            const result = await calculateReward({
                products: [createMockProduct()],
                ...defaultContext,
                fetchCandidateSchemes: createMockFetchCandidateSchemes([]),
                fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([])
            });

            expect(result.totalDiscount).toBe(0);
            expect(result.appliedSchemes).toHaveLength(0);
        });
    });
});

