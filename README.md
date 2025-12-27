# @coder_18/scheme-engine

A powerful reward calculation engine for discount schemes. This package provides a flexible and extensible solution for calculating rewards, discounts, and free products based on complex business rules and conditions.

## Features

- 🎯 **Flexible Scheme Evaluation** - Support for multiple condition types (invoice, line item, combo, assorted, flexible product)
- 🔄 **Callback-based Architecture** - No direct database dependencies, works with any data source
- 📊 **Comprehensive Results** - Detailed breakdown of applied schemes, discounts, and rewards
- 🚀 **Performance Monitoring** - Built-in performance metrics and monitoring callbacks
- 📦 **Zero Runtime Dependencies** - Lightweight and fast
- 💪 **TypeScript Support** - Full TypeScript definitions included

## Installation

```bash
npm install @coder_18/scheme-engine
```

## Quick Start

```typescript
import { calculateReward } from '@coder_18/scheme-engine';
import type { IProductItem, IScheme } from '@coder_18/scheme-engine';

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
    // Your implementation to fetch schemes from database
    // Build query based on params and return IScheme[]
    return [];
  },
  
  // Required: Fetch all available schemes
  fetchAllAvailableSchemes: async (params) => {
    // Your implementation to fetch all schemes
    return [];
  }
});

console.log('Total Discount:', result.totalDiscount);
console.log('Applied Schemes:', result.appliedSchemes);
```

## Requirements

- Node.js >= 16.0.0
- TypeScript (recommended) or JavaScript (ES2020+)

## Documentation

For detailed documentation, please refer to:

- **[API Documentation](./API_DOCUMENTATION.md)** - Complete API reference
- **[How It Works](./HOW_IT_WORKS.md)** - Internal architecture and flow
- **[Architecture](./ARCHITECTURE.md)** - Design patterns and structure
- **[Testing](./TESTING.md)** - Testing guide and examples

## Examples

See the [examples](./examples/) directory for:

- [Basic Usage](./examples/basic-usage.ts) - Minimal setup example
- [Offline Mode](./examples/offline-mode.ts) - Using product data provider
- [Performance Monitoring](./examples/with-performance-monitoring.ts) - Performance metrics
- [Product Provider](./examples/with-product-provider.ts) - Advanced product data handling

## License

MIT

## Repository

[GitHub Repository](https://github.com/naga-tech/scheme-engine)

## Support

For issues and questions, please use the [GitHub Issues](https://github.com/naga-tech/scheme-engine/issues) page.

