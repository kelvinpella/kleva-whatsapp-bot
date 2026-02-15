/**
 * TikTok Publisher Service
 * Handles publishing media to TikTok via Publer API
 */

const { uploadMediaFromUrl, waitForMediaUpload, createTikTokVideoPost, createTikTokCarouselPost } = require('./publerClient');
const contentTemplates = require('../config/contentTemplates.json');

const POST_DELAY_MS = 60000; // 1 minute delay between posts

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
      title: 'Pochi Kali',
      description: 'Check out these amazing handbags! #fashion #pochiZaWadadaTrending'
    };
  }

  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Publish videos to TikTok (one post per video)
 * @param {Array<Object>} videos - Array of video objects with url property
 * @returns {Promise<Array>} Array of published post results
 */
async function publishVideos(videos) {
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

      // Step 1: Upload video to Publer
      console.log(`⬆️ Uploading video to Publer...`);
      const uploadJobId = await uploadMediaFromUrl([{
        url: video.url,
        name: `pochi_kali_video_${i}`,
      }]);

      // Step 2: Wait for upload to complete
      console.log(`⏳ Waiting for video upload to complete...`);
      const uploadedMedia = await waitForMediaUpload(uploadJobId);
      const mediaId = uploadedMedia[0].id;
      console.log(`✅ Video uploaded with ID: ${mediaId}`);

      // Step 3: Get random description for video
      const template = getRandomTemplate();
      console.log(`📝 Description: ${template.description.substring(0, 50)}...`);

      // Step 4: Create TikTok video post
      console.log(`📱 Creating TikTok post...`);
      const postResult = await createTikTokVideoPost({
        text: template.description,
        mediaIds: [mediaId],
      });

      results.push({
        success: true,
        videoIndex: i,
        videoUrl: video.url,
        postJobId: postResult.job_id,
        template: template.description
      });

      console.log(`✅ Video ${i + 1}/${videos.length} published successfully (Job: ${postResult.job_id})`);

      // Wait 1 minute before next post (except for the last one)
      if (i < videos.length - 1) {
        console.log(`⏳ Waiting 1 minute before next post...`);
        await delay(POST_DELAY_MS);
      }

    } catch (error) {
      console.error(`❌ Failed to publish video ${i + 1}:`, error.message);
      results.push({
        success: false,
        videoIndex: i,
        videoUrl: video.url,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Publish images to TikTok as carousel (all images in one post)
 * @param {Array<Object>} images - Array of image objects with url property
 * @returns {Promise<Object>} Published carousel post result
 */
async function publishCarousel(images) {
  if (!images || images.length === 0) {
    console.log('ℹ️ No images to publish');
    return null;
  }

  console.log(`\n🖼️ Publishing ${images.length} image(s) as carousel to TikTok...`);

  try {
    // Step 1: Upload all images to Publer
    console.log(`⬆️ Uploading ${images.length} images to Publer...`);
    const uploadJobId = await uploadMediaFromUrl(
      images.map((img, index) => ({
        url: img.url,
        name: `pochi_kali_image_${index}`,
      }))
    );

    // Step 2: Wait for upload to complete
    console.log(`⏳ Waiting for image uploads to complete...`);
    const uploadedMedia = await waitForMediaUpload(uploadJobId);
    const mediaIds = uploadedMedia.map(m => m.id);
    console.log(`✅ ${mediaIds.length} images uploaded successfully`);

    // Step 3: Get random title and description for carousel
    const template = getRandomTemplate();
    console.log(`📝 Title: ${template.title}`);
    console.log(`📝 Description: ${template.description.substring(0, 50)}...`);

    // Step 4: Create TikTok carousel post
    console.log(`📱 Creating TikTok carousel post...`);
    const postResult = await createTikTokCarouselPost({
      title: template.title,
      text: template.description,
      mediaIds: mediaIds,
      autoMusic: true,
    });

    console.log(`✅ Carousel published successfully (Job: ${postResult.job_id})`);

    return {
      success: true,
      imageCount: images.length,
      imageUrls: images.map(img => img.url),
      postJobId: postResult.job_id,
      template: {
        title: template.title,
        description: template.description
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
 * 1-minute delay between each post
 *
 * @param {Object} params - Publishing parameters
 * @param {Array<Object>} params.videos - Array of video objects with url
 * @param {Array<Object>} params.images - Array of image objects with url
 * @returns {Promise<Object>} Publishing results
 */
async function publishToTikTok({ videos, images }) {
  console.log('\n🚀 Starting TikTok publishing process via Publer API...');
  console.log(`📊 Media to publish: ${videos.length} video(s), ${images.length} image(s)`);

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
      results.videos = await publishVideos(videos);
      results.totalPosts += videos.length;
      results.successPosts += results.videos.filter(r => r.success).length;
      results.failedPosts += results.videos.filter(r => !r.success).length;

      // Wait before publishing carousel if we have both videos and images
      if (images.length > 0) {
        console.log(`\n⏳ Waiting 1 minute before publishing carousel...`);
        await delay(POST_DELAY_MS);
      }
    }

    // Publish images as carousel (one post with all images)
    if (images.length > 0) {
      results.carousel = await publishCarousel(images);
      results.totalPosts += 1;
      if (results.carousel.success) {
        results.successPosts += 1;
      } else {
        results.failedPosts += 1;
      }
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
