# 🌟 ANIX | Anime Watchlist & Visual Tracker

A modern, production-ready Full-Stack Web Application for anime lovers to track watched anime, organize them into custom tier categories, reorder titles with intuitive drag-and-drop & button controls, compare watchlists with other users, and view global popularity stats.

---

## 🚀 Features

- **Visual Anime Cards**:
  - Serves anime posters locally from `./Images`.
  - Dynamic file scanner that parses anime titles from image file names (e.g. `Naruto.jpg` ➔ `Naruto`).
  - Includes 33 top anime covers ready out-of-the-box.
- **Custom Categories & Tier Management**:
  - Create and delete custom categories (e.g., "S-Tier", "Favorites", "Completed", "Masterpieces").
  - **Strict Rule Enforcement**: Each anime exists in **at most ONE category at a time** within a user's watched list. Moving an anime to a new category automatically updates its location.
  - Deleting a category automatically returns all animes inside it to the **Unwatched** state.
- **Image Reordering**:
  - Reorder anime inside any category using interactive **HTML5 Drag-and-Drop** or accessible **Up/Down buttons**.
  - Reorder categories up and down with instant database persistence.
- **Unwatched Anime Discovery**:
  - Displays all available anime in `./Images` that you haven't watched yet.
  - Search anime titles in real time.
  - Sorting options:
    1. `Alphabetical (Ascending A-Z)`
    2. `Alphabetical (Descending Z-A)`
    3. `Most Watched Globally (Descending)`
  - Quick 1-click "Mark Watched" modal.
- **Browse Community Users (Read-Only)**:
  - Browse any registered user's categories and ranked anime list.
  - Read-only protection: cannot modify another user's watchlist.
- **Compare Watchlists (Diff Engine)**:
  - Select any **Source User** and **Destination User** (or quickly swap them).
  - Calculates the exact diff: **Anime watched by Destination User that Source User hasn't seen yet**.
  - Sort recommendations by Alphabetical or Global Popularity.
  - 1-click "Add to My Watchlist" recommendation action.
- **Global Popularity Statistics**:
  - Real-time aggregation showing how many users across the platform have each anime in their watchlist (e.g. `🔥 Watched by 5 users`).
- **Authentication & Persistence**:
  - Clean Register and Login views.
  - Session stored in browser `localStorage` with automatic re-authentication on page refresh.
  - One-click Logout.
- **Dark-Mode Anime Aesthetic**:
  - Responsive cards with glassmorphism, glowing badges, and toast notifications.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB Atlas with Mongoose ODM
- **Frontend**: HTML5, CSS3 (Modern Glassmorphism & Custom Properties), Vanilla JavaScript (ES6+)
- **Authentication**: JSON Web Tokens (JWT) & bcryptjs
- **Icons & Typography**: FontAwesome 6, Plus Jakarta Sans, Space Grotesk

---

## 📁 File Architecture

```
├── .env                     # Port, MongoDB URI & JWT Secret
├── package.json             # Dependencies and scripts
├── server.js                # Express app entry point
├── models/
│   ├── User.js              # User schema with bcrypt password hashing
│   └── Watchlist.js         # Watchlist and Category schema
├── routes/
│   ├── auth.js              # Register, Login, Me, and Users API
│   ├── anime.js             # Local Image scanner & Global Stats API
│   └── watchlist.js         # Category CRUD, Add/Remove/Reorder, and Compare API
├── middleware/
│   └── auth.js              # JWT authentication middleware
├── utils/
│   └── imageScanner.js      # Dynamic file reader for ./Images directory
├── Images/                  # Local directory with anime cover images
├── public/
│   ├── index.html           # Single-page application markup
│   ├── style.css            # Dark anime theme styling
│   └── app.js               # Reactive frontend logic
├── scripts/
│   └── seedImages.js        # Script to download/generate anime covers
└── tests/
    └── integrationTest.js   # Complete automated end-to-end integration test
```

---

## ⚙️ Setup & Running

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start Server**:
   ```bash
   npm start
   ```
   The server will start at: `http://localhost:3000`

3. **Run Automated Integration Tests**:
   ```bash
   node tests/integrationTest.js
   ```

---

## 📡 API Endpoints Reference

### 🔐 Authentication
- `POST /api/register` - Create new user (`username`, `password`)
- `POST /api/login` - Authenticate user (`username`, `password`)
- `GET /api/me` - Validate session token
- `GET /api/users` - List all registered users

### 🖼️ Anime & Global Stats
- `GET /api/animes` - Scans `./Images` and returns anime titles & URLs
- `GET /api/animes/global-stats` - Aggregated watch count per anime across all users

### 📋 Watchlist Management
- `GET /api/watchlist/:userId` - Get user's watchlist with categories
- `POST /api/watchlist/category` - Create a custom category
- `DELETE /api/watchlist/category` - Delete category (animes revert to unwatched)
- `POST /api/watchlist/add-anime` - Add/move anime into category (enforces single category rule)
- `POST /api/watchlist/remove-anime` - Remove anime from watchlist (returns to unwatched)
- `PUT /api/watchlist/reorder` - Update ordering of animes or categories
- `GET /api/watchlist/compare?source={userId1}&destination={userId2}` - Returns anime diff between two users
