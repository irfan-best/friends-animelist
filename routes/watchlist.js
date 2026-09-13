const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Watchlist = require('../models/Watchlist');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { authenticateToken } = require('../middleware/auth');
const { scanAnimeImages } = require('../utils/imageScanner');

const DEFAULT_WATCHED_DATE = new Date('2026-09-09T12:00:00.000Z');

/**
 * Ensures all animes in all users' watchlists have a watched date,
 * defaulting missing dates or older placeholders to September 9th, 2026, 12:00:00 PM.
 */
async function ensureAllDefaultWatchedDates() {
  try {
    const watchlists = await Watchlist.find();
    let totalUpdated = 0;
    for (const wl of watchlists) {
      let modified = false;
      if (!Array.isArray(wl.animeWatchedDates)) {
        wl.animeWatchedDates = [];
        modified = true;
      }

      const existingDatesMap = new Map();
      for (const item of wl.animeWatchedDates) {
        if (item && item.animeTitle) {
          existingDatesMap.set(item.animeTitle.toLowerCase().trim(), item);
        }
      }

      for (const cat of (wl.categories || [])) {
        for (const a of (cat.animes || [])) {
          if (a && a.trim()) {
            const lower = a.toLowerCase().trim();
            const existing = existingDatesMap.get(lower);
            if (!existing) {
              wl.animeWatchedDates.push({
                animeTitle: a.trim(),
                watchedAt: DEFAULT_WATCHED_DATE
              });
              existingDatesMap.set(lower, { animeTitle: a.trim(), watchedAt: DEFAULT_WATCHED_DATE });
              modified = true;
            } else if (existing.watchedAt && (
              new Date(existing.watchedAt).toISOString() === '2026-09-05T12:00:00.000Z'
            )) {
              existing.watchedAt = DEFAULT_WATCHED_DATE;
              modified = true;
            }
          }
        }
      }

      if (modified) {
        wl.markModified('animeWatchedDates');
        await wl.save();
        totalUpdated++;
      }
    }
    if (totalUpdated > 0) {
      console.log(`[WATCHLIST] Initialized default watched dates for ${totalUpdated} user(s).`);
    }
  } catch (err) {
    console.error('Error in ensureAllDefaultWatchedDates:', err);
  }
}

/**
 * Helper to ensure a user has a watchlist document
 */
async function getOrCreateWatchlist(userId) {
  let watchlist = await Watchlist.findOne({ userId });
  if (!watchlist) {
    watchlist = new Watchlist({
      userId,
      categories: [],
      animeWatchedDates: []
    });
    await watchlist.save();
  }
  return watchlist;
}

/**
 * Calculates total unique watched anime count in a watchlist
 */
function countTotalWatched(watchlist) {
  if (!watchlist || !watchlist.categories) return 0;
  const set = new Set();
  for (const cat of watchlist.categories) {
    for (const a of (cat.animes || [])) {
      if (a) set.add(a.toLowerCase().trim());
    }
  }
  return set.size;
}

/**
 * Checks if user crossed any multiple of 25 (25, 50, 75, 100, ...)
 * and creates celebratory notifications for all users.
 */
async function checkAndSendMilestoneNotifications(userId, oldCount, newCount) {
  try {
    if (newCount <= oldCount) return;
    const user = await User.findById(userId).select('username');
    if (!user) return;

    // Multiples of 25 strictly greater than oldCount and less than or equal to newCount
    const startK = Math.floor(oldCount / 25) + 1;
    const endK = Math.floor(newCount / 25);
    const milestones = [];
    for (let k = startK; k <= endK; k++) {
      if (k > 0) {
        milestones.push(k * 25);
      }
    }

    for (const milestone of milestones) {
      // Avoid duplicate notification if user already reached this milestone before
      const existing = await Notification.findOne({ userId, milestone });
      if (!existing) {
        await Notification.create({
          userId,
          username: user.username,
          milestone,
          message: `${user.username} has completed ${milestone} animes!`,
          likes: [],
          readBy: [userId] // The user who completed it has seen their own milestone
        });
        console.log(`[NOTIFICATION] 🎉 Milestone reached: ${user.username} completed ${milestone} animes!`);
      }
    }
  } catch (err) {
    console.error('Error checking milestone notifications:', err);
  }
}

