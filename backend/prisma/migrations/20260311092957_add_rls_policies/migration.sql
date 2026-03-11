-- Migration: Add Row Level Security (RLS) Policies for Multi-Tenancy
-- Date: 2025-03-11
-- Purpose: Ensure complete data isolation between organizations
-- CRITICAL: This migration enforces tenant isolation at database level

-- ┌─────────────────────────────────────────────────────────────┐
-- │ Step 1: Enable RLS on All Tenant Tables                     │
-- └─────────────────────────────────────────────────────────────┘

-- Organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Multi-tenancy linking users to orgs
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- WhatsApp-specific tables
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_assignments ENABLE ROW LEVEL SECURITY;

-- Webhook tables
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Quota & billing tables
ALTER TABLE quota_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Audit logs (org-scoped, but SUPER_ADMIN can see all)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ┌─────────────────────────────────────────────────────────────┐
-- │ Step 1b: Force RLS to Apply Even to Table Owners            │
-- └─────────────────────────────────────────────────────────────┘
-- Without FORCE, table owners bypass RLS. This forces enforcement.
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE members FORCE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_instances FORCE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_chats FORCE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_agents FORCE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_delivery_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE quota_usages FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_items FORCE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- ┌─────────────────────────────────────────────────────────────┐
-- │ Step 2: Create Bypass Policy for SUPER_ADMIN               │
-- └─────────────────────────────────────────────────────────────┘
-- SUPER_ADMIN can access ALL rows in ALL tables (no filtering)

CREATE POLICY admin_bypass_organizations ON organizations USING (current_setting('app.current_user_role', true) = 'SUPER_ADMIN');
CREATE POLICY admin_bypass_members ON members USING (current_setting('app.current_user_role', true) = 'SUPER_ADMIN');
CREATE POLICY admin_bypass_whatsapp_instances ON whatsapp_instances USING (current_setting('app.current_user_role', true) = 'SUPER_ADMIN');
CREATE POLICY admin_bypass_whatsapp_messages ON whatsapp_messages USING (current_setting('app.current_user_role', true) = 'SUPER_ADMIN');
CREATE POLICY admin_bypass_whatsapp_chats ON whatsapp_chats USING (current_setting('app.current_user_role', true) = 'SUPER_ADMIN');
CREATE POLICY admin_bypass_whatsapp_templates ON whatsapp_templates USING (current_setting('app.current_user_role', true) = 'SUPER_ADMIN');
CREATE POLICY admin_bypass_whatsapp_agents ON whatsapp_agents USING (current_setting('app.current_user_role', true) = 'SUPER_ADMIN');
CREATE POLICY admin_bypass_whatsapp_assignments ON whatsapp_assignments USING (current_setting('app.current_user_role', true) = 'SUPER_ADMIN');
CREATE POLICY admin_bypass_webhook_subscriptions ON webhook_subscriptions USING (current_setting('app.current_user_role', true) = 'SUPER_ADMIN');
CREATE POLICY admin_bypass_webhook_delivery_logs ON webhook_delivery_logs USING (current_setting('app.current_user_role', true) = 'SUPER_ADMIN');
CREATE POLICY admin_bypass_quota_usages ON quota_usages USING (current_setting('app.current_user_role', true) = 'SUPER_ADMIN');
CREATE POLICY admin_bypass_invoices ON invoices USING (current_setting('app.current_user_role', true) = 'SUPER_ADMIN');
CREATE POLICY admin_bypass_invoice_items ON invoice_items USING (current_setting('app.current_user_role', true) = 'SUPER_ADMIN');
CREATE POLICY admin_bypass_payments ON payments USING (current_setting('app.current_user_role', true) = 'SUPER_ADMIN');
CREATE POLICY admin_bypass_audit_logs ON audit_logs USING (current_setting('app.current_user_role', true) = 'SUPER_ADMIN');

-- ┌─────────────────────────────────────────────────────────────┐
-- │ Step 3: Create Tenant Isolation Policies                   │
-- └─────────────────────────────────────────────────────────────┘
-- Regular users can only access rows where "orgId" matches their org

-- Organizations: Regular users can only see their own org
CREATE POLICY tenant_isolation_organizations ON organizations
  USING (id = current_setting('app.current_org', true));

-- Members: Only members of the current org
CREATE POLICY tenant_isolation_members ON members
  USING ("orgId" = current_setting('app.current_org', true));

-- WhatsApp Instances
CREATE POLICY tenant_isolation_whatsapp_instances ON whatsapp_instances
  USING ("orgId" = current_setting('app.current_org', true));

-- WhatsApp Messages
CREATE POLICY tenant_isolation_whatsapp_messages ON whatsapp_messages
  USING ("orgId" = current_setting('app.current_org', true));

-- WhatsApp Chats
CREATE POLICY tenant_isolation_whatsapp_chats ON whatsapp_chats
  USING ("orgId" = current_setting('app.current_org', true));

