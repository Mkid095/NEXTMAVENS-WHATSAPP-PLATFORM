import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sign, verify } from 'jsonwebtoken';
import { prisma } from '../../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

interface LoginRequest {
  email: string;
  password: string;
}

// Authentication routes plugin
export default async function (fastify: FastifyInstance) {
  // POST /api/v1/auth/login - User login
  fastify.post<{ Body: LoginRequest }>('/auth/login', {
    // Validation will be handled inside handler with Zod
  }, async (request, reply) => {
    // Validate request body first
    const validationResult = loginSchema.safeParse(request.body);
    if (!validationResult.success) {
      return reply.status(400).send({
        success: false,
        message: 'Validation error',
        errors: validationResult.error.issues.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
    }

    const { email, password } = validationResult.data;

    try {
      console.log(`[Auth] Login attempt for: ${email}`);

      // Find user with password
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          password: true,
          name: true,
          role: true,
          isActive: true,
          mfaEnabled: true,
        },
      });

      if (!user) {
        console.log(`[Auth] User not found: ${email}`);
        return reply.status(401).send({
          success: false,
          message: 'Invalid email or password',
        });
      }

      if (!user.isActive) {
        console.log(`[Auth] Inactive user: ${email}`);
        return reply.status(401).send({
          success: false,
          message: 'Account is deactivated',
        });
      }

      // Verify password
      const bcrypt = await import('bcryptjs');
      const isValid = await bcrypt.compare(password, user.password);

      if (!isValid) {
        console.log(`[Auth] Invalid password for: ${email}`);
        return reply.status(401).send({
          success: false,
          message: 'Invalid email or password',
        });
      }

      // Get user's organization(s)
      const memberships = await prisma.member.findMany({
        where: { userId: user.id },
        select: { orgId: true, role: true },
      });

      if (memberships.length === 0) {
        console.log(`[Auth] User has no organization: ${email}`);
        return reply.status(403).send({
          success: false,
          message: 'No organization assigned. Please contact your administrator.',
        });
      }

      // Use first org (in future, could let user select)
      const primaryOrg = memberships[0];

      // Generate JWT
      const payload = {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: primaryOrg.orgId,
      };

      const token = sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY as any });
      const refreshToken = sign(
        { userId: user.id, orgId: primaryOrg.orgId },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: JWT_REFRESH_EXPIRY as any }
      );

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });

      console.log(`[Auth] Login successful: ${email} (${user.id})`);

      // Return token and user info (without password)
      const { password: _, ...userWithoutPassword } = user;

      return {
        success: true,
        data: {
          token,
          refreshToken,
          user: {
            ...userWithoutPassword,
            orgId: primaryOrg.orgId,
            orgRole: primaryOrg.role,
          },
        },
      };
    } catch (error) {
      console.error('[Auth] Login error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Internal server error',
      });
    }
  });

  // POST /api/v1/auth/refresh - Refresh access token
  fastify.post('/auth/refresh', async (request, reply) => {
    try {
      const { refreshToken } = (request.body as any) || {};

      if (!refreshToken) {
        return reply.status(400).send({
          success: false,
          message: 'Refresh token required',
        });
      }

      const payload = verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;

      // Get user to verify still exists and get org
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, name: true, role: true },
      });

      if (!user) {
        return reply.status(401).send({
          success: false,
          message: 'Invalid refresh token',
        });
      }

      // Get primary org
      const membership = await prisma.member.findFirst({
        where: { userId: user.id },
        select: { orgId: true, role: true },
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          message: 'No organization assigned',
        });
      }

      // Generate new access token
      const token = sign(
        {
          userId: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          orgId: membership.orgId,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY as any }
      );

      return {
        success: true,
        data: { token },
      };
    } catch (error: any) {
      if (error.name === 'JsonWebTokenError') {
        return reply.status(401).send({
          success: false,
          message: 'Invalid refresh token',
        });
      }
      if (error.name === 'TokenExpiredError') {
        return reply.status(401).send({
          success: false,
          message: 'Refresh token expired',
        });
      }
      console.error('[Auth] Refresh error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Internal server error',
      });
    }
  });

  // POST /api/v1/auth/logout - Logout (client-side token removal)
  fastify.post('/auth/logout', async (request, reply) => {
    return { success: true, message: 'Logged out' };
  });

  // GET /api/v1/auth/me - Get current user from token
  fastify.get('/auth/me', async (request, reply) => {
    try {
      const authHeader = request.headers.authorization as string | undefined;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          success: false,
          message: 'No token provided',
        });
      }

      const token = authHeader.slice(7);
      const payload = verify(token, JWT_SECRET) as any;

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          mfaEnabled: true,
          createdAt: true,
        },
      });

      if (!user || !user.isActive) {
        return reply.status(401).send({
          success: false,
          message: 'User not found or deactivated',
        });
      }

      return {
        success: true,
        data: { user },
      };
    } catch (error: any) {
      if (error.name === 'JsonWebTokenError') {
        return reply.status(401).send({ success: false, message: 'Invalid token' });
      }
      if (error.name === 'TokenExpiredError') {
        return reply.status(401).send({ success: false, message: 'Token expired' });
      }
      throw error;
    }
  });
}
