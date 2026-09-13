const mongoose = require('mongoose');

const loginHistorySchema = new mongoose.Schema({
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
  loginTime: {
    type: Date,
    default: Date.now,
    index: true
  },
  ip: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  }
});

module.exports = mongoose.model('LoginHistory', loginHistorySchema);
