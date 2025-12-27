import { ConditionType } from '../enums/scheme.enums';
import { IProductItem } from '../interfaces/scheme.interface';

export class TrackersService {
    private async trackComboUsedProducts(criteria: any, products: IProductItem[], usedProducts: Map<string, number>): Promise<void> {
        const { criteria: criteriaArray } = criteria;
        if (!criteriaArray || !Array.isArray(criteriaArray)) return;

        // For combo conditions, track products that match the criteria
        for (const criterion of criteriaArray) {
            const matchingProducts = products.filter(product => {
                const matchesProductId = !criterion.productId || product.productId === criterion.productId;
                const matchesBrandId = !criterion.brandId || (product.brandId && product.brandId === criterion.brandId);
                const matchesCategoryId = !criterion.categoryId || (product.categoryId && product.categoryId === criterion.categoryId);
                const matchesSubcategoryId = !criterion.subcategoryId || (product.subcategoryId && product.subcategoryId === criterion.subcategoryId);
                return matchesProductId && matchesBrandId && matchesCategoryId && matchesSubcategoryId;
            });

            matchingProducts.forEach(product => {
                const currentUsed = usedProducts.get(product.productId) || 0;
                usedProducts.set(product.productId, currentUsed + product.quantity);
            });
        }
    }

    private async trackAssortedUsedProducts(criteria: any, products: IProductItem[], usedProducts: Map<string, number>): Promise<void> {
        const { productIds = [], brandIds = [], categoryIds = [], subcategoryIds = [] } = criteria;

        const matchingProducts = products.filter(product => {
            const matchesProductId = productIds.length === 0 || productIds.includes(product.productId);
            const matchesBrandId = brandIds.length === 0 || (product.brandId && brandIds.includes(product.brandId));
            const matchesCategoryId = categoryIds.length === 0 || (product.categoryId && categoryIds.includes(product.categoryId));
            const matchesSubcategoryId = subcategoryIds.length === 0 || (product.subcategoryId && subcategoryIds.includes(product.subcategoryId));
            return matchesProductId || matchesBrandId || matchesCategoryId || matchesSubcategoryId;
        });

        matchingProducts.forEach(product => {
            const currentUsed = usedProducts.get(product.productId) || 0;
            usedProducts.set(product.productId, currentUsed + product.quantity);
        });
    }

    private async trackLineItemUsedProducts(criteria: any, products: IProductItem[], usedProducts: Map<string, number>): Promise<void> {
        const { filterBy } = criteria;
        if (!filterBy) return;

        let applicableProducts = products;

        // Apply filters
        if (filterBy.category) {
            applicableProducts = products.filter(p => p.categoryId && filterBy.category === p.categoryId);
        }
        if (filterBy.productIds && filterBy.productIds.length > 0) {
            applicableProducts = applicableProducts.filter(p => filterBy.productIds.includes(p.productId));
        }
        if (filterBy.brandIds && filterBy.brandIds.length > 0) {
            applicableProducts = applicableProducts.filter(p => p.brandId && filterBy.brandIds.includes(p.brandId));
        }
        if (filterBy.categoryIds && filterBy.categoryIds.length > 0) {
            applicableProducts = applicableProducts.filter(p => p.categoryId && filterBy.categoryIds.includes(p.categoryId));
        }
        if (filterBy.subcategoryIds && filterBy.subcategoryIds.length > 0) {
            applicableProducts = applicableProducts.filter(p => p.subcategoryId && filterBy.subcategoryIds.includes(p.subcategoryId));
        }

        applicableProducts.forEach(product => {
            const currentUsed = usedProducts.get(product.productId) || 0;
            usedProducts.set(product.productId, currentUsed + product.quantity);
        });
    }

    private async trackFlexibleProductUsedProducts(criteria: any, products: IProductItem[], usedProducts: Map<string, number>): Promise<void> {
        const { productIds = [], brandIds = [], categoryIds = [], subcategoryIds = [], allowAnyProduct = false } = criteria;

        let matchingProducts = products;

        if (!allowAnyProduct) {
            matchingProducts = products.filter(product => {
                const matchesProductId = productIds.length === 0 || productIds.includes(product.productId);
                const matchesBrandId = brandIds.length === 0 || (product.brandId && brandIds.includes(product.brandId));
                const matchesCategoryId = categoryIds.length === 0 || (product.categoryId && categoryIds.includes(product.categoryId));
                const matchesSubcategoryId = subcategoryIds.length === 0 || (product.subcategoryId && subcategoryIds.includes(product.subcategoryId));
                return matchesProductId || matchesBrandId || matchesCategoryId || matchesSubcategoryId;
            });
        }

        matchingProducts.forEach(product => {
            const currentUsed = usedProducts.get(product.productId) || 0;
            usedProducts.set(product.productId, currentUsed + product.quantity);
        });
    }

    async trackUsedProducts(
        condition: any,
        products: IProductItem[],
        reward: any,
        usedProducts?: Map<string, number>
    ): Promise<void> {
        if (!usedProducts) return Promise.resolve();

        const { conditionType, criteria } = condition;

        switch (conditionType) {
            case ConditionType.INVOICE:
                // For invoice conditions, we don't mark products as used since they apply to the total order value
                // This allows other schemes (like combo for free products) to also apply
                // Invoice conditions work on the total order amount, not individual product consumption
                break;

            case ConditionType.COMBO:
                await this.trackComboUsedProducts(criteria, products, usedProducts);
                break;

            case ConditionType.ASSORTED:
                await this.trackAssortedUsedProducts(criteria, products, usedProducts);
                break;

            case ConditionType.LINE_ITEM:
                await this.trackLineItemUsedProducts(criteria, products, usedProducts);
                break;

            case ConditionType.FLEXIBLE_PRODUCT:
                await this.trackFlexibleProductUsedProducts(criteria, products, usedProducts);
                break;

            default:
                // For other condition types, mark all products as used
                await Promise.all(products.map(async (product) => {
                    const currentUsed = usedProducts.get(product.productId) || 0;
                    usedProducts.set(product.productId, currentUsed + product.quantity);
                }));
                break;
        }
    }
}

