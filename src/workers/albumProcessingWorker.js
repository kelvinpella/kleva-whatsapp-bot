/**
 * Parent Worker - Album Processing
 *
 * Processes album batches from WhatsApp:
 * - Downloads all media from messages
 * - Categorizes and applies limits
 * - Uploads all selected images to Cloudinary
 * - Parks the uploaded images as a pending album in Redis until a caption
 *   message arrives (social posting is queued later by the caption handler)
 */

const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { uploadImageToCloudinary } = require('../services/cloudinaryClient');
const { savePendingAlbum } = require('../utils/pendingAlbums');

const MAX_VIDEOS = 2;
const MAX_IMAGES = 10;

/**
 * Initialize the parent worker for album processing
 * @param {Object} client - WhatsApp client instance
 * @param {Object} db - Database handler instance
 * @returns {Worker} - BullMQ Worker instance
 */
function initializeAlbumWorker(client, db) {
  const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker(
    'albumProcessing',
    async (job) => {
      try {
        console.log(`\n🔄 [PARENT] Processing album job: ${job.name}`);
        const { messageIds, groupId, groupName, timestamp, author, messageBody, albumSize } = job.data;

        console.log(`📦 Processing album with ${messageIds.length} message(s)`);

        // Arrays to collect all media from all messages
        const allVideos = [];
        const allImages = [];

        // Download and categorize media from each message
        for (const messageId of messageIds) {
          try {
            console.log(`📥 Retrieving message: ${messageId}`);
            const message = await client.getMessageById(messageId);

            if (!message) {
              console.error(`❌ Message not found: ${messageId}`);
              continue;
            }

            console.log(`📥 Downloading media from message...`);
            const media = await message.downloadMedia();

            if (!media) {
              console.error(`❌ Failed to download media: ${messageId}`);
              continue;
            }

            categorizeMedia(media, allVideos, allImages);

          } catch (err) {
            console.error(`❌ Error processing message ${messageId}:`, err.message);
          }
        }

        console.log(`📊 Album totals: ${allVideos.length} videos, ${allImages.length} images`);

        // Apply limits 
        // const limitedVideos = allVideos.slice(0, MAX_VIDEOS);
        const limitedImages = allImages.slice(0, MAX_IMAGES);

        if (allVideos.length > 0) {
          console.log(`⚠️ ${allVideos.length} video(s) detected; video posting logic is pending future implementation once limitedVideos is enabled.`);

        }

        if (allImages.length > MAX_IMAGES) {
          console.log(`⚠️ Dropped ${allImages.length - MAX_IMAGES} images (max ${MAX_IMAGES})`);
        }

        // Park the uploaded album in Redis until a caption message arrives.
        let pendingAlbumKey = null;
        let processedImagesCount = 0

        if (limitedImages.length > 0) {
          // Upload all limited images to Cloudinary in parallel; map preserves original order.
          // Transformation/text overlays are applied later (once captions arrive), so here we
          // only persist each image's public file name and original URL.
          console.log(`\n🌥️ Uploading all limited images to Cloudinary...`);

          const uploadResults = await Promise.all(
            limitedImages.map(async (image, i) => {
              try {
                const extension = getFileExtension(image.mimetype);
                const filename = `kleva_image_${timestamp}_${i}.${extension}`;

                console.log(`📸 [Image ${i}] Uploading to Cloudinary: ${filename}`);
                const buffer = Buffer.from(image.data, 'base64');
                const cloudinaryResult = await uploadImageToCloudinary(buffer, filename);
                const originalUrl = cloudinaryResult.secure_url || cloudinaryResult.url;
                const publicFileName = `${cloudinaryResult.public_id}.${extension}`;

                console.log(`✅ [Image ${i}] Uploaded at position ${i}`);
                return { publicFileName, originalUrl };
              } catch (error) {
                console.error(`❌ [Image ${i}] Failed to upload to Cloudinary:`, error.message);
                return null;
              }
            })
          );

          const images = uploadResults.filter(Boolean);

          console.log(`\n✅ Image Processing Complete:`);
          console.log(`   - Total uploaded images: ${images.length}`);


          if (images.length > 0) {
            pendingAlbumKey = await savePendingAlbum(redisConnection, {
              groupId,
              groupName,
              author,
              timestamp,
              messageBody,
              images,
            });
            processedImagesCount = images.length;
            console.log(`📥 [PARENT] Saved pending album (awaiting caption): ${pendingAlbumKey}`);
          } else {
            console.log(`⚠️ [PARENT] No images uploaded; nothing to park.`);
          }
        }

        return {
          pendingAlbumKey,
          summary: {
            messageIds,
            groupId,
            groupName,
            totalImages: processedImagesCount,
            droppedImages: Math.max(0, allImages.length - MAX_IMAGES),
            pendingAlbumSaved: Boolean(pendingAlbumKey),
          }
        };

      } catch (error) {
        console.error(`❌ [PARENT] Error processing album job ${job.name}:`, error.message);
        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: 1, // Process one album at a time to manage rate limits and resource usage
    }
  );

  // Event handlers
  worker.on('completed', (job, result) => {
    console.log(`✅ [PARENT] Job ${job.id} completed - processed ${result.summary.totalImages} images`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ [PARENT] Job ${job.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('❌ [PARENT] Worker error:', err.message);
  });

  console.log('🚀 Album Processing Worker (Parent) started');

  return worker;
}

/**
 * Get file extension from mimetype
 * @param {string} mimetype - MIME type (e.g., 'image/jpeg', 'video/mp4')
 * @returns {string} File extension (e.g., 'jpg', 'mp4')
 */
function getFileExtension(mimetype) {
  const mimetypeMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/mpeg': 'mpeg',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  };

  return mimetypeMap[mimetype] || 'bin';
}

/**
 * Categorize media item as video or image
 * @param {Object} media - Media object with mimetype and data
 * @param {Array} videos - Array to store video items
 * @param {Array} images - Array to store image items
 */
function categorizeMedia(media, videos, images) {
  if (!media || !media.mimetype) {
    return;
  }

  const mediaItem = {
    mimetype: media.mimetype,
    data: media.data,
    filename: media.filename || null,
  };

  if (media.mimetype.startsWith('video/')) {
    videos.push(mediaItem);
    console.log(`📹 Video detected: ${media.mimetype}`);
  } else if (media.mimetype.startsWith('image/')) {
    images.push(mediaItem);
    console.log(`📸 Image detected: ${media.mimetype}`);
  } else {
    console.log(`⏭️ Unsupported media type: ${media.mimetype}`);
  }
}

module.exports = { initializeAlbumWorker };
