/**
 * Product Name Parser
 *
 * Sellers post product photos first (an album), then a separate text-only
 * message containing the product name and price. This module parses that
 * message.
 *
 * Format:
 *   Product: Product Name
 *   🇹🇿 TZS: 62,000
 *
 * The extracted product name is passed to the Fal AI workflow to generate
 * titles, descriptions, and on-screen text for the carousel. The extracted
 * price is overlaid on the first carousel image.
 */

// Captures everything after "Product:" up to the end of that line.
const PRODUCT_LINE = /product\s*:\s*(.+)/i;
const TZS_PRICE = /TZS\s*[:\-]?\s*([\d.,]+)/i;

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
 * Whether a text message looks like a product message.
 * @param {string} text
 * @returns {boolean}
 */
function isProductMessage(text) {
  return typeof text === 'string' && PRODUCT_LINE.test(text);
}

/**
 * Extract the product name and price from a product message.
 * @param {string} text
 * @returns {{product_name: string|null, priceText: string|null}|null}
 */
function parseProductMessage(text) {
  if (!isProductMessage(text)) {
    return null;
  }

  const match = text.match(PRODUCT_LINE);
  const product_name = match[1].trim() || null;

  const priceMatch = text.match(TZS_PRICE);
  const priceText = priceMatch ? formatPrice(priceMatch[1]) : null;

  if (!product_name && !priceText) {
    return null;
  }

  return {
    product_name,
    priceText,
  };
}

module.exports = { parseProductMessage, isProductMessage };
