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
                    id, type: "video",
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
                    id: id, type: "photo",
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
 * Poll TikTok post job status until completion
 * @param {string} jobId - Job ID from TikTok post creation
 * @param {Object} options - Polling options
 * @param {number} options.pollInterval - Interval between polls in ms (default: 10000)
 * @param {number} options.maxWaitMs - Maximum wait time in ms (default: 300000)
 * @returns {Promise<Object>} Job result { success: boolean, failures: Object }
 */
async function pollPostJobStatus(jobId, { pollInterval = 10000, maxWaitMs = 300000 } = {}) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
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

      // Check if job is complete
      if (response.data.status === 'complete') {
        const failures = response.data.payload?.failures || {};

        // Determine success based on failures object
        if (Object.keys(failures).length === 0 || (Array.isArray(failures) && failures.length === 0)) {
          console.log(`✅ TikTok post job ${jobId} completed successfully`);
          return {
            success: true,
            failures: {},
            payload: response.data.payload
          };
        } else {
          console.error(`❌ TikTok post job ${jobId} failed:`, failures);
          return {
            success: false,
            failures,
            payload: response.data.payload
          };
        }
      }

      // Job still processing, wait before next poll
      console.log(`⏳ TikTok post job ${jobId} still processing... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (error) {
      console.error(`❌ Error polling job status for ${jobId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  // Timeout reached
  throw new Error(`Post job ${jobId} polling timed out after ${maxWaitMs}ms`);
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
  createTikTokVideoPost,
  createTikTokCarouselPost,
  pollPostJobStatus,
  checkConnection
};
