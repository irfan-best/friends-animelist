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

const animeWatchedDateSchema = new mongoose.Schema({
  animeTitle: {
    type: String,
    required: true,
    trim: true
  },
  watchedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const watchlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  categories: [categorySchema],
  animeWatchedDates: [animeWatchedDateSchema]
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      const datesMap = {};
      if (Array.isArray(ret.animeWatchedDates)) {
        for (const item of ret.animeWatchedDates) {
          if (item && item.animeTitle) {
            datesMap[item.animeTitle.toLowerCase().trim()] = item.watchedAt;
          }
        }
      }
      ret.animeWatchedDates = datesMap;
      return ret;
    }
  },
  toObject: {
    transform: (doc, ret) => {
      const datesMap = {};
      if (Array.isArray(ret.animeWatchedDates)) {
        for (const item of ret.animeWatchedDates) {
          if (item && item.animeTitle) {
            datesMap[item.animeTitle.toLowerCase().trim()] = item.watchedAt;
          }
        }
      }
      ret.animeWatchedDates = datesMap;
      return ret;
    }
  }
});

watchlistSchema.methods.setWatchedDate = function(title, date = new Date()) {
  if (!Array.isArray(this.animeWatchedDates)) {
    this.animeWatchedDates = [];
  }
  const clean = (title || '').trim();
  if (!clean) return;
  const lower = clean.toLowerCase();
  const existing = this.animeWatchedDates.find(
    item => item && item.animeTitle && item.animeTitle.trim().toLowerCase() === lower
  );
  if (existing) {
    existing.watchedAt = date;
  } else {
    this.animeWatchedDates.push({ animeTitle: clean, watchedAt: date });
  }
};

watchlistSchema.methods.removeWatchedDate = function(title) {
  if (Array.isArray(this.animeWatchedDates)) {
    const lower = (title || '').trim().toLowerCase();
    this.animeWatchedDates = this.animeWatchedDates.filter(
      item => item && item.animeTitle && item.animeTitle.trim().toLowerCase() !== lower
    );
  }
};

watchlistSchema.methods.hasWatchedDate = function(title) {
  if (!Array.isArray(this.animeWatchedDates)) return false;
  const lower = (title || '').trim().toLowerCase();
  return this.animeWatchedDates.some(
    item => item && item.animeTitle && item.animeTitle.trim().toLowerCase() === lower
  );
};

module.exports = mongoose.model('Watchlist', watchlistSchema);
