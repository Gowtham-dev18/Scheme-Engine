import {
    AggregationBasis,
    ConditionType,
    MatchType,
    ProductsEnum,
    RewardType,
    SchemeAppliedStatus
} from '../enums/scheme.enums';
import {
    IApplicableTo,
    ICalculatedReward,
    IProductItem,
    IScheme,
    ISchemeApplicability,
    IProductDataProvider,
    IProductDiscountReward
} from '../interfaces/scheme.interface';
import { TrackersService } from './trackers';
import { ValidatorsService } from './validators';
import { ILogger, SilentLogger } from '../utils/logger';

const silentLogger: ILogger = new SilentLogger();

export class EvaluatorsService {
    private logger: ILogger;
    private validatorsService: ValidatorsService;
    private trackersService: TrackersService;
    private productDataProvider?: IProductDataProvider;

    constructor(
        logger?: ILogger,
        validatorsService?: ValidatorsService,
        trackersService?: TrackersService,
        productDataProvider?: IProductDataProvider
    ) {
        this.logger = logger || silentLogger;
        this.validatorsService = validatorsService || new ValidatorsService();
        this.trackersService = trackersService || new TrackersService();
        this.productDataProvider = productDataProvider;
    }


    /* Supporting functions */
    private async convertUom(
        quantity: number,
        fromUom: string | undefined,
        toUom: string | undefined,
        unitPerCase?: Array<{ numerator: number; buom: string; denominator: number; auom: string }>
    ): Promise<number> {
        // If UOMs are the same or not specified, return original quantity
        if (!fromUom || !toUom || fromUom.toUpperCase() === toUom.toUpperCase()) {
            return Promise.resolve(quantity);
        }

        // If no conversion factors provided, cannot convert
        if (!unitPerCase || unitPerCase.length === 0) {
            this.logger.warn(`No UOM conversion factors available. Cannot convert from ${fromUom} to ${toUom}. Using original quantity.`);
            return Promise.resolve(quantity);
        }

        // Find conversion factor that matches the UOMs
        const conversion = unitPerCase.find(
            conv =>
                (conv.buom.toUpperCase() === fromUom.toUpperCase() && conv.auom.toUpperCase() === toUom.toUpperCase()) ||
                (conv.auom.toUpperCase() === fromUom.toUpperCase() && conv.buom.toUpperCase() === toUom.toUpperCase())
        );

        if (!conversion) {
            this.logger.warn(`No conversion factor found from ${fromUom} to ${toUom}. Using original quantity.`);
            return Promise.resolve(quantity);
        }

        // Calculate conversion based on the conversion factor structure:
        // numerator (in buom) = denominator (in auom)
        // Example: { numerator: 1, buom: "BOX", denominator: 50, auom: "EA" } means 1 BOX = 50 EA
        // To convert from BOX to EA: multiply by (denominator/numerator) = 50/1 = 50
        // To convert from EA to BOX: multiply by (numerator/denominator) = 1/50 = 0.02
        if (conversion.buom.toUpperCase() === fromUom.toUpperCase() &&
            conversion.auom.toUpperCase() === toUom.toUpperCase()) {
            // Converting from base UOM (buom) to alternate UOM (auom)
            // Multiply by denominator/numerator to get the equivalent in auom
            return Promise.resolve(quantity * (conversion.denominator / conversion.numerator));
        } else {
            // Converting from alternate UOM (auom) to base UOM (buom)
            // Multiply by numerator/denominator to get the equivalent in buom
            return quantity * (conversion.numerator / conversion.denominator);
        }
    }

    private async calculateGroupValue(
        products: IProductItem[],
        aggregationBasis: AggregationBasis,
        targetUom?: string
    ): Promise<number> {
        if (aggregationBasis === AggregationBasis.QUANTITY) {
            // Convert all quantities first, then sum them
            const convertedQuantities = await Promise.all(
                products.map(async (p) => {
                    let quantity = p.quantity;

                    // If no target UOM specified, return original quantity
                    if (!targetUom) {
                        return quantity;
                    }

                    // If product UOM matches target UOM, no conversion needed
                    if (p.uom && p.uom.toUpperCase() === targetUom.toUpperCase()) {
                        return quantity;
                    }

                    // Check if target UOM is a weight unit (KG, G)
                    const isWeightUom = targetUom.toUpperCase() === 'KG' || targetUom.toUpperCase() === 'G' || targetUom.toUpperCase() === 'GRAM' || targetUom.toUpperCase() === 'GRAMS';

                    // Priority 1: If product has a base UOM with conversion factors, try UOM conversion first
                    // This handles cases like converting from "bag" to "kg" using unitPerCase conversion factors
                    if (p.uom && p.unitPerCase && p.unitPerCase.length > 0) {
                        const convertedQuantity = await this.convertUom(p.quantity, p.uom, targetUom, p.unitPerCase);

                        // Check if conversion was successful (convertUom returns original quantity if conversion not possible)
                        const hasMatchingConversion = p.unitPerCase.some(
                            conv =>
                                (conv.buom.toUpperCase() === p.uom?.toUpperCase() && conv.auom.toUpperCase() === targetUom?.toUpperCase()) ||
                                (conv.auom.toUpperCase() === p.uom?.toUpperCase() && conv.buom.toUpperCase() === targetUom?.toUpperCase())
                        );

                        if (hasMatchingConversion) {
                            quantity = convertedQuantity;
                            this.logger.log(`[calculateGroupValue] Product ${p.productId}: Using UOM conversion factors: ${p.quantity} ${p.uom} = ${quantity} ${targetUom}`);
                            return quantity;
                        }
                    }

                    // Priority 2: For weight UOMs, try capacity-based calculation using product's base UOM.
                    // IMPORTANT: Incoming order quantities are always treated as EACH when UOM is missing,
                    // so we must first convert from EACH → base UOM using unitPerCase before applying capacity.
                    if (isWeightUom) {
                        const { capacityInKg, baseUom } = await this.getProductCapacityAndBaseUom(p.productId);

                        if (capacityInKg > 0) {
                            // Resolve base UOM and unitPerCase information
                            const productDetails = await this.getProductUomDetails(p.productId);
                            const effectiveBaseUom = baseUom || productDetails.baseUom;
                            const effectiveUnitPerCase = p.unitPerCase && p.unitPerCase.length > 0
                                ? p.unitPerCase
                                : productDetails.unitPerCase;

                            let quantityInBaseUom = p.quantity;

                            if (effectiveBaseUom && effectiveUnitPerCase && effectiveUnitPerCase.length > 0) {
                                // Determine the "from" UOM:
                                // - if cart item has UOM, use that
                                // - otherwise, business rule: incoming quantity is EACH
                                const fromUom = p.uom && p.uom.toUpperCase() !== 'N/A' ? p.uom : 'EA';

                                const convertedToBaseUom = await this.convertUom(
                                    p.quantity,
                                    fromUom,
                                    effectiveBaseUom,
                                    effectiveUnitPerCase
                                );

                                if (convertedToBaseUom !== p.quantity) {
                                    quantityInBaseUom = convertedToBaseUom;
                                    this.logger.log(
                                        `[calculateGroupValue] Product ${p.productId}: Converted ${p.quantity} ${fromUom} to ${quantityInBaseUom} ${effectiveBaseUom} (base UOM) for weight calculation`
                                    );
                                } else {
                                    // If conversion didn't change value, still log for visibility
                                    this.logger.log(
                                        `[calculateGroupValue] Product ${p.productId}: Could not convert from ${fromUom} to ${effectiveBaseUom}, falling back to raw quantity ${quantityInBaseUom}`
                                    );
                                }
                            }

                            if (targetUom.toUpperCase() === 'KG' || targetUom.toUpperCase() === 'KILOGRAM' || targetUom.toUpperCase() === 'KILOGRAMS') {
                                // Target is KG: quantity (base UOM) × capacity (kg per base UOM) = total kg
                                quantity = capacityInKg * quantityInBaseUom;
                                this.logger.log(
                                    `[calculateGroupValue] Product ${p.productId}: Using base UOM ${effectiveBaseUom || 'N/A'}, capacity ${capacityInKg}kg per ${effectiveBaseUom || 'unit'} × quantity ${quantityInBaseUom} = ${quantity}kg`
                                );
                            } else if (targetUom.toUpperCase() === 'G' || targetUom.toUpperCase() === 'GRAM' || targetUom.toUpperCase() === 'GRAMS') {
                                // Target is G: convert capacity from KG to G
                                quantity = (capacityInKg * 1000) * quantityInBaseUom;
                                this.logger.log(
                                    `[calculateGroupValue] Product ${p.productId}: Using base UOM ${effectiveBaseUom || 'N/A'}, capacity ${capacityInKg}kg (${capacityInKg * 1000}g) per ${effectiveBaseUom || 'unit'} × quantity ${quantityInBaseUom} = ${quantity}g`
                                );
                            }
                            return quantity;
                        }
                    }

                    // Priority 3: Try UOM conversion as final fallback (in case unitPerCase wasn't provided earlier)
                    if (p.uom) {
                        const convertedQuantity = await this.convertUom(p.quantity, p.uom, targetUom, p.unitPerCase);
                        if (convertedQuantity !== p.quantity) {
                            quantity = convertedQuantity;
                            this.logger.log(`[calculateGroupValue] Product ${p.productId}: Using UOM conversion: ${p.quantity} ${p.uom} = ${quantity} ${targetUom}`);
                            return quantity;
                        }
                    }

                    // Priority 4: If UOM is missing/N/A, assume quantity is in EA (each/pieces) as orders are typically placed in pieces
                    // Then convert from EA to target UOM using unitPerCase if needed
                    if (!p.uom || p.uom.toUpperCase() === 'N/A') {
                        // If target UOM is EA (or matches), no conversion needed - return quantity as-is
                        if (targetUom && targetUom.toUpperCase() === 'EA') {
                            this.logger.log(`[calculateGroupValue] Product ${p.productId}: UOM was missing/N/A, assumed quantity ${p.quantity} is in EA (matches target UOM)`);
                            return quantity;
                        }

                        // Try to convert from EA to target UOM using unitPerCase
                        const productDetails = await this.getProductUomDetails(p.productId);
                        const unitPerCase = productDetails.unitPerCase || p.unitPerCase;

                        if (unitPerCase && unitPerCase.length > 0) {
                            // Assume quantity is in EA, convert to target UOM
                            const convertedQuantity = await this.convertUom(p.quantity, 'EA', targetUom, unitPerCase);
                            if (convertedQuantity !== p.quantity) {
                                quantity = convertedQuantity;
                                this.logger.log(`[calculateGroupValue] Product ${p.productId}: UOM was missing/N/A, assumed quantity ${p.quantity} is in EA, converted to ${quantity} ${targetUom}`);
                                return quantity;
                            }
                        }

                        // If target UOM is EA or conversion not possible, return quantity as-is (assumed to be EA)
                        this.logger.log(`[calculateGroupValue] Product ${p.productId}: UOM was missing/N/A, assumed quantity ${p.quantity} is in EA, using as-is (target: ${targetUom || 'N/A'})`);
                        return quantity;
                    }

                    // If no conversion possible, log warning and use original quantity
                    this.logger.warn(`[calculateGroupValue] Product ${p.productId}: Cannot convert from ${p.uom || 'N/A'} to ${targetUom}, using original quantity: ${quantity}`);

                    return quantity;
                })
            );

            return convertedQuantities.reduce((sum, quantity) => sum + quantity, 0);
        } else if (aggregationBasis === AggregationBasis.AMOUNT) {
            return products.reduce((sum, p) => sum + ((p.unitPrice || 0) * p.quantity), 0);
        } else if (aggregationBasis === AggregationBasis.WEIGHT) {
            // For weight-based aggregation, we must respect the actual ordered UOM (often EACH)
            // and convert it to a weight UOM (KG / G) using product capacity + UOM mappings.
            //
            // Instead of assuming that quantity is already in the product's base UOM, we
            // delegate to the QUANTITY branch with a weight targetUom so that all the
            // UOM-aware logic (baseUom, unitPerCase, capacityInKg) is reused consistently.
            //
            // If no explicit target UOM is provided, default to KG.
            const effectiveTargetUom = targetUom || 'KG';
            const totalWeight = await this.calculateGroupValue(
                products,
                AggregationBasis.QUANTITY,
                effectiveTargetUom
            );
            this.logger.log(
                `Total weight calculated (UOM-aware) as ${totalWeight}${effectiveTargetUom} for ${products.length} product(s)`
            );
            return totalWeight;
        }
        return 0;
    }