// 4. COMPARISON ROUTE
// GET /api/watchlist/compare?source={userId1}&destination={userId2}
router.get('/compare', async (req, res) => {
  try {
    const { source, destination } = req.query;

    if (!source || !destination) {
      return res.status(400).json({ error: 'Both source and destination user IDs are required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(source) || !mongoose.Types.ObjectId.isValid(destination)) {
      return res.status(400).json({ error: 'Invalid user ID format.' });
    }

    const [sourceUser, destUser] = await Promise.all([
      User.findById(source).select('username'),
      User.findById(destination).select('username')
    ]);

    if (!sourceUser || !destUser) {
      return res.status(404).json({ error: 'One or both users not found.' });
    }

    const [sourceWatchlist, destWatchlist] = await Promise.all([
      Watchlist.findOne({ userId: source }),
      Watchlist.findOne({ userId: destination })
    ]);

    // Source watched titles set
    const sourceWatchedSet = new Set();
    if (sourceWatchlist && sourceWatchlist.categories) {
      for (const cat of sourceWatchlist.categories) {
        for (const anime of cat.animes) {
          if (anime) sourceWatchedSet.add(anime.toLowerCase().trim());
        }
      }
    }

    // Destination watched titles list with category info and ranks
    const destWatchedTitles = [];
    const destCategoryMap = {};
    const destRankMap = {};
    const destCatRankMap = {};
    if (destWatchlist && destWatchlist.categories) {
      const sortedCats = [...destWatchlist.categories].sort((a, b) => (a.order || 0) - (b.order || 0));
      let overallRank = 1;
      for (const cat of sortedCats) {
        let catRank = 1;
        for (const anime of (cat.animes || [])) {
          if (anime && !destWatchedTitles.includes(anime)) {
            destWatchedTitles.push(anime);
            destCategoryMap[anime] = cat.categoryName;
            destRankMap[anime] = overallRank;
            destCatRankMap[anime] = catRank;
            overallRank++;
            catRank++;
          }
        }
      }
    }

    // Filter diff: Watched by Destination, but NOT by Source
    const diffTitles = destWatchedTitles.filter(
      title => !sourceWatchedSet.has(title.toLowerCase().trim())
    );

    // Get scanned images to match title with image URL
    const allImages = scanAnimeImages();
    const imageMap = {};
    allImages.forEach(img => {
      imageMap[img.title.toLowerCase()] = img;
    });

    const diffAnimes = diffTitles.map((title, idx) => {
      const match = imageMap[title.toLowerCase()];
      return {
        title,
        destCategory: destCategoryMap[title] || 'Watched',
        destRank: destRankMap[title] || (idx + 1),
        destCatRank: destCatRankMap[title] || 1,
        fileName: match ? match.fileName : `${title}.jpg`,
        imageUrl: match ? match.imageUrl : `/images/${encodeURIComponent(title)}.jpg`
      };
    });

    res.json({
      sourceUser: {
        _id: sourceUser._id,
        username: sourceUser.username,
        totalWatched: sourceWatchedSet.size
      },
      destinationUser: {
        _id: destUser._id,
        username: destUser.username,
        totalWatched: destWatchedTitles.length
      },
      diffCount: diffAnimes.length,
      diffAnimes
    });
  } catch (err) {
    console.error('Error comparing watchlists:', err);
    res.status(500).json({ error: 'Failed to compare watchlists.' });
  }
});

// POST /api/watchlist/common -> Find common watched animes across multiple selected users
router.post('/common', async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length < 2) {
      return res.status(400).json({ error: 'Please select at least 2 users to find common anime.' });
    }

    for (const id of userIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: `Invalid user ID format: ${id}` });
      }
    }

    const users = await User.find({ _id: { $in: userIds } }).select('_id username');
    if (users.length !== userIds.length) {
      return res.status(404).json({ error: 'One or more selected users not found.' });
    }

    const watchlists = await Watchlist.find({ userId: { $in: userIds } });

    const userMaps = [];
    for (const user of users) {
      const uid = user._id.toString();
      const wl = watchlists.find(w => w.userId.toString() === uid);
      const watchedSet = new Set();
      const titleOriginalMap = {};
      const categoryMap = {};
      const rankMap = {};

      if (wl && wl.categories) {
        const sortedCats = [...wl.categories].sort((a, b) => (a.order || 0) - (b.order || 0));
        let overallRank = 1;
        for (const cat of sortedCats) {
          for (const anime of (cat.animes || [])) {
            if (anime && anime.trim()) {
              const clean = anime.trim();
              const key = clean.toLowerCase();
              if (!watchedSet.has(key)) {
                watchedSet.add(key);
                titleOriginalMap[key] = clean;
                categoryMap[key] = cat.categoryName;
                rankMap[key] = overallRank;
                overallRank++;
              }
            }
          }
        }
      }

      userMaps.push({
        user,
        watchedSet,
        titleOriginalMap,
        categoryMap,
        rankMap
      });
    }

    const firstMap = userMaps[0];
    const commonKeys = [];

    for (const key of firstMap.watchedSet) {
      let inAll = true;
      for (let i = 1; i < userMaps.length; i++) {
        if (!userMaps[i].watchedSet.has(key)) {
          inAll = false;
          break;
        }
      }
      if (inAll) {
        commonKeys.push(key);
      }
    }

    const allImages = scanAnimeImages();
    const imageMap = new Map();
    allImages.forEach(img => imageMap.set(img.title.toLowerCase().trim(), img));

    const commonAnimes = commonKeys.map(key => {
      const match = imageMap.get(key);
      const originalTitle = firstMap.titleOriginalMap[key] || (match ? match.title : key);

      const userBreakdown = userMaps.map(um => ({
        userId: um.user._id,
        username: um.user.username,
        categoryName: um.categoryMap[key] || 'Watched',
        rank: um.rankMap[key] || null
      }));

      const validRanks = userBreakdown.map(u => u.rank).filter(r => typeof r === 'number' && !isNaN(r));
      const avgRank = validRanks.length > 0 ? (validRanks.reduce((s, r) => s + r, 0) / validRanks.length) : Infinity;

      return {
        title: originalTitle,
        fileName: match ? match.fileName : `${originalTitle}.jpg`,
        imageUrl: match ? match.imageUrl : `/images/${encodeURIComponent(originalTitle)}.jpg`,
        userBreakdown,
        avgRank
      };
    });

    // Default sort by average rank among common friends ascending
    commonAnimes.sort((a, b) => {
      if (a.avgRank !== b.avgRank) return a.avgRank - b.avgRank;
      const minA = Math.min(...(a.userBreakdown || []).map(u => (u.rank != null ? u.rank : Infinity)));
      const minB = Math.min(...(b.userBreakdown || []).map(u => (u.rank != null ? u.rank : Infinity)));
      if (minA !== minB) return minA - minB;
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });

    res.json({
      users: users.map(u => ({ _id: u._id, username: u.username })),
      totalCommon: commonAnimes.length,
      commonAnimes
    });
  } catch (err) {
    console.error('Error finding common animes:', err);
    res.status(500).json({ error: 'Failed to find common anime.' });
  }
});

