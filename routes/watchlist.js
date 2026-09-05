const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Watchlist = require('../models/Watchlist');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { authenticateToken } = require('../middleware/auth');
const { scanAnimeImages } = require('../utils/imageScanner');

/**
 * Helper to ensure a user has a watchlist document
 */
async function getOrCreateWatchlist(userId) {
  let watchlist = await Watchlist.findOne({ userId });
  if (!watchlist) {
    watchlist = new Watchlist({
      userId,
      categories: []
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

    // Add unique titles to target category
    for (const title of normalizedTitles) {
      if (!targetCategory.animes.some(a => a.toLowerCase().trim() === title.toLowerCase())) {
        targetCategory.animes.push(title);
      }
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

// POST /api/watchlist/import -> Import categories and animes in the exact order specified
router.post('/import', authenticateToken, async (req, res) => {
  try {
    const { blocks } = req.body;
    const userId = req.user.userId;

    if (!Array.isArray(blocks) || blocks.length === 0) {
      return res.status(400).json({ error: 'Please provide at least one category block to import.' });
    }

    const watchlist = await getOrCreateWatchlist(userId);
    const oldCount = countTotalWatched(watchlist);

    // Validate and clean blocks: [ { categoryName: string, animes: string[] } ]
    const cleanedBlocks = [];
    const allImportedTitlesSet = new Set();

    for (const b of blocks) {
      const catName = (b.categoryName || '').trim();
      if (!catName) continue;

      const animes = Array.isArray(b.animes)
        ? b.animes.map(a => (a || '').trim()).filter(Boolean)
        : [];

      // Avoid duplicates within the same category block while preserving order
      const uniqueBlockAnimes = [];
      const seenInBlock = new Set();
      for (const title of animes) {
        const lower = title.toLowerCase();
        if (!seenInBlock.has(lower)) {
          seenInBlock.add(lower);
          uniqueBlockAnimes.push(title);
          allImportedTitlesSet.add(lower);
        }
      }

      cleanedBlocks.push({
        categoryName: catName,
        animes: uniqueBlockAnimes
      });
    }

    if (cleanedBlocks.length === 0) {
      return res.status(400).json({ error: 'No valid categories found in import data.' });
    }

    // Strict Rule: Remove all imported animes from existing categories first
    // so no anime exists in more than one category in the user's watchlist
    for (const cat of watchlist.categories) {
      cat.animes = cat.animes.filter(a => !allImportedTitlesSet.has(a.toLowerCase().trim()));
    }

    // Map of imported categories by lowercase name
    const importedOrderMap = new Map();
    cleanedBlocks.forEach((block, idx) => {
      importedOrderMap.set(block.categoryName.toLowerCase(), idx);
    });

    // Update existing categories or create new ones
    for (const block of cleanedBlocks) {
      let existingCat = watchlist.categories.find(
        c => c.categoryName.toLowerCase() === block.categoryName.toLowerCase()
      );

      if (existingCat) {
        // Update casing
        existingCat.categoryName = block.categoryName;
        // Append animes in exact requested order
        for (const title of block.animes) {
          if (!existingCat.animes.some(a => a.toLowerCase().trim() === title.toLowerCase().trim())) {
            existingCat.animes.push(title);
          }
        }
      } else {
        // Create new category
        watchlist.categories.push({
          categoryName: block.categoryName,
          order: watchlist.categories.length,
          animes: [...block.animes]
        });
      }
    }

    // Reorder categories so imported categories appear in the exact order provided (0, 1, 2...),
    // followed by any pre-existing categories that were not part of this import
    watchlist.categories.sort((a, b) => {
      const aLower = a.categoryName.toLowerCase();
      const bLower = b.categoryName.toLowerCase();
      const aImportIdx = importedOrderMap.has(aLower) ? importedOrderMap.get(aLower) : 10000 + (a.order || 0);
      const bImportIdx = importedOrderMap.has(bLower) ? importedOrderMap.get(bLower) : 10000 + (b.order || 0);
      return aImportIdx - bImportIdx;
    });

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

    res.json({
      message: `Successfully imported ${totalCategories} category/categories and ${totalAnimes} anime into your watchlist!`,
      watchlist
    });
  } catch (err) {
    console.error('Error in /api/watchlist/import:', err);
    res.status(500).json({ error: 'Failed to import watchlist.' });
  }
});

module.exports = router;
