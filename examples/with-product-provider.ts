/**
 * Example with Product Data Provider
 * 
 * This example shows how to use the productDataProvider callbacks
 * to fetch product-related data (capacity, UOM, pricing groups).
 */

import { calculateReward } from '../src/calculate-reward';
import type {
    IProductItem,
    IProductDataProvider
} from '../src/interfaces/scheme.interface';

// Example: Calculation with product data provider
async function withProductProviderExample() {
    const products: IProductItem[] = [
        {
            productId: 'PROD001',
            quantity: 10,
            unitPrice: 100,
            uom: 'KG' // Weight-based product
        }
    ];

    // Implement product data provider
    const productDataProvider: IProductDataProvider = {
        // Get product capacity in kg
        getProductCapacityInKg: async (productId: string) => {
            // In a real implementation, make HTTP call to product service
            // Example:
            // const product = await httpClient.post('PRODUCT_SERVICE', '/products/by-ids', {
            //   productIds: [productId]
            // });
            // return product[0]?.size?.capacity || 0;

            // Mock implementation
            return 10; // 10kg per unit
        },

        // Get product UOM details
        getProductUomDetails: async (productId: string) => {
            // In a real implementation, make HTTP call to product service
            // Mock implementation
            return {
                baseUom: 'EA',
                unitPerCase: [
                    { numerator: 12, buom: 'EA', denominator: 1, auom: 'BOX' }
                ]
            };
        },

        // Get pricing group products
        getPricingGroupProducts: async (productIds: string[]) => {
            // In a real implementation, make HTTP call to product service
            // Example:
            // return await httpClient.get('PRODUCT_SERVICE', 
            //   `/pricing-group-products?productId=${productIds.join(',')}`);

            // Mock implementation
            return productIds.map(id => ({
                productId: id,
                groupId: 'GROUP001'
            }));
        },

        // Get pricing groups
        getPricingGroups: async (groupIds: string[]) => {
            // In a real implementation, make HTTP call to product service
            // Mock implementation
            return groupIds.map(id => ({
                groupId: id,
                warehouse: [{ warehouseId: 'WH001' }]
            }));
        }
    };

    const result = await calculateReward({
        products,
        warehouseId: 'WH001',
        channelId: 'CH001',
        businessTypeId: 'BT001',

        fetchCandidateSchemes: async () => [],
        fetchAllAvailableSchemes: async () => [],

        // Optional: Provide product data provider
        productDataProvider
    });

    console.log('Calculation completed with product data provider');
    console.log('Result:', result);
}

// Run example
if (require.main === module) {
    withProductProviderExample().catch(console.error);
}

export { withProductProviderExample };

