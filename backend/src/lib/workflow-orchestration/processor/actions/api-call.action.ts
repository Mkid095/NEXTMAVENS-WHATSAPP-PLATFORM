/**
 * API Call Action Executor
 *
 * Makes an HTTP API call.
 */

import type { StepExecutionContext, StepExecutionResult } from '../../types';

/**
 * Make an HTTP API call
 */
export async function executeApiCallAction(
  config: Record<string, unknown>,
  context: StepExecutionContext
): Promise<StepExecutionResult> {
  const { url, method = 'POST', headers = {}, body } = config;

  try {
    const response = await fetch(url as string, {
      method: method as string,
      headers: headers as Record<string, string>,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const responseData = await response.json();

    return {
      success: true,
      output: { status: response.status, data: responseData },
      metadata: { url: url as string, method: method as string }
    };
  } catch (error: any) {
    return {
      success: false,
      error: `API call error: ${error.message}`
    };
  }
}
