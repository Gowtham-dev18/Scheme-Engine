# API Documentation: @naga/reward-calculator

## Overview

This document provides complete API reference for the `@naga/reward-calculator` npm package, including function signatures, callback interfaces, examples, and integration patterns.

## Installation

```bash
npm install @naga/reward-calculator
```

## Main Function

### `calculateReward`

The main function for calculating rewards based on discount schemes.

#### Function Signature

```typescript
export async function calculateReward(
  params: CalculateRewardParams
): Promise<IRewardCalculationResponse>
```

#### Parameters

```typescript
interface CalculateRewardParams {
  // Required: Product items in cart
  products: IProductItem[];
  
  // Required: Context identifiers
  warehouseId: string;
  channelId?: string;
  businessTypeId?: string;
  outletId?: string;
  
  // Optional: Scheme filtering
  includeSchemes?: string[];  // Only evaluate these schemes
  excludeSchemes?: string[];  // Exclude these schemes from evaluation
  
  // Required: Callback functions for fetching schemes
  fetchCandidateSchemes: (params: FetchCandidateSchemesParams) => Promise<IScheme[]>;
  fetchAllAvailableSchemes: (params: FetchAllAvailableSchemesParams) => Promise<IScheme[]>;
  
  // Optional: Callback for fetching missing excluded schemes
  fetchMissingExcludedSchemes?: (params: FetchMissingExcludedSchemesParams) => Promise<IScheme[]>;
  
  // Optional: Logger callback
  logger?: LoggerCallback;
  
  // Optional: Product data provider callbacks (replaces HTTP calls)
  productDataProvider?: IProductDataProvider;
}
```

#### Return Type

```typescript
interface IRewardCalculationResponse {
  totalDiscount: number;
  totalRewardAmount: number;
  appliedSchemes: ICalculatedReward[];
  availableSchemes: ISchemeApplicability[];
  summary: {
    totalProducts: number;
    totalQuantity: number;
    totalValue: number;
    totalValueAfterDiscount: number;
    schemesApplied: number;
    freeProducts: IFreeProductReward[];
    discountedProducts?: IProductDiscountReward[];
    discountValue: number;
  };
}
```

## Callback Interfaces

### FetchCandidateSchemesParams

```typescript
interface FetchCandidateSchemesParams {
  warehouseId: string;
  channelId: string;
  businessTypeId: string;
  includeSchemes?: string[];
  excludeSchemes?: string[];
  now: Date;
}
```

### FetchMissingExcludedSchemesParams

```typescript
interface FetchMissingExcludedSchemesParams {
  schemeIds: string[];
  now: Date;
}
```

### FetchAllAvailableSchemesParams

```typescript
interface FetchAllAvailableSchemesParams {
  warehouseId: string;
  channelId: string;
  businessTypeId: string;
  outletId?: string;
  now: Date;
}
```

### IProductDataProvider

```typescript
interface IProductDataProvider {
  getProductCapacityInKg?: (productId: string) => Promise<number>;
  getProductUomDetails?: (productId: string) => Promise<{
    baseUom?: string;
    unitPerCase?: Array<{
      numerator: number;
      buom: string;
      denominator: number;
      auom: string;
    }>;
  } | null>;
  getPricingGroupProducts?: (productIds: string[]) => Promise<any[]>;
  getPricingGroups?: (groupIds: string[]) => Promise<any[]>;
}
```

### LoggerCallback

```typescript
type LoggerCallback = (
  level: 'log' | 'debug' | 'warn' | 'error',
  message: string
) => void;
```

## Usage Examples

### Basic Usage (Backend Integration)

