const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');

router.get('/', async (req, res) => {
  try {
    const { userId, role } = req.query;
    if (!userId && !role) return res.status(400).json({ message: 'userId or role is required.' });

    const recipients = [];
    if (userId) recipients.push({ recipientUserId: String(userId).toLowerCase() });
    if (role) recipients.push({ recipientRole: String(role).toLowerCase() });

    const notifications = await Notification.find({ $or: recipients })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { readAt: new Date() },
      { returnDocument: 'after' }
    );
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found.' });
    res.json({ success: true, notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/read-all', async (req, res) => {
  try {
    const { userId, role } = req.body;
    const recipients = [];
    if (userId) recipients.push({ recipientUserId: String(userId).toLowerCase() });
    if (role) recipients.push({ recipientRole: String(role).toLowerCase() });
    if (!recipients.length) return res.status(400).json({ message: 'userId or role is required.' });

    await Notification.updateMany({ $or: recipients, readAt: null }, { readAt: new Date() });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
