/**
 * ANIX - Anime Watchlist & Visual Tracker
 * Frontend Application Logic (Vanilla JavaScript)
 */

// ==========================================
// STATE MANAGEMENT
// ==========================================
const state = {
  token: localStorage.getItem('anix_token') || null,
  currentUser: JSON.parse(localStorage.getItem('anix_user') || 'null'),
  currentView: 'watchlist', // 'watchlist' | 'unwatched' | 'browse' | 'compare'
  
  // Data caches
  allAnimeList: [], // Array of { title, fileName, imageUrl }
  globalStats: {},  // Map of { [title]: count }
  globalRankStats: {}, // Map of { [title]: rankSum }
  userWatchlist: null, // Watchlist document of currentUser { userId, categories: [...] }
  
  // Browse View state
  communityUsers: [],
  browseSelectedUserId: null,
  browseUserWatchlist: null,
  browseActiveCategoryFilter: 'all',
  urlBrowseUser: null,
  
  // Compare View state
  compareSourceId: null,
  compareDestId: null,
  compareResults: null, // { sourceUser, destinationUser, diffCount, diffAnimes: [...] }

  // Selection Mode state
  isSelectionMode: false,
  selectedAnimes: new Set(), // Set of selected anime titles
  activeCategoryFilter: 'all',
  batchActionType: null, // 'add' | 'move'
  watchlistAllSort: localStorage.getItem('anix_watchlist_all_sort') || 'default', // 'default' | 'alpha-asc' | 'alpha-desc' | 'popularity-desc'
  browseAllSort: 'default',

  // Row focus tracking
  focusedRowIndex: -1,

  // Search scope tracking
  watchlistSearchScope: 'category', // 'category' | 'global'
  unwatchedSearchScope: 'unwatched', // 'unwatched' | 'global'

  // Drag and Drop tracking
  draggedAnime: null,
  draggedSourceCatId: null,
  draggedCategoryId: null,

  // Admin user & password management (Irfan Yoichi only)
  adminUsersList: [],
  adminPasswordMasks: {}
};

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  initKeyboardShortcuts();
  initImageRenameHandler();
});

async function initApp() {
  if (state.token && state.currentUser) {
    try {
      const res = await apiRequest('/api/me');
      if (res && res.user) {
        state.currentUser = res.user;
        localStorage.setItem('anix_user', JSON.stringify(res.user));
        showApp();
        return;
      }
    } catch (e) {
      console.warn('Session expired or invalid, logging out.');
      logout();
    }
  }
  showAuth();
}

// ==========================================
// API HELPER
// ==========================================
async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  try {
    const res = await fetch(endpoint, {
      ...options,
      headers
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP Error ${res.status}`);
    }
    return data;
  } catch (err) {
    throw err;
  }
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'success', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconClass = 'fa-solid fa-circle-check';
  if (type === 'error') iconClass = 'fa-solid fa-triangle-exclamation';
  if (type === 'info') iconClass = 'fa-solid fa-circle-info';

  toast.innerHTML = `
    <i class="${iconClass} toast-icon"></i>
    <div class="toast-message">${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 300);
  }, duration);
}

// ==========================================
// AUTHENTICATION LOGIC
// ==========================================
let authMode = 'login'; // 'login' | 'register'

function switchAuthTab(mode) {
  authMode = mode;
  const loginTab = document.getElementById('auth-tab-login');
  const registerTab = document.getElementById('auth-tab-register');
  const submitText = document.getElementById('auth-btn-text');
  const togglePrompt = document.getElementById('auth-toggle-prompt');
  const errorMsg = document.getElementById('auth-error-msg');

  errorMsg.classList.add('hidden');
  errorMsg.textContent = '';

  if (mode === 'login') {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    submitText.textContent = 'Sign In';
    togglePrompt.innerHTML = `Don't have an account? <a href="#" onclick="switchAuthTab('register'); return false;">Register here</a>`;
  } else {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    submitText.textContent = 'Create Account';
    togglePrompt.innerHTML = `Already have an account? <a href="#" onclick="switchAuthTab('login'); return false;">Sign in here</a>`;
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const submitBtn = document.getElementById('auth-submit-btn');
  const errorMsg = document.getElementById('auth-error-msg');

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    errorMsg.textContent = 'Please provide both username and password.';
    errorMsg.classList.remove('hidden');
    return;
  }

  submitBtn.disabled = true;
  errorMsg.classList.add('hidden');

  try {
    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
    const res = await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    state.token = res.token;
    state.currentUser = res.user;
    localStorage.setItem('anix_token', res.token);
    localStorage.setItem('anix_user', JSON.stringify(res.user));

    showToast(authMode === 'login' ? 'Logged in successfully!' : 'Account registered successfully!', 'success');
    usernameInput.value = '';
    passwordInput.value = '';
    showApp();
  } catch (err) {
    errorMsg.textContent = err.message || 'Authentication failed.';
    errorMsg.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
  }
}

function logout() {
  state.token = null;
  state.currentUser = null;
  state.userWatchlist = null;
  state.selectedAnimes.clear();
  state.isSelectionMode = false;
  localStorage.removeItem('anix_token');
  localStorage.removeItem('anix_user');
  localStorage.removeItem('anix_last_view');
  localStorage.removeItem('anix_last_category');
  document.body.classList.remove('is-irfan-yoichi');
  const settingsBtn = document.getElementById('nav-btn-settings');
  if (settingsBtn) settingsBtn.classList.add('hidden');

  // Clear query parameters from URL on logout
  try {
    const url = new URL(window.location.href);
    url.search = '';
    window.history.replaceState({}, '', url.toString());
  } catch (e) {}

  showAuth();
  showToast('You have been logged out.', 'info');
}

function showAuth() {
  document.getElementById('auth-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

async function showApp() {
  document.getElementById('auth-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');
  document.getElementById('current-username').textContent = state.currentUser.username;

  const isIrfan = canEditAnimeImage();
  if (isIrfan) {
    document.body.classList.add('is-irfan-yoichi');
  } else {
    document.body.classList.remove('is-irfan-yoichi');
  }

  const settingsBtn = document.getElementById('nav-btn-settings');
  if (settingsBtn) {
    settingsBtn.classList.toggle('hidden', !isIrfan);
  }

  await loadCoreData();
  restoreViewFromUrl();
}

// ==========================================
// CORE DATA LOADING
// ==========================================
async function loadCoreData() {
  try {
    const [animes, statsData, watchlistData] = await Promise.all([
      apiRequest('/api/animes'),
      apiRequest('/api/animes/global-stats'),
      apiRequest(`/api/watchlist/${state.currentUser._id}`)
    ]);

    state.allAnimeList = animes || [];
    state.globalStats = statsData.stats || {};
    state.globalRankStats = statsData.rankStats || {};
    state.userWatchlist = watchlistData.watchlist;

    updateHeaderBadges();
  } catch (err) {
    console.error('Error loading core data:', err);
    showToast('Failed to load anime data.', 'error');
  }
}

function updateHeaderBadges() {
  const watchedSet = getWatchedTitlesSet();
  const totalAll = state.allAnimeList.length;
  const totalWatched = watchedSet.size;
  const totalUnwatched = Math.max(0, totalAll - totalWatched);

  // Update navbar badges
  const watchedBadge = document.getElementById('nav-watched-badge');
  const unwatchedBadge = document.getElementById('nav-unwatched-badge');
  if (watchedBadge) watchedBadge.textContent = totalWatched;
  if (unwatchedBadge) unwatchedBadge.textContent = totalUnwatched;

  // Update watchlist stats strip
  const statWatched = document.getElementById('stats-total-watched');
  const statCats = document.getElementById('stats-total-categories');
  const statRemain = document.getElementById('stats-total-remaining');
  if (statWatched) statWatched.textContent = totalWatched;
  if (statCats) statCats.textContent = state.userWatchlist?.categories?.length || 0;
  if (statRemain) statRemain.textContent = totalUnwatched;

  // Refresh secondary subheader if in watchlist
  if (state.currentView === 'watchlist') {
    renderWatchlistSubHeader();
  }
}

function getWatchedTitlesSet(watchlist = state.userWatchlist) {
  const set = new Set();
  if (watchlist && Array.isArray(watchlist.categories)) {
    for (const cat of watchlist.categories) {
      if (Array.isArray(cat.animes)) {
        for (const title of cat.animes) {
          if (title) set.add(title.toLowerCase().trim());
        }
      }
    }
  }
  return set;
}

function findAnimeMeta(title) {
  if (!title) return null;
  const clean = title.toLowerCase().trim();
  const found = state.allAnimeList.find(a => a.title.toLowerCase().trim() === clean);
  if (found) return found;
  return {
    title: title,
    fileName: `${title}.jpg`,
    imageUrl: `/images/${encodeURIComponent(title)}.jpg`
  };
}

// ==========================================
// VIEW SWITCHING & URL ROUTING
// ==========================================
function updateUrlParams(viewName, categoryNameOrId = null, extraUser = null) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('view', viewName);

    if (viewName === 'watchlist') {
      url.searchParams.delete('user');
      if (categoryNameOrId && categoryNameOrId !== 'all') {
        let catName = categoryNameOrId;
        const foundCat = state.userWatchlist?.categories?.find(c => 
          c._id === categoryNameOrId || 
          c.categoryName.toLowerCase() === String(categoryNameOrId).toLowerCase()
        );
        if (foundCat) catName = foundCat.categoryName;
        url.searchParams.set('category', catName);
        localStorage.setItem('anix_last_category', catName);
      } else {
        url.searchParams.delete('category');
        localStorage.setItem('anix_last_category', 'all');
      }
    } else if (viewName === 'browse') {
      const browseUsername = extraUser || (state.browseSelectedUserId ? state.communityUsers.find(u => u._id === state.browseSelectedUserId)?.username : null) || state.urlBrowseUser;
      if (browseUsername) {
        url.searchParams.set('user', browseUsername);
        localStorage.setItem('anix_last_browse_user', browseUsername);
      } else {
        url.searchParams.delete('user');
      }

      if (categoryNameOrId && categoryNameOrId !== 'all') {
        let catName = categoryNameOrId;
        const foundCat = state.browseUserWatchlist?.categories?.find(c =>
          c._id === categoryNameOrId ||
          c.categoryName.toLowerCase() === String(categoryNameOrId).toLowerCase()
        );
        if (foundCat) catName = foundCat.categoryName;
        url.searchParams.set('category', catName);
        localStorage.setItem('anix_last_browse_category', catName);
      } else {
        url.searchParams.delete('category');
        localStorage.setItem('anix_last_browse_category', 'all');
      }
    } else {
      url.searchParams.delete('category');
      url.searchParams.delete('user');
    }

    window.history.replaceState({ view: viewName, category: categoryNameOrId, user: extraUser }, '', url.toString());
    localStorage.setItem('anix_last_view', viewName);
  } catch (e) {
    console.warn('Failed to update URL parameters:', e);
  }
}

function restoreViewFromUrl() {
  try {
    const url = new URL(window.location.href);
    const viewParam = url.searchParams.get('view') || localStorage.getItem('anix_last_view') || 'watchlist';
    const catParam = url.searchParams.get('category');
    const userParam = url.searchParams.get('user');

    const validViews = ['watchlist', 'unwatched', 'browse', 'compare'];
    const targetView = validViews.includes(viewParam) ? viewParam : 'watchlist';

    if (targetView === 'watchlist') {
      const effectiveCat = catParam || localStorage.getItem('anix_last_category');
      if (effectiveCat && effectiveCat !== 'all') {
        const foundCat = state.userWatchlist?.categories?.find(c =>
          c._id === effectiveCat ||
          c.categoryName.toLowerCase() === String(effectiveCat).toLowerCase()
        );
        state.activeCategoryFilter = foundCat ? foundCat._id : 'all';
      } else {
        state.activeCategoryFilter = 'all';
      }
    } else if (targetView === 'browse') {
      const effectiveUser = userParam || localStorage.getItem('anix_last_browse_user');
      const effectiveCat = catParam || localStorage.getItem('anix_last_browse_category');
      state.urlBrowseUser = effectiveUser || null;
      state.browseActiveCategoryFilter = (effectiveCat && effectiveCat !== 'all') ? effectiveCat : 'all';
    }

    switchView(targetView, false);
    if (targetView === 'watchlist') {
      updateUrlParams(targetView, state.activeCategoryFilter);
    } else if (targetView === 'browse') {
      updateUrlParams(targetView, state.browseActiveCategoryFilter, state.urlBrowseUser);
    } else {
      updateUrlParams(targetView);
    }
  } catch (e) {
    console.warn('Failed to restore view from URL:', e);
    switchView('watchlist');
  }
}

window.addEventListener('popstate', () => {
  if (state.currentUser && state.token) {
    restoreViewFromUrl();
  }
});

function switchView(viewName, updateUrl = true) {
  clearRowFocus();
  state.currentView = viewName;

  if (updateUrl) {
    if (viewName === 'watchlist') {
      updateUrlParams(viewName, state.activeCategoryFilter);
    } else if (viewName === 'browse') {
      const user = state.communityUsers.find(u => u._id === state.browseSelectedUserId);
      updateUrlParams(viewName, state.browseActiveCategoryFilter, user?.username);
    } else {
      updateUrlParams(viewName);
    }
  }

  // Update tab buttons
  document.querySelectorAll('.nav-tab').forEach(tab => {
    if (tab.getAttribute('data-view') === viewName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Update view panels
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.add('hidden');
    panel.classList.remove('active');
  });

  const targetPanel = document.getElementById(`view-${viewName}`);
  if (targetPanel) {
    targetPanel.classList.remove('hidden');
    targetPanel.classList.add('active');
  }

  // Handle Secondary Watchlist Subheader (Categories as Headers)
  const subHeader = document.getElementById('watchlist-sub-header');
  if (subHeader) {
    if (viewName === 'watchlist') {
      subHeader.classList.remove('hidden');
      renderWatchlistSubHeader();
    } else {
      subHeader.classList.add('hidden');
    }
  }

  // Update floating bar and buttons based on view
  updateSelectionButtonTexts();
  updateSelectionUI();

  // Render view-specific content
  if (viewName === 'watchlist') {
    renderWatchlistView();
  } else if (viewName === 'unwatched') {
    renderUnwatchedView();
  } else if (viewName === 'browse') {
    renderBrowseView();
  } else if (viewName === 'compare') {
    renderCompareView();
  }
}

// ==========================================
// SEARCH & SCOPE CONTROLS
// ==========================================
function getActiveCategoryName() {
  if (!state.activeCategoryFilter || state.activeCategoryFilter === 'all') return 'All Categories';
  const cat = state.userWatchlist?.categories?.find(c => 
    c._id === state.activeCategoryFilter || 
    c.categoryName.toLowerCase() === String(state.activeCategoryFilter).toLowerCase()
  );
  return cat ? cat.categoryName : 'Category';
}

function findCategoryForAnime(title) {
  if (!state.userWatchlist || !state.userWatchlist.categories) return null;
  const key = title.toLowerCase().trim();
  for (const cat of state.userWatchlist.categories) {
    if (cat.animes && cat.animes.some(t => t.toLowerCase().trim() === key)) {
      return cat;
    }
  }
  return null;
}

function updateWatchlistSearchBadge() {
  const badge = document.getElementById('watchlist-search-scope-badge');
  const input = document.getElementById('watchlist-search');
  if (!badge) return;
  if (state.watchlistSearchScope === 'global') {
    badge.textContent = '🌐 All Images';
    badge.classList.add('global');
    if (input) input.placeholder = 'Search among all images...';
  } else {
    const catName = getActiveCategoryName();
    badge.textContent = catName.length > 14 ? catName.slice(0, 12) + '...' : catName;
    badge.classList.remove('global');
    if (input) input.placeholder = `Search in ${catName}... (Space)`;
  }
}

function toggleWatchlistSearchScope() {
  state.watchlistSearchScope = state.watchlistSearchScope === 'global' ? 'category' : 'global';
  updateWatchlistSearchBadge();
  const input = document.getElementById('watchlist-search');
  if (input) input.focus();
  renderWatchlistView();
}

function clearWatchlistSearch() {
  const input = document.getElementById('watchlist-search');
  if (input) input.value = '';
  const btn = document.getElementById('clear-watchlist-search-btn');
  if (btn) btn.classList.add('hidden');
  renderWatchlistView();
}

function handleWatchlistSearchInput() {
  const input = document.getElementById('watchlist-search');
  const btn = document.getElementById('clear-watchlist-search-btn');
  if (input && btn) {
    btn.classList.toggle('hidden', input.value.trim() === '');
  }
  renderWatchlistView();
}

function updateUnwatchedSearchBadge() {
  const badge = document.getElementById('unwatched-search-scope-badge');
  const input = document.getElementById('unwatched-search');
  if (!badge) return;
  if (state.unwatchedSearchScope === 'global') {
    badge.textContent = '🌐 All Images';
    badge.classList.add('global');
    if (input) input.placeholder = 'Search among all images...';
  } else {
    badge.textContent = 'Unwatched';
    badge.classList.remove('global');
    if (input) input.placeholder = 'Search unwatched... (Space)';
  }
}

function openWatchlistSearch(scope = null) {
  if (scope) state.watchlistSearchScope = scope;
  const wrap = document.getElementById('watchlist-search-wrap');
  const btn = document.getElementById('btn-open-watchlist-search');
  if (btn) btn.classList.add('hidden');
  if (wrap) wrap.classList.remove('hidden');
  updateWatchlistSearchBadge();
  const input = document.getElementById('watchlist-search');
  if (input) {
    setTimeout(() => {
      input.focus();
      input.select();
    }, 40);
  }
  renderWatchlistView();
}

function closeWatchlistSearch() {
  const wrap = document.getElementById('watchlist-search-wrap');
  const btn = document.getElementById('btn-open-watchlist-search');
  const input = document.getElementById('watchlist-search');
  if (input) input.value = '';
  const clearBtn = document.getElementById('clear-watchlist-search-btn');
  if (clearBtn) clearBtn.classList.add('hidden');
  if (wrap) wrap.classList.add('hidden');
  if (btn) btn.classList.remove('hidden');
  state.watchlistSearchScope = 'category';
  updateWatchlistSearchBadge();
  renderWatchlistView();
}

function openUnwatchedSearch(scope = null) {
  if (scope) state.unwatchedSearchScope = scope;
  const wrap = document.getElementById('unwatched-search-wrap');
  const btn = document.getElementById('btn-open-unwatched-search');
  if (btn) btn.classList.add('hidden');
  if (wrap) wrap.classList.remove('hidden');
  updateUnwatchedSearchBadge();
  const input = document.getElementById('unwatched-search');
  if (input) {
    setTimeout(() => {
      input.focus();
      input.select();
    }, 40);
  }
  renderUnwatchedView();
}

function closeUnwatchedSearch() {
  const wrap = document.getElementById('unwatched-search-wrap');
  const btn = document.getElementById('btn-open-unwatched-search');
  const input = document.getElementById('unwatched-search');
  if (input) input.value = '';
  const clearBtn = document.getElementById('clear-search-btn');
  if (clearBtn) clearBtn.classList.add('hidden');
  if (wrap) wrap.classList.add('hidden');
  if (btn) btn.classList.remove('hidden');
  state.unwatchedSearchScope = 'unwatched';
  updateUnwatchedSearchBadge();
  renderUnwatchedView();
}

function toggleUnwatchedSearchScope() {
  state.unwatchedSearchScope = state.unwatchedSearchScope === 'global' ? 'unwatched' : 'global';
  updateUnwatchedSearchBadge();
  const input = document.getElementById('unwatched-search');
  if (input) input.focus();
  renderUnwatchedView();
}

window.openWatchlistSearch = openWatchlistSearch;
window.closeWatchlistSearch = closeWatchlistSearch;
window.openUnwatchedSearch = openUnwatchedSearch;
window.closeUnwatchedSearch = closeUnwatchedSearch;
window.toggleWatchlistSearchScope = toggleWatchlistSearchScope;
window.clearWatchlistSearch = clearWatchlistSearch;
window.handleWatchlistSearchInput = handleWatchlistSearchInput;
window.toggleUnwatchedSearchScope = toggleUnwatchedSearchScope;

function handleWatchlistAllSortChange() {
  const select = document.getElementById('watchlist-all-sort');
  if (select) {
    state.watchlistAllSort = select.value;
    try {
      localStorage.setItem('anix_watchlist_all_sort', select.value);
    } catch (e) {}
  }
  renderWatchlistView();
}
window.handleWatchlistAllSortChange = handleWatchlistAllSortChange;

// ==========================================
// SECONDARY HEADER FOR "MY WATCHLIST" (CATEGORIES AS HEADERS)
// ==========================================
function isCategoryActive(cat) {
  if (!state.activeCategoryFilter || state.activeCategoryFilter === 'all') return false;
  return state.activeCategoryFilter === cat._id || 
         cat.categoryName.toLowerCase() === String(state.activeCategoryFilter).toLowerCase();
}

function renderWatchlistSubHeader() {
  const container = document.getElementById('sub-header-categories-list');
  if (!container) return;
  container.innerHTML = '';

  const categories = state.userWatchlist?.categories || [];
  const totalWatched = getWatchedTitlesSet().size;

  // "All Categories" chip
  const allChip = document.createElement('div');
  const isAllActive = !state.activeCategoryFilter || state.activeCategoryFilter === 'all';
  const allSortWrap = document.getElementById('watchlist-all-sort-wrap');
  if (allSortWrap) {
    allSortWrap.classList.toggle('hidden', !isAllActive);
  }
  allChip.className = `sub-cat-chip ${isAllActive ? 'active' : ''}`;
  allChip.innerHTML = `
    <i class="fa-solid fa-list-ul"></i>
    <span>All</span>
    <span class="sub-cat-badge">${totalWatched}</span>
  `;
  allChip.onclick = () => filterOrScrollCategory('all');
  container.appendChild(allChip);

  // Category headers/chips (draggable to reorder categories)
  const sortedCats = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));
  sortedCats.forEach(cat => {
    const isCatActive = isCategoryActive(cat);
    const chip = document.createElement('div');
    chip.className = `sub-cat-chip ${isCatActive ? 'active' : ''}`;
    chip.setAttribute('data-sub-cat-id', cat._id);
    chip.setAttribute('draggable', 'true');
    chip.setAttribute('title', `Click to view, double-click to rename, or drag to reorder "${cat.categoryName}"`);

    chip.innerHTML = `
      <i class="fa-solid fa-grip-vertical sub-cat-grip" title="Drag to reorder"></i>
      <i class="fa-solid fa-folder"></i>
      <span>${escapeHtml(cat.categoryName)}</span>
      <span class="sub-cat-badge">${cat.animes ? cat.animes.length : 0}</span>
    `;

    chip.onclick = () => filterOrScrollCategory(cat._id);
    chip.ondblclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openEditCategoryModal(cat._id, cat.categoryName);
    };

    // Category Chip Drag Start
    chip.addEventListener('dragstart', (e) => {
      state.draggedCategoryId = cat._id;
      state.draggedAnime = null;
      e.dataTransfer.setData('category/id', cat._id);
      e.dataTransfer.effectAllowed = 'move';
      chip.classList.add('dragging');
    });

    // Category Chip Drag End
    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
      state.draggedCategoryId = null;
      document.querySelectorAll('.sub-cat-chip').forEach(c => c.classList.remove('drag-over'));
      document.querySelectorAll('.category-block').forEach(b => b.classList.remove('cat-drag-over'));
    });

    // Category Chip Drag Over
    chip.addEventListener('dragover', (e) => {
      if (!state.draggedCategoryId || state.draggedCategoryId === cat._id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      chip.classList.add('drag-over');
    });

    // Category Chip Drag Leave
    chip.addEventListener('dragleave', (e) => {
      if (!chip.contains(e.relatedTarget)) {
        chip.classList.remove('drag-over');
      }
    });

    // Category Chip Drop
    chip.addEventListener('drop', (e) => {
      if (!state.draggedCategoryId || state.draggedCategoryId === cat._id) return;
      e.preventDefault();
      chip.classList.remove('drag-over');
      const sourceCatId = state.draggedCategoryId;
      state.draggedCategoryId = null;
      reorderCategoriesByDrag(sourceCatId, cat._id);
    });

    container.appendChild(chip);
  });

  updateSelectionButtonTexts();
}

