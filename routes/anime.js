const express = require('express');
const router = express.Router();
const { scanAnimeImages, renameAnimeImageFile } = require('../utils/imageScanner');
const { authenticateToken } = require('../middleware/auth');
const Watchlist = require('../models/Watchlist');

// GET /api/animes -> Scans ./Images directory, returns list of all anime names & image URLs
router.get('/', (req, res) => {
  try {
    const animes = scanAnimeImages();
    res.json(animes);
  } catch (err) {
    console.error('Error in /api/animes:', err);
    res.status(500).json({ error: 'Failed to scan anime images.' });
  }
});

// GET /api/animes/global-stats -> Returns global watch counts and total rank sums across all users
router.get('/global-stats', async (req, res) => {
  try {
    const watchlists = await Watchlist.find({}).lean();

    const statsMap = {}; // title -> count
    const rankMap = {}; // title -> rankSum
    const statsDetails = {}; // key -> { title, count, rankSum }

    for (const wl of watchlists) {
      if (!wl.categories || !Array.isArray(wl.categories)) continue;
      // Sort categories according to their defined order
      const sortedCats = [...wl.categories].sort((a, b) => (a.order || 0) - (b.order || 0));
      let currentRank = 0;
      const userSeen = new Set();

      for (const cat of sortedCats) {
        if (!cat.animes || !Array.isArray(cat.animes)) continue;
        for (let i = 0; i < cat.animes.length; i++) {
          currentRank++;
          const title = (cat.animes[i] || '').trim();
          if (!title) continue;
          const key = title.toLowerCase();

          // Count first occurrence per user
          if (!userSeen.has(key)) {
            userSeen.add(key);
            if (!statsDetails[key]) {
              statsDetails[key] = {
                title,
                count: 0,
                rankSum: 0
              };
            }
            statsDetails[key].count += 1;
            statsDetails[key].rankSum += currentRank;
          }
        }
      }
    }

    for (const key of Object.keys(statsDetails)) {
      const item = statsDetails[key];
      statsMap[item.title] = item.count;
      statsMap[key] = item.count;
      rankMap[item.title] = item.rankSum;
      rankMap[key] = item.rankSum;
    }

    res.json({
      stats: statsMap,
      rankStats: rankMap,
      details: statsDetails
    });
  } catch (err) {
    console.error('Error fetching global stats:', err);
    res.status(500).json({ error: 'Failed to fetch global stats.' });
  }
});

// GET /api/animes/watchers?title={animeTitle} -> Returns list of users who watched this anime
router.get('/watchers', async (req, res) => {
  try {
    const title = req.query.title;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Anime title is required.' });
    }

    const cleanTitle = title.trim();
    // Escape regex characters
    const escaped = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const watchlists = await Watchlist.find({
      'categories.animes': { $regex: new RegExp(`^${escaped}$`, 'i') }
    }).populate('userId', 'username createdAt');

    const watchers = [];
    const seenUsers = new Set();

    for (const wl of watchlists) {
      if (!wl.userId) continue;
      const uid = wl.userId._id.toString();
      if (!seenUsers.has(uid)) {
        seenUsers.add(uid);

        const sortedCats = [...(wl.categories || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
        let rank = null;
        let currentRank = 0;

        for (const cat of sortedCats) {
          if (!cat.animes || !Array.isArray(cat.animes)) continue;
          for (let i = 0; i < cat.animes.length; i++) {
            currentRank++;
            const aTitle = (cat.animes[i] || '').trim();
            if (rank === null && aTitle.toLowerCase() === cleanTitle.toLowerCase()) {
              rank = currentRank;
            }
          }
        }

        watchers.push({
          userId: wl.userId._id,
          username: wl.userId.username,
          rank: rank !== null ? rank : currentRank || 1
        });
      }
    }

    watchers.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.username.localeCompare(b.username);
    });

    res.json({
      title: cleanTitle,
      count: watchers.length,
      watchers
    });
  } catch (err) {
    console.error('Error fetching anime watchers:', err);
    res.status(500).json({ error: 'Failed to fetch watchers.' });
  }
});

// PUT /api/animes/rename -> Renames image file locally and across all user watchlists (Authorized: Irfan Yoichi only)
router.put('/rename', authenticateToken, async (req, res) => {
  try {
    const authUsername = (req.user && req.user.username) ? req.user.username.trim().toLowerCase() : '';
    if (authUsername !== 'irfan yoichi') {
      return res.status(403).json({ error: "Access denied. Only user 'Irfan Yoichi' can rename anime images." });
    }

    const { oldTitle, newTitle } = req.body;
    if (!oldTitle || !newTitle) {
      return res.status(400).json({ error: 'Both oldTitle and newTitle are required.' });
    }

    const cleanOld = oldTitle.trim();
    const cleanNew = newTitle.trim();

    if (cleanOld.toLowerCase() === cleanNew.toLowerCase() && cleanOld === cleanNew) {
      return res.status(400).json({ error: 'New image name must be different from the current name.' });
    }

    // 1. Rename the image on the local filesystem
    const renamedAnime = renameAnimeImageFile(cleanOld, cleanNew);

    // 2. Update all watchlists in database that contain cleanOld
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapeRegex(cleanOld)}$`, 'i');

    const watchlists = await Watchlist.find({
      'categories.animes': regex
    });

    let updatedUsersCount = 0;
    let totalOccurrencesUpdated = 0;

    for (const wl of watchlists) {
      let modified = false;
      for (const cat of (wl.categories || [])) {
        if (!cat.animes || !Array.isArray(cat.animes)) continue;
        for (let i = 0; i < cat.animes.length; i++) {
          if (cat.animes[i] && cat.animes[i].trim().toLowerCase() === cleanOld.toLowerCase()) {
            cat.animes[i] = cleanNew;
            modified = true;
            totalOccurrencesUpdated++;
          }
        }
      }
      if (modified) {
        await wl.save();
        updatedUsersCount++;
      }
    }

    // Fetch refreshed watchlist for current user if available
    let updatedUserWatchlist = null;
    if (req.user.userId) {
      updatedUserWatchlist = await Watchlist.findOne({ userId: req.user.userId }).populate('userId', 'username');
    }

    res.json({
      message: `Successfully renamed "${cleanOld}" to "${cleanNew}". Updated ${updatedUsersCount} user watchlist(s).`,
      anime: renamedAnime,
      oldTitle: cleanOld,
      newTitle: cleanNew,
      updatedUsersCount,
      totalOccurrencesUpdated,
      watchlist: updatedUserWatchlist
    });
  } catch (err) {
    console.error('Error renaming anime image:', err);
    res.status(400).json({ error: err.message || 'Failed to rename anime image.' });
  }
});

module.exports = router;
