const Notification = require('../models/Notification');

const userRoom = userId => `user:${String(userId).toLowerCase()}`;

const createNotification = async (io, payload) => {
  const notification = await Notification.create(payload);
  const serialized = notification.toObject();

  if (io) {
    if (payload.recipientUserId) io.to(userRoom(payload.recipientUserId)).emit('notification:new', serialized);
    if (payload.recipientRole) io.to(`role:${payload.recipientRole}`).emit('notification:new', serialized);
  }

  return serialized;
};

const notifyAdmin = (io, payload) => createNotification(io, { ...payload, recipientRole: 'admin' });
const notifyRetailer = (io, userId, payload) => createNotification(io, { ...payload, recipientUserId: userId });

module.exports = { createNotification, notifyAdmin, notifyRetailer, userRoom };
