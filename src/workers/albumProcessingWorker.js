/**
 * Parent Worker - Album Processing
 *
 * Processes album batches from WhatsApp:
 * - Downloads all media from messages
 * - Categorizes and applies limits
 * - Uploads to Publer
 * - Creates child jobs for TikTok posting
 */

const { Worker, Queue } = require('bullmq');
const Redis = require('ioredis');
const { uploadMediaToPubler } = require('./mediaUploader');

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

  // Create queue for child jobs (TikTok posting)
  const tiktokPostingQueue = new Queue('tiktokPosting', {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 1,              // max 1 retry attempts
      backoff: {
        type: 'exponential',
        delay: 5000             // 5s, 10s, 20s
      },
      removeOnComplete: true,
      removeOnFail: {
        age: 4 * 3600           // remove failed jobs after 4 hours
      }
    }
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
        const limitedVideos = allVideos.slice(0, MAX_VIDEOS);
        const limitedImages = allImages.slice(0, MAX_IMAGES);

        if (allVideos.length > MAX_VIDEOS) {
          console.log(`⚠️ Dropped ${allVideos.length - MAX_VIDEOS} videos (max ${MAX_VIDEOS})`);
        }
        if (allImages.length > MAX_IMAGES) {
          console.log(`⚠️ Dropped ${allImages.length - MAX_IMAGES} images (max ${MAX_IMAGES})`);
        }

        // Upload all media to Publer
        console.log(`\n📤 Uploading media to Publer...`);
        const { uploadedVideos, uploadedImages } = await uploadMediaToPubler({
          videos: limitedVideos,
          images: limitedImages,
          timestamp
        });

        console.log(`✅ Uploaded: ${uploadedVideos.length} videos, ${uploadedImages.length} images`);
        console.log(`📹 Video Publer IDs:`, uploadedVideos.map(v => v.publerId).filter(id => id));
        console.log(`📸 Image Publer IDs:`, uploadedImages.map(i => i.publerId).filter(id => id));

        // Create and add child jobs for TikTok posting
        const childJobIds = [];

        // Create one child job per video
        for (let i = 0; i < uploadedVideos.length; i++) {
          const video = uploadedVideos[i];
          if (video.publerId) {
            const jobName = `post-video-${groupId}-${timestamp}-${i}`;
            const childJob = await tiktokPostingQueue.add(
              jobName,
              {
                type: 'video',
                media: video,
                groupName,
                timestamp,
                messageBody,
                videoIndex: i
              },
              {
                attempts: 2,
                backoff: {
                  type: 'exponential',
                  delay: 5000,
                },
              }
            );
            childJobIds.push(childJob.id);
            console.log(`✅ Created video post job: ${jobName}`);
          }
        }

        // Create one child job for carousel (if images exist)
        if (uploadedImages.length > 0) {
          const validImages = uploadedImages.filter(img => img.publerId);
          if (validImages.length > 0) {
            const jobName = `post-carousel-${groupId}-${timestamp}`;
            const childJob = await tiktokPostingQueue.add(
              jobName,
              {
                type: 'carousel',
                media: validImages,
                groupName,
                timestamp,
                messageBody
              },
              {
                attempts: 2,
                backoff: {
                  type: 'exponential',
                  delay: 5000,
                },
              }
            );
            childJobIds.push(childJob.id);
            console.log(`✅ Created carousel post job: ${jobName}`);
          }
        }

        console.log(`\n✅ [PARENT] Created ${childJobIds.length} child job(s) for TikTok posting`);
        console.log(`   - ${uploadedVideos.filter(v => v.publerId).length} video post(s)`);
        console.log(`   - ${uploadedImages.filter(i => i.publerId).length > 0 ? 1 : 0} carousel post`);

        return {
          childJobIds,
          summary: {
            messageIds,
            groupId,
            groupName,
            totalVideos: uploadedVideos.length,
            totalImages: uploadedImages.length,
            droppedVideos: Math.max(0, allVideos.length - MAX_VIDEOS),
            droppedImages: Math.max(0, allImages.length - MAX_IMAGES),
            childJobsCreated: childJobIds.length
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
    console.log(`✅ [PARENT] Job ${job.id} completed - created ${result.childJobIds.length} child jobs`);
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
