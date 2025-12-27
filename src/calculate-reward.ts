import {
    IScheme,
    IRewardCalculationResponse,
    IFreeProductReward,
    IProductDiscountReward,
    ISchemeApplicability,
    CalculateRewardParams,
    LoggerCallback,
    FetchCandidateSchemesParams,
    FetchMissingExcludedSchemesParams,
    FetchAllAvailableSchemesParams,
    IPerformanceMetrics,
} from './interfaces/scheme.interface';
import { SchemeAppliedStatus } from './enums/scheme.enums';
import { EvaluatorsService } from './services/evaluators';



/**
 * Build candidate set of schemes for evaluation
 * This is a standalone function that accepts callbacks
 */
async function buildCandidateSet(
    warehouseId: string,
    channelId: string,
    businessTypeId: string,
    includeSchemes: string[] | undefined,
    excludeSchemes: string[] | undefined,
    now: Date,
    fetchCandidateSchemes: (params: FetchCandidateSchemesParams) => Promise<IScheme[]>,
    fetchMissingExcludedSchemes?: (params: FetchMissingExcludedSchemesParams) => Promise<IScheme[]>,
    logger?: LoggerCallback
): Promise<{ candidateSchemes: IScheme[]; excludedSchemes: IScheme[] }> {
    // Call callback with parameters - service layer builds query
    const processedSchemes = await fetchCandidateSchemes({
        warehouseId,
        channelId,
        businessTypeId,
        includeSchemes,
        excludeSchemes,
        now
    });

    // Debug logging
    if (processedSchemes.length > 0 && logger) {
        logger('debug', `BuildCandidateSet - First scheme properties: ${JSON.stringify(Object.keys(processedSchemes[0]))}`);
        logger('debug', `BuildCandidateSet - First scheme applicableTo: ${JSON.stringify(processedSchemes[0].applicableTo)}`);

        // Validate that each scheme has the required properties
        processedSchemes.forEach((scheme, index) => {
            if (!scheme.applicableTo) {
                logger('error', `BuildCandidateSet - Scheme at index ${index} (schemeId: ${scheme.schemeId}) is missing applicableTo property`);
            }
            if (!scheme.schemeId) {
                logger('error', `BuildCandidateSet - Scheme at index ${index} is missing schemeId property`);
            }
            if (!Array.isArray(scheme.conditions)) {
                logger('error', `BuildCandidateSet - Scheme at index ${index} (schemeId: ${scheme.schemeId}) has invalid conditions property: ${typeof scheme.conditions}`);
            }
        });
    }

    // Separate excluded schemes from candidate schemes
    const candidateSchemes: IScheme[] = [];
    let excludedSchemes: IScheme[] = [];

    processedSchemes.forEach(scheme => {
        if (excludeSchemes && excludeSchemes.length > 0 && excludeSchemes.includes(scheme.schemeId)) {
            excludedSchemes.push(scheme);
        } else {
            candidateSchemes.push(scheme);
        }
    });

    // If includeSchemes is provided and excludeSchemes is also provided,
    // we need to explicitly fetch the excluded schemes because they weren't in the initial query
    if (includeSchemes && includeSchemes.length > 0 && excludeSchemes && excludeSchemes.length > 0) {
        // Find which excluded schemes are not in the processedSchemes (because they weren't in includeSchemes)
        const processedSchemeIds = new Set(processedSchemes.map(s => s.schemeId));
        const missingExcludedSchemeIds = excludeSchemes.filter(id => !processedSchemeIds.has(id));

        if (missingExcludedSchemeIds.length > 0 && fetchMissingExcludedSchemes) {
            if (logger) {
                logger('log', `Fetching ${missingExcludedSchemeIds.length} explicitly excluded schemes that were not in includeSchemes`);
            }

            // Fetch the missing excluded schemes using callback
            const processedMissingSchemes = await fetchMissingExcludedSchemes({
                schemeIds: missingExcludedSchemeIds,
                now
            });

            excludedSchemes = [...excludedSchemes, ...processedMissingSchemes];

            if (logger) {
                logger('log', `Added ${processedMissingSchemes.length} missing excluded schemes`);
            }
        }
    }

    if (logger) {
        logger('log', `Built candidate set with ${candidateSchemes.length} schemes and ${excludedSchemes.length} excluded schemes`);
    }

    return { candidateSchemes, excludedSchemes };
}

/**
 * Get all available schemes for the warehouse
 * This is a standalone function that accepts callbacks
 */