// GET /api/watchlist/all-community-data -> Preload all users, watchlists, and community ranking stats in a single request
router.get('/all-community-data', async (req, res) => {
  try {
    const users = await User.find({}, '_id username createdAt').lean();
    const watchlists = await Watchlist.find({}).lean();

    const countMap = new Map();
    const catMap = new Map();
    const watchlistsMap = {};

    const userUsernameMap = new Map();
    for (const u of users) {
      if (u && u._id) userUsernameMap.set(u._id.toString(), u.username);
    }

    const watchersMap = {};
    const statsMap = {};
    const rankMap = {};
    const avgRankMap = {};
    const statsDetails = {};

    for (const wl of watchlists) {
      if (!wl.userId) continue;
      const uid = wl.userId.toString();
      const username = userUsernameMap.get(uid) || 'User';

      // Sort categories according to their defined order
      if (Array.isArray(wl.categories)) {
        wl.categories.sort((a, b) => (a.order || 0) - (b.order || 0));
      }

      // Convert animeWatchedDates array to map { [lower]: date } so community watchlists deliver complete date maps
      const datesMap = {};
      if (Array.isArray(wl.animeWatchedDates)) {
        for (const item of wl.animeWatchedDates) {
          if (item && item.animeTitle) {
            datesMap[item.animeTitle.toLowerCase().trim()] = item.watchedAt;
          }
        }
      }
      wl.animeWatchedDates = datesMap;
      watchlistsMap[uid] = wl;

      const seen = new Set();
      let currentRank = 0;

      if (Array.isArray(wl.categories)) {
        catMap.set(uid, wl.categories.length);
        for (const cat of wl.categories) {
          if (Array.isArray(cat.animes)) {
            for (let i = 0; i < cat.animes.length; i++) {
              currentRank++;
              const title = (cat.animes[i] || '').trim();
              if (!title) continue;
              const key = title.toLowerCase();

              if (!seen.has(key)) {
                seen.add(key);
                if (!statsDetails[key]) {
                  statsDetails[key] = {
                    title,
                    count: 0,
                    rankSum: 0
                  };
                }
                statsDetails[key].count += 1;
                statsDetails[key].rankSum += currentRank;

                if (!watchersMap[key]) {
                  watchersMap[key] = [];
                }
                watchersMap[key].push({
                  userId: uid,
                  username,
                  rank: currentRank,
                  totalWatched: 0
                });
              }
            }
          }
        }
      }
      countMap.set(uid, seen.size);
    }

    for (const key of Object.keys(statsDetails)) {
      const item = statsDetails[key];
      statsMap[item.title] = item.count;
      statsMap[key] = item.count;
      rankMap[item.title] = item.rankSum;
      rankMap[key] = item.rankSum;
      const avg = item.count > 0 ? (item.rankSum / item.count) : Infinity;
      avgRankMap[item.title] = avg;
      avgRankMap[key] = avg;
    }

    // Populate totalWatched and sort watchersMap for instant zero-lag lookups
    for (const key of Object.keys(watchersMap)) {
      const list = watchersMap[key];
      for (const w of list) {
        w.totalWatched = countMap.get(w.userId) || 0;
      }
      list.sort((a, b) => {
        const rankA = (a.rank != null) ? a.rank : Infinity;
        const rankB = (b.rank != null) ? b.rank : Infinity;
        if (rankA !== rankB) return rankA - rankB; // Ascending rank: #1 before #2
        const countA = a.totalWatched || 0;
        const countB = b.totalWatched || 0;
        if (countB !== countA) return countB - countA; // Higher total watched first
        return (a.username || '').localeCompare(b.username || '');
      });
    }

    const userList = users.map(u => ({
      _id: u._id,
      username: u.username,
      createdAt: u.createdAt,
      totalWatched: countMap.get(u._id.toString()) || 0,
      totalCategories: catMap.get(u._id.toString()) || 0
    }));

    userList.sort((a, b) => (b.totalWatched - a.totalWatched) || a.username.localeCompare(b.username));

    res.json({
      users: userList,
      watchlists: watchlistsMap,
      watchersMap,
      globalStats: statsMap,
      globalRankStats: rankMap,
      globalAvgRankStats: avgRankMap
    });
  } catch (err) {
    console.error('Error preloading community data:', err);
    res.status(500).json({ error: 'Failed to preload community data.' });
  }
});

// GET /api/watchlist/:userId -> Get specific user's watchlist
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID format.' });
    }

    const user = await User.findById(userId).select('username createdAt');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const watchlist = await getOrCreateWatchlist(userId);

    // Sort categories by order
    watchlist.categories.sort((a, b) => a.order - b.order);

    res.json({
      user: {
        _id: user._id,
        username: user.username
      },
      watchlist
    });
  } catch (err) {
    console.error('Error fetching watchlist:', err);
    res.status(500).json({ error: 'Failed to fetch watchlist.' });
  }
});

