# How It Works: @naga/reward-calculator

## Overview

This document explains how the reward calculation engine works internally, step-by-step. It covers the calculation flow, callback mechanisms, and key design decisions.

## Calculation Flow

### Step 1: Input Validation

The `calculateReward` function first validates the input parameters:

```typescript
- Products array must not be empty
- warehouseId is required
- fetchCandidateSchemes and fetchAllAvailableSchemes callbacks are required
```

### Step 2: Build Candidate Set

The function calls `buildCandidateSet` which:

1. **Calls `fetchCandidateSchemes` callback** with parameters:
   - `warehouseId`, `channelId`, `businessTypeId`
   - `includeSchemes` (if provided)
   - `excludeSchemes` (if provided)
   - `now` (current timestamp)

2. **Service layer** (your implementation):
   - Builds MongoDB query based on parameters
   - Fetches schemes from database
   - Normalizes MongoDB documents to `IScheme` format
   - Returns array of schemes

3. **Package** receives normalized schemes and filters them

### Step 3: Calculate Initial Totals

The package calculates:
- `totalValue`: Sum of (product.unitPrice × product.quantity) for all products
- `totalQuantity`: Sum of product.quantity for all products

### Step 4: Initialize EvaluatorsService

Creates an instance of `EvaluatorsService` with:
- Logger (if provided)
- ProductDataProvider (if provided)
- ValidatorsService and TrackersService (internal)

### Step 5: Evaluate Schemes

Calls `evaluatorsService.evaluateSchemes()` which:

1. **For each candidate scheme:**
   - Checks if scheme is applicable (warehouse, channel, businessType, outlet, products)
   - If applicable, evaluates scheme conditions:
     - **Invoice Condition**: Checks if total value/quantity meets threshold
     - **Line Item Condition**: Checks if specific products meet criteria
     - **Combo Condition**: Checks if multiple products match criteria
     - **Assorted Condition**: Checks if aggregated value/quantity meets threshold
     - **Flexible Product Condition**: Checks if any products match criteria
   - Calculates rewards if conditions are met
   - Applies priority rules (lower number = higher priority)
   - Handles mutual exclusion groups

2. **Returns evaluation result:**
   - `appliedSchemes`: Schemes that were successfully applied
   - `applied`: List of applied scheme IDs
   - `notApplied`: Schemes that didn't meet conditions
   - `notAppliedButCanApplyIfUnblocked`: Schemes blocked by priority/mutual exclusion

### Step 6: Fetch All Available Schemes

Calls `getAllAvailableSchemes` which:

1. **Calls `fetchAllAvailableSchemes` callback** with parameters:
   - `warehouseId`, `channelId`, `businessTypeId`, `outletId`
   - `now` (current timestamp)

2. **Service layer** fetches all schemes applicable to the warehouse

3. **Package** filters schemes by warehouse applicability

### Step 7: Evaluate All Available Schemes

Calls `evaluatorsService.evaluateAllAvailableSchemes()` which:

1. **For each available scheme:**
   - Checks if explicitly excluded → Status: EXCLUDED
   - Checks if applicable → Status: NOT_APPLICABLE if not
   - Checks if already applied → Status: APPLIED
   - Checks mutual exclusion → Status: BLOCKED if blocked
   - Evaluates conditions → Status: BLOCKED if eligible but not applied, NOT_APPLICABLE if conditions not met

2. **Returns** array of `ISchemeApplicability` with status for each scheme

### Step 8: Filter Available Schemes

Filters `availableSchemes` to show only:
- EXCLUDED schemes (explicitly excluded)
- BLOCKED schemes (eligible but blocked)

Excludes:
- APPLIED schemes (already in appliedSchemes)
- Schemes in includeSchemes
- NOT_APPLICABLE schemes

### Step 9: Calculate Final Response

Builds the response object:
- `totalDiscount`: Sum of all applied discounts
- `totalRewardAmount`: Sum of all reward amounts
- `appliedSchemes`: Array of calculated rewards
- `availableSchemes`: Filtered available schemes
- `summary`: Aggregated summary with totals

### Step 10: Performance Monitoring

If `performanceMonitor` callback provided:
- Calculates total duration
- Collects callback durations
- Collects scheme counts
- Calls `performanceMonitor(metrics)` with collected metrics

## Callback Mechanism

### How Callbacks Work

The package uses a **higher-order function** pattern:

1. **Package defines callback interface:**
   ```typescript
   fetchCandidateSchemes: (params: FetchCandidateSchemesParams) => Promise<IScheme[]>
   ```

2. **Service layer implements callback:**
   ```typescript
   const fetchCandidateSchemes = async (params) => {
     // Build query from params
     const query = { /* ... */ };
     // Fetch from database
     const schemes = await db.schemes.find(query);
     // Normalize and return
     return normalizeSchemes(schemes);
   };
   ```

