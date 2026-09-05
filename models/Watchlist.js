const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  categoryName: {
    type: String,
    required: true,
    trim: true
  },
  order: {
    type: Number,
    default: 0
  },
  animes: [{
    type: String,
    trim: true
  }]
}, { _id: true });

const watchlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  categories: [categorySchema]
}, {
  timestamps: true
});

module.exports = mongoose.model('Watchlist', watchlistSchema);
