export interface AppLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string | Error, meta?: Record<string, unknown> | string): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}