function filterOrScrollCategory(catId) {
  clearRowFocus();
  state.activeCategoryFilter = catId;
  updateUrlParams('watchlist', catId);
  renderWatchlistSubHeader();
  updateWatchlistSearchBadge();
  renderWatchlistView();
}

// ==========================================
// SELECTION MODE LOGIC
// ==========================================
function toggleSelectionMode(forceValue = null) {
  clearRowFocus();
  if (forceValue !== null) {
    state.isSelectionMode = Boolean(forceValue);
  } else {
    state.isSelectionMode = !state.isSelectionMode;
  }

  if (!state.isSelectionMode) {
    state.selectedAnimes.clear();
  }

  document.body.classList.toggle('selection-mode-active', state.isSelectionMode);
  updateSelectionButtonTexts();
  updateSelectionUI();

  if (state.isSelectionMode) {
    showToast('Selection mode enabled. Click or Shift+Click cards to select.', 'info', 2500);
  } else {
    showToast('Selection mode exited.', 'info', 1500);
  }
}

function updateSelectionButtonTexts() {
  const labelText = `Selection Mode: ${state.isSelectionMode ? 'ON' : 'OFF'}`;
  
  const wlBtn = document.getElementById('btn-toggle-selection-watchlist');
  if (wlBtn) {
    wlBtn.classList.toggle('active', state.isSelectionMode);
    const span = wlBtn.querySelector('.selection-toggle-text');
    if (span) span.textContent = labelText;
    const icon = wlBtn.querySelector('i');
    if (icon) icon.className = state.isSelectionMode ? 'fa-solid fa-square-check' : 'fa-regular fa-square-check';
  }

  const uwBtn = document.getElementById('btn-toggle-selection-unwatched');
  if (uwBtn) {
    uwBtn.classList.toggle('active', state.isSelectionMode);
    const span = uwBtn.querySelector('.selection-toggle-text');
    if (span) span.textContent = labelText;
    const icon = uwBtn.querySelector('i');
    if (icon) icon.className = state.isSelectionMode ? 'fa-solid fa-square-check' : 'fa-regular fa-square-check';
  }
}

function updateSelectionUI() {
  // Update card visuals
  document.querySelectorAll('.anime-card').forEach(card => {
    const title = card.getAttribute('data-anime-title');
    const isSelected = state.selectedAnimes.has(title);
    card.classList.toggle('selected', isSelected);

    const chk = card.querySelector('.card-select-checkbox');
    if (chk) {
      chk.innerHTML = isSelected ? '<i class="fa-solid fa-check"></i>' : '';
    }
  });

  // Floating Action Bar
  const floatingBar = document.getElementById('floating-selection-bar');
  if (floatingBar) {
    if (state.isSelectionMode) {
      floatingBar.classList.remove('hidden');
      const countEl = document.getElementById('selection-count-num');
      if (countEl) countEl.textContent = state.selectedAnimes.size;

      const btnMoveAbove = document.getElementById('bar-btn-move-above');
      const btnMoveBelow = document.getElementById('bar-btn-move-below');
      const btnMove = document.getElementById('bar-btn-move');
      const btnRemove = document.getElementById('bar-btn-remove');
      const btnAdd = document.getElementById('bar-btn-add');

      const hasSelection = state.selectedAnimes.size > 0;

      if (state.currentView === 'watchlist') {
        if (btnMoveAbove) {
          btnMoveAbove.classList.remove('hidden');
          btnMoveAbove.disabled = !hasSelection;
          btnMoveAbove.style.opacity = hasSelection ? '1' : '0.4';
        }
        if (btnMoveBelow) {
          btnMoveBelow.classList.remove('hidden');
          btnMoveBelow.disabled = !hasSelection;
          btnMoveBelow.style.opacity = hasSelection ? '1' : '0.4';
        }
        if (btnMove) {
          btnMove.classList.remove('hidden');
          btnMove.disabled = !hasSelection;
          btnMove.style.opacity = hasSelection ? '1' : '0.4';
        }
        if (btnRemove) {
          btnRemove.classList.remove('hidden');
          btnRemove.disabled = !hasSelection;
          btnRemove.style.opacity = hasSelection ? '1' : '0.4';
        }
        if (btnAdd) btnAdd.classList.add('hidden');
      } else if (state.currentView === 'unwatched') {
        if (btnMoveAbove) btnMoveAbove.classList.add('hidden');
        if (btnMoveBelow) btnMoveBelow.classList.add('hidden');
        if (btnMove) btnMove.classList.add('hidden');
        if (btnRemove) btnRemove.classList.add('hidden');
        if (btnAdd) {
          btnAdd.classList.remove('hidden');
          btnAdd.disabled = !hasSelection;
          btnAdd.style.opacity = hasSelection ? '1' : '0.4';
        }
      } else {
        if (btnMoveAbove) btnMoveAbove.classList.add('hidden');
        if (btnMoveBelow) btnMoveBelow.classList.add('hidden');
        if (btnMove) btnMove.classList.add('hidden');
        if (btnRemove) btnRemove.classList.add('hidden');
        if (btnAdd) btnAdd.classList.add('hidden');
      }
    } else {
      floatingBar.classList.add('hidden');
    }
  }
}

function clearSelection() {
  state.selectedAnimes.clear();
  updateSelectionUI();
  showToast('Selection cleared.', 'info', 1500);
}

function copySelectedNames() {
  if (state.selectedAnimes.size === 0) {
    showToast('No anime selected.', 'info');
    return;
  }
  const list = Array.from(state.selectedAnimes).join(', ');
  navigator.clipboard.writeText(list).then(() => {
    showToast(`Copied ${state.selectedAnimes.size} anime title(s) to clipboard!`, 'info');
  });
}

function copyTextToClipboard(text) {
  if (!text) return;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).catch(() => {
      fallbackCopyText(text);
    });
  } else {
    fallbackCopyText(text);
  }
}

function fallbackCopyText(text) {
  try {
    const activeEl = document.activeElement;
    const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
    const selStart = isInputFocused ? activeEl.selectionStart : null;
    const selEnd = isInputFocused ? activeEl.selectionEnd : null;

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);

    if (isInputFocused && typeof activeEl.focus === 'function') {
      activeEl.focus();
      if (typeof selStart === 'number' && typeof selEnd === 'number') {
        activeEl.setSelectionRange(selStart, selEnd);
      }
    }
  } catch (err) {
    console.warn('Clipboard fallback copy failed:', err);
  }
}

function copyFirstSearchResultTitle(context) {
  let container = null;
  if (context === 'watchlist') {
    container = document.getElementById('categories-container');
  } else if (context === 'unwatched') {
    container = document.getElementById('unwatched-grid');
  } else {
    container = document.querySelector('.view-panel.active:not(.hidden)');
  }

  if (!container) return null;
  const firstTitleEl = container.querySelector('.anime-title');
  if (firstTitleEl) {
    const textToCopy = firstTitleEl.innerHTML;
    copyTextToClipboard(textToCopy);
    return textToCopy;
  }
  return null;
}

window.copyTextToClipboard = copyTextToClipboard;
window.copyFirstSearchResultTitle = copyFirstSearchResultTitle;

function copyAnimeTitle(title) {
  if (!title) return;
  copyTextToClipboard(title);
  showToast(`Copied "${title}" to clipboard!`, 'info', 2000);
}

/**
 * Handles image selection with Shift-key nearest neighbor range selection
 * Matching exact rule:
 * - Click without shift toggles item without deselecting others (ctrl+select behavior)
 * - Shift + click finds nearest selected item S and selects (S+1..K) or (K..S-1)
 * - Clicking outside does NOT unselect anything
 */
function handleSelectionClick(e, title, card) {
  e.preventDefault();
  e.stopPropagation();

  const grid = card.closest('.anime-grid') || document;
  const allCards = Array.from(grid.querySelectorAll('.anime-card'));
  const allTitles = allCards.map(c => c.getAttribute('data-anime-title'));
  const K = allTitles.indexOf(title);

  if (K === -1) return;

  if (!e.shiftKey) {
    // Normal click in selection mode: toggle this item without affecting other selected items
    if (state.selectedAnimes.has(title)) {
      state.selectedAnimes.delete(title);
    } else {
      state.selectedAnimes.add(title);
    }
  } else {
    // Shift + click: range selection from nearest selected item
    const selectedIndices = [];
    allTitles.forEach((t, idx) => {
      if (state.selectedAnimes.has(t)) {
        selectedIndices.push(idx);
      }
    });

    if (selectedIndices.length === 0) {
      // No previously selected items in this list, simply select K
      state.selectedAnimes.add(title);
    } else {
      // Find nearest selected index S that minimizes |S - K|
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
        // Nearest is before K: select from (S + 1) to K inclusive
        // (e.g. 2 was selected, K=4 -> selects 3 and 4)
        for (let i = S + 1; i <= K; i++) {
          state.selectedAnimes.add(allTitles[i]);
        }
      } else if (K < S) {
        // Nearest is after K: select from K to (S - 1) inclusive
        // (e.g. 10 was selected, K=8 -> selects 8 and 9)
        for (let i = K; i < S; i++) {
          state.selectedAnimes.add(allTitles[i]);
        }
      } else {
        // K === S: re-clicked already selected item with shift: toggle it off
        state.selectedAnimes.delete(title);
      }
    }
  }

  updateSelectionUI();
}

