/**
 * Content Template Service
 * Provides randomized title/description templates for social posts.
 *
 * The selected template's description is later processed by the posting worker
 * (hashtag limiting + supplier code) before being scheduled via Zernio.
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
