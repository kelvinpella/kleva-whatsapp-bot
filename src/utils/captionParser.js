/**
 * Caption Parser
 *
 * Sellers post product photos first (an album), then a separate text-only
 * message containing the marketing copy that gets overlaid on the first two
 * images. This module parses that caption message.
 *
 * ===========================================================================
 * REAL FORMAT
 * ===========================================================================
 *
 *   ... (emoji header, price block, details) ...
 *
 *   💰 Price:
 *   🇹🇿 TZS: 62,000  🇺🇸 USD: 23  🇿🇲 ZMW: 446  🇲🇼 MWK: 93,000
 *
 *   Social Media:
 *   ["Pochi isiyopendwa vijijini", "Pochi haina mng'ao", "Pochi nzuri sana", "Pochi iliyo ya kipekee"]
 *
 * Mapping into the Cloudinary templates:
 * - "Social Media:" followed by a JSON array of strings is the caption indicator.
 * - array[0]            -> brand slot on image 0 ("Brand name goes here")
 * - TZS amount          -> price slot on image 0 ("TSH: 50,000")
 * - array[1..3]         -> numbered bullets on image 1 ("1. ...", "2. ...", "3. ...")
 * - "Tizama picha zaidi" on image 0 stays static (not replaced).
 */

const CAPTION_MARKER = /social\s*media\s*:/i;
const ARRAY_AFTER_MARKER = /social\s*media\s*:\s*(\[[\s\S]*?\])/i;
const QUOTED_STRING = /"([^"]*)"/g;
const TZS_PRICE = /TZS\s*[:\-]?\s*([\d.,]+)/i;

// WhatsApp / mobile keyboards often replace straight quotes with "smart" curly
// quotes, which breaks JSON.parse. Normalize the double-quote variants used as
// array string delimiters back to straight double quotes.
function normalizeQuotes(str) {
  return str.replace(/[“”„‟″]/g, '"');
}

/**
 * Whether a text message looks like a product caption.
 * @param {string} text
 * @returns {boolean}
 */
function isCaptionMessage(text) {
  return typeof text === 'string' && CAPTION_MARKER.test(text) && ARRAY_AFTER_MARKER.test(text);
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
  return `TSH: ${number.toLocaleString('en-US')}`;
}

/**
 * Extract the array of strings that follows the "Social Media:" marker.
 * Prefers JSON.parse, falls back to pulling out all double-quoted substrings.
 * @param {string} text
 * @returns {string[]}
 */
function extractSocialMediaArray(text) {
  const match = text.match(ARRAY_AFTER_MARKER);
  if (!match) {
    return [];
  }

  const literal = normalizeQuotes(match[1]);
  try {
    const parsed = JSON.parse(literal);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch (err) {
    // Fall through to the regex-based extraction below.
  }

  // Fallback: pull out every straight double-quoted substring. [^"]* tolerates
  // apostrophes and commas inside a value (e.g. "Pochi haina mng'ao").
  const items = [];
  let quoted;
  QUOTED_STRING.lastIndex = 0;
  while ((quoted = QUOTED_STRING.exec(literal)) !== null) {
    const value = quoted[1].trim();
    if (value) {
      items.push(value);
    }
  }
  return items;
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

  const items = extractSocialMediaArray(text);
  const [brand, ...rest] = items;

  // The remaining strings become a numbered list on the second image.
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
