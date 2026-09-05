require('dotenv').config();
const mongoose = require('mongoose');
const http = require('http');
const { scanAnimeImages } = require('../utils/imageScanner');
const User = require('../models/User');
const Watchlist = require('../models/Watchlist');

const PORT = 3001; // use separate port for test
let server;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log('🧪 Starting Full System Integration Tests...\n');

  try {
    // 1. Connect DB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected.');

    // 2. Start express server on PORT
    const expressApp = require('express')();
    // We can require the configured app from a separate entry or require routes
    const express = require('express');
    const testApp = express();
    const cors = require('cors');
    const path = require('path');

    testApp.use(cors());
    testApp.use(express.json());
    testApp.use('/images', express.static(path.join(__dirname, '..', 'Images')));
    testApp.use('/api', require('../routes/auth'));
    testApp.use('/api/animes', require('../routes/anime'));
    testApp.use('/api/watchlist', require('../routes/watchlist'));

    server = testApp.listen(0, () => {
      const actualPort = server.address().port;
      console.log(`✅ Test server running on port ${actualPort}`);
    });
    const actualPort = server.address().port;
    const testBaseUrl = `http://localhost:${actualPort}`;

    // Clean up test users if they exist
    await User.deleteMany({ username: { $in: ['test_user_alpha', 'test_user_beta'] } });

    // 3. Test Anime Image Scanner
    const scanned = scanAnimeImages();
    console.log(`✅ Scanned ${scanned.length} anime images from ./Images (e.g. ${scanned.slice(0, 2).map(a => a.title).join(', ')})`);
    if (scanned.length === 0) throw new Error('No images scanned from ./Images!');

    // 4. Test Registration (User A)
    const regResA = await fetch(`${testBaseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_user_alpha', password: 'password123' })
    });
    const regDataA = await regResA.json();
    if (!regResA.ok) throw new Error(`Register User A failed: ${regDataA.error}`);
    const tokenA = regDataA.token;
    const userA = regDataA.user;
    console.log(`✅ Registered User A: ${userA.username} (${userA._id})`);

    // 5. Test Registration (User B)
    const regResB = await fetch(`${testBaseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_user_beta', password: 'password123' })
    });
    const regDataB = await regResB.json();
    if (!regResB.ok) throw new Error(`Register User B failed: ${regDataB.error}`);
    const tokenB = regDataB.token;
    const userB = regDataB.user;
    console.log(`✅ Registered User B: ${userB.username} (${userB._id})`);

    // 6. Test Login (User A)
    const loginRes = await fetch(`${testBaseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_user_alpha', password: 'password123' })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error(`Login failed: ${loginData.error}`);
    console.log('✅ Login verified successfully.');

    // 7. Test Add Custom Category for User A
    const addCatRes = await fetch(`${testBaseUrl}/api/watchlist/category`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({ categoryName: 'S-Tier' })
    });
    const addCatData = await addCatRes.json();
    if (!addCatRes.ok) throw new Error(`Add category failed: ${addCatData.error}`);
    console.log('✅ Created custom category "S-Tier" for User A.');

    const sTierCategory = addCatData.watchlist.categories.find(c => c.categoryName === 'S-Tier');

    // 8. Test Add Anime to Category
    const addAnimeRes1 = await fetch(`${testBaseUrl}/api/watchlist/add-anime`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({ animeTitle: 'Attack on Titan', categoryId: sTierCategory._id })
    });
    const addAnimeData1 = await addAnimeRes1.json();
    if (!addAnimeRes1.ok) throw new Error(`Add anime failed: ${addAnimeData1.error}`);
    console.log('✅ Added "Attack on Titan" to S-Tier.');

    // 9. Test Strict Rule: Add Attack on Titan to another category ("Favorites") -> verify it moves and is not duplicated
    const favCategory = addCatData.watchlist.categories.find(c => c.categoryName === 'Favorites');
    const moveAnimeRes = await fetch(`${testBaseUrl}/api/watchlist/add-anime`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({ animeTitle: 'Attack on Titan', categoryId: favCategory._id })
    });
    const moveAnimeData = await moveAnimeRes.json();
    if (!moveAnimeRes.ok) throw new Error(`Move anime failed: ${moveAnimeData.error}`);

    // Check count of Attack on Titan across all categories
    let countAOT = 0;
    moveAnimeData.watchlist.categories.forEach(cat => {
      cat.animes.forEach(title => {
        if (title.toLowerCase() === 'attack on titan') countAOT++;
      });
    });
    if (countAOT !== 1) throw new Error(`Strict Rule Violated! Attack on Titan appears ${countAOT} times!`);
    console.log('✅ Strict Category Rule verified: "Attack on Titan" moved and exists in exactly 1 category.');

    // 10. Add anime to User B's watchlist: "One Piece" and "Attack on Titan"
    const userBWatchlistRes = await fetch(`${testBaseUrl}/api/watchlist/${userB._id}`);
    const userBWatchlistData = await userBWatchlistRes.json();
    const userBCat = userBWatchlistData.watchlist.categories[0];

    await fetch(`${testBaseUrl}/api/watchlist/add-anime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}` },
      body: JSON.stringify({ animeTitle: 'One Piece', categoryId: userBCat._id })
    });
    await fetch(`${testBaseUrl}/api/watchlist/add-anime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}` },
      body: JSON.stringify({ animeTitle: 'Attack on Titan', categoryId: userBCat._id })
    });
    console.log('✅ Added "One Piece" and "Attack on Titan" to User B.');

    // 11. Test Global Stats endpoint
    const statsRes = await fetch(`${testBaseUrl}/api/animes/global-stats`);
    const statsData = await statsRes.json();
    console.log(`✅ Global stats retrieved. "Attack on Titan" watched by: ${statsData.stats['Attack on Titan']} users.`);
    if (statsData.stats['Attack on Titan'] !== 2) {
      throw new Error(`Expected Attack on Titan to have count 2, got: ${statsData.stats['Attack on Titan']}`);
    }

    // 12. Test Watchlist Comparison: Source = User A, Destination = User B
    // User A has watched: Attack on Titan
    // User B has watched: Attack on Titan, One Piece
    // Diff should be: [ "One Piece" ]
    const compareRes = await fetch(`${testBaseUrl}/api/watchlist/compare?source=${userA._id}&destination=${userB._id}`);
    const compareData = await compareRes.json();
    if (!compareRes.ok) throw new Error(`Compare failed: ${compareData.error}`);
    console.log(`✅ Comparison result: Destination (${userB.username}) has ${compareData.diffCount} diff anime compared to Source (${userA.username}).`);
    const diffTitles = compareData.diffAnimes.map(a => a.title);
    if (!diffTitles.includes('One Piece') || diffTitles.includes('Attack on Titan')) {
      throw new Error(`Unexpected diff titles: ${JSON.stringify(diffTitles)}`);
    }
    console.log(`✅ Compare logic verified! Unwatched recommendation: "${diffTitles.join(', ')}"`);

    // 13. Test Reordering
    const reorderRes = await fetch(`${testBaseUrl}/api/watchlist/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        categoryId: favCategory._id,
        animes: ['Attack on Titan']
      })
    });
    if (!reorderRes.ok) throw new Error('Reorder failed');
    console.log('✅ Reordering endpoint verified.');

    // 14. Test Delete Category
    const delCatRes = await fetch(`${testBaseUrl}/api/watchlist/category`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ categoryId: favCategory._id })
    });
    const delCatData = await delCatRes.json();
    if (!delCatRes.ok) throw new Error(`Delete category failed: ${delCatData.error}`);
    console.log('✅ Category deleted successfully.');

    // Clean up test users
    await User.deleteMany({ username: { $in: ['test_user_alpha', 'test_user_beta'] } });
    await Watchlist.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    console.log('✅ Test data cleaned up.');

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 100% FUNCTIONAL!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
    await mongoose.disconnect();
  }
}

runTests();
