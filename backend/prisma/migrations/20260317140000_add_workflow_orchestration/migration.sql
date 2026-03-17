-- --------------------------------------------------
-- Migration: Add Workflow Orchestration (Phase 3 Step 3)
-- Date: 2026-03-17 14:00:00
-- --------------------------------------------------

-- Create enum types
CREATE TYPE "WorkflowStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'COMPENSATING', 'COMPENSATED');
CREATE TYPE "WorkflowStepStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'COMPENSATED');

-- Create workflow_definitions table
CREATE TABLE "workflow_definitions" (
  "id" VARCHAR(255) NOT NULL,
  "workflowId" VARCHAR(255) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "stepsJson" JSONB NOT NULL,
  "compensationJson" JSONB,
  "timeoutMs" INTEGER,
  "retryPolicyJson" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  UNIQUE ("workflowId"),
  PRIMARY KEY ("id")
);

-- Create workflow_instances table
CREATE TABLE "workflow_instances" (
  "id" VARCHAR(255) NOT NULL,
  "instanceId" VARCHAR(255) NOT NULL,
  "definitionId" VARCHAR(255) NOT NULL,
  "status" "WorkflowStatus" NOT NULL,
  "currentStep" INTEGER,
  "contextJson" JSONB NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "lastHeartbeatAt" TIMESTAMP(3),
  "orgId" VARCHAR(255) NOT NULL,

  UNIQUE ("instanceId", "orgId"),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("definitionId") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create workflow_step_history table
CREATE TABLE "workflow_step_history" (
  "id" VARCHAR(255) NOT NULL,
  "instanceId" VARCHAR(255) NOT NULL,
  "stepIndex" INTEGER NOT NULL,
  "stepName" VARCHAR(255),
  "status" "WorkflowStepStatus" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "inputJson" JSONB,
  "outputJson" JSONB,
  "metadata" JSONB,

  PRIMARY KEY ("id"),
  FOREIGN KEY ("instanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create indexes
CREATE INDEX "workflow_definitions_workflowId_idx" ON "workflow_definitions"("workflowId");
CREATE INDEX "workflow_definitions_isActive_idx" ON "workflow_definitions"("isActive");
CREATE INDEX "workflow_instances_definitionId_idx" ON "workflow_instances"("definitionId");
CREATE INDEX "workflow_instances_status_idx" ON "workflow_instances"("status");
CREATE INDEX "workflow_instances_orgId_idx" ON "workflow_instances"("orgId");
CREATE INDEX "workflow_instances_startedAt_idx" ON "workflow_instances"("startedAt");
CREATE INDEX "workflow_instances_instanceId_orgId_idx" ON "workflow_instances"("instanceId", "orgId");
CREATE INDEX "workflow_step_history_instanceId_idx" ON "workflow_step_history"("instanceId");
CREATE INDEX "workflow_step_history_stepIndex_idx" ON "workflow_step_history"("stepIndex");
CREATE INDEX "workflow_step_history_startedAt_idx" ON "workflow_step_history"("startedAt");
CREATE INDEX "workflow_step_history_instanceId_stepIndex_idx" ON "workflow_step_history"("instanceId", "stepIndex");

-- Add foreign key relationship from WorkflowDefinition to WorkflowInstance (inverse)
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign key relationship from WorkflowInstance to WorkflowStepHistory (inverse)
ALTER TABLE "workflow_step_history" ADD CONSTRAINT "workflow_step_history_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;