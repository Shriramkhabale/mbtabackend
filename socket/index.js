const { Server } = require('socket.io');
const { userRoom } = require('./notificationService');

const initializeSocket = (httpServer) => {
  const allowedOrigins = (process.env.FRONTEND_URLS || 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling']
  });

  io.on('connection', socket => {
    const { userId, role } = socket.handshake.auth || {};
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    socket.join(userRoom(userId));
    if (role) socket.join(`role:${String(role).toLowerCase()}`);
  });

  return io;
};

module.exports = initializeSocket;