```typescript
import { calculateReward } from '@naga/reward-calculator';
import type { 
  CalculateRewardParams,
  IProductItem 
} from '@naga/reward-calculator';

// In your service layer
async function calculateRewardForCart(
  warehouseId: string,
  channelId: string,
  businessTypeId: string,
  products: IProductItem[],
  outletId?: string
) {
  return calculateReward({
    products,
    warehouseId,
    channelId,
    businessTypeId,
    outletId,
    
    // Callback: Fetch candidate schemes
    fetchCandidateSchemes: async (params) => {
      // Build MongoDB query based on params
      const query = {
        status: 'ACTIVE',
        validFrom: { $lte: params.now },
        validTo: { $gte: params.now },
        $or: [
          { 'applicableTo.warehouseIds': { $in: [params.warehouseId] } },
          { 'applicableTo.warehouseIds': { $size: 0 } },
          // ... more query conditions
        ]
      };
      
      if (params.includeSchemes?.length) {
        query.schemeId = { $in: params.includeSchemes };
      }
      
      // Fetch from database
      const schemes = await mongoDbServices.schemes.find(
        query,
        null,
        { sort: { 'conditions.priority': 1 }, lean: true }
      );
      
      // Normalize and return
      return normalizeSchemes(schemes);
    },
    
    // Callback: Fetch all available schemes
    fetchAllAvailableSchemes: async (params) => {
      const query = {
        status: 'ACTIVE',
        validFrom: { $lte: params.now },
        validTo: { $gte: params.now },
        $or: [
          { 'applicableTo.warehouseIds': { $in: [params.warehouseId] } },
          { 'applicableTo.channelIds': { $in: [params.channelId] } },
          // ... more conditions
        ]
      };
      
      const schemes = await mongoDbServices.schemes.find(
        query,
        null,
        { sort: { 'conditions.priority': 1 }, lean: true }
      );
      
      return normalizeSchemes(schemes);
    },
    
    // Optional: Product data provider (replaces HTTP calls)
    productDataProvider: {
      getProductCapacityInKg: async (productId: string) => {
        const product = await httpClientService.post(
          'NAGA_PRODUCT_SERVICE',
          '/products/by-ids',
          { productIds: [productId] }
        );
        return product[0]?.size?.capacity || 0;
      },
      
      getProductUomDetails: async (productId: string) => {
        const product = await httpClientService.post(
          'NAGA_PRODUCT_SERVICE',
          '/products/by-ids',
          { productIds: [productId] }
        );
        return {
          baseUom: product[0]?.baseUom,
          unitPerCase: product[0]?.unitPerCase
        };
      },
      
      getPricingGroupProducts: async (productIds: string[]) => {
        return await httpClientService.get(
          'NAGA_PRODUCT_SERVICE',
          `/pricing-group-products?productId=${productIds.join(',')}`
        );
      },
      
      getPricingGroups: async (groupIds: string[]) => {
        return await httpClientService.get(
          'NAGA_PRODUCT_SERVICE',
          `/pricing-groups?groupId=${groupIds.join(',')}`
        );
      }
    },
    
    // Optional: Logger callback
    logger: (level, message) => {
      if (level === 'log') logger.log(message);
      else if (level === 'debug') logger.debug(message);
      else if (level === 'warn') logger.warn(message);
      else if (level === 'error') logger.error(message);
    }
  });
}
```

### Offline Usage (Direct Data)

```typescript
import { calculateReward } from '@naga/reward-calculator';

// If you already have schemes in memory
const schemes: IScheme[] = [/* ... */];

const result = await calculateReward({
  products: [
    { productId: 'P001', quantity: 5, unitPrice: 100 }
  ],
  warehouseId: 'WH001',
  channelId: 'CH001',
  businessTypeId: 'BT001',
  
  // Pass schemes directly via callback
  fetchCandidateSchemes: async () => schemes,
  fetchAllAvailableSchemes: async () => schemes
});
```

## Backend Integration Example (NestJS)

### Service Layer Implementation

