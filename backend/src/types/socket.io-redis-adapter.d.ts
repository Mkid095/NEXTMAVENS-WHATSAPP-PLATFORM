declare module '@socket.io/redis-adapter' {
  import { Adapter } from 'socket.io';
  export function createAdapter(
    pubClient: any,
    subClient: any,
    opts?: any
  ): Adapter;
  export const RedisAdapter: any;
}
