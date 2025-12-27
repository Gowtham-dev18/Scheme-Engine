# Testing Guide: @naga/reward-calculator

## Overview

This package uses [Jest](https://jestjs.io/) as the testing framework with TypeScript support via `ts-jest`. The test suite includes unit tests, integration tests, and comprehensive coverage reporting.

## Prerequisites

- Node.js >= 16.0.0
- npm or yarn package manager

## Running Tests

### Run All Tests

```bash
cd scheme-engine
npm test
```

This will:
- Run all test files matching `**/__tests__/**/*.test.ts`
- Display test results in the terminal
- Show coverage summary

### Run Tests in Watch Mode

```bash
npm run test:watch
```

This will:
- Watch for file changes
- Automatically re-run tests when files are modified
- Useful during development

### Run Tests with Coverage

```bash
npm run test:coverage
```

This will:
- Run all tests
- Generate detailed coverage reports
- Create HTML coverage report in `coverage/` directory
- Display coverage summary in terminal

### Run Specific Test File

```bash
npm test -- calculate-reward.test.ts
```

Or use Jest's pattern matching:

```bash
npm test -- --testPathPattern=calculate-reward
```

### Run Tests Matching a Pattern

```bash
npm test -- --testNamePattern="should calculate discount"
```

## Test Structure

### Directory Structure

```
scheme-engine/
├── src/
│   ├── __tests__/
│   │   ├── calculate-reward.test.ts          # Main function tests
│   │   ├── services/
│   │   │   ├── evaluators.test.ts            # EvaluatorsService tests
│   │   │   └── validators.test.ts            # ValidatorsService tests
│   │   ├── integration/
│   │   │   └── calculate-reward.integration.test.ts  # Integration tests
│   │   └── utils/
│   │       └── test-helpers.ts                # Test utilities and mocks
│   └── ...
└── jest.config.js                             # Jest configuration
```

### Test File Naming Convention

- Test files must be named `*.test.ts`
- Located in `__tests__` directories
- Mirror the source file structure

## Test Types

### 1. Unit Tests

Unit tests test individual functions and classes in isolation.

#### Example: `calculate-reward.test.ts`

Tests the main `calculateReward` function:

```typescript
describe('calculateReward', () => {
  describe('Input Validation', () => {
    it('should throw error if products array is empty', async () => {
      await expect(
        calculateReward({
          ...defaultParams,
          products: []
        })
      ).rejects.toThrow('Products array is required and cannot be empty');
    });
  });
});
```

**What it tests:**
- Input validation
- Basic reward calculation
- includeSchemes and excludeSchemes
- Logger integration
- Product data provider integration
- Response structure
- Edge cases

#### Example: `services/evaluators.test.ts`

Tests the `EvaluatorsService` class:

```typescript
describe('EvaluatorsService', () => {
  it('should evaluate and apply invoice scheme', async () => {
    const scheme = createInvoiceScheme({...});
    const result = await evaluatorsService.evaluateSchemes([scheme], ...);
    expect(result.appliedSchemes.length).toBeGreaterThan(0);
  });
});
```

**What it tests:**
- Scheme evaluation logic
- Condition evaluation
- Priority handling
- Mutual exclusion
- Product data provider integration
- UOM conversion
- Error handling

#### Example: `services/validators.test.ts`

Tests the `ValidatorsService` class:

```typescript
describe('ValidatorsService', () => {
  it('should return weight from product if available', () => {
    const product = createMockProduct({ weight: 5.5 });
    const capacity = validatorsService.getProductCapacityInKg('PROD001', product);
    expect(capacity).toBe(5.5);
  });
});
```

**What it tests:**
- Product capacity validation
- UOM details validation
- Combo condition validation
- Assorted condition validation
- Invoice condition validation
- Line item condition validation
- Reward validation

### 2. Integration Tests

Integration tests test the complete flow with multiple components working together.

#### Example: `integration/calculate-reward.integration.test.ts`

```typescript
describe('calculateReward Integration Tests', () => {
  it('should calculate rewards for invoice-based scheme', async () => {
    const scheme = createInvoiceScheme({...});
    const result = await calculateReward({
      products: [...],
      fetchCandidateSchemes: createMockFetchCandidateSchemes([scheme]),
      fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([scheme])
    });
    expect(result.totalDiscount).toBeGreaterThan(0);
  });
});
```

**What it tests:**
- End-to-end calculation flow
- Multiple schemes evaluation
- Scheme priority and mutual exclusion
- Product data provider integration
- Logger integration
- includeSchemes and excludeSchemes
- Complex scenarios

## Test Utilities

### Test Helpers (`__tests__/utils/test-helpers.ts`)

The test helpers provide mock data factories and utilities:

#### Mock Data Factories

```typescript
// Create a mock product
const product = createMockProduct({
  productId: 'PROD001',
  quantity: 5,
  unitPrice: 100
});

// Create a mock scheme
const scheme = createMockScheme({
  schemeId: 'SCHEME001',
  schemeName: 'Test Scheme'
});

// Create multiple mock schemes
const schemes = createMockSchemes(5);
```

#### Specialized Scheme Creators

```typescript
// Create invoice scheme
const invoiceScheme = createInvoiceScheme({
  applicableTo: { warehouseIds: ['WH001'] }
});

// Create line item scheme
const lineItemScheme = createLineItemScheme();

// Create combo scheme
const comboScheme = createComboScheme();

// Create assorted scheme
const assortedScheme = createAssortedScheme();
```

#### Mock Callbacks

```typescript
// Mock fetchCandidateSchemes callback
const fetchCandidateSchemes = createMockFetchCandidateSchemes([scheme1, scheme2]);

// Mock fetchAllAvailableSchemes callback
const fetchAllAvailableSchemes = createMockFetchAllAvailableSchemes([scheme1, scheme2]);

// Mock logger
const logger = createMockLogger();
await calculateReward({...params, logger});
const logs = logger.getLogs(); // Get all logged messages

// Mock product data provider
const productDataProvider = createMockProductDataProvider({
  getProductCapacityInKg: async (id) => 10
});
```

## Writing New Tests

### Step 1: Create Test File

Create a new test file in the appropriate `__tests__` directory:

```typescript
// src/__tests__/my-feature.test.ts
import { myFunction } from '../my-feature';
import { createMockProduct } from './utils/test-helpers';

describe('myFeature', () => {
  it('should do something', () => {
    // Test implementation
  });
});
```

### Step 2: Use Test Helpers

Import and use test helpers for consistent mock data:

```typescript
import {
  createMockProduct,
  createMockScheme,
  createMockFetchCandidateSchemes
} from './utils/test-helpers';
```

### Step 3: Write Test Cases

Follow the AAA pattern (Arrange, Act, Assert):

```typescript
it('should calculate discount correctly', async () => {
  // Arrange: Set up test data
  const products = [createMockProduct({ quantity: 10, unitPrice: 100 })];
  const scheme = createInvoiceScheme();
  
  // Act: Execute the function
  const result = await calculateReward({
    products,
    warehouseId: 'WH001',
    fetchCandidateSchemes: createMockFetchCandidateSchemes([scheme]),
    fetchAllAvailableSchemes: createMockFetchAllAvailableSchemes([scheme])
  });
  
  // Assert: Verify the result
  expect(result.totalDiscount).toBeGreaterThan(0);
  expect(result.appliedSchemes.length).toBe(1);
});
```

### Step 4: Test Edge Cases

Always test edge cases:

```typescript
it('should handle empty products array', async () => {
  await expect(
    calculateReward({
      ...defaultParams,
      products: []
    })
  ).rejects.toThrow('Products array is required');
});

it('should handle missing callbacks', async () => {
  await expect(
    calculateReward({
      ...defaultParams,
      fetchCandidateSchemes: undefined as any
    })
  ).rejects.toThrow('fetchCandidateSchemes');
});
```

## Test Coverage

### Coverage Goals

The package aims for:
- **Branches**: >70%
- **Functions**: >70%
- **Lines**: >70%
- **Statements**: >70%

### Viewing Coverage

After running `npm run test:coverage`:

1. **Terminal Output**: Shows summary coverage percentages
2. **HTML Report**: Open `coverage/index.html` in a browser for detailed coverage

### Coverage Report Structure

```
coverage/
├── index.html              # Main coverage report
├── lcov.info               # LCOV format (for CI/CD)
└── ...
```

## Common Test Patterns

### Testing Async Functions

```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

### Testing Error Cases

```typescript
it('should throw error on invalid input', async () => {
  await expect(
    calculateReward({ products: [] })
  ).rejects.toThrow('Products array is required');
});
```

### Testing with Mocks

```typescript
it('should use productDataProvider', async () => {
  const getProductCapacityInKg = jest.fn().mockResolvedValue(10);
  const productDataProvider = createMockProductDataProvider({
    getProductCapacityInKg
  });
  
  await calculateReward({
    ...params,
    productDataProvider
  });
  
  expect(getProductCapacityInKg).toHaveBeenCalled();
});
```

### Testing Callbacks

```typescript
it('should call logger callback', async () => {
  const logger = createMockLogger();
  
  await calculateReward({
    ...params,
    logger
  });
  
  const logs = logger.getLogs();
  expect(logs.length).toBeGreaterThan(0);
});
```

## Debugging Tests

### Run Single Test

```bash
npm test -- --testNamePattern="should calculate discount"
```

### Run Tests with Verbose Output

```bash
npm test -- --verbose
```

### Debug in VS Code

1. Set breakpoints in test files
2. Open Debug panel (F5)
3. Select "Jest: Current File" or "Jest: All"
4. Start debugging

### View Test Output

```typescript
it('should log debug information', async () => {
  const logger = createMockLogger();
  await calculateReward({...params, logger});
  
  const logs = logger.getLogs();
  console.log('All logs:', logs); // View all logged messages
});
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: cd scheme-engine && npm install
      - run: cd scheme-engine && npm test
      - run: cd scheme-engine && npm run test:coverage
```

## Best Practices

1. **Use Descriptive Test Names**: Test names should clearly describe what is being tested
   ```typescript
   // Good
   it('should calculate discount for invoice-based scheme', ...)
   
   // Bad
   it('should work', ...)
   ```

2. **Test One Thing Per Test**: Each test should verify a single behavior
   ```typescript
   // Good: Separate tests
   it('should validate products array', ...)
   it('should validate warehouseId', ...)
   
   // Bad: Multiple assertions in one test
   it('should validate everything', ...)
   ```

3. **Use Test Helpers**: Reuse mock data factories for consistency
   ```typescript
   // Good
   const product = createMockProduct({ quantity: 5 });
   
   // Bad
   const product = { productId: 'P1', quantity: 5, unitPrice: 100, ... };
   ```

4. **Test Edge Cases**: Always test boundary conditions and error cases
   ```typescript
   it('should handle empty array', ...)
   it('should handle null values', ...)
   it('should handle invalid input', ...)
   ```

5. **Keep Tests Independent**: Tests should not depend on each other
   ```typescript
   beforeEach(() => {
     // Reset state before each test
   });
   ```

6. **Mock External Dependencies**: Use mocks for callbacks and external services
   ```typescript
   const fetchSchemes = jest.fn().mockResolvedValue([]);
   ```

7. **Assert Meaningfully**: Make assertions that verify the expected behavior
   ```typescript
   // Good
   expect(result.totalDiscount).toBe(100);
   expect(result.appliedSchemes.length).toBe(1);
   
   // Bad
   expect(result).toBeDefined();
   ```

## Troubleshooting

### Tests Not Running

**Problem**: Tests not found or not running

**Solution**:
- Check file naming: must be `*.test.ts`
- Check file location: must be in `__tests__` directory
- Verify Jest config in `jest.config.js`

### Type Errors in Tests

**Problem**: TypeScript errors in test files

**Solution**:
- Ensure test files import types correctly
- Check that mock data matches interface definitions
- Use `as any` sparingly and only when necessary

### Async Test Timeouts

**Problem**: Tests timing out

**Solution**:
- Increase timeout: `jest.setTimeout(10000)`
- Check for unhandled promises
- Ensure async functions are properly awaited

### Coverage Not Generating

**Problem**: Coverage report not created

**Solution**:
- Run `npm run test:coverage` (not just `npm test`)
- Check `jest.config.js` for coverage configuration
- Verify `collectCoverageFrom` paths are correct

## Test Execution Flow

1. **Jest reads configuration** from `jest.config.js`
2. **Finds test files** matching `**/__tests__/**/*.test.ts`
3. **Compiles TypeScript** using `ts-jest`
4. **Runs tests** in parallel (by default)
5. **Collects coverage** if `--coverage` flag is used
6. **Generates reports** (terminal + HTML if coverage enabled)

## Example Test Run Output

```
PASS  src/__tests__/calculate-reward.test.ts
  calculateReward
    Input Validation
      ✓ should throw error if products array is empty (5ms)
      ✓ should throw error if warehouseId is missing (2ms)
    Basic Reward Calculation
      ✓ should return zero discount when no schemes are available (3ms)
      ✓ should calculate discount for invoice-based scheme (15ms)

Test Suites: 4 passed, 4 total
Tests:       45 passed, 45 total
Snapshots:   0 total
Time:        2.543 s
```

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [TypeScript with Jest](https://jestjs.io/docs/getting-started#using-typescript)
- [Testing Best Practices](https://jestjs.io/docs/snapshot-testing)

## Summary

The test suite provides comprehensive coverage of the reward calculation engine:

- ✅ **Unit Tests**: Test individual functions and classes
- ✅ **Integration Tests**: Test complete workflows
- ✅ **Test Helpers**: Reusable mock data factories
- ✅ **Coverage Reports**: Track test coverage
- ✅ **CI/CD Ready**: Can be integrated into pipelines

Run `npm test` to execute all tests and verify the package functionality!