    private async getProductCapacityAndBaseUom(productId: string): Promise<{ capacityInKg: number; baseUom?: string }> {
        try {
            // Use productDataProvider callback if available
            if (this.productDataProvider?.getProductCapacityInKg) {
                const startTime = performance.now();
                const capacityInKg = await this.productDataProvider.getProductCapacityInKg(productId);
                const duration = performance.now() - startTime;
                this.logger.debug(`getProductCapacityInKg(${productId}) took ${duration.toFixed(2)}ms`);

                // Get baseUom from UOM details if available
                let baseUom: string | undefined;
                if (this.productDataProvider.getProductUomDetails) {
                    const uomStartTime = performance.now();
                    const uomDetails = await this.productDataProvider.getProductUomDetails(productId);
                    const uomDuration = performance.now() - uomStartTime;
                    this.logger.debug(`getProductUomDetails(${productId}) took ${uomDuration.toFixed(2)}ms`);
                    baseUom = uomDetails?.baseUom;
                }
                if (capacityInKg > 0) {
                    this.logger.log(`Product ${productId}: capacity=${capacityInKg}kg, baseUOM=${baseUom || 'N/A'}`);
                }
                return { capacityInKg, baseUom };
            }

            // Fallback: return 0 if no provider
            this.logger.warn(`Product ${productId}: No productDataProvider.getProductCapacityInKg available, using 0 for weight calculation`);
            return { capacityInKg: 0 };
        } catch (error: any) {
            this.logger.error(`Error fetching product ${productId} for weight calculation: ${error.message}`);
            return { capacityInKg: 0 };
        }
    }

    private async getProductUomDetails(productId: string): Promise<{ baseUom?: string; unitPerCase?: Array<{ numerator: number; buom: string; denominator: number; auom: string }> }> {
        try {
            // Use productDataProvider callback if available
            if (this.productDataProvider?.getProductUomDetails) {
                const startTime = performance.now();
                const uomDetails = await this.productDataProvider.getProductUomDetails(productId);
                const duration = performance.now() - startTime;
                this.logger.debug(`getProductUomDetails(${productId}) took ${duration.toFixed(2)}ms`);

                if (uomDetails) {
                    this.logger.log(`Product ${productId}: baseUOM=${uomDetails.baseUom || 'N/A'}, unitPerCase=${uomDetails.unitPerCase ? JSON.stringify(uomDetails.unitPerCase) : 'N/A'}`);
                    return uomDetails;
                }
            }

            // Fallback: return empty if no provider
            this.logger.warn(`Product ${productId}: No productDataProvider.getProductUomDetails available`);
            return {};
        } catch (error: any) {
            this.logger.error(`Error fetching product ${productId} for UOM details: ${error.message}`);
            return {};
        }
    }

    private async calculateRewardAmount(reward: any, baseValue: number, appliedQuantity?: number, description?: string, proratedMinValue?: number) {
        const { type, value, maxRewardAmount, discountedProducts } = reward;
        let amount = 0;

        console.log(`[calculateRewardAmount] Reward Type: ${type}, Base Value: ₹${baseValue}, Reward Value: ${value}, Applied Quantity: ${appliedQuantity || 'N/A'}, ProratedMinValue: ${proratedMinValue || 'N/A'}`);

        switch (type) {
            case RewardType.DISCOUNT_PERCENT:
                let effectiveValue = value;
                // Prioritize appliedQuantity over proratedMinValue when both are available
                // appliedQuantity is the actual calculated multiplier (e.g., floor(baseValue / minValue))
                if (appliedQuantity !== undefined && appliedQuantity >= 1) {
                    effectiveValue = value * appliedQuantity;
                    console.log(`[calculateRewardAmount] Using prorated appliedQuantity: effectiveValue = ${value}% × ${appliedQuantity} = ${effectiveValue}%`);
                } else if (proratedMinValue && proratedMinValue > 0 && baseValue >= proratedMinValue) {
                    // Fallback: calculate multiplier from proratedMinValue if appliedQuantity not provided
                    const multiplier = Math.floor(baseValue / proratedMinValue);
                    effectiveValue = value * multiplier;
                    console.log(`[calculateRewardAmount] Using proratedMinValue: multiplier = floor(${baseValue} / ${proratedMinValue}) = ${multiplier}, effectiveValue = ${value}% × ${multiplier} = ${effectiveValue}%`);
                } else {
                    console.log(`[calculateRewardAmount] No prorating: effectiveValue = ${effectiveValue}%`);
                }
                amount = (baseValue * effectiveValue) / 100;
                // Round to 2 decimal places to avoid floating point precision issues
                amount = Math.round(amount * 100) / 100;
                console.log(`[calculateRewardAmount] Discount Amount = (${baseValue} × ${effectiveValue}) / 100 = ₹${amount}`);
                // Note: Don't cap here - let the final capping logic handle it
                break;
            case RewardType.DISCOUNT_FIXED:
                // For prorated conditions, multiply the fixed discount by appliedQuantity
                // Example: base discount ₹10, appliedQuantity 3 → effective discount ₹30
                if (appliedQuantity !== undefined && appliedQuantity > 1) {
                    // Multiply by appliedQuantity for prorated conditions
                    amount = value * appliedQuantity;
                    // Round to 2 decimal places
                    amount = Math.round(amount * 100) / 100;
                    console.log(`[calculateRewardAmount] Using prorated appliedQuantity for fixed discount: amount = ${value} × ${appliedQuantity} = ₹${amount}`);
                } else if (proratedMinValue && proratedMinValue > 0 && baseValue >= proratedMinValue) {
                    // Fallback: For invoice conditions without appliedQuantity, use proportional calculation
                    const multiplier = Math.floor(baseValue / proratedMinValue);
                    amount = value * multiplier;
                    // Round to 2 decimal places
                    amount = Math.round(amount * 100) / 100;
                    console.log(`[calculateRewardAmount] Using proratedMinValue for fixed discount: amount = ${value} × floor(${baseValue} / ${proratedMinValue}) = ${value} × ${multiplier} = ₹${amount}`);
                } else {
                    // Non-prorated: use base value
                    amount = value;
                    // Round to 2 decimal places
                    amount = Math.round(amount * 100) / 100;
                    console.log(`[calculateRewardAmount] No prorating for fixed discount: amount = ₹${amount}`);
                }
                break;
            case RewardType.CASHBACK:
                amount = value;
                break;
            case RewardType.LOYALTY_POINTS:
                amount = value;
                break;
            case RewardType.FREE_PRODUCT:
                amount = 0;
                break;
            case RewardType.PRODUCT_DISCOUNT:
                amount = discountedProducts.reduce((sum: number, product: IProductDiscountReward) => sum + product.value, 0);
                break;
            default:
                amount = 0;
        }

        // Round amount to 2 decimal places before applying maxRewardAmount limit
        const calculatedAmount = Math.round(amount * 100) / 100;
        let isCapped = false;
        let finalAmount = calculatedAmount;

        // Apply maximum reward amount limit
        if (maxRewardAmount) {
            if (calculatedAmount > maxRewardAmount) {
                // Definitely capped: calculated amount exceeds max
                finalAmount = maxRewardAmount;
                isCapped = true;
            } else if (calculatedAmount === maxRewardAmount) {
                // If calculated amount exactly equals maxRewardAmount, it's likely capped
                // (heuristic: if there's a max limit and we hit it exactly, it's probably capped)
                finalAmount = calculatedAmount;
                isCapped = true;
            } else {
                // Calculated amount is less than max, so not capped
                finalAmount = calculatedAmount;
                isCapped = false;
            }
        } else {
            // No maxRewardAmount set, so not capped
            finalAmount = calculatedAmount;
            isCapped = false;
        }

        amount = finalAmount;

        return {
            amount,
            appliedQuantity: appliedQuantity !== undefined ? appliedQuantity : baseValue,
            discount: amount,
            description: description || '',
            isCapped,
            maxRewardAmount: maxRewardAmount || undefined,
            calculatedDiscountAmount: isCapped ? calculatedAmount : undefined
        };
    }

    private async checkPricingGroupMapping(products: IProductItem[], warehouseId: string): Promise<{ isValid: boolean; unmappedProducts: string[] }> {
        try {
            // Extract unique product IDs
            const productIds = [...new Set(products.map(p => p.productId))];

            if (productIds.length === 0) {
                return { isValid: true, unmappedProducts: [] };
            }

            // Use productDataProvider callbacks if available
            if (!this.productDataProvider?.getPricingGroupProducts || !this.productDataProvider?.getPricingGroups) {
                // If no provider, skip validation (assume valid)
                this.logger.warn(`No productDataProvider for pricing group mapping, skipping validation`);
                return { isValid: true, unmappedProducts: [] };
            }

            // Call productDataProvider to get pricing group products
            const pricingGroupStart = performance.now();
            const pricingGroupProducts = await this.productDataProvider.getPricingGroupProducts(productIds);
            const pricingGroupDuration = performance.now() - pricingGroupStart;
            this.logger.debug(`getPricingGroupProducts(${productIds.length} products) took ${pricingGroupDuration.toFixed(2)}ms`);

            if (!pricingGroupProducts || pricingGroupProducts.length === 0) {
                // No pricing group mapping found
                return { isValid: false, unmappedProducts: productIds };
            }

            // Get unique group IDs from the pricing group products
            const groupIds = [...new Set(pricingGroupProducts.map((item: any) => item.groupId))];

            if (groupIds.length === 0) {
                return { isValid: false, unmappedProducts: productIds };
            }

            // Get pricing groups to check warehouse mapping
            const pricingGroupsStart = performance.now();
            const pricingGroups = await this.productDataProvider.getPricingGroups(groupIds);
            const pricingGroupsDuration = performance.now() - pricingGroupsStart;
            this.logger.debug(`getPricingGroups(${groupIds.length} groups) took ${pricingGroupsDuration.toFixed(2)}ms`);

            if (!pricingGroups || pricingGroups.length === 0) {
                return { isValid: false, unmappedProducts: productIds };
            }

            // Check if any pricing group is mapped to the warehouse
            const isWarehouseMapped = pricingGroups.some((group: any) =>
                group.warehouse && group.warehouse.some((w: any) => w.warehouseId === warehouseId)
            );

            if (!isWarehouseMapped) {
                return { isValid: false, unmappedProducts: productIds };
            }

            // Get mapped product IDs
            const mappedProductIds = new Set(pricingGroupProducts.map((item: any) => item.productId));

            // Find unmapped products
            const unmappedProducts = productIds.filter(id => !mappedProductIds.has(id));

            return {
                isValid: unmappedProducts.length === 0,
                unmappedProducts
            };
        } catch (error: any) {
            this.logger.error(`Error checking pricing group mapping: ${error.message}`);
            // In case of error, allow the scheme to proceed (fail open)
            return { isValid: true, unmappedProducts: [] };
        }
    }


