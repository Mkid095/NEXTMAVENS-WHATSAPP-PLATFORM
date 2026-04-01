/**
 * Feature Management Types
 * Provides type definitions for the feature flag system
 */

export type FeatureFlagKey =
  | 'billing_enabled'
  | 'payments_enabled'
  | 'invoices_enabled'
  | 'usage_billing_enabled'
  | 'tax_enabled'
  | 'coupons_enabled';

export interface FeatureFlag {
  id: string;
  key: FeatureFlagKey;
  name: string;
  description?: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationFeatureFlag {
  id: string;
  orgId: string;
  featureKey: FeatureFlagKey;
  enabled: boolean | null; // null = inherit from global
  createdAt: Date;
  updatedAt: Date;
}

export interface FeatureCheckResult {
  enabled: boolean;
  reason: 'global' | 'org_override' | 'inherited' | 'disabled';
}

export interface FeatureFlagWithOverride extends FeatureFlag {
  orgOverride?: {
    id: string;
    orgId: string;
    enabled: boolean | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface AdminFeatureListResponse {
  featureKey: FeatureFlagKey;
  name: string;
  description?: string;
  globalEnabled: boolean;
  orgOverrides: Array<{
    orgId: string;
    orgName: string;
    enabled: boolean | null; // null means inherits global
  }>;
}
