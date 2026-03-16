// Update phase1.json for Step 14 completion
import { readFile, writeFile } from 'node:fs/promises';

const PHASE1_PATH = '/home/ken/NEXTMAVENS-WHATSAPP-PLATFORM/phase1.json';

async function update() {
  const content = await readFile(PHASE1_PATH, 'utf8');
  const data = JSON.parse(content);

  if (!data.steps) {
    console.error('Unexpected phase1.json structure: missing steps array');
    process.exit(1);
  }
  const step14 = data.steps.find(s => s.id === 14);
  if (!step14) {
    console.error('Step 14 not found in phase1.json');
    process.exit(1);
  }

  // Update reportTemplate.metrics with actual values
  step14.reportTemplate.metrics = {
    filesCreated: 9,
    filesModified: 5,
    testsAdded: 18,
    testsPassing: "18/18 (8 unit, 10 integration)",
    timeSpentHours: 6
  };

  // Set status and timestamps
  step14.status = "COMPLETED";
  step14.completedAt = "2025-03-17T00:00:00.000Z";
  step14.implementationNotes = "Instance heartbeat monitoring fully implemented. Core library (5 files) + routes (2) + tests (2) = 9 new files. RLS fix in recordHeartbeat ensures tenant isolation. Shared Prisma client used. Integration tests pass: 10/10. Background job syncs status every 30s. Admin dashboard with filtering. All tests passing with proper shutdown sequence. Critical fixes: RLS in background job, auth middleware orgId propagation, quota middleware admin exclusion, shared Prisma to avoid connection leaks.";

  await writeFile(PHASE1_PATH, JSON.stringify(data, null, 2) + '\n');
  console.log('phase1.json updated successfully for step 14.');
}

update().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
