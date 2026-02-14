/**
 * BullMQ Worker for Processing Unread Group Messages
 *
 * Processes media messages from allowed groups:
 * - Retrieves messages from WhatsApp
 * - Downloads and categorizes media (videos vs images)
 * - Applies limits: max 2 videos, max 10 images
 * - Stores results for further processing
 */

const { Worker } = require('bullmq');
const Redis = require('ioredis');

const MAX_VIDEOS = 2;
const MAX_IMAGES = 10;

/**
 * Initialize and start the worker
 * @param {Object} client - WhatsApp client instance
 * @param {Object} db - Database handler instance
 * @returns {Worker} - BullMQ Worker instance
 */
function initializeWorker(client, db) {
  const redisConnection = new Redis({
    maxRetriesPerRequest: null,
  });

  const worker = new Worker(
    'unreadGroupMessages',
    async (job) => {
      try {
        console.log(`\n🔄 Processing job: ${job.name}`);
        const { messageId, groupId, groupName, timestamp, author, messageBody } = job.data;

        // Retrieve the message from WhatsApp client
        console.log(`📥 Retrieving message: ${messageId}`);
        const message = await client.getMessageById(messageId);

        if (!message) {
          console.error(`❌ Message not found: ${messageId}`);
          return { success: false, error: 'Message not found' };
        }

        // Download media
        console.log(`📥 Downloading media from message...`);
        const media = await message.downloadMedia();

        if (!media) {
          console.error(`❌ Failed to download media: ${messageId}`);
          return { success: false, error: 'Failed to download media' };
        }

        // Categorize media
        const videos = [];
        const images = [];
        categorizeMedia(media, videos, images);

        // Apply limits
        const limitedVideos = videos.slice(0, MAX_VIDEOS);
        const limitedImages = images.slice(0, MAX_IMAGES);

        // Log if items were dropped
        if (videos.length > MAX_VIDEOS) {
          console.log(`⚠️ Dropped ${videos.length - MAX_VIDEOS} videos (max ${MAX_VIDEOS})`);
        }
        if (images.length > MAX_IMAGES) {
          console.log(`⚠️ Dropped ${images.length - MAX_IMAGES} images (max ${MAX_IMAGES})`);
        }

        const finalResult = {
          success: true,
          messageId,
          groupId,
          groupName,
          timestamp,
          author,
          messageBody,
          videos: limitedVideos,
          images: limitedImages,
          totalMedia: limitedVideos.length + limitedImages.length,
          droppedVideos: Math.max(0, videos.length - MAX_VIDEOS),
          droppedImages: Math.max(0, images.length - MAX_IMAGES),
        };

        console.log(`✅ Job completed: ${job.name}`);
        console.log(`📊 Result: ${finalResult.videos.length} videos, ${finalResult.images.length} images`);
        console.log(`✅ Job ${job.id} marked as done`);

        return finalResult;
      } catch (error) {
        console.error(`❌ Error processing job ${job.name}:`, error.message);
        throw error; // Re-throw to trigger retry logic
      }
    },
    {
      connection: redisConnection,
      concurrency: 1, // Process one job at a time (for Supabase and TikTok posting)
    }
  );

  // Worker event handlers
  worker.on('completed', (job, result) => {
    console.log(`✅ Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('❌ Worker error:', err.message);
  });

  console.log('🚀 Unread Group Messages Worker started');

  return worker;
}

/* COMMENTED OUT - No longer needed, processing happens in worker loop
function processMedia(media) {
  const videos = [];
  const images = [];

  // Single media item
  if (media.mimetype) {
    categorizeMedia(media, videos, images);
  }

  // Apply limits: max 2 videos, max 10 images
  const limitedVideos = videos.slice(0, MAX_VIDEOS);
  const limitedImages = images.slice(0, MAX_IMAGES);

  // Log if items were dropped
  if (videos.length > MAX_VIDEOS) {
    console.log(`⚠️ Dropped ${videos.length - MAX_VIDEOS} videos (max ${MAX_VIDEOS})`);
  }
  if (images.length > MAX_IMAGES) {
    console.log(`⚠️ Dropped ${images.length - MAX_IMAGES} images (max ${MAX_IMAGES})`);
  }

  return {
    videos: limitedVideos,
    images: limitedImages,
    totalMedia: limitedVideos.length + limitedImages.length,
    droppedVideos: Math.max(0, videos.length - MAX_VIDEOS),
    droppedImages: Math.max(0, images.length - MAX_IMAGES),
  };
}
*/

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
    data: media.data, // base64 encoded
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

module.exports = { initializeWorker };
