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
const {
  uploadImageToCloudinary,
  transformAndDownloadImage,
  buildTemplateUrl,
} = require('../services/cloudinaryClient');

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
        // ❌ Videos will not be uploaded to Cloudinary (commented out)
        // const limitedVideos = allVideos.slice(0, MAX_VIDEOS);
        let limitedImages = allImages.slice(0, MAX_IMAGES);

        if (allVideos.length > MAX_VIDEOS) {
          console.log(`⚠️ Dropped ${allVideos.length - MAX_VIDEOS} videos (max ${MAX_VIDEOS})`);
        }
        if (allImages.length > MAX_IMAGES) {
          console.log(`⚠️ Dropped ${allImages.length - MAX_IMAGES} images (max ${MAX_IMAGES})`);
        }

        // Upload first 2 images to Cloudinary and transform them
        console.log(`\n🌥️ Processing images with Cloudinary...`);
        const imagesToTransform = limitedImages.slice(0, 2); // Only first 2 images
        const transformedImageIndices = []; // Track which indices were transformed

        for (let i = 0; i < imagesToTransform.length; i++) {
          try {
            const image = imagesToTransform[i];
            const extension = getFileExtension(image.mimetype);
            const filename = `kleva_image_${timestamp}_${i}.${extension}`;

            console.log(`\n📸 [Image ${i}] Uploading to Cloudinary: ${filename}`);
            const buffer = Buffer.from(image.data, 'base64');

            // Upload to Cloudinary
            const cloudinaryResult = await uploadImageToCloudinary(buffer, filename);
            const publicId = cloudinaryResult.public_id;

            console.log(`✅ [Image ${i}] Cloudinary ID: ${publicId}`);

            const publicFileName = `${publicId}.${extension}`;
            const transformedUrl = buildTemplateUrl(publicFileName, i);
            console.log(`🔄 [Image ${i}] Transformed URL: ${transformedUrl}`);

            // Download the transformed image
            const transformedBuffer = await transformAndDownloadImage(publicFileName, i);

            // Replace the original image in limitedImages with the transformed version
            const transformedImageItem = {
              mimetype: image.mimetype,
              data: transformedBuffer.toString('base64'),
              filename: filename,
              cloudinaryPublicId: publicId,
              transformedUrl: transformedUrl,
            };

            limitedImages[i] = transformedImageItem;
            transformedImageIndices.push(i);

            console.log(`✅ [Image ${i}] Replaced in limitedImages at index ${i}`);
          } catch (error) {
            console.error(`❌ [Image ${i}] Failed to process with Cloudinary:`, error.message);
            // Keep the original image if transformation fails
          }
        }

        // Log final status
        console.log(`\n✅ Image Processing Complete:`);
        console.log(`   - Transformed images: ${transformedImageIndices.length} at indices [${transformedImageIndices.join(', ')}]`);
        console.log(`   - Total images in limitedImages: ${limitedImages.length}`);
        console.log(`   - Remaining images unchanged: ${limitedImages.length - transformedImageIndices.length}`);

        // Create and add child jobs for TikTok posting using transformed images
        const childJobIds = [];

        // Create one child job for carousel (if transformed images exist)
        if (limitedImages.length > 0) {
          const validImages = limitedImages.filter(img => img);
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
        console.log(`   - ${limitedImages.filter(i => i).length} image(s) in carousel`);

        return {
          childJobIds,
          summary: {
            messageIds,
            groupId,
            groupName,
            totalImages: limitedImages.length,
            transformedImages: transformedImageIndices.length,
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
    console.log(`✅ [PARENT] Job ${job.id} completed - processed ${result.summary.processedImages} images`);
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
