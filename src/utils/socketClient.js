import { io } from 'socket.io-client';
import { getApiBaseUrl } from './apiClient';

export const createNotificationSocket = (userId, role) => io(getApiBaseUrl(), {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  auth: { userId, role }
});
