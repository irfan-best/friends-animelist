const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true,
    trim: true
  },
  milestone: {
    type: Number,
    required: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  likes: [likeSchema],
  readBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for quick queries
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ userId: 1, milestone: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
