/**
 * Unit Tests - Enforce 2FA for Privileged Roles
 * Tests core library functions with mocked Prisma.
 */

// Mock the prisma module BEFORE importing anything that uses it
const mockedUserFindUnique = jest.fn();
const mockedUserUpdate = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mockedUserFindUnique,
      update: mockedUserUpdate,
    },
  },
}));

// Now import the functions
import {
  generate2FASetup,
  verifyAndEnable2FA,
  verify2FAToken,
  disable2FA,
  is2FAEnabled,
  get2FAStatus,
  isPrivilegedRole,
  PRIVILEGED_ROLES,
  isValidTokenFormat,
} from '../lib/enforce-2fa-for-privileged-roles';

// Import speakeasy for reference
import speakeasy from 'speakeasy';

describe('Enforce 2FA for Privileged Roles - Library', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUserFindUnique.mockReset();
    mockedUserUpdate.mockReset();
  });

  describe('isPrivilegedRole', () => {
    it('returns true for SUPER_ADMIN', () => {
      expect(isPrivilegedRole('SUPER_ADMIN')).toBe(true);
    });

    it('returns true for ORG_ADMIN', () => {
      expect(isPrivilegedRole('ORG_ADMIN')).toBe(true);
    });

    it('returns false for MANAGER', () => {
      expect(isPrivilegedRole('MANAGER')).toBe(false);
    });

    it('returns false for AGENT', () => {
      expect(isPrivilegedRole('AGENT')).toBe(false);
    });

    it('returns false for VIEWER', () => {
      expect(isPrivilegedRole('VIEWER')).toBe(false);
    });

    it('returns false for API_USER', () => {
      expect(isPrivilegedRole('API_USER')).toBe(false);
    });

    it('returns false for unknown role', () => {
      expect(isPrivilegedRole('UNKNOWN_ROLE')).toBe(false);
    });

    it('has correct PRIVILEGED_ROLES constant', () => {
      expect(PRIVILEGED_ROLES).toEqual(['SUPER_ADMIN', 'ORG_ADMIN']);
    });
  });

  describe('isValidTokenFormat', () => {
    it('accepts valid 6-digit token', () => {
      expect(isValidTokenFormat('123456')).toBe(true);
    });

    it('rejects 5-digit token', () => {
      expect(isValidTokenFormat('12345')).toBe(false);
    });

    it('rejects 7-digit token', () => {
      expect(isValidTokenFormat('1234567')).toBe(false);
    });

    it('rejects token with letters', () => {
      expect(isValidTokenFormat('12345a')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidTokenFormat('')).toBe(false);
    });

    it('rejects token with spaces', () => {
      expect(isValidTokenFormat('123 456')).toBe(false);
    });
  });

  describe('generate2FASetup', () => {
    it('generates valid setup data with secret and QR code', async () => {
      const result = await generate2FASetup('user-123', 'test@example.com', 'MyApp');

      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCode');
      expect(result).toHaveProperty('manualEntry');
      expect(result).toHaveProperty('issuer', 'MyApp');
      expect(result).toHaveProperty('label', 'test@example.com');
      expect(result.secret).toMatch(/^[A-Z2-7]+$/); // Base32 pattern
      expect(result.qrCode).toMatch(/^data:image\/png;base64,/);
      expect(result.manualEntry).toBe(result.secret);
    });

    it('uses default issuer when not provided', async () => {
      const result = await generate2FASetup('user-123', 'test@example.com');
      expect(result.issuer).toBe('NEXTMAVENS WhatsApp Platform');
    });

    it('generates QR code with otpauth URL containing secret', async () => {
      const result = await generate2FASetup('user-123', 'test@example.com');
      // We can't decode the QR code easily, but we know it's a valid data URL
      expect(result.qrCode.length).toBeGreaterThan(100);
    });
  });

  describe('verifyAndEnable2FA', () => {
    const userId = 'user-123';
    const validToken = '123456';

    beforeEach(() => {
      mockedUserFindUnique.mockResolvedValue({
        id: userId,
        mfaSecret: 'JBSWY3DPEHPK3PXP',
        mfaEnabled: false,
      });
      mockedUserUpdate.mockResolvedValue({ id: userId, mfaEnabled: true });
    });

    it('enables 2FA for valid token', async () => {
      // Mock speakeasy verification
      const originalVerify = speakeasy.totp.verify;
      // @ts-expect-error - mocking speakeasy
      speakeasy.totp.verify = jest.fn().mockReturnValue(true);

      const result = await verifyAndEnable2FA(userId, validToken);

      expect(result).toBe(true);
      expect(mockedUserUpdate).toHaveBeenCalledWith({
        where: { id: userId },
        data: { mfaEnabled: true },
      });

      // Restore
      // @ts-expect-error
      speakeasy.totp.verify = originalVerify;
    });

    it('returns false for invalid token', async () => {
      const originalVerify = speakeasy.totp.verify;
      // @ts-expect-error
      speakeasy.totp.verify = jest.fn().mockReturnValue(false);

      const result = await verifyAndEnable2FA(userId, 'wrongtoken');

      expect(result).toBe(false);
      expect(mockedUserUpdate).not.toHaveBeenCalled();

      // Restore
      // @ts-expect-error
      speakeasy.totp.verify = originalVerify;
    });

    it('throws error if no pending secret', async () => {
      mockedUserFindUnique.mockResolvedValue({
        id: userId,
        mfaSecret: null,
        mfaEnabled: false,
      });

      await expect(verifyAndEnable2FA(userId, validToken)).rejects.toThrow(
        'No pending 2FA setup'
      );
    });

    it('throws error if already enabled', async () => {
      mockedUserFindUnique.mockResolvedValue({
        id: userId,
        mfaSecret: 'secret123',
        mfaEnabled: true,
      });

      await expect(verifyAndEnable2FA(userId, validToken)).rejects.toThrow(
        '2FA is already enabled for this user.'
      );
    });

    it('throws error if user not found', async () => {
      mockedUserFindUnique.mockResolvedValue(null);

      await expect(verifyAndEnable2FA(userId, validToken)).rejects.toThrow(
        'No pending 2FA setup'
      );
    });
  });

  describe('verify2FAToken', () => {
    const userId = 'user-123';

    beforeEach(() => {
      mockedUserFindUnique.mockResolvedValue({
        id: userId,
        mfaSecret: 'JBSWY3DPEHPK3PXP',
        mfaEnabled: true,
      });
    });

    it('returns true for valid token', async () => {
      const originalVerify = speakeasy.totp.verify;
      // @ts-expect-error
      speakeasy.totp.verify = jest.fn().mockReturnValue(true);

      const result = await verify2FAToken(userId, '123456');

      expect(result).toBe(true);

      // Restore
      // @ts-expect-error
      speakeasy.totp.verify = originalVerify;
    });

    it('returns false for invalid token', async () => {
      const originalVerify = speakeasy.totp.verify;
      // @ts-expect-error
      speakeasy.totp.verify = jest.fn().mockReturnValue(false);

      const result = await verify2FAToken(userId, 'wrongtoken');

      expect(result).toBe(false);

      // Restore
      // @ts-expect-error
      speakeasy.totp.verify = originalVerify;
    });

    it('returns false if user not found', async () => {
      mockedUserFindUnique.mockResolvedValue(null);
      const result = await verify2FAToken(userId, '123456');
      expect(result).toBe(false);
    });

    it('returns false if 2FA not enabled', async () => {
      mockedUserFindUnique.mockResolvedValue({
        id: userId,
        mfaSecret: null,
        mfaEnabled: false,
      });
      const result = await verify2FAToken(userId, '123456');
      expect(result).toBe(false);
    });

    it('returns false if mfaSecret is null', async () => {
      mockedUserFindUnique.mockResolvedValue({
        id: userId,
        mfaSecret: null,
        mfaEnabled: true,
      });
      const result = await verify2FAToken(userId, '123456');
      expect(result).toBe(false);
    });
  });

  describe('disable2FA', () => {
    const userId = 'user-123';
    const validToken = '123456';

    beforeEach(() => {
      mockedUserFindUnique.mockResolvedValue({
        id: userId,
        mfaSecret: 'JBSWY3DPEHPK3PXP',
        mfaEnabled: true,
      });
      mockedUserUpdate.mockResolvedValue({
        id: userId,
        mfaEnabled: false,
        mfaSecret: null,
      });
    });

    it('disables 2FA for valid token', async () => {
      const originalVerify = speakeasy.totp.verify;
      // @ts-expect-error
      speakeasy.totp.verify = jest.fn().mockReturnValue(true);

      const result = await disable2FA(userId, validToken);

      expect(result).toBe(true);
      expect(mockedUserUpdate).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
        },
      });

      // Restore
      // @ts-expect-error
      speakeasy.totp.verify = originalVerify;
    });

    it('throws error for invalid token', async () => {
      const originalVerify = speakeasy.totp.verify;
      // @ts-expect-error
      speakeasy.totp.verify = jest.fn().mockReturnValue(false);

      await expect(disable2FA(userId, 'wrongtoken')).rejects.toThrow(
        'Invalid 2FA token. Cannot disable 2FA.'
      );
      expect(mockedUserUpdate).not.toHaveBeenCalled();

      // Restore
      // @ts-expect-error
      speakeasy.totp.verify = originalVerify;
    });

    it('throws error if 2FA not enabled', async () => {
      mockedUserFindUnique.mockResolvedValue({
        id: userId,
        mfaSecret: null,
        mfaEnabled: false,
      });

      await expect(disable2FA(userId, validToken)).rejects.toThrow(
        'Invalid 2FA token. Cannot disable 2FA.'
      );
    });
  });

  describe('is2FAEnabled', () => {
    it('returns true if user has mfaEnabled', async () => {
      mockedUserFindUnique.mockResolvedValue({ mfaEnabled: true });
      const result = await is2FAEnabled('user-123');
      expect(result).toBe(true);
    });

    it('returns false if user has mfaEnabled false', async () => {
      mockedUserFindUnique.mockResolvedValue({ mfaEnabled: false });
      const result = await is2FAEnabled('user-123');
      expect(result).toBe(false);
    });

    it('returns false if user not found', async () => {
      mockedUserFindUnique.mockResolvedValue(null);
      const result = await is2FAEnabled('user-123');
      expect(result).toBe(false);
    });
  });

  describe('get2FAStatus', () => {
    it('returns correct status for privileged user', async () => {
      mockedUserFindUnique.mockResolvedValue({
        id: 'user-123',
        role: 'SUPER_ADMIN',
        mfaEnabled: true,
      });

      const result = await get2FAStatus('user-123', 'SUPER_ADMIN');

      expect(result).toEqual({
        enabled: true,
        isPrivileged: true,
        requires2FA: true,
      });
    });

    it('returns correct status for non-privileged user', async () => {
      mockedUserFindUnique.mockResolvedValue({
        id: 'user-123',
        role: 'AGENT',
        mfaEnabled: false,
      });

      const result = await get2FAStatus('user-123', 'AGENT');

      expect(result).toEqual({
        enabled: false,
        isPrivileged: false,
        requires2FA: false,
      });
    });

    it('returns correct status for ORG_ADMIN without 2FA', async () => {
      mockedUserFindUnique.mockResolvedValue({
        id: 'user-123',
        role: 'ORG_ADMIN',
        mfaEnabled: false,
      });

      const result = await get2FAStatus('user-123', 'ORG_ADMIN');

      expect(result).toEqual({
        enabled: false,
        isPrivileged: true,
        requires2FA: true,
      });
    });
  });
});

