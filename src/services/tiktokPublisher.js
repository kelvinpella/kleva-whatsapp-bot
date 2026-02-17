/**
 * TikTok Publisher Service
 * Handles publishing media to TikTok via Publer API
 *
 * Features:
 * - Publishes videos as individual TikTok posts
 * - Publishes images as single TikTok carousel post
 * - Smart hashtag processing: limits to 4 hashtags + supplier code
 * - Supplier code format: #[3chars]HK[DDMM] (e.g., #KLEHK1502)
 * - 5-minute delay after each post completes to respect rate limits
 * - Randomized content templates for variety
 * - Uses existing Publer media IDs (no re-upload)
 *
 * Flow:
 * 1. publishToTikTok() orchestrates the publishing process
 * 2. publishVideos() posts each video individually with delays
 * 3. publishCarousel() posts all images as one carousel
 * 4. Each post gets processed description with hashtag rules
 * 5. Supplier code appended for tracking (groupName + date)
 *
 * Environment Variables:
 * - PUBLER_API_KEY: Publer API authentication
 * - PUBLER_WORKSPACE_ID: Workspace identifier
 * - TIKTOK_ACCOUNT_ID: Connected TikTok account
 *
 * @module tiktokPublisher
 */

const { createTikTokVideoPost, createTikTokCarouselPost } = require('./publerClient');
const contentTemplates = require('../config/contentTemplates.json');

const POST_DELAY_MS = 300000; // 5 minute delay after each post completes
const DEFAULT_TIKTOK_DETAILS = {
  "privacy": "PUBLIC_TO_EVERYONE",
  "comment": true,
  "stitch": true,
  "promotional": false,
  "paid": false,
  "reminder": false
}

/**
 * Wait for specified milliseconds
 * @param {number} ms - Milliseconds to wait
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get random content template
 * @returns {Object} Random template with title and description
 */
