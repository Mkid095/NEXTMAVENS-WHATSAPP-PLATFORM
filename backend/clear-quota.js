/**
 * Script to clear quota usage for all orgs or a specific org
 * Run with: node clear-quota.js [orgId?]
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearQuota(orgId) {
  try {
    const where = orgId ? { orgId } : {};
    const result = await prisma.quotaUsage.deleteMany({ where });
    console.log(`Deleted ${result.count} quota usage records${orgId ? ` for org ${orgId}` : ''}`);
  } catch (error) {
    console.error('Failed to clear quota:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const orgId = process.argv[2];
clearQuota(orgId).then(() => console.log('Done'));