async function getAllAvailableSchemes(
    warehouseId: string,
    channelId: string,
    businessTypeId: string,
    outletId: string | undefined,
    now: Date,
    fetchAllAvailableSchemes: (params: FetchAllAvailableSchemesParams) => Promise<IScheme[]>,
    logger?: LoggerCallback
): Promise<IScheme[]> {
    // Call callback with parameters - service layer builds query
    const processedSchemes = await fetchAllAvailableSchemes({
        warehouseId,
        channelId,
        businessTypeId,
        outletId,
        now
    });

    if (logger) {
        logger('log', `[getAllAvailableSchemes] Fetched ${processedSchemes.length} schemes from database`);

        // Log first scheme raw to debug
        if (processedSchemes.length > 0) {
            logger('log', `[getAllAvailableSchemes] First scheme raw: ${JSON.stringify({
                schemeId: processedSchemes[0].schemeId,
                schemeName: processedSchemes[0].schemeName
            })}`);
        }

        processedSchemes.forEach((scheme, index) => {
            logger('debug', `[getAllAvailableSchemes] Processing scheme - schemeId: ${scheme.schemeId}, schemeName: ${scheme.schemeName}`);

            // Validate that each scheme has the required properties
            if (!scheme.applicableTo) {
                logger('error', `Scheme at index ${index} (schemeId: ${scheme.schemeId}) is missing applicableTo property`);
            }
            if (!scheme.schemeId) {
                logger('error', `Scheme at index ${index} is missing schemeId property`);
            }
            if (!Array.isArray(scheme.conditions)) {
                logger('error', `Scheme at index ${index} (schemeId: ${scheme.schemeId}) has invalid conditions property: ${typeof scheme.conditions}`);
            }
        });

        logger('log', `Found ${processedSchemes.length} total available schemes for warehouse ${warehouseId} and outlet ${outletId}`);
    }

    return processedSchemes;
}

/**
 * Main function to calculate rewards for products based on schemes
 * This is a higher-order function that accepts callback functions for data fetching
 * 
 * @param params - Calculation parameters including callback functions
 * @returns Reward calculation response matching the API structure
 */
