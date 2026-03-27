export class EvolutionApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'EvolutionApiError';
  }
}

export class EvolutionValidationError extends EvolutionApiError {
  constructor(message: string, details?: unknown) {
    super(message, 422, details);
    this.name = 'EvolutionValidationError';
  }
}

export class EvolutionAuthenticationError extends EvolutionApiError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'EvolutionAuthenticationError';
  }
}

export class EvolutionRateLimitError extends EvolutionApiError {
  constructor(message = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 429, { retryAfter });
    this.name = 'EvolutionRateLimitError';
  }
}

export class EvolutionNotFoundError extends EvolutionApiError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 404);
    this.name = 'EvolutionNotFoundError';
  }
}

export class EvolutionInstanceUnavailableError extends EvolutionApiError {
  constructor(instanceId: string, status: string) {
    super(`Instance ${instanceId} is unavailable (status: ${status})`, 503);
    this.name = 'EvolutionInstanceUnavailableError';
  }
}
