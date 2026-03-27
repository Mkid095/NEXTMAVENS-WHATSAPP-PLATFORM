import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addUserToOrg() {
  try {
    const email = 'revccnt@gmail.com';
    const orgId = 'org_test_001';

    // Find user
    const user = await prisma.user.findFirst({
      where: { email }
    });

    if (!user) {
      console.error(`❌ User ${email} not found`);
      return;
    }

    console.log(`Found user: ${user.id}`);

    // Check if membership already exists
    const existingMember = await prisma.member.findFirst({
      where: {
        userId: user.id,
        orgId: orgId
      }
    });

    if (existingMember) {
      console.log(`User already member of org ${orgId}`);
      return;
    }

    // Create membership
    const member = await prisma.member.create({
      data: {
        userId: user.id,
        orgId,
        role: 'AGENT',
      }
    });

    console.log(`✅ Added user to org ${orgId} with role AGENT`);
    console.log(`Member ID: ${member.id}`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addUserToOrg();