// POST /api/watchlist/category -> Add category to active user's watchlist
router.post('/category', authenticateToken, async (req, res) => {
  try {
    const { categoryName } = req.body;
    const userId = req.user.userId;

    if (!categoryName || !categoryName.trim()) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    const trimmedName = categoryName.trim();
    const watchlist = await getOrCreateWatchlist(userId);

    // Check if category name already exists for this user
    const exists = watchlist.categories.some(
      cat => cat.categoryName.toLowerCase() === trimmedName.toLowerCase()
    );

    if (exists) {
      return res.status(400).json({ error: 'Category already exists.' });
    }

    const maxOrder = watchlist.categories.reduce((max, c) => Math.max(max, c.order || 0), -1);
    const newCategory = {
      categoryName: trimmedName,
      order: maxOrder + 1,
      animes: []
    };

    watchlist.categories.push(newCategory);
    await watchlist.save();

    res.status(201).json({
      message: 'Category added successfully.',
      watchlist
    });
  } catch (err) {
    console.error('Error adding category:', err);
    res.status(500).json({ error: 'Failed to add category.' });
  }
});

// PUT /api/watchlist/category -> Rename category
router.put('/category', authenticateToken, async (req, res) => {
  try {
    const { categoryId, newCategoryName } = req.body;
    const userId = req.user.userId;

    if (!categoryId || !newCategoryName || !newCategoryName.trim()) {
      return res.status(400).json({ error: 'categoryId and newCategoryName are required.' });
    }

    const trimmedName = newCategoryName.trim();
    const watchlist = await getOrCreateWatchlist(userId);

    const category = watchlist.categories.find(c => c._id.toString() === categoryId.toString());
    if (!category) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    // Check if another category already has this name
    const exists = watchlist.categories.some(
      c => c._id.toString() !== categoryId.toString() &&
           c.categoryName.toLowerCase() === trimmedName.toLowerCase()
    );

    if (exists) {
      return res.status(400).json({ error: `A category named "${trimmedName}" already exists.` });
    }

    const oldName = category.categoryName;
    category.categoryName = trimmedName;
    await watchlist.save();

    res.json({
      message: `Category renamed to "${trimmedName}".`,
      oldName,
      newCategoryName: trimmedName,
      watchlist
    });
  } catch (err) {
    console.error('Error renaming category:', err);
    res.status(500).json({ error: 'Failed to rename category.' });
  }
});

// DELETE /api/watchlist/category -> Delete category
// Query or body: { categoryId } or { categoryName }
router.delete('/category', authenticateToken, async (req, res) => {
  try {
    const categoryId = req.body.categoryId || req.query.categoryId;
    const categoryName = req.body.categoryName || req.query.categoryName;
    const userId = req.user.userId;

    if (!categoryId && !categoryName) {
      return res.status(400).json({ error: 'categoryId or categoryName is required.' });
    }

    const watchlist = await getOrCreateWatchlist(userId);

    const initialLength = watchlist.categories.length;
    if (categoryId) {
      watchlist.categories = watchlist.categories.filter(c => c._id.toString() !== categoryId.toString());
    } else if (categoryName) {
      watchlist.categories = watchlist.categories.filter(
        c => c.categoryName.toLowerCase() !== categoryName.trim().toLowerCase()
      );
    }

    if (watchlist.categories.length === initialLength) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    // Re-index orders
    watchlist.categories.forEach((cat, idx) => {
      cat.order = idx;
    });

    await watchlist.save();

    res.json({
      message: 'Category deleted successfully. Animes have returned to Unwatched.',
      watchlist
    });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ error: 'Failed to delete category.' });
  }
});

// POST /api/watchlist/add-anime -> Add anime to category (or move if already exists)
// Strict Rule: Anime MUST ONLY exist in ONE category at a time within a user's watched list.
router.post('/add-anime', authenticateToken, async (req, res) => {
  try {
    const { animeTitle, categoryId, categoryName } = req.body;
    const userId = req.user.userId;

    if (!animeTitle || !animeTitle.trim()) {
      return res.status(400).json({ error: 'animeTitle is required.' });
    }

    if (!categoryId && !categoryName) {
      return res.status(400).json({ error: 'categoryId or categoryName is required.' });
    }

    const title = animeTitle.trim();
    const watchlist = await getOrCreateWatchlist(userId);

    // Strict Rule: Remove the anime from ALL categories first so it exists in at most ONE category
    for (const cat of watchlist.categories) {
      cat.animes = cat.animes.filter(a => a.toLowerCase() !== title.toLowerCase());
    }

    // Find target category
    let targetCategory = null;
    if (categoryId) {
      targetCategory = watchlist.categories.find(c => c._id.toString() === categoryId.toString());
    }
    if (!targetCategory && categoryName) {
      targetCategory = watchlist.categories.find(
        c => c.categoryName.toLowerCase() === categoryName.trim().toLowerCase()
      );
    }

    if (!targetCategory) {
      return res.status(404).json({ error: 'Target category not found.' });
    }

    // Track count before addition
    const oldCount = countTotalWatched(watchlist);

    // Record watched date when marked as watched (current timestamp)
    watchlist.setWatchedDate(title, new Date());

    // Add anime to target category
    targetCategory.animes.push(title);

    await watchlist.save();

    // Check if reached a multiple of 25 milestone
    const newCount = countTotalWatched(watchlist);
    await checkAndSendMilestoneNotifications(userId, oldCount, newCount);

    res.json({
      message: `"${title}" added to "${targetCategory.categoryName}".`,
      watchlist
    });
  } catch (err) {
    console.error('Error adding anime to category:', err);
    res.status(500).json({ error: 'Failed to add/move anime.' });
  }
});

