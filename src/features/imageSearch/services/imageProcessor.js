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
const config = require('../../../config');
const tf = require('@tensorflow/tfjs-node');
const mobilenet = require('@tensorflow-models/mobilenet');

const IMAGES_DIR = path.join(__dirname, '..', '..', '..', '..', 'data', 'images');

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// TensorFlow MobileNet model (loaded once at startup)
let model = null;

/**
 * Load MobileNet model for semantic embeddings
 * Called once at module initialization
 */
async function loadModel() {
  if (model) return model;

  console.log('🧠 Loading MobileNet model for semantic image embeddings...');
  try {
    model = await mobilenet.load({
      version: 2,
      alpha: 1.0 // Full model for best accuracy
    });
    console.log('✓ MobileNet model loaded successfully');
    return model;
  } catch (err) {
    console.error('❌ Failed to load MobileNet model:', err.message);
    throw err;
  }
}

// Pre-load model at module initialization
loadModel().catch(err => {
  console.error('Failed to pre-load MobileNet model:', err.message);
});

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

      // Calculate multi-feature embeddings (semantic + texture + color)
      const embeddingResult = await calculateEmbedding(imageBuffer);
      if (!embeddingResult) {
        console.log(`❌ Failed to compute embedding for image ${i + 1}`);
        continue;
      }
      const { embedding, textureFeatures, colorFeatures } = embeddingResult;
      const embeddingJson = JSON.stringify(embedding);
      const textureJson = JSON.stringify(textureFeatures);
      const colorJson = JSON.stringify(colorFeatures);
      const embeddingHash = null; // No longer using pHash

      // Prepare image metadata
      const resolvedGroupName = groupName || message.groupMetadata?.subject || 'Unknown Group';
      const uniqueId = crypto.createHash('sha256').update(embeddingJson).digest('hex').substring(0, 16);
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
        textureFeatures: textureJson,   // NEW: 16-dim edge histogram
        colorFeatures: colorJson,       // NEW: 6-dim RGB stats
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
 * Extract texture features using Sobel edge detection
 * Returns 16-dimensional histogram of edge magnitudes
 * Background-invariant: captures surface patterns, hardware, stitching details
 *
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<Array>} 16-element normalized histogram
 */
async function extractTextureFeatures(imageBuffer) {
  try {
    // Resize to 224x224 and convert to grayscale for edge detection
    const grayBuffer = await sharp(imageBuffer)
      .resize(224, 224, { fit: 'cover' })
      .greyscale()
      .toBuffer();

    // Apply Sobel-X kernel (horizontal edges)
    const sobelXBuffer = await sharp(grayBuffer)
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1]
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Apply Sobel-Y kernel (vertical edges)
    const sobelYBuffer = await sharp(grayBuffer)
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -2, -1, 0, 0, 0, 1, 2, 1]
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Calculate edge magnitude: sqrt(Gx² + Gy²) for each pixel
    const edgeMagnitudes = [];
    const pixelCount = sobelXBuffer.data.length;

    for (let i = 0; i < pixelCount; i++) {
      const gx = sobelXBuffer.data[i];
      const gy = sobelYBuffer.data[i];
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edgeMagnitudes.push(magnitude);
    }

    // Create 16-bin histogram of edge strengths
    const histogram = new Array(16).fill(0);
    // Avoid stack overflow with large arrays - use reduce instead of spread operator
    const maxMagnitude = edgeMagnitudes.reduce((max, val) => Math.max(max, val), 0);

    if (maxMagnitude > 0) {
      for (const magnitude of edgeMagnitudes) {
        const bin = Math.min(15, Math.floor((magnitude / maxMagnitude) * 16));
        histogram[bin]++;
      }
    }

    // Normalize histogram (sum to 1.0)
    const total = histogram.reduce((a, b) => a + b, 0);
    const normalizedHistogram = total > 0
      ? histogram.map(count => count / total)
      : histogram;

    return normalizedHistogram;
  } catch (err) {
    console.error('Error extracting texture features:', err.message);
    return new Array(16).fill(0); // Return zero vector on error
  }
}

