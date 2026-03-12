# NEXTMAVENS Phases Implementation Guide

## 📋 Overview

This directory contains 8 JSON files (`phase1.json` through `phase8.json`) that define the complete implementation plan for the NEXTMAVENS WhatsApp Platform. Each phase is broken down into actionable steps with detailed implementation instructions.

**Total**: 8 phases, 74 steps, ~60-90 days of full-time developer work.

---

## 🎯 How to Use These JSON Files

### For Developers Starting a Phase

1. **Read the Phase File**
   ```bash
   cat phase1.json | jq '.name, .duration, .overview'
   ```

2. **Review Shared Rules** (Mandatory!)
   - Every phase has `.sharedRules` that apply to ALL steps
   - **Key rules you MUST follow**:
     - ❌ Never use emojis in code or UI
     - ✅ Run all tests before marking complete
     - ✅ Max 250 lines per file → split if needed
     - ✅ Feature-based folder structure (not monolithic)
     - ✅ Primary colors only: `#3B82F6` (blue), `#10B981` (green), etc.
     - ✅ Research first: Use Brave Search and Context7 MCP before any implementation
     - ✅ Commit & push after EVERY change
     - ✅ Update phase JSON with status
     - ✅ Write comprehensive report

3. **Select a Step to Work On**
   ```bash
   # View all steps in phase 1
   jq '.steps[] | {id, title, riskLevel, estimatedHours}' phase1.json
   ```

4. **Read Step Details Carefully**
   ```bash
   # Get full step 1 details
   jq '.steps[0]' phase1.json
   ```
   - `.objective`: What you will achieve
   - `.riskLevel`: CRITICAL/HIGH/MEDIUM - prioritize accordingly
   - `.estimatedHours`: Time budget
   - `.research`: **MUST RESEARCH FIRST** before coding
   - `.implementation.step1` through `.stepN`: Detailed work breakdown
   - `.validation`: How to prove it works
   - `.deliverables`: What to produce

5. **Follow the Exact Git Workflow**
   From `.sharedRules.gitWorkflow`:
   ```bash
   # BEFORE implementation
   git pull origin main
   git checkout -b phase1-step-1-enable-rls

   # AFTER implementation (after tests pass!)
   npm run test:all # or equivalent
   git add .
   git commit -m "feat(phase1): enable RLS on all tenant tables - complete implementation"
   git push origin phase1-step-1-enable-rls

   # Create PR on GitHub with description
   # After merge:
   git checkout main && git pull
   git branch -D phase1-step-1-enable-rls

   # UPDATE PHASE JSON:
   # Edit phase1.json, find step with id=1
   # Add: "status": "completed",
   #      "completedAt": "2026-03-11T14:30:00Z",
   #      "commitHash": "abc123def",
   #      "metrics": { "linesAdded": 250, "testsAdded": 15 }

   # Write report:
   # Create file: reports/phase1-step-1-report.md
   # Include: before/after, challenges, metrics, screenshots
   ```

6. **Research Before Coding** (MANDATORY)
   Every step has `.research.mustResearch: true`.
   Use these MCP servers:
   - **brave-search**: Search for best practices
   - **context7**: Get documentation for libraries (Prisma, BullMQ, Stripe, etc.)

   **Example research prompt for Context7**:
   ```
   "Best practices for PostgreSQL RLS policy design and Prisma integration 2024"
   ```

   **Document research** before coding in:
   ```
   docs/research/phase[X]-step[Y]-research.md
   ```

7. **Implement Step-by-Step**
   Follow `.implementation.step1`, `step2`, etc.
   - Each step has `.description`, sometimes `.commands`, `.file`, `.codeExample`
   - **Max 250 lines per file** - if code exceeds, split into submodules
   - Use **modular structure**: `/lib/security/`, `/lib/queue/`, `/features/billing/`

8. **Validate Before Completing**
   - Run all tests (`.validation` section)
   - Meet quality gates (`.sharedRules.qualityGate`)
   - Test in staging (not production!)
   - Get PR approved

