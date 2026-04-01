/**
 * Paystack HTTP Client
 * Low-level HTTP client for Paystack API
 */

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
if (!PAYSTACK_SECRET_KEY) {
  throw new Error('PAYSTACK_SECRET_KEY environment variable is required');
}

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

/**
 * Make authenticated request to Paystack API
 */
export async function paystackRequest<T>(
  endpoint: string,
  method: string = 'POST',
  body?: any
): Promise<{ status: boolean; message: string; data: T }> {
  const url = `${PAYSTACK_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
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
  const data = await response.json() as any;

  if (!response.ok || data.status !== true) {
    const error = new Error(data.message || 'Paystack API error');
    (error as any).status = data.status;
    (error as any).code = data.code;
    throw error;
  }

  return data as { status: boolean; message: string; data: T };
}
