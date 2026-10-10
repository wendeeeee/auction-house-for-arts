import { io } from 'socket.io-client';
import { demoUserStore } from '../session/demo-user-store';
import { createRealtimeConnection } from './realtime-connection';

/**
 * The app's connection. Same origin as the page: in development Vite proxies `/socket.io` to
 * the API. WebSocket only, matching the server, which refuses long-polling.
 */
export const realtimeConnection = createRealtimeConnection({
  createSocket: (auth) => io({ transports: ['websocket'], autoConnect: false, auth: { ...auth } }),
  getDemoUserId: () => demoUserStore.get(),
  subscribeToDemoUser: (listener) => demoUserStore.subscribe(listener),
});
