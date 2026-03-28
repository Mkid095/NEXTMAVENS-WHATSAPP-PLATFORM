/**
 * Unit Tests for useCachedQR Exponential Backoff Logic
 *
 * Tests the backoff algorithm and polling continuation logic.
 * Run: npx tsx src/test/use-cached-qr-backoff.unit.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'assert';
import { calculateBackoff, shouldContinuePolling } from '../lib/cachedQRBackoff';

describe('cachedQRBackoff', () => {
  describe('calculateBackoff', () => {
    it('should return 1000ms for retryCount 0 (first retry)', () => {
      assert.strictEqual(calculateBackoff(0), 1000);
    });

    it('should double interval with each retry', () => {
      assert.strictEqual(calculateBackoff(1), 2000);
      assert.strictEqual(calculateBackoff(2), 4000);
      assert.strictEqual(calculateBackoff(3), 8000);
      assert.strictEqual(calculateBackoff(4), 16000);
    });

    it('should cap at max 30000ms', () => {
      assert.strictEqual(calculateBackoff(5), 30000);
      assert.strictEqual(calculateBackoff(6), 30000);
      assert.strictEqual(calculateBackoff(10), 30000);
    });

    it('should throw for negative retryCount', () => {
      assert.throws(() => calculateBackoff(-1), { message: 'retryCount must be non-negative' });
    });
  });

  describe('shouldContinuePolling', () => {
    it('should continue polling when status is CONNECTING', () => {
      assert.strictEqual(shouldContinuePolling('CONNECTING'), true);
    });

    it('should stop polling when status is CONNECTED', () => {
      assert.strictEqual(shouldContinuePolling('CONNECTED'), false);
    });

    it('should stop polling when status is ERROR', () => {
      assert.strictEqual(shouldContinuePolling('ERROR'), false);
    });

    it('should continue polling when status is undefined (no data yet)', () => {
      assert.strictEqual(shouldContinuePolling(undefined), true);
    });

    it('should continue polling when status is DISCONNECTED (intermediate state)', () => {
      assert.strictEqual(shouldContinuePolling('DISCONNECTED'), true);
    });

    it('should continue polling for any other non-terminal status', () => {
      assert.strictEqual(shouldContinuePolling('CREATING'), true);
      assert.strictEqual(shouldContinuePolling('QR_READY'), true);
    });
  });
});
