/**
 * Child Worker - Social Posting
 *
 * Handles individual social post jobs:
 * - Schedules posts through Zernio
 * - Uses Cloudinary URLs for media
 * - Keeps 2-hour spacing between scheduled posts
 * - Uses Tanzania GMT+3 timezone for all scheduled times
 */

const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { fal } = require('@fal-ai/client');
const falPrompts = require('../config/falPrompts');
const { getRandomFallbackResult } = require('../config/falFallbacks');
const { buildDynamicTemplateUrl } = require('../services/cloudinaryClient');
const { getScheduledPosts, getLatestScheduledPost, scheduleSocialPost } = require('../services/zernioClient');

const MAX_SCHEDULE_INTERVAL_HOURS = 2;
const MAX_SCHEDULED_PER_DAY = 12;
const TIMEZONE = 'Africa/Dar_es_Salaam';

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 3600000);
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
 * Generate post title and description via Fal AI.
 * @param {string} imageUrl - Cloudinary URL of the first product image
 * @param {string} productName - Product name to describe
 * @returns {Promise<Object>} Fal workflow result JSON
 */
async function generateFalPostContent(imageUrl, productName) {
  try {
    const prompt = falPrompts.prompt.replace(/\${product_name}/g, productName);

    const stream = await fal.stream(
      'workflows/kelvinpella/kleva-post-title-and-description',
      {
        input: {
          product: imageUrl,
          prompt,
          system_prompt: falPrompts.system_prompt,
        },
      }
    );

    for await (const event of stream) {
      console.log(event);
    }

    const rawResult = await stream.done();

    // Fal workflows often wrap the final JSON in nested output fields.
    // Try the common nesting paths before falling back to the raw result.


    const resultPayload =
      rawResult?.output?.output ??
      rawResult?.output ??
      rawResult;

    if (typeof resultPayload === "string") {
      let text = resultPayload.trim();

      // Try extracting fenced JSON
      const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (fenced) {
        text = fenced[1].trim();
      } else {
        // Otherwise extract the first JSON object
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end !== -1) {
          text = text.slice(start, end + 1);
        }
      }

      return JSON.parse(text);
    }

    return resultPayload;

    return resultPayload;
  } catch (err) {
    console.error('❌ Fal AI workflow failed; using fallback result:', err.message);
    return getRandomFallbackResult();
  }
}

/**
 * Initialize the child worker for TikTok posting
 */
function initializeSocialPostingWorker() {
  const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker(
    'socialPosting',
    async (job) => {
      try {
        console.log(`\n🔄 [CHILD] Processing social post job: ${job.name}`);
        const { type, images, product_name, priceText, groupName, timestamp, messageBody } = job.data;

        if (!Array.isArray(images) || images.length === 0) {
          throw new Error('Missing images for social post');
        }

        const firstImageUrl = images[0].originalUrl;

        const falResult = await generateFalPostContent(firstImageUrl, product_name);
        console.log('Fal AI result:', falResult);

        const header = falResult?.on_screen?.header || '';
        const bulletsString = falResult?.on_screen?.bullets || '';
        const bullets = bulletsString
          .split(',')
          .map((b) => b.trim())
          .filter(Boolean)
          .slice(0, 3)
          .map((b, i) => `${i + 1}. ${b}`);

        // Build the final carousel URLs:
        // - Image 0 uses the generated header and the price from the message
        // - Image 1 uses the generated bullets
        // - Images 2+ use the shared transformation template without text overlays
        const mediaUrls = images.map((image, i) =>
          buildDynamicTemplateUrl(
            image.publicFileName,
            Math.min(i, 2),
            i === 0 ? { brand: header, priceText } : i === 1 ? { bullets } : {}
          )
        );

        const processedDescription = processDescription(falResult?.description || '', groupName, timestamp);
        const title = falResult?.title || 'Kleva Pochi Kali';
        const now = new Date();

        console.log(`📝 [CHILD] Title: ${title}`);
        console.log(`📝 [CHILD] Description preview: ${processedDescription.substring(0, 120)}...`);
        console.log(`🖼️ [CHILD] Media URLs count: ${mediaUrls.length}`);

        const scheduledPosts = await getScheduledPosts();
        const latestScheduledPost = await getLatestScheduledPost();

        // Keep a 2-hour gap between scheduled posts. Chaining each new post 2h after the
        // latest scheduled one inherently caps output at ~MAX_SCHEDULED_PER_DAY posts / 24h
        // (24 / 2 = 12), which respects TikTok's daily limit without a separate counter.
        const minimumSchedule = addHours(now, MAX_SCHEDULE_INTERVAL_HOURS);
        const nextAvailableFromLatest = latestScheduledPost?.scheduledAt
          ? addHours(latestScheduledPost.scheduledAt, MAX_SCHEDULE_INTERVAL_HOURS)
          : null;

        const scheduledAt = nextAvailableFromLatest && nextAvailableFromLatest > minimumSchedule
          ? nextAvailableFromLatest
          : minimumSchedule;

        // Reporting only: how many posts are already scheduled in the next 24h.
        const upcoming24hPosts = scheduledPosts.filter(post => {
          return post.scheduledAt
            && post.scheduledAt > now
            && post.scheduledAt <= addHours(now, 24);
        });

        const scheduledLocal = scheduledAt.toLocaleString('en-GB', { timeZone: TIMEZONE, hour12: false });
        console.log(`📅 [CHILD] Scheduling current post for ${scheduledLocal} ${TIMEZONE} (${scheduledAt.toISOString()} UTC)`);

        const scheduledPost = await scheduleSocialPost({
          title,
          description: processedDescription,
          mediaUrls,
          scheduledAt,
          timezone: TIMEZONE,
          type,
          sourceMetadata: {
            groupName,
            messageBody,
            timestamp,
          },
        });

        const postResult = {
          success: true,
          type,
          scheduledAt: scheduledAt.toISOString(),
          timezone: TIMEZONE,
          title,
          description: processedDescription,
          mediaUrlsCount: mediaUrls.length,
          latestScheduledPost: latestScheduledPost ? {
            id: latestScheduledPost._id,
            scheduledAt: latestScheduledPost.scheduledAt.toISOString(),
          } : null,
          scheduledPostsInNext24h: upcoming24hPosts.length,
          zernioPostId: scheduledPost?._id || null,
          zernioPostStatus: scheduledPost?.status || null,
        };

        console.log(`✅ [CHILD] Job ${job.name} completed and scheduled for ${postResult.scheduledAt}`);
        return postResult;

      } catch (error) {
        console.error(`❌ [CHILD] Error in social posting job ${job.name}:`, error.message);
        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: 1, // Process one social post at a time to respect rate limits
    }
  );

  // Event handlers
  worker.on('completed', (job, result) => {
    console.log(`✅ [CHILD] Job ${job.id} completed - scheduled at ${result.scheduledAt}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ [CHILD] Job ${job.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('❌ [CHILD] Worker error:', err.message);
  });

  console.log('🚀 Social Posting Worker (Child) started');

  return worker;
}

module.exports = { initializeSocialPostingWorker };
