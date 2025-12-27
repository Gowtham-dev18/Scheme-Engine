/**
 * Basic Usage Example
 * 
 * This example shows the minimal setup required to use the reward calculator.
 * It demonstrates how to implement the required callbacks for fetching schemes.
 */

import { calculateReward } from '../src/calculate-reward';
import type { IProductItem, IScheme } from '../src/interfaces/scheme.interface';

// Example: Basic calculation with minimal callbacks
async function basicExample() {
    const products: IProductItem[] = [
        {
            productId: 'PROD001',
            quantity: 5,
            unitPrice: 100,
            brandId: 'BRAND001',
            categoryId: 'CAT001'
        }
    ];

    const result = await calculateReward({
        products,
        warehouseId: 'WH001',
        channelId: 'CH001',
        businessTypeId: 'BT001',

        // Required: Fetch candidate schemes
        fetchCandidateSchemes: async (params) => {
            // In a real implementation, you would:
            // 1. Build MongoDB query based on params
            // 2. Fetch schemes from database
            // 3. Normalize to IScheme format
            // 4. Return schemes

            // For this example, return empty array
            return [];
        },

        // Required: Fetch all available schemes
        fetchAllAvailableSchemes: async (params) => {
            // Similar to fetchCandidateSchemes
            return [];
        }
    });

    console.log('Total Discount:', result.totalDiscount);
    console.log('Applied Schemes:', result.appliedSchemes.length);
    console.log('Summary:', result.summary);
}

// Run example
if (require.main === module) {
    basicExample().catch(console.error);
}

export { basicExample };

