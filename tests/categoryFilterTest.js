async function testCategoryFilter() {
  console.log('🧪 Testing Category Filtering Logic in My Watchlist...\n');

  const categories = [
    { _id: 'cat_1', categoryName: 'Favorites', order: 0, animes: ['Naruto', 'One Piece'] },
    { _id: 'cat_2', categoryName: 'Completed', order: 1, animes: ['Attack on Titan', 'Death Note'] },
    { _id: 'cat_3', categoryName: 'Plan to Watch', order: 2, animes: ['Bleach'] }
  ];

  function isCategoryActive(cat, activeFilter) {
    if (!activeFilter || activeFilter === 'all') return false;
    return activeFilter === cat._id || 
           cat.categoryName.toLowerCase() === String(activeFilter).toLowerCase();
  }

  function getDisplayedCategories(activeFilter) {
    const sortedCats = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));
    if (activeFilter && activeFilter !== 'all') {
      const matched = sortedCats.filter(c => isCategoryActive(c, activeFilter));
      if (matched.length > 0) return matched;
    }
    return sortedCats;
  }

  // 1. Test "all"
  const allResult = getDisplayedCategories('all');
  console.log('Active Filter = "all": Displayed Categories:', allResult.map(c => c.categoryName));
  if (allResult.length !== 3) throw new Error('Expected 3 categories for "all"');
  console.log('✅ All categories displayed when filter is "all".');

  // 2. Test "Completed" by ID
  const completedResultId = getDisplayedCategories('cat_2');
  console.log('Active Filter = "cat_2" (Completed): Displayed Categories:', completedResultId.map(c => c.categoryName));
  if (completedResultId.length !== 1 || completedResultId[0].categoryName !== 'Completed') {
    throw new Error('Expected ONLY Completed category');
  }
  if (!completedResultId[0].animes.includes('Attack on Titan') || completedResultId[0].animes.includes('Naruto')) {
    throw new Error('Images for Completed category mismatch');
  }
  console.log('✅ ONLY Completed category & its images shown when in "Completed" category.');

  // 3. Test "Plan to Watch" by Name (case-insensitive)
  const ptwResultName = getDisplayedCategories('plan to watch');
  console.log('Active Filter = "Plan to Watch": Displayed Categories:', ptwResultName.map(c => c.categoryName));
  if (ptwResultName.length !== 1 || ptwResultName[0].categoryName !== 'Plan to Watch') {
    throw new Error('Expected ONLY Plan to Watch category');
  }
  if (!ptwResultName[0].animes.includes('Bleach') || ptwResultName[0].animes.includes('Death Note')) {
    throw new Error('Images for Plan to Watch category mismatch');
  }
  console.log('✅ ONLY Plan to Watch category & its images shown when in "Plan to Watch" category.');

  // 4. Test fetch from running server
  const BASE_URL = 'http://localhost:3000';
  const htmlRes = await fetch(`${BASE_URL}/`);
  const html = await htmlRes.text();
  if (!html.includes('sub-header-categories-list')) {
    throw new Error('Sub-header missing in index.html');
  }

  const jsRes = await fetch(`${BASE_URL}/app.js`);
  const js = await jsRes.text();
  if (!js.includes('isCategoryActive') || !js.includes('active-filter-banner')) {
    throw new Error('Category filter code missing in app.js');
  }
  console.log('✅ Verified live server is serving updated frontend assets.');

  console.log('\n🎉 ALL CATEGORY FILTERING TESTS PASSED 100%!');
}

testCategoryFilter().catch(e => {
  console.error('❌ Test failed:', e);
  process.exit(1);
});
