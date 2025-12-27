import { ValidatorsService } from '../../services/validators';
import { createMockProduct } from '../utils/test-helpers';
import { MatchType, AggregationBasis, ConditionBasis, RewardType } from '../../enums/scheme.enums';

describe('ValidatorsService', () => {
    let validatorsService: ValidatorsService;

    beforeEach(() => {
        validatorsService = new ValidatorsService();
    });

    describe('getProductCapacityInKg', () => {
        it('should return weight from product if available', () => {
            const product = createMockProduct({ weight: 5.5 });
            const capacity = validatorsService.getProductCapacityInKg('PROD001', product);
            expect(capacity).toBe(5.5);
        });

        it('should return 0 if product weight not provided', () => {
            const product = createMockProduct({ weight: undefined });
            const capacity = validatorsService.getProductCapacityInKg('PROD001', product);
            expect(capacity).toBe(0);
        });

        it('should return 0 if product not provided', () => {
            const capacity = validatorsService.getProductCapacityInKg('PROD001');
            expect(capacity).toBe(0);
        });
    });

    describe('getProductUomDetails', () => {
        it('should return UOM details from product', () => {
            const product = createMockProduct({
                uom: 'EA',
                unitPerCase: [
                    { numerator: 12, buom: 'EA', denominator: 1, auom: 'BOX' }
                ]
            });
            const details = validatorsService.getProductUomDetails('PROD001', product);
            expect(details).toEqual({
                baseUom: 'EA',
                unitPerCase: [
                    { numerator: 12, buom: 'EA', denominator: 1, auom: 'BOX' }
                ]
            });
        });

        it('should return null if product not provided', () => {
            const details = validatorsService.getProductUomDetails('PROD001');
            expect(details).toBeNull();
        });

        it('should return UOM details with undefined values if not in product', () => {
            const product = createMockProduct({ uom: undefined, unitPerCase: undefined });
            const details = validatorsService.getProductUomDetails('PROD001', product);
            expect(details).toEqual({
                baseUom: undefined,
                unitPerCase: undefined
            });
        });
    });

    describe('validateComboCondition', () => {
        it('should throw error if matchType is invalid', () => {
            const criteria = {
                matchType: 'invalid',
                criteria: [{ productId: 'PROD001' }]
            };
            expect(() => validatorsService.validateComboCondition(criteria, 0)).toThrow('Invalid matchType');
        });

        it('should throw error if criteria array is missing', () => {
            const criteria = {
                matchType: MatchType.ALL
            };
            expect(() => validatorsService.validateComboCondition(criteria, 0)).toThrow('criteria array is required');
        });

        it('should throw error if criteria array is empty', () => {
            const criteria = {
                matchType: MatchType.ALL,
                criteria: []
            };
            expect(() => validatorsService.validateComboCondition(criteria, 0)).toThrow('criteria array is required');
        });

        it('should throw error if no criteria has an ID', () => {
            const criteria = {
                matchType: MatchType.ALL,
                criteria: [{}]
            };
            expect(() => validatorsService.validateComboCondition(criteria, 0)).toThrow('At least one criteria must have an ID');
        });

        it('should validate successfully with valid criteria', () => {
            const criteria = {
                matchType: MatchType.ALL,
                criteria: [
                    { productId: 'PROD001' },
                    { productId: 'PROD002' }
                ]
            };
            expect(() => validatorsService.validateComboCondition(criteria, 0)).not.toThrow();
        });

        it('should throw error if minValue is invalid', () => {
            const criteria = {
                matchType: MatchType.ALL,
                criteria: [{ productId: 'PROD001' }],
                hasMinValue: true,
                minValue: -1
            };
            expect(() => validatorsService.validateComboCondition(criteria, 0)).toThrow('minValue must be a non-negative number');
        });

        it('should throw error if minValue > maxValue', () => {
            const criteria = {
                matchType: MatchType.ALL,
                criteria: [{ productId: 'PROD001' }],
                hasMinValue: true,
                hasMaxValue: true,
                minValue: 100,
                maxValue: 50
            };
            expect(() => validatorsService.validateComboCondition(criteria, 0)).toThrow('minValue cannot be greater than maxValue');
        });
    });

    describe('validateAssortedCondition', () => {
        it('should throw error if aggregationBasis is invalid', () => {
            const criteria = {
                aggregationBasis: 'invalid',
                minValue: 100
            };
            expect(() => validatorsService.validateAssortedCondition(criteria, 0)).toThrow('Invalid aggregationBasis');
        });

        it('should throw error if minValue is negative', () => {
            const criteria = {
                aggregationBasis: AggregationBasis.AMOUNT,
                minValue: -1
            };
            expect(() => validatorsService.validateAssortedCondition(criteria, 0)).toThrow('minValue must be a non-negative number');
        });

        it('should throw error if maxValue is negative', () => {
            const criteria = {
                aggregationBasis: AggregationBasis.AMOUNT,
                minValue: 100,
                maxValue: -1
            };
            expect(() => validatorsService.validateAssortedCondition(criteria, 0)).toThrow('maxValue must be a non-negative number');
        });

        it('should throw error if minValue > maxValue', () => {
            const criteria = {
                aggregationBasis: AggregationBasis.AMOUNT,
                minValue: 200,
                maxValue: 100
            };
            expect(() => validatorsService.validateAssortedCondition(criteria, 0)).toThrow('minValue cannot be greater than maxValue');
        });

        it('should validate successfully with valid criteria', () => {
            const criteria = {
                aggregationBasis: AggregationBasis.AMOUNT,
                minValue: 100,
                maxValue: 500
            };
            expect(() => validatorsService.validateAssortedCondition(criteria, 0)).not.toThrow();
        });
    });

    describe('validateInvoiceCondition', () => {
        it('should throw error if conditionBasis is invalid', () => {
            const criteria = {
                conditionBasis: 'invalid',
                minValue: 100
            };
            expect(() => validatorsService.validateInvoiceCondition(criteria, 0)).toThrow('Invalid conditionBasis');
        });

        it('should throw error if minValue is negative', () => {
            const criteria = {
                conditionBasis: ConditionBasis.AMOUNT,
                minValue: -1
            };
            expect(() => validatorsService.validateInvoiceCondition(criteria, 0)).toThrow('minValue must be a non-negative number');
        });

        it('should validate successfully with valid criteria', () => {
            const criteria = {
                conditionBasis: ConditionBasis.AMOUNT,
                minValue: 1000
            };
            expect(() => validatorsService.validateInvoiceCondition(criteria, 0)).not.toThrow();
        });
    });

    describe('validateLineItemCondition', () => {
        it('should throw error if filterBy is missing', () => {
            const criteria = {
                minLineTotal: 100
            };
            expect(() => validatorsService.validateLineItemCondition(criteria, 0)).toThrow('filterBy is required');
        });

        it('should throw error if minLineTotal is negative', () => {
            const criteria = {
                filterBy: {},
                minLineTotal: -1
            };
            expect(() => validatorsService.validateLineItemCondition(criteria, 0)).toThrow('minLineTotal must be a non-negative number');
        });

        it('should throw error if minLineTotal > maxLineTotal', () => {
            const criteria = {
                filterBy: {},
                minLineTotal: 200,
                maxLineTotal: 100
            };
            expect(() => validatorsService.validateLineItemCondition(criteria, 0)).toThrow('minLineTotal cannot be greater than maxLineTotal');
        });

        it('should validate successfully with valid criteria', () => {
            const criteria = {
                filterBy: { productId: 'PROD001' },
                minLineTotal: 100
            };
            expect(() => validatorsService.validateLineItemCondition(criteria, 0)).not.toThrow();
        });
    });

    describe('validateProratedCondition', () => {
        it('should throw error if proratedPer is not positive', () => {
            const criteria = {
                proratedPer: 0
            };
            expect(() => validatorsService.validateProratedCondition(criteria, 0)).toThrow('proratedPer must be a positive number');
        });

        it('should throw error if minQty is negative', () => {
            const criteria = {
                proratedPer: 5,
                minQty: -1
            };
            expect(() => validatorsService.validateProratedCondition(criteria, 0)).toThrow('minQty must be a non-negative number');
        });

        it('should throw error if minQty > maxQty', () => {
            const criteria = {
                proratedPer: 5,
                minQty: 10,
                maxQty: 5
            };
            expect(() => validatorsService.validateProratedCondition(criteria, 0)).toThrow('minQty cannot be greater than maxQty');
        });

        it('should validate successfully with valid criteria', () => {
            const criteria = {
                proratedPer: 5,
                minQty: 5,
                maxQty: 10
            };
            expect(() => validatorsService.validateProratedCondition(criteria, 0)).not.toThrow();
        });
    });

    describe('validateReward', () => {
        it('should throw error if reward type is invalid', () => {
            const reward = {
                type: 'invalid'
            };
            expect(() => validatorsService.validateReward(reward, 0)).toThrow('Invalid reward type');
        });

        it('should throw error if discount reward value is negative', () => {
            const reward = {
                type: RewardType.DISCOUNT_PERCENT,
                value: -1
            };
            expect(() => validatorsService.validateReward(reward, 0)).toThrow('reward value must be a non-negative number');
        });

        it('should throw error if maxRewardAmount is negative', () => {
            const reward = {
                type: RewardType.DISCOUNT_PERCENT,
                value: 10,
                maxRewardAmount: -1
            };
            expect(() => validatorsService.validateReward(reward, 0)).toThrow('maxRewardAmount must be a non-negative number');
        });

        it('should validate successfully with valid reward', () => {
            const reward = {
                type: RewardType.DISCOUNT_PERCENT,
                value: 10,
                maxRewardAmount: 100
            };
            expect(() => validatorsService.validateReward(reward, 0)).not.toThrow();
        });
    });

    describe('validateUnifiedCriteria', () => {
        it('should return valid if no criteria provided', () => {
            const result = validatorsService.validateUnifiedCriteria([], [createMockProduct()]);
            expect(result.isValid).toBe(true);
        });

        it('should return invalid if no products provided', () => {
            const criteria = [{ productId: 'PROD001' }];
            const result = validatorsService.validateUnifiedCriteria(criteria, []);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('No products provided');
        });

        it('should return valid if products match criteria', () => {
            const criteria = [{ productId: 'PROD001' }];
            const products = [createMockProduct({ productId: 'PROD001' })];
            const result = validatorsService.validateUnifiedCriteria(criteria, products);
            expect(result.isValid).toBe(true);
        });

        it('should return invalid if no products match criteria', () => {
            const criteria = [{ productId: 'PROD999' }];
            const products = [createMockProduct({ productId: 'PROD001' })];
            const result = validatorsService.validateUnifiedCriteria(criteria, products);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('No products match');
        });

        it('should match by brandId', () => {
            const criteria = [{ brandId: 'BRAND001' }];
            const products = [createMockProduct({ brandId: 'BRAND001' })];
            const result = validatorsService.validateUnifiedCriteria(criteria, products);
            expect(result.isValid).toBe(true);
        });

        it('should match by categoryId', () => {
            const criteria = [{ categoryId: 'CAT001' }];
            const products = [createMockProduct({ categoryId: 'CAT001' })];
            const result = validatorsService.validateUnifiedCriteria(criteria, products);
            expect(result.isValid).toBe(true);
        });
    });
});