9. **Update Phase JSON & Write Report**
   After merge:
   ```json
   {
     "id": 1,
     "title": "...",
     "status": "completed",
     "completedAt": "2026-03-11T14:30:00Z",
     "commitHash": "abc123",
     "metrics": {
       "filesChanged": 12,
       "linesAdded": 546,
       "testsAdded": 23,
       "coverageIncrease": "+5.2%"
     },
     "notes": "Any blockers, decisions, lessons learned"
   }
   ```

   **Report Template** (`reports/phase1-step-1-report.md`):
   ```markdown
   # Phase 1 - Step 1: Enable PostgreSQL RLS

   ## Before
   - No RLS → data isolation relied on app logic only

   ## During
   - Challenge: X table had complex JOIN requiring special policy
   - Solution: Created policy with USING clause and added index for performance

   ## After
   - 25 RLS policies active on all tenant tables
   - Performance impact: +3ms avg query time (acceptable)

   ## Metrics
   - Policies created: 25
   - Test coverage: 94%
   - Test time: 4m 20s

   ## Verification
   - [x] RLS prevents cross-tenant access
   - [x] Performance benchmark <5% overhead
   - [x] All tests passing
   ```

---

## 🔍 Searching Through the JSON

### Find Specific Steps
```bash
# Find all steps related to RLS
grep -i "rls" phase*.json

# Find CRITICAL risk steps
jq '.steps[] | select(.riskLevel=="CRITICAL") | {id, title}' phase1.json

# Find steps requiring research
jq '.steps[] | select(.research.mustResearch==true) | .title' phase*.json
```

### Count Remaining Work
```bash
# Total steps
jq '[.phases[].steps[]] | length' phases.json

# Completed vs pending (as you mark them)
jq '[.phases[].steps[] | select(.status=="completed")] | length' phase*.json
```

### Search by Tag/Keyword
```bash
# What mentions Stripe?
grep -i "stripe" phase*.json

# What mentions WebSocket?
jq '.steps[] | select(.title | contains("Socket"))' phase*.json
```

---

## 📊 Phase Structure

Each phase file follows this schema:

```json
{
  "phase": 1,
  "name": "Enterprise-Grade Critical Fixes",
  "duration": "14 days",
  "overview": "High-level description",
  "sourcePlanSections": ["Section references from COMPREHENSIVE_IMPLEMENTATION_PLAN.md"],
  "sharedRules": {
    "environment": "PRODUCTION VPS / STAGING / LOCAL",
    "gitWorkflow": { "preImplementation": "...", "afterImplementation": [...] },
    "qualityGate": { "coverageMinimum": 90, "testsRequired": [...] },
    "design": { "noEmojisAnywhere": true, "maxFileSize": 250, ... }
  },
  "steps": [
    {
      "id": 1,
      "title": "Specific Step Title",
      "objective": "What you'll achieve",
      "riskLevel": "CRITICAL|HIGH|MEDIUM|LOW",
      "estimatedHours": 6,
      "research": {
        "mustResearch": true,
        "topics": ["topic1", "topic2"],
        "mcp": ["context7", "brave-search"],
        "questionsToAnswer": ["question1", "?"]
      },
      "prerequisites": {},
      "implementation": {
        "step1": { "description": "...", "commands": [...], "file": "...", "codeExample": "..." },
        "step2": { ... }
      },
      "validation": {},
      "deliverables": ["item1", "item2"],
      "reportTemplate": {}
    }
  ]
}
```

---

## 🚦 Tracking Progress

### Manual Tracking via JSON Updates

After completing a step, edit the phase JSON:

```json
{
  "steps": [
    {
      "id": 1,
      "title": "Enable PostgreSQL RLS",
      "status": "completed",  // ← Add this
      "completedAt": "2026-03-11T14:30:00Z",  // ← Add this
      "commitHash": "abc123def456",  // ← Add this (after merge)
      "metrics": {  // ← Optional but recommended
        "filesChanged": 12,
        "linesAdded": 546,
        "testsWritten": 23,
        "timeSpentHours": 4.5
      }
    }
  ]
}
```

### Automated Progress Queries

