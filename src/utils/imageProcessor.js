/**
 * Image Processor
 * Handles image saving, thumbnail generation, and embedding creation
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const IMAGES_DIR = path.join(__dirname, '..', '..', 'data', 'images');

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

/**
 * Save image from WhatsApp media
 */
async function saveImage(messageMedia, groupId) {
  try {
    const buffer = Buffer.from(messageMedia.data, 'base64');
    const hash = crypto.randomBytes(8).toString('hex');
    const filename = `${groupId}_${Date.now()}_${hash}.jpeg`;
    const filepath = path.join(IMAGES_DIR, filename);

    await sharp(buffer).jpeg({ quality: 95 }).toFile(filepath);
    console.log(`✓ Image saved: ${filename}`);

    return filepath;
  } catch (err) {
    console.error('Error saving image:', err);
    return null;
  }
}

/**
 * Generate thumbnail for image
 */
async function generateThumbnail(imagePath) {
  try {
    const thumbPath = imagePath.replace('.jpeg', '_thumb.jpeg');
    await sharp(imagePath).resize(200, 200, { fit: 'cover' }).jpeg({ quality: 80 }).toFile(thumbPath);
    console.log(`✓ Thumbnail created`);
    return thumbPath;
  } catch (err) {
    console.error('Error generating thumbnail:', err);
    return null;
  }
}

/**
 * Calculate perceptual hash of image (placeholder for full embedding)
 */
async function calculateEmbedding(imagePath) {
  try {
    // Placeholder: Will implement proper perceptual hash + color histogram
    // For now, return a simple hash of the image data
    const data = fs.readFileSync(imagePath);
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    console.log(`✓ Embedding calculated`);
    return hash;
  } catch (err) {
    console.error('Error calculating embedding:', err);
    return null;
  }
}

module.exports = { saveImage, generateThumbnail, calculateEmbedding };
