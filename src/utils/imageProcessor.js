/**
 * Image Processor
 * Handles image validation, saving, thumbnail generation, and embedding creation
 * Requirements:
 * 1. Only save images from supplier groups (not private chats)
 * 2. Max 2 images per message (skip rest)
 * 3. No prices saved with images (prices are in separate text messages)
 * 4. Associate with group_id, date_posted
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');

const IMAGES_DIR = path.join(__dirname, '..', '..', 'data', 'images');

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

/**
 * Process images from a WhatsApp message
 * Implements all user requirements:
 * - Only from supplier groups
 * - Max 2 images per message
 * - No prices (messages with only text/prices are skipped)
 * - Associate with group_id and date_posted
 *
 * @param {Object} message - WhatsApp message object
 * @param {Array} mediaList - Array of message media
 * @param {Object} db - Database handler instance
 * @returns {Promise<Array>} Array of processed image objects {imagePath, thumbnailPath, metadata}
 */
async function processGroupImages(message, mediaList, db, groupName = null) {
  const results = [];

  // Requirement 1: Only save from supplier groups (verify sender is group)
  if (!message.from || !message.from.endsWith('@g.us')) {
    console.log('⏭️  Skipping image from private chat (supplier groups only)');
    return results;
  }

  // No media found
  if (!mediaList || mediaList.length === 0) {
    return results;
  }

  // Requirement 2: Max 2 images per message
  const imagesToProcess = mediaList.slice(0, 2);
  if (mediaList.length > 2) {
    console.log(`📦 Message has ${mediaList.length} images, processing only first 2 (rest ignored)`);
  }

  // Process each image
  for (let i = 0; i < imagesToProcess.length; i++) {
    const media = imagesToProcess[i];

    try {
      // If media contains a data URL, extract mimetype and strip header
      let mediaData = media.data;
      let mediaMime = media.mimetype || null;
      if (typeof mediaData === 'string' && mediaData.startsWith('data:')) {
        const m = mediaData.match(/^data:([^;]+);base64,/);
        if (m) {
          mediaMime = mediaMime || m[1];
          mediaData = mediaData.replace(/^data:[^;]+;base64,/, '');
        }
      }

      // Never save videos: skip if mimetype indicates video
      if (mediaMime && mediaMime.startsWith('video')) {
        console.log('⏭️  Skipping video media (never save videos)');
        continue;
      }

      // Also skip by common video file extensions if filename is present
      if (media.filename) {
        const lower = media.filename.toLowerCase();
        if (/(\.mp4|\.mov|\.mkv|\.webm|\.avi|\.3gp|\.flv)$/.test(lower)) {
          console.log('⏭️  Skipping video file by extension (never save videos)');
          continue;
        }
      }

      // Convert base64 to buffer
      const imageBuffer = Buffer.from(mediaData, 'base64');

      // Quick metadata check (no deep ML validation per latest policy)
      console.log(`🔍 Checking metadata for image ${i + 1}/${imagesToProcess.length}...`);
      let metadata;
      try {
        metadata = await sharp(imageBuffer).metadata();
      } catch (err) {
        console.log(`❌ Image ${i + 1} rejected: failed to read image metadata (${err.message})`);
        continue;
      }

      // NOTE: per user request, do not reject images based on file size or dimensions.
      // We only ensure the media is an image (checked below) and skip videos.

      // Ensure this is a supported image format (save images only)
      const allowedFormats = ['jpeg', 'png', 'webp', 'tiff', 'gif', 'heif', 'heic', 'bmp'];
      const fmt = (metadata.format || '').toLowerCase();
      if (!allowedFormats.includes(fmt)) {
        console.log(`⏭️  Skipping non-image media (format=${metadata.format || 'unknown'})`);
        continue;
      }

      // Accept image (no ML validation)
      console.log(`✅ Image ${i + 1} accepted by metadata checks (${metadata.width}x${metadata.height}, ${(imageBuffer.length/1024).toFixed(1)}KB)`);

      // Save image (uploads to Supabase storage if `db` is provided)
      const savedImage = await saveImage(
        imageBuffer,
        message.from,
        message.from, // Use message.from as group ID (more reliable)
        db
      );

      if (!savedImage) {
        console.log(`❌ Failed to save image ${i + 1}`);
        continue;
      }

      // Calculate hybrid embedding (pHash + color histogram)
      const embeddingResult = await calculateEmbedding(imageBuffer);
      if (!embeddingResult) {
        console.log(`❌ Failed to compute embedding for image ${i + 1}`);
        continue;
      }
      const { pHash, histogram } = embeddingResult;
      const embeddingHash = pHash;
      const embeddingJson = JSON.stringify(histogram);

      // Prepare image metadata
      const resolvedGroupName = groupName || message.groupMetadata?.subject || 'Unknown Group';
      const uniqueId = crypto.createHash('sha256').update(pHash + JSON.stringify(histogram)).digest('hex').substring(0, 16);
      const imageMetadata = {
        uuid: `${message.from}_${message.timestamp}_${uniqueId}`,
        groupId: message.from, // Use message.from (more reliable than groupMetadata?.id)
        groupName: resolvedGroupName,
        imagePath: savedImage.path,
        imageUrl: savedImage.url || null,
        thumbnailPath: savedImage.thumbnailPath || null,
        thumbnailUrl: savedImage.thumbnailUrl || null,
        messageTimestamp: message.timestamp,
        datePadded: new Date(message.timestamp * 1000).toISOString(),
        embedding: embeddingJson,
        embeddingHash: embeddingHash,
        // Metadata (no ML validation)
        confidence: 'n/a',
        detectedObjects: [],
        fileSize: (imageBuffer.length / 1024).toFixed(1),
        dimensions: `${metadata.width}x${metadata.height}`,
        format: metadata.format
      };

      results.push(imageMetadata);

      console.log(`✓ Image ${i + 1} processed successfully`);
    } catch (err) {
      console.error(`Error processing image ${i + 1}:`, err.message);
      continue;
    }
  }

  return results;
}

