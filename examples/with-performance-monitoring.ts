/**
 * Performance Monitoring Example
 * 
 * This example shows how to use the performance monitoring callback
 * to track calculation performance metrics.
 */

import { calculateReward } from '../src/calculate-reward';
import type {
    IProductItem,
    IPerformanceMetrics
} from '../src/interfaces/scheme.interface';

// Example: Calculation with performance monitoring
async function withPerformanceMonitoringExample() {
    const products: IProductItem[] = [
        {
            productId: 'PROD001',
            quantity: 10,
            unitPrice: 100
        }
    ];

    // Performance metrics storage
    const performanceMetrics: IPerformanceMetrics[] = [];

    const result = await calculateReward({
        products,
        warehouseId: 'WH001',
        channelId: 'CH001',
        businessTypeId: 'BT001',

        fetchCandidateSchemes: async () => [],
        fetchAllAvailableSchemes: async () => [],

        // Optional: Logger for detailed performance logs
        logger: (level, message) => {
            if (level === 'debug' && message.includes('Performance')) {
                console.log(`[${level.toUpperCase()}] ${message}`);
            }
        },

        // Optional: Performance monitor callback
        performanceMonitor: (metrics) => {
            performanceMetrics.push(metrics);

            console.log('\n=== Performance Metrics ===');
            console.log(`Total Duration: ${metrics.totalDuration.toFixed(2)}ms`);
            console.log(`Fetch Schemes: ${metrics.fetchSchemesDuration?.toFixed(2)}ms`);
            console.log(`Evaluation: ${metrics.evaluationDuration?.toFixed(2)}ms`);

            if (metrics.callbackDurations) {
                console.log('\nCallback Durations:');
                Object.entries(metrics.callbackDurations).forEach(([key, value]) => {
                    if (value) {
                        console.log(`  ${key}: ${value.toFixed(2)}ms`);
                    }
                });
            }

            if (metrics.schemeCounts) {
                console.log('\nScheme Counts:');
                console.log(`  Candidate: ${metrics.schemeCounts.candidateSchemes}`);
                console.log(`  Evaluated: ${metrics.schemeCounts.evaluatedSchemes}`);
                console.log(`  Applied: ${metrics.schemeCounts.appliedSchemes}`);
                console.log(`  Available: ${metrics.schemeCounts.availableSchemes}`);
            }
        }
    });

    console.log('\nCalculation completed');
    console.log('Total Discount:', result.totalDiscount);

    // In a real application, you might:
    // - Send metrics to monitoring service (e.g., DataDog, New Relic)
    // - Store metrics in database for analysis
    // - Alert if performance degrades
    // - Use metrics for optimization
}

// Run example
if (require.main === module) {
    withPerformanceMonitoringExample().catch(console.error);
}

export { withPerformanceMonitoringExample };