// POST /api/watchlist/remove-anime -> Remove anime from watched list
router.post('/remove-anime', authenticateToken, async (req, res) => {
  try {
    const { animeTitle } = req.body;
    const userId = req.user.userId;

    if (!animeTitle || !animeTitle.trim()) {
      return res.status(400).json({ error: 'animeTitle is required.' });
    }

    const title = animeTitle.trim();
    const watchlist = await getOrCreateWatchlist(userId);

    let removed = false;
    for (const cat of watchlist.categories) {
      const origCount = cat.animes.length;
      cat.animes = cat.animes.filter(a => a.toLowerCase() !== title.toLowerCase());
      if (cat.animes.length < origCount) {
        removed = true;
      }
    }

    if (!removed) {
      return res.status(404).json({ error: `Anime "${title}" not found in your watchlist.` });
    }

    if (typeof watchlist.removeWatchedDate === 'function') {
      watchlist.removeWatchedDate(title);
    }

    await watchlist.save();

    res.json({
      message: `"${title}" removed from your watchlist and returned to Unwatched.`,
      watchlist
    });
  } catch (err) {
    console.error('Error removing anime:', err);
    res.status(500).json({ error: 'Failed to remove anime.' });
  }
});

// POST /api/watchlist/batch-add -> Add/move multiple animes into a category
router.post('/batch-add', authenticateToken, async (req, res) => {
  try {
    const { animeTitles, categoryId, categoryName } = req.body;
    const userId = req.user.userId;

    if (!Array.isArray(animeTitles) || animeTitles.length === 0) {
      return res.status(400).json({ error: 'animeTitles must be a non-empty array.' });
    }

    const watchlist = await getOrCreateWatchlist(userId);

    let targetCategory = null;
    if (categoryId) {
      targetCategory = watchlist.categories.find(c => c._id.toString() === categoryId.toString());
    }
    if (!targetCategory && categoryName) {
      targetCategory = watchlist.categories.find(
        c => c.categoryName.toLowerCase() === categoryName.trim().toLowerCase()
      );
    }

    if (!targetCategory) {
      return res.status(404).json({ error: 'Target category not found.' });
    }

    const normalizedTitles = animeTitles.map(t => t.trim()).filter(Boolean);
    const titlesSet = new Set(normalizedTitles.map(t => t.toLowerCase()));

    const oldCount = countTotalWatched(watchlist);

    // Strict Rule: Remove these animes from all categories first
    for (const cat of watchlist.categories) {
      cat.animes = cat.animes.filter(a => !titlesSet.has(a.toLowerCase().trim()));
    }

    const batchNow = new Date();

    // Add unique titles to target category and track watched date
    for (const title of normalizedTitles) {
      if (!targetCategory.animes.some(a => a.toLowerCase().trim() === title.toLowerCase())) {
        targetCategory.animes.push(title);
      }
      watchlist.setWatchedDate(title, batchNow);
    }

    await watchlist.save();

    // Check if reached a multiple of 25 milestone
    const newCount = countTotalWatched(watchlist);
    await checkAndSendMilestoneNotifications(userId, oldCount, newCount);

    res.json({
      message: `Added ${normalizedTitles.length} anime(s) to "${targetCategory.categoryName}".`,
      watchlist
    });
  } catch (err) {
    console.error('Error in batch-add:', err);
    res.status(500).json({ error: 'Failed to batch add animes.' });
  }
});

// POST /api/watchlist/batch-remove -> Remove multiple animes from watched list
router.post('/batch-remove', authenticateToken, async (req, res) => {
  try {
    const { animeTitles } = req.body;
    const userId = req.user.userId;

    if (!Array.isArray(animeTitles) || animeTitles.length === 0) {
      return res.status(400).json({ error: 'animeTitles must be a non-empty array.' });
    }

    const watchlist = await getOrCreateWatchlist(userId);
    const titlesSet = new Set(animeTitles.map(t => t.trim().toLowerCase()).filter(Boolean));

    for (const cat of watchlist.categories) {
      cat.animes = cat.animes.filter(a => !titlesSet.has(a.toLowerCase().trim()));
    }

    if (typeof watchlist.removeWatchedDate === 'function') {
      for (const t of titlesSet) {
        watchlist.removeWatchedDate(t);
      }
    }

    await watchlist.save();

    res.json({
      message: `Removed ${titlesSet.size} anime(s) from your watchlist.`,
      watchlist
    });
  } catch (err) {
    console.error('Error in batch-remove:', err);
    res.status(500).json({ error: 'Failed to batch remove animes.' });
  }
});

