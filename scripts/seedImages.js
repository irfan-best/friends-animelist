const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '..', 'Images');
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Map of canonical clean titles to search or take from top
const ANILIST_QUERY = `
query {
  Page(page: 1, perPage: 40) {
    media(type: ANIME, sort: POPULARITY_DESC) {
      title {
        english
        romaji
      }
      coverImage {
        large
      }
    }
  }
}
`;

function cleanAnimeTitle(rawTitle) {
  if (!rawTitle) return '';
  let title = rawTitle
    .replace(/[:\/\\?*|"<>]/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*Season\s*\d+/gi, '')
    .trim();

  // Normalize specific names
  if (/naruto/i.test(title)) title = 'Naruto';
  if (/one piece/i.test(title)) title = 'One Piece';
  if (/attack on titan/i.test(title)) title = 'Attack on Titan';
  if (/death note/i.test(title)) title = 'Death Note';
  if (/demon slayer/i.test(title)) title = 'Demon Slayer';
  if (/jujutsu kaisen/i.test(title)) title = 'Jujutsu Kaisen';
  if (/hunter.*hunter/i.test(title)) title = 'Hunter x Hunter';
  if (/fullmetal alchemist/i.test(title)) title = 'Fullmetal Alchemist';
  if (/my hero academia/i.test(title)) title = 'My Hero Academia';
  if (/one.*punch/i.test(title)) title = 'One Punch Man';
  if (/chainsaw man/i.test(title)) title = 'Chainsaw Man';
  if (/tokyo ghoul/i.test(title)) title = 'Tokyo Ghoul';
  if (/sword art online/i.test(title)) title = 'Sword Art Online';
  if (/bleach/i.test(title)) title = 'Bleach';
  if (/steins.*gate/i.test(title)) title = 'Steins Gate';
  if (/solo leveling/i.test(title)) title = 'Solo Leveling';
  if (/spy.*family/i.test(title)) title = 'Spy x Family';
  if (/vinland saga/i.test(title)) title = 'Vinland Saga';
  if (/mob psycho/i.test(title)) title = 'Mob Psycho 100';
  if (/cyberpunk/i.test(title)) title = 'Cyberpunk Edgerunners';
  if (/cowboy bebop/i.test(title)) title = 'Cowboy Bebop';
  if (/code geass/i.test(title)) title = 'Code Geass';
  if (/evangelion/i.test(title)) title = 'Neon Genesis Evangelion';
  if (/dragon ball/i.test(title)) title = 'Dragon Ball Z';
  if (/frieren/i.test(title)) title = 'Frieren Beyond Journeys End';

  return title;
}

async function downloadPosters() {
  console.log('Fetching top anime posters from AniList...');
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: ANILIST_QUERY })
    });

    const data = await response.json();
    const mediaList = data.data?.Page?.media || [];

    // Remove old svgs if we have real jpgs
    const oldFiles = fs.readdirSync(IMAGES_DIR);
    for (const f of oldFiles) {
      if (f.endsWith('.svg')) {
        try { fs.unlinkSync(path.join(IMAGES_DIR, f)); } catch(e) {}
      }
    }

    const downloadedTitles = new Set();

    for (const item of mediaList) {
      const rawTitle = item.title.english || item.title.romaji;
      const title = cleanAnimeTitle(rawTitle);
      const imgUrl = item.coverImage?.large;

      if (!title || downloadedTitles.has(title.toLowerCase()) || !imgUrl) {
        continue;
      }

      downloadedTitles.add(title.toLowerCase());
      const fileName = `${title}.jpg`;
      const filePath = path.join(IMAGES_DIR, fileName);

      try {
        const imgRes = await fetch(imgUrl);
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          fs.writeFileSync(filePath, buffer);
          console.log(`Saved: ${fileName}`);
        }
      } catch (err) {
        console.error(`Failed to download ${fileName}:`, err.message);
      }
    }

    // Ensure Naruto.jpg is present if not fetched
    if (!downloadedTitles.has('naruto')) {
      const narutoRes = await fetch('https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx20-YJvLbgJQPCoI.jpg');
      if (narutoRes.ok) {
        fs.writeFileSync(path.join(IMAGES_DIR, 'Naruto.jpg'), Buffer.from(await narutoRes.arrayBuffer()));
        console.log('Saved: Naruto.jpg');
      }
    }

    console.log(`Successfully populated anime images in ${IMAGES_DIR}!`);
  } catch (err) {
    console.error('Error fetching AniList data:', err);
  }
}

downloadPosters();
