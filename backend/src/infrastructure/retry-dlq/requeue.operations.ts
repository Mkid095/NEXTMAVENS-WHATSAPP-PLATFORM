import { getDlqEntry } from './query.operations';
import { deleteDlqEntry } from './write.operations';

/**
 * Re-queue a DLQ entry back to the main message queue
 */
export async function requeueFromDlq(
  streamKey: string,
  entryId: string,
  queue: any // BullMQ Queue instance
): Promise<boolean> {
  const entry = await getDlqEntry(streamKey, entryId);
  if (!entry) {
    return false;
  }

  const { data } = entry;

  try {
    await queue.add(data.messageType, data.payload, {
      priority: data.jobOptions?.priority,
      ...(data.jobOptions?.deduplication && { deduplication: data.jobOptions.deduplication })
    });

    await deleteDlqEntry(streamKey, entryId);
    console.log(`[DLQ] Re-queued job ${data.originalJobId} from ${streamKey} to main queue`);
    return true;
  } catch (error) {
    console.error(`[DLQ] Failed to re-queue job ${data.originalJobId}:`, error);
    return false;
  }
}
