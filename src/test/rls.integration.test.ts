import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * CRITICAL: Integration tests for Row Level Security (RLS)
 *
 * These tests verify that tenant isolation works correctly.
 * Run after applying RLS migration.
 *
 * Test scenarios:
 * 1. RLS is enabled on all tenant tables
 * 2. Regular user can only see own org's data
 * 3. Cross-org access is blocked
 * 4. SUPER_ADMIN can see all orgs
 * 5. INSERTs respect org_id from RLS context
 */

// Test data
const TEST_ORG_1 = 'org_11111111-1111-1111-1111-111111111111';
const TEST_ORG_2 = 'org_22222222-2222-2222-2222-222222222222';
const TEST_USER_1 = 'user_11111111-1111-1111-1111-111111111111';
const TEST_USER_2 = 'user_22222222-2222-2222-2222-222222222222';

describe('RLS Integration Tests', () => {
  before(async () => {
    console.log('\n🧪 Starting RLS Integration Tests...');

    // Ensure clean state
    await cleanup();
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // Reset session variables before each test to ensure clean state
  beforeEach(async () => {
    await prisma.$executeRaw`SELECT set_config('app.current_user_role', NULL, false)`;
    await prisma.$executeRaw`SELECT set_config('app.current_org', NULL, false)`;
  });

  it('should have RLS enabled on all tenant tables', async () => {
    const tablesRequiringRLS = [
      'organizations',
      'members',
      'whatsapp_instances',
      'whatsapp_messages',
      'whatsapp_chats',
      'whatsapp_templates',
      'whatsapp_agents',
      'whatsapp_assignments',
      'webhook_subscriptions',
      'webhook_delivery_logs',
      'quota_usages',
      'invoices',
      'invoice_items',
      'payments',
      'audit_logs',
    ];

    for (const table of tablesRequiringRLS) {
      const result = await prisma.$queryRaw`
        SELECT relname, relrowsecurity as rls_enabled
        FROM pg_class
        WHERE relname = ${table}
      `;

      assert(
        result && (result as any).length > 0,
        `Table ${table} exists`
      );

      const rlsEnabled = (result as any)[0].rls_enabled;
      assert.strictEqual(
        rlsEnabled,
        true,
        `RLS should be enabled on table ${table}`
      );
    }

    console.log('✅ All tenant tables have RLS enabled');
  });

  it('should have correct policies for org isolation', async () => {
    const tablesWithExpectedPolicies = [
      'organizations',
      'whatsapp_messages',
      'whatsapp_chats',
      'webhook_subscriptions',
    ];

    for (const table of tablesWithExpectedPolicies) {
      const policies = await prisma.$queryRaw`
        SELECT polname, polcmd
        FROM pg_policy
        WHERE polrelid = ${table}::regclass
      `;

      const policyNames = (policies as any).map((p: any) => p.polname);

      // Should have admin bypass and tenant isolation policies
      assert(
        policyNames.some((name: string) => name.includes('admin_bypass')),
        `Table ${table} should have admin_bypass policy`
      );
      assert(
        policyNames.some((name: string) => name.includes('tenant_isolation')),
        `Table ${table} should have tenant_isolation policy`
      );
    }

    console.log('✅ All tables have correct RLS policies');
  });

  it('should filter queries by org context when set', async () => {
    // Setup: Create orgs, members, instances using a transaction with SUPER_ADMIN role
    await prisma.$transaction(async (tx) => {
      // Set SUPER_ADMIN role for this connection
      await tx.$executeRaw`SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)`;

      await tx.organization.create({
        data: {
          id: TEST_ORG_1,
          name: 'Test Org 1',
          slug: 'test-org-1',
        },
      });

      await tx.organization.create({
        data: {
          id: TEST_ORG_2,
          name: 'Test Org 2',
          slug: 'test-org-2',
        },
      });

      // Create test user for member relationship
      await tx.user.create({
        data: {
          id: TEST_USER_1,
          email: 'user1@test.com',
          password: 'testpassword',
          role: 'ORG_ADMIN',
        },
      });

      await tx.member.create({
        data: {
          id: 'member_1',
          userId: TEST_USER_1,
          orgId: TEST_ORG_1,
          role: 'ORG_ADMIN',
        },
      });

      await tx.whatsAppInstance.create({
        data: {
          id: 'instance_1',
          orgId: TEST_ORG_1,
          name: 'Org 1 Instance',
          phoneNumber: '+1234567890',
          status: 'CONNECTED',
        },
      });

      await tx.whatsAppInstance.create({
        data: {
          id: 'instance_2',
          orgId: TEST_ORG_2,
          name: 'Org 2 Instance',
          phoneNumber: '+0987654321',
          status: 'CONNECTED',
        },
      });
    });

    // Switch to regular user role (ORG_ADMIN) for the test
    await prisma.$executeRaw`SELECT set_config('app.current_user_role', 'ORG_ADMIN', false)`;

    // Test: Set RLS context to org 1
    await prisma.$executeRaw`
      SELECT set_config('app.current_org', ${TEST_ORG_1}, false)
    `;

    // Query: Should only return Org 1's instances
    const org1Instances = await prisma.whatsAppInstance.findMany({
      where: {}, // No filter - RLS adds org filter automatically
    });

    assert.strictEqual(
      org1Instances.length,
      1,
      'Should return exactly 1 instance (Org 1 only)'
    );
    assert.strictEqual(
      org1Instances[0].id,
      'instance_1',
      'Should return Org 1 instance'
    );

    console.log('✅ RLS correctly filters data by org context');
  });

  it('should block cross-org access completely', async () => {
    // Set RLS context to org 1
    await prisma.$executeRaw`
      SELECT set_config('app.current_org', ${TEST_ORG_1}, false)
    `;

    // Try to directly query for org 2's data (bypassing app-level filter)
    // Even if WHERE clause specifies org_2, RLS OVERRIDES it
    const org2DataAttempt = await prisma.whatsAppInstance.findFirst({
      where: {
        orgId: TEST_ORG_2, // Explicitly asking for Org 2
      },
    });

    // Should return NULL because RLS blocks it
    assert.strictEqual(
      org2DataAttempt,
      null,
      'Cross-org access blocked: cannot see Org 2 data when context is Org 1'
    );

    console.log('✅ Cross-org access blocked');
  });

  it('should allow SUPER_ADMIN to bypass RLS', async () => {
    // For SUPER_ADMIN, set both role and org context
    // Bypass policy checks: app.current_user_role = 'SUPER_ADMIN'
    await prisma.$executeRaw`
      SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)
    `;
    // Optional: org context can be NULL or any value; doesn't matter for superadmin
    await prisma.$executeRaw`
      SELECT set_config('app.current_org', NULL, false)
    `;

    // Query: Should return both orgs' instances (bypass enabled)
    const allInstances = await prisma.whatsAppInstance.findMany({
      where: {},
    });

    assert.strictEqual(
      allInstances.length,
      2,
      'SUPER_ADMIN should see all instances from all orgs'
    );

    const orgIds = allInstances.map(i => i.orgId).sort();
    assert.deepStrictEqual(
      orgIds,
      [TEST_ORG_1, TEST_ORG_2],
      'SUPER_ADMIN sees both orgs'
    );

    console.log('✅ SUPER_ADMIN bypass works');
  });

  it('should enforce org_id on INSERTs via WITH CHECK policy', async () => {
    // Set context to Org 1
    await prisma.$executeRaw`
      SELECT set_config('app.current_org', ${TEST_ORG_1}, false)
    `;

    // Create a chat to satisfy FK constraint
    await prisma.whatsAppChat.create({
      data: {
        id: 'chat_rls_malicious',
        orgId: TEST_ORG_1,
        instanceId: 'instance_1',
        chatId: 'chat_rls_malicious',
        phone: '+1234567890',
      },
    });

    // Try to INSERT a WhatsApp message with different org_id
    // Should fail because WITH CHECK policy rejects it
    let insertError: Error | null = null;
    try {
      await prisma.whatsAppMessage.create({
        data: {
          id: 'msg_test',
          orgId: TEST_ORG_2, // Malicious: trying to write to Org 2
          instanceId: 'instance_1',
          chatId: 'chat_rls_malicious',
          messageId: 'whatsapp_msg_123',
          from: '+1234567890',
          to: '+0987654321',
          type: 'text',
          content: { body: 'Test message' },
          status: 'PENDING',
        },
      });
    } catch (error: any) {
      insertError = error;
    }

    assert(
      insertError !== null,
      'INSERT with wrong org_id should fail'
    );
    assert(
      insertError?.message.includes('violates row-level security policy') ||
        insertError?.code === '42501',
      'Error should be RLS violation (42501)'
    );

    console.log('✅ INSERT enforcement via WITH CHECK works');
  });

  it('should allow INSERT with correct org_id', async () => {
    // Set context to Org 1
    await prisma.$executeRaw`
      SELECT set_config('app.current_org', ${TEST_ORG_1}, false)
    `;

    // Create a chat to satisfy FK constraint
    await prisma.whatsAppChat.create({
      data: {
        id: 'chat_rls_valid',
        orgId: TEST_ORG_1,
        instanceId: 'instance_1',
        chatId: 'chat_rls_valid',
        phone: '+1234567890',
      },
    });

    // INSERT with correct org_id should succeed
    const msg = await prisma.whatsAppMessage.create({
      data: {
        id: 'msg_test_valid',
        orgId: TEST_ORG_1, // Correct org
        instanceId: 'instance_1',
        chatId: 'chat_rls_valid',
        messageId: 'whatsapp_msg_valid',
        from: '+1234567890',
        to: '+0987654321',
        type: 'text',
        content: { body: 'Valid test message' },
        status: 'PENDING',
      },
    });

    assert.ok(msg.id, 'INSERT with correct org_id should succeed');

    // Verify it's readable
    const retrieved = await prisma.whatsAppMessage.findUnique({
      where: { id: 'msg_test_valid' },
    });
    assert.ok(retrieved, 'Message should be retrievable');
    assert.strictEqual(retrieved?.orgId, TEST_ORG_1);

    console.log('✅ INSERT with correct org_id succeeds');
  });

  it('should maintain isolation across multiple queries in same session', async () => {
    // Create a dedicated org and data for THIS test to avoid dependencies
    const testOrgId = 'org_isolate_' + Date.now();
    const testInstanceId = 'instance_isolate_' + Date.now();
    const testChatId = 'chat_isolate_' + Date.now();
    const testMsgId = 'msg_isolate_' + Date.now();
    const testUserId = 'user_isolate_' + Date.now();

    // Run everything in a single transaction to ensure same DB connection
    await prisma.$transaction(async (tx) => {
      // Create test data with SUPER_ADMIN bypass
      await tx.$executeRaw`SELECT set_config('app.current_user_role', 'SUPER_ADMIN', false)`;

      await tx.organization.create({
        data: { id: testOrgId, name: 'Isolation Test Org', slug: 'isolation-test-org' },
      });

      await tx.user.create({
        data: { id: testUserId, email: 'isolate@test.com', password: 'test', role: 'ORG_ADMIN' },
      });

      await tx.member.create({
        data: { id: 'member_isolate', userId: testUserId, orgId: testOrgId, role: 'ORG_ADMIN' },
      });

      await tx.whatsAppInstance.create({
        data: {
          id: testInstanceId,
          orgId: testOrgId,
          name: 'Isolation Instance',
          phoneNumber: '+1111111111',
          status: 'CONNECTED',
        },
      });

      await tx.whatsAppChat.create({
        data: {
          id: testChatId,
          orgId: testOrgId,
          instanceId: testInstanceId,
          chatId: 'whatsapp_chat_' + Date.now(),
          phone: '+1111111111',
        },
      });

      await tx.whatsAppMessage.create({
        data: {
          id: testMsgId,
          orgId: testOrgId,
          instanceId: testInstanceId,
          chatId: testChatId,
          messageId: 'whatsapp_msg_' + Date.now(),
          from: '+1111111111',
          to: '+2222222222',
          type: 'text',
          content: { body: 'Test message' },
          status: 'PENDING',
        },
      });

      // Switch to regular user role (not SUPER_ADMIN) and set org context
      await tx.$executeRaw`SELECT set_config('app.current_user_role', NULL, false)`;
      await tx.$executeRaw`SELECT set_config('app.current_org', ${testOrgId}, false)`;

      // Now run multiple queries on the same connection - all should use the same RLS context
      const instanceCount = await tx.whatsAppInstance.count();
      const messageCount = await tx.whatsAppMessage.count();
      const chatCount = await tx.whatsAppChat.count();

      assert.strictEqual(instanceCount, 1, 'Instance count for test org');
      assert.strictEqual(messageCount, 1, 'Message count for test org');
      assert.strictEqual(chatCount, 1, 'Chat count for test org');

      console.log('✅ Isolation maintained across multiple queries');
    });
  });

  it('should NOT leak org context between different sessions', async () => {
    // Create a separate Prisma client (simulates different request)
    const prisma2 = new PrismaClient();

    // Without setting RLS context, query should return ZERO rows
    // (because app.current_org is NULL and tenant policies require non-NULL)
    const noContext = await prisma2.whatsAppInstance.findMany();
    assert.strictEqual(
      noContext.length,
      0,
      'Without RLS context, no data should be visible (NULL fails policy)'
    );

    // Even if we try to query by orgId directly, it's filtered
    const byOrg1 = await prisma2.whatsAppInstance.findFirst({
      where: { orgId: TEST_ORG_1 },
    });
    assert.strictEqual(
      byOrg1,
      null,
      'Cannot query by orgId directly - RLS overrides'
    );

    await prisma2.$disconnect();
    console.log('✅ No context leakage between sessions');
  });
});

// ┌─────────────────────────────────────────────────────────────┐
// │ Helper Functions                                            │
// └─────────────────────────────────────────────────────────────┘

async function cleanup() {
  console.log('🧹 Running cleanup...');
  try {
    // Clean up ALL tables using raw SQL with CASCADE to handle all FKs
    await prisma.$executeRaw`
      DO $$
      BEGIN
        TRUNCATE TABLE audit_logs CASCADE;
        TRUNCATE TABLE payments CASCADE;
        TRUNCATE TABLE invoice_items CASCADE;
        TRUNCATE TABLE invoices CASCADE;
        TRUNCATE TABLE quota_usages CASCADE;
        TRUNCATE TABLE webhook_delivery_logs CASCADE;
        TRUNCATE TABLE webhook_subscriptions CASCADE;
        TRUNCATE TABLE whatsapp_assignments CASCADE;
        TRUNCATE TABLE whatsapp_agents CASCADE;
        TRUNCATE TABLE whatsapp_messages CASCADE;
        TRUNCATE TABLE whatsapp_chats CASCADE;
        TRUNCATE TABLE whatsapp_templates CASCADE;
        TRUNCATE TABLE whatsapp_instances CASCADE;
        TRUNCATE TABLE members CASCADE;
        TRUNCATE TABLE users CASCADE;
        TRUNCATE TABLE organizations CASCADE;
      END
      $$;
    `;
    console.log('✅ Cleanup completed');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
}
