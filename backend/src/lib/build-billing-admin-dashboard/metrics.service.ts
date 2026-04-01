/**
 * Billing Admin Dashboard - Metrics Service
 * Provides aggregated billing metrics and analytics
 */

import { prisma } from '../prisma';
import type { BillingMetrics } from './types';

/**
 * Get comprehensive billing metrics for dashboard
 */
export async function getBillingMetrics(): Promise<BillingMetrics> {
  // Revenue by month (last 12 months)
  const revenueByMonth: { month: Date; revenueCents: number | null }[] = await prisma.$queryRaw`
    SELECT
      DATE_TRUNC('month', paid_at) as month,
      SUM(amount) as "revenueCents"
    FROM invoices
    WHERE status = 'PAID' AND paid_at IS NOT NULL
    GROUP BY DATE_TRUNC('month', paid_at)
    ORDER BY month DESC
    LIMIT 12
  `;

  // Top orgs by revenue
  const topOrgs: { org_id: string; revenueCents: number }[] = await prisma.$queryRaw`
    SELECT
      org_id,
      SUM(amount) as "revenueCents"
    FROM invoices
    WHERE status = 'PAID'
    GROUP BY org_id
    ORDER BY "revenueCents" DESC
    LIMIT 10
  `;

  // Get org names for top orgs
  const orgIds = topOrgs.map((row: any) => row.org_id);
  const orgs = await prisma.organization.findMany({
    where: { id: { in: orgIds } },
    select: { id: true, name: true },
  });
  const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

  // Invoice status distribution
  const statusDist = await prisma.invoice.groupBy({
    by: ['status'],
    _count: { status: true },
  });

  // Average time to pay (in days) - only for paid invoices
  const avgDaysResult = await prisma.$queryRaw<Array<{ avgDays: number }>>`
    SELECT AVG(DATE_PART('day', paid_at - created_at)) as "avgDays"
    FROM invoices
    WHERE status = 'PAID' AND paid_at IS NOT NULL
  `;
  const averageTimeToPayDays = avgDaysResult[0]?.avgDays || null;

  return {
    revenueByMonth: revenueByMonth.map((row: any) => ({
      month: row.month.toISOString().slice(0, 7), // YYYY-MM
      revenueCents: Number(row.revenueCents || 0),
    })),
    topOrgsByRevenue: topOrgs
      .map((row: any) => ({
        orgId: row.org_id,
        orgName: orgMap.get(row.org_id) || 'Unknown',
        revenueCents: Number(row.revenueCents),
      }))
      .filter((o: any) => o.revenueCents > 0),
    invoiceStatusDistribution: statusDist.map((s: any) => ({
      status: s.status,
      count: s._count.status,
    })),
    averageTimeToPayDays: averageTimeToPayDays ? Math.round(averageTimeToPayDays * 10) / 10 : null,
  };
}