```typescript
// schemes.service.ts
import { calculateReward } from '@naga/reward-calculator';
import type { CalculateRewardParams } from '@naga/reward-calculator';

@Injectable()
export class SchemesService {
  constructor(
    private readonly mongoDbServices: IMongoDBServices,
    private readonly httpClientService: HttpClientService,
    private readonly logger: AppLoggerService
  ) {}

  async calculateReward(
    warehouseId: string,
    channelId: string,
    businessTypeId: string,
    products: IProductItem[],
    outletId?: string,
    includeSchemes?: string[],
    excludeSchemes?: string[]
  ): Promise<IRewardCalculationResponse> {
    // Helper to normalize MongoDB documents to IScheme
    const normalizeScheme = (scheme: any): IScheme => {
      return {
        schemeId: scheme.schemeId || scheme._id?.toString(),
        schemeName: scheme.schemeName || '',
        description: scheme.description || '',
        validFrom: scheme.validFrom,
        validTo: scheme.validTo,
        status: scheme.status,
        maxRewardPerInvoice: scheme.maxRewardPerInvoice,
        createdBy: scheme.createdBy,
        mutualExclusionGroup: scheme.mutualExclusionGroup,
        applicableTo: scheme.applicableTo || {
          warehouseIds: [],
          channelIds: [],
          businessTypeIds: [],
          productIds: [],
          brandIds: [],
          categoryIds: [],
          subcategoryIds: [],
          outletIds: []
        },
        conditions: Array.isArray(scheme.conditions) ? scheme.conditions : []
      };
    };

    return calculateReward({
      products,
      warehouseId,
      channelId,
      businessTypeId,
      outletId,
      includeSchemes,
      excludeSchemes,
      
      // Callback: Fetch candidate schemes
      fetchCandidateSchemes: async (params) => {
        const query: any = {
          status: SchemeStatus.ACTIVE,
          validFrom: { $lte: params.now },
          validTo: { $gte: params.now },
          $or: [
            { 'applicableTo.warehouseIds': { $in: [params.warehouseId] } },
            { 'applicableTo.warehouseIds': { $size: 0 } },
            { 'applicableTo.channelIds': { $in: [params.channelId] } },
            { 'applicableTo.channelIds': { $size: 0 } },
            { 'applicableTo.businessTypeIds': { $in: [params.businessTypeId] } },
            { 'applicableTo.businessTypeIds': { $size: 0 } }
          ]
        };
        
        if (params.includeSchemes?.length) {
          query.schemeId = { $in: params.includeSchemes };
        }
        
        const schemes = await this.mongoDbServices.schemes.find(
          query,
          null,
          { sort: { 'conditions.priority': 1 }, lean: true }
        );
        
        return schemes.map(normalizeScheme);
      },
      
      // Callback: Fetch missing excluded schemes
      fetchMissingExcludedSchemes: async (params) => {
        const query = {
          schemeId: { $in: params.schemeIds },
          status: SchemeStatus.ACTIVE,
          validFrom: { $lte: params.now },
          validTo: { $gte: params.now }
        };
        
        const schemes = await this.mongoDbServices.schemes.find(
          query,
          null,
          { lean: true }
        );
        
        return schemes.map(normalizeScheme);
      },
      
      // Callback: Fetch all available schemes
      fetchAllAvailableSchemes: async (params) => {
        const query = {
          status: SchemeStatus.ACTIVE,
          validFrom: { $lte: params.now },
          validTo: { $gte: params.now },
          $or: [
            { 'applicableTo.warehouseIds': { $in: [params.warehouseId] } },
            { 'applicableTo.channelIds': { $in: [params.channelId] } },
            { 'applicableTo.businessTypeIds': { $in: [params.businessTypeId] } },
            { 'applicableTo.outletIds': { $in: [params.outletId] } },
            { 'applicableTo.warehouseIds': { $size: 0 } },
            { 'applicableTo.channelIds': { $size: 0 } },
            { 'applicableTo.businessTypeIds': { $size: 0 } },
            { 'applicableTo.outletIds': { $size: 0 } }
          ]
        };
        
        const schemes = await this.mongoDbServices.schemes.find(
          query,
          null,
          { sort: { 'conditions.priority': 1 }, lean: true }
        );
        
        return schemes.map(normalizeScheme);
      },
      
      // Optional: Product data provider
      productDataProvider: {
        getProductCapacityInKg: async (productId: string) => {
          try {
            const response = await this.httpClientService.post(
              'NAGA_PRODUCT_SERVICE',
              '/products/by-ids',
              { productIds: [productId] }
            );
            const product = response[0];
            if (product?.size?.capacity) {
              return product.size.capacity;
            }
            return 0;
          } catch (error) {
            return 0;
          }
        },
        
        getProductUomDetails: async (productId: string) => {
          try {
            const response = await this.httpClientService.post(
              'NAGA_PRODUCT_SERVICE',
              '/products/by-ids',
              { productIds: [productId] }
            );
            const product = response[0];
            return {
              baseUom: product?.baseUom,
              unitPerCase: product?.unitPerCase
            };
          } catch (error) {
            return null;
          }
        },
        
        getPricingGroupProducts: async (productIds: string[]) => {
          const response = await this.httpClientService.get(
            'NAGA_PRODUCT_SERVICE',
            `/pricing-group-products?productId=${productIds.join(',')}`
          );
          return response?.items || [];
        },
        
        getPricingGroups: async (groupIds: string[]) => {
          const response = await this.httpClientService.get(
            'NAGA_PRODUCT_SERVICE',
            `/pricing-groups?groupId=${groupIds.join(',')}`
          );
          return response?.items || [];
        }
      },
      
      // Optional: Logger
      logger: (level, message) => {
        if (level === 'log') this.logger.log(message);
        else if (level === 'debug') this.logger.debug(message);
        else if (level === 'warn') this.logger.warn(message);
        else if (level === 'error') this.logger.error(message);
      }
    });
  }
}
```

