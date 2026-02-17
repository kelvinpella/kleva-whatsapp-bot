/**
 * Child Worker - TikTok Posting
 *
 * Handles individual TikTok post jobs:
 * - Posts videos or carousels to TikTok
 * - Polls job status until completion
 * - Waits 3 minutes after confirmation
 * - Returns result to parent flow
 */

const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { createTikTokVideoPost, createTikTokCarouselPost, pollPostJobStatus } = require('../services/publerClient');
const { getRandomTemplate } = require('../services/tiktokPublisher');

const POST_DELAY_MS = 180000; // 3 minutes (180,000 ms)
const DEFAULT_TIKTOK_DETAILS = {
  "privacy": "PUBLIC_TO_EVERYONE",
  "comment": true,
  "stitch": true,
  "promotional": false,
  "paid": false,
  "reminder": false
};

/**
 * Wait for specified milliseconds
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Limit hashtags in text to maximum of 4
 */
function limitHashtags(text) {
  const hashtagRegex = /#[\w]+/g;
  const hashtags = text.match(hashtagRegex) || [];

  if (hashtags.length <= 4) {
    return text;
  }

  const hashtagsToRemove = hashtags.slice(4);
  let modifiedText = text;
  hashtagsToRemove.forEach(tag => {
    modifiedText = modifiedText.replace(tag, '');
  });

  return modifiedText.replace(/\s+/g, ' ').trim();
}

/**
 * Generate supplier code hashtag
 */
function generateSupplierCode(groupName, timestamp) {
  const cleanName = groupName.replace(/[^a-zA-Z0-9]/g, '');
  const groupPrefix = cleanName.substring(0, 3).toUpperCase();
  const date = new Date(timestamp * 1000);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dateStr = `${day}${month}`;
  return `#${groupPrefix}HK${dateStr}`;
}

/**
 * Process description with hashtag rules
 */
function processDescription(description, groupName, timestamp) {
  let processed = limitHashtags(description);
  const supplierCode = generateSupplierCode(groupName, timestamp);
  processed = `${processed} ${supplierCode}`;
  return processed;
}

/**
 * Initialize the child worker for TikTok posting
 */
function initializeTikTokWorker() {
  const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker(
    'tiktokPosting',
    async (job) => {
      try {
        console.log(`\n🔄 [CHILD] Processing TikTok post job: ${job.name}`);
        const { type, media, groupName, timestamp, messageBody, videoIndex } = job.data;

        let postJobId;
        let postResult;

        // Get template and process description
        const template = getRandomTemplate();
        const processedDescription = processDescription(template.description, groupName, timestamp);

        if (type === 'video') {
          // Post single video
          console.log(`📹 [CHILD] Posting video ${videoIndex !== undefined ? videoIndex + 1 : ''}...`);
          console.log(`   Publer ID: ${media.publerId}`);
          console.log(`   Description: ${processedDescription.substring(0, 60)}...`);

          const response = await createTikTokVideoPost({
            text: processedDescription,
            mediaId: media.publerId,
            details: DEFAULT_TIKTOK_DETAILS
          });

          postJobId = response.job_id;
          console.log(`✅ [CHILD] Video post created with job ID: ${postJobId}`);

        } else if (type === 'carousel') {
          // Post carousel with all images
          console.log(`🖼️ [CHILD] Posting carousel with ${media.length} images...`);
          const mediaIds = media.map(img => img.publerId).filter(id => id);
          console.log(`   Publer IDs: ${mediaIds.join(', ')}`);
          console.log(`   Title: ${template.title}`);
          console.log(`   Description: ${processedDescription.substring(0, 60)}...`);

          const response = await createTikTokCarouselPost({
            title: template.title,
            text: processedDescription,
            mediaIds: mediaIds,
            details: DEFAULT_TIKTOK_DETAILS
          });

          postJobId = response.job_id;
          console.log(`✅ [CHILD] Carousel post created with job ID: ${postJobId}`);

        } else {
          throw new Error(`Unknown post type: ${type}`);
        }

        // Poll job status until completion
        console.log(`\n⏳ [CHILD] Polling job status for ${postJobId}...`);
        const jobStatus = await pollPostJobStatus(postJobId, {
          pollInterval: 10000, // Poll every 10 seconds
          maxWaitMs: 300000    // Max 5 minutes timeout
        });

        if (jobStatus.success) {
          console.log(`✅ [CHILD] TikTok post completed successfully!`);
        } else {
          console.error(`❌ [CHILD] TikTok post failed:`, jobStatus?.failures);
        }

        // Wait 3 minutes after post completion/failure
        console.log(`⏳ [CHILD] Waiting 3 minutes before next post can proceed...`);
        await delay(POST_DELAY_MS);
        console.log(`✅ [CHILD] 3-minute delay completed`);

        postResult = {
          success: jobStatus.success,
          type,
          postJobId,
          processedDescription,
          failures: jobStatus.failures,
          ...(type === 'video' ? { videoIndex, publerId: media.publerId } : { imageCount: media.length })
        };

        console.log(`✅ [CHILD] Job ${job.name} completed`);
        return postResult;

      } catch (error) {
        console.error(`❌ [CHILD] Error in TikTok posting job ${job.name}:`, error.message);
        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: 1, // Process one TikTok post at a time to respect rate limits
    }
  );

  // Event handlers
  worker.on('completed', (job, result) => {
    console.log(`✅ [CHILD] Job ${job.id} completed - Post ${result.success ? 'succeeded' : 'failed'}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ [CHILD] Job ${job.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('❌ [CHILD] Worker error:', err.message);
  });

  console.log('🚀 TikTok Posting Worker (Child) started');

  return worker;
}

module.exports = { initializeTikTokWorker };
