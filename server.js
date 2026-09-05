require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { ensureImagesDirectory } = require('./utils/imageScanner');

const authRoutes = require('./routes/auth');
const animeRoutes = require('./routes/anime');
const watchlistRoutes = require('./routes/watchlist');

const app = express();
const PORT = process.env.PORT || 3009;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://lovereonagi143_db_user:1PzyI4tM19xcIPp5@cluster0.zi3bp48.mongodb.net/myNotesApp?retryWrites=true&w=majority&appName=Cluster0';

// Ensure Images directory exists
ensureImagesDirectory();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static images from ./Images (supports both /images and /Images)
const imagesPath = path.join(__dirname, 'Images');
app.use('/images', express.static(imagesPath));
app.use('/Images', express.static(imagesPath));

// Serve frontend static assets
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', authRoutes);
app.use('/api/animes', animeRoutes);
app.use('/api/watchlist', watchlistRoutes);

// Fallback for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// MongoDB Connection & Server Start
if (require.main === module) {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('✅ Connected to MongoDB successfully.');
      app.listen(PORT, () => {
        console.log(`🚀 Server is running on http://localhost:${PORT}`);
      });
    })
    .catch(err => {
      console.error('❌ MongoDB Connection Error:', err.message);
      process.exit(1);
    });
}

module.exports = app;
