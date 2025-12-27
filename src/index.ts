/**
 * @coder_18/scheme-engine
 * 
 * Reward calculation engine for discount schemes
 * 
 * Main export: calculateReward function
 */

// Main calculator function
export { calculateReward } from './calculate-reward';
export type {
    CalculateRewardParams,
    LoggerCallback,
    FetchCandidateSchemesParams,
    FetchMissingExcludedSchemesParams,
    FetchAllAvailableSchemesParams,
    IProductDataProvider,
    IPerformanceMetrics,
    PerformanceMonitorCallback
} from './interfaces/scheme.interface';

// Interfaces
export * from './interfaces/scheme.interface';

// Enums
export * from './enums/scheme.enums';
