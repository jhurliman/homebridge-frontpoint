import { Logger, LogLevel } from 'homebridge';

/**
 * CustomLogger is a logger to replace the homebridge logger. The reason for this is
 * to allow user defined logging levels, where logs are not output if the user desires.
 */
export class CustomLogger implements Logger {
  public readonly logger: Logger;
  public readonly prefix: string;
  public readonly logLevel: CustomLogLevel;

  constructor(logger: Logger, logLevel: CustomLogLevel, prefix?: string) {
    this.prefix = prefix || '';
    this.logger = logger;
    this.logLevel = logLevel;
  }

  info(message: string, ...parameters: any[]): void {
    if (this.logLevel >= CustomLogLevel.NOTICE)
      this.logger.info(message, ...parameters);
  }

  warn(message: string, ...parameters: any[]): void {
    if (this.logLevel >= CustomLogLevel.WARN)
      this.logger.warn(message, ...parameters);
  }

  error(message: string, ...parameters: any[]): void {
    if (this.logLevel >= CustomLogLevel.ERROR)
      this.logger.error(message, ...parameters);
  }

  debug(message: string, ...parameters: any[]): void {
    if (this.logLevel >= CustomLogLevel.VERBOSE)
      this.logger.debug(message, ...parameters);
  }

  /**
   * @deprecated
   * @param level
   * @param message
   * @param parameters
   */
  log(level: LogLevel, message: string, ...parameters: any[]): void {
    return;
  }
}

export enum CustomLogLevel {
  NONE, ERROR, WARN, NOTICE, VERBOSE
}