/**
 * Save image from buffer to disk
 * Requirement 4: Associate with group context
 *
 * @param {Buffer} imageBuffer - Image file buffer
 * @param {string} senderId - Message sender ID (for tracking)
 * @param {string} groupId - Group ID (for organization)
 * @returns {Promise<Object>} {path: string, filename: string, timestamp: number}
 */
async function saveImage(imageBuffer, senderId, groupId, db) {
  try {
    const date = new Date();
    const dateDir = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const hash = crypto.randomBytes(4).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);
    const filename = `${timestamp}_${hash}.jpeg`;
    const thumbFilename = filename.replace('.jpeg', '_thumb.jpeg');
    const thumbBuffer = await sharp(imageBuffer)
      .resize(200, 200, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Upload to Supabase storage only — no local fallback on error
    if (db && typeof db.uploadBufferToStorage === 'function') {
      const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'images';
      const groupPrefix = groupId.replace('@g.us', '').substring(0, 10);
      const storageDir = `images/${dateDir}/${groupPrefix}`;
      const storagePath = `${storageDir}/${filename}`;
      const storageThumbPath = `${storageDir}/${thumbFilename}`;

      const originalBuffer = await sharp(imageBuffer).jpeg({ quality: 90, progressive: true }).toBuffer();
      const origUpload = await db.uploadBufferToStorage(bucket, storagePath, originalBuffer, 'image/jpeg', true);
      const thumbUpload = await db.uploadBufferToStorage(bucket, storageThumbPath, thumbBuffer, 'image/jpeg', true);

      if (origUpload && origUpload.url) {
        return {
          path: origUpload.path,
          url: origUpload.url,
          thumbnailPath: thumbUpload ? thumbUpload.path : null,
          thumbnailUrl: thumbUpload ? thumbUpload.url : null,
          filename: filename,
          timestamp: timestamp
        };
      }
      console.error('Storage upload failed — image not saved');
      return null;
    }

    // No db/storage configured — do not save locally
    console.error('No storage configured — image not saved');
    return null;
  } catch (err) {
    console.error('Error saving image:', err.message);
    return null;
  }
}

