require('dotenv').config();
const mongoose = require('mongoose');

async function testFeatures() {
  console.log('🧪 Testing New Features & Shift-Selection Algorithm...\n');

  // Test Shift-Click Algorithm directly
  // 1-indexed cards 1 to 10 -> 0-indexed indices 0 to 9
  const allTitles = ['Anime 1', 'Anime 2', 'Anime 3', 'Anime 4', 'Anime 5', 'Anime 6', 'Anime 7', 'Anime 8', 'Anime 9', 'Anime 10'];
  let selectedAnimes = new Set(['Anime 2', 'Anime 10']); // 2 and 10 selected

  function simulateShiftClick(targetTitle) {
    const K = allTitles.indexOf(targetTitle);
    const selectedIndices = [];
    allTitles.forEach((t, idx) => {
      if (selectedAnimes.has(t)) selectedIndices.push(idx);
    });

    if (selectedIndices.length === 0) {
      selectedAnimes.add(targetTitle);
      return;
    }

    let nearestS = selectedIndices[0];
    let minDistance = Math.abs(nearestS - K);
    for (let i = 1; i < selectedIndices.length; i++) {
      const dist = Math.abs(selectedIndices[i] - K);
      if (dist < minDistance) {
        minDistance = dist;
        nearestS = selectedIndices[i];
      }
    }

    const S = nearestS;
    if (K > S) {
      for (let i = S + 1; i <= K; i++) {
        selectedAnimes.add(allTitles[i]);
      }
    } else if (K < S) {
      for (let i = K; i < S; i++) {
        selectedAnimes.add(allTitles[i]);
      }
    }
  }

  // Step 1: Currently 2, 10 are selected.
  // Shift + select 4: nearest is 2 -> should select 3 and 4!
  simulateShiftClick('Anime 4');
  console.log('After Shift-selecting Anime 4:', Array.from(selectedAnimes));
  if (!selectedAnimes.has('Anime 3') || !selectedAnimes.has('Anime 4')) {
    throw new Error('Shift-click on 4 did not select 3 and 4!');
  }
  console.log('✅ Example 1 Passed: Shift + select 4 selected 3 and 4 (nearest was 2).');

  // Reset to 2, 10
  selectedAnimes = new Set(['Anime 2', 'Anime 10']);
  // Step 2: Currently 2, 10 are selected.
  // Shift + select 8: nearest is 10 -> should select 8 and 9!
  simulateShiftClick('Anime 8');
  console.log('After Shift-selecting Anime 8:', Array.from(selectedAnimes));
  if (!selectedAnimes.has('Anime 8') || !selectedAnimes.has('Anime 9')) {
    throw new Error('Shift-click on 8 did not select 8 and 9!');
  }
  console.log('✅ Example 2 Passed: Shift + select 8 selected 8 and 9 (nearest was 10).');

  // Test Server Endpoints
  const BASE_URL = 'http://localhost:3000';
  const usersRes = await fetch(`${BASE_URL}/api/users`);
  const users = await usersRes.json();
  console.log(`✅ Fetched ${users.length} community users for Browse view directory.`);

  // Test HTML & JS assets
  const htmlRes = await fetch(`${BASE_URL}/`);
  const html = await htmlRes.text();
  if (!html.includes('watchlist-sub-header') || !html.includes('floating-selection-bar') || !html.includes('browse-users-grid')) {
    throw new Error('Missing new DOM components in index.html!');
  }
  console.log('✅ Verified new DOM elements present in index.html.');

  const jsRes = await fetch(`${BASE_URL}/app.js`);
  const js = await jsRes.text();
  if (!js.includes('renderWatchlistSubHeader') || !js.includes('handleSelectionClick') || !js.includes('copyAnimeTitle')) {
    throw new Error('Missing new functions in app.js!');
  }
  console.log('✅ Verified new functions present in app.js.');

  console.log('\n🎉 ALL NEW FEATURE TESTS PASSED SUCCESSFULLY!');
}

testFeatures().catch(e => {
  console.error('❌ Test failed:', e);
  process.exit(1);
});