// ==========================================
// VIEW 1: MY WATCHLIST
// ==========================================
function renderWatchlistView() {
  const container = document.getElementById('categories-container');
  const emptyState = document.getElementById('watchlist-empty-state');
  container.innerHTML = '';

  const searchInput = document.getElementById('watchlist-search');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const clearBtn = document.getElementById('clear-watchlist-search-btn');
  if (clearBtn) clearBtn.classList.toggle('hidden', query === '');
  updateWatchlistSearchBadge();

  const categories = state.userWatchlist?.categories || [];

  if (categories.length === 0) {
    emptyState.classList.remove('hidden');
    renderWatchlistSubHeader();
    return;
  }
  emptyState.classList.add('hidden');

  // Sort categories by order
  const sortedCats = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));

  // GLOBAL SEARCH MODE (search across ALL anime images)
  if (query && state.watchlistSearchScope === 'global') {
    const matchedAnime = (state.allAnimeList || []).filter(a => a.title.toLowerCase().includes(query));
    if (matchedAnime.length === 0) {
      container.innerHTML = `
        <div class="empty-category-notice glass-card" style="padding: 3rem 1.5rem; border-radius: var(--radius-lg); border: 1px solid var(--border-glass);">
          <i class="fa-solid fa-magnifying-glass" style="font-size: 2.5rem; color: var(--text-dim); margin-bottom: 0.75rem;"></i>
          <h4 style="color: #fff; margin-bottom: 0.25rem;">No Matches Found</h4>
          <p style="color: var(--text-muted);">No anime found matching "<strong>${escapeHtml(query)}</strong>" across all images.</p>
        </div>
      `;
      renderWatchlistSubHeader();
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'anime-grid all-animes-grid';
    grid.id = 'cat-grid-search-global';

    matchedAnime.forEach((anime, idx) => {
      const cat = findCategoryForAnime(anime.title);
      const meta = findAnimeMeta(anime.title);
      let card;
      if (cat) {
        card = createWatchlistAnimeCard(anime.title, meta, cat._id, idx, matchedAnime.length, cat.categoryName, true);
      } else {
        card = createBrowseAnimeCard(anime.title, idx, 'Unwatched');
      }
      grid.appendChild(card);
    });

    container.appendChild(grid);
    triggerGridRowAlignment();
    renderWatchlistSubHeader();
    updateSelectionUI();
    copyFirstSearchResultTitle('watchlist');
    return;
  }

  // Determine if viewing "All" categories or a specific filtered category
  const isAll = !state.activeCategoryFilter || state.activeCategoryFilter === 'all';

  const allSortWrap = document.getElementById('watchlist-all-sort-wrap');
  if (allSortWrap) {
    allSortWrap.classList.toggle('hidden', !isAll);
    const select = document.getElementById('watchlist-all-sort');
    if (select && select.value !== state.watchlistAllSort) {
      select.value = state.watchlistAllSort || 'default';
    }
  }

  if (isAll) {
    // ----------------------------------------------------
    // UNIFIED "ALL" CATEGORIES VIEW:
    // Show all watched anime side-by-side in a continuous grid without category separation
    // ----------------------------------------------------
    const allWatched = [];
    sortedCats.forEach(cat => {
      (cat.animes || []).forEach((animeTitle, animeIdx) => {
        if (!query || animeTitle.toLowerCase().includes(query)) {
          allWatched.push({
            title: animeTitle,
            categoryId: cat._id,
            categoryName: cat.categoryName,
            catIndex: animeIdx,
            totalInCat: cat.animes.length
          });
        }
      });
    });

    // Apply sorting to the "All" category view
    const sortVal = state.watchlistAllSort || 'default';
    if (sortVal === 'alpha-asc') {
      allWatched.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    } else if (sortVal === 'alpha-desc') {
      allWatched.sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: 'base' }));
    } else if (sortVal === 'popularity-desc') {
      allWatched.sort((a, b) => {
        const keyA = a.title.toLowerCase().trim();
        const keyB = b.title.toLowerCase().trim();
        const popA = state.globalStats[a.title] ?? state.globalStats[keyA] ?? 0;
        const popB = state.globalStats[b.title] ?? state.globalStats[keyB] ?? 0;
        if (popB !== popA) return popB - popA;

        if (popA > 0) {
          const rankA = state.globalRankStats[a.title] ?? state.globalRankStats[keyA] ?? Infinity;
          const rankB = state.globalRankStats[b.title] ?? state.globalRankStats[keyB] ?? Infinity;
          if (rankA !== rankB) return rankA - rankB;
        }

        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      });
    }

    if (allWatched.length === 0) {
      container.innerHTML = `
        <div class="empty-category-notice glass-card" style="padding: 3rem 1.5rem; border-radius: var(--radius-lg); border: 1px solid var(--border-glass);">
          <i class="fa-solid fa-magnifying-glass" style="font-size: 2.5rem; color: var(--text-dim); margin-bottom: 0.75rem;"></i>
          <h4 style="color: #fff; margin-bottom: 0.25rem;">No Anime Found</h4>
          <p style="color: var(--text-muted);">${query ? `No anime matching "<strong>${escapeHtml(query)}</strong>" in your watchlist.` : `You haven't added any anime yet. Go to <a href="#" onclick="switchView('unwatched'); return false;" style="color: var(--secondary); text-decoration: underline;">Not Watched</a> to add anime to your categories!`}</p>
          ${query ? `<button class="btn btn-sm btn-outline" style="margin-top: 0.75rem;" onclick="toggleWatchlistSearchScope()"><i class="fa-solid fa-globe"></i> Search All Images (Shift+Space)</button>` : ''}
        </div>
      `;
      renderWatchlistSubHeader();
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'anime-grid all-animes-grid';
    grid.id = 'cat-grid-all';

    allWatched.forEach((item, globalIdx) => {
      const meta = findAnimeMeta(item.title);
      const card = createWatchlistAnimeCard(
        item.title,
        meta,
        item.categoryId,
        globalIdx,
        allWatched.length,
        item.categoryName,
        true // isAllView
      );
      grid.appendChild(card);
    });

    container.appendChild(grid);
    triggerGridRowAlignment();
    renderWatchlistSubHeader();
    updateSelectionUI();
    if (query) {
      copyFirstSearchResultTitle('watchlist');
    }
    return;
  }

  // ----------------------------------------------------
  // SINGLE CATEGORY FILTER VIEW:
  // Show only images belonging to the selected category (without active-filter-banner)
  // ----------------------------------------------------
  const matchedCats = sortedCats.filter(c => isCategoryActive(c));
  const displayedCats = matchedCats.length > 0 ? matchedCats : sortedCats;

  displayedCats.forEach((cat, catIdx) => {
    const catBlock = document.createElement('div');
    catBlock.className = 'category-block';
    catBlock.setAttribute('data-category-id', cat._id);

    const isFirst = catIdx === 0;
    const isLast = catIdx === displayedCats.length - 1;

    catBlock.innerHTML = `
      <div class="category-header" draggable="true" title="Double-click to rename, or drag to reorder category">
        <div class="category-title-wrap" title="Double-click to rename">
          <i class="fa-solid fa-grip-vertical category-drag-handle" title="Drag to reorder category"></i>
          <i class="fa-solid fa-folder-open text-highlight"></i>
          <h3 class="category-title">${escapeHtml(cat.categoryName)}</h3>
          <span class="category-count">${cat.animes ? cat.animes.length : 0} anime</span>
        </div>
        <div class="category-controls">
          <button class="btn btn-icon" title="Rename category" onclick="event.stopPropagation(); openEditCategoryModal('${cat._id}', '${escapeAttr(cat.categoryName)}')">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-icon" title="Move category up" onclick="reorderCategory('${cat._id}', -1)" ${isFirst || displayedCats.length === 1 ? 'disabled style="opacity:0.3"' : ''}>
            <i class="fa-solid fa-chevron-up"></i>
          </button>
          <button class="btn btn-icon" title="Move category down" onclick="reorderCategory('${cat._id}', 1)" ${isLast || displayedCats.length === 1 ? 'disabled style="opacity:0.3"' : ''}>
            <i class="fa-solid fa-chevron-down"></i>
          </button>
          <button class="btn btn-icon btn-danger" title="Delete category" onclick="openDeleteCategoryModal('${cat._id}', '${escapeAttr(cat.categoryName)}')">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
      <div class="category-body drop-zone" data-cat-id="${cat._id}" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, '${cat._id}')">
        <div class="anime-grid" id="cat-grid-${cat._id}"></div>
      </div>
    `;

    // Category drag-and-drop listeners for reordering blocks
    const catHeader = catBlock.querySelector('.category-header');
    catHeader.addEventListener('dblclick', (e) => {
      if (e.target.closest('button') || e.target.closest('.category-controls')) return;
      e.preventDefault();
      e.stopPropagation();
      openEditCategoryModal(cat._id, cat.categoryName);
    });

    catHeader.addEventListener('dragstart', (e) => {
      if (e.target.closest('button') || e.target.closest('.category-controls')) {
        e.preventDefault();
        return;
      }
      state.draggedCategoryId = cat._id;
      state.draggedAnime = null;
      e.dataTransfer.setData('category/id', cat._id);
      e.dataTransfer.effectAllowed = 'move';
      catBlock.classList.add('cat-dragging');
    });

    catHeader.addEventListener('dragend', () => {
      catBlock.classList.remove('cat-dragging');
      state.draggedCategoryId = null;
      document.querySelectorAll('.category-block').forEach(b => b.classList.remove('cat-drag-over'));
      document.querySelectorAll('.sub-cat-chip').forEach(c => c.classList.remove('drag-over'));
    });

    catBlock.addEventListener('dragover', (e) => {
      if (!state.draggedCategoryId || state.draggedCategoryId === cat._id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      catBlock.classList.add('cat-drag-over');
    });

    catBlock.addEventListener('dragleave', (e) => {
      if (!catBlock.contains(e.relatedTarget)) {
        catBlock.classList.remove('cat-drag-over');
      }
    });

    catBlock.addEventListener('drop', (e) => {
      if (!state.draggedCategoryId || state.draggedCategoryId === cat._id) return;
      e.preventDefault();
      catBlock.classList.remove('cat-drag-over');
      const sourceCatId = state.draggedCategoryId;
      state.draggedCategoryId = null;
      reorderCategoriesByDrag(sourceCatId, cat._id);
    });

    const grid = catBlock.querySelector(`#cat-grid-${cat._id}`);

    const displayedAnimes = (cat.animes || []).filter(t => !query || t.toLowerCase().includes(query));

    if (!cat.animes || cat.animes.length === 0) {
      grid.parentElement.innerHTML = `
        <div class="empty-category-notice">
          <i class="fa-regular fa-folder-open"></i>
          <p>No anime in this category yet. Add from <strong>Not Watched</strong> or drag an anime card here!</p>
        </div>
      `;
    } else if (displayedAnimes.length === 0) {
      grid.parentElement.innerHTML = `
        <div class="empty-category-notice" style="padding: 2rem;">
          <i class="fa-solid fa-magnifying-glass"></i>
          <p>No matches for "<strong>${escapeHtml(query)}</strong>" in this category.</p>
          <button class="btn btn-sm btn-outline" style="margin-top: 0.5rem;" onclick="toggleWatchlistSearchScope()">
            <i class="fa-solid fa-globe"></i> Search All Images (Shift+Space)
          </button>
        </div>
      `;
    } else {
      displayedAnimes.forEach((animeTitle, animeIdx) => {
        const meta = findAnimeMeta(animeTitle);
        const card = createWatchlistAnimeCard(animeTitle, meta, cat._id, animeIdx, displayedAnimes.length, null, false);
        grid.appendChild(card);
      });
    }

    container.appendChild(catBlock);
  });

  renderWatchlistSubHeader();
  updateSelectionUI();
  triggerGridRowAlignment();
  if (query) {
    copyFirstSearchResultTitle('watchlist');
  }
}

// Dynamic Grid Row Poster Alignment
// Ensures all cards in the same row have matching poster-wrap heights so image names are strictly on the same line
let gridAlignRaf = null;

function triggerGridRowAlignment() {
  if (gridAlignRaf) cancelAnimationFrame(gridAlignRaf);
  gridAlignRaf = requestAnimationFrame(() => {
    alignGridRowPosters();
  });
}
window.triggerGridRowAlignment = triggerGridRowAlignment;

function alignGridRowPosters() {
  const grids = document.querySelectorAll('.anime-grid');
  grids.forEach(grid => {
    const cards = Array.from(grid.querySelectorAll('.anime-card'));
    if (cards.length === 0) return;

    // Reset poster wraps first to allow natural sizing
    cards.forEach(card => {
      const wrap = card.querySelector('.card-poster-wrap');
      if (wrap) wrap.style.minHeight = '';
    });

    // Group cards by their row position using offsetTop rounded to 8px
    const rows = new Map();
    cards.forEach(card => {
      const top = Math.round(card.offsetTop / 8) * 8;
      if (!rows.has(top)) rows.set(top, []);
      rows.get(top).push(card);
    });

    rows.forEach(rowCards => {
      let maxImgH = 0;
      rowCards.forEach(card => {
        const img = card.querySelector('.card-poster');
        if (img) {
          const h = img.offsetHeight || 0;
          if (h > maxImgH) maxImgH = h;
        }
      });
      if (maxImgH > 0) {
        rowCards.forEach(card => {
          const wrap = card.querySelector('.card-poster-wrap');
          if (wrap) wrap.style.minHeight = `${maxImgH}px`;
        });
      }
    });
  });
}
window.alignGridRowPosters = alignGridRowPosters;
window.addEventListener('resize', triggerGridRowAlignment);

function createWatchlistAnimeCard(title, meta, categoryId, index, totalInCat, categoryName = null, isAllView = false) {
  const card = document.createElement('div');
  card.className = 'anime-card';
  card.setAttribute('draggable', 'true');
  card.setAttribute('data-anime-title', title);
  card.setAttribute('data-category-id', categoryId);

  // Drag and drop listeners for card reordering
  card.addEventListener('dragstart', (e) => handleDragStart(e, title, categoryId));
  card.addEventListener('dragend', handleDragEnd);
  card.addEventListener('dragover', (e) => handleCardDragOver(e, card));
  card.addEventListener('dragleave', (e) => handleCardDragLeave(e, card));
  card.addEventListener('drop', (e) => handleCardDrop(e, title, categoryId, card));

  // Click listener for copy or selection (ignoring buttons and fire icon badge)
  card.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target.closest('.btn') || e.target.closest('.card-actions') || e.target.closest('.pop-badge')) {
      return;
    }
    if (state.isSelectionMode) {
      handleSelectionClick(e, title, card);
    } else {
      copyAnimeTitle(title);
    }
  });

  const popCount = state.globalStats[title] || 0;
  const isFirst = index === 0;
  const isLast = index === totalInCat - 1;
  const isSelected = state.selectedAnimes.has(title);

  if (isSelected) card.classList.add('selected');

  card.innerHTML = `
    <div class="card-poster-wrap">
      <div class="card-select-checkbox">${isSelected ? '<i class="fa-solid fa-check"></i>' : ''}</div>
      <img class="card-poster" src="${meta ? meta.imageUrl : `/images/${encodeURIComponent(title)}.jpg`}" alt="${escapeAttr(title)}" loading="lazy" onload="triggerGridRowAlignment()" onerror="this.src='/images/Naruto.jpg'; triggerGridRowAlignment();">
      <div class="pop-badge ${popCount > 0 ? 'pop-hot' : ''}" title="Click to view who watched (${popCount} user${popCount === 1 ? '' : 's'})" onclick="event.stopPropagation(); showAnimeWatchersModal('${escapeAttr(title)}')">
        <i class="fa-solid fa-fire"></i> ${popCount}
      </div>
      <div class="order-badge" title="${isAllView ? 'Overall watched order' : 'Rank in category'}">#${index + 1}</div>
      <div class="copy-hover-badge"><i class="fa-regular fa-copy"></i> Click to copy</div>
    </div>
    <div class="card-content">
      <h4 class="anime-title" title="${escapeAttr(title)}">${escapeHtml(title)}</h4>
      ${categoryName ? `
        <div class="card-cat-badge" title="Category: ${escapeAttr(categoryName)}">
          <i class="fa-solid fa-folder"></i> ${escapeHtml(categoryName)}
        </div>
      ` : ''}
      <div class="card-actions">
        ${!isAllView ? `
          <button class="btn btn-icon" title="Move up in category" onclick="event.stopPropagation(); reorderAnimeInCat('${categoryId}', '${escapeAttr(title)}', -1)" ${isFirst ? 'disabled style="opacity:0.3"' : ''}>
            <i class="fa-solid fa-arrow-up"></i>
          </button>
          <button class="btn btn-icon" title="Move down in category" onclick="event.stopPropagation(); reorderAnimeInCat('${categoryId}', '${escapeAttr(title)}', 1)" ${isLast ? 'disabled style="opacity:0.3"' : ''}>
            <i class="fa-solid fa-arrow-down"></i>
          </button>
        ` : `
          <button class="btn btn-icon" title="Move up in overall order" onclick="event.stopPropagation(); reorderAnimeInAllView('${escapeAttr(title)}', -1)" ${isFirst ? 'disabled style="opacity:0.3"' : ''}>
            <i class="fa-solid fa-arrow-up"></i>
          </button>
          <button class="btn btn-icon" title="Move down in overall order" onclick="event.stopPropagation(); reorderAnimeInAllView('${escapeAttr(title)}', 1)" ${isLast ? 'disabled style="opacity:0.3"' : ''}>
            <i class="fa-solid fa-arrow-down"></i>
          </button>
        `}
        <button class="btn btn-icon" title="Move to another category" onclick="event.stopPropagation(); openMoveAnimeModal('${escapeAttr(title)}', '${categoryId}')">
          <i class="fa-solid fa-arrows-split-up-and-left"></i>
        </button>
        <button class="btn btn-icon btn-danger" title="Remove from category (returns to Unwatched)" onclick="event.stopPropagation(); removeAnimeFromWatchlist('${escapeAttr(title)}')">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </div>
  `;

  return card;
}

// ==========================================
// DRAG AND DROP HANDLERS FOR ANIME CARDS
// ==========================================
function handleDragStart(e, animeTitle, sourceCatId) {
  if (state.isSelectionMode) {
    e.preventDefault();
    return;
  }
  state.draggedAnime = animeTitle;
  state.draggedSourceCatId = sourceCatId;
  e.dataTransfer.setData('text/plain', animeTitle);
  e.dataTransfer.setData('sourceCatId', sourceCatId || '');
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging');
}

function handleDragEnd(e) {
  if (e.currentTarget) e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.anime-card').forEach(c => {
    c.classList.remove('drop-before');
    c.classList.remove('drop-after');
    c.classList.remove('dragging');
  });
  document.querySelectorAll('.category-body').forEach(b => b.classList.remove('drop-target-active'));
  state.draggedAnime = null;
  state.draggedSourceCatId = null;
}

function handleCardDragOver(e, card) {
  if (state.draggedCategoryId) return;
  if (!state.draggedAnime) return;
  const targetTitle = card.getAttribute('data-anime-title');
  if (!targetTitle || targetTitle.toLowerCase().trim() === state.draggedAnime.toLowerCase().trim()) return;

  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';

  const rect = card.getBoundingClientRect();
  const isAfter = (e.clientX - rect.left) > (rect.width / 2);

  if (isAfter) {
    card.classList.remove('drop-before');
    card.classList.add('drop-after');
  } else {
    card.classList.remove('drop-after');
    card.classList.add('drop-before');
  }
}

function handleCardDragLeave(e, card) {
  card.classList.remove('drop-before');
  card.classList.remove('drop-after');
}

async function handleCardDrop(e, targetTitle, targetCatId, card) {
  if (state.draggedCategoryId) return;
  e.preventDefault();
  e.stopPropagation();

  document.querySelectorAll('.anime-card').forEach(c => {
    c.classList.remove('drop-before');
    c.classList.remove('drop-after');
  });

  const sourceTitle = state.draggedAnime || e.dataTransfer.getData('text/plain');
  const sourceCatId = state.draggedSourceCatId || e.dataTransfer.getData('sourceCatId');
  if (!sourceTitle || !targetTitle) return;
  if (sourceTitle.toLowerCase().trim() === targetTitle.toLowerCase().trim()) return;

  // If in "All" view with active automatic sort, switch to default category order
  if (state.watchlistAllSort && state.watchlistAllSort !== 'default') {
    state.watchlistAllSort = 'default';
    try {
      localStorage.setItem('anix_watchlist_all_sort', 'default');
      const sortSelect = document.getElementById('watchlist-all-sort');
      if (sortSelect) sortSelect.value = 'default';
    } catch (err) {}
  }

  const rect = card.getBoundingClientRect();
  const isAfter = (e.clientX - rect.left) > (rect.width / 2);

  const cleanSource = sourceTitle.trim();
  const cleanTarget = targetTitle.trim();

  const sourceCat = state.userWatchlist.categories.find(c => c._id === sourceCatId);
  const targetCat = state.userWatchlist.categories.find(c => c._id === targetCatId);
  if (!targetCat) return;

  // Case 1: Reordering within the SAME category
  if (sourceCatId === targetCatId) {
    const list = [...(targetCat.animes || [])];
    const oldIdx = list.findIndex(t => t.toLowerCase().trim() === cleanSource.toLowerCase());
    if (oldIdx === -1) return;
    list.splice(oldIdx, 1);

    const targetIdx = list.findIndex(t => t.toLowerCase().trim() === cleanTarget.toLowerCase());
    const insertIdx = targetIdx === -1 ? list.length : (isAfter ? targetIdx + 1 : targetIdx);
    list.splice(insertIdx, 0, cleanSource);

    targetCat.animes = list;
    renderWatchlistView();
    updateSelectionUI();

    try {
      const res = await apiRequest('/api/watchlist/reorder', {
        method: 'PUT',
        body: JSON.stringify({
          categoryId: targetCatId,
          animes: list
        })
      });
      if (res && res.watchlist) {
        state.userWatchlist = res.watchlist;
      }
      await refreshGlobalStats();
      showToast(`Reordered "${cleanSource}" in ${targetCat.categoryName}!`, 'success', 1500);
    } catch (err) {
      console.error('Error reordering anime:', err);
      showToast(err.message || 'Failed to save anime order.', 'error');
      renderWatchlistView();
    }
    return;
  }

  // Case 2: Moving across DIFFERENT categories to a specific position
  if (sourceCat) {
    sourceCat.animes = (sourceCat.animes || []).filter(t => t.toLowerCase().trim() !== cleanSource.toLowerCase());
  }

  const targetList = (targetCat.animes || []).filter(t => t.toLowerCase().trim() !== cleanSource.toLowerCase());
  const targetIdx = targetList.findIndex(t => t.toLowerCase().trim() === cleanTarget.toLowerCase());
  const insertIdx = targetIdx === -1 ? targetList.length : (isAfter ? targetIdx + 1 : targetIdx);
  targetList.splice(insertIdx, 0, cleanSource);
  targetCat.animes = targetList;

  renderWatchlistView();
  updateSelectionUI();

  try {
    const res = await apiRequest('/api/watchlist/reorder', {
      method: 'PUT',
      body: JSON.stringify({
        moveAnime: {
          animeTitle: cleanSource,
          sourceCategoryId: sourceCatId,
          targetCategoryId: targetCatId,
          targetIndex: insertIdx
        }
      })
    });
    if (res && res.watchlist) {
      state.userWatchlist = res.watchlist;
    }
    await refreshGlobalStats();
    updateHeaderBadges();
    showToast(`Moved "${cleanSource}" to ${targetCat.categoryName}!`, 'success', 1500);
  } catch (err) {
    console.error('Error moving anime across categories:', err);
    showToast(err.message || 'Failed to move anime.', 'error');
    renderWatchlistView();
  }
}