/**
 * Extract color features from center region only
 * Returns 6-dimensional RGB statistics (mean, stdev for R/G/B)
 * Background-avoidant: focuses on center 60% where bag typically appears
 *
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<Array>} 6-element array [R_mean, R_std, G_mean, G_std, B_mean, B_std]
 */
async function extractColorFeatures(imageBuffer) {
  try {
    // Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;

    // Calculate center crop dimensions (60% of original)
    const cropWidth = Math.floor(width * 0.6);
    const cropHeight = Math.floor(height * 0.6);
    const left = Math.floor((width - cropWidth) / 2);
    const top = Math.floor((height - cropHeight) / 2);

    // Extract center region and normalize size
    const centerRegion = await sharp(imageBuffer)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize(224, 224, { fit: 'cover' })
      .toBuffer();

    // Get per-channel statistics
    const stats = await sharp(centerRegion).stats();

    // Extract RGB means and standard deviations (normalized to [0,1])
    const colorFeatures = [
      stats.channels[0].mean / 255,    // R mean
      stats.channels[0].stdev / 255,   // R stdev
      stats.channels[1].mean / 255,    // G mean
      stats.channels[1].stdev / 255,   // G stdev
      stats.channels[2].mean / 255,    // B mean
      stats.channels[2].stdev / 255    // B stdev
    ];

    return colorFeatures;
  } catch (err) {
    console.error('Error extracting color features:', err.message);
    return [0, 0, 0, 0, 0, 0]; // Return zero vector on error
  }
}

/**
 * Calculate multi-feature embeddings for image matching
 * Combines three complementary features:
 * 1. Semantic embeddings (MobileNet, 1280-dim) - overall shape/design
 * 2. Texture features (edge histogram, 16-dim) - surface patterns, hardware
 * 3. Color features (RGB stats, 6-dim) - color identity without background
 *
 * @param {Buffer|string} input - Image buffer or file path
 * @returns {Promise<Object>} { embedding: [1280 floats], textureFeatures: [16 floats], colorFeatures: [6 floats] }
 */
async function calculateEmbedding(input) {
  try {
    // Ensure model is loaded
    if (!model) {
      await loadModel();
    }

    // Get image buffer
    let imageBuffer;
    if (Buffer.isBuffer(input)) {
      imageBuffer = input;
    } else if (typeof input === 'string') {
      imageBuffer = fs.readFileSync(input);
    } else {
      throw new Error('Unsupported input for calculateEmbedding');
    }

    // 1. Extract MobileNet semantic embeddings (1280-dim)
    const resizedBuffer = await sharp(imageBuffer)
      .resize(224, 224, { fit: 'cover' })
      .toBuffer();

    const imageTensor = tf.node.decodeImage(resizedBuffer, 3);
    const normalizedTensor = imageTensor.toFloat().div(tf.scalar(255.0));
    const batchedTensor = normalizedTensor.expandDims(0);

    // Get embeddings from the layer before the final classification layer
    // MobileNet v2 has 1280 features before the final 1000-class classification
    const embeddings = model.infer(batchedTensor, true); // true = return embeddings (intermediate layer)

    const embeddingArray = await embeddings.data();
    const semanticEmbedding = Array.from(embeddingArray);

    // Clean up tensors
    imageTensor.dispose();
    normalizedTensor.dispose();
    batchedTensor.dispose();
    embeddings.dispose();

    // 2. Extract texture features (16-dim edge histogram)
    const textureFeatures = await extractTextureFeatures(imageBuffer);

    // 3. Extract color features (6-dim RGB statistics from center crop)
    const colorFeatures = await extractColorFeatures(imageBuffer);

    return {
      embedding: semanticEmbedding,      // 1280-dim MobileNet
      textureFeatures: textureFeatures,  // 16-dim edge histogram
      colorFeatures: colorFeatures       // 6-dim RGB stats
    };
  } catch (err) {
    console.error('Error calculating multi-feature embeddings:', err.message);
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