export async function calculateReward(params: CalculateRewardParams): Promise<IRewardCalculationResponse> {
    try {
        const {
            products,
            warehouseId,
            channelId = '',
            businessTypeId = '',
            outletId,
            includeSchemes,
            excludeSchemes,
            fetchCandidateSchemes,
            fetchMissingExcludedSchemes,
            fetchAllAvailableSchemes,
            logger,
            productDataProvider,
            performanceMonitor
        } = params;

        // Start performance monitoring
        const startTime = performance.now();
        const metrics: IPerformanceMetrics = {
            totalDuration: 0,
            callbackDurations: {},
            schemeCounts: {
                candidateSchemes: 0,
                evaluatedSchemes: 0,
                appliedSchemes: 0,
                availableSchemes: 0
            }
        };

        // Validate input
        if (!products || products.length === 0) {
            throw new Error('Products array is required and cannot be empty');
        }

        if (!warehouseId) {
            throw new Error('warehouseId is required');
        }

        if (!fetchCandidateSchemes || !fetchAllAvailableSchemes) {
            throw new Error('fetchCandidateSchemes and fetchAllAvailableSchemes callbacks are required');
        }

        const now = new Date();

        // Step 1: Build candidate set based on priority logic
        const fetchSchemesStart = performance.now();
        const { candidateSchemes, excludedSchemes } = await buildCandidateSet(
            warehouseId,
            channelId,
            businessTypeId,
            includeSchemes,
            excludeSchemes,
            now,
            async (params) => {
                const callbackStart = performance.now();
                const result = await fetchCandidateSchemes(params);
                if (metrics.callbackDurations) {
                    metrics.callbackDurations.fetchCandidateSchemes = performance.now() - callbackStart;
                }
                return result;
            },
            fetchMissingExcludedSchemes ? async (params) => {
                const callbackStart = performance.now();
                const result = await fetchMissingExcludedSchemes(params);
                if (metrics.callbackDurations) {
                    metrics.callbackDurations.fetchMissingExcludedSchemes = performance.now() - callbackStart;
                }
                return result;
            } : undefined,
            logger
        );
        metrics.fetchSchemesDuration = performance.now() - fetchSchemesStart;
        if (metrics.schemeCounts) {
            metrics.schemeCounts.candidateSchemes = candidateSchemes.length;
        }

        if (logger) {
            logger('log', `Found ${candidateSchemes.length} candidate schemes for warehouse ${warehouseId}`);
        }

        // Step 2: Calculate initial totals
        const totalValue = products.reduce((sum, product) => {
            return sum + ((product.unitPrice || 0) * product.quantity);
        }, 0);
        const totalQuantity = products.reduce((sum, product) => sum + product.quantity, 0);

        // Step 3: Initialize evaluators service (with optional logger and productDataProvider)
        const evaluatorsService = new EvaluatorsService(
            logger ? {
                log: (msg: string) => logger('log', msg),
                debug: (msg: string) => logger('debug', msg),
                warn: (msg: string) => logger('warn', msg),
                error: (msg: string) => logger('error', msg),
            } : undefined,
            undefined, // validatorsService
            undefined, // trackersService
            params.productDataProvider // productDataProvider callbacks
        );

        // Step 4: Evaluate all schemes and categorize them
        const evaluationStart = performance.now();
        const evaluationResult = await evaluatorsService.evaluateSchemes(
            candidateSchemes,
            products,
            warehouseId,
            channelId,
            businessTypeId,
            outletId,
            totalValue,
            totalQuantity,
            includeSchemes
        );
        metrics.evaluationDuration = performance.now() - evaluationStart;
        if (metrics.schemeCounts) {
            metrics.schemeCounts.evaluatedSchemes = candidateSchemes.length;
            metrics.schemeCounts.appliedSchemes = evaluationResult.appliedSchemes.length;
        }

        // Step 5: Get all available schemes for the warehouse (not just included ones)
        // This gives users visibility into all schemes they can potentially use
        const fetchAllStart = performance.now();
        const allAvailableSchemes = await getAllAvailableSchemes(
            warehouseId,
            channelId,
            businessTypeId,
            outletId,
            now,
            async (params) => {
                const callbackStart = performance.now();
                const result = await fetchAllAvailableSchemes(params);
                if (metrics.callbackDurations) {
                    metrics.callbackDurations.fetchAllAvailableSchemes = performance.now() - callbackStart;
                }
                return result;
            },
            logger
        );
        const fetchAllDuration = performance.now() - fetchAllStart;
        if (metrics.callbackDurations) {
            metrics.callbackDurations.fetchAllAvailableSchemes = (metrics.callbackDurations.fetchAllAvailableSchemes || 0) + fetchAllDuration;
        }

        // Filter to ensure only schemes applicable to this warehouse are included
        // Strict warehouse filtering: scheme must have warehouseId in warehouseIds OR be global (empty warehouseIds)
        const warehouseApplicableSchemes = allAvailableSchemes.filter(scheme => {
            const applicableTo = scheme.applicableTo;
            if (!applicableTo) {
                return false;
            }

            // Check if warehouse is explicitly in warehouseIds OR scheme is global (empty warehouseIds)
            const hasWarehouseIds = applicableTo.warehouseIds && applicableTo.warehouseIds.length > 0;
            const isGlobalWarehouse = !hasWarehouseIds; // Global scheme applies to all warehouses
            const warehouseMatches = hasWarehouseIds && (applicableTo.warehouseIds || []).includes(warehouseId);

            return isGlobalWarehouse || warehouseMatches;
        });

        if (logger) {
            logger('log', `Filtered ${warehouseApplicableSchemes.length} warehouse-applicable schemes from ${allAvailableSchemes.length} total schemes`);
        }

        // Add excluded schemes to the available schemes list with excluded status
        // Remove duplicates by schemeId, prioritizing excluded schemes
        const schemeMap = new Map<string, IScheme>();

        // First add all warehouse-applicable schemes
        warehouseApplicableSchemes.forEach(scheme => { schemeMap.set(scheme.schemeId, scheme); });

        // Then add excluded schemes (this will overwrite if duplicate)
        excludedSchemes.forEach(scheme => { schemeMap.set(scheme.schemeId, scheme); });

        const allSchemesWithExcluded = Array.from(schemeMap.values());

        // Step 6: Evaluate all available schemes to show their status
        const allSchemesEvaluation = await evaluatorsService.evaluateAllAvailableSchemes(
            allSchemesWithExcluded,
            products,
            warehouseId,
            channelId,
            businessTypeId,
            outletId,
            totalValue,
            totalQuantity,
            evaluationResult.appliedSchemeIds || new Set(),
            excludeSchemes
        );

        // Step 7: Calculate final totals
        const totalDiscount = evaluationResult.appliedSchemes.reduce((sum, reward) => sum + reward.totalDiscount, 0);
        const totalRewardAmount = evaluationResult.appliedSchemes.reduce((sum, reward) => sum + reward.rewardAmount, 0);

        const allFreeProducts: IFreeProductReward[] = [];
        const allDiscountedProducts: IProductDiscountReward[] = [];

        evaluationResult.appliedSchemes.forEach(reward => {
            if (reward.freeProducts && reward.freeProducts.length > 0) {
                allFreeProducts.push(...reward.freeProducts);
            }
            if (reward.discountedProducts && reward.discountedProducts.length > 0) {
                allDiscountedProducts.push(...reward.discountedProducts);
            }
        });

        const totalValueAfterDiscount = Math.max(0, totalValue - totalDiscount);

        if (logger) {
            logger('log', `Applied ${evaluationResult.appliedSchemes.length} rewards with total discount: ${totalDiscount}`);
            logger('log', `Total value: ${totalValue}, Total value after discount: ${totalValueAfterDiscount}, Free products: ${allFreeProducts.length}`);

            // Debug: Log all schemes with their statuses
            logger('log', `All schemes evaluation (${allSchemesEvaluation.length} total):`);
            allSchemesEvaluation.forEach((scheme: ISchemeApplicability) => {
                logger('log', `  - schemeId: ${scheme.schemeId}, name: ${scheme.schemeName || 'N/A'}, status: ${scheme.status}${scheme.reason ? ', reason: ' + scheme.reason : ''}`);
            });
        }

        // Filter availableSchemes to show only:
        // - EXCLUDED schemes (explicitly excluded by excludeSchemes parameter)
        // - BLOCKED schemes (eligible but blocked by priority/mutual exclusion) that are NOT in includeSchemes
        // Don't show:
        // - APPLIED schemes (already in appliedSchemes array)
        // - Schemes in includeSchemes (they are either applied or not eligible, no need to show in availableSchemes)
        // - NOT_APPLICABLE schemes (conditions not met for current cart)

        // Get applied scheme IDs for filtering
        const appliedSchemeIdSet = evaluationResult.appliedSchemeIds || new Set();

        // Filter availableSchemes:
        // 1. Exclude applied schemes
        // 2. Exclude schemes in includeSchemes (they are either applied or not eligible)
        // 3. Only show EXCLUDED or BLOCKED schemes
        const availableSchemes = allSchemesEvaluation.filter((scheme: ISchemeApplicability) => {
            // Don't show applied schemes
            if (appliedSchemeIdSet.has(scheme.schemeId)) {
                return false;
            }

            // Don't show schemes in includeSchemes (they are either applied or not eligible)
            if (includeSchemes && includeSchemes.includes(scheme.schemeId)) {
                return false;
            }

            // Only show EXCLUDED or BLOCKED schemes
            return scheme.status === SchemeAppliedStatus.EXCLUDED ||
                scheme.status === SchemeAppliedStatus.BLOCKED;
        });

        if (logger) {
            logger('log', `Filtered availableSchemes (${availableSchemes.length} schemes): ${availableSchemes.map((s: ISchemeApplicability) => s.schemeId).join(', ')}`);
        }

        // Calculate final metrics
        metrics.totalDuration = performance.now() - startTime;
        if (metrics.schemeCounts) {
            metrics.schemeCounts.availableSchemes = availableSchemes.length;
        }

        // Log performance metrics if logger provided
        if (logger) {
            logger('debug', `Performance Metrics: Total: ${metrics.totalDuration.toFixed(2)}ms, Fetch Schemes: ${metrics.fetchSchemesDuration?.toFixed(2)}ms, Evaluation: ${metrics.evaluationDuration?.toFixed(2)}ms`);
            if (metrics.callbackDurations) {
                Object.entries(metrics.callbackDurations).forEach(([key, value]) => {
                    if (value) {
                        logger('debug', `  - ${key}: ${value.toFixed(2)}ms`);
                    }
                });
            }
        }

        // Call performance monitor callback if provided
        if (performanceMonitor) {
            performanceMonitor(metrics);
        }

        return {
            totalDiscount,
            totalRewardAmount,
            appliedSchemes: evaluationResult.appliedSchemes,
            availableSchemes,
            summary: {
                totalProducts: products.length,
                totalQuantity,
                totalValue,
                totalValueAfterDiscount,
                schemesApplied: evaluationResult.appliedSchemes.length,
                freeProducts: allFreeProducts,
                discountedProducts: allDiscountedProducts.length > 0 ? allDiscountedProducts : undefined,
                discountValue: totalDiscount
            }
        };
    } catch (error: any) {
        const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
        throw new Error(`Reward calculation failed: ${errorMessage}`);
    }
}