/**
 * Generate thumbnail for image
 * Used for quick preview in search results
 *
 * @param {string} imagePath - Full path to image
 * @returns {Promise<string>} Path to thumbnail or null
 */
async function generateThumbnail(imagePath) {
  try {
    const thumbPath = imagePath.replace('.jpeg', '_thumb.jpeg');

    await sharp(imagePath)
      .resize(200, 200, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);

    return thumbPath;
  } catch (err) {
    console.error('Error generating thumbnail:', err.message);
    return null;
  }
}

/**
 * Perceptual hash (dHash) - 64-bit difference hash for visual similarity
 */
async function calculatePerceptualHash(imageBuffer) {
  const { data } = await sharp(imageBuffer)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const idx = y * 9 + x;
      bits += data[idx] < data[idx + 1] ? '1' : '0';
    }
  }
  return parseInt(bits, 2).toString(16).padStart(16, '0');
}

/**
 * Color histogram - 64 bins (4x4x4 RGB) for color-based similarity
 */
async function calculateColorHistogram(imageBuffer) {
  const img = sharp(imageBuffer).resize(64, 64, { fit: 'inside' });
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels || 3;
  const bins = new Array(64).fill(0);
  const step = 256 / 4;

  for (let i = 0; i < data.length; i += channels) {
    const r = Math.min(Math.floor(data[i] / step), 3);
    const g = Math.min(Math.floor(data[i + 1] / step), 3);
    const b = Math.min(Math.floor((data[i + 2] || 0) / step), 3);
    bins[r * 16 + g * 4 + b]++;
  }

  const sum = bins.reduce((a, b) => a + b, 0);
  return sum > 0 ? bins.map(b => b / sum) : bins;
}

async function calculateEmbedding(input) {
  try {
    let imageBuffer;
    if (Buffer.isBuffer(input)) {
      imageBuffer = input;
    } else if (typeof input === 'string') {
      imageBuffer = fs.readFileSync(input);
    } else {
      throw new Error('Unsupported input for calculateEmbedding');
    }

    const [pHash, histogram] = await Promise.all([
      calculatePerceptualHash(imageBuffer),
      calculateColorHistogram(imageBuffer)
    ]);

    return { pHash, histogram };
  } catch (err) {
    console.error('Error calculating embedding:', err.message);
    return null;
  }
}

/**
 * Validate if message should be processed
 * Returns false for:
 * - Private messages (not group)
 * - Messages without media
 * - Messages from non-supplier groups (if configured)
 *
 * @param {Object} message - WhatsApp message
 * @param {Array} supplierGroupIds - Configured supplier group IDs
 * @returns {boolean} True if message should be processed
 */
function shouldProcessMessage(message, supplierGroupIds = []) {
  // Check 1: Must be from a group (group IDs end with @g.us)
  if (!message.from || !message.from.endsWith('@g.us')) {
    return false;
  }

  // Check 2: Must have media content
  if (!message.hasMedia) {
    return false;
  }

  // Check 3: If supplier group IDs are configured, only process those groups
  if (supplierGroupIds.length > 0) {
    const groupId = (message.from || '').trim();
    const normalizedIds = supplierGroupIds.map(id => (id || '').trim());
    if (!normalizedIds.includes(groupId)) {
      return false;
    }
  }

  return true;
}

module.exports = {
  processGroupImages,
  saveImage,
  generateThumbnail,
  calculateEmbedding,
  shouldProcessMessage
};