function handleDragOver(e) {
  if (state.draggedCategoryId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const dropZone = e.currentTarget;
  if (!dropZone.classList.contains('drop-target-active')) {
    dropZone.classList.add('drop-target-active');
  }
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drop-target-active');
}

async function handleDrop(e, targetCatId) {
  if (state.draggedCategoryId) return;
  e.preventDefault();
  e.currentTarget.classList.remove('drop-target-active');

  const animeTitle = state.draggedAnime || e.dataTransfer.getData('text/plain');
  if (!animeTitle) return;

  const sourceCatId = state.draggedSourceCatId || e.dataTransfer.getData('sourceCatId');
  if (sourceCatId === targetCatId) return;

  try {
    const res = await apiRequest('/api/watchlist/add-anime', {
      method: 'POST',
      body: JSON.stringify({
        animeTitle,
        categoryId: targetCatId
      })
    });

    state.userWatchlist = res.watchlist;
    await refreshGlobalStats();
    updateHeaderBadges();
    renderWatchlistView();
    showToast(`Moved "${animeTitle}" to category!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    state.draggedAnime = null;
    state.draggedSourceCatId = null;
  }
}

function isTitleSelected(title) {
  if (!title) return false;
  if (state.selectedAnimes.has(title)) return true;
  const clean = title.trim().toLowerCase();
  for (const s of state.selectedAnimes) {
    if (s.trim().toLowerCase() === clean) return true;
  }
  return false;
}

/**
 * Batch reorders selected anime within category or across all categories:
 * - Above move: inserts all selected images before first most selected image's previous image
 * - Down move: inserts all selected images after the last most selected image's next image
 * Saves the updated order directly to Mongo cloud via PUT /api/watchlist/reorder.
 */
async function batchReorderSelectedAnime(direction, targetCategoryId = null) {
  if (!state.userWatchlist || !state.userWatchlist.categories) return;
  if (state.selectedAnimes.size === 0) {
    showToast('Please select one or more anime to move.', 'info');
    return;
  }

  // If automatic sort (like A-Z or Popularity) was active, reset to default category order
  if (state.watchlistAllSort && state.watchlistAllSort !== 'default') {
    state.watchlistAllSort = 'default';
    try {
      localStorage.setItem('anix_watchlist_all_sort', 'default');
      const sortSelect = document.getElementById('watchlist-all-sort');
      if (sortSelect) sortSelect.value = 'default';
    } catch (e) {}
  }

  const isAllView = !state.activeCategoryFilter || state.activeCategoryFilter === 'all';
  const sortedCats = [...state.userWatchlist.categories].sort((a, b) => (a.order || 0) - (b.order || 0));

  let anyMoved = false;

  if (isAllView && !targetCategoryId) {
    // -----------------------------------------------------------
    // 1. ALL CATEGORIES VIEW: Reorder across continuous global list
    // -----------------------------------------------------------
    const allList = [];
    sortedCats.forEach(cat => {
      (cat.animes || []).forEach(title => {
        allList.push({ title, catId: cat._id });
      });
    });

    if (allList.length === 0) return;

    const selectedIndices = [];
    allList.forEach((item, idx) => {
      if (isTitleSelected(item.title)) {
        selectedIndices.push(idx);
      }
    });

    if (selectedIndices.length === 0) {
      showToast('No selected anime found in your watchlist.', 'info');
      return;
    }

    const selectedTitles = selectedIndices.map(i => allList[i].title);
    const selectedTitlesLower = new Set(selectedTitles.map(t => t.toLowerCase().trim()));

    if (direction === -1) {
      // Move Above
      const firstIdx = selectedIndices[0];
      if (firstIdx === 0) {
        showToast('Selected anime is already at the very top of your watchlist.', 'info');
        return;
      }

      const targetItem = allList[firstIdx - 1];

      // Remove selected items from all categories
      sortedCats.forEach(c => {
        c.animes = (c.animes || []).filter(t => !selectedTitlesLower.has(t.toLowerCase().trim()));
      });

      // Target category where the anime right above lives
      const targetCat = sortedCats.find(c => c._id.toString() === targetItem.catId.toString());
      if (!targetCat) return;

      let targetIdx = targetCat.animes.findIndex(t => t.toLowerCase().trim() === targetItem.title.toLowerCase().trim());
      if (targetIdx === -1) targetIdx = 0;

      // Insert selected items right before the target item
      targetCat.animes.splice(targetIdx, 0, ...selectedTitles);
      anyMoved = true;
    } else if (direction === 1) {
      // Move Below
      const lastIdx = selectedIndices[selectedIndices.length - 1];
      if (lastIdx === allList.length - 1) {
        showToast('Selected anime is already at the very bottom of your watchlist.', 'info');
        return;
      }

      const targetItem = allList[lastIdx + 1];

      // Remove selected items from all categories
      sortedCats.forEach(c => {
        c.animes = (c.animes || []).filter(t => !selectedTitlesLower.has(t.toLowerCase().trim()));
      });

      // Target category where the anime right below lives
      const targetCat = sortedCats.find(c => c._id.toString() === targetItem.catId.toString());
      if (!targetCat) return;

      let targetIdx = targetCat.animes.findIndex(t => t.toLowerCase().trim() === targetItem.title.toLowerCase().trim());
      if (targetIdx === -1) targetIdx = targetCat.animes.length - 1;

      // Insert selected items right after the target item
      targetCat.animes.splice(targetIdx + 1, 0, ...selectedTitles);
      anyMoved = true;
    }
  } else {
    // -----------------------------------------------------------
    // 2. SINGLE CATEGORY VIEW: Reorder within target category
    // -----------------------------------------------------------
    let targetCategory = null;
    if (targetCategoryId) {
      targetCategory = sortedCats.find(c => c._id === targetCategoryId);
    } else if (state.activeCategoryFilter && state.activeCategoryFilter !== 'all') {
      targetCategory = sortedCats.find(c =>
        c._id === state.activeCategoryFilter ||
        c.categoryName.toLowerCase() === String(state.activeCategoryFilter).toLowerCase()
      );
    }
    if (!targetCategory) {
      targetCategory = sortedCats.find(c => c.animes && c.animes.some(t => isTitleSelected(t)));
    }

    if (!targetCategory || !targetCategory.animes || targetCategory.animes.length === 0) {
      showToast('No selected anime found in this category.', 'info');
      return;
    }

    const category = targetCategory;
    const selectedIndices = [];
    category.animes.forEach((title, idx) => {
      if (isTitleSelected(title)) {
        selectedIndices.push(idx);
      }
    });

    if (selectedIndices.length === 0) {
      showToast('No selected anime in this category.', 'info');
      return;
    }

    const selectedTitles = selectedIndices.map(i => category.animes[i]);
    const selectedTitlesLower = new Set(selectedTitles.map(t => t.toLowerCase().trim()));

    if (direction === -1) {
      const firstIdx = selectedIndices[0];
      if (firstIdx === 0) {
        showToast(`Selected anime is already at the top of "${category.categoryName}".`, 'info');
        return;
      }
      const prevImage = category.animes[firstIdx - 1];
      category.animes = category.animes.filter(t => !selectedTitlesLower.has(t.toLowerCase().trim()));
      const prevTargetIdx = category.animes.indexOf(prevImage);
      if (prevTargetIdx === -1) return;

      category.animes.splice(prevTargetIdx, 0, ...selectedTitles);
      anyMoved = true;
    } else if (direction === 1) {
      const lastIdx = selectedIndices[selectedIndices.length - 1];
      if (lastIdx === category.animes.length - 1) {
        showToast(`Selected anime is already at the bottom of "${category.categoryName}".`, 'info');
        return;
      }
      const nextImage = category.animes[lastIdx + 1];
      category.animes = category.animes.filter(t => !selectedTitlesLower.has(t.toLowerCase().trim()));
      const nextTargetIdx = category.animes.indexOf(nextImage);
      if (nextTargetIdx === -1) return;

      category.animes.splice(nextTargetIdx + 1, 0, ...selectedTitles);
      anyMoved = true;
    }
  }

  if (!anyMoved) return;

  // Immediate optimistic update in UI
  renderWatchlistView();
  updateSelectionUI();

  // Save changes directly to Mongo cloud
  try {
    const categoriesPayload = sortedCats.map((cat, idx) => ({
      _id: cat._id,
      categoryName: cat.categoryName,
      order: typeof cat.order === 'number' ? cat.order : idx,
      animes: Array.isArray(cat.animes) ? [...cat.animes] : []
    }));

    const res = await apiRequest('/api/watchlist/reorder', {
      method: 'PUT',
      body: JSON.stringify({
        categories: categoriesPayload
      })
    });
    if (res && res.watchlist) {
      state.userWatchlist = res.watchlist;
    }
    await refreshGlobalStats();
    updateHeaderBadges();
    renderWatchlistView();
    updateSelectionUI();
    showToast(direction === -1 ? 'Moved selected anime above and saved to cloud!' : 'Moved selected anime below and saved to cloud!', 'success', 2000);
  } catch (err) {
    console.error('Error saving anime order to cloud:', err);
    showToast(err.message || 'Failed to save order to cloud.', 'error');
    renderWatchlistView();
  }
}
window.batchReorderSelectedAnime = batchReorderSelectedAnime;

// Reordering Anime within a category (Up / Down)
async function reorderAnimeInCat(categoryId, animeTitleOrIndex, direction) {
  if (!state.userWatchlist || !state.userWatchlist.categories) return;
  const category = state.userWatchlist.categories.find(c => c._id === categoryId);
  if (!category || !category.animes) return;

  let clickedTitle = typeof animeTitleOrIndex === 'string' ? animeTitleOrIndex : category.animes[animeTitleOrIndex];
  if (!clickedTitle) return;

  // If multiple items are selected and the clicked card is among them, perform batch reordering
  if (state.isSelectionMode && state.selectedAnimes.size > 0 && isTitleSelected(clickedTitle)) {
    return batchReorderSelectedAnime(direction, categoryId);
  }

  const currentIndex = category.animes.findIndex(t => t.toLowerCase().trim() === clickedTitle.toLowerCase().trim());
  if (currentIndex === -1) return;

  const newIndex = currentIndex + direction;
  if (newIndex < 0 || newIndex >= category.animes.length) return;

  const updatedAnimes = [...category.animes];
  const temp = updatedAnimes[currentIndex];
  updatedAnimes[currentIndex] = updatedAnimes[newIndex];
  updatedAnimes[newIndex] = temp;

  category.animes = updatedAnimes;
  renderWatchlistView();
  updateSelectionUI();

  try {
    const res = await apiRequest('/api/watchlist/reorder', {
      method: 'PUT',
      body: JSON.stringify({
        categoryId,
        animes: updatedAnimes
      })
    });
    if (res && res.watchlist) {
      state.userWatchlist = res.watchlist;
    }
    await refreshGlobalStats();
    updateHeaderBadges();
    renderWatchlistView();
    updateSelectionUI();
  } catch (err) {
    console.error('Error reordering anime in category:', err);
    showToast(err.message || 'Failed to save anime order.', 'error');
    renderWatchlistView();
  }
}
window.reorderAnimeInCat = reorderAnimeInCat;

// Reordering Anime in All Categories View (Up / Down across continuous grid)
async function reorderAnimeInAllView(animeTitle, direction) {
  if (!state.userWatchlist || !state.userWatchlist.categories || !animeTitle) return;

  // If automatic sorting was active, switch to default category order
  if (state.watchlistAllSort && state.watchlistAllSort !== 'default') {
    state.watchlistAllSort = 'default';
    try {
      localStorage.setItem('anix_watchlist_all_sort', 'default');
      const sortSelect = document.getElementById('watchlist-all-sort');
      if (sortSelect) sortSelect.value = 'default';
    } catch (err) {}
  }

  // Sorted categories by order
  const sortedCats = [...state.userWatchlist.categories].sort((a, b) => (a.order || 0) - (b.order || 0));
  const currentCat = sortedCats.find(c => c.animes && c.animes.some(t => t.toLowerCase().trim() === animeTitle.toLowerCase().trim()));
  if (!currentCat) return;

  const currentCatIdx = sortedCats.findIndex(c => c._id === currentCat._id);
  const animeIdxInCat = currentCat.animes.findIndex(t => t.toLowerCase().trim() === animeTitle.toLowerCase().trim());
  if (animeIdxInCat === -1) return;

  // Moving UP
  if (direction === -1) {
    if (animeIdxInCat > 0) {
      // Move within same category
      return reorderAnimeInCat(currentCat._id, animeTitle, -1);
    }
    // At the top of this category: move to previous category's end
    if (currentCatIdx > 0) {
      const prevCat = sortedCats[currentCatIdx - 1];
      const targetIndex = (prevCat.animes || []).length;
      return moveAnimeBetweenCategories(animeTitle, currentCat._id, prevCat._id, targetIndex);
    }
    showToast(`"${animeTitle}" is already at the very top of your watchlist.`, 'info');
    return;
  }

  // Moving DOWN
  if (direction === 1) {
    if (animeIdxInCat < currentCat.animes.length - 1) {
      // Move within same category
      return reorderAnimeInCat(currentCat._id, animeTitle, 1);
    }
    // At the bottom of this category: move to next category's start
    if (currentCatIdx < sortedCats.length - 1) {
      const nextCat = sortedCats[currentCatIdx + 1];
      return moveAnimeBetweenCategories(animeTitle, currentCat._id, nextCat._id, 0);
    }
    showToast(`"${animeTitle}" is already at the very end of your watchlist.`, 'info');
    return;
  }
}
window.reorderAnimeInAllView = reorderAnimeInAllView;

async function moveAnimeBetweenCategories(animeTitle, sourceCatId, targetCatId, targetIndex) {
  const sourceCat = state.userWatchlist.categories.find(c => c._id === sourceCatId);
  const targetCat = state.userWatchlist.categories.find(c => c._id === targetCatId);
  if (!targetCat) return;

  const cleanTitle = animeTitle.trim();
  const cleanKey = cleanTitle.toLowerCase();

  if (sourceCat) {
    sourceCat.animes = (sourceCat.animes || []).filter(t => t.toLowerCase().trim() !== cleanKey);
  }

  const targetList = (targetCat.animes || []).filter(t => t.toLowerCase().trim() !== cleanKey);
  let insertIdx = typeof targetIndex === 'number' ? targetIndex : targetList.length;
  if (insertIdx < 0) insertIdx = 0;
  if (insertIdx > targetList.length) insertIdx = targetList.length;
  targetList.splice(insertIdx, 0, cleanTitle);
  targetCat.animes = targetList;

  renderWatchlistView();
  updateSelectionUI();

  try {
    const res = await apiRequest('/api/watchlist/reorder', {
      method: 'PUT',
      body: JSON.stringify({
        moveAnime: {
          animeTitle: cleanTitle,
          sourceCategoryId: sourceCatId,
          targetCategoryId: targetCatId,
          targetIndex: insertIdx
        }
      })
    });
    if (res && res.watchlist) {
      state.userWatchlist = res.watchlist;
    }
    await refreshGlobalStats();
    updateHeaderBadges();
    showToast(`Moved "${cleanTitle}" to ${targetCat.categoryName}!`, 'success', 1500);
  } catch (err) {
    console.error('Error moving anime across categories:', err);
    showToast(err.message || 'Failed to move anime.', 'error');
    renderWatchlistView();
  }
}
window.moveAnimeBetweenCategories = moveAnimeBetweenCategories;

// Reordering categories (Up / Down)
async function reorderCategory(categoryId, direction) {
  const cats = [...state.userWatchlist.categories].sort((a, b) => (a.order || 0) - (b.order || 0));
  const currentIndex = cats.findIndex(c => c._id === categoryId);
  if (currentIndex === -1) return;

  const newIndex = currentIndex + direction;
  if (newIndex < 0 || newIndex >= cats.length) return;

  const temp = cats[currentIndex];
  cats[currentIndex] = cats[newIndex];
  cats[newIndex] = temp;

  const categoryOrder = cats.map(c => c._id);

  try {
    const res = await apiRequest('/api/watchlist/reorder', {
      method: 'PUT',
      body: JSON.stringify({ categoryOrder })
    });
    state.userWatchlist = res.watchlist;
    renderWatchlistSubHeader();
    renderWatchlistView();
    showToast('Category order updated.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Drag and Drop reordering of categories (chips or block headers)
async function reorderCategoriesByDrag(sourceCatId, targetCatId) {
  if (!sourceCatId || !targetCatId || sourceCatId === targetCatId) return;
  const cats = [...(state.userWatchlist?.categories || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const fromIndex = cats.findIndex(c => c._id === sourceCatId);
  const toIndex = cats.findIndex(c => c._id === targetCatId);
  if (fromIndex === -1 || toIndex === -1) return;

  const [movedCat] = cats.splice(fromIndex, 1);
  cats.splice(toIndex, 0, movedCat);
  cats.forEach((c, idx) => c.order = idx);

  state.userWatchlist.categories = cats;
  renderWatchlistSubHeader();
  renderWatchlistView();
  showToast(`Category "${movedCat.categoryName}" moved to position #${toIndex + 1}!`, 'success', 2000);

  try {
    const categoryOrder = cats.map(c => c._id);
    const res = await apiRequest('/api/watchlist/reorder', {
      method: 'PUT',
      body: JSON.stringify({ categoryOrder })
    });
    if (res && res.watchlist) {
      state.userWatchlist = res.watchlist;
    }
  } catch (err) {
    console.error('Failed to update category order:', err);
    showToast(err.message || 'Failed to update category order.', 'error');
    renderWatchlistSubHeader();
    renderWatchlistView();
  }
}

window.reorderCategoriesByDrag = reorderCategoriesByDrag;
window.reorderCategory = reorderCategory;

// Delete anime from category
async function removeAnimeFromWatchlist(animeTitle) {
  try {
    const res = await apiRequest('/api/watchlist/remove-anime', {
      method: 'POST',
      body: JSON.stringify({ animeTitle })
    });

    state.userWatchlist = res.watchlist;
    await refreshGlobalStats();
    updateHeaderBadges();
    renderWatchlistView();
    showToast(`"${animeTitle}" removed from watchlist.`, 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Category modal logic
function openNewCategoryModal() {
  document.getElementById('new-category-name').value = '';
  document.getElementById('modal-category').classList.remove('hidden');
  setTimeout(() => document.getElementById('new-category-name').focus(), 100);
}

function setCategorySuggestion(name) {
  const input = document.getElementById('new-category-name');
  input.value = name;
  input.focus();
}

async function handleCreateCategory(e) {
  e.preventDefault();
  const input = document.getElementById('new-category-name');
  const categoryName = input.value.trim();

  if (!categoryName) return;

  try {
    const res = await apiRequest('/api/watchlist/category', {
      method: 'POST',
      body: JSON.stringify({ categoryName })
    });

    state.userWatchlist = res.watchlist;
    closeModal('modal-category');
    updateHeaderBadges();
    renderWatchlistView();
    showToast(`Category "${categoryName}" created!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openEditCategoryModal(categoryId, currentName) {
  const modal = document.getElementById('modal-edit-category');
  const idInput = document.getElementById('edit-category-id');
  const nameInput = document.getElementById('edit-category-name');

  if (!modal || !idInput || !nameInput) return;

  idInput.value = categoryId;
  nameInput.value = currentName || '';
  modal.classList.remove('hidden');

  setTimeout(() => {
    nameInput.focus();
    nameInput.select();
  }, 50);
}
window.openEditCategoryModal = openEditCategoryModal;

async function handleRenameCategory(e) {
  e.preventDefault();
  const idInput = document.getElementById('edit-category-id');
  const nameInput = document.getElementById('edit-category-name');
  if (!idInput || !nameInput) return;

  const categoryId = idInput.value;
  const newCategoryName = nameInput.value.trim();

  if (!newCategoryName) {
    showToast('Category name cannot be empty.', 'error');
    return;
  }

  try {
    const res = await apiRequest('/api/watchlist/category', {
      method: 'PUT',
      body: JSON.stringify({ categoryId, newCategoryName })
    });

    state.userWatchlist = res.watchlist;
    closeModal('modal-edit-category');

    // If activeCategoryFilter matches this category, update url param with new name
    if (state.activeCategoryFilter && state.activeCategoryFilter !== 'all') {
      const activeCat = state.userWatchlist.categories.find(c => c._id === categoryId);
      if (activeCat) {
        state.activeCategoryFilter = activeCat._id;
        updateUrlParams(state.currentView, activeCat.categoryName);
      }
    }

    renderWatchlistSubHeader();
    renderWatchlistView();
    showToast(res.message || `Renamed category to "${newCategoryName}"!`, 'success');
  } catch (err) {
    console.error('Error renaming category:', err);
    showToast(err.message || 'Failed to rename category.', 'error');
  }
}
window.handleRenameCategory = handleRenameCategory;

// ==========================================
// ANIME IMAGE RENAMING (IRFAN YOICHI ONLY)
// ==========================================
function canEditAnimeImage() {
  return Boolean(
    state.currentUser &&
    state.currentUser.username &&
    state.currentUser.username.trim().toLowerCase() === 'irfan yoichi'
  );
}
window.canEditAnimeImage = canEditAnimeImage;

function openEditAnimeNameModal(animeTitle) {
  if (!canEditAnimeImage()) {
    showToast("Only user 'Irfan Yoichi' can rename anime images.", 'warning');
    return;
  }

  const modal = document.getElementById('modal-edit-anime-name');
  const oldTitleInput = document.getElementById('edit-anime-old-title');
  const currentDisplay = document.getElementById('edit-anime-current-display');
  const newTitleInput = document.getElementById('edit-anime-new-title');
  const previewImg = document.getElementById('edit-anime-preview-img');

  if (!modal || !oldTitleInput || !newTitleInput) return;

  oldTitleInput.value = animeTitle;
  if (currentDisplay) currentDisplay.textContent = animeTitle;
  newTitleInput.value = animeTitle; // copy of current name

  const meta = findAnimeMeta(animeTitle);
  if (previewImg) {
    previewImg.src = meta ? meta.imageUrl : `/images/${encodeURIComponent(animeTitle)}.jpg`;
  }

  // Also copy title to clipboard
  copyTextToClipboard(animeTitle);

  modal.classList.remove('hidden');

  setTimeout(() => {
    newTitleInput.focus();
    newTitleInput.select();
  }, 50);
}
window.openEditAnimeNameModal = openEditAnimeNameModal;

async function handleRenameAnimeSubmit(e) {
  if (e) e.preventDefault();
  if (!canEditAnimeImage()) {
    showToast("Only user 'Irfan Yoichi' can rename anime images.", 'warning');
    return;
  }

  const oldTitleInput = document.getElementById('edit-anime-old-title');
  const newTitleInput = document.getElementById('edit-anime-new-title');
  const submitBtn = document.getElementById('btn-submit-rename-anime');

  if (!oldTitleInput || !newTitleInput) return;

  const oldTitle = oldTitleInput.value.trim();
  const newTitle = newTitleInput.value.trim();

  if (!newTitle) {
    showToast('Image name cannot be empty.', 'error');
    return;
  }

  if (oldTitle === newTitle) {
    showToast('New image name must be different from current name.', 'info');
    return;
  }

  if (/[:\/\\?*|"<>]/g.test(newTitle)) {
    showToast('Filenames cannot contain / \\ : * ? " < > |', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Renaming...';
  }

  try {
    const res = await apiRequest('/api/animes/rename', {
      method: 'PUT',
      body: JSON.stringify({ oldTitle, newTitle })
    });

    closeModal('modal-edit-anime-name');

    // 1. Refresh all anime images list
    const updatedAnimes = await apiRequest('/api/animes');
    state.allAnimeList = updatedAnimes || [];

    // 2. Refresh current user's watchlist
    if (res.watchlist) {
      state.userWatchlist = res.watchlist;
    } else if (state.currentUser?._id) {
      const wlRes = await apiRequest(`/api/watchlist/${state.currentUser._id}`);
      state.userWatchlist = wlRes.watchlist;
    }

    // 3. Refresh global watch counts & ranks
    await refreshGlobalStats();
    updateHeaderBadges();

    // 4. Update selection set if oldTitle was selected
    if (state.selectedAnimes && state.selectedAnimes.has(oldTitle)) {
      state.selectedAnimes.delete(oldTitle);
      state.selectedAnimes.add(newTitle);
      updateSelectionButtonTexts();
      updateSelectionUI();
    }

    // 5. Re-render active view
    if (state.currentView === 'watchlist') {
      renderWatchlistView();
      renderWatchlistSubHeader();
    } else if (state.currentView === 'unwatched') {
      renderUnwatchedView();
    } else if (state.currentView === 'browse') {
      renderBrowseUsersView();
    } else if (state.currentView === 'compare') {
      renderCompareView();
    }

    showToast(`Renamed "${oldTitle}" to "${newTitle}" across local files and ${res.updatedUsersCount} user watchlist(s)!`, 'success', 4500);
  } catch (err) {
    console.error('Rename failed:', err);
    showToast(err.message || 'Failed to rename image.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Rename Everywhere';
    }
  }
}
window.handleRenameAnimeSubmit = handleRenameAnimeSubmit;

function initImageRenameHandler() {
  document.addEventListener('dblclick', (e) => {
    // 1. Only 'Irfan Yoichi' can rename images
    if (!canEditAnimeImage()) return;

    // 2. Ignore double clicks inside modals, inputs, textareas, buttons, or fire badge
    if (e.target.closest('.modal-overlay') || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('button') || e.target.closest('.btn') || e.target.closest('.pop-badge')) {
      return;
    }

    // 3. Check if target is an anime title or card poster wrap
    const titleEl = e.target.closest('.anime-title');
    const posterWrap = e.target.closest('.card-poster-wrap');
    if (!titleEl && !posterWrap) return;

    const card = e.target.closest('.anime-card');
    if (!card) return;

    const animeTitle = card.getAttribute('data-anime-title') || 
      card.querySelector('.anime-title')?.textContent?.trim();

    if (!animeTitle) return;

    e.preventDefault();
    e.stopPropagation();
    openEditAnimeNameModal(animeTitle);
  });
}
window.initImageRenameHandler = initImageRenameHandler;

// ==========================================
// ADMIN USER & PASSWORD MANAGEMENT (IRFAN YOICHI ONLY)
// ==========================================
async function openAdminSettingsModal() {
  if (!canEditAnimeImage()) {
    showToast("Access restricted to user 'Irfan Yoichi'.", 'warning');
    return;
  }

  const modal = document.getElementById('modal-admin-settings');
  const searchInput = document.getElementById('admin-user-search');
  const container = document.getElementById('admin-users-table-container');

  if (!modal) return;
  modal.classList.remove('hidden');

  if (searchInput) searchInput.value = '';

  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.75rem; margin-bottom: 0.75rem; color: var(--primary);"></i>
        <p>Loading community user accounts & passwords...</p>
      </div>
    `;
  }

  try {
    const users = await apiRequest('/api/admin/users');
    state.adminUsersList = users || [];
    renderAdminUsersList();
  } catch (err) {
    console.error('Failed to load admin users:', err);
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--danger);">
          <i class="fa-solid fa-circle-exclamation" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
          <p>${escapeHtml(err.message || 'Failed to load user accounts.')}</p>
        </div>
      `;
    }
  }
}
window.openAdminSettingsModal = openAdminSettingsModal;

function filterAdminUsersList() {
  renderAdminUsersList();
}
window.filterAdminUsersList = filterAdminUsersList;

function togglePasswordMask(userId) {
  state.adminPasswordMasks[userId] = !state.adminPasswordMasks[userId];
  renderAdminUsersList();
}
window.togglePasswordMask = togglePasswordMask;

function renderAdminUsersList() {
  const container = document.getElementById('admin-users-table-container');
  const searchInput = document.getElementById('admin-user-search');
  if (!container) return;

  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
  let users = state.adminUsersList || [];

  if (query) {
    users = users.filter(u => (u.username || '').toLowerCase().includes(query));
  }

  if (users.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
        <i class="fa-solid fa-user-slash" style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--text-dim);"></i>
        <p>No user accounts matching "${escapeHtml(query)}".</p>
      </div>
    `;
    return;
  }

  const html = `
    <div class="admin-users-list">
      ${users.map(user => {
        const isMe = Boolean(state.currentUser && user._id === state.currentUser._id);
        const directPw = user.plainPassword || user.password;
        const hasPw = Boolean(directPw && directPw.trim());

        const dateStr = user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';

        return `
          <div class="admin-user-card ${isMe ? 'current-user-card' : ''}" data-user-id="${user._id}">
            <div class="admin-user-info">
              <div class="admin-user-avatar">
                <i class="fa-solid fa-user"></i>
              </div>
              <div>
                <div class="admin-user-name">
                  <span>${escapeHtml(user.username)}</span>
                  ${isMe ? '<span class="badge badge-accent" style="font-size: 0.65rem; padding: 1px 6px;">You</span>' : ''}
                </div>
                ${dateStr ? `<div class="admin-user-date">Joined ${dateStr}</div>` : ''}
              </div>
            </div>

            <div class="admin-user-pw-box">
              <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-dim); margin-right: 4px; font-weight: 700;">Password:</span>
              <span class="admin-pw-val" id="admin-pw-text-${user._id}" title="Click to copy password" onclick="navigator.clipboard.writeText('${escapeAttr(directPw || '')}'); showToast('Password copied to clipboard!', 'info', 1500);" style="cursor: pointer; word-break: break-all; font-family: monospace;">
                ${hasPw ? escapeHtml(directPw) : '<span style="color: var(--text-dim); font-style: italic;">(None)</span>'}
              </span>
            </div>

            <div class="admin-user-edit-wrap">
              <input type="text" id="pw-input-${user._id}" class="admin-pw-input" placeholder="New password..." autocomplete="off" onkeydown="if (event.key === 'Enter') { event.preventDefault(); saveUserPassword('${user._id}', '${escapeAttr(user.username)}'); }">
              <button type="button" class="btn btn-sm btn-primary" id="btn-save-pw-${user._id}" onclick="saveUserPassword('${user._id}', '${escapeAttr(user.username)}')">
                <i class="fa-solid fa-check"></i> Save
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.innerHTML = html;
}
window.renderAdminUsersList = renderAdminUsersList;

async function saveUserPassword(userId, username) {
  const input = document.getElementById(`pw-input-${userId}`);
  const btn = document.getElementById(`btn-save-pw-${userId}`);
  if (!input) return;

  const newPassword = input.value.trim();
  if (!newPassword) {
    showToast('Password cannot be empty.', 'error');
    input.focus();
    return;
  }
  if (newPassword.length < 3) {
    showToast('Password must be at least 3 characters long.', 'error');
    input.focus();
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  }

  try {
    const res = await apiRequest(`/api/admin/users/${userId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ newPassword })
    });

    // Update in local state
    const userInState = (state.adminUsersList || []).find(u => u._id === userId);
    if (userInState) {
      userInState.password = newPassword;
      userInState.plainPassword = newPassword;
      userInState.hasPlainPassword = true;
    }
    input.value = '';

    renderAdminUsersList();
    showToast(`Password for "${username}" updated to "${newPassword}"!`, 'success', 4000);

    if (state.currentUser && userId === state.currentUser._id) {
      showToast('Your personal password has been updated! Use your new password on next login.', 'info', 5000);
    }
  } catch (err) {
    console.error('Failed to update password:', err);
    showToast(err.message || 'Failed to update password.', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Save';
    }
  }
}
window.saveUserPassword = saveUserPassword;

function openDeleteCategoryModal(categoryId, categoryName) {
  document.getElementById('delete-cat-id').value = categoryId;
  document.getElementById('delete-cat-name').textContent = categoryName;
  document.getElementById('modal-delete-category').classList.remove('hidden');
}
window.openDeleteCategoryModal = openDeleteCategoryModal;

async function confirmDeleteCategory() {
  const categoryId = document.getElementById('delete-cat-id').value;
  if (!categoryId) return;

  // 1. Identify current sorted categories and position of the category being deleted
  const currentCategories = state.userWatchlist?.categories || [];
  const sortedCats = [...currentCategories].sort((a, b) => (a.order || 0) - (b.order || 0));
  const deletedIndex = sortedCats.findIndex(c => c._id === categoryId);
  const deletedCat = deletedIndex !== -1 ? sortedCats[deletedIndex] : null;

  // 2. Find the previous category (or next category if the deleted category was first)
  let targetCategoryAfterDelete = null;
  if (deletedIndex > 0) {
    targetCategoryAfterDelete = sortedCats[deletedIndex - 1];
  } else if (deletedIndex === 0 && sortedCats.length > 1) {
    targetCategoryAfterDelete = sortedCats[1];
  }

  try {
    const res = await apiRequest('/api/watchlist/category', {
      method: 'DELETE',
      body: JSON.stringify({ categoryId })
    });

    state.userWatchlist = res.watchlist;

    // Navigate to previous category instead of going to 'all'
    if (targetCategoryAfterDelete) {
      state.activeCategoryFilter = targetCategoryAfterDelete._id;
      updateUrlParams('watchlist', targetCategoryAfterDelete.categoryName);
    } else {
      state.activeCategoryFilter = 'all';
      updateUrlParams('watchlist', 'all');
    }

    closeModal('modal-delete-category');
    await refreshGlobalStats();
    updateHeaderBadges();
    renderWatchlistSubHeader();
    updateWatchlistSearchBadge();
    renderWatchlistView();
    showToast(res.message || 'Category deleted.', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
window.confirmDeleteCategory = confirmDeleteCategory;

// Move anime modal logic (Single & Batch)
function openMoveAnimeModal(animeTitle, currentCatId = null) {
  state.batchActionType = null;
  const meta = findAnimeMeta(animeTitle);
  document.getElementById('move-modal-title').innerHTML = `<i class="fa-solid fa-film"></i> Assign to Category`;
  document.getElementById('move-modal-anime-title').value = animeTitle;
  document.getElementById('move-modal-anime-name').textContent = animeTitle;
  document.getElementById('move-modal-img').src = meta ? meta.imageUrl : `/images/${encodeURIComponent(animeTitle)}.jpg`;

  const popCount = state.globalStats[animeTitle] || 0;
  document.getElementById('move-modal-badge').innerHTML = `<i class="fa-solid fa-fire"></i> ${popCount} users`;

  let currentCatName = 'Unwatched';
  if (currentCatId && state.userWatchlist) {
    const currentCat = state.userWatchlist.categories.find(c => c._id === currentCatId);
    if (currentCat) currentCatName = currentCat.categoryName;
  }
  document.getElementById('move-modal-current-cat').textContent = `Currently: ${currentCatName}`;

  const select = document.getElementById('move-modal-select');
  select.innerHTML = '';

  const categories = state.userWatchlist?.categories || [];
  if (categories.length === 0) {
    showToast('Please create at least one Category in "My Watchlist" first.', 'error');
    openNewCategoryModal();
    return;
  }

  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat._id;
    opt.textContent = cat.categoryName;
    if (cat._id === currentCatId) {
      opt.textContent += ' (Current)';
      opt.disabled = true;
    }
    select.appendChild(opt);
  });

  document.getElementById('modal-move-anime').classList.remove('hidden');
  setTimeout(() => document.getElementById('move-modal-select')?.focus(), 50);
}

// Batch Actions Modals
function openBatchAddModal() {
  if (state.selectedAnimes.size === 0) {
    showToast('Please select at least one anime first.', 'info');
    return;
  }
  state.batchActionType = 'add';
  openBatchAssignModal(`Mark ${state.selectedAnimes.size} Anime as Watched`);
}

function openBatchMoveModal() {
  if (state.selectedAnimes.size === 0) {
    showToast('Please select at least one anime first.', 'info');
    return;
  }
  state.batchActionType = 'move';
  openBatchAssignModal(`Move ${state.selectedAnimes.size} Selected Anime`);
}

function openBatchAssignModal(modalTitle) {
  const categories = state.userWatchlist?.categories || [];
  if (categories.length === 0) {
    showToast('Please create at least one Category in "My Watchlist" first.', 'error');
    openNewCategoryModal();
    return;
  }

  document.getElementById('move-modal-title').innerHTML = `<i class="fa-solid fa-layer-group"></i> ${modalTitle}`;
  const firstTitle = Array.from(state.selectedAnimes)[0];
  const meta = findAnimeMeta(firstTitle);

  document.getElementById('move-modal-anime-title').value = firstTitle;
  document.getElementById('move-modal-anime-name').textContent = `${state.selectedAnimes.size} Anime Selected`;
  document.getElementById('move-modal-img').src = meta ? meta.imageUrl : `/images/${encodeURIComponent(firstTitle)}.jpg`;
  
  const sampleTitles = Array.from(state.selectedAnimes).slice(0, 3).join(', ');
  document.getElementById('move-modal-current-cat').textContent = sampleTitles + (state.selectedAnimes.size > 3 ? '...' : '');
  document.getElementById('move-modal-badge').innerHTML = `<i class="fa-solid fa-check-double"></i> Batch Mode`;

  const select = document.getElementById('move-modal-select');
  select.innerHTML = '';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat._id;
    opt.textContent = cat.categoryName;
    select.appendChild(opt);
  });

  document.getElementById('modal-move-anime').classList.remove('hidden');
  setTimeout(() => document.getElementById('move-modal-select')?.focus(), 50);
}

async function batchRemoveSelected() {
  if (state.selectedAnimes.size === 0) {
    showToast('No anime selected.', 'info');
    return;
  }
  const titles = Array.from(state.selectedAnimes);
  try {
    const res = await apiRequest('/api/watchlist/batch-remove', {
      method: 'POST',
      body: JSON.stringify({ animeTitles: titles })
    });
    state.userWatchlist = res.watchlist;
    state.selectedAnimes.clear();
    await refreshGlobalStats();
    updateHeaderBadges();
    renderWatchlistView();
    showToast(res.message, 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleAssignCategorySubmit(e) {
  e.preventDefault();
  const categoryId = document.getElementById('move-modal-select').value;
  if (!categoryId) return;

  if (state.batchActionType && state.selectedAnimes.size > 0) {
    const titles = Array.from(state.selectedAnimes);
    try {
      const res = await apiRequest('/api/watchlist/batch-add', {
        method: 'POST',
        body: JSON.stringify({ animeTitles: titles, categoryId })
      });
      state.userWatchlist = res.watchlist;
      state.selectedAnimes.clear();
      state.batchActionType = null;
      closeModal('modal-move-anime');
      await refreshGlobalStats();
      updateHeaderBadges();

      if (state.currentView === 'watchlist') renderWatchlistView();
      if (state.currentView === 'unwatched') renderUnwatchedView();
      showToast(res.message, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
    return;
  }

  // Single anime assignment
  const animeTitle = document.getElementById('move-modal-anime-title').value;
  if (!animeTitle) return;

  try {
    const res = await apiRequest('/api/watchlist/add-anime', {
      method: 'POST',
      body: JSON.stringify({ animeTitle, categoryId })
    });

    state.userWatchlist = res.watchlist;
    closeModal('modal-move-anime');
    await refreshGlobalStats();
    updateHeaderBadges();

    if (state.currentView === 'watchlist') {
      renderWatchlistView();
    } else if (state.currentView === 'unwatched') {
      renderUnwatchedView();
    } else if (state.currentView === 'compare') {
      renderCompareResults();
    }

    showToast(`Added "${animeTitle}" to category!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// VIEW 2: NOT WATCHED / UNWATCHED ANIME
// ==========================================
function renderUnwatchedView() {
  clearRowFocus();
  const grid = document.getElementById('unwatched-grid');
  const emptyState = document.getElementById('unwatched-empty-state');
  const searchInput = document.getElementById('unwatched-search');
  const clearBtn = document.getElementById('clear-search-btn');
  const sortSelect = document.getElementById('unwatched-sort');

  const query = searchInput.value.trim().toLowerCase();
  clearBtn.classList.toggle('hidden', query === '');
  updateUnwatchedSearchBadge();

  const watchedSet = getWatchedTitlesSet();
  
  // Filter for unwatched anime (or all anime in global scope)
  let unwatchedList = [];
  if (state.unwatchedSearchScope === 'global') {
    unwatchedList = [...state.allAnimeList];
  } else {
    unwatchedList = state.allAnimeList.filter(anime => !watchedSet.has(anime.title.toLowerCase().trim()));
  }

  // Filter by search query
  if (query) {
    unwatchedList = unwatchedList.filter(anime => anime.title.toLowerCase().includes(query));
  }

  // Apply sorting options
  const sortType = sortSelect.value;
  if (sortType === 'alpha-asc') {
    unwatchedList.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  } else if (sortType === 'alpha-desc') {
    unwatchedList.sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: 'base' }));
  } else if (sortType === 'popularity-desc') {
    unwatchedList.sort((a, b) => {
      const keyA = a.title.toLowerCase().trim();
      const keyB = b.title.toLowerCase().trim();
      const popA = state.globalStats[a.title] ?? state.globalStats[keyA] ?? 0;
      const popB = state.globalStats[b.title] ?? state.globalStats[keyB] ?? 0;
      if (popB !== popA) return popB - popA;

      if (popA > 0) {
        const rankA = state.globalRankStats[a.title] ?? state.globalRankStats[keyA] ?? Infinity;
        const rankB = state.globalRankStats[b.title] ?? state.globalRankStats[keyB] ?? Infinity;
        if (rankA !== rankB) return rankA - rankB;
      }

      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });
  }

  grid.innerHTML = '';

  if (unwatchedList.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  unwatchedList.forEach(anime => {
    const key = anime.title.toLowerCase().trim();
    const popCount = state.globalStats[anime.title] ?? state.globalStats[key] ?? 0;
    const rankSum = state.globalRankStats[anime.title] ?? state.globalRankStats[key] ?? 0;
    const isSelected = state.selectedAnimes.has(anime.title);
    const cat = findCategoryForAnime(anime.title);
    const isWatched = Boolean(cat);

    const card = document.createElement('div');
    card.className = `anime-card ${isSelected ? 'selected' : ''}`;
    card.setAttribute('data-anime-title', anime.title);

    card.innerHTML = `
      <div class="card-poster-wrap">
        <div class="card-select-checkbox">${isSelected ? '<i class="fa-solid fa-check"></i>' : ''}</div>
        <img class="card-poster" src="${anime.imageUrl}" alt="${escapeAttr(anime.title)}" loading="lazy" onload="triggerGridRowAlignment()" onerror="this.src='/images/Naruto.jpg'; triggerGridRowAlignment();">
        <div class="pop-badge ${popCount > 0 ? 'pop-hot' : ''}" title="Click to view who watched (${popCount} user${popCount === 1 ? '' : 's'}${popCount > 0 ? ` · Rank sum: ${rankSum}` : ''})" onclick="event.stopPropagation(); showAnimeWatchersModal('${escapeAttr(anime.title)}')">
          <i class="fa-solid fa-fire"></i> ${popCount} users
        </div>
        <div class="copy-hover-badge"><i class="fa-regular fa-copy"></i> Click to copy</div>
      </div>
      <div class="card-content">
        <h4 class="anime-title" title="${escapeAttr(anime.title)}">${escapeHtml(anime.title)}</h4>
        ${isWatched ? `
          <div class="card-meta" style="margin-bottom: 0.4rem;">
            <span class="text-highlight"><i class="fa-solid fa-folder"></i> In "${escapeHtml(cat.categoryName)}"</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-outline btn-block" onclick="event.stopPropagation(); openMoveAnimeModal('${escapeAttr(anime.title)}')">
              <i class="fa-solid fa-arrows-split-up-and-left"></i> Move Category
            </button>
          </div>
        ` : `
          <div class="card-actions">
            <button class="btn btn-primary btn-block" onclick="event.stopPropagation(); openMoveAnimeModal('${escapeAttr(anime.title)}')">
              <i class="fa-solid fa-plus"></i> Mark Watched
            </button>
          </div>
        `}
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('.btn') || e.target.closest('.card-actions') || e.target.closest('.pop-badge')) {
        return;
      }
      if (state.isSelectionMode) {
        handleSelectionClick(e, anime.title, card);
      } else {
        copyAnimeTitle(anime.title);
      }
    });

    grid.appendChild(card);
  });

  updateSelectionButtonTexts();
  updateSelectionUI();
  triggerGridRowAlignment();
  if (query) {
    copyFirstSearchResultTitle('unwatched');
  }
}

function clearUnwatchedSearch() {
  const input = document.getElementById('unwatched-search');
  if (input) input.value = '';
  const clearBtn = document.getElementById('clear-search-btn');
  if (clearBtn) clearBtn.classList.add('hidden');
  renderUnwatchedView();
}

// ==========================================
// VIEW 3: BROWSE OTHER USERS (SHOW ALL COMMUNITY MEMBERS)
// ==========================================
function isBrowseCategoryActive(cat) {
  if (!state.browseActiveCategoryFilter || state.browseActiveCategoryFilter === 'all') return false;
  return state.browseActiveCategoryFilter === cat._id || 
         cat.categoryName.toLowerCase() === String(state.browseActiveCategoryFilter).toLowerCase();
}

function filterBrowseCategory(catIdOrName) {
  clearRowFocus();
  state.browseActiveCategoryFilter = catIdOrName;
  const user = state.communityUsers.find(u => u._id === state.browseSelectedUserId);
  const username = user ? user.username : null;

  updateUrlParams('browse', catIdOrName, username);

  if (state.browseUserWatchlist && user) {
    let totalWatched = 0;
    if (state.browseUserWatchlist.categories) {
      state.browseUserWatchlist.categories.forEach(c => totalWatched += (c.animes ? c.animes.length : 0));
    }
    renderBrowseSubHeader(user, state.browseUserWatchlist, totalWatched);
    renderBrowseWatchlistContent(user, state.browseUserWatchlist, totalWatched);
  }
}
window.filterBrowseCategory = filterBrowseCategory;

async function renderBrowseView() {
  try {
    const users = await apiRequest('/api/users');
    state.communityUsers = (users || []).sort((a, b) => (b.totalWatched || 0) - (a.totalWatched || 0) || (a.username || '').localeCompare(b.username || ''));

    const countElem = document.getElementById('browse-users-count');
    if (countElem) countElem.textContent = state.communityUsers.length;

    const grid = document.getElementById('browse-users-grid');
    if (grid) {
      grid.innerHTML = '';
      if (state.communityUsers.length === 0) {
        grid.innerHTML = '<p class="text-muted">No other registered users found.</p>';
      } else {
        state.communityUsers.forEach(user => {
          const isMe = user._id === state.currentUser._id;
          const isSelected = state.browseSelectedUserId === user._id;

          const card = document.createElement('div');
          card.className = `user-dir-card ${isSelected ? 'active' : ''}`;
          card.setAttribute('data-user-id', user._id);
          card.innerHTML = `
            <div class="user-dir-avatar">
              <i class="fa-solid fa-user-ninja"></i>
            </div>
            <div class="user-dir-info">
              <div class="user-dir-name-row">
                <span class="user-dir-name">${escapeHtml(user.username)}</span>
                ${isMe ? '<span class="user-dir-you-badge">You</span>' : ''}
              </div>
              <span class="user-dir-stats"><i class="fa-solid fa-film"></i> ${user.totalWatched || 0} watched · ${user.totalCategories || 0} categories</span>
            </div>
            <div class="user-dir-active-indicator">
              <i class="fa-solid fa-circle-check"></i>
            </div>
          `;
          card.addEventListener('click', () => {
            state.browseActiveCategoryFilter = 'all';
            loadBrowseUserProfile(user._id, 'all');
          });
          grid.appendChild(card);
        });
      }
    }

    // Auto-select user based on URL, state, or first available user
    let targetUserId = null;
    if (state.urlBrowseUser) {
      const matched = state.communityUsers.find(u =>
        u.username.toLowerCase() === String(state.urlBrowseUser).toLowerCase() ||
        u._id === state.urlBrowseUser
      );
      if (matched) targetUserId = matched._id;
    }

    if (!targetUserId && state.browseSelectedUserId) {
      targetUserId = state.browseSelectedUserId;
    }

    if (!targetUserId && state.communityUsers.length > 0) {
      const targetUser = state.communityUsers.find(u => u._id !== state.currentUser._id) || state.communityUsers[0];
      targetUserId = targetUser?._id;
    }

    if (targetUserId) {
      loadBrowseUserProfile(targetUserId, state.browseActiveCategoryFilter || 'all');
    }
  } catch (err) {
    showToast('Failed to load community users.', 'error');
  }
}

async function loadBrowseUserProfile(userId, targetCat = null) {
  if (!userId) return;
  state.browseSelectedUserId = userId;

  // Highlight card in directory grid
  document.querySelectorAll('.user-dir-card').forEach(card => {
    card.classList.toggle('active', card.getAttribute('data-user-id') === userId);
  });

  document.getElementById('browse-empty-state').classList.add('hidden');

  try {
    const data = await apiRequest(`/api/watchlist/${userId}`);
    const user = data.user;
    const watchlist = data.watchlist;
    state.browseUserWatchlist = watchlist;

    if (targetCat !== null) {
      state.browseActiveCategoryFilter = targetCat;
    }

    // Show profile header
    const header = document.getElementById('browse-profile-header');
    header.classList.remove('hidden');
    document.getElementById('browse-profile-username').textContent = user.username;

    // Count total watched
    let totalWatched = 0;
    if (watchlist.categories) {
      watchlist.categories.forEach(c => totalWatched += (c.animes ? c.animes.length : 0));
    }
    document.getElementById('browse-profile-meta').textContent = 
      `Total Watched: ${totalWatched} Anime across ${watchlist.categories?.length || 0} Categories`;

    // Compare with me button
    const compareBtn = document.getElementById('browse-compare-btn');
    if (compareBtn) {
      if (userId !== state.currentUser._id) {
        compareBtn.classList.remove('hidden');
      } else {
        compareBtn.classList.add('hidden');
      }
    }

    // Render Browse Categories Sub-Header (Categories as Headers)
    renderBrowseSubHeader(user, watchlist, totalWatched);

    // Render Watchlist Content (only images of the selected header)
    renderBrowseWatchlistContent(user, watchlist, totalWatched);

    // Update URL parameter (user and category)
    updateUrlParams('browse', state.browseActiveCategoryFilter, user.username);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function handleBrowseAllSortChange() {
  const select = document.getElementById('browse-all-sort');
  if (select) {
    state.browseAllSort = select.value;
  }
  if (state.browseSelectedUserId) {
    const user = state.communityUsers.find(u => u._id === state.browseSelectedUserId);
    if (user && state.browseUserWatchlist) {
      renderBrowseWatchlistContent(user, state.browseUserWatchlist, getWatchedTitlesSet(state.browseUserWatchlist).size);
    }
  }
}
window.handleBrowseAllSortChange = handleBrowseAllSortChange;

function renderBrowseSubHeader(user, watchlist, totalWatched) {
  const subHeader = document.getElementById('browse-sub-header');
  const container = document.getElementById('browse-sub-header-categories-list');
  if (!subHeader || !container) return;

  const categories = watchlist.categories || [];
  if (categories.length === 0) {
    subHeader.classList.add('hidden');
    return;
  }
  subHeader.classList.remove('hidden');
  container.innerHTML = '';

  const sortedCats = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));
  const isAllActive = !state.browseActiveCategoryFilter || state.browseActiveCategoryFilter === 'all';

  const browseSortWrap = document.getElementById('browse-all-sort-wrap');
  if (browseSortWrap) {
    browseSortWrap.classList.toggle('hidden', !isAllActive);
  }

  // "All" chip
  const allChip = document.createElement('div');
  allChip.className = `sub-cat-chip ${isAllActive ? 'active' : ''}`;
  allChip.innerHTML = `
    <i class="fa-solid fa-list-ul"></i>
    <span>All</span>
    <span class="sub-cat-badge">${totalWatched}</span>
  `;
  allChip.onclick = () => filterBrowseCategory('all');
  container.appendChild(allChip);

  // Each Category chip
  sortedCats.forEach(cat => {
    const isCatActive = isBrowseCategoryActive(cat);
    const chip = document.createElement('div');
    chip.className = `sub-cat-chip ${isCatActive ? 'active' : ''}`;
    chip.setAttribute('data-browse-cat-id', cat._id);
    chip.setAttribute('title', `Click to view "${cat.categoryName}"`);

    chip.innerHTML = `
      <i class="fa-solid fa-folder"></i>
      <span>${escapeHtml(cat.categoryName)}</span>
      <span class="sub-cat-badge">${cat.animes ? cat.animes.length : 0}</span>
    `;

    chip.onclick = () => filterBrowseCategory(cat._id);
    container.appendChild(chip);
  });
}

function renderBrowseWatchlistContent(user, watchlist, totalWatched) {
  const container = document.getElementById('browse-categories-container');
  if (!container) return;
  container.innerHTML = '';

  const categories = watchlist.categories || [];
  const sortedCats = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));

  if (categories.length === 0) {
    container.innerHTML = `
      <div class="empty-state glass-card">
        <p>This user hasn't created any categories yet.</p>
      </div>
    `;
    return;
  }

  const isAll = !state.browseActiveCategoryFilter || state.browseActiveCategoryFilter === 'all';

  const browseSortWrap = document.getElementById('browse-all-sort-wrap');
  if (browseSortWrap) {
    browseSortWrap.classList.toggle('hidden', !isAll);
    const select = document.getElementById('browse-all-sort');
    if (select && select.value !== state.browseAllSort) {
      select.value = state.browseAllSort || 'default';
    }
  }

  if (isAll) {
    // UNIFIED "ALL" CATEGORIES VIEW:
    // Show all watched anime side-by-side in a continuous grid without category separation
    const allWatched = [];
    sortedCats.forEach(cat => {
      (cat.animes || []).forEach((animeTitle, animeIdx) => {
        allWatched.push({
          title: animeTitle,
          categoryId: cat._id,
          categoryName: cat.categoryName,
          catIndex: animeIdx
        });
      });
    });

    const sortVal = state.browseAllSort || 'default';
    if (sortVal === 'alpha-asc') {
      allWatched.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    } else if (sortVal === 'alpha-desc') {
      allWatched.sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: 'base' }));
    } else if (sortVal === 'popularity-desc') {
      allWatched.sort((a, b) => {
        const keyA = a.title.toLowerCase().trim();
        const keyB = b.title.toLowerCase().trim();
        const popA = state.globalStats[a.title] ?? state.globalStats[keyA] ?? 0;
        const popB = state.globalStats[b.title] ?? state.globalStats[keyB] ?? 0;
        if (popB !== popA) return popB - popA;

        if (popA > 0) {
          const rankA = state.globalRankStats[a.title] ?? state.globalRankStats[keyA] ?? Infinity;
          const rankB = state.globalRankStats[b.title] ?? state.globalRankStats[keyB] ?? Infinity;
          if (rankA !== rankB) return rankA - rankB;
        }

        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      });
    }

    if (allWatched.length === 0) {
      container.innerHTML = `
        <div class="empty-category-notice glass-card" style="padding: 3rem 1.5rem; border-radius: var(--radius-lg); border: 1px solid var(--border-glass);">
          <i class="fa-regular fa-folder-open" style="font-size: 2.5rem; color: var(--text-dim); margin-bottom: 0.75rem;"></i>
          <h4 style="color: #fff; margin-bottom: 0.25rem;">No Anime in Watchlist</h4>
          <p style="color: var(--text-muted);">${escapeHtml(user.username)} hasn't added any anime to their categories yet.</p>
        </div>
      `;
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'anime-grid all-animes-grid';
    grid.id = 'browse-cat-all';

    allWatched.forEach((item, globalIdx) => {
      const card = createBrowseAnimeCard(item.title, globalIdx, item.categoryName);
      grid.appendChild(card);
    });

    container.appendChild(grid);
    triggerGridRowAlignment();
    return;
  }

  // SINGLE CATEGORY FILTER VIEW:
  // Show only images belonging to the selected category header
  const matchedCats = sortedCats.filter(c => isBrowseCategoryActive(c));
  const displayedCats = matchedCats.length > 0 ? matchedCats : sortedCats;

  displayedCats.forEach((cat) => {
    const catBlock = document.createElement('div');
    catBlock.className = 'category-block';

    catBlock.innerHTML = `
      <div class="category-header">
        <div class="category-title-wrap">
          <i class="fa-solid fa-folder-open text-highlight"></i>
          <h3 class="category-title">${escapeHtml(cat.categoryName)}</h3>
          <span class="category-count">${cat.animes ? cat.animes.length : 0} anime</span>
        </div>
        <span class="badge badge-readonly"><i class="fa-solid fa-eye"></i> Read Only</span>
      </div>
      <div class="category-body">
        <div class="anime-grid" id="browse-cat-${cat._id}"></div>
      </div>
    `;

    const grid = catBlock.querySelector(`#browse-cat-${cat._id}`);

    if (!cat.animes || cat.animes.length === 0) {
      grid.parentElement.innerHTML = `
        <div class="empty-category-notice">
          <p>No anime in this category.</p>
        </div>
      `;
    } else {
      cat.animes.forEach((animeTitle, idx) => {
        const card = createBrowseAnimeCard(animeTitle, idx, null);
        grid.appendChild(card);
      });
    }

    container.appendChild(catBlock);
  });

  triggerGridRowAlignment();
}

function createBrowseAnimeCard(animeTitle, idx, categoryName = null) {
  const meta = findAnimeMeta(animeTitle);
  const popCount = state.globalStats[animeTitle] || 0;

  const card = document.createElement('div');
  card.className = 'anime-card';
  card.innerHTML = `
    <div class="card-poster-wrap">
      <img class="card-poster" src="${meta ? meta.imageUrl : `/images/${encodeURIComponent(animeTitle)}.jpg`}" alt="${escapeAttr(animeTitle)}" loading="lazy" onload="triggerGridRowAlignment()" onerror="this.src='/images/Naruto.jpg'; triggerGridRowAlignment();">
      <div class="pop-badge ${popCount > 0 ? 'pop-hot' : ''}" title="Click to view who watched (${popCount} user${popCount === 1 ? '' : 's'})" onclick="event.stopPropagation(); showAnimeWatchersModal('${escapeAttr(animeTitle)}')">
        <i class="fa-solid fa-fire"></i> ${popCount}
      </div>
      <div class="order-badge" title="${categoryName ? 'Overall watched order' : 'Rank in category'}">#${idx + 1}</div>
      <div class="copy-hover-badge"><i class="fa-regular fa-copy"></i> Click to copy</div>
    </div>
    <div class="card-content">
      <h4 class="anime-title" title="${escapeAttr(animeTitle)}">${escapeHtml(animeTitle)}</h4>
      ${categoryName ? `
        <div class="card-cat-badge" title="Category: ${escapeAttr(categoryName)}">
          <i class="fa-solid fa-folder"></i> ${escapeHtml(categoryName)}
        </div>
      ` : `
        <div class="card-meta">
          <span>Ranked #${idx + 1}</span>
        </div>
      `}
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.pop-badge')) return;
    copyAnimeTitle(animeTitle);
  });

  return card;
}

function compareWithSelectedUser() {
  if (!state.browseSelectedUserId) return;
  state.compareSourceId = state.currentUser._id;
  state.compareDestId = state.browseSelectedUserId;
  switchView('compare');
}

// ==========================================
// VIEW 4: COMPARE WATCHLISTS
// ==========================================
async function renderCompareView() {
  const sourceSelect = document.getElementById('compare-source-select');
  const destSelect = document.getElementById('compare-dest-select');

  try {
    if (!state.communityUsers || state.communityUsers.length === 0) {
      state.communityUsers = await apiRequest('/api/users');
    }

    sourceSelect.innerHTML = '';
    destSelect.innerHTML = '';

    state.communityUsers.forEach(user => {
      const opt1 = document.createElement('option');
      opt1.value = user._id;
      opt1.textContent = `${user.username} ${user._id === state.currentUser._id ? '(You)' : ''}`;
      sourceSelect.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = user._id;
      opt2.textContent = `${user.username} ${user._id === state.currentUser._id ? '(You)' : ''}`;
      destSelect.appendChild(opt2);
    });

    if (!state.compareSourceId) {
      state.compareSourceId = state.currentUser._id;
    }
    sourceSelect.value = state.compareSourceId;

    if (!state.compareDestId) {
      const otherUser = state.communityUsers.find(u => u._id !== state.currentUser._id);
      state.compareDestId = otherUser ? otherUser._id : state.currentUser._id;
    }
    destSelect.value = state.compareDestId;

    runComparison();
  } catch (err) {
    showToast('Failed to initialize comparison.', 'error');
  }
}

function swapCompareUsers() {
  const sourceSelect = document.getElementById('compare-source-select');
  const destSelect = document.getElementById('compare-dest-select');

  const temp = sourceSelect.value;
  sourceSelect.value = destSelect.value;
  destSelect.value = temp;

  state.compareSourceId = sourceSelect.value;
  state.compareDestId = destSelect.value;

  runComparison();
}

async function runComparison() {
  const sourceId = document.getElementById('compare-source-select').value;
  const destId = document.getElementById('compare-dest-select').value;

  if (!sourceId || !destId) return;

  state.compareSourceId = sourceId;
  state.compareDestId = destId;

  const summaryBar = document.getElementById('compare-summary-bar');
  const emptyState = document.getElementById('compare-empty-state');
  const grid = document.getElementById('compare-grid');

  if (sourceId === destId) {
    summaryBar.classList.add('hidden');
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    document.getElementById('compare-empty-title').textContent = 'Same User Selected';
    document.getElementById('compare-empty-desc').textContent = 'Please choose two different users to compare watchlists and see the anime difference!';
    return;
  }

  try {
    const data = await apiRequest(`/api/watchlist/compare?source=${sourceId}&destination=${destId}`);
    state.compareResults = data;
    renderCompareResults();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderCompareResults() {
  if (!state.compareResults) return;

  const data = state.compareResults;
  const summaryBar = document.getElementById('compare-summary-bar');
  const emptyState = document.getElementById('compare-empty-state');
  const grid = document.getElementById('compare-grid');
  const sortSelect = document.getElementById('compare-sort');

  const headline = document.getElementById('diff-summary-headline');
  const sub = document.getElementById('diff-summary-sub');

  if (data.diffCount === 0) {
    summaryBar.classList.add('hidden');
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    document.getElementById('compare-empty-title').textContent = 'No Unwatched Recommendations Found';
    document.getElementById('compare-empty-desc').textContent = 
      `All anime watched by "${data.destinationUser.username}" (${data.destinationUser.totalWatched}) are already in "${data.sourceUser.username}"'s watchlist!`;
    return;
  }

  emptyState.classList.add('hidden');
  summaryBar.classList.remove('hidden');

  headline.textContent = `${data.destinationUser.username} has watched ${data.diffCount} anime that ${data.sourceUser.username} hasn't seen!`;
  sub.textContent = `Comparison: Source has watched ${data.sourceUser.totalWatched} anime | Destination has watched ${data.destinationUser.totalWatched} anime`;

  // Sort Diff Animes
  let sortedDiff = [...data.diffAnimes];
  const sortType = sortSelect.value;
  if (sortType === 'alpha-asc') {
    sortedDiff.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  } else if (sortType === 'alpha-desc') {
    sortedDiff.sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: 'base' }));
  } else if (sortType === 'popularity-desc') {
    sortedDiff.sort((a, b) => {
      const keyA = a.title.toLowerCase().trim();
      const keyB = b.title.toLowerCase().trim();
      const popA = state.globalStats[a.title] ?? state.globalStats[keyA] ?? 0;
      const popB = state.globalStats[b.title] ?? state.globalStats[keyB] ?? 0;
      if (popB !== popA) return popB - popA;

      if (popA > 0) {
        const rankA = state.globalRankStats[a.title] ?? state.globalRankStats[keyA] ?? Infinity;
        const rankB = state.globalRankStats[b.title] ?? state.globalRankStats[keyB] ?? Infinity;
        if (rankA !== rankB) return rankA - rankB;
      }

      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });
  }

  grid.innerHTML = '';

  const isSourceCurrentUser = (data.sourceUser._id === state.currentUser._id);

  sortedDiff.forEach(item => {
    const meta = findAnimeMeta(item.title);
    const popCount = state.globalStats[item.title] || 0;

    const card = document.createElement('div');
    card.className = 'anime-card';

    card.innerHTML = `
      <div class="card-poster-wrap">
        <img class="card-poster" src="${meta ? meta.imageUrl : item.imageUrl}" alt="${escapeAttr(item.title)}" loading="lazy" onload="triggerGridRowAlignment()" onerror="this.src='/images/Naruto.jpg'; triggerGridRowAlignment();">
        <div class="pop-badge ${popCount > 0 ? 'pop-hot' : ''}" title="Click to view who watched (${popCount} user${popCount === 1 ? '' : 's'})" onclick="event.stopPropagation(); showAnimeWatchersModal('${escapeAttr(item.title)}')">
          <i class="fa-solid fa-fire"></i> ${popCount} users
        </div>
        <div class="copy-hover-badge"><i class="fa-regular fa-copy"></i> Click to copy</div>
      </div>
      <div class="card-content">
        <h4 class="anime-title" title="${escapeAttr(item.title)}">${escapeHtml(item.title)}</h4>
        <div class="card-meta">
          <span class="text-highlight"><i class="fa-solid fa-folder"></i> In "${escapeHtml(item.destCategory)}"</span>
        </div>
        ${isSourceCurrentUser ? `
          <div class="card-actions">
            <button class="btn btn-accent btn-block" onclick="event.stopPropagation(); openMoveAnimeModal('${escapeAttr(item.title)}')">
              <i class="fa-solid fa-plus"></i> Add to My Watchlist
            </button>
          </div>
        ` : ''}
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('.btn') || e.target.closest('.card-actions') || e.target.closest('.pop-badge')) {
        return;
      }
      copyAnimeTitle(item.title);
    });
    grid.appendChild(card);
  });
  triggerGridRowAlignment();
}

// ==========================================
// HELPERS & MODAL CONTROLS
// ==========================================
async function refreshGlobalStats() {
  try {
    const statsData = await apiRequest('/api/animes/global-stats');
    state.globalStats = statsData.stats || {};
    state.globalRankStats = statsData.rankStats || {};
  } catch (e) {
    console.warn('Failed to refresh global stats:', e);
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

function handleModalBackdropClick(event, modalId) {
  if (event.target.id === modalId) {
    closeModal(modalId);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ==========================================
// WATCHERS POPUP MODAL LOGIC
// ==========================================
async function showAnimeWatchersModal(animeTitle) {
  if (!animeTitle) return;
  const modal = document.getElementById('modal-watchers');
  if (!modal) return;

  const meta = findAnimeMeta(animeTitle);
  const imgEl = document.getElementById('watchers-modal-img');
  const titleEl = document.getElementById('watchers-modal-title');
  const countBadgeEl = document.getElementById('watchers-modal-count-badge');
  const listEl = document.getElementById('watchers-modal-list');

  if (imgEl) {
    imgEl.src = meta ? meta.imageUrl : `/images/${encodeURIComponent(animeTitle)}.jpg`;
    imgEl.onerror = () => { imgEl.src = '/images/Naruto.jpg'; };
  }
  if (titleEl) {
    titleEl.textContent = animeTitle;
  }
  if (countBadgeEl) {
    countBadgeEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Loading...`;
  }
  if (listEl) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: 2rem 1rem; color: var(--text-dim);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block; color: var(--secondary);"></i>
        Fetching watchers...
      </div>
    `;
  }

  modal.classList.remove('hidden');

  try {
    const res = await apiRequest(`/api/animes/watchers?title=${encodeURIComponent(animeTitle)}`);
    const watchers = res.watchers || [];
    const count = res.count !== undefined ? res.count : watchers.length;

    if (countBadgeEl) {
      countBadgeEl.innerHTML = `<i class="fa-solid fa-fire text-highlight"></i> ${count} user${count === 1 ? '' : 's'} watching`;
    }

    if (!listEl) return;

    if (watchers.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted);">
          <i class="fa-regular fa-face-meh" style="font-size: 1.75rem; margin-bottom: 0.5rem; display: block; color: var(--text-dim);"></i>
          No community members have added "${escapeHtml(animeTitle)}" to their watchlist yet.
        </div>
      `;
      return;
    }

    listEl.innerHTML = watchers.map(w => {
      const isMe = Boolean(state.currentUser && (w.userId === state.currentUser._id || w.username === state.currentUser.username));
      return `
        <div class="watcher-item">
          <div class="watcher-user-info">
            <div class="watcher-avatar">
              <i class="fa-solid fa-user-ninja"></i>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 0.4rem;">
                <span style="font-weight: 700; font-size: 0.95rem; color: #fff;">${escapeHtml(w.username)}</span>
                ${isMe ? '<span class="user-dir-you-badge">You</span>' : ''}
              </div>
              <div style="margin-top: 0.2rem;">
                <span class="watcher-rank-tag">
                  <i class="fa-solid fa-trophy"></i> Rank #${w.rank || 1}
                </span>
              </div>
            </div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="closeModal('modal-watchers'); inspectUserWatchlist('${w.userId}')" title="View ${escapeAttr(w.username)}'s watchlist">
            <i class="fa-solid fa-eye"></i> View Profile
          </button>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load watchers:', err);
    if (countBadgeEl) countBadgeEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Error`;
    if (listEl) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 1.5rem; color: var(--accent);">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
          Failed to load watchers: ${escapeHtml(err.message)}
        </div>
      `;
    }
  }
}

function inspectUserWatchlist(userId) {
  if (!userId) return;
  state.browseSelectedUserId = userId;
  switchView('browse');
}

// Attach to window object for reliable inline event invocation
window.showAnimeWatchersModal = showAnimeWatchersModal;
window.inspectUserWatchlist = inspectUserWatchlist;

// ==========================================
// IMPORT WATCHLIST LOGIC
// ==========================================
const ANIME_ALIASES = {
  'tensura': 'That Time I Got Reincarnated as a Slime',
  'slime': 'That Time I Got Reincarnated as a Slime',
  '100 gfs': 'The 100 Girlfriends Who Really, Really, Really, Really, Really Love You',
  '100 girlfriends': 'The 100 Girlfriends Who Really, Really, Really, Really, Really Love You',
  '100 kanojo': 'The 100 Girlfriends Who Really, Really, Really, Really, Really Love You',
  'buchigiri': 'Bucchigiri',
  'danmachi': 'Is It Wrong to Try to Pick Up Girls in a Dungeon',
  'konosuba': "KonoSuba: God's Blessing on this Wonderful World!",
  'oregairu': 'My Teen Romantic Comedy SNAFU',
  'kuroko': "Kuroko's Basketball",
  'haikyuu': 'Haikyu!!',
  'haikyu': 'Haikyu!!',
  'mha': 'My Hero Academia',
  'bnha': 'My Hero Academia',
  'aot': 'Attack on Titan',
  'snk': 'Attack on Titan',
  'hxh': 'Hunter x Hunter',
  'jjk': 'Jujutsu Kaisen',
  'sao': 'Sword Art Online',
  'opm': 'One Punch Man',
  'csm': 'Chainsaw Man'
};

function parseImportText(text) {
  if (!text || !text.trim()) return [];

  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blocks = [];
  let currentCategory = null;
  let currentAnimes = [];

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (currentCategory && currentAnimes.length > 0) {
        blocks.push({
          categoryName: currentCategory,
          animes: currentAnimes
        });
        currentCategory = null;
        currentAnimes = [];
      }
    } else {
      if (!currentCategory) {
        currentCategory = line.replace(/^#+\s*/, '').replace(/:$/, '').trim();
      } else {
        const animeName = line.replace(/^[-*•]\s*/, '').replace(/^\d+[\.)]\s*/, '').trim();
        if (animeName) {
          currentAnimes.push(animeName);
        }
      }
    }
  }

  if (currentCategory && currentAnimes.length > 0) {
    blocks.push({
      categoryName: currentCategory,
      animes: currentAnimes
    });
  }

  return blocks;
}

function resolveAnimeTitle(rawName) {
  if (!rawName) return { title: '', matched: false, resolvedFrom: null };
  const clean = rawName.trim();
  const lower = clean.toLowerCase();

  // 1. Exact match in allAnimeList
  const exact = state.allAnimeList.find(a => a.title.toLowerCase().trim() === lower);
  if (exact) {
    return { title: exact.title, matched: true, resolvedFrom: null, imageUrl: exact.imageUrl };
  }

  // 2. Alias match
  if (ANIME_ALIASES[lower]) {
    const target = ANIME_ALIASES[lower].toLowerCase();
    const aliasMatch = state.allAnimeList.find(a => a.title.toLowerCase().trim() === target || a.title.toLowerCase().includes(target));
    if (aliasMatch) {
      return { title: aliasMatch.title, matched: true, resolvedFrom: clean, imageUrl: aliasMatch.imageUrl };
    }
  }

  // 3. Normalized stripped match (ignoring spaces & punctuation)
  const stripped = lower.replace(/[^a-z0-9]/g, '');
  if (stripped.length >= 3) {
    const strippedMatch = state.allAnimeList.find(a => a.title.toLowerCase().replace(/[^a-z0-9]/g, '') === stripped);
    if (strippedMatch) {
      return { title: strippedMatch.title, matched: true, resolvedFrom: clean, imageUrl: strippedMatch.imageUrl };
    }
  }

  // 4. Substring / Starts with / Ends with match
  if (lower.length >= 4) {
    const subMatch = state.allAnimeList.find(a => {
      const aLower = a.title.toLowerCase();
      return aLower.startsWith(lower) || aLower.includes(lower);
    });
    if (subMatch) {
      return { title: subMatch.title, matched: true, resolvedFrom: clean, imageUrl: subMatch.imageUrl };
    }
  }

  // Fallback: keep user's raw title
  return { title: clean, matched: false, resolvedFrom: null, imageUrl: `/images/${encodeURIComponent(clean)}.jpg` };
}

function openImportModal() {
  const modal = document.getElementById('modal-import');
  if (!modal) return;
  modal.classList.remove('hidden');
  const input = document.getElementById('import-text-input');
  if (input) {
    setTimeout(() => input.focus(), 100);
    handleImportTextChange();
  }
}

function loadImportExample() {
  const input = document.getElementById('import-text-input');
  if (!input) return;
  input.value = `Hype
Black Clover
One Piece
Buchigiri

Romcom
100 GFs
Tensura`;
  handleImportTextChange();
  showToast('Loaded sample import format!', 'info', 2000);
}

function handleImportTextChange() {
  const input = document.getElementById('import-text-input');
  const previewSection = document.getElementById('import-preview-section');
  const previewStats = document.getElementById('import-preview-stats');
  const previewBlocks = document.getElementById('import-preview-blocks');
  const submitBtn = document.getElementById('btn-submit-import');

  if (!input || !previewSection || !previewBlocks) return;

  const rawText = input.value;
  const blocks = parseImportText(rawText);

  let totalAnime = 0;
  blocks.forEach(b => totalAnime += b.animes.length);

  if (blocks.length === 0 || totalAnime === 0) {
    previewSection.classList.add('hidden');
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  previewSection.classList.remove('hidden');
  if (submitBtn) submitBtn.disabled = false;

  if (previewStats) {
    previewStats.textContent = `${blocks.length} categories, ${totalAnime} anime in order`;
  }

  previewBlocks.innerHTML = blocks.map((block, bIdx) => {
    const resolvedList = block.animes.map(raw => resolveAnimeTitle(raw));
    return `
      <div class="preview-cat-card">
        <div class="preview-cat-header">
          <span class="preview-cat-name">
            <i class="fa-solid fa-folder"></i>
            <span>#${bIdx + 1} <strong>${escapeHtml(block.categoryName)}</strong></span>
          </span>
          <span class="preview-cat-count">${resolvedList.length} anime</span>
        </div>
        <div class="preview-anime-tags">
          ${resolvedList.map((item, aIdx) => `
            <span class="preview-anime-tag ${item.matched ? 'matched' : ''}" title="${item.resolvedFrom ? `Resolved from "${escapeAttr(item.resolvedFrom)}"` : 'Exact match'}">
              <span class="preview-order-num">#${aIdx + 1}</span>
              ${item.matched ? '<i class="fa-solid fa-circle-check text-success"></i>' : '<i class="fa-regular fa-circle"></i>'}
              <span>${escapeHtml(item.title)}</span>
              ${item.resolvedFrom ? `<small style="opacity:0.75; font-size:0.65rem;">(${escapeHtml(item.resolvedFrom)})</small>` : ''}
            </span>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

async function submitWatchlistImport() {
  const input = document.getElementById('import-text-input');
  const submitBtn = document.getElementById('btn-submit-import');
  if (!input) return;

  const rawText = input.value;
  const parsedBlocks = parseImportText(rawText);

  if (parsedBlocks.length === 0) {
    showToast('Please provide at least one category and anime to import.', 'error');
    return;
  }

  // Resolve titles for each block while maintaining exact ordering
  const resolvedBlocks = parsedBlocks.map(block => ({
    categoryName: block.categoryName,
    animes: block.animes.map(raw => resolveAnimeTitle(raw).title)
  }));

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Importing...`;
  }

  try {
    const res = await apiRequest('/api/watchlist/import', {
      method: 'POST',
      body: JSON.stringify({ blocks: resolvedBlocks })
    });

    state.userWatchlist = res.watchlist;
    closeModal('modal-import');

    await refreshGlobalStats();
    updateHeaderBadges();

    // Default to 'all' or show first imported category
    state.activeCategoryFilter = 'all';
    renderWatchlistView();
    renderWatchlistSubHeader();

    showToast(res.message || 'Import successful!', 'success', 4000);
    input.value = '';
    handleImportTextChange();
  } catch (err) {
    console.error('Import failed:', err);
    showToast(err.message || 'Import failed. Please try again.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Import to My Watchlist`;
    }
  }
}

// Window globals for inline calls
window.openImportModal = openImportModal;
window.loadImportExample = loadImportExample;
window.handleImportTextChange = handleImportTextChange;
window.submitWatchlistImport = submitWatchlistImport;

function openHelpModal() {
  const modal = document.getElementById('modal-help');
  if (modal) modal.classList.remove('hidden');
}
window.openHelpModal = openHelpModal;

// ==========================================
// KEYBOARD SHORTCUTS SYSTEM
// ==========================================

function getOpenModal() {
  return document.querySelector('.modal-overlay:not(.hidden)');
}

function isEditingText() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function clearRowFocus() {
  state.focusedRowIndex = -1;
  document.querySelectorAll('.anime-card.row-focused').forEach(c => c.classList.remove('row-focused'));
}

function getActiveViewRows() {
  const activePanel = document.querySelector('.view-panel.active:not(.hidden)');
  if (!activePanel) return [];

  const cards = Array.from(activePanel.querySelectorAll('.anime-card')).filter(c => {
    return c.offsetParent !== null && !c.closest('.hidden');
  });
  if (cards.length === 0) return [];

  const rowMap = new Map();
  cards.forEach(card => {
    const top = Math.round((card.getBoundingClientRect().top + window.scrollY) / 16) * 16;
    if (!rowMap.has(top)) rowMap.set(top, []);
    rowMap.get(top).push(card);
  });

  const sortedTops = Array.from(rowMap.keys()).sort((a, b) => a - b);
  return sortedTops.map(t => rowMap.get(t));
}

function applyRowFocus(rows, idx) {
  document.querySelectorAll('.anime-card.row-focused').forEach(c => c.classList.remove('row-focused'));
  if (idx < 0 || idx >= rows.length) return;
  const targetRow = rows[idx];
  targetRow.forEach(c => c.classList.add('row-focused'));
  if (targetRow[0]) {
    targetRow[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetRow[0].setAttribute('tabindex', '-1');
    targetRow[0].focus({ preventScroll: true });
  }
}

function navigateWatchlistCategory(direction) {
  const categories = state.userWatchlist?.categories || [];
  const sortedCats = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));
  const catList = ['all', ...sortedCats.map(c => c._id)];
  if (catList.length <= 1) return;

  let currentIndex = 0;
  if (state.activeCategoryFilter && state.activeCategoryFilter !== 'all') {
    const idx = catList.findIndex(id => 
      id === state.activeCategoryFilter || 
      sortedCats.find(c => c._id === id)?.categoryName.toLowerCase() === String(state.activeCategoryFilter).toLowerCase()
    );
    if (idx !== -1) currentIndex = idx;
  }

  let nextIndex;
  if (direction === 'next') {
    nextIndex = (currentIndex + 1) % catList.length;
  } else {
    nextIndex = (currentIndex - 1 + catList.length) % catList.length;
  }

  clearRowFocus();
  filterOrScrollCategory(catList[nextIndex]);
}

function navigateBrowseCategory(direction) {
  const categories = state.browseUserWatchlist?.categories || [];
  const sortedCats = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));
  const catList = ['all', ...sortedCats.map(c => c._id)];
  if (catList.length <= 1) return;

  let currentIndex = 0;
  if (state.browseActiveCategoryFilter && state.browseActiveCategoryFilter !== 'all') {
    const idx = catList.findIndex(id => 
      id === state.browseActiveCategoryFilter || 
      sortedCats.find(c => c._id === id)?.categoryName.toLowerCase() === String(state.browseActiveCategoryFilter).toLowerCase()
    );
    if (idx !== -1) currentIndex = idx;
  }

  let nextIndex;
  if (direction === 'next') {
    nextIndex = (currentIndex + 1) % catList.length;
  } else {
    nextIndex = (currentIndex - 1 + catList.length) % catList.length;
  }

  clearRowFocus();
  filterBrowseCategory(catList[nextIndex]);
}

function cycleViews(direction) {
  const views = ['watchlist', 'unwatched', 'browse', 'compare'];
  const curIdx = views.indexOf(state.currentView || 'watchlist');
  let nextIdx;
  if (direction === 'next') {
    nextIdx = (curIdx + 1) % views.length;
  } else {
    nextIdx = (curIdx - 1 + views.length) % views.length;
  }
  clearRowFocus();
  switchView(views[nextIdx]);
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Never intercept standard browser developer tools or reload shortcuts
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
      return;
    }
    if (e.key === 'F12' || e.key === 'F5') {
      return;
    }

    // Only active when logged in
    if (!state.currentUser || !state.token) return;

    const openModal = getOpenModal();

    // 1. Modal-Specific Shortcut Handling (Enter = Main Action, Esc = Close Box)
    if (openModal) {
      // Esc closes any open modal box
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal(openModal.id);
        return;
      }

      // Enter performs the main action of the open modal box
      if (e.key === 'Enter') {
        // If focused specifically on a Cancel / Close button, allow Enter to cancel/close
        if (e.target.closest('button[onclick*="closeModal"], .btn-close')) {
          return;
        }

        // Import Modal: textarea uses plain Enter for newline; Ctrl/Cmd+Enter or Enter outside textarea submits
        if (openModal.id === 'modal-import') {
          if (e.target.id === 'import-text-input' && !e.ctrlKey && !e.metaKey) {
            return; // Allow newline inside textarea
          }
          e.preventDefault();
          const submitBtn = document.getElementById('btn-submit-import');
          if (submitBtn && !submitBtn.disabled) {
            submitWatchlistImport();
          } else {
            showToast('Please enter category names and anime before importing.', 'info');
          }
          return;
        }

        e.preventDefault();

        // New Category Modal -> Create Category
        if (openModal.id === 'modal-category') {
          const submitBtn = openModal.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.click();
          return;
        }

        // Edit / Rename Category Modal -> Save Name
        if (openModal.id === 'modal-edit-category') {
          const submitBtn = openModal.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.click();
          return;
        }

        // Rename Anime Image Modal -> Rename Everywhere
        if (openModal.id === 'modal-edit-anime-name') {
          const submitBtn = document.getElementById('btn-submit-rename-anime') || openModal.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.click();
          return;
        }

        // Admin Settings Modal -> Save password if in input, or close Done
        if (openModal.id === 'modal-admin-settings') {
          if (e.target.classList.contains('admin-pw-input')) {
            const uid = e.target.id.replace('pw-input-', '');
            const card = e.target.closest('.admin-user-card');
            const uname = card?.querySelector('.admin-user-name span')?.textContent || '';
            if (uid) saveUserPassword(uid, uname);
            return;
          }
          closeModal('modal-admin-settings');
          return;
        }

        // Move Anime Modal -> Save Assignment
        if (openModal.id === 'modal-move-anime') {
          const submitBtn = document.getElementById('move-modal-submit-btn') || openModal.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.click();
          return;
        }

        // Delete Category Modal -> Confirm Deletion
        if (openModal.id === 'modal-delete-category') {
          const delBtn = openModal.querySelector('button.btn-danger');
          if (delBtn) delBtn.click();
          else confirmDeleteCategory();
          return;
        }

        // Watchers Modal -> Close
        if (openModal.id === 'modal-watchers') {
          closeModal('modal-watchers');
          return;
        }

        // Help Modal -> Close
        if (openModal.id === 'modal-help') {
          closeModal('modal-help');
          return;
        }

        // Generic fallback for any other modal: trigger primary action button
        const mainBtn = openModal.querySelector('button[type="submit"], button.btn-primary, button.btn-danger');
        if (mainBtn) mainBtn.click();
        return;
      }

      // Inside any modal, suppress global shortcuts
      return;
    }

    // 2. Shift + Enter: Toggle Selection Mode (everywhere outside modals)
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      toggleSelectionMode();
      return;
    }

    // 3. Ctrl + Arrow keys: Switch Views
    if (e.ctrlKey && e.key === 'ArrowRight') {
      e.preventDefault();
      cycleViews('next');
      return;
    }
    if (e.ctrlKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      cycleViews('prev');
      return;
    }

    // 4. When typing in input/textarea outside modals
    if (isEditingText()) {
      if (e.key === 'Escape') {
        if (document.activeElement.id === 'watchlist-search') {
          closeWatchlistSearch();
          e.preventDefault();
          return;
        }
        if (document.activeElement.id === 'unwatched-search') {
          closeUnwatchedSearch();
          e.preventDefault();
          return;
        }
        document.activeElement.blur();
        return;
      }

      // If user presses Shift+Space inside search input, toggle between category/unwatched and global search
      if (e.shiftKey && (e.key === ' ' || e.code === 'Space')) {
        if (document.activeElement.id === 'watchlist-search') {
          e.preventDefault();
          toggleWatchlistSearchScope();
          return;
        }
        if (document.activeElement.id === 'unwatched-search') {
          e.preventDefault();
          toggleUnwatchedSearchScope();
          return;
        }
      }

      // Enter inside search input: copy first search result's title to clipboard with toast notification
      if (e.key === 'Enter') {
        if (document.activeElement.id === 'watchlist-search') {
          e.preventDefault();
          const copied = copyFirstSearchResultTitle('watchlist');
          if (copied) {
            showToast(`Copied "${copied}" to clipboard!`, 'info', 1800);
          }
          return;
        }
        if (document.activeElement.id === 'unwatched-search') {
          e.preventDefault();
          const copied = copyFirstSearchResultTitle('unwatched');
          if (copied) {
            showToast(`Copied "${copied}" to clipboard!`, 'info', 1800);
          }
          return;
        }
      }

      return;
    }

    // Esc outside text inputs: close any open search box
    if (e.key === 'Escape') {
      const wlWrap = document.getElementById('watchlist-search-wrap');
      if (wlWrap && !wlWrap.classList.contains('hidden')) {
        e.preventDefault();
        closeWatchlistSearch();
        return;
      }
      const uwWrap = document.getElementById('unwatched-search-wrap');
      if (uwWrap && !uwWrap.classList.contains('hidden')) {
        e.preventDefault();
        closeUnwatchedSearch();
        return;
      }
    }

    // 5. Space or Shift + Space: Open / Focus Search
    // Space: current category in My Watchlist, entire collection in Not Watched
    // Shift + Space: Global search among all images
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (e.shiftKey) {
        // Global search among ALL images
        if (state.currentView === 'watchlist') {
          openWatchlistSearch('global');
          showToast('Global Search: searching among all images.', 'info', 1800);
        } else if (state.currentView === 'unwatched') {
          openUnwatchedSearch('global');
          showToast('Global Search: searching among all images.', 'info', 1800);
        } else {
          switchView('watchlist');
          setTimeout(() => {
            openWatchlistSearch('global');
          }, 60);
        }
      } else {
        // Regular Space: current category in My Watchlist, or entire in Not Watched
        if (state.currentView === 'watchlist') {
          const catName = getActiveCategoryName();
          openWatchlistSearch('category');
          showToast(`Search in ${catName} (Shift+Space: all images)`, 'info', 1800);
        } else if (state.currentView === 'unwatched') {
          openUnwatchedSearch('unwatched');
          showToast('Search unwatched collection (Shift+Space: all images)', 'info', 1800);
        }
      }
      return;
    }

    // 5. Selection Mode with selected images:
    if (state.isSelectionMode && state.selectedAnimes.size > 0 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // d -> remove selected
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        if (state.currentView === 'watchlist') {
          batchRemoveSelected();
        } else {
          showToast('Batch removal is only available in "My Watchlist".', 'info');
        }
        return;
      }

      // m -> move to category
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        if (state.currentView === 'watchlist') {
          openBatchMoveModal();
        } else if (state.currentView === 'unwatched') {
          openBatchAddModal();
        }
        return;
      }

      // ArrowUp -> move selected images above
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (state.currentView === 'watchlist') {
          batchReorderSelectedAnime(-1);
        }
        return;
      }

      // ArrowDown -> move selected images below
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (state.currentView === 'watchlist') {
          batchReorderSelectedAnime(1);
        }
        return;
      }
    }

    // 6. Arrow Keys for Category Navigation and Row Focus
    // Right Arrow: next category (wraps to 'All')
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (state.currentView === 'watchlist') {
        navigateWatchlistCategory('next');
      } else if (state.currentView === 'browse') {
        navigateBrowseCategory('next');
      }
      return;
    }

    // Left Arrow: prev category (wraps to last)
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (state.currentView === 'watchlist') {
        navigateWatchlistCategory('prev');
      } else if (state.currentView === 'browse') {
        navigateBrowseCategory('prev');
      }
      return;
    }

    // Down Arrow: row focus (when NOT in selection mode)
    if (e.key === 'ArrowDown' && !state.isSelectionMode) {
      e.preventDefault();
      const rows = getActiveViewRows();
      if (rows.length === 0) return;
      if (state.focusedRowIndex === -1) {
        state.focusedRowIndex = 0;
      } else {
        state.focusedRowIndex = Math.min(state.focusedRowIndex + 1, rows.length - 1);
      }
      applyRowFocus(rows, state.focusedRowIndex);
      return;
    }

    // Up Arrow: reverse row focus (when NOT in selection mode)
    if (e.key === 'ArrowUp' && !state.isSelectionMode) {
      e.preventDefault();
      const rows = getActiveViewRows();
      if (rows.length === 0) return;
      if (state.focusedRowIndex <= 0) {
        clearRowFocus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        state.focusedRowIndex = state.focusedRowIndex - 1;
        applyRowFocus(rows, state.focusedRowIndex);
      }
      return;
    }

    // 7. Single Key Actions
    // n -> Create new category
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      openNewCategoryModal();
      return;
    }

    // e -> Edit current category
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'e') {
      e.preventDefault();
      if (state.currentView !== 'watchlist') {
        showToast('Category renaming is available in "My Watchlist".', 'info');
        return;
      }
      const categories = state.userWatchlist?.categories || [];
      if (categories.length === 0) {
        showToast('No categories available to edit. Press "n" to create one!', 'info');
        return;
      }
      let catToEdit = null;
      if (state.activeCategoryFilter && state.activeCategoryFilter !== 'all') {
        catToEdit = categories.find(c => 
          c._id === state.activeCategoryFilter || 
          c.categoryName.toLowerCase() === String(state.activeCategoryFilter).toLowerCase()
        );
      }
      if (!catToEdit) {
        catToEdit = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0))[0];
      }
      if (catToEdit) {
        openEditCategoryModal(catToEdit._id, catToEdit.categoryName);
      }
      return;
    }

    // D -> Delete current category (Capital D / Shift+d)
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'D') {
      e.preventDefault();
      if (state.currentView !== 'watchlist') {
        showToast('Category deletion is available in "My Watchlist".', 'info');
        return;
      }
      const categories = state.userWatchlist?.categories || [];
      if (categories.length === 0) {
        showToast('No categories to delete.', 'info');
        return;
      }
      let catToDelete = null;
      if (state.activeCategoryFilter && state.activeCategoryFilter !== 'all') {
        catToDelete = categories.find(c => 
          c._id === state.activeCategoryFilter || 
          c.categoryName.toLowerCase() === String(state.activeCategoryFilter).toLowerCase()
        );
      }
      if (!catToDelete) {
        showToast('Select a specific category first using Left/Right arrows to delete it.', 'info');
        return;
      }
      openDeleteCategoryModal(catToDelete._id, catToDelete.categoryName);
      return;
    }

    // i -> Open import modal (plain 'i' only; never Ctrl+Shift+I or other combinations)
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      openImportModal();
      return;
    }

    // h or ? (or Shift+/) -> Open Help / Keyboard Shortcuts modal
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'h' || e.key === 'H' || e.key === '?' || (e.shiftKey && e.key === '/'))) {
      e.preventDefault();
      openHelpModal();
      return;
    }
  });
}


