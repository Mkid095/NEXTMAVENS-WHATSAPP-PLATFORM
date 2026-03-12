#!/usr/bin/env bash

# Phase 1, Step 1 Quick Start
# Run this script to set up PostgreSQL RLS immediately

set -e  # Exit on error

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║   Phase 1, Step 1: Enable PostgreSQL RLS - Quick Start       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check Docker & PostgreSQL container
echo "1️⃣  Checking PostgreSQL container..."
if ! docker ps | grep -q nextmavens-research-db; then
    echo -e "${RED}❌ PostgreSQL container not running${NC}"
    echo "   Start with: docker start nextmavens-research-db"
    exit 1
fi
echo -e "${GREEN}✅ PostgreSQL container running${NC}"

# Step 2: Check .env file
echo ""
echo "2️⃣  Checking backend/.env configuration..."
if [ ! -f backend/.env ]; then
    echo "   Creating backend/.env from template..."
    cp backend/.env.example backend/.env
    echo -e "${YELLOW}⚠️  Please verify DATABASE_URL in backend/.env${NC}"
    echo "   CurrentDATABASE_URL from container:"
    echo "   postgresql://flow:flow_research_secure_2026@localhost:5433/nextmavens_research"
else
    echo -e "${GREEN}✅ backend/.env exists${NC}"
fi

# Step 3: Install backend dependencies
echo ""
echo "3️⃣  Installing backend dependencies..."
cd backend
if [ ! -d node_modules ]; then
    npm install
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi

# Step 4: Generate Prisma Client
echo ""
echo "4️⃣  Generating Prisma Client..."
npx prisma generate
echo -e "${GREEN}✅ Prisma Client generated${NC}"

# Step 5: Apply database schema
echo ""
echo "5️⃣  Applying database schema..."
echo "   This will create 15 tables in the database."
read -p "   Continue? (yes/no): " -r
if [[ ! $REPLY =~ ^yes$ ]]; then
    echo "Aborted."
    exit 1
fi

npx prisma migrate dev --name init
echo -e "${GREEN}✅ Database schema created${NC}"

# Step 6: Apply RLS policies
echo ""
echo "6️⃣  Applying RLS policies..."
npx prisma db push
echo -e "${GREEN}✅ RLS policies applied${NC}"

# Step 7: Run tests
echo ""
echo "7️⃣  Running RLS integration tests..."
npm run test:rls
echo -e "${GREEN}✅ All RLS tests passed${NC}"

# Step 8: Summary
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  ✅ Step 1 Complete!                                         ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Deliverables:"
echo "   ✅ backend/prisma/schema.prisma"
echo "   ✅ backend/prisma/migrations/20250311_add_rls_policies/migration.sql"
echo "   ✅ backend/src/middleware/orgGuard.ts"
echo "   ✅ backend/src/lib/prisma.ts"
echo "   ✅ backend/src/test/rls.integration.test.ts"
echo "   ✅ docs/research/phase1-step1-research.md"
echo "   ✅ reports/phase1-step-1-report.md"
echo ""
echo "📝 Next actions:"
echo "   1. Review the report: cat reports/phase1-step-1-report.md"
echo "   2. Update phase1.json with completion data"
echo "   3. Git commit:"
echo "      git add ."
echo "      git commit -m \"feat(phase1): step 1 - Enable PostgreSQL RLS\""
echo "      git push origin phase1-step-1-enable-rls"
echo "   4. Create PR, get review, merge"
echo "   5. Move to Step 2: BullMQ Message Queue"
echo ""
echo "🚀 Ready for Phase 1, Step 2!"
