/**
 * createSlideshowVideo
 *
 * Converts an array of images into a TikTok-ready slideshow video using FFmpeg.
 *
 * Output spec (from TikTok requirements):
 *   - Resolution : 1080 × 1920 (9:16 portrait)
 *   - Codec      : H.264 (libx264), yuv420p
 *   - Frame rate : 30 fps
 *   - Container  : MP4
 *   - Duration   : ~14 s total (safely under user's 15 s target; above TikTok's 3 s minimum)
 *
 * Images that don't match 9:16 are scaled to fit and padded with black bars.
 *
 * Requires: ffmpeg installed system-wide (brew install ffmpeg)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TARGET_DURATION_S = 10; // total slideshow length in seconds
const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;
const TARGET_FPS = 30;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a TikTok-ready slideshow MP4 from an array of images.
 *
 * @param {Array<{data: string, mimetype: string}>} images - Base64-encoded images
 * @param {number} timestamp - Message timestamp (used for unique temp filenames)
 * @returns {Promise<{ slideshowPath: string, tempFiles: string[] }>}
 *   slideshowPath - absolute path to the output MP4 (caller must delete after use)
 *   tempFiles     - source image files + concat list (already deleted before resolve)
 */
async function createSlideshowVideo(images, timestamp) {
  if (!images || images.length === 0) {
    throw new Error('createSlideshowVideo: no images provided');
  }

  const durationPerImage = TARGET_DURATION_S / images.length;

  // 1. Write source images to disk
  const imagePaths = await saveImagesToDisk(images, timestamp);

  // 2. Write ffmpeg concat input list
  const concatPath = path.join(os.tmpdir(), `pochi-kali-concat-${timestamp}.txt`);
  await writeConcatFile(imagePaths, durationPerImage, concatPath);

  // 3. Output path
  const slideshowPath = path.join(os.tmpdir(), `pochi-kali-slideshow-${timestamp}.mp4`);

  try {
    await runFfmpeg(concatPath, slideshowPath);
    console.log(`🎬 [PARENT] Slideshow created: ${slideshowPath} (${images.length} image(s), ${TARGET_DURATION_S}s)`);
  } finally {
    // Source images and concat file are baked into the video — delete them now
    await deleteFiles([...imagePaths, concatPath]);
  }

  return { slideshowPath, tempFiles: [...imagePaths, concatPath] };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function getImageExtension(mimetype) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg':  'jpg',
    'image/png':  'png',
    'image/webp': 'webp',
  };
  return map[mimetype] || 'jpg';
}

async function saveImagesToDisk(images, timestamp) {
  const paths = [];
  for (let i = 0; i < images.length; i++) {
    const ext = getImageExtension(images[i].mimetype);
    const filePath = path.join(os.tmpdir(), `pochi-kali-img-${timestamp}-${i}.${ext}`);
    await fs.promises.writeFile(filePath, Buffer.from(images[i].data, 'base64'));
    paths.push(filePath);
  }
  return paths;
}

async function writeConcatFile(imagePaths, durationPerImage, concatPath) {
  const lines = [];
  for (const p of imagePaths) {
    lines.push(`file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`);
    lines.push(`duration ${durationPerImage.toFixed(3)}`);
  }
  // Repeat last image without a duration — prevents a black frame at end
  const last = imagePaths[imagePaths.length - 1];
  lines.push(`file '${last.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`);
  await fs.promises.writeFile(concatPath, lines.join('\n') + '\n');
}

function runFfmpeg(concatPath, outputPath) {
  return new Promise((resolve, reject) => {
    const vf = [
      `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease`,
      `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
      'format=yuv420p',
    ].join(',');

    const args = [
      '-y',                         // overwrite output without asking
      '-f', 'concat',               // use concat demuxer
      '-safe', '0',                 // allow absolute paths in the list file
      '-i', concatPath,             // input list
      '-vf', vf,                    // scale + pad + pixel format
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',                 // quality: 0=lossless, 51=worst; 23 is default
      '-r', String(TARGET_FPS),
      outputPath,
    ];

    console.log(`🎬 [PARENT] Running ffmpeg slideshow conversion...`);
    const proc = spawn('ffmpeg', args);

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        // Include the last 600 chars of stderr for diagnosis
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-600)}`));
      }
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('ffmpeg not found — install with: brew install ffmpeg'));
      } else {
        reject(err);
      }
    });
  });
}

async function deleteFiles(filePaths) {
  for (const filePath of filePaths) {
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // Non-fatal — file may not exist
    }
  }
}

module.exports = { createSlideshowVideo };
