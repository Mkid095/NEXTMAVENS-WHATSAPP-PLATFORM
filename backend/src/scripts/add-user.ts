import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createUser() {
  try {
    const email = 'revccnt@gmail.com';
    const hashedPassword = '\$2b\$10\$FjOGJmUo1bMMSDq3jO6RbuLbJnVSWrvM8UC1mErysSoUFcVFU4nem'; // pre-computed bcrypt hash
    const orgId = 'org_test_001';

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: { email }
    });

    if (existingUser) {
      console.log(`User ${email} already exists with ID: ${existingUser.id}`);
      console.log('Password hash:', existingUser.password);
      return;
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: 'Rev CC',
        role: 'AGENT',
        isActive: true,
        mfaEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });

    console.log(`✅ Created user: ${user.id} (${email})`);

    // Link user to organization
    const member = await prisma.member.create({
      data: {
        userId: user.id,
        orgId,
        role: 'AGENT',
      }
    });

    console.log(`✅ Created member record linking user to org "${orgId}"`);

    // Verify
    const verify = await prisma.user.findUnique({
      where: { id: user.id },
      include: { members: true }
    });

    console.log('\n📋 User created successfully:');
    console.log('Email:', email);
    console.log('Password: Elishiba@95 (hash stored)');
    console.log('Role: AGENT');
    console.log('Organization:', orgId);
    console.log('\n⚠️  NOTE: Login endpoint needs to be implemented to use these credentials');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createUser();
