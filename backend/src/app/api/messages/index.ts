import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { registerMessagesRoutes } from './send/route';

export default async function (fastify: FastifyInstance, _opts?: FastifyPluginOptions): Promise<void> {
  await registerMessagesRoutes(fastify);
}
