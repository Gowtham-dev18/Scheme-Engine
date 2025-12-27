/**
 * Interface for providing product data (weight, capacity, UOM) when needed
 * This is optional - if not provided, the calculator will use data from IProductItem
 * or default to 0
 */
export interface IProductDataProvider {
  /**
   * Get product capacity in kg
   * @param productId Product ID
   * @returns Capacity in kg, or 0 if not available
   */
  getProductCapacityInKg(productId: string): Promise<number>;

  /**
   * Get product UOM details (baseUOM, unitPerCase)
   * @param productId Product ID
   * @returns UOM details or null if not available
   */
  getProductUomDetails(productId: string): Promise<{
    baseUom?: string;
    unitPerCase?: Array<{
      numerator: number;
      buom: string;
      denominator: number;
      auom: string;
    }>;
  } | null>;

  /**
   * Get pricing group products mapping
   * @param productIds Array of product IDs
   * @returns Array of pricing group product mappings
   */
  getPricingGroupProducts(productIds: string[]): Promise<any[]>;

  /**
   * Get pricing groups
   * @param groupIds Array of pricing group IDs
   * @returns Array of pricing groups
   */
  getPricingGroups(groupIds: string[]): Promise<any[]>;
}

/**
 * Default product data provider that returns empty/default values
 */
export class DefaultProductDataProvider implements IProductDataProvider {
  async getProductCapacityInKg(productId: string): Promise<number> {
    return 0;
  }

  async getProductUomDetails(productId: string): Promise<{
    baseUom?: string;
    unitPerCase?: Array<{
      numerator: number;
      buom: string;
      denominator: number;
      auom: string;
    }>;
  } | null> {
    return null;
  }

  async getPricingGroupProducts(productIds: string[]): Promise<any[]> {
    return [];
  }

  async getPricingGroups(groupIds: string[]): Promise<any[]> {
    return [];
  }
}