    /* Condition evaluation */
    private async evaluateCondition(
        condition: any,
        products: IProductItem[],
        totalValue: number,
        totalQuantity: number,
        warehouseId?: string
    ): Promise<{ amount: number; appliedQuantity: number; discount: number; description: string; isCapped?: boolean; maxRewardAmount?: number; calculatedDiscountAmount?: number } | null> {
        const { conditionType, criteria, reward, isProRated, isAvailableForHalf } = condition;

        if (isProRated && conditionType !== ConditionType.INVOICE) {
            if (conditionType === ConditionType.COMBO && criteria.matchType === MatchType.ALL) {
                const comboResult = await this.evaluateComboCondition(criteria, products, reward);
                if (!comboResult) {
                    return null;
                }
                return await this.evaluateProratedLogic(criteria, products, reward, isAvailableForHalf, totalValue);
            }
            // For assorted conditions, pass totalValue so discount is applied to cart value
            return await this.evaluateProratedLogic(criteria, products, reward, isAvailableForHalf, totalValue);
        }

        switch (conditionType) {
            case ConditionType.COMBO:
                return await this.evaluateComboCondition(criteria, products, reward);
            case ConditionType.ASSORTED:
                return await this.evaluateAssortedCondition(criteria, products, reward);
            case ConditionType.INVOICE:
                return this.evaluateInvoiceCondition(criteria, totalValue, totalQuantity, reward, isProRated);
            case ConditionType.LINE_ITEM:
                return this.evaluateLineItemCondition(criteria, products, reward, warehouseId, totalValue);
            case ConditionType.FLEXIBLE_PRODUCT:
                return this.evaluateFlexibleProductCondition(criteria, products, reward);
            default:
                return null;
        }
    }

    private async evaluateComboCondition(criteria: any, products: IProductItem[], reward: any) {
        const { matchType, criteria: criteriaArray, minValue, maxValue, aggregationBasis } = criteria;

        // Handle nested criteria structure
        if (!criteriaArray || !Array.isArray(criteriaArray) || criteriaArray.length === 0) {
            return null;
        }

        let matchedProducts = 0;
        let totalMatchedQty = 0;
        let totalMatchedValue = 0;
        let totalMatchedWeight = 0;
        // Process each criterion individually for matchType 'all'
        if (matchType === MatchType.ALL) {
            for (const criterion of criteriaArray) {
                const hasIdentifier = criterion.productId || criterion.brandId || criterion.categoryId || criterion.subcategoryId;
                if (!hasIdentifier) {
                    return null;
                }

                const criterionProducts = products.filter(product => {
                    // Strict matching: if an identifier is specified, it must match exactly
                    const matchesProductId = !criterion.productId || product.productId === criterion.productId;
                    const matchesBrandId = !criterion.brandId || (product.brandId && product.brandId === criterion.brandId);
                    const matchesCategoryId = !criterion.categoryId || (product.categoryId && product.categoryId === criterion.categoryId);
                    const matchesSubcategoryId = !criterion.subcategoryId || (product.subcategoryId && product.subcategoryId === criterion.subcategoryId);

                    return matchesProductId && matchesBrandId && matchesCategoryId && matchesSubcategoryId;
                });

                if (criterionProducts.length === 0) return null; // No products match this criterion

                // Check individual criterion constraints using its own aggregationBasis (no fallback to top-level for combo)
                const criterionAggregationBasis = criterion.aggregationBasis || AggregationBasis.QUANTITY;
                // Get target UOM from criterion if specified (for quantity-based aggregation)
                const targetUom = criterionAggregationBasis === AggregationBasis.QUANTITY ? criterion.uom : undefined;

                // Log UOM information for debugging (similar to prorated logic)
                if (targetUom) {
                    this.logger.log(`[Combo EA Check] Criterion: Target UOM from criterion = ${targetUom}`);
                    if (criterionProducts.length > 0) {
                        const product = criterionProducts[0];
                        const productUom = product.uom || 'N/A';
                        this.logger.log(`[Combo EA Check] Criterion: Product UOM in cart = ${productUom}`);
                        if (product.unitPerCase && product.unitPerCase.length > 0) {
                            this.logger.log(`[Combo EA Check] Criterion: Product unitPerCase = ${JSON.stringify(product.unitPerCase)}`);
                        }
                    }
                }

                const criterionValue = await this.calculateGroupValue(criterionProducts, criterionAggregationBasis, targetUom);

                // When targetUom is EA, explicitly confirm we're checking in EA
                if (targetUom && targetUom.toUpperCase() === 'EA' && criterion.hasMinValue) {
                    this.logger.log(`[Combo EA Check] Checking minValue in EA - Criterion Value: ${criterionValue} EA, MinValue: ${criterion.minValue} EA`);
                }

                // Check individual criterion min/max constraints
                if (criterion.hasMinValue) {
                    let minValueMet = criterionValue >= criterion.minValue;

                    // If minValue is not met in the target UOM, try checking in EA as a fallback
                    // This handles cases where the scheme name says "Pcs" but criteria is in BOX
                    if (!minValueMet && targetUom && criterionAggregationBasis === AggregationBasis.QUANTITY && criterionProducts.length > 0) {
                        const product = criterionProducts[0];
                        const unitPerCase = product.unitPerCase || [];

                        // Convert criterionValue to EA
                        const criterionValueInEA = await this.calculateGroupValue(criterionProducts, criterionAggregationBasis, 'EA');

                        // Convert minValue from targetUom to EA using product's unitPerCase
                        if (unitPerCase.length > 0) {
                            const minValueInEA = await this.convertUom(criterion.minValue, targetUom, 'EA', unitPerCase);

                            if (criterionValueInEA > 0 && minValueInEA > 0 && minValueInEA !== criterion.minValue) {
                                this.logger.log(`[Combo EA Check] Trying EA comparison: ${criterionValueInEA} EA vs ${minValueInEA} EA (minValue ${criterion.minValue} ${targetUom} = ${minValueInEA} EA)`);
                                if (criterionValueInEA >= minValueInEA) {
                                    minValueMet = true;
                                    this.logger.log(`[Combo EA Check] ✅ MinValue requirement met in EA (${criterionValueInEA} EA >= ${minValueInEA} EA)`);
                                }
                            }
                        }
                    }

                    if (!minValueMet) {
                        this.logger.log(`[Combo] Criterion minValue not met: ${criterionValue} < ${criterion.minValue} (targetUom: ${targetUom || 'N/A'})`);
                        return null;
                    }
                }

                if (criterion.hasMaxValue && criterionValue > criterion.maxValue) {
                    this.logger.log(`[Combo] Criterion maxValue exceeded: ${criterionValue} > ${criterion.maxValue} (targetUom: ${targetUom || 'N/A'})`);
                    return null;
                }

                // Add to totals based on criterion's aggregation basis
                if (criterionAggregationBasis === AggregationBasis.QUANTITY) {
                    totalMatchedQty += criterionValue;
                } else if (criterionAggregationBasis === AggregationBasis.WEIGHT) {
                    totalMatchedWeight += criterionValue;
                } else {
                    totalMatchedValue += criterionValue;
                }
            }

            // For matchType 'all', each criterion is already validated independently
            // Top-level min/max should not apply as criteria have their own constraints
            matchedProducts = products.length;

            // Use the appropriate total based on the actual aggregation used
            // If criteria use different aggregation bases, prefer quantity as the default
            let rewardBasisValue = totalMatchedQty || totalMatchedValue;
            if (totalMatchedQty > 0 && totalMatchedValue > 0) {
                // If both exist (mixed aggregation types across criteria), default to quantity
                rewardBasisValue = totalMatchedQty;
            }

            return this.calculateRewardAmount(reward, rewardBasisValue, undefined, `Combo condition met with ${matchedProducts} products`);
        } else {
            // For 'any' matchType, use the original logic
            const filteredProducts = products.filter(product => {
                return criteriaArray.some(criterion => {
                    const matchesProductId = !criterion.productId || product.productId === criterion.productId;
                    const matchesBrandId = !criterion.brandId || (product.brandId && product.brandId === criterion.brandId);
                    const matchesCategoryId = !criterion.categoryId || (product.categoryId && product.categoryId === criterion.categoryId);
                    const matchesSubcategoryId = !criterion.subcategoryId || (product.subcategoryId && product.subcategoryId === criterion.subcategoryId);

                    return matchesProductId && matchesBrandId && matchesCategoryId && matchesSubcategoryId;
                });
            });

            if (filteredProducts.length === 0) return null;

            // Calculate aggregated values using top-level aggregationBasis
            const effectiveAggregationBasis = aggregationBasis || AggregationBasis.QUANTITY;
            // Note: For 'any' matchType, we use top-level aggregationBasis but no specific UOM conversion
            // Individual criteria UOMs are not applicable here as we're aggregating across all matched products
            totalMatchedQty = await this.calculateGroupValue(filteredProducts, effectiveAggregationBasis);
            if (effectiveAggregationBasis === AggregationBasis.QUANTITY) {
                // Already calculated above
            } else if (effectiveAggregationBasis === AggregationBasis.AMOUNT || effectiveAggregationBasis === AggregationBasis.WEIGHT) {
                totalMatchedValue = totalMatchedQty;
                totalMatchedQty = 0;
            }

            // Check overall min/max value constraints for 'any' matchType
            const checkValue = effectiveAggregationBasis === AggregationBasis.QUANTITY ? totalMatchedQty : totalMatchedValue;
            if (minValue !== undefined && checkValue < minValue) return null;
            if (maxValue !== undefined && checkValue > maxValue) return null;

            matchedProducts = products.length;

            return this.calculateRewardAmount(reward, checkValue, undefined, `Combo condition met with ${matchedProducts} products`);
        }
    }

