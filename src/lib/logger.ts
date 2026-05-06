/**
 * Environment-aware logger. Routes diagnostic output through a single
 * surface so production builds can stay quiet while preserving real
 * errors for user bug reports and error-tracking tools.
 *
 * Levels:
 * - `error` — fires in all environments. Use for real exceptions, security
 *   events (OAuth CSRF), and missing required configuration.
 * - `warn` — dev-only. Use for graceful degradation (cache quota, missing
 *   metadata), expected-but-noisy events, and developer hints.
 * - `debug` — dev-only verbose tracing.
 */
const isDev = import.meta.env.DEV

export const logger = {
  warn(...args: unknown[]): void {
    if (isDev) console.warn(...args)
  },
  error(...args: unknown[]): void {
    console.error(...args)
  },
  debug(...args: unknown[]): void {
    if (isDev) console.log(...args)
  },
}
