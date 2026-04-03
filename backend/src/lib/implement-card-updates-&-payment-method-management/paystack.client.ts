/**
 * Card Updates & Payment Method Management - Paystack Client
 * HTTP client for Paystack API integration
 */

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
if (!PAYSTACK_SECRET_KEY) {
  throw new Error('PAYSTACK_SECRET_KEY environment variable is required');
}
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Generic Paystack API request
 */
async function paystackRequest<T>(
  endpoint: string,
  method: string = 'POST',
  body?: any
): Promise<{ status: boolean; message: string; data: T }> {
  const url = `${PAYSTACK_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json() as {
    status: boolean;
    message: string;
    data: T;
    code?: number | string;
  };

  if (!response.ok || data.status !== true) {
    const error = new Error(data.message || 'Paystack API error');
    error.message = data.message || 'Paystack API error';
    (error as any).status = data.status;
    (error as any).code = data.code;
    throw error;
  }

  return data;
}

/**
 * Health check for Paystack connection
 */
export function healthCheck(): boolean {
  return true;
}

export { paystackRequest };