function getRandomTemplate() {
  const templates = contentTemplates.filter(t => t.description && t.description.trim() !== '');

  if (templates.length === 0) {
    console.warn('⚠️ No content templates found, using default text');
    return {
      title: 'Pochi Kali na za kisasa',
      description: 'Pochi kali kutoka Kleva Pochi Kali Kariakoo! #fashion #pochiZaWadadaTrending'
    };
  }

  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Limit hashtags in text to maximum of 4
 * @param {string} text - Text containing hashtags
 * @returns {string} Text with at most 4 hashtags
 */
function limitHashtags(text) {
  // Extract all hashtags
  const hashtagRegex = /#[\w]+/g;
  const hashtags = text.match(hashtagRegex) || [];

  if (hashtags.length <= 4) {
    return text;
  }

  // Remove hashtags beyond the 4th one
  const hashtagsToRemove = hashtags.slice(4);

  let modifiedText = text;
  hashtagsToRemove.forEach(tag => {
    modifiedText = modifiedText.replace(tag, '');
  });

  // Clean up extra spaces
  modifiedText = modifiedText.replace(/\s+/g, ' ').trim();

  return modifiedText;
}

/**
 * Generate supplier code hashtag
 * @param {string} groupName - Supplier group name
 * @param {number} timestamp - Message timestamp (WhatsApp timestamp in seconds)
 * @returns {string} Supplier code hashtag (e.g., #KLEHK0201)
 */
function generateSupplierCode(groupName, timestamp) {
  // Remove spaces and special characters, keep only alphanumeric
  const cleanName = groupName.replace(/[^a-zA-Z0-9]/g, '');

  // Get first 3 characters of cleaned group name
  const groupPrefix = cleanName.substring(0, 3).toUpperCase();

  // Convert WhatsApp timestamp (seconds) to milliseconds for Date constructor
  const date = new Date(timestamp * 1000);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dateStr = `${day}${month}`;

  // Combine: first3chars + HK + DDMM
  return `#${groupPrefix}HK${dateStr}`;
}

/**
 * Process description with hashtag rules
 * @param {string} description - Original description
 * @param {string} groupName - Supplier group name
 * @param {number} timestamp - Message timestamp
 * @returns {string} Processed description
 */
function processDescription(description, groupName, timestamp) {
  // Step 1: Limit to 4 hashtags
  let processed = limitHashtags(description);

  // Step 2: Generate and append supplier code
  const supplierCode = generateSupplierCode(groupName, timestamp);
  processed = `${processed} ${supplierCode}`;

  return processed;
}

/**
 * Publish videos to TikTok (one post per video)
 * @param {Array<Object>} videos - Array of video objects with publerId property
 * @param {string} groupName - Supplier group name
 * @param {number} timestamp - Message timestamp
 * @returns {Promise<Array>} Array of published post results
 */
async function publishVideos(videos, groupName, timestamp) {
  if (!videos || videos.length === 0) {
    console.log('ℹ️ No videos to publish');
    return [];
  }

  console.log(`\n📹 Publishing ${videos.length} video(s) to TikTok...`);
  const results = [];

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];

    try {
      console.log(`\n📤 Publishing video ${i + 1}/${videos.length}...`);

      // Check if video has Publer media ID
      if (!video.publerId) {
        throw new Error('Video missing Publer media ID');
      }

      console.log(`✅ Using Publer media ID: ${video.publerId}`);

      // Get random description for video and process it
      const template = getRandomTemplate();
      const processedDescription = processDescription(template.description, groupName, timestamp);
      console.log(`📝 Original: ${template.description.substring(0, 50)}...`);
      console.log(`📝 Processed: ${processedDescription.substring(0, 50)}...`);

      // Create TikTok video post using existing Publer media ID
      console.log(`📱 Creating TikTok post...`);
      const postResult = await createTikTokVideoPost({
        text: processedDescription,
        mediaIds: [video.publerId],
        details: DEFAULT_TIKTOK_DETAILS
      });

      results.push({
        success: true,
        videoIndex: i,
        publerId: video.publerId,
        postJobId: postResult.job_id,
        template: processedDescription
      });

      console.log(`✅ Video ${i + 1}/${videos.length} published successfully (Job: ${postResult.job_id})`);

      // Wait 5 minutes after each video post completes
      console.log(`⏳ Waiting 5 minutes after post completion...`);
      await delay(POST_DELAY_MS);

    } catch (error) {
      console.error(`❌ Failed to publish video ${i + 1}:`, error.message);
      results.push({
        success: false,
        videoIndex: i,
        publerId: video.publerId,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Publish images to TikTok as carousel (all images in one post)
 * @param {Array<Object>} images - Array of image objects with publerId property
 * @param {string} groupName - Supplier group name
 * @param {number} timestamp - Message timestamp
 * @returns {Promise<Object>} Published carousel post result
 */
async function publishCarousel(images, groupName, timestamp) {
  if (!images || images.length === 0) {
    console.log('ℹ️ No images to publish');
    return null;
  }

  console.log(`\n🖼️ Publishing ${images.length} image(s) as carousel to TikTok...`);

  try {
    // Extract Publer media IDs from images
    const mediaIds = images.map(img => img.publerId).filter(id => id);

    if (mediaIds.length === 0) {
      throw new Error('No valid Publer media IDs found in images');
    }

    console.log(`✅ Using ${mediaIds.length} Publer media IDs for carousel`);

    // Get random title and description for carousel and process description
    const template = getRandomTemplate();
    const processedDescription = processDescription(template.description, groupName, timestamp);
    console.log(`📝 Title: ${template.title}`);
    console.log(`📝 Original: ${template.description.substring(0, 50)}...`);
    console.log(`📝 Processed: ${processedDescription.substring(0, 50)}...`);

    // Create TikTok carousel post using existing Publer media IDs
    console.log(`📱 Creating TikTok carousel post...`);
    const postResult = await createTikTokCarouselPost({
      title: template.title,
      text: processedDescription,
      mediaIds: mediaIds,
      details: DEFAULT_TIKTOK_DETAILS
    });

    console.log(`✅ Carousel published successfully (Job: ${postResult.job_id})`);

    return {
      success: true,
      imageCount: images.length,
      mediaIds: mediaIds,
      postJobId: postResult.job_id,
      template: {
        title: template.title,
        description: processedDescription
      }
    };

  } catch (error) {
    console.error('❌ Failed to publish carousel:', error.message);
    return {
      success: false,
      imageCount: images.length,
      error: error.message
    };
  }
}

/**
 * Publish all media (videos and images) to TikTok
 * Videos are published individually, images as carousel
 * 5-minute delay after each post completes
 *
 * @param {Object} params - Publishing parameters
 * @param {Array<Object>} params.videos - Array of video objects with publerId
 * @param {Array<Object>} params.images - Array of image objects with publerId
 * @param {string} params.groupName - Supplier group name
 * @param {number} params.timestamp - Message timestamp
 * @returns {Promise<Object>} Publishing results
 */
async function publishToTikTok({ videos, images, groupName, timestamp }) {
  console.log('\n🚀 Starting TikTok publishing process via Publer API...');
  console.log(`📊 Media to publish: ${videos.length} video(s), ${images.length} image(s)`);
  console.log(`📦 Group: ${groupName}`);

  const results = {
    videos: [],
    carousel: null,
    totalPosts: 0,
    successPosts: 0,
    failedPosts: 0
  };

  try {
    // Publish videos first (one post per video)
    if (videos.length > 0) {
      results.videos = await publishVideos(videos, groupName, timestamp);
      results.totalPosts += videos.length;
      results.successPosts += results.videos.filter(r => r.success).length;
      results.failedPosts += results.videos.filter(r => !r.success).length;
    }

    // Publish images as carousel (one post with all images)
    if (images.length > 0) {
      results.carousel = await publishCarousel(images, groupName, timestamp);
      results.totalPosts += 1;
      if (results.carousel.success) {
        results.successPosts += 1;
      } else {
        results.failedPosts += 1;
      }

      // Wait 5 minutes after carousel post completes
      console.log(`⏳ Waiting 5 minutes after carousel completion...`);
      await delay(POST_DELAY_MS);
    }

    console.log('\n✅ TikTok publishing complete!');
    console.log(`📊 Results: ${results.successPosts}/${results.totalPosts} posts published successfully`);

    return results;

  } catch (error) {
    console.error('❌ TikTok publishing failed:', error.message);
    throw error;
  }
}

module.exports = {
  publishToTikTok,
  publishVideos,
  publishCarousel,
  getRandomTemplate
};
