/**
 * Metrics Service
 *
 * Handles status metrics collection and computation.
 */

import { prisma } from '../../prisma';
import * as promClient from 'prom-client';
import {
  StatusMetrics,
  StatusDistribution,
  StatusTransitionMetrics,
  StatusChangeReason
} from '../types';

// Lazy-loaded metrics
let statusDistributionGauge: promClient.Gauge<string> | null = null;
let statusTransitionCounter: promClient.Counter<string> | null = null;

function getOrCreateMetrics() {
  if (!statusDistributionGauge) {
    statusDistributionGauge = new promClient.Gauge({
      name: 'whatsapp_platform_message_status_total',
      help: 'Current distribution of message statuses',
      labelNames: ['status', 'orgId']
    });
    statusTransitionCounter = new promClient.Counter({
      name: 'whatsapp_platform_message_status_transitions_total',
      help: 'Total status transitions',
      labelNames: ['from', 'to', 'reason']
    });
  }
  return { statusDistributionGauge, statusTransitionCounter };
}

/**
 * Update status distribution metrics (call periodically)
 */
export async function updateStatusMetrics(): Promise<void> {
  try {
    const { statusDistributionGauge } = getOrCreateMetrics();

    const counts = await prisma.whatsAppMessage.groupBy({
      by: ['status'],
      _count: { status: true }
    });

    statusDistributionGauge.reset();
    for (const { status, _count } of counts) {
      statusDistributionGauge.inc({ status, orgId: 'all' }, _count);
    }
  } catch (error) {
    console.warn('[StatusMetrics] Failed to update metrics:', error);
  }
}

/**
 * Get status metrics (distribution and transitions)
 * This is the main function to call for reporting
 */
export async function getStatusMetrics(orgId?: string): Promise<StatusMetrics> {
  try {
    const messageCountWhere: any = {};
    if (orgId) {
      messageCountWhere.orgId = orgId;
    }

    const messageCounts = await prisma.whatsAppMessage.groupBy({
      by: ['status'],
      where: messageCountWhere,
      _count: { status: true }
    });

    const distribution: StatusDistribution = {};
    let totalMessages = 0;
    for (const { status, _count } of messageCounts) {
      distribution[status] = _count.status;
      totalMessages += _count.status;
    }

    // Compute transitions from recent history (7 days, max 10k entries)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const historyWhere: any = {
      changedAt: { gte: sevenDaysAgo }
    };
    if (orgId) {
      historyWhere.message = { orgId };
    }

    const recentHistory = await prisma.messageStatusHistory.findMany({
      where: historyWhere,
      orderBy: { changedAt: 'desc' },
      select: {
        status: true,
        changedAt: true,
        messageId: true
      },
      take: 10000
    });

    // Compute transitions by pairing consecutive entries per message
    const transitions: StatusTransitionMetrics = {};
    const byMessage = new Map<string, typeof recentHistory>();

    for (const entry of recentHistory) {
      const existing = byMessage.get(entry.messageId) || [];
      existing.push(entry);
      byMessage.set(entry.messageId, existing);
    }

    for (const entries of byMessage.values()) {
      const chronological = entries.reverse();
      for (let i = 1; i < chronological.length; i++) {
        const prev = chronological[i - 1];
        const curr = chronological[i];
        const key = `${prev.status}→${curr.status}`;
        transitions[key] = (transitions[key] || 0) + 1;
      }
    }

    // Count by reason
    const reasonWhere: any = {
      changedAt: { gte: sevenDaysAgo }
    };
    if (orgId) {
      reasonWhere.message = { orgId };
    }

    const reasonCounts = await prisma.messageStatusHistory.groupBy({
      by: ['reason'],
      where: reasonWhere,
      _count: { reason: true }
    });

    const byReason: Record<StatusChangeReason, number> = {} as any;
    for (const { reason, _count } of reasonCounts) {
      if (reason) {
        byReason[reason as StatusChangeReason] = _count.reason;
      }
    }

    // Update prometheus gauge if no org filter (global view)
    if (!orgId) {
      const { statusDistributionGauge } = getOrCreateMetrics();
      statusDistributionGauge.reset();
      for (const [status, count] of Object.entries(distribution)) {
        statusDistributionGauge.inc({ status, orgId: 'global' }, count);
      }
    }

    return {
      totalMessages,
      distribution,
      transitions,
      byReason,
      updatedAt: new Date()
    };
  } catch (error) {
    console.error('[StatusMetrics] Failed to compute metrics:', error);
    throw error;
  }
}