// PUT /api/watchlist/reorder -> Save updated order of categories and/or animes
router.put('/reorder', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { categories, categoryId, animes, categoryOrder, moveAnime } = req.body;
    const watchlist = await getOrCreateWatchlist(userId);

    // Mode 0: Cross-category or precise index anime move
    if (moveAnime && moveAnime.animeTitle) {
      const { animeTitle, sourceCategoryId, targetCategoryId, targetIndex } = moveAnime;
      const cleanTitle = animeTitle.trim();
      const cleanKey = cleanTitle.toLowerCase();

      // Find source and target categories
      const sourceCat = watchlist.categories.find(c => c._id.toString() === (sourceCategoryId || '').toString());
      const targetCat = watchlist.categories.find(c => c._id.toString() === (targetCategoryId || '').toString());

      if (!targetCat) {
        return res.status(404).json({ error: 'Target category not found.' });
      }

      // Remove from all categories to maintain strict uniqueness
      for (const cat of watchlist.categories) {
        cat.animes = (cat.animes || []).filter(a => a.toLowerCase().trim() !== cleanKey);
      }

      // Insert into target category at desired index
      let insertIdx = typeof targetIndex === 'number' ? targetIndex : targetCat.animes.length;
      if (insertIdx < 0) insertIdx = 0;
      if (insertIdx > targetCat.animes.length) insertIdx = targetCat.animes.length;

      targetCat.animes.splice(insertIdx, 0, cleanTitle);

      watchlist.markModified('categories');
      await watchlist.save();
      console.log(`[WATCHLIST REORDER] Mode 0: Moved "${cleanTitle}" to "${targetCat.categoryName}" at index ${insertIdx} for user ${userId}`);
      return res.json({ message: `"${cleanTitle}" moved to "${targetCat.categoryName}".`, watchlist });
    }

    // Mode 1: Full categories array passed with new order and animes
    if (Array.isArray(categories)) {
      // Validate unique animes across categories to preserve strict rule
      const seenAnimes = new Set();
      const updatedCategories = [];

      for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        const existingCat = watchlist.categories.find(
          c => c._id.toString() === (cat._id || cat.id || '').toString() ||
               c.categoryName.toLowerCase() === (cat.categoryName || '').toLowerCase()
        );

        if (existingCat) {
          const uniqueCatAnimes = [];
          if (Array.isArray(cat.animes)) {
            for (const a of cat.animes) {
              const aKey = a.toLowerCase().trim();
              if (!seenAnimes.has(aKey)) {
                seenAnimes.add(aKey);
                uniqueCatAnimes.push(a.trim());
              }
            }
          }

          existingCat.categoryName = cat.categoryName || existingCat.categoryName;
          existingCat.order = typeof cat.order === 'number' ? cat.order : i;
          existingCat.animes = uniqueCatAnimes;
          updatedCategories.push(existingCat);
        }
      }

      watchlist.categories = updatedCategories;
      watchlist.markModified('categories');
      await watchlist.save();
      console.log(`[WATCHLIST REORDER] Mode 1: Saved ${updatedCategories.length} categories to Mongo Cloud for user ${userId}`);
      return res.json({ message: 'Watchlist reordered successfully.', watchlist });
    }

    // Mode 2: Reordering animes within a single category
    if (categoryId && Array.isArray(animes)) {
      const category = watchlist.categories.find(c => c._id.toString() === categoryId.toString());
      if (!category) {
        return res.status(404).json({ error: 'Category not found.' });
      }

      // Preserve animes that belong to this category, arranged in requested order
      const validAnimesSet = new Set(category.animes.map(a => a.toLowerCase().trim()));
      const newOrderedList = [];

      for (const a of animes) {
        if (validAnimesSet.has(a.toLowerCase().trim()) && !newOrderedList.some(x => x.toLowerCase() === a.toLowerCase())) {
          newOrderedList.push(a.trim());
        }
      }

      // Include any remaining that might not have been in the request array
      for (const a of category.animes) {
        if (!newOrderedList.some(x => x.toLowerCase() === a.toLowerCase())) {
          newOrderedList.push(a);
        }
      }

      category.animes = newOrderedList;
      watchlist.markModified('categories');
      await watchlist.save();
      console.log(`[WATCHLIST REORDER] Mode 2: Saved category ${categoryId} (${newOrderedList.length} animes) to Mongo Cloud for user ${userId}`);
      return res.json({ message: 'Anime order updated.', watchlist });
    }

    // Mode 3: Reordering categories order
    if (Array.isArray(categoryOrder)) {
      // categoryOrder is array of category IDs in new order
      categoryOrder.forEach((id, index) => {
        const cat = watchlist.categories.find(c => c._id.toString() === id.toString());
        if (cat) {
          cat.order = index;
        }
      });
      watchlist.categories.sort((a, b) => a.order - b.order);
      watchlist.markModified('categories');
      await watchlist.save();
      console.log(`[WATCHLIST REORDER] Mode 3: Saved category order (${categoryOrder.length} categories) to Mongo Cloud for user ${userId}`);
      return res.json({ message: 'Categories order updated.', watchlist });
    }

    return res.status(400).json({ error: 'Invalid reorder payload provided.' });
  } catch (err) {
    console.error('Error reordering watchlist:', err);
    res.status(500).json({ error: 'Failed to reorder watchlist.' });
  }
});