    private async evaluateProratedLogic(
        criteria: any,
        products: IProductItem[],
        reward: any,
        isAvailableForHalf: boolean = false,
        totalCartValue?: number
    ) {
        const {
            maxApplications,
            minValue,
            aggregationBasis,
            criteria: unifiedCriteria = [],
            matchType // For combo conditions
        } = criteria;

        let totalApplications = 0;
        let totalGroupValue = 0;

        // For combo conditions with matchType 'all', ensure ALL criteria are satisfied
        // For prorated combo conditions, calculate applications based on quantity-based criteria only
        if (matchType === MatchType.ALL && unifiedCriteria.length > 0) {
            console.log('=== PRORATED COMBO CONDITION (matchType: all) ===');
            let quantityBasedApplications: number[] = [];
            let totalInvoiceValue = products.reduce((sum, p) => sum + ((p.unitPrice || 0) * p.quantity), 0);
            console.log(`Total Invoice Value: ₹${totalInvoiceValue}`);

            for (let i = 0; i < unifiedCriteria.length; i++) {
                const criterion = unifiedCriteria[i];
                console.log(`\n--- Processing Criterion ${i + 1} ---`);
                console.log(`Criterion:`, {
                    productId: criterion.productId || 'N/A',
                    brandId: criterion.brandId || 'N/A',
                    categoryId: criterion.categoryId || 'N/A',
                    subcategoryId: criterion.subcategoryId || 'N/A',
                    aggregationBasis: criterion.aggregationBasis || aggregationBasis || AggregationBasis.QUANTITY,
                    hasMinValue: criterion.hasMinValue,
                    minValue: criterion.minValue,
                    hasMaxValue: criterion.hasMaxValue,
                    maxValue: criterion.maxValue
                });

                const hasIdentifier = criterion.productId || criterion.brandId || criterion.categoryId || criterion.subcategoryId;
                if (!hasIdentifier) {
                    console.log(`❌ Criterion ${i + 1}: No identifier found - REJECTING`);
                    return null; // Each criterion must have an identifier for 'all' matchType
                }

                const criterionProducts = products.filter(product => {
                    const matchesProductId = !criterion.productId || product.productId === criterion.productId;
                    const matchesBrandId = !criterion.brandId || (product.brandId && product.brandId === criterion.brandId);
                    const matchesCategoryId = !criterion.categoryId || (product.categoryId && product.categoryId === criterion.categoryId);
                    const matchesSubcategoryId = !criterion.subcategoryId || (product.subcategoryId && product.subcategoryId === criterion.subcategoryId);
                    return matchesProductId && matchesBrandId && matchesCategoryId && matchesSubcategoryId;
                });

                console.log(`Matched Products: ${criterionProducts.length}`, criterionProducts.map(p => ({
                    productId: p.productId,
                    quantity: p.quantity,
                    unitPrice: p.unitPrice,
                    brandId: p.brandId
                })));

                if (criterionProducts.length === 0) {
                    console.log(`⚠️ Criterion ${i + 1}: No products match - SKIPPING (prorated combo allows partial fulfillment)`);
                    // For prorated combo conditions, skip criteria with no matches instead of rejecting
                    // This allows schemes to work when only some criteria are satisfied
                    continue;
                }

                // Check minValue constraint for this criterion
                const criterionAggregationBasis = criterion.aggregationBasis || aggregationBasis || AggregationBasis.QUANTITY;
                // Get target UOM from criterion if specified (for quantity-based aggregation)
                const targetUom = criterionAggregationBasis === AggregationBasis.QUANTITY ? criterion.uom : undefined;

                // Log UOM information for debugging
                if (targetUom) {
                    console.log(`[EA Check] Criterion ${i + 1}: Target UOM from criterion = ${targetUom}`);
                    if (criterionProducts.length > 0) {
                        const product = criterionProducts[0];
                        const productUom = product.uom || 'N/A';
                        console.log(`[EA Check] Criterion ${i + 1}: Product UOM in cart = ${productUom}`);
                        if (product.unitPerCase && product.unitPerCase.length > 0) {
                            console.log(`[EA Check] Criterion ${i + 1}: Product unitPerCase = ${JSON.stringify(product.unitPerCase)}`);
                        }
                    }
                }

                const criterionValue = await this.calculateGroupValue(criterionProducts, criterionAggregationBasis, targetUom);
                console.log(`Aggregation Basis: ${criterionAggregationBasis}`);
                if (targetUom) {
                    console.log(`Target UOM: ${targetUom}`);
                }
                console.log(`Criterion Value: ${criterionAggregationBasis === AggregationBasis.QUANTITY ? criterionValue + ' ' + (targetUom || 'units') : '₹' + criterionValue}`);

                if (criterion.hasMinValue) {
                    const minValueDisplay = criterionAggregationBasis === AggregationBasis.QUANTITY
                        ? `${criterion.minValue} ${targetUom || AggregationBasis.UNITS}`
                        : `₹${criterion.minValue}`;
                    console.log(`Min Value Required: ${minValueDisplay}`);

                    // When targetUom is EA, explicitly confirm we're checking in EA
                    if (targetUom && targetUom.toUpperCase() === 'EA') {
                        console.log(`[EA Check] Criterion ${i + 1}: Checking minValue in EA - Criterion Value: ${criterionValue} EA, MinValue: ${criterion.minValue} EA`);
                    }

                    let minValueMet = criterionValue >= criterion.minValue;

                    // If minValue is not met in the target UOM, try checking in EA as a fallback
                    // This handles cases where the scheme name says "Pcs" but criteria is in BOX
                    if (!minValueMet && targetUom && criterionAggregationBasis === AggregationBasis.QUANTITY && criterionProducts.length > 0) {
                        const product = criterionProducts[0];
                        const unitPerCase = product.unitPerCase || [];

                        // Convert criterionValue to EA
                        const criterionValueInEA = await this.calculateGroupValue(criterionProducts, criterionAggregationBasis, 'EA');

                        // Convert minValue from targetUom to EA using product's unitPerCase
                        if (unitPerCase.length > 0) {
                            const minValueInEA = await this.convertUom(criterion.minValue, targetUom, 'EA', unitPerCase);

                            if (criterionValueInEA > 0 && minValueInEA > 0 && minValueInEA !== criterion.minValue) {
                                console.log(`Trying EA comparison: ${criterionValueInEA} EA vs ${minValueInEA} EA (minValue ${criterion.minValue} ${targetUom} = ${minValueInEA} EA)`);
                                if (criterionValueInEA >= minValueInEA) {
                                    minValueMet = true;
                                    console.log(`✅ Criterion ${i + 1}: MinValue requirement met in EA (${criterionValueInEA} EA >= ${minValueInEA} EA)`);
                                }
                            }
                        }
                    }

                    if (!minValueMet) {
                        console.log(`⚠️ Criterion ${i + 1}: Value ${criterionValue} < MinValue ${criterion.minValue} - SKIPPING (prorated combo allows partial fulfillment)`);
                        // For prorated combo conditions, skip criteria that don't meet minValue instead of rejecting
                        // This allows schemes to work when only some criteria are satisfied
                        continue;
                    } else {
                        console.log(`✅ Criterion ${i + 1}: MinValue requirement met`);
                    }
                }
                if (criterion.hasMaxValue) {
                    const maxValueDisplay = criterionAggregationBasis === AggregationBasis.QUANTITY
                        ? `${criterion.maxValue} ${targetUom || AggregationBasis.UNITS}`
                        : `₹${criterion.maxValue}`;
                    console.log(`Max Value Allowed: ${maxValueDisplay}`);
                    if (criterionValue > criterion.maxValue) {
                        console.log(`❌ Criterion ${i + 1}: Value ${criterionValue} > MaxValue ${criterion.maxValue} - REJECTING`);
                        return null; // This criterion exceeds maxValue
                    } else {
                        console.log(`✅ Criterion ${i + 1}: MaxValue requirement met`);
                    }
                }

                // For prorated combo conditions with matchType 'all':
                // - Quantity-based criteria: calculate applications as quantity/minValue
                // - Amount-based criteria: calculate applications as amount/minValue (for prorated discount percentage)
                if (criterion.hasMinValue && criterion.minValue > 0) {
                    const applications = Math.floor(criterionValue / criterion.minValue);
                    if (criterionAggregationBasis === AggregationBasis.QUANTITY) {
                        console.log(`Quantity-based criterion: Applications = floor(${criterionValue} / ${criterion.minValue}) = ${applications}`);
                    } else if (criterionAggregationBasis === AggregationBasis.AMOUNT) {
                        console.log(`Amount-based criterion: Applications = floor(₹${criterionValue} / ₹${criterion.minValue}) = ${applications}`);
                    }
                    if (applications > 0) {
                        quantityBasedApplications.push(applications);
                        console.log(`✅ Added ${applications} applications from ${criterionAggregationBasis}-based criterion`);
                    }
                }
            }

            // For combo conditions with matchType 'all' and isProRated:
            // Use the minimum applications from all criteria (quantity or amount-based)
            // Apply discount to total invoice value with multiplied percentage
            console.log(`\n=== FINAL CALCULATION ===`);
            console.log(`All applications (from quantity/amount-based criteria): [${quantityBasedApplications.join(', ')}]`);

            // For prorated combo conditions, require at least one criterion to have applications
            if (quantityBasedApplications.length === 0) {
                console.log(`❌ No criteria met minimum requirements - REJECTING`);
                return null;
            }

            if (quantityBasedApplications.length > 0) {
                const minApplications = Math.min(...quantityBasedApplications);
                console.log(`Minimum Applications: ${minApplications}`);
                console.log(`Reward Type: ${reward.type}, Reward Value: ${reward.value}%`);
                console.log(`Base Value (Total Invoice): ₹${totalInvoiceValue}`);
                console.log(`Effective Discount %: ${reward.value}% × ${minApplications} = ${reward.value * minApplications}%`);
                // Apply discount to total invoice value with percentage multiplied by applications
                const result = await this.calculateRewardAmount(reward, totalInvoiceValue, minApplications, `Prorated combo condition met with ${minApplications} applications`);
                console.log(`Final Discount Amount: ₹${result.amount}`);
                console.log(`Final Amount After Discount: ₹${totalInvoiceValue - result.amount}`);
                console.log('==========================================\n');
                return result;
            } else {
                // This should not happen if all criteria have minValue, but handle edge case
                console.log(`No applications calculated (edge case), applying normal discount`);
                console.log(`Reward Type: ${reward.type}, Reward Value: ${reward.value}%`);
                console.log(`Base Value (Total Invoice): ₹${totalInvoiceValue}`);
                const result = await this.calculateRewardAmount(reward, totalInvoiceValue, undefined, `Combo condition met with all criteria`);
                console.log(`Final Discount Amount: ₹${result.amount}`);
                console.log(`Final Amount After Discount: ₹${totalInvoiceValue - result.amount}`);
                console.log('==========================================\n');
                return result;
            }
        }

        // Process unified criteria (products, brands, categories, subcategories) for 'any' matchType or non-combo
        for (const criterion of unifiedCriteria) {
            const {
                productId,
                brandId,
                categoryId,
                subcategoryId,
                minValue: criterionMinValue,
                maxValue: criterionMaxValue,
                aggregationBasis: criterionAggregationBasis
            } = criterion;

            let groupProducts: IProductItem[] = [];

            // Determine which products match this criterion
            if (productId) {
                groupProducts = products.filter(p => p.productId === productId);
            } else if (brandId) {
                groupProducts = products.filter(p => p.brandId === brandId);
            } else if (categoryId) {
                groupProducts = products.filter(p => p.categoryId === categoryId);
            } else if (subcategoryId) {
                groupProducts = products.filter(p => p.subcategoryId === subcategoryId);
            }

            if (groupProducts.length === 0) continue;

            // Use individual aggregation basis or fall back to global
            const basis = criterionAggregationBasis || aggregationBasis;
            // Get target UOM from criterion if specified (for quantity-based aggregation)
            const targetUom = basis === AggregationBasis.QUANTITY ? criterion.uom : undefined;
            const groupValue = await this.calculateGroupValue(groupProducts, basis, targetUom);

            // Check minValue constraint
            if (groupValue < (criterionMinValue || minValue || 1)) continue;

            // Check maxValue constraint (for closed-ended/slab conditions)
            if (criterionMaxValue && groupValue > criterionMaxValue) continue;

            // Simplified prorated logic: calculate applications based on order value
            // Use a fixed multiplier of 100 (every ₹100 = 1 application) instead of proratedPer
            const fixedMultiplier = 100; // Every ₹100 spent = 1 application
            const applications = isAvailableForHalf
                ? (groupValue / fixedMultiplier)
                : Math.floor(groupValue / fixedMultiplier);

            totalApplications += Math.max(1, applications); // At least 1 application if condition is met
            totalGroupValue += groupValue;
        }

        const maxApps = maxApplications || Infinity;
        const finalApplications = Math.min(totalApplications, maxApps);

        if (finalApplications === 0) return null;

        // For percentage-based rewards, use total cart value if available (for assorted/invoice-like conditions)
        // Otherwise use the group value. For fixed rewards, use the number of applications
        let baseValue: number;
        if (reward.type === RewardType.DISCOUNT_PERCENT) {
            // For assorted conditions with discountPercent, apply discount to total cart value
            // This matches the behavior where "5% discount to the cart value" is expected
            baseValue = totalCartValue !== undefined ? totalCartValue : totalGroupValue;
        } else {
            baseValue = finalApplications;
        }

        // For prorated conditions with discountPercent, pass finalApplications as appliedQuantity
        // so the discount percentage is multiplied by the number of applications
        return this.calculateRewardAmount(reward, baseValue, finalApplications, `Prorated condition met with ${finalApplications} applications`);
    }

