import { messageQueue } from './src/lib/message-queue-priority-system/index.js';
console.log('Testing getJobCounts...');
try {
  const counts = await messageQueue.getJobCounts();
  console.log('Counts:', counts);
  process.exit(0);
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