function parseServerCustomDate(dateStr) {
  if (!dateStr) return null;
  const clean = String(dateStr).trim();
  if (!clean) return null;

  const MONTHS = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
  };

  const m = clean.match(/^(\d{1,2})[\s\-]+([a-zA-Z]+)[\s\-]+(\d{4})(?:[,\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const mStr = m[2].toLowerCase();
    const year = parseInt(m[3], 10);
    const hours = m[4] != null ? parseInt(m[4], 10) : 12;
    const minutes = m[5] != null ? parseInt(m[5], 10) : 0;
    const seconds = m[6] != null ? parseInt(m[6], 10) : 0;

    if (MONTHS[mStr] !== undefined) {
      const d = new Date(year, MONTHS[mStr], day, hours, minutes, seconds);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const d = new Date(clean);
  if (!isNaN(d.getTime())) return d;
  return null;
}

async function handleWatchTimeUpdatesInternal(userId, updates, res) {
  const watchlist = await getOrCreateWatchlist(userId);

  // Map of all anime currently in user's watchlist categories:
  const watchedMap = new Map();
  const watchedStrippedMap = new Map();
  for (const cat of watchlist.categories || []) {
    for (const a of cat.animes || []) {
      if (a) {
        const lower = a.toLowerCase().trim();
        watchedMap.set(lower, a);
        const stripped = lower.replace(/[^a-z0-9]/g, '');
        if (stripped.length >= 2) {
          watchedStrippedMap.set(stripped, a);
        }
      }
    }
  }

  // Map of all anime in the entire anime list:
  const allAnimes = scanAnimeImages();
  const allAnimesMap = new Map();
  const allAnimesStrippedMap = new Map();
  for (const a of allAnimes) {
    if (a && a.title) {
      const lower = a.title.toLowerCase().trim();
      allAnimesMap.set(lower, a.title);
      const stripped = lower.replace(/[^a-z0-9]/g, '');
      if (stripped.length >= 2) {
        allAnimesStrippedMap.set(stripped, a.title);
      }
    }
  }

  const updated = [];
  const unmatched = [];

  for (const item of updates) {
    let rawTitle = (item.rawTitle || item.title || '').trim();
    let rawDate = item.watchedAt;
    const delimMatch = rawTitle.match(/^(.+?)\s*<[-=]+>\s*(.+)$/);
    if (delimMatch) {
      rawTitle = delimMatch[1].trim();
      if (!rawDate) rawDate = delimMatch[2].trim();
    }
    let cleanTitle = (item.title || rawTitle).trim();
    const cleanMatch = cleanTitle.match(/^(.+?)\s*<[-=]+>/);
    if (cleanMatch) {
      cleanTitle = cleanMatch[1].trim();
    }
    const lower = cleanTitle.toLowerCase();
    const stripped = lower.replace(/[^a-z0-9]/g, '');

    // Find official DB title
    let officialDbTitle = allAnimesMap.get(lower) || (stripped ? allAnimesStrippedMap.get(stripped) : null);

    // 1. Verify existence in entire anime list
    if (!officialDbTitle) {
      unmatched.push({
        title: rawTitle || cleanTitle,
        reason: 'not_in_db',
        message: 'Not found in anime database'
      });
      continue;
    }

    // 2. Verify presence in user's watchlist (already watched)
    let officialWatchedTitle = watchedMap.get(lower) || 
                               watchedMap.get(officialDbTitle.toLowerCase().trim()) || 
                               (stripped ? watchedStrippedMap.get(stripped) : null);

    if (!officialWatchedTitle) {
      unmatched.push({
        title: rawTitle || cleanTitle,
        reason: 'not_in_watchlist',
        message: 'Not in your watchlist'
      });
      continue;
    }

    // 3. Parse date
    const parsedDate = parseServerCustomDate(rawDate);
    if (!parsedDate) {
      unmatched.push({
        title: rawTitle || cleanTitle,
        reason: 'invalid_date',
        message: 'Invalid date/time format'
      });
      continue;
    }

    watchlist.setWatchedDate(officialWatchedTitle, parsedDate);
    updated.push({
      title: officialWatchedTitle,
      watchedAt: parsedDate
    });
  }

  if (updated.length > 0) {
    watchlist.markModified('animeWatchedDates');
    await watchlist.save();
  }

  return res.json({
    success: true,
    message: `Successfully updated watch time for ${updated.length} anime!${unmatched.length > 0 ? ` (${unmatched.length} skipped - not in watchlist or not in anime database)` : ''}`,
    updatedCount: updated.length,
    updated,
    unmatched,
    watchlist
  });
}

// POST /api/watchlist/update-watch-times -> Update watch dates for specified animes in user's watchlist
router.post('/update-watch-times', authenticateToken, async (req, res) => {
  try {
    const { updates } = req.body;
    const userId = req.user.userId;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Please provide at least one anime watch time update.' });
    }

    await handleWatchTimeUpdatesInternal(userId, updates, res);
  } catch (err) {
    console.error('Error in /api/watchlist/update-watch-times:', err);
    res.status(500).json({ error: 'Failed to update anime watch times.' });
  }
});

// POST /api/watchlist/import -> Import categories and animes in the exact order specified
// Strict Rules:
// 1. Never import an anime already present in user's watchlist (preserve existing watchlist)
// 2. Only insert an anime which is present in user's not completed (unwatched) list (exists in database & not yet watched)
router.post('/import', authenticateToken, async (req, res) => {
  try {
    const { blocks } = req.body;
    const userId = req.user.userId;

    if (!Array.isArray(blocks) || blocks.length === 0) {
      return res.status(400).json({ error: 'Please provide at least one category block to import.' });
    }

    // Automatic fallback: If any categoryName or anime title contains '<--->' or '<-->', this is a Watch Time update payload!
    const hasWatchTimeDelimiter = blocks.some(b => 
      (b.categoryName && /<[-=]+>/.test(b.categoryName)) ||
      (Array.isArray(b.animes) && b.animes.some(a => a && /<[-=]+>/.test(a)))
    );

    if (hasWatchTimeDelimiter) {
      const updates = [];
      const delimRegex = /^(.+?)\s*<[-=]+>\s*(.+)$/;
      for (const b of blocks) {
        if (b.categoryName) {
          const m = b.categoryName.match(delimRegex);
          if (m) {
            updates.push({
              rawTitle: m[1].trim(),
              title: m[1].trim(),
              watchedAt: m[2].trim()
            });
          } else if (/<[-=]+>/.test(b.categoryName)) {
            const p = b.categoryName.replace(/<[-=]+>.*/, '').trim();
            updates.push({
              rawTitle: p,
              title: p,
              watchedAt: ''
            });
          }
        }
        for (const a of (b.animes || [])) {
          if (a) {
            const m = a.match(delimRegex);
            if (m) {
              updates.push({
                rawTitle: m[1].trim(),
                title: m[1].trim(),
                watchedAt: m[2].trim()
              });
            } else if (/<[-=]+>/.test(a)) {
              const p = a.replace(/<[-=]+>.*/, '').trim();
              updates.push({
                rawTitle: p,
                title: p,
                watchedAt: ''
              });
            }
          }
        }
      }
      return await handleWatchTimeUpdatesInternal(userId, updates, res);
    }

    const watchlist = await getOrCreateWatchlist(userId);
    const oldCount = countTotalWatched(watchlist);

    // 1. Gather all existing watched animes in user's watchlist
    const existingWatchedSet = new Set();
    for (const cat of watchlist.categories || []) {
      for (const a of cat.animes || []) {
        if (a) existingWatchedSet.add(a.toLowerCase().trim());
      }
    }

    // 2. Gather all valid anime in the system (database)
    const allAnimes = scanAnimeImages();
    const allAnimesMap = new Map();
    for (const a of allAnimes) {
      if (a && a.title) allAnimesMap.set(a.title.toLowerCase().trim(), a.title);
    }

    // Validate and clean blocks: [ { categoryName: string, animes: string[] } ]
    const cleanedBlocks = [];
    const seenInThisImport = new Set();
    let skippedAlreadyWatchedCount = 0;
    let skippedNotInDbCount = 0;

    for (const b of blocks) {
      const catName = (b.categoryName || '').trim();
      if (!catName) continue;

      const animes = Array.isArray(b.animes)
        ? b.animes.map(a => (a || '').trim()).filter(Boolean)
        : [];

      const allowedBlockAnimes = [];

      for (const rawTitle of animes) {
        const lower = rawTitle.toLowerCase().trim();

        // Check if already in user's watchlist -> NEVER IMPORT
        if (existingWatchedSet.has(lower)) {
          skippedAlreadyWatchedCount++;
          continue;
        }

        // Check if exists in anime database -> If not in DB, DON'T IMPORT
        if (!allAnimesMap.has(lower)) {
          skippedNotInDbCount++;
          continue;
        }

        // Must be in not-completed (unwatched) list and not yet seen in this import payload
        if (!seenInThisImport.has(lower)) {
          seenInThisImport.add(lower);
          allowedBlockAnimes.push(allAnimesMap.get(lower));
        }
      }

      // Include block if it has allowed anime or if user explicitly created a category name
      if (allowedBlockAnimes.length > 0) {
        cleanedBlocks.push({
          categoryName: catName,
          animes: allowedBlockAnimes
        });
      }
    }

    if (cleanedBlocks.length === 0) {
      return res.status(400).json({
        error: `No valid unwatched anime found to import. (${skippedAlreadyWatchedCount} were already in your watchlist, ${skippedNotInDbCount} not found in anime database).`
      });
    }

    // Update existing categories or append new categories to the end
    // Existing categories preserve their order and all existing anime remain intact
    const maxExistingOrder = watchlist.categories.reduce((max, c) => Math.max(max, c.order != null ? c.order : 0), -1);
    let nextNewOrder = maxExistingOrder + 1;

    for (const block of cleanedBlocks) {
      const bLower = block.categoryName.toLowerCase();
      let existingCat = watchlist.categories.find(
        c => c.categoryName.toLowerCase() === bLower
      );

      if (existingCat) {
        // Update casing
        existingCat.categoryName = block.categoryName;
        // Append newly allowed animes to the end
        for (const title of block.animes) {
          if (!existingCat.animes.some(a => a.toLowerCase().trim() === title.toLowerCase().trim())) {
            existingCat.animes.push(title);
          }
        }
      } else {
        // Create new category appended to the end
        watchlist.categories.push({
          categoryName: block.categoryName,
          order: nextNewOrder++,
          animes: [...block.animes]
        });
      }
    }

    // Ensure watched dates are tracked for newly imported animes
    const importNow = new Date();
    for (const block of cleanedBlocks) {
      for (const title of (block.animes || [])) {
        watchlist.setWatchedDate(title, importNow);
      }
    }

    // Sort categories: existing categories preserve their exact order, new categories placed at the end
    watchlist.categories.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Normalize order index
    watchlist.categories.forEach((cat, idx) => {
      cat.order = idx;
    });

    await watchlist.save();

    // Check if reached a multiple of 25 milestone
    const newCount = countTotalWatched(watchlist);
    await checkAndSendMilestoneNotifications(userId, oldCount, newCount);

    const totalCategories = cleanedBlocks.length;
    let totalAnimes = 0;
    cleanedBlocks.forEach(b => totalAnimes += b.animes.length);

    let message = `Successfully imported ${totalAnimes} unwatched anime into ${totalCategories} category/categories!`;
    if (skippedAlreadyWatchedCount > 0 || skippedNotInDbCount > 0) {
      const details = [];
      if (skippedAlreadyWatchedCount > 0) details.push(`${skippedAlreadyWatchedCount} already in watchlist`);
      if (skippedNotInDbCount > 0) details.push(`${skippedNotInDbCount} not in anime database`);
      message += ` (${details.join(', ')} skipped)`;
    }

    res.json({
      message,
      importedCount: totalAnimes,
      skippedAlreadyWatchedCount,
      skippedNotInDbCount,
      watchlist
    });
  } catch (err) {
    console.error('Error in /api/watchlist/import:', err);
    res.status(500).json({ error: 'Failed to import watchlist.' });
  }
});

router.ensureAllDefaultWatchedDates = ensureAllDefaultWatchedDates;
module.exports = router;
