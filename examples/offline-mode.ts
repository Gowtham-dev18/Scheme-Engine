/**
 * Offline Mode Example
 * 
 * This example shows how to use the calculator in offline mode
 * where schemes are already available in memory (no database/HTTP calls).
 */

import { calculateReward } from '../src/calculate-reward';
import type { IProductItem, IScheme } from '../src/interfaces/scheme.interface';
import { ConditionType, RewardType, SchemeStatus, ConditionBasis, AggregationBasis } from '../src/enums/scheme.enums';

// Example: Offline calculation with direct scheme data
async function offlineModeExample() {
    const products: IProductItem[] = [
        {
            productId: 'PROD001',
            quantity: 10,
            unitPrice: 100
        }
    ];

    // Schemes already in memory (could be from cache, previous API call, etc.)
    const schemes: IScheme[] = [
        {
            schemeId: 'SCHEME001',
            schemeName: '10% Off on Orders Above 500',
            description: 'Get 10% discount on orders above 500',
            validFrom: new Date('2024-01-01'),
            validTo: new Date('2024-12-31'),
            status: SchemeStatus.ACTIVE,
            maxRewardPerInvoice: 1000,
            createdBy: 'admin',
            applicableTo: {
                warehouseIds: ['WH001'],
                channelIds: ['CH001'],
                businessTypeIds: ['BT001']
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
            ]
        }
    ];

    const result = await calculateReward({
        products,
        warehouseId: 'WH001',
        channelId: 'CH001',
        businessTypeId: 'BT001',

        // Pass schemes directly via callbacks (no database/HTTP calls)
        fetchCandidateSchemes: async () => schemes,
        fetchAllAvailableSchemes: async () => schemes
    });

    console.log('Offline calculation completed');
    console.log('Total Discount:', result.totalDiscount);
    console.log('Applied Schemes:', result.appliedSchemes.map(s => s.schemeName));
}

// Run example
if (require.main === module) {
    offlineModeExample().catch(console.error);
}

export { offlineModeExample };

