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
const { uploadMediaToPubler } = require('./mediaUploader');
const { publishToTikTok } = require('../services/tiktokPublisher');

const MAX_VIDEOS = 2;
const MAX_IMAGES = 10;

/**
 * Initialize and start the worker
 * @param {Object} client - WhatsApp client instance
 * @param {Object} db - Database handler instance
 * @returns {Worker} - BullMQ Worker instance
 */
function initializeWorker(client, db) {
  // Uses REDIS_URL env var if available (Railway), otherwise defaults to localhost
  const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker(
    'unreadGroupMessages',
    async (job) => {
      try {
        console.log(`\n🔄 Processing job: ${job.name}`);
        const { messageIds, groupId, groupName, timestamp, author, messageBody, albumSize } = job.data;

        console.log(`📦 Processing album with ${messageIds.length} message(s)`);

        // Arrays to collect all media from all messages in album
        const allVideos = [];
        const allImages = [];

        // Process each message in the album
        for (const messageId of messageIds) {
          try {
            console.log(`📥 Retrieving message: ${messageId}`);
            const message = await client.getMessageById(messageId);

            if (!message) {
              console.error(`❌ Message not found: ${messageId}`);
              continue; // Skip this message, process others
            }

            // Download media
            console.log(`📥 Downloading media from message...`);
            const media = await message.downloadMedia();

            if (!media) {
              console.error(`❌ Failed to download media: ${messageId}`);
              continue; // Skip this message, process others
            }

            // Categorize media and add to album arrays
            categorizeMedia(media, allVideos, allImages);

          } catch (err) {
            console.error(`❌ Error processing message ${messageId}:`, err.message);
            // Continue processing other messages
          }
        }

        console.log(`📊 Album totals: ${allVideos.length} videos, ${allImages.length} images`);

        // Apply limits across entire album
        const limitedVideos = allVideos.slice(0, MAX_VIDEOS);
        const limitedImages = allImages.slice(0, MAX_IMAGES);

        // Log if items were dropped
        if (allVideos.length > MAX_VIDEOS) {
          console.log(`⚠️ Dropped ${allVideos.length - MAX_VIDEOS} videos (max ${MAX_VIDEOS})`);
        }
        if (allImages.length > MAX_IMAGES) {
          console.log(`⚠️ Dropped ${allImages.length - MAX_IMAGES} images (max ${MAX_IMAGES})`);
        }

        // Upload media directly to Publer and get media IDs
        const { uploadedVideos, uploadedImages } = await uploadMediaToPubler({
          videos: limitedVideos,
          images: limitedImages,
          timestamp
        });

        console.log(`📹 Video Publer IDs:`, uploadedVideos.map(v => v.publerId).filter(id => id));
        console.log(`📸 Image Publer IDs:`, uploadedImages.map(i => i.publerId).filter(id => id));

        // Publish to TikTok using Publer media IDs
        console.log(`\n🚀 Publishing to TikTok...`);
        const publishingResults = await publishToTikTok({
          videos: uploadedVideos,
          images: uploadedImages,
          groupName: groupName,
          timestamp: timestamp
        });

        const finalResult = {
          success: true,
          messageIds: messageIds,
          groupId,
          groupName,
          timestamp,
          author,
          messageBody,
          albumSize: messageIds.length,
          videos: uploadedVideos,
          images: uploadedImages,
          totalMedia: uploadedVideos.length + uploadedImages.length,
          droppedVideos: Math.max(0, allVideos.length - MAX_VIDEOS),
          droppedImages: Math.max(0, allImages.length - MAX_IMAGES),
          publishing: publishingResults
        };

        console.log(`✅ Job completed: ${job.name}`);
        console.log(`📊 Final result: ${finalResult.videos.length} videos, ${finalResult.images.length} images (from ${messageIds.length} message(s))`);
        console.log(`📊 Publishing: ${publishingResults.successPosts}/${publishingResults.totalPosts} posts published successfully`);
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
