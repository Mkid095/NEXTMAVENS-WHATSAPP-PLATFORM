/**
 * Custom Error Classes
 *
 * Provides domain-specific error types with appropriate HTTP status codes.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: any;

  constructor(message: string, statusCode: number, code: string, details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
    };
  }
}

// Authentication & Authorization Errors
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', details?: any) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', details?: any) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class TokenExpiredError extends AppError {
  constructor(message: string = 'Token expired') {
    super(message, 401, 'TOKEN_EXPIRED');
  }
}

// Validation Errors
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

// Resource Errors
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', details?: any) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', details?: any) {
    super(message, 409, 'CONFLICT', details);
  }
}

// Rate Limiting & Quota Errors
export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', details?: any) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
  }
}

export class QuotaExceededError extends AppError {
  constructor(message: string = 'Quota exceeded', details?: any) {
    super(message, 429, 'QUOTA_EXCEEDED', details);
  }
}

// Business Logic Errors
export class PaymentRequiredError extends AppError {
  constructor(message: string = 'Payment required', details?: any) {
    super(message, 402, 'PAYMENT_REQUIRED', details);
  }
}

export class FeatureDisabledError extends AppError {
  constructor(message: string = 'Feature is disabled', details?: any) {
    super(message, 403, 'FEATURE_DISABLED', details);
  }
}

// Server Errors
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', details?: any) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service unavailable', details?: any) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
  }
}

// Webhook Errors
export class WebhookVerificationError extends AppError {
  constructor(message: string = 'Webhook verification failed') {
    super(message, 400, 'WEBHOOK_VERIFICATION_FAILED');
  }
}

// Socket Errors
export class SocketAuthError extends AppError {
  constructor(message: string = 'Socket authentication failed', code: string = 'SOCKET_AUTH_FAILED') {
    super(message, 401, code);
  }
}
