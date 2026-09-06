const mongoose = require('mongoose');
const Watchlist = require('../models/Watchlist');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/friends-animelist';
const YESTERDAY_ISO = '2026-09-05T12:00:00.000Z';
const yesterdayDate = new Date(YESTERDAY_ISO);

async function backfill() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    const watchlists = await Watchlist.find({});
    console.log(`Found ${watchlists.length} watchlists to backfill.`);

    let totalAnimesBackdated = 0;

    for (const wl of watchlists) {
      wl.animeWatchedDates = [];
      let count = 0;
      for (const cat of (wl.categories || [])) {
        for (const a of (cat.animes || [])) {
          if (a && a.trim()) {
            wl.setWatchedDate(a.trim(), yesterdayDate);
            count++;
          }
        }
      }

      await wl.save();
      totalAnimesBackdated += count;
      console.log(`Watchlist ${wl._id} (User ${wl.userId}): backdated ${count} anime records to ${YESTERDAY_ISO}.`);
    }

    console.log(`\nSuccessfully backfilled all ${totalAnimesBackdated} anime watched dates to yesterday across ${watchlists.length} users!`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error during backfill:', err);
    process.exit(1);
  }
}

backfill();
