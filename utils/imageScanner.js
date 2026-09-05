const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '..', 'Images');
const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif','.jpe']);

/**
 * Ensures the Images directory exists
 */
function ensureImagesDirectory() {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
}

/**
 * Scans the Images directory and returns an array of anime objects:
 * [ { title: 'Naruto', fileName: 'Naruto.jpg', imageUrl: '/images/Naruto.jpg' } ]
 */
function scanAnimeImages() {
  ensureImagesDirectory();
  try {
    const animes = [];
    const seenTitles = new Set();

    function traverseDirectory(currentDir) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          traverseDirectory(fullPath);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            const title = path.basename(entry.name, ext).trim();
            if (title && !seenTitles.has(title.toLowerCase())) {
              seenTitles.add(title.toLowerCase());
              const relPath = path.relative(IMAGES_DIR, fullPath).replace(/\\/g, '/');
              const encodedRelPath = relPath.split('/').map(encodeURIComponent).join('/');
              animes.push({
                title: title,
                fileName: entry.name,
                imageUrl: `/images/${encodedRelPath}`
              });
            }
          }
        }
      }
    }

    traverseDirectory(IMAGES_DIR);

    // Sort alphabetically by default
    animes.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    return animes;
  } catch (err) {
    console.error('Error scanning images directory:', err);
    return [];
  }
}

/**
 * Locates an image file in IMAGES_DIR by anime title (case-insensitive)
 */
function findAnimeImageFile(title) {
  if (!title || !title.trim()) return null;
  ensureImagesDirectory();

  const clean = title.trim().toLowerCase();
  let result = null;

  function traverse(currentDir) {
    if (result) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        traverse(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          const baseName = path.basename(entry.name, ext).trim().toLowerCase();
          if (baseName === clean) {
            result = {
              fullPath,
              dir: currentDir,
              fileName: entry.name,
              ext,
              title: path.basename(entry.name, ext).trim()
            };
            return;
          }
        }
      }
    }
  }

  traverse(IMAGES_DIR);
  return result;
}

/**
 * Renames an anime image file in the local filesystem.
 */
function renameAnimeImageFile(oldTitle, newTitle) {
  const cleanOld = (oldTitle || '').trim();
  const cleanNew = (newTitle || '').trim();

  if (!cleanOld) {
    throw new Error('Original anime title is required.');
  }
  if (!cleanNew) {
    throw new Error('New anime image name cannot be empty.');
  }

  // Check invalid filename characters for Windows / cross-platform
  if (/[:\/\\?*|"<>]/g.test(cleanNew)) {
    throw new Error('Invalid characters in image name. Filenames cannot contain / \\ : * ? " < > |');
  }

  const existingFile = findAnimeImageFile(cleanOld);
  if (!existingFile) {
    throw new Error(`Image file for "${cleanOld}" not found in Images directory.`);
  }

  const newFileName = `${cleanNew}${existingFile.ext}`;
  const newFullPath = path.join(existingFile.dir, newFileName);

  // If the new file already exists and is a different file
  if (fs.existsSync(newFullPath) && newFullPath.toLowerCase() !== existingFile.fullPath.toLowerCase()) {
    throw new Error(`An image file named "${newFileName}" already exists.`);
  }

  // Windows case-only rename handling
  if (newFullPath.toLowerCase() === existingFile.fullPath.toLowerCase() && newFullPath !== existingFile.fullPath) {
    const tempPath = path.join(existingFile.dir, `__temp_${Date.now()}_${existingFile.ext}`);
    fs.renameSync(existingFile.fullPath, tempPath);
    fs.renameSync(tempPath, newFullPath);
  } else if (newFullPath !== existingFile.fullPath) {
    fs.renameSync(existingFile.fullPath, newFullPath);
  }

  const relPath = path.relative(IMAGES_DIR, newFullPath).replace(/\\/g, '/');
  const encodedRelPath = relPath.split('/').map(encodeURIComponent).join('/');

  return {
    title: cleanNew,
    fileName: newFileName,
    imageUrl: `/images/${encodedRelPath}`
  };
}

module.exports = {
  IMAGES_DIR,
  ensureImagesDirectory,
  scanAnimeImages,
  findAnimeImageFile,
  renameAnimeImageFile
};
