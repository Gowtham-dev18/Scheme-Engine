/**
 * Simple logger interface for the reward calculator
 * Allows users to provide their own logging implementation
 */
export interface ILogger {
  log(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * Default console logger implementation
 */
export class ConsoleLogger implements ILogger {
  log(message: string, ...args: any[]): void {
    console.log(message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    console.debug(message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(message, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(message, ...args);
  }
}

/**
 * Silent logger that does nothing (useful for production)
 */
export class SilentLogger implements ILogger {
  log(): void { }
  debug(): void { }
  warn(): void { }
  error(): void { }
}


