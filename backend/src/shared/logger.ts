/**
 * Structured Logger
 *
 * Simple wrapper that provides consistent logging format.
 * Can be extended to use Winston, Pino, or other logging libraries.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

const levelOrder: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4,
};

let currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return levelOrder[level] <= levelOrder[currentLevel];
}

function formatMessage(level: LogLevel, message: string, meta?: Record<string, any>): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${level.toUpperCase()}]`;
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${prefix} ${message}${metaStr}`;
}

export const logger = {
  error: (message: string, meta?: Record<string, any>) => {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message, meta));
    }
  },

  warn: (message: string, meta?: Record<string, any>) => {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, meta));
    }
  },

  info: (message: string, meta?: Record<string, any>) => {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message, meta));
    }
  },

  debug: (message: string, meta?: Record<string, any>) => {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', message, meta));
    }
  },

  verbose: (message: string, meta?: Record<string, any>) => {
    if (shouldLog('verbose')) {
      console.log(formatMessage('verbose', message, meta));
    }
  },
};

export default logger;
