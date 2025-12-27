import { IProductItem } from '../interfaces/scheme.interface';
import { AggregationBasis, ConditionBasis, MatchType, RewardType } from '../enums/scheme.enums';

export class ValidatorsService {
    /**
     * Get product capacity in kg from product data
     * Uses weight from IProductItem (already in kg) or returns 0
     * @param productId - The product ID
     * @param product - The product item with weight data
     * @returns Product capacity in kg (0 if not found)
     */
    getProductCapacityInKg(productId: string, product?: IProductItem): number {
        if (product && product.weight !== undefined) {
            // Weight is already in kg from IProductItem
            return product.weight;
        }
        // Default to 0 if weight not provided
        return 0;
    }

    /**
     * Get product UOM details from product item
     * @param productId - The product ID
     * @param product - The product item
     * @returns UOM details or null
     */
    getProductUomDetails(productId: string, product?: IProductItem): {
        baseUom?: string;
        unitPerCase?: Array<{
            numerator: number;
            buom: string;
            denominator: number;
            auom: string;
        }>;
    } | null {
        if (!product) {
            return null;
        }

        return {
            baseUom: product.uom,
            unitPerCase: product.unitPerCase
        };
    }

    /**
     * Validate combo condition criteria
     */
    validateComboCondition(criteria: any, index: number): void {
        if (!criteria.matchType || ![MatchType.ALL, MatchType.ANY].includes(criteria.matchType)) {
            throw new Error(`Condition ${index + 1}: Invalid matchType for combo condition`);
        }

        // Check if criteria array is provided and has at least one item
        if (!criteria.criteria || !Array.isArray(criteria.criteria) || criteria.criteria.length === 0) {
            throw new Error(`Condition ${index + 1}: criteria array is required for combo condition`);
        }

        // Validate that at least one criteria has an ID (productId, brandId, categoryId, or subcategoryId)
        const hasValidCriteria = criteria.criteria.some((criterion: any) =>
            criterion.productId || criterion.brandId || criterion.categoryId || criterion.subcategoryId
        );

        if (!hasValidCriteria) {
            throw new Error(`Condition ${index + 1}: At least one criteria must have an ID (productId, brandId, categoryId, or subcategoryId)`);
        }

        // For matchType 'all', each criterion must have at least one identifier
        if (criteria.matchType === MatchType.ALL) {
            for (let i = 0; i < criteria.criteria.length; i++) {
                const criterion = criteria.criteria[i];
                const hasIdentifier = criterion.productId || criterion.brandId || criterion.categoryId || criterion.subcategoryId;
                if (!hasIdentifier) {
                    throw new Error(`Condition ${index + 1}, Criteria ${i + 1}: Each criterion must have at least one identifier (productId, brandId, categoryId, or subcategoryId) when matchType is 'all'`);
                }
            }
        }

        // Validate min/max values if provided
        if (criteria.hasMinValue && (typeof criteria.minValue !== 'number' || criteria.minValue < 0)) {
            throw new Error(`Condition ${index + 1}: minValue must be a non-negative number`);
        }

        if (criteria.hasMaxValue && (typeof criteria.maxValue !== 'number' || criteria.maxValue < 0)) {
            throw new Error(`Condition ${index + 1}: maxValue must be a non-negative number`);
        }

        if (criteria.hasMinValue && criteria.hasMaxValue && criteria.minValue && criteria.maxValue && criteria.minValue > criteria.maxValue) {
            throw new Error(`Condition ${index + 1}: minValue cannot be greater than maxValue`);
        }
    }

    /**
     * Validate assorted condition criteria
     */
    validateAssortedCondition(criteria: any, index: number): void {
        if (!criteria.aggregationBasis || !Object.values(AggregationBasis).includes(criteria.aggregationBasis)) {
            throw new Error(`Condition ${index + 1}: Invalid aggregationBasis for assorted condition`);
        }

        if (typeof criteria.minValue !== 'number' || criteria.minValue < 0) {
            throw new Error(`Condition ${index + 1}: minValue must be a non-negative number for assorted condition`);
        }

        if (criteria.maxValue !== undefined && (typeof criteria.maxValue !== 'number' || criteria.maxValue < 0)) {
            throw new Error(`Condition ${index + 1}: maxValue must be a non-negative number for assorted condition`);
        }

        if (criteria.maxValue !== undefined && criteria.minValue > criteria.maxValue) {
            throw new Error(`Condition ${index + 1}: minValue cannot be greater than maxValue for assorted condition`);
        }
    }

    /**
     * Validate invoice condition criteria
     */
    validateInvoiceCondition(criteria: any, index: number): void {
        if (!criteria.conditionBasis || !Object.values(ConditionBasis).includes(criteria.conditionBasis)) {
            throw new Error(`Condition ${index + 1}: Invalid conditionBasis for invoice condition`);
        }

        if (typeof criteria.minValue !== 'number' || criteria.minValue < 0) {
            throw new Error(`Condition ${index + 1}: minValue must be a non-negative number for invoice condition`);
        }

        if (criteria.maxValue !== undefined && (typeof criteria.maxValue !== 'number' || criteria.maxValue < 0)) {
            throw new Error(`Condition ${index + 1}: maxValue must be a non-negative number for invoice condition`);
        }

        if (criteria.maxValue !== undefined && criteria.minValue > criteria.maxValue) {
            throw new Error(`Condition ${index + 1}: minValue cannot be greater than maxValue for invoice condition`);
        }
    }