## cURL Examples

### Backend API Endpoint (Using the Package)

The backend service uses the npm package internally. Here's how to call the backend API:

#### Calculate Rewards

```bash
curl -X POST http://localhost:3000/schemes/calculate-reward \
  -H "Content-Type: application/json" \
  -d '{
    "warehouseId": "WH001",
    "channelId": "CH001",
    "businessTypeId": "BT001",
    "products": [
      {
        "productId": "P001",
        "quantity": 5,
        "unitPrice": 100.50,
        "brandId": "BRAND001",
        "categoryId": "CAT001"
      },
      {
        "productId": "P002",
        "quantity": 3,
        "unitPrice": 75.25
      }
    ],
    "outletId": "OUTLET001",
    "includeSchemes": ["SCHEME001", "SCHEME002"],
    "excludeSchemes": ["SCHEME003"]
  }'
```

#### Response Example

```json
{
  "totalDiscount": 150.75,
  "totalRewardAmount": 150.75,
  "appliedSchemes": [
    {
      "schemeId": "SCHEME001",
      "schemeName": "Buy 2 Get 1 Free",
      "totalDiscount": 100.50,
      "rewardAmount": 100.50,
      "freeProducts": [
        {
          "productId": "P001",
          "quantity": 1
        }
      ]
    }
  ],
  "availableSchemes": [
    {
      "schemeId": "SCHEME003",
      "schemeName": "Excluded Scheme",
      "status": "EXCLUDED",
      "reason": "Scheme explicitly excluded from calculation"
    }
  ],
  "summary": {
    "totalProducts": 2,
    "totalQuantity": 8,
    "totalValue": 602.25,
    "totalValueAfterDiscount": 451.50,
    "schemesApplied": 1,
    "freeProducts": [
      {
        "productId": "P001",
        "quantity": 1
      }
    ],
    "discountValue": 150.75
  }
}
```

## Error Handling

### Package Errors

The package throws standard JavaScript `Error` objects:

```typescript
try {
  const result = await calculateReward(params);
} catch (error) {
  // error is a standard Error object
  console.error(error.message);
  // Convert to framework-specific exception if needed
  throw new BadRequestException(error.message);
}
```

### Common Errors

- `"Products array is required and cannot be empty"` - No products provided
- `"warehouseId is required"` - Missing warehouseId
- `"fetchCandidateSchemes and fetchAllAvailableSchemes callbacks are required"` - Missing required callbacks
- `"Reward calculation failed: ..."` - Calculation error with details

## Type Definitions

All types are exported from the package:

```typescript
import type {
  CalculateRewardParams,
  IRewardCalculationResponse,
  IProductItem,
  IScheme,
  ISchemeApplicability,
  IProductDataProvider,
  LoggerCallback,
  FetchCandidateSchemesParams,
  FetchMissingExcludedSchemesParams,
  FetchAllAvailableSchemesParams,
  IPerformanceMetrics,
  PerformanceMonitorCallback
} from '@naga/reward-calculator';
```

## Performance Monitoring

### Performance Metrics Interface

