import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function setupTestData() {
  console.log('[Setup] Creating test user and organization...');

  // Create a test user
  const user = await prisma.user.upsert({
    where: { email: 'test@nextmavens.cloud' },
    update: {},
    create: {
      email: 'test@nextmavens.cloud',
      password: crypto.createHash('sha256').update('testpassword').digest('hex'),
      name: 'Test User',
      role: 'SUPER_ADMIN',
      isActive: true,
      mfaEnabled: false,
    },
  });
  console.log('[Setup] User created:', user.id);

  // Create organization
  const org = await prisma.organization.upsert({
    where: { slug: 'test-org' },
    update: {},
    create: {
      name: 'Test Organization',
      slug: 'test-org',
      email: 'test@nextmavens.cloud',
      plan: 'PRO',
      taxRate: 0,
      taxName: '',
      taxId: '',
    },
  });
  console.log('[Setup] Organization created:', org.id);

  // Create member linking user to org
  await prisma.member.upsert({
    where: {
      userId_orgId: {
        userId: user.id,
        orgId: org.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      orgId: org.id,
      role: 'ORG_ADMIN',
    },
  });
  console.log('[Setup] Member created');

  // Create WhatsApp instance for the org
  const instance = await prisma.whatsappInstance.upsert({
    where: {
      orgId_phoneNumber: {
        orgId: org.id,
        phoneNumber: '+1234567890',
      },
    },
    update: {},
    create: {
      orgId: org.id,
      name: 'Test Instance',
      phoneNumber: '+1234567890',
      status: 'DISCONNECTED',
      token: crypto.randomBytes(32).toString('hex'),
      webhookUrl: 'http://localhost:4930/api/v1/webhooks/whatsapp',
      isPrimary: true,
      heartbeatStatus: 'UNKNOWN',
    },
  });
  console.log('[Setup] WhatsAppInstance created:', instance.id);

  // Generate JWT token
  const JWT_SECRET = process.env.JWT_SECRET!;
  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      orgId: org.id,
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
  console.log('\n[Setup] Test token generated:');
  console.log(token);
  console.log('\n[Setup] Use this token in Authorization header: Bearer ' + token);
  console.log('[Setup] Instance ID for testing:', instance.id);

  await prisma.$disconnect();
}

setupTestData().catch(console.error);
