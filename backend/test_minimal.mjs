import Fastify from 'fastify';
import 'dotenv/config';

const app = Fastify({ logger: true });

app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

try {
  await app.listen({ port: 3005, host: '0.0.0.0' });
  console.log('Server started on 3005');
} catch (err) {
  console.error('Start error:', err);
  process.exit(1);
}
