const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

// GET /api/notifications -> Get all milestone notifications and unread count for current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.userId;

    const notifs = await Notification.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    let unreadCount = 0;
    const formatted = notifs.map(n => {
      const isRead = (n.readBy || []).some(id => id.toString() === currentUserId.toString());
      if (!isRead) unreadCount++;

      const likedByMe = (n.likes || []).some(l => l.userId.toString() === currentUserId.toString());
      const likedByUsers = (n.likes || []).map(l => l.username);

      return {
        _id: n._id,
        userId: n.userId,
        username: n.username,
        milestone: n.milestone,
        message: n.message,
        createdAt: n.createdAt,
        likesCount: (n.likes || []).length,
        likedByMe,
        likedByUsers,
        isRead
      };
    });

    res.json({
      notifications: formatted,
      unreadCount
    });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

// POST /api/notifications/:id/like -> Toggle like/unlike on a notification
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const notifId = req.params.id;
    const currentUserId = req.user.userId;

    if (!mongoose.Types.ObjectId.isValid(notifId)) {
      return res.status(400).json({ error: 'Invalid notification ID.' });
    }

    const notif = await Notification.findById(notifId);
    if (!notif) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    const user = await User.findById(currentUserId).select('username');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const existingIndex = notif.likes.findIndex(
      l => l.userId.toString() === currentUserId.toString()
    );

    let likedByMe = false;
    if (existingIndex !== -1) {
      // Unlike
      notif.likes.splice(existingIndex, 1);
      likedByMe = false;
    } else {
      // Like
      notif.likes.push({
        userId: currentUserId,
        username: user.username,
        createdAt: new Date()
      });
      likedByMe = true;
    }

    await notif.save();

    res.json({
      message: likedByMe ? 'Notification liked.' : 'Notification unliked.',
      likedByMe,
      likesCount: notif.likes.length,
      likedByUsers: notif.likes.map(l => l.username)
    });
  } catch (err) {
    console.error('Error toggling like:', err);
    res.status(500).json({ error: 'Failed to update like status.' });
  }
});

// POST /api/notifications/mark-read -> Mark all notifications as read for current user
router.post('/mark-read', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.userId;

    await Notification.updateMany(
      { readBy: { $ne: currentUserId } },
      { $addToSet: { readBy: currentUserId } }
    );

    res.json({
      message: 'All notifications marked as read.',
      unreadCount: 0
    });
  } catch (err) {
    console.error('Error marking notifications as read:', err);
    res.status(500).json({ error: 'Failed to mark notifications as read.' });
  }
});

module.exports = router;