    private async evaluateAssortedCondition(criteria: any, products: IProductItem[], reward: any) {
        const {
            aggregationBasis,
            productIds = [],
            brandIds = [],
            categoryIds = [],
            subcategoryIds = [],
            minValue,
            maxValue,
            uom: topLevelUom,
            criteria: unifiedCriteria = []
        } = criteria;

        // If unified criteria array exists, use per-criterion aggregation logic
        if (unifiedCriteria && unifiedCriteria.length > 0) {
            this.logger.log(`[Assorted] Evaluating assorted condition with ${unifiedCriteria.length} criteria. Top-level UOM: ${topLevelUom || 'N/A'}, MinValue: ${minValue || 'N/A'}, MaxValue: ${maxValue || 'N/A'}`);
            let totalAggregatedValue = 0;

            for (let i = 0; i < unifiedCriteria.length; i++) {
                const criterion = unifiedCriteria[i];
                const {
                    productId,
                    brandId,
                    categoryId,
                    subcategoryId,
                    aggregationBasis: criterionAggregationBasis,
                    hasMinValue,
                    minValue: criterionMinValue,
                    hasMaxValue,
                    maxValue: criterionMaxValue
                } = criterion;

                this.logger.log(`[Assorted] Criterion ${i + 1}/${unifiedCriteria.length} (${criterion._id || 'unknown'}): productId=${productId || 'N/A'}, brandId=${brandId || 'N/A'}, categoryId=${categoryId || 'N/A'}, subcategoryId=${subcategoryId || 'N/A'}, criterionUom=${criterion.uom || 'N/A'}`);

                // Filter products matching this specific criterion
                const criterionProducts = products.filter(product => {
                    const matchesProductId = !productId || product.productId === productId;
                    const matchesBrandId = !brandId || (product.brandId && product.brandId === brandId);
                    const matchesCategoryId = !categoryId || (product.categoryId && product.categoryId === categoryId);
                    const matchesSubcategoryId = !subcategoryId || (product.subcategoryId && product.subcategoryId === subcategoryId);

                    return matchesProductId && matchesBrandId && matchesCategoryId && matchesSubcategoryId;
                });

                this.logger.log(`[Assorted] Criterion ${i + 1}: Found ${criterionProducts.length} matching products: ${criterionProducts.map(p => `${p.productId} (qty: ${p.quantity}, uom: ${p.uom || 'N/A'})`).join(', ')}`);

                // For assorted schemes: Allow scheme if EITHER one product OR both products are present
                // If a criterion has no matching products, skip it (don't add to total, but don't reject the scheme)
                if (criterionProducts.length === 0) {
                    this.logger.log(`[Assorted] Criterion ${i + 1} (${criterion._id || 'unknown'}) has no matching products - skipping this criterion`);
                    continue;
                }

                // Use individual criterion's aggregationBasis or fall back to top-level
                const effectiveBasis = criterionAggregationBasis || aggregationBasis || AggregationBasis.QUANTITY;
                // Prioritize top-level UOM if specified, otherwise use criterion UOM
                // This ensures that when top-level specifies "KG", we convert from base UOM (BAG) to KG using capacity
                const targetUom = effectiveBasis === AggregationBasis.QUANTITY
                    ? (topLevelUom || criterion.uom)
                    : undefined;

                this.logger.log(`[Assorted] Criterion ${i + 1}: Using aggregationBasis=${effectiveBasis}, targetUom=${targetUom || 'N/A'}`);
                const criterionValue = await this.calculateGroupValue(criterionProducts, effectiveBasis, targetUom);
                this.logger.log(`[Assorted] Criterion ${i + 1}: Calculated value = ${criterionValue} (${targetUom || effectiveBasis})`);

                // For assorted schemes: Sum values from all criteria that have matching products
                // The scheme applies if EITHER one product OR both products are present AND the TOTAL meets the top-level minValue
                // Individual criterion constraints (hasMinValue, hasMaxValue) are informational only

                // Log individual constraint checks for debugging (but don't skip)
                if (hasMinValue && criterionValue < criterionMinValue) {
                    this.logger.log(`[Assorted] Criterion ${i + 1}: Value ${criterionValue} < Individual MinValue ${criterionMinValue} (informational, still including in total)`);
                }
                if (hasMaxValue && criterionValue > criterionMaxValue) {
                    this.logger.log(`[Assorted] Criterion ${i + 1}: Value ${criterionValue} > Individual MaxValue ${criterionMaxValue} (informational, still including in total)`);
                }

                // Add criterion value to total (only for criteria that have matching products)
                totalAggregatedValue += criterionValue;
                this.logger.log(`[Assorted] Criterion ${i + 1}: Added to total. Running total = ${totalAggregatedValue}`);
            }

            this.logger.log(`[Assorted] Total aggregated value = ${totalAggregatedValue}, MinValue required = ${minValue || 'N/A'}, MaxValue allowed = ${maxValue || 'N/A'}`);

            // Ensure at least one criterion had matching products
            if (totalAggregatedValue === 0) {
                this.logger.log(`[Assorted] FAILED: No matching products found for any criterion`);
                return null;
            }

            // For assorted schemes: Check if the TOTAL (sum of present criteria) meets the top-level minValue
            // The scheme applies if EITHER one product OR both products are present AND their total >= minValue
            // This allows flexibility: if one product alone meets 10kg, apply; if both together meet 10kg, apply
            if (minValue !== undefined && totalAggregatedValue < minValue) {
                this.logger.log(`[Assorted] FAILED: Total value ${totalAggregatedValue} < MinValue ${minValue} (either one product or both products must meet the total minimum)`);
                return null;
            }
            if (maxValue !== undefined && totalAggregatedValue > maxValue) {
                this.logger.log(`[Assorted] FAILED: Total value ${totalAggregatedValue} > MaxValue ${maxValue}`);
                return null;
            }

            this.logger.log(`[Assorted] SUCCESS: Total value ${totalAggregatedValue} >= MinValue ${minValue} (scheme applies when either one or both products meet the total threshold)`);
            return this.calculateRewardAmount(reward, totalAggregatedValue, undefined, `Assorted condition met with value ${totalAggregatedValue}`);
        }

        // Legacy logic: Filter products based on top-level criteria arrays
        const filteredProducts = products.filter(product => {
            const matchesProductId = productIds.length === 0 || productIds.includes(product.productId);
            const matchesBrandId = brandIds.length === 0 || (product.brandId && brandIds.includes(product.brandId));
            const matchesCategoryId = categoryIds.length === 0 || (product.categoryId && categoryIds.includes(product.categoryId));
            const matchesSubcategoryId = subcategoryIds.length === 0 || (product.subcategoryId && subcategoryIds.includes(product.subcategoryId));

            return matchesProductId || matchesBrandId || matchesCategoryId || matchesSubcategoryId;
        });

        const effectiveBasis = aggregationBasis || AggregationBasis.QUANTITY;
        // For legacy assorted logic, no specific UOM conversion (top-level aggregation)
        const aggregatedValue = await this.calculateGroupValue(filteredProducts, effectiveBasis);

        if (minValue !== undefined && aggregatedValue < minValue) {
            return null;
        }
        if (maxValue !== undefined && aggregatedValue > maxValue) {
            return null;
        }

        return this.calculateRewardAmount(reward, aggregatedValue, undefined, `Assorted condition met with value ${aggregatedValue}`);
    }

    private evaluateInvoiceCondition(criteria: any, totalValue: number, totalQuantity: number, reward: any, isProRated?: boolean) {
        const { conditionBasis, minValue, maxValue } = criteria;

        const checkValue = conditionBasis === AggregationBasis.AMOUNT ? totalValue : totalQuantity;

        if (checkValue < minValue || (maxValue && checkValue > maxValue)) {
            return null;
        }

        // For prorated invoice conditions, calculate how many times the minimum threshold is met
        let appliedQuantity = 1; // Default for non-prorated conditions
        if (isProRated) {
            appliedQuantity = Math.floor(checkValue / minValue);
        }

        // For prorated invoice conditions with discountPercent, pass minValue to calculate proportional percentage
        return this.calculateRewardAmount(
            reward,
            checkValue,
            appliedQuantity,
            `Invoice condition met with ${conditionBasis} ${checkValue}`,
            isProRated ? minValue : undefined
        );
    }

