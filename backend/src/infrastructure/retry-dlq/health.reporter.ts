import { getRedisClient } from './dlq.redis.client';
import { getAllDlqStreamKeys } from './stream.operations';

/**
 * Get DLQ health report
 */
export async function getDlqHealthReport() {
  const client = await getRedisClient();
  const streamKeys = await getAllDlqStreamKeys();

  const report = {
    timestamp: new Date().toISOString(),
    totalStreams: streamKeys.length,
    streams: [] as any[],
    totalEntries: 0,
    oldestEntry: null as { stream: string; timestamp: string } | null,
    newestEntry: null as { stream: string; timestamp: string } | null
  };

  for (const key of streamKeys) {
    const count = await client.xlen(key);
    report.totalEntries += count;

    const streamInfo = {
      key,
      messageType: key.split(':').pop(),
      count,
      oldest: null as string | null,
      newest: null as string | null
    };

    if (count > 0) {
      const oldest = await client.xrange(key, 0, 0, 'COUNT', 1);
      const newest = await client.xrevrange(key, 0, 0, 'COUNT', 1);

      if (oldest && oldest.length > 0) {
        const [id, fieldsFlat] = oldest[0] as [string, string[]];
        const fields: [string, string][] = [];
        for (let i = 0; i < fieldsFlat.length; i += 2) {
          fields.push([fieldsFlat[i], fieldsFlat[i + 1]]);
        }
        const timeField = fields.find((f) => f[0] === 'timestamp');
        if (timeField) {
          streamInfo.oldest = timeField[1];
        }
      }

      if (newest && newest.length > 0) {
        const [id, fieldsFlat] = newest[0] as [string, string[]];
        const fields: [string, string][] = [];
        for (let i = 0; i < fieldsFlat.length; i += 2) {
          fields.push([fieldsFlat[i], fieldsFlat[i + 1]]);
        }
        const timeField = fields.find((f) => f[0] === 'timestamp');
        if (timeField) {
          streamInfo.newest = timeField[1];
        }
      }
    }

    report.streams.push(streamInfo);
  }

  return report;
}
