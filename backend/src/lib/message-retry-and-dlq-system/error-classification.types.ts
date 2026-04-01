/**
 * Error Classification Types
 *
 * Classifies errors as transient or permanent to guide retry behavior.
 */

/**
 * Classification of errors for retry decisions
 */
export enum ErrorCategory {
  TRANSIENT = 'transient',     // Temporary failures, should retry
  PERMANENT = 'permanent',     // Permanent failures, move to DLQ immediately
  UNKNOWN = 'unknown'          // Unclassified, default to retry
}

/**
 * Error classification rules: map HTTP status codes and error patterns
 */
export const ERROR_CLASSIFICATION_RULES: {
  statusCodes: number[];
  patterns: RegExp[];
  category: ErrorCategory;
}[] = [
  // Transient errors
  {
    statusCodes: [408, 429, 500, 502, 503, 504],
    patterns: [],
    category: ErrorCategory.TRANSIENT
  },
  {
    patterns: [
      /timeout/i,
      /deadlock/i,
      /connection\s+refused/i,
      /network\s+error/i,
      /redis\s+connection/i,
      /temporarily\s+unavailable/i,
      /service\s+unavailable/i,
      /try\s+again/i
    ],
    statusCodes: [],
    category: ErrorCategory.TRANSIENT
  },
  // Permanent errors
  {
    statusCodes: [400, 401, 403, 404, 422],
    patterns: [],
    category: ErrorCategory.PERMANENT
  },
  {
    patterns: [
      /validation\s+error/i,
      /invalid\s+payload/i,
      /malformed/i,
      /unauthorized/i,
      /forbidden/i,
      /not\s+found/i,
      /quota\s+exceeded/i,
      /rate\s+limit/i,
      /syntax\s+error/i
    ],
    statusCodes: [],
    category: ErrorCategory.PERMANENT
  }
];

/**
 * Classify an error as transient or permanent
 */
export function classifyError(error: unknown): ErrorCategory {
  if (!error) return ErrorCategory.UNKNOWN;

  const err = error as Error;
  const message = err.message?.toLowerCase() || '';
  const name = err.name?.toLowerCase() || '';

  // Check status codes (if available)
  const statusCode = (err as any).statusCode || (err as any).code;
  if (statusCode && typeof statusCode === 'number') {
    for (const rule of ERROR_CLASSIFICATION_RULES) {
      if (rule.statusCodes.includes(statusCode)) {
        return rule.category;
      }
    }
  }

  // Check message patterns
  for (const rule of ERROR_CLASSIFICATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(message) || pattern.test(name)) {
        return rule.category;
      }
    }
  }

  // Database-specific checks
  const anyErr = err as any;
  if (anyErr.code === 'P2002') { // Prisma unique constraint
    // Duplicate key could be either transient (race condition) or permanent (true duplicate)
    // For message upsert, duplicates are handled specially, so treat as permanent
    return ErrorCategory.PERMANENT;
  }

  // Default: treat as transient to be safe
  return ErrorCategory.TRANSIENT;
}
