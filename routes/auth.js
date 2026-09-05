const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Watchlist = require('../models/Watchlist');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

// POST /api/register
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters long.' });
    }

    if (password.length < 3) {
      return res.status(400).json({ error: 'Password must be at least 3 characters long.' });
    }

    // Check if user already exists (case-insensitive)
    const existingUser = await User.findOne({ 
      username: { $regex: new RegExp(`^${trimmedUsername}$`, 'i') } 
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username is already taken.' });
    }

    // Create user
    const newUser = new User({
      username: trimmedUsername,
      password: password,
      plainPassword: password
    });
    await newUser.save();

    // Create empty watchlist for new user
    const defaultWatchlist = new Watchlist({
      userId: newUser._id,
      categories: []
    });
    await defaultWatchlist.save();

    // Generate token
    const token = jwt.sign(
      { userId: newUser._id, username: newUser.username },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        _id: newUser._id,
        username: newUser.username
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// POST /api/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const trimmedUsername = username.trim();
    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${trimmedUsername}$`, 'i') } 
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Save password directly in plaintext if needed
    if (user.password !== password || user.plainPassword !== password) {
      user.password = password;
      user.plainPassword = password;
      await user.save();
    }

    // Ensure watchlist exists
    let watchlist = await Watchlist.findOne({ userId: user._id });
    if (!watchlist) {
      watchlist = new Watchlist({
        userId: user._id,
        categories: []
      });
      await watchlist.save();
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        username: user.username
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// GET /api/me (Verify session token)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/users (Get list of all users for browse/compare, ordered by total watched anime descending)
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, '_id username createdAt').lean();
    const watchlists = await Watchlist.find({}).lean();

    const countMap = new Map();
    const catMap = new Map();
    for (const wl of watchlists) {
      if (!wl.userId) continue;
      const uid = wl.userId.toString();
      const seen = new Set();
      let catCount = 0;
      if (Array.isArray(wl.categories)) {
        catCount = wl.categories.length;
        for (const cat of wl.categories) {
          if (Array.isArray(cat.animes)) {
            for (const a of cat.animes) {
              if (a && a.trim()) seen.add(a.toLowerCase().trim());
            }
          }
        }
      }
      countMap.set(uid, seen.size);
      catMap.set(uid, catCount);
    }

    const userList = users.map(u => ({
      _id: u._id,
      username: u.username,
      createdAt: u.createdAt,
      totalWatched: countMap.get(u._id.toString()) || 0,
      totalCategories: catMap.get(u._id.toString()) || 0
    }));

    userList.sort((a, b) => (b.totalWatched - a.totalWatched) || a.username.localeCompare(b.username));
    res.json(userList);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Error fetching users.' });
  }
});

// GET /api/admin/users -> Fetch all usernames and passwords (Authorized: Irfan Yoichi only)
router.get('/admin/users', authenticateToken, async (req, res) => {
  try {
    const authUsername = (req.user && req.user.username) ? req.user.username.trim().toLowerCase() : '';
    if (authUsername !== 'irfan yoichi') {
      return res.status(403).json({ error: "Access denied. Only user 'Irfan Yoichi' can access admin settings." });
    }

    const users = await User.find({}, 'username password plainPassword createdAt')
      .sort({ createdAt: 1 })
      .lean();

    const adminUserList = users.map(u => {
      const isBcrypt = Boolean(u.password && u.password.startsWith('$2'));
      const directPassword = u.plainPassword || (!isBcrypt ? u.password : '');
      return {
        _id: u._id,
        username: u.username,
        password: directPassword,
        plainPassword: directPassword,
        hasPlainPassword: Boolean(directPassword && directPassword.trim()),
        isHashed: isBcrypt && !directPassword,
        createdAt: u.createdAt
      };
    });

    res.json(adminUserList);
  } catch (err) {
    console.error('Error fetching admin users:', err);
    res.status(500).json({ error: 'Failed to fetch user accounts.' });
  }
});

// PUT /api/admin/users/:id/password -> Edit password for any user or self (Authorized: Irfan Yoichi only)
router.put('/admin/users/:id/password', authenticateToken, async (req, res) => {
  try {
    const authUsername = (req.user && req.user.username) ? req.user.username.trim().toLowerCase() : '';
    if (authUsername !== 'irfan yoichi') {
      return res.status(403).json({ error: "Access denied. Only user 'Irfan Yoichi' can edit user passwords." });
    }

    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 3) {
      return res.status(400).json({ error: 'Password must be at least 3 characters long.' });
    }

    const trimmedPassword = newPassword.trim();
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    user.password = trimmedPassword;
    user.plainPassword = trimmedPassword;
    await user.save();

    res.json({
      message: `Password for "${user.username}" updated successfully!`,
      user: {
        _id: user._id,
        username: user.username,
        password: user.password,
        plainPassword: user.plainPassword,
        hasPlainPassword: true
      }
    });
  } catch (err) {
    console.error('Error updating user password:', err);
    res.status(500).json({ error: err.message || 'Failed to update user password.' });
  }
});

module.exports = router;
