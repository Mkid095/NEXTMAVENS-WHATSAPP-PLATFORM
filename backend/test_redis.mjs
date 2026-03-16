import { createClient } from 'redis';

const client = createClient({
  socket: {
    host: 'localhost',
    port: 6381,
  },
});

client.on('error', (err) => console.error('Redis Client Error:', err));
client.on('connect', () => console.log('Redis Client Connected'));

try {
  console.log('Connecting...');
  await client.connect();
  console.log('Connected, pinging...');
  const pong = await client.ping();
  console.log('Ping response:', pong);
  await client.quit();
  process.exit(0);
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