3. **Package calls callback:**
   ```typescript
   const schemes = await fetchCandidateSchemes({
     warehouseId,
     channelId,
     businessTypeId,
     includeSchemes,
     excludeSchemes,
     now
   });
   ```

### Dual Mode Support

The callbacks automatically handle both offline and online modes:

- **Offline Mode**: Callback returns cached/direct data
  ```typescript
  fetchCandidateSchemes: async () => cachedSchemes
  ```

- **Online Mode**: Callback fetches from database/HTTP
  ```typescript
  fetchCandidateSchemes: async (params) => {
    return await db.schemes.find(buildQuery(params));
  }
  ```

The package doesn't need to know which mode is used - it just calls the callback.

## Scheme Evaluation Logic

### Priority Rules

1. **Lower priority number = Higher priority**
   - Priority 1 is applied before Priority 2
   - If multiple schemes have same priority, highest reward is chosen

2. **Mutual Exclusion**
   - Schemes in the same `mutualExclusionGroup` cannot be applied together
   - First applicable scheme in the group is applied, others are blocked

### Condition Evaluation

Each condition type has specific evaluation logic:

- **Invoice**: Checks total cart value/quantity
- **Line Item**: Checks specific products in cart
- **Combo**: Checks if multiple products match criteria (ALL/ANY)
- **Assorted**: Aggregates value/quantity across multiple products
- **Flexible Product**: Matches any products meeting criteria

### Reward Calculation

Rewards are calculated based on:
- **Discount Percent**: `(baseValue × percentage) / 100`
- **Discount Fixed**: Fixed amount
- **Free Product**: Adds free product to cart
- **Product Discount**: Discount on specific products

Rewards are capped by `maxRewardAmount` if specified.

## Product Data Provider

### When It's Used

The `productDataProvider` is used for:
- **Weight-based calculations**: Getting product capacity in kg
- **UOM conversions**: Getting base UOM and unitPerCase
- **Pricing group validation**: Checking if products are mapped to pricing groups

### How It Works

1. **EvaluatorsService** calls productDataProvider callbacks when needed:
   ```typescript
   const capacity = await productDataProvider.getProductCapacityInKg(productId);
   ```

2. **Service layer** implements callbacks:
   ```typescript
   getProductCapacityInKg: async (productId) => {
     const product = await httpClient.post('PRODUCT_SERVICE', '/products/by-ids', {
       productIds: [productId]
     });
     return product[0]?.size?.capacity || 0;
   }
   ```

3. **Package** uses the returned data for calculations

## Performance Considerations

### Timing Collection

The package tracks:
- Total calculation duration
- Time spent in each callback
- Time spent evaluating schemes
- Number of schemes processed

### Optimization Tips

1. **Cache schemes**: Implement caching in `fetchCandidateSchemes` callback
2. **Batch product data**: Fetch multiple products in one call
3. **Filter early**: Use `includeSchemes` to limit evaluation
4. **Monitor performance**: Use `performanceMonitor` to identify bottlenecks

## Error Handling

### Package Errors

The package throws standard `Error` objects:
- Input validation errors
- Calculation errors

### Callback Errors

Callbacks should handle errors gracefully:
- Return empty arrays on error (for scheme callbacks)
- Return 0 or null on error (for product data callbacks)
- Log errors using logger callback

## Best Practices

1. **Normalize data in callbacks**: Convert database documents to `IScheme` format
2. **Handle errors gracefully**: Don't let callback errors crash the calculation
3. **Cache when possible**: Reduce database/HTTP calls
4. **Monitor performance**: Track metrics to identify issues
5. **Test with mocks**: Use mock callbacks for unit testing

## Example Flow Diagram

```
User Request
    ↓
calculateReward()
    ↓
Validate Input
    ↓
buildCandidateSet()
    ↓
fetchCandidateSchemes() [Callback]
    ↓
Service Layer: MongoDB Query → Fetch Schemes → Normalize
    ↓
Package: Receive Schemes
    ↓
Calculate Totals
    ↓
evaluatorsService.evaluateSchemes()
    ↓
For each scheme:
  - Check applicability
  - Evaluate conditions
  - Calculate rewards
  - Apply priority rules
    ↓
getAllAvailableSchemes()
    ↓
fetchAllAvailableSchemes() [Callback]
    ↓
evaluateAllAvailableSchemes()
    ↓
Filter and Build Response
    ↓
performanceMonitor() [Callback]
    ↓
Return Result
```

## Summary

The reward calculator uses a **callback-based architecture** where:
- Package handles calculation logic
- Service layer handles data fetching (via callbacks)
- No direct dependencies on frameworks or databases
- Works in both offline and online modes
- Provides performance monitoring capabilities

This design makes the package:
- Framework-agnostic
- Testable
- Flexible
- Maintainable

