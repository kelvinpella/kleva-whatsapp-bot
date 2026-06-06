/**
 * Caption Parser
 *
 * Sellers post product photos first (an album), then a separate text-only
 * message containing the marketing copy that gets overlaid on the first two
 * images. This module parses that caption message.
 *
 * ===========================================================================
 * FORMAT
 * ===========================================================================
 *
 *   ... (emoji header, price block, details) ...
 *
 *   💰 Price:
 *   🇹🇿 TZS: 62,000  🇺🇸 USD: 23  🇿🇲 ZMW: 446  🇲🇼 MWK: 93,000
 *
 *   Social Media: Pochi mpya toleo jipya, Pochi ya high quality, Pochi nzuri sana, Pochi ukubwa wa kati
 *
 * Mapping into the Cloudinary templates:
 * - "Social Media:" followed by comma-separated values is the caption indicator.
 * - value[0]     -> brand slot on image 0 ("Brand name goes here")
 * - TZS amount   -> price slot on image 0 ("TSH: 50,000")
 * - value[1..3]  -> numbered bullets on image 1 ("1. ...", "2. ...", "3. ...")
 * - "Tizama picha zaidi" on image 0 stays static (not replaced).
 */

// Captures everything after "Social Media:" up to the end of that line.
const SOCIAL_MEDIA_LINE = /social\s*media\s*:\s*(.+)/i;
const TZS_PRICE = /TZS\s*[:\-]?\s*([\d.,]+)/i;
const SURROUNDING_QUOTES = /^["'“”]+|["'“”]+$/g;

/**
 * Whether a text message looks like a product caption.
 * @param {string} text
 * @returns {boolean}
 */
function isCaptionMessage(text) {
  return typeof text === 'string' && SOCIAL_MEDIA_LINE.test(text);
}

/**
 * Normalize a raw price (e.g. "62,000", "62000", "62.000") to "TSH: 62,000".
 * @param {string} raw
 * @returns {string|null}
 */
function formatPrice(raw) {
  const number = parseInt(String(raw).replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }
  const retail = number + 5000;
  return `TSH: ${retail.toLocaleString('en-US')}`;
}

/**
 * Extract the comma-separated values that follow the "Social Media:" marker.
 * Tolerates optional surrounding brackets/quotes (e.g. a pasted array).
 * @param {string} text
 * @returns {string[]}
 */
function extractSocialMediaItems(text) {
  const match = text.match(SOCIAL_MEDIA_LINE);
  if (!match) {
    return [];
  }

  const raw = match[1].trim().replace(/^\[/, '').replace(/\]$/, '');

  return raw
    .split(',')
    .map((item) => item.trim().replace(SURROUNDING_QUOTES, '').trim())
    .filter(Boolean);
}

/**
 * Parse a caption message into overlay fields.
 * @param {string} text
 * @returns {{brand: string|null, bullets: string[], priceText: string|null}|null}
 */
function parseCaption(text) {
  if (!isCaptionMessage(text)) {
    return null;
  }

  const items = extractSocialMediaItems(text);
  const [brand, ...rest] = items;

  // The remaining values become a numbered list on the second image.
  const bullets = rest.slice(0, 3).map((value, i) => `${i + 1}. ${value}`);

  const priceMatch = text.match(TZS_PRICE);
  const priceText = priceMatch ? formatPrice(priceMatch[1]) : null;

  if (!brand && bullets.length === 0 && !priceText) {
    return null;
  }

  return {
    brand: brand || null,
    bullets,
    priceText,
  };
}

module.exports = { parseCaption, isCaptionMessage };