    /**
     * Validate line item condition criteria
     */
    validateLineItemCondition(criteria: any, index: number): void {
        if (!criteria.filterBy || typeof criteria.filterBy !== 'object') {
            throw new Error(`Condition ${index + 1}: filterBy is required for line item condition`);
        }

        if (typeof criteria.minLineTotal !== 'number' || criteria.minLineTotal < 0) {
            throw new Error(`Condition ${index + 1}: minLineTotal must be a non-negative number for line item condition`);
        }

        if (criteria.maxLineTotal !== undefined && (typeof criteria.maxLineTotal !== 'number' || criteria.maxLineTotal < 0)) {
            throw new Error(`Condition ${index + 1}: maxLineTotal must be a non-negative number for line item condition`);
        }

        if (criteria.maxLineTotal !== undefined && criteria.minLineTotal > criteria.maxLineTotal) {
            throw new Error(`Condition ${index + 1}: minLineTotal cannot be greater than maxLineTotal for line item condition`);
        }
    }

    /**
     * Validate prorated condition criteria
     */
    validateProratedCondition(criteria: any, index: number): void {
        if (typeof criteria.proratedPer !== 'number' || criteria.proratedPer <= 0) {
            throw new Error(`Condition ${index + 1}: proratedPer must be a positive number for prorated condition`);
        }

        if (criteria.minQty !== undefined && (typeof criteria.minQty !== 'number' || criteria.minQty < 0)) {
            throw new Error(`Condition ${index + 1}: minQty must be a non-negative number for prorated condition`);
        }

        if (criteria.maxQty !== undefined && (typeof criteria.maxQty !== 'number' || criteria.maxQty < 0)) {
            throw new Error(`Condition ${index + 1}: maxQty must be a non-negative number for prorated condition`);
        }

        if (criteria.minQty !== undefined && criteria.maxQty !== undefined && criteria.minQty > criteria.maxQty) {
            throw new Error(`Condition ${index + 1}: minQty cannot be greater than maxQty for prorated condition`);
        }
    }

    /**
     * Validate flexible product condition criteria
     */
    validateFlexibleProductCondition(criteria: any, index: number): void {
        if (typeof criteria.minValue !== 'number' || criteria.minValue < 0) {
            throw new Error(`Condition ${index + 1}: minValue must be a non-negative number for flexible product condition`);
        }

        if (criteria.maxValue !== undefined && (typeof criteria.maxValue !== 'number' || criteria.maxValue < 0)) {
            throw new Error(`Condition ${index + 1}: maxValue must be a non-negative number for flexible product condition`);
        }

        if (criteria.maxValue !== undefined && criteria.minValue > criteria.maxValue) {
            throw new Error(`Condition ${index + 1}: minValue cannot be greater than maxValue for flexible product condition`);
        }

        if (criteria.minQty !== undefined && (typeof criteria.minQty !== 'number' || criteria.minQty < 0)) {
            throw new Error(`Condition ${index + 1}: minQty must be a non-negative number for flexible product condition`);
        }

        if (criteria.maxQty !== undefined && (typeof criteria.maxQty !== 'number' || criteria.maxQty < 0)) {
            throw new Error(`Condition ${index + 1}: maxQty must be a non-negative number for flexible product condition`);
        }

        if (criteria.minQty !== undefined && criteria.maxQty !== undefined && criteria.minQty > criteria.maxQty) {
            throw new Error(`Condition ${index + 1}: minQty cannot be greater than maxQty for flexible product condition`);
        }
    }

    /**
     * Validate reward
     */
    validateReward(reward: any, index: number): void {
        if (!reward.type || !Object.values(RewardType).includes(reward.type)) {
            throw new Error(`Condition ${index + 1}: Invalid reward type`);
        }

        // Validate reward value based on type
        if (reward.type === RewardType.DISCOUNT_PERCENT || reward.type === RewardType.DISCOUNT_FIXED) {
            if (reward.value === undefined || typeof reward.value !== 'number' || reward.value < 0) {
                throw new Error(`Condition ${index + 1}: reward value must be a non-negative number for discount rewards`);
            }
        }

        if (reward.maxRewardAmount !== undefined && (typeof reward.maxRewardAmount !== 'number' || reward.maxRewardAmount < 0)) {
            throw new Error(`Condition ${index + 1}: maxRewardAmount must be a non-negative number`);
        }
    }

    /**
     * Validate unified criteria for line item conditions
     * Checks if products match the unified criteria requirements
     */
    validateUnifiedCriteria(unifiedCriteria: any[], products: IProductItem[]): { isValid: boolean; reason?: string } {
        if (!unifiedCriteria || unifiedCriteria.length === 0) {
            return { isValid: true };
        }

        if (!products || products.length === 0) {
            return { isValid: false, reason: 'No products provided for validation' };
        }

        // Basic validation: check if at least one criterion has matching products
        for (const criterion of unifiedCriteria) {
            const hasIdentifier = criterion.productId || criterion.brandId || criterion.categoryId || criterion.subcategoryId;
            if (!hasIdentifier) {
                continue; // Skip criteria without identifiers
            }

            const matchingProducts = products.filter(product => {
                const matchesProductId = !criterion.productId || product.productId === criterion.productId;
                const matchesBrandId = !criterion.brandId || (product.brandId && product.brandId === criterion.brandId);
                const matchesCategoryId = !criterion.categoryId || (product.categoryId && product.categoryId === criterion.categoryId);
                const matchesSubcategoryId = !criterion.subcategoryId || (product.subcategoryId && product.subcategoryId === criterion.subcategoryId);
                return matchesProductId && matchesBrandId && matchesCategoryId && matchesSubcategoryId;
            });

            if (matchingProducts.length > 0) {
                return { isValid: true };
            }
        }

        return { isValid: false, reason: 'No products match the unified criteria requirements' };
    }
}

