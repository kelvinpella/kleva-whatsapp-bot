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

const contentTemplates = require('../config/contentTemplates.json');

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


module.exports = {
  getRandomTemplate
};
