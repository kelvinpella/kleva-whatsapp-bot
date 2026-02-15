/**
 * Publer API Client
 * Handles communication with Publer API for TikTok publishing
 *
 * API Documentation: https://publer.com/docs
 * TikTok Posts: https://publer.com/docs/posting/create-posts/content-types/platform-specific-formats/tiktok-video-and-multi-photo-posts
 * Media Upload: https://publer.com/docs/posting/create-posts/media-handling
 */

const axios = require('axios');

const PUBLER_API_BASE = 'https://app.publer.com/api/v1';
const PUBLER_API_KEY = process.env.PUBLER_API_KEY;
const PUBLER_WORKSPACE_ID = process.env.PUBLER_WORKSPACE_ID;
const TIKTOK_ACCOUNT_ID = process.env.TIKTOK_ACCOUNT_ID;

/**
 * Upload media from URL to Publer
 * @param {Array<Object>} mediaItems - Array of media objects with url and name
 * @returns {Promise<string>} Job ID for tracking upload status
 */
async function uploadMediaFromUrl(mediaItems) {
  try {
    const response = await axios.post(
      `${PUBLER_API_BASE}/media/from-url`,
      {
        media: mediaItems.map((item, index) => ({
          url: item.url,
          name: item.name || `media_${Date.now()}_${index}`,
          caption: item.caption || '',
        })),
        type: mediaItems.length === 1 ? 'single' : 'bulk',
      },
      {
        headers: {
          'Authorization': `Bearer-API ${PUBLER_API_KEY}`,
          'Publer-Workspace-Id': PUBLER_WORKSPACE_ID,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`✅ Media upload job created: ${response.data.job_id}`);
    return response.data.job_id;

  } catch (error) {
    console.error('❌ Failed to upload media:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Check job status and get media IDs
 * @param {string} jobId - Job ID from media upload
 * @returns {Promise<Array>} Array of media IDs
 */
async function getJobStatus(jobId) {
  try {
    const response = await axios.get(
      `${PUBLER_API_BASE}/job_status/${jobId}`,
      {
        headers: {
          'Authorization': `Bearer-API ${PUBLER_API_KEY}`,
          'Publer-Workspace-Id': PUBLER_WORKSPACE_ID,
        },
      }
    );

    if (response.data.status === 'completed') {
      console.log(`✅ Job ${jobId} completed`);
      return response.data.result; // Array of media objects with IDs
    } else if (response.data.status === 'failed') {
      throw new Error(`Job ${jobId} failed: ${response.data.error}`);
    } else {
      console.log(`⏳ Job ${jobId} status: ${response.data.status}`);
      return null; // Still processing
    }

  } catch (error) {
    console.error(`❌ Failed to get job status:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Wait for media upload job to complete
 * @param {string} jobId - Job ID to wait for
 * @param {number} maxWaitMs - Maximum wait time in milliseconds (default: 60000)
 * @returns {Promise<Array>} Array of uploaded media objects
 */
async function waitForMediaUpload(jobId, maxWaitMs = 60000) {
  const startTime = Date.now();
  const checkInterval = 2000; // Check every 2 seconds

  while (Date.now() - startTime < maxWaitMs) {
    const result = await getJobStatus(jobId);

    if (result) {
      return result; // Job completed
    }

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  throw new Error(`Media upload timed out after ${maxWaitMs}ms`);
}

/**
 * Create a TikTok video post via Publer
 * @param {Object} params - Post parameters
 * @param {string} params.text - Post description/caption (max 2,200 characters)
 * @param {Array<string>} params.mediaIds - Array of media IDs from Publer
 * @param {Object} params.details - TikTok-specific settings
 * @returns {Promise<Object>} Publer API response with job_id
 */
async function createTikTokVideoPost({ text, mediaIds, details }) {
  try {
    const response = await axios.post(
      `${PUBLER_API_BASE}/posts/schedule/publish`,
      {
        bulk: {
          state: 'scheduled',
          url: "publish",
          posts: [
            {
              accounts: [
                {
                  id: TIKTOK_ACCOUNT_ID,
                },
              ],
              networks: {
                tiktok: {
                  type: 'video',
                  text: text,
                  media: mediaIds.map(id => ({
                    id,
                    thumbnails: [],
                  })),
                  details: {
                    duet: true,
                    ...details,
                  },
                },
              },
            },
          ],
        },
      },
      {
        headers: {
          'Authorization': `Bearer-API ${PUBLER_API_KEY}`,
          'Publer-Workspace-Id': PUBLER_WORKSPACE_ID,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`✅ TikTok video post created: ${response.data.job_id}`);
    return response.data;

  } catch (error) {
    console.error('❌ Failed to create TikTok video post:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Create a TikTok carousel post (multi-photo) via Publer
 * @param {Object} params - Post parameters
 * @param {string} params.title - Post title (max 90 characters)
 * @param {string} params.text - Post description (max 4,000 characters)
 * @param {Array<string>} params.mediaIds - Array of image media IDs
 * @param {boolean} params.autoMusic - Auto-add music (default: true)
 * @param {Object} params.details - TikTok-specific settings
 * @returns {Promise<Object>} Publer API response with job_id
 */
async function createTikTokCarouselPost({ title, text, mediaIds, details }) {
  try {
    const response = await axios.post(
      `${PUBLER_API_BASE}/posts/schedule/publish`,
      {
        bulk: {
          state: 'scheduled',
          url: "publish",
          posts: [
            {
              accounts: [
                {
                  id: TIKTOK_ACCOUNT_ID,
                },
              ],
              networks: {
                tiktok: {
                  type: 'photo',
                  title,
                  text,
                  media: mediaIds.map(id => ({
                    id: id,
                    caption: "Picha za pochi kali kutoka Kleva Pochi Kali Kariakoo!"
                  })),
                  details: {
                    "auto_add_music": true,
                    ...details,
                  },
                },
              },
            },
          ],
        },
      },
      {
        headers: {
          'Authorization': `Bearer-API ${PUBLER_API_KEY}`,
          'Publer-Workspace-Id': PUBLER_WORKSPACE_ID,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`✅ TikTok carousel post created: ${response.data.job_id}`);
    return response.data;

  } catch (error) {
    console.error('❌ Failed to create TikTok carousel post:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Check Publer API connection and account status
 * @returns {Promise<Object>} Account information
 */
async function checkConnection() {
  try {
    const response = await axios.get(`${PUBLER_API_BASE}/account`, {
      headers: {
        'Authorization': `Bearer-API ${PUBLER_API_KEY}`,
        'Publer-Workspace-Id': PUBLER_WORKSPACE_ID,
      },
    });

    console.log('✅ Publer API connection successful');
    return response.data;

  } catch (error) {
    console.error('❌ Publer API connection failed:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  uploadMediaFromUrl,
  waitForMediaUpload,
  createTikTokVideoPost,
  createTikTokCarouselPost,
  checkConnection
};