```typescript
interface IPerformanceMetrics {
  totalDuration: number; // Total calculation time in milliseconds
  fetchSchemesDuration?: number; // Time spent fetching schemes
  evaluationDuration?: number; // Time spent evaluating schemes
  callbackDurations?: {
    fetchCandidateSchemes?: number;
    fetchMissingExcludedSchemes?: number;
    fetchAllAvailableSchemes?: number;
    getProductCapacityInKg?: number;
    getProductUomDetails?: number;
    getPricingGroupProducts?: number;
    getPricingGroups?: number;
  };
  schemeCounts?: {
    candidateSchemes: number;
    evaluatedSchemes: number;
    appliedSchemes: number;
    availableSchemes: number;
  };
}
```

### Using Performance Monitor

```typescript
import { calculateReward } from '@naga/reward-calculator';
import type { IPerformanceMetrics } from '@naga/reward-calculator';

const result = await calculateReward({
  products,
  warehouseId: 'WH001',
  // ... other params
  fetchCandidateSchemes: async () => [],
  fetchAllAvailableSchemes: async () => [],
  
  // Performance monitoring callback
  performanceMonitor: (metrics: IPerformanceMetrics) => {
    console.log(`Total Duration: ${metrics.totalDuration}ms`);
    console.log(`Schemes Evaluated: ${metrics.schemeCounts?.evaluatedSchemes}`);
    
    // Send to monitoring service
    // monitoringService.record('reward.calculation.duration', metrics.totalDuration);
  }
});
```

### Performance Logging

The package automatically logs performance metrics when a logger is provided:

```typescript
calculateReward({
  // ... params
  logger: (level, message) => {
    if (level === 'debug' && message.includes('Performance')) {
      console.log(message); // Logs performance metrics
    }
  }
});
```

## Testing Examples

### Unit Testing with Mock Callbacks

```typescript
import { calculateReward } from '@naga/reward-calculator';
import type { IScheme } from '@naga/reward-calculator';

describe('Reward Calculation', () => {
  it('should calculate discount correctly', async () => {
    const mockSchemes: IScheme[] = [/* ... */];
    
    const result = await calculateReward({
      products: [/* ... */],
      warehouseId: 'WH001',
      fetchCandidateSchemes: async () => mockSchemes,
      fetchAllAvailableSchemes: async () => mockSchemes
    });
    
    expect(result.totalDiscount).toBe(100);
  });
});
```

### Integration Testing

```typescript
import { calculateReward } from '@naga/reward-calculator';

it('should handle multiple schemes', async () => {
  const result = await calculateReward({
    products: [/* ... */],
    warehouseId: 'WH001',
    fetchCandidateSchemes: async (params) => {
      // Test callback implementation
      return await fetchSchemesFromDatabase(params);
    },
    fetchAllAvailableSchemes: async (params) => {
      return await fetchSchemesFromDatabase(params);
    }
  });
  
  expect(result.appliedSchemes.length).toBeGreaterThan(0);
});
```

## Best Practices

1. **Always normalize scheme data** - Convert MongoDB documents to `IScheme` format in callbacks
2. **Handle errors gracefully** - Wrap callbacks in try-catch and return sensible defaults
3. **Cache when possible** - Service layer can implement caching in callbacks
4. **Log appropriately** - Use logger callback for debugging
5. **Provide productDataProvider** - Improves accuracy for weight-based and UOM-based calculations
6. **Monitor performance** - Use performanceMonitor callback to track calculation performance
7. **Test with mocks** - Use mock callbacks for unit testing

## Migration Guide

### From Direct Implementation to Package

**Before:**
```typescript
// Direct implementation with HTTP/DB calls
async calculateReward(...) {
  const schemes = await this.mongoDbServices.schemes.find(...);
  // ... calculation logic
}
```

**After:**
```typescript
// Using npm package with callbacks
async calculateReward(...) {
  return calculateReward({
    products,
    warehouseId,
    // ... other params
    fetchCandidateSchemes: async (params) => {
      return await this.mongoDbServices.schemes.find(...);
    }
  });
}
```

## Testing

### Unit Testing with Mock Callbacks

```typescript
import { calculateReward } from '@naga/reward-calculator';

const mockSchemes: IScheme[] = [/* ... */];

const result = await calculateReward({
  products: [/* ... */],
  warehouseId: 'WH001',
  fetchCandidateSchemes: async () => mockSchemes,
  fetchAllAvailableSchemes: async () => mockSchemes
});

expect(result.totalDiscount).toBe(100);
```