-- WhatsApp Templates
CREATE POLICY tenant_isolation_whatsapp_templates ON whatsapp_templates
  USING ("orgId" = current_setting('app.current_org', true));

-- WhatsApp Agents
CREATE POLICY tenant_isolation_whatsapp_agents ON whatsapp_agents
  USING ("orgId" = current_setting('app.current_org', true));

-- WhatsApp Assignments
CREATE POLICY tenant_isolation_whatsapp_assignments ON whatsapp_assignments
  USING ("orgId" = current_setting('app.current_org', true));

-- Webhook Subscriptions
CREATE POLICY tenant_isolation_webhook_subscriptions ON webhook_subscriptions
  USING ("orgId" = current_setting('app.current_org', true));

-- Webhook Delivery Logs
CREATE POLICY tenant_isolation_webhook_delivery_logs ON webhook_delivery_logs
  USING ("orgId" = current_setting('app.current_org', true));

-- Quota Usages
CREATE POLICY tenant_isolation_quota_usages ON quota_usages
  USING ("orgId" = current_setting('app.current_org', true));

-- Invoices
CREATE POLICY tenant_isolation_invoices ON invoices
  USING ("orgId" = current_setting('app.current_org', true));

-- Invoice Items (via invoice relationship)
CREATE POLICY tenant_isolation_invoice_items ON invoice_items
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_items."invoiceId"
        AND i."orgId" = current_setting('app.current_org', true)
    )
  );

-- Payments
CREATE POLICY tenant_isolation_payments ON payments
  USING ("orgId" = current_setting('app.current_org', true));

-- Audit Logs: Org admins can only see their org's logs
CREATE POLICY tenant_isolation_audit_logs ON audit_logs
  USING (
    "orgId" = current_setting('app.current_org', true)
    OR "orgId" IS NULL  -- System-level logs visible to all admins
  );

-- ┌─────────────────────────────────────────────────────────────┐
-- │ Step 4: Ensure INSERTs Also Respect Tenant Isolation      │
-- └─────────────────────────────────────────────────────────────┘
-- WITH CHECK ensures that new rows must match the policy

-- Organizations: Prevent "orgId" spoofing during INSERT
CREATE POLICY tenant_insert_organizations ON organizations
  WITH CHECK (id = current_setting('app.current_org', true));

-- Members
CREATE POLICY tenant_insert_members ON members
  WITH CHECK ("orgId" = current_setting('app.current_org', true));

-- WhatsApp Instances
CREATE POLICY tenant_insert_whatsapp_instances ON whatsapp_instances
  WITH CHECK ("orgId" = current_setting('app.current_org', true));

-- WhatsApp Messages
CREATE POLICY tenant_insert_whatsapp_messages ON whatsapp_messages
  WITH CHECK ("orgId" = current_setting('app.current_org', true));

-- WhatsApp Chats
CREATE POLICY tenant_insert_whatsapp_chats ON whatsapp_chats
  WITH CHECK ("orgId" = current_setting('app.current_org', true));

-- WhatsApp Templates
CREATE POLICY tenant_insert_whatsapp_templates ON whatsapp_templates
  WITH CHECK ("orgId" = current_setting('app.current_org', true));

-- WhatsApp Agents
CREATE POLICY tenant_insert_whatsapp_agents ON whatsapp_agents
  WITH CHECK ("orgId" = current_setting('app.current_org', true));

-- WhatsApp Assignments
CREATE POLICY tenant_insert_whatsapp_assignments ON whatsapp_assignments
  WITH CHECK ("orgId" = current_setting('app.current_org', true));

-- Webhook Subscriptions
CREATE POLICY tenant_insert_webhook_subscriptions ON webhook_subscriptions
  WITH CHECK ("orgId" = current_setting('app.current_org', true));

-- Webhook Delivery Logs (system-generated, but still set "orgId")
CREATE POLICY tenant_insert_webhook_delivery_logs ON webhook_delivery_logs
  WITH CHECK ("orgId" = current_setting('app.current_org', true));

-- Quota Usages
CREATE POLICY tenant_insert_quota_usages ON quota_usages
  WITH CHECK ("orgId" = current_setting('app.current_org', true));

-- Invoices
CREATE POLICY tenant_insert_invoices ON invoices
  WITH CHECK ("orgId" = current_setting('app.current_org', true));

-- Invoice Items (through invoice relationship)
CREATE POLICY tenant_insert_invoice_items ON invoice_items
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_items."invoiceId"
        AND i."orgId" = current_setting('app.current_org', true)
    )
  );

-- Payments
CREATE POLICY tenant_insert_payments ON payments
  WITH CHECK ("orgId" = current_setting('app.current_org', true));

-- Audit Logs (system and user-generated)
CREATE POLICY tenant_insert_audit_logs ON audit_logs
  WITH CHECK (
    "orgId" = current_setting('app.current_org', true)
    OR "orgId" IS NULL
  );