```bash
# Show completion status for phase 1
jq '.steps[] | {id, title, status, completedAt}' phase1.json

# Count completed steps per phase
for i in {1..8}; do
  echo "Phase $i: $(jq '[.steps[] | select(.status=="completed")] | length' phase$i.json)/$(jq '.steps | length' phase$i.json)"
done
```

---

## ⚠️ Mandatory Rules (Non-Negotiable)

From `.sharedRules`, these apply to **every** step in **every** phase:

### 1. Git Workflow
- ✅ Commit after EVERY logical change
- ✅ Push to remote (don't accumulate local commits)
- ✅ Update phase JSON with `status: completed`, `completedAt`, `commitHash`
- ✅ Write comprehensive report in `reports/phase[X]-step[Y]-report.md`
- ❌ No "WIP" commits that break tests
- ❌ No "fix" commit spam - make clean commits

### 2. Quality Gates
- ✅ All tests pass (`npm run test:all`)
- ✅ TypeScript compiles without errors (`npm run typecheck`)
- ✅ Linter passes (`npm run lint`)
- ✅ Code coverage >= threshold (varies by phase, usually 85-90%)
- ✅ No "TODO" or "FIXME" placeholders in code
- ✅ No "console.log" or debug code left in

### 3. Design Standards
- ❌ NO EMOJIS ANYWHERE in code, UI, comments, docs, logs
- ✅ Use **primary colors only**: `#3B82F6` (blue), `#10B981` (green), `#F59E0B` (yellow), `#EF4444` (red)
- ❌ NO GRADIENTS, shadows okay
- ✅ Max file size 250 lines → split into modules if needed
- ✅ Feature-based folder structure:
  ```
  /features/auth/       (not /controllers/, /models/)
    services/
    routes/
    tests/
    types/
  ```
- ✅ Consistent naming: `camelCase` for variables, `PascalCase` for classes, `kebab-case` for files

### 4. Research First
- ✅ **FIRST** step: Research using Brave Search and Context7 MCP
- ✅ Document findings in `docs/research/phase[X]-step[Y]-research.md`
- ✅ Ask clarifying questions if instructions unclear
- ✅ Understand best practices before implementing

### 5. Testing
- ✅ Run tests **BEFORE** assuming something works
- ✅ Write tests for new code (TDD where appropriate)
- ✅ Unit tests for services, integration for API routes, E2E for user flows
- ✅ Performance tests for critical paths
- ✅ Security tests for auth, RLS, rate limiting

### 6. Production Safety
- ❌ Never test directly on production
- ✅ Always test on staging first (identical config)
- ✅ Have rollback plan: `git revert`, database backup restore
- ✅ Monitor after deploy (Grafana, logs, alerts)
- ✅ Use feature flags for risky changes

---

## 📈 Example Workflow: Completing Phase 1 Step 1

```bash
# 1. Start Phase 1
cd ~/NEXTMAVENS-WHATSAPP-PLATFORM
cat phase1.json | jq '.steps[0]'  # Read step 1 details

# 2. Research
# Use Context7: "PostgreSQL RLS best practices 2024"
# Use Brave: "RLS performance impact on large tables"
# Document in: docs/research/phase1-step1-research.md

# 3. Create branch
git checkout main
git pull origin main
git checkout -b phase1-step-1-enable-rls

# 4. Implement step-by-step
# Follow phase1.json → step1.implementation.step1
# Write code in modules, max 250 lines each

# 5. Write tests
# Create tests/security/rls-isolation.test.ts
# Run: npm run test:all

# 6. Commit
git add .
git commit -m "feat(phase1): enable RLS on all tenant tables - implement policies for 25 tables"
git push origin phase1-step-1-enable-rls

# 7. Create PR on GitHub
# Description: "Implements Phase 1 Step 1: RLS policies. Adds 25 policies across all tenant tables. Test coverage 94%."

# 8. Get PR approval and merge

# 9. Update phase1.json
# Find step with id:1, add status, completedAt, commitHash, metrics

git checkout main && git pull
git branch -D phase1-step-1-enable-rls

# 10. Write report
# Create reports/phase1-step-1-report.md with before/after, challenges, metrics

echo "✅ Step 1 complete! 🎉"
```

---

## 📁 File Organization

```
NEXTMAVENS-WHATSAPP-PLATFORM/
├── phases.json              # Master index with all phases overview
├── phase1.json              # Enterprise-Grade Critical Fixes
├── phase2.json              # Reliability & Messaging Hardening
├── phase3.json              # Payment & Billing System
├── phase4.json              # API & Developer Experience
├── phase5.json              # Super Admin & Monitoring Dashboard
├── phase6.json              # Testing & Quality Assurance
├── phase7.json              # Advanced UX & Features
├── phase8.json              # Deployment & Production Readiness
├── COMPREHENSIVE_IMPLEMENTATION_PLAN.md  # Human-readable master plan
├── PHASES_USAGE_GUIDE.md    # This file
├── reports/                 # Create after completing steps
│   ├── phase1-step-1-report.md
│   ├── phase1-step-2-report.md
│   └── ...
├── docs/research/           # Create before each step
│   ├── phase1-step1-research.md
│   └── ...
└── infrastructure/          # Create during Phase 8
    ├── envs/
    └── modules/
```

---

## 🎯 Success Criteria

You know you're done when:

1. **All 8 phases completed** (`jq '.phases[].steps[].status' | grep -c completed` = total steps)
2. **Test coverage >= 90%** across entire codebase
3. **Production deployed** with zero major incidents for 30 days
4. **SOC2 audit passed** (Type 2)
5. **Documentation complete**: OpenAPI, SDKs, Runbooks, Developer Portal live
6. **Monitoring operational**: Grafana dashboards, alerts responding, backups verified
7. **All rules obeyed**: No emojis in codebase, all files <250 lines, git history clean

---

## ❓ Frequently Asked Questions

**Q: Can I work on multiple steps in parallel?**
A: Yes, but within a phase. Steps within same phase can be parallel. Steps in later phases may depend on earlier phases (check `.dependencies` in phase file).

**Q: What if a step takes longer than estimated?**
A: That's okay. Update `.metrics.timeSpentHours` in JSON. Document blockers in report.

**Q: How do I handle dependencies between phases?**
A: Check `phase.json[i].dependencies`: `[1]` means Phase 1 must be complete before starting. Respect dependencies to avoid rework.

**Q: What if research reveals a different approach than specified?**
A: Document in research report. If better, adopt it. Update phase JSON notes with decision rationale. **But get team approval before deviating significantly.**

**Q: How do I mark a step as "blocked"?**
A: Add `"status": "blocked", "blockedReason": "...", "blockedBy": "issue # or external dependency"` to step in JSON.

**Q: Where do I put screenshots?**
A: In reports: `reports/phase1-step-1-screenshot1.png`. Reference in markdown report.

**Q: What if tests fail in CI after merge?**
A: Immediately fix and push hotfix. If cannot fix quickly, revert commit. Don't leave broken build.

**Q: Can I skip steps?**
A: Only with documented reason and team approval. Mark step as `"status": "skipped", "reason": "..."`. Better to complete all.

---

## 🆘 Getting Help

1. **Research first**: Use Brave Search and Context7 MCP (they're your primary resources)
2. **Check existing docs**: `docs/`, `README.md`, `ARCHITECTURE.md`
3. **Ask team**: Post in Slack #engineering with specific question
4. **Refer to plan**: `COMPREHENSIVE_IMPLEMENTATION_PLAN.md` has deep background

---

## 📊 Quick Reference: All Steps by Risk

```bash
# Count critical steps
jq '[.steps[] | select(.riskLevel=="CRITICAL")] | length' phase*.json

# Expected output:
# phase1.json: 10
# phase2.json: 2
# phase3.json: 3
# phase4.json: 2
# phase5.json: 2
# phase6.json: 2
# phase7.json: 1
# phase8.json: 5
# Total: 27 CRITICAL steps - handle with extra care!
```

---

**Remember**: This is a marathon, not a sprint. Follow the rules, research thoroughly, test everything, document decisions. Quality over speed. The platform design is enterprise-grade - your execution should be too.

---

**Created**: 2026-03-11
**Version**: 1.0
**Maintainer**: NEXTMAVENS Engineering Team
