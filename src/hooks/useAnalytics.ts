/**
 * Analytics Hook
 */

import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '../services/analytics';
import { AnalyticsResult } from '../types';
import { analyticsKeys } from '../lib/queryKeys';

export function useAnalytics(instanceId: string, period: 'day' | 'week' | 'month' = 'week') {
  return useQuery<AnalyticsResult, Error>({
    queryKey: analyticsKeys.byInstance(instanceId, period),
    queryFn: () => analyticsService.fetch(instanceId, period),
    enabled: !!instanceId,
  });
}