    private async evaluateLineItemCondition(criteria: any, products: IProductItem[], reward: any, warehouseId?: string, totalValue?: number) {
        const { filterBy, minLineTotal, aggregationBasis, uom, criteria: unifiedCriteria = [] } = criteria;

        // Log entry for debugging
        this.logger.log(`[LineItem] Evaluating line item condition: minLineTotal=${minLineTotal}, uom=${uom || 'N/A'}, products count=${products.length}`);

        // Determine aggregation basis - default to 'quantity' for line item conditions
        // This makes more sense for schemes that require a minimum number of line items
        const effectiveAggregationBasis = aggregationBasis || AggregationBasis.QUANTITY;

        let lineTotal = 0;
        let applicableProducts = products;

        // Apply filters
        if (filterBy.category) {
            // Filter by category name (assuming category field contains category name)
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

        this.logger.log(`[LineItem] After filters: ${applicableProducts.length} applicable products`);

        // Check if products are mapped to pricing groups for this warehouse
        if (warehouseId) {
            const pricingGroupCheck = await this.checkPricingGroupMapping(applicableProducts, warehouseId);
            if (!pricingGroupCheck.isValid) {
                this.logger.log(`[LineItem] FAILED: Products not mapped to pricing group for warehouse ${warehouseId}. Unmapped products: ${pricingGroupCheck.unmappedProducts.join(', ')}`);
                return null;
            }
        }

        // Calculate lineTotal based on aggregation basis
        switch (effectiveAggregationBasis) {
            case AggregationBasis.QUANTITY:
                // If UOM is specified, convert quantities to target UOM using calculateGroupValue
                // Otherwise, count the number of line items (unique products) as before
                if (uom) {
                    // Use calculateGroupValue to convert quantities to target UOM
                    const targetUom = uom;
                    lineTotal = await this.calculateGroupValue(applicableProducts, AggregationBasis.QUANTITY, targetUom);
                    this.logger.log(`[LineItem] Quantity-based with UOM conversion: Total quantity = ${lineTotal} ${targetUom}`);
                } else {
                    // Count the number of line items (unique products) - legacy behavior
                    lineTotal = applicableProducts.length;
                    this.logger.log(`[LineItem] Quantity-based (no UOM): Total line items = ${lineTotal}`);
                }
                break;
            case AggregationBasis.AMOUNT:
                // Sum of monetary values
                lineTotal = applicableProducts.reduce((sum, p) => sum + ((p.unitPrice || 0) * p.quantity), 0);
                break;
            case AggregationBasis.WEIGHT:
                // Weight-based aggregation should also be UOM-aware:
                // treat incoming quantities as-per their UOM (often EACH) and convert
                // to a weight UOM (KG / G) using the shared calculateGroupValue logic.
                {
                    const targetWeightUom = uom || 'KG';
                    lineTotal = await this.calculateGroupValue(
                        applicableProducts,
                        AggregationBasis.WEIGHT,
                        targetWeightUom
                    );
                    this.logger.log(
                        `Line item condition: Total weight (UOM-aware) calculated: ${lineTotal}${targetWeightUom} for ${applicableProducts.length} product(s)`
                    );
                }
                break;
            default:
                // Default to quantity for line item conditions
                if (uom) {
                    const targetUom = uom;
                    lineTotal = await this.calculateGroupValue(applicableProducts, AggregationBasis.QUANTITY, targetUom);
                    this.logger.log(`[LineItem] Default quantity-based with UOM conversion: Total quantity = ${lineTotal} ${targetUom}`);
                } else {
                    lineTotal = applicableProducts.length;
                }
        }

        this.logger.log(`[LineItem] lineTotal=${lineTotal}, minLineTotal=${minLineTotal}, aggregationBasis=${effectiveAggregationBasis}`);

        if (lineTotal < minLineTotal) {
            this.logger.log(`[LineItem] FAILED: lineTotal ${lineTotal} < minLineTotal ${minLineTotal}`);
            return null;
        }

        // Check unified criteria for minimum quantity requirements
        if (unifiedCriteria && unifiedCriteria.length > 0) {
            const criteriaValidation = await this.validatorsService.validateUnifiedCriteria(unifiedCriteria, applicableProducts);

            if (!criteriaValidation.isValid) {
                this.logger.log(`[LineItem] FAILED: Unified criteria validation failed`);
                return null;
            }
        }

        // Additional validation: Check if there are enough different products (line items)
        // This is a business rule: if the scheme name suggests it requires multiple line items,
        // we should validate that there are at least 2 different products
        const uniqueProductIds = new Set(applicableProducts.map(p => p.productId));
        this.logger.log(`[LineItem] Unique products: ${uniqueProductIds.size}, products: [${Array.from(uniqueProductIds).join(', ')}]`);

        if (uniqueProductIds.size < 2) {
            this.logger.log(`[LineItem] FAILED: Only ${uniqueProductIds.size} unique products found, but scheme requires multiple line items`);
            return null;
        }

        this.logger.log(`[LineItem] SUCCESS: All conditions met. Calculating reward with baseValue=${totalValue || lineTotal}`);

        // For discountPercent rewards, use total cart value as base. For other reward types, use lineTotal
        const baseValue = reward.type === RewardType.DISCOUNT_PERCENT ? (totalValue || lineTotal) : lineTotal;
        return this.calculateRewardAmount(reward, baseValue, undefined, `Line item condition met with total ${lineTotal}`);
    }

    private evaluateFlexibleProductCondition(criteria: any, products: IProductItem[], reward: any) {
        const {
            productIds = [],
            brandIds = [],
            categoryIds = [],
            subcategoryIds = [],
            allowAnyProduct = false,
            minValue,
            maxValue,
            minQty,
            maxQty
        } = criteria;

        // Filter products based on criteria
        let filteredProducts = products;

        if (!allowAnyProduct) {
            filteredProducts = products.filter(product => {
                // Check if product matches any of the filter criteria
                const matchesProductId = productIds.length === 0 || productIds.includes(product.productId);
                const matchesBrandId = brandIds.length === 0 || (product.brandId && brandIds.includes(product.brandId));
                const matchesCategoryId = categoryIds.length === 0 || (product.categoryId && categoryIds.includes(product.categoryId));
                const matchesSubcategoryId = subcategoryIds.length === 0 || (product.subcategoryId && subcategoryIds.includes(product.subcategoryId));

                return matchesProductId || matchesBrandId || matchesCategoryId || matchesSubcategoryId;
            });
        }

        if (filteredProducts.length === 0) return null;

        // Calculate total value and quantity of filtered products
        const totalValue = filteredProducts.reduce((sum: number, product: IProductItem) => {
            return sum + ((product.unitPrice || 0) * product.quantity);
        }, 0);

        const totalQuantity = filteredProducts.reduce((sum: number, product: IProductItem) => sum + product.quantity, 0);

        // Check value constraints
        if (totalValue < minValue || (maxValue && totalValue > maxValue)) {
            return null;
        }

        // Check quantity constraints
        if (minQty && totalQuantity < minQty) {
            return null;
        }

        if (maxQty && totalQuantity > maxQty) {
            return null;
        }

        const filterDescription = allowAnyProduct ? ProductsEnum.ANY_PRODUCT :
            `products matching criteria (${filteredProducts.length} products)`;

        return this.calculateRewardAmount(reward, totalValue, undefined, `Flexible product condition met with ${filterDescription}, value: ${totalValue}`);
    }


    /* Scheme applicability checking functions */
    private async isSchemeApplicable(
        scheme: IScheme,
        products: IProductItem[],
        warehouseId: string,
        channelId: string,
        businessTypeId: string,
        outletId?: string
    ): Promise<boolean> {
        const applicableTo: IApplicableTo = scheme.applicableTo;

        // Check if applicableTo exists
        if (!applicableTo) {
            this.logger.error(`Scheme ${scheme.schemeId} is missing applicableTo property. Scheme object: ${JSON.stringify(scheme)}`);
            return false;
        }

        // Check if applicableTo has the expected structure
        if (typeof applicableTo !== 'object') {
            this.logger.error(`Scheme ${scheme.schemeId} has invalid applicableTo property type: ${typeof applicableTo}`);
            return false;
        }

        // Check context applicability (warehouse, channel, businessType, outlet) using OR logic
        // If ANY of these are specified, at least ONE must match
        const hasWarehouseIds = applicableTo.warehouseIds && applicableTo.warehouseIds.length > 0;
        const hasChannelIds = applicableTo.channelIds && applicableTo.channelIds.length > 0;
        const hasBusinessTypeIds = applicableTo.businessTypeIds && applicableTo.businessTypeIds.length > 0;
        const hasOutletIds = applicableTo.outletIds && applicableTo.outletIds.length > 0;

        // If any context filters are specified, check if at least one matches
        if (hasWarehouseIds || hasChannelIds || hasBusinessTypeIds || hasOutletIds) {
            const warehouseMatches = hasWarehouseIds && applicableTo?.warehouseIds?.includes(warehouseId);
            const channelMatches = hasChannelIds && applicableTo?.channelIds?.includes(channelId);
            const businessTypeMatches = hasBusinessTypeIds && applicableTo?.businessTypeIds?.includes(businessTypeId);
            const outletMatches = hasOutletIds && outletId && applicableTo?.outletIds?.includes(outletId);

            // At least one context filter must match
            if (!warehouseMatches && !channelMatches && !businessTypeMatches && !outletMatches) {
                return false;
            }
        }
        // If none are specified, it's a global scheme and applies everywhere

        // Check product applicability (must match if specified)
        if (applicableTo.productIds && applicableTo.productIds.length > 0) {
            const productIds = products.map(p => p.productId);
            const hasApplicableProduct = applicableTo.productIds.some(id => productIds.includes(id));
            if (!hasApplicableProduct) {
                return false;
            }
        }

        // Check brand applicability (must match if specified)
        if (applicableTo.brandIds && applicableTo.brandIds.length > 0) {
            const brandIds = products.map(p => p.brandId).filter(Boolean);
            const hasApplicableBrand = brandIds.some(id => applicableTo?.brandIds?.includes(id as string));
            if (!hasApplicableBrand) {
                return false;
            }
        }

        // Check category applicability (must match if specified)
        if (applicableTo.categoryIds && applicableTo.categoryIds.length > 0) {
            const categoryIds = products.map(p => p.categoryId).filter(Boolean);
            const hasApplicableCategory = categoryIds.some(id => applicableTo?.categoryIds?.includes(id as string));
            if (!hasApplicableCategory) {
                return false;
            }
        }

        // Check subcategory applicability (must match if specified)
        if (applicableTo.subcategoryIds && applicableTo.subcategoryIds.length > 0) {
            const subcategoryIds = products.map(p => p.subcategoryId).filter(Boolean);
            const hasApplicableSubcategory = subcategoryIds.some(id => applicableTo?.subcategoryIds?.includes(id as string));
            if (!hasApplicableSubcategory) {
                return false;
            }
        }

        return true;
    }

    private async findBestSchemeInGroup(
        schemesInGroup: IScheme[],
        products: IProductItem[],
        warehouseId: string,
        channelId: string,
        businessTypeId: string,
        outletId: string | undefined,
        totalValue: number,
        totalQuantity: number
    ): Promise<IScheme | null> {
        if (schemesInGroup.length === 0) return null;
        if (schemesInGroup.length === 1) return schemesInGroup[0];

        // Sort schemes by priority (lower number = higher priority)
        const sortedSchemes = schemesInGroup.sort((a, b) => {
            const aPriority = Math.min(...a.conditions.map(c => c.priority));
            const bPriority = Math.min(...b.conditions.map(c => c.priority));
            return aPriority - bPriority;
        });

        // Find the first scheme that can be applied
        for (const scheme of sortedSchemes) {
            if (
                await this.isSchemeApplicable(
                    scheme,
                    products,
                    warehouseId,
                    channelId,
                    businessTypeId,
                    outletId
                )
            ) {
                // Check if scheme conditions are met
                const schemeRewards = await this.processSchemeConditions(
                    scheme,
                    products,
                    warehouseId,
                    channelId,
                    businessTypeId,
                    outletId
                );

                if (schemeRewards.length > 0) {
                    return scheme;
                }
            }
        }

        return null;
    }

    private async processSchemeConditions(
        scheme: IScheme,
        products: IProductItem[],
        warehouseId: string,
        channelId: string,
        businessTypeId: string,
        outletId?: string,
        usedProducts?: Map<string, number>,
        remainingValue?: number,
        remainingQuantity?: number
    ): Promise<ICalculatedReward[]> {
        const rewards: ICalculatedReward[] = [];

        this.logger.log(`[ProcessScheme] Evaluating scheme: ${scheme.schemeId} (${scheme.schemeName})`);

        // Check if scheme is applicable to the current context
        if (
            !await this.isSchemeApplicable(
                scheme,
                products,
                warehouseId,
                channelId,
                businessTypeId,
                outletId
            )
        ) {
            this.logger.log(`[ProcessScheme] Scheme ${scheme.schemeId} is not applicable to current context`);
            return rewards;
        }

        // Use provided remaining values or calculate from products
        const totalValue = remainingValue !== undefined ? remainingValue : products.reduce((sum: number, product: IProductItem) => { return sum + ((product.unitPrice || 0) * product.quantity) }, 0);
        const totalQuantity = remainingQuantity !== undefined ? remainingQuantity : products.reduce((sum: number, product: IProductItem) => sum + product.quantity, 0);

        // Process each condition in priority order
        for (const condition of scheme.conditions) {
            const reward = await this.evaluateCondition(condition, products, totalValue, totalQuantity, warehouseId);

            if (reward) {
                // Track which products/quantities are being used by this scheme
                this.trackersService.trackUsedProducts(condition, products, reward, usedProducts);

                // Calculate free products with proper quantity for prorated rewards
                let freeProducts = condition.reward.products || [];
                if (condition.reward.type === RewardType.FREE_PRODUCT && condition.isProRated) {
                    // For prorated free products, multiply quantity by applications
                    freeProducts = freeProducts.map(product => ({
                        ...product,
                        quantity: product.quantity * reward.appliedQuantity
                    }));
                }

                // Calculate discounted products with proper quantity for prorated rewards
                let discountedProducts = condition.reward.discountedProducts || [];
                let productDiscountAmount = 0;

                if (condition.reward.type === RewardType.PRODUCT_DISCOUNT && discountedProducts.length > 0) {
                    const multiplier = condition.isProRated ? reward.appliedQuantity : 1;

                    // Process discounted products asynchronously to fetch prices if needed
                    const processedProducts = await Promise.all(discountedProducts.map(async (discountedProduct) => {
                        // Find the product in the cart to get its price (for price lookup only)
                        const productInCart = products.find(p => p.productId === discountedProduct.productId);
                        let productPrice = productInCart?.unitPrice || 0;

                        // Always use the quantity from discountedProduct configuration (or default to 1)
                        // This ensures consistent behavior whether the product is in cart or not
                        const discountQuantity = discountedProduct.quantity || 1;

                        // In offline mode, use price from product item or default to 0
                        // Mobile app should provide unitPrice in IProductItem for all products
                        if (!productInCart || !productPrice || productPrice === 0) {
                            // Product not in cart or no price - use 0 (offline mode)
                            // Mobile app should ensure all products have unitPrice
                            this.logger.warn(`Product ${discountedProduct.productId} not found in products or has no price, using default price 0`);
                            productPrice = 0;
                        }

                        // Calculate total product value using the discount quantity (not cart quantity)
                        // This ensures consistent behavior: discount is always applied to the configured quantity
                        const totalProductValue = productPrice * discountQuantity;

                        let discount = 0;
                        let finalQuantity = discountQuantity;
                        let effectiveDiscountValue = discountedProduct.value;

                        if (condition.isProRated) {
                            // For prorated product discounts, check if this is an invoice condition
                            // For invoice conditions: discount percentage/fixed is multiplied by prorated multiplier (appliedQuantity)
                            // For other conditions (combo, etc.): discount percentage is multiplied by appliedQuantity
                            if (discountedProduct.type === RewardType.DISCOUNT_PERCENT) {
                                if (condition.conditionType === ConditionType.INVOICE) {
                                    // For prorated invoice conditions with product discounts:
                                    // 1. Multiply discount percentage by prorated multiplier (appliedQuantity)
                                    // 2. Always use the configured discount quantity (not cart quantity)
                                    // Example: base discount 5%, multiplier 2 (prorated) → effective discount 10%
                                    // Discount quantity 1, price ₹40 → apply 10% discount = ₹4 discount amount
                                    effectiveDiscountValue = discountedProduct.value * multiplier;
                                    // Always use the configured discount quantity
                                    const quantityToDiscount = discountQuantity;
                                    // Apply effective discount percentage to total product value
                                    const totalProductValueForDiscount = productPrice * quantityToDiscount;
                                    discount = (totalProductValueForDiscount * effectiveDiscountValue / 100);
                                    finalQuantity = quantityToDiscount;
                                    this.logger.log(`[ProductDiscount Invoice Prorated] Product: ${discountedProduct.productId}, Price: ₹${productPrice}, Base Discount: ${discountedProduct.value}%, Prorated Multiplier: ${multiplier}, Discount Quantity: ${quantityToDiscount}, Effective Discount: ${effectiveDiscountValue}%, Total Value: ₹${totalProductValueForDiscount}, Discount Amount: ₹${discount}`);
                                } else {
                                    // For other prorated conditions (combo, etc.): multiply discount percentage
                                    effectiveDiscountValue = discountedProduct.value * multiplier;
                                    discount = (totalProductValue * effectiveDiscountValue / 100);
                                    finalQuantity = discountQuantity;
                                    this.logger.log(`[ProductDiscount Other Prorated] Product: ${discountedProduct.productId}, Base Discount: ${discountedProduct.value}%, Multiplier: ${multiplier}, Effective Discount: ${effectiveDiscountValue}%, Discount: ₹${discount}`);
                                }
                            } else if (discountedProduct.type === RewardType.DISCOUNT_FIXED) {
                                if (condition.conditionType === ConditionType.INVOICE) {
                                    // For prorated invoice conditions with fixed discount:
                                    // 1. Multiply fixed discount by prorated multiplier (appliedQuantity)
                                    // 2. Always use the configured discount quantity (not cart quantity)
                                    // Example: base discount ₹10, multiplier 3 (prorated) → effective discount ₹30 per unit
                                    // Discount quantity 1 → total discount ₹30 × 1 = ₹30
                                    effectiveDiscountValue = discountedProduct.value * multiplier;
                                    // Always use the configured discount quantity
                                    const quantityToDiscount = discountQuantity;
                                    discount = effectiveDiscountValue * quantityToDiscount;
                                    finalQuantity = quantityToDiscount;
                                    this.logger.log(`[ProductDiscount Fixed Invoice Prorated] Product: ${discountedProduct.productId}, Base Discount: ₹${discountedProduct.value}, Prorated Multiplier: ${multiplier}, Effective Discount Per Unit: ₹${effectiveDiscountValue}, Discount Quantity: ${quantityToDiscount}, Total Discount: ₹${discount}`);
                                } else {
                                    // For other prorated conditions: multiply the discount value by multiplier first, then apply to quantity
                                    // Example: base discount ₹10, multiplier 3 → effective discount ₹30 per unit
                                    // Then apply to quantity: ₹30 × discountQuantity = total discount
                                    effectiveDiscountValue = discountedProduct.value * multiplier;
                                    // Always use the configured discount quantity
                                    const quantityToDiscount = discountQuantity;
                                    // Calculate discount: effective discount per unit × quantity
                                    discount = effectiveDiscountValue * quantityToDiscount;
                                    finalQuantity = quantityToDiscount;
                                    this.logger.log(`[ProductDiscount Fixed Other Prorated] base value: ₹${discountedProduct.value}, multiplier: ${multiplier}, effective value: ₹${effectiveDiscountValue}, quantity: ${quantityToDiscount}, total discount: ₹${discount}`);
                                }
                            }
                        } else {
                            // Non-prorated: apply discount to total product value
                            if (discountedProduct.type === RewardType.DISCOUNT_PERCENT) {
                                // Apply discount percentage to total product value (based on discount quantity)
                                // Example: 10% discount on total value (price * discountQuantity) = (40 * 1) * 10% = 4
                                discount = (totalProductValue * discountedProduct.value / 100);
                            } else if (discountedProduct.type === RewardType.DISCOUNT_FIXED) {
                                // For fixed discount, apply to the configured discount quantity
                                // Always use the configured discount quantity
                                discount = discountedProduct.value * discountQuantity;
                            }
                        }

                        // Apply max discount amount limit if specified
                        if (discountedProduct.maxDiscountAmount && discount > discountedProduct.maxDiscountAmount) {
                            discount = discountedProduct.maxDiscountAmount;
                        }

                        const finalPrice = totalProductValue - discount;

                        this.logger.log(`[ProductDiscount] Product: ${discountedProduct.productId}, Price: ₹${productPrice}, Discount Quantity: ${discountQuantity}, TotalValue: ₹${totalProductValue}, Type: ${discountedProduct.type}, Value: ${discountedProduct.value}, EffectiveValue: ${effectiveDiscountValue}, Discount: ₹${discount}, FinalPrice: ₹${finalPrice}`);

                        return {
                            product: {
                                ...discountedProduct,
                                quantity: finalQuantity,
                                value: effectiveDiscountValue, // Update the value to show the effective discount percentage
                                unitPrice: productPrice, // Include unit price
                                totalPrice: totalProductValue, // Include total price before discount
                                discountAmount: discount, // Include discount amount for this product
                                finalPrice: finalPrice // Include final price after discount
                            },
                            discount: discount
                        };
                    }));

                    // Calculate total discount from all processed products
                    productDiscountAmount = processedProducts.reduce((sum, item) => sum + item.discount, 0);
                    discountedProducts = processedProducts.map(item => item.product);

                    // Update reward amount and discount with product discount
                    reward.amount = productDiscountAmount;
                    reward.discount = productDiscountAmount;

                    this.logger.log(`[ProductDiscount Total] Total discount calculated: ₹${productDiscountAmount}`);
                }

                // Calculate discount percentage based on reward type
                let discountPercentage: number | undefined;
                if (condition.reward.type === RewardType.DISCOUNT_PERCENT) {
                    // For percentage discounts, calculate effective percentage
                    if (condition.isProRated && reward.appliedQuantity > 1) {
                        // Prorated: multiply base percentage by appliedQuantity
                        discountPercentage = (condition.reward.value || 0) * reward.appliedQuantity;
                    } else {
                        // Non-prorated: use base percentage
                        discountPercentage = condition.reward.value || 0;
                    }
                    // Round to 2 decimal places
                    discountPercentage = Math.round(discountPercentage * 100) / 100;
                } else if (condition.reward.type === RewardType.DISCOUNT_FIXED) {
                    // For fixed discounts, calculate percentage as (discountAmount / baseValue) * 100
                    if (totalValue > 0) {
                        discountPercentage = (reward.amount / totalValue) * 100;
                        // Round to 2 decimal places
                        discountPercentage = Math.round(discountPercentage * 100) / 100;
                    }
                }
                // For other reward types (FREE_PRODUCT, CASHBACK, etc.), discountPercentage remains undefined

                rewards.push({
                    schemeId: scheme.schemeId,
                    schemeName: scheme.schemeName,
                    conditionType: condition.conditionType,
                    priority: condition.priority,
                    rewardType: condition.reward.type,
                    rewardValue: condition.reward.value || 0,
                    rewardAmount: reward.amount,
                    freeProducts: freeProducts,
                    discountedProducts: discountedProducts.length > 0 ? discountedProducts : undefined,
                    appliedQuantity: reward.appliedQuantity,
                    totalDiscount: reward.discount,
                    description: reward.description,
                    discountPercentage: discountPercentage,
                    isCapped: reward.isCapped || false,
                    maxRewardAmount: reward.maxRewardAmount,
                    calculatedDiscountAmount: reward.calculatedDiscountAmount
                });
            }
        }

        return rewards;
    }

    private async checkMutualExclusion(scheme: IScheme, appliedSchemeIds: Set<string>): Promise<{ isBlocked: boolean; blockingSchemes?: string[] }> {
        if (scheme.mutualExclusionGroup) {
            const blockingSchemes: string[] = [];
            appliedSchemeIds.forEach(appliedSchemeId => {
                if (appliedSchemeId !== scheme.schemeId) {
                    blockingSchemes.push(appliedSchemeId);
                }
            });

            if (blockingSchemes.length > 0) {
                return {
                    isBlocked: true,
                    blockingSchemes
                };
            }
        }

        return { isBlocked: false };
    }

    private async evaluateScheme(
        scheme: IScheme,
        products: IProductItem[],
        warehouseId: string,
        channelId: string,
        businessTypeId: string,
        outletId: string | undefined,
        totalValue: number,
        totalQuantity: number,
        appliedSchemeIds: Set<string>
    ): Promise<{
        status: SchemeAppliedStatus.APPLIED | SchemeAppliedStatus.BLOCKED | SchemeAppliedStatus.NOT_APPLICABLE;
        rewards?: ICalculatedReward[];
        reason?: string;
        blockingSchemes?: string[];
    }> {
        // Check if scheme is applicable to the current context
        if (!await this.isSchemeApplicable(scheme, products, warehouseId, channelId, businessTypeId, outletId)) {
            return {
                status: SchemeAppliedStatus.NOT_APPLICABLE,
                reason: 'Scheme not applicable to current context (warehouse, outlet, or products)'
            };
        }

        // Check for mutually exclusive rules
        const mutualExclusionCheck = await this.checkMutualExclusion(scheme, appliedSchemeIds);
        if (mutualExclusionCheck.isBlocked) {
            return {
                status: SchemeAppliedStatus.BLOCKED,
                reason: 'Blocked by mutually exclusive rules',
                blockingSchemes: mutualExclusionCheck.blockingSchemes
            };
        }

        // Process scheme conditions
        const schemeRewards = await this.processSchemeConditions(
            scheme,
            products,
            warehouseId,
            channelId,
            businessTypeId,
            outletId,
            new Map<string, number>(),
            totalValue,
            totalQuantity
        );

        if (schemeRewards && schemeRewards.length > 0) {
            return {
                status: SchemeAppliedStatus.APPLIED,
                rewards: schemeRewards
            };
        } else {
            return {
                status: SchemeAppliedStatus.NOT_APPLICABLE,
                reason: 'Scheme conditions not met'
            };
        }
    }

    async evaluateAllAvailableSchemes(
        allSchemes: IScheme[],
        products: IProductItem[],
        warehouseId: string,
        channelId: string,
        businessTypeId: string,
        outletId: string | undefined,
        totalValue: number,
        totalQuantity: number,
        appliedSchemeIds: Set<string>,
        excludeSchemes?: string[]
    ): Promise<ISchemeApplicability[]> {
        const availableSchemes: ISchemeApplicability[] = [];

        for (const scheme of allSchemes) {
            // Check if this scheme is explicitly excluded
            if (excludeSchemes && excludeSchemes.includes(scheme.schemeId)) {
                availableSchemes.push({
                    schemeId: scheme.schemeId,
                    schemeName: scheme.schemeName,
                    reason: 'Scheme explicitly excluded from calculation',
                    status: SchemeAppliedStatus.EXCLUDED
                });
                continue;
            }

            // Check if scheme is applicable to the current context
            if (
                !await this.isSchemeApplicable(
                    scheme,
                    products,
                    warehouseId,
                    channelId,
                    businessTypeId,
                    outletId
                )
            ) {
                availableSchemes.push({
                    schemeId: scheme.schemeId,
                    schemeName: scheme.schemeName,
                    reason: 'Scheme not applicable to current context (warehouse, outlet, or products)',
                    status: SchemeAppliedStatus.NOT_APPLICABLE
                });
                continue;
            }

            // Check if scheme is already applied
            if (appliedSchemeIds.has(scheme.schemeId)) {
                availableSchemes.push({
                    schemeId: scheme.schemeId,
                    schemeName: scheme.schemeName,
                    status: SchemeAppliedStatus.APPLIED
                });
                continue;
            }

            // Check for mutual exclusion
            const mutualExclusionCheck = await this.checkMutualExclusion(scheme, appliedSchemeIds);
            if (mutualExclusionCheck?.isBlocked) {
                availableSchemes.push({
                    schemeId: scheme.schemeId,
                    schemeName: scheme.schemeName,
                    reason: 'Blocked by mutually exclusive rules',
                    blockingSchemes: mutualExclusionCheck.blockingSchemes,
                    status: SchemeAppliedStatus.BLOCKED
                });
                continue;
            }

            // Check if scheme conditions are met
            const schemeRewards = await this.processSchemeConditions(
                scheme,
                products,
                warehouseId,
                channelId,
                businessTypeId,
                outletId
            );

            if (schemeRewards.length > 0) {
                // This scheme's conditions are met but it's not applied
                // Mark as BLOCKED (eligible but not chosen due to priority/mutual exclusion)
                this.logger.log(`Scheme ${scheme.schemeId} (${scheme.schemeName}) is eligible but not applied - marking as BLOCKED`);
                availableSchemes.push({
                    schemeId: scheme.schemeId,
                    schemeName: scheme.schemeName,
                    reason: 'Eligible but not applied due to priority rules',
                    status: SchemeAppliedStatus.BLOCKED // Available but not applied due to priority/mutual exclusion
                });
            } else {
                availableSchemes.push({
                    schemeId: scheme.schemeId,
                    schemeName: scheme.schemeName,
                    reason: 'Scheme conditions not met',
                    status: SchemeAppliedStatus.NOT_APPLICABLE
                });
            }
        }

        return availableSchemes;
    }

    async evaluateSchemes(
        candidateSchemes: IScheme[],
        products: IProductItem[],
        warehouseId: string,
        channelId: string,
        businessTypeId: string,
        outletId: string | undefined,
        totalValue: number,
        totalQuantity: number,
        includeSchemes?: string[]
    ): Promise<{
        appliedSchemes: ICalculatedReward[];
        applied: ISchemeApplicability[];
        notApplied: ISchemeApplicability[];
        notAppliedButCanApplyIfUnblocked: ISchemeApplicability[];
        appliedSchemeIds: Set<string>;
    }> {
        const appliedSchemes: ICalculatedReward[] = [];
        const applied: ISchemeApplicability[] = [];
        const notApplied: ISchemeApplicability[] = [];
        const notAppliedButCanApplyIfUnblocked: ISchemeApplicability[] = [];

        // Track used products and quantities to prevent double-counting
        let remainingValue = totalValue;
        let remainingQuantity = totalQuantity;

        // Track mutually exclusive schemes
        const appliedSchemeIds = new Set<string>();

        // If includeSchemes is provided, apply ALL eligible schemes from that list
        if (includeSchemes && includeSchemes.length > 0) {
            this.logger.log(`[evaluateSchemes] includeSchemes provided: ${includeSchemes.join(', ')} - applying ALL eligible schemes`);

            // Filter candidate schemes to only those in includeSchemes
            const includedCandidateSchemes = candidateSchemes.filter(scheme =>
                includeSchemes.includes(scheme.schemeId)
            );

            this.logger.log(`[evaluateSchemes] Found ${includedCandidateSchemes.length} candidate schemes in includeSchemes`);

            // Evaluate each included scheme and apply if eligible
            // When includeSchemes is provided, skip mutual exclusion checks to allow all eligible schemes
            for (const scheme of includedCandidateSchemes) {
                // Check if scheme is applicable to the current context
                if (!await this.isSchemeApplicable(scheme, products, warehouseId, channelId, businessTypeId, outletId)) {
                    notApplied.push({
                        schemeId: scheme.schemeId,
                        schemeName: scheme.schemeName,
                        reason: 'Scheme not applicable to current context (warehouse, outlet, or products)'
                    });
                    this.logger.log(`[evaluateSchemes] Included scheme ${scheme.schemeId} not applicable to context`);
                    continue;
                }

                // Process scheme conditions (skip mutual exclusion when includeSchemes is provided)
                const schemeRewards = await this.processSchemeConditions(
                    scheme,
                    products,
                    warehouseId,
                    channelId,
                    businessTypeId,
                    outletId,
                    new Map<string, number>(),
                    totalValue,
                    totalQuantity
                );

                if (schemeRewards && schemeRewards.length > 0) {
                    // Apply this scheme
                    appliedSchemes.push(...schemeRewards);
                    applied.push({
                        schemeId: scheme.schemeId,
                        schemeName: scheme.schemeName
                    });
                    appliedSchemeIds.add(scheme.schemeId);
                    this.logger.log(`[evaluateSchemes] Applied included scheme: ${scheme.schemeId} (${scheme.schemeName})`);
                } else {
                    // Scheme is in includeSchemes but conditions not met
                    notApplied.push({
                        schemeId: scheme.schemeId,
                        schemeName: scheme.schemeName,
                        reason: 'Scheme conditions not met'
                    });
                    this.logger.log(`[evaluateSchemes] Included scheme ${scheme.schemeId} conditions not met`);
                }
            }

            return {
                appliedSchemes,
                applied,
                notApplied,
                notAppliedButCanApplyIfUnblocked,
                appliedSchemeIds
            };
        }

        // Original logic: Group schemes by mutual exclusion groups for better handling
        const schemesByGroup = new Map<string, IScheme[]>();
        const schemesWithoutGroup: IScheme[] = [];

        candidateSchemes.forEach(scheme => {
            // Check if scheme has explicit mutual exclusion group
            if (scheme.mutualExclusionGroup) {
                if (!schemesByGroup.has(scheme.mutualExclusionGroup)) {
                    schemesByGroup.set(scheme.mutualExclusionGroup, []);
                }
                schemesByGroup.get(scheme.mutualExclusionGroup)!.push(scheme);
            } else {
                // Check if this is an invoice scheme - invoice schemes are mutually exclusive by default
                const hasInvoiceCondition = scheme.conditions.some(condition => condition.conditionType === 'invoice');
                if (hasInvoiceCondition) {
                    const invoiceGroupKey = 'invoice_schemes';
                    if (!schemesByGroup.has(invoiceGroupKey)) {
                        schemesByGroup.set(invoiceGroupKey, []);
                    }
                    schemesByGroup.get(invoiceGroupKey)!.push(scheme);
                } else {
                    schemesWithoutGroup.push(scheme);
                }
            }
        });

        // Evaluate all candidate schemes and find the best one to apply
        // Only ONE scheme should be applied, not all applicable schemes
        const allCandidateSchemes: IScheme[] = [...schemesWithoutGroup];
        for (const [groupName, schemesInGroup] of schemesByGroup) {
            // For schemes in groups, find the best one in each group first
            const bestInGroup = await this.findBestSchemeInGroup(
                schemesInGroup,
                products,
                warehouseId,
                channelId,
                businessTypeId,
                outletId,
                remainingValue,
                remainingQuantity
            );
            if (bestInGroup) {
                allCandidateSchemes.push(bestInGroup);
            }
        }

        // Evaluate all candidate schemes to find which ones can be applied
        const applicableSchemes: Array<{
            scheme: IScheme;
            evaluation: { status: SchemeAppliedStatus; rewards?: ICalculatedReward[]; reason?: string };
            priority: number;
            totalReward: number;
        }> = [];

        for (const scheme of allCandidateSchemes) {
            const evaluation = await this.evaluateScheme(
                scheme,
                products,
                warehouseId,
                channelId,
                businessTypeId,
                outletId,
                totalValue,
                totalQuantity,
                appliedSchemeIds
            );

            if (evaluation.status === SchemeAppliedStatus.APPLIED && evaluation.rewards) {
                const priority = Math.min(...scheme.conditions.map(c => c.priority));
                const totalReward = evaluation.rewards.reduce((sum, reward) => sum + (reward.rewardAmount || 0), 0);
                applicableSchemes.push({
                    scheme,
                    evaluation,
                    priority,
                    totalReward
                });
            } else {
                notApplied.push({
                    schemeId: scheme.schemeId,
                    schemeName: scheme.schemeName,
                    reason: evaluation.reason
                });
            }
        }

        // Select only the best scheme (highest priority first, then highest reward)
        if (applicableSchemes.length > 0) {
            // Sort by priority (lower number = higher priority), then by total reward (higher is better)
            applicableSchemes.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return a.priority - b.priority; // Lower priority number = higher priority
                }
                return b.totalReward - a.totalReward; // Higher reward is better
            });

            const bestScheme = applicableSchemes[0];
            if (bestScheme.evaluation.rewards) {
                appliedSchemes.push(...bestScheme.evaluation.rewards);
            }
            applied.push({
                schemeId: bestScheme.scheme.schemeId,
                schemeName: bestScheme.scheme.schemeName
            });
            appliedSchemeIds.add(bestScheme.scheme.schemeId);

            // Mark all other applicable schemes as not applied (blocked by the selected scheme)
            for (let i = 1; i < applicableSchemes.length; i++) {
                notAppliedButCanApplyIfUnblocked.push({
                    schemeId: applicableSchemes[i].scheme.schemeId,
                    schemeName: applicableSchemes[i].scheme.schemeName,
                    reason: `Blocked by higher priority scheme: ${bestScheme.scheme.schemeName}`,
                    blockingSchemes: [bestScheme.scheme.schemeId]
                });
            }
        }

        return {
            appliedSchemes,
            applied,
            notApplied,
            notAppliedButCanApplyIfUnblocked,
            appliedSchemeIds
        };
    }
}