/**
 * Text Parser
 * Extracts prices, brands, and bag types from WhatsApp messages
 */

// Tanzanian price patterns
const PRICE_PATTERNS = [
  /(\d+(?:[,\s]\d{3})*)\s*(?:\/=|TZS|tsh|shilling)/gi, // "45,000/=" or "45,000 TZS"
  /TZS\s*(\d+(?:[,\s]\d{3})*)/gi, // "TZS 45,000"
  /(\d+)k\s*(?:\/=)?/gi // "45k"
];

// Brand dictionary (Tanzania-focused)
const BRANDS = {
  'mk': 'Michael Kors',
  'michaelkors': 'Michael Kors',
  'gucci': 'Gucci',
  'prada': 'Prada',
  'lv': 'Louis Vuitton',
  'louizvuitton': 'Louis Vuitton',
  'coach': 'Coach',
  'dior': 'Dior',
  'hermes': 'Hermès',
  'chanel': 'Chanel',
  'burberry': 'Burberry',
  'fendi': 'Fendi',
  'celine': 'Celine',
  'bottega': 'Bottega Veneta',
  'valentino': 'Valentino',
  'versace': 'Versace',
  'armani': 'Armani',
  'dolce': 'Dolce & Gabbana',
  'tory': 'Tory Burch',
  'kate': 'Kate Spade',
  'guess': 'Guess',
  'fossil': 'Fossil',
  'diesel': 'Diesel',
  'calvin': 'Calvin Klein',
  'tommy': 'Tommy Hilfiger',
  'ralph': 'Ralph Lauren',
  'polo': 'Polo Ralph Lauren',
  'designer': 'Designer',
  'premium': 'Premium',
  'luxury': 'Luxury'
};

// Bag type dictionary
const BAG_TYPES = {
  'tote': 'Tote',
  'crossbody': 'Crossbody',
  'sling': 'Sling',
  'shoulder': 'Shoulder',
  'handbag': 'Handbag',
  'backpack': 'Backpack',
  'clutch': 'Clutch',
  'hobo': 'Hobo',
  'satchel': 'Satchel',
  'bucket': 'Bucket',
  'duffel': 'Duffel',
  'bowling': 'Bowling',
  'baguette': 'Baguette',
  'trapeze': 'Trapeze',
  'woven': 'Woven',
  'structured': 'Structured',
  'soft': 'Soft',
  'leather': 'Leather',
  'canvas': 'Canvas',
  'suede': 'Suede'
};

/**
 * Extract price from text
 */
function extractPrice(text) {
  if (!text) return null;

  for (const pattern of PRICE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      let priceStr = match[1] || match[0];
      priceStr = priceStr.replace(/[,\s]/g, ''); // Remove commas and spaces

      if (priceStr.endsWith('k')) {
        return parseInt(priceStr) * 1000;
      }

      return parseInt(priceStr);
    }
  }

  return null;
}

/**
 * Extract brand from text
 */
function extractBrand(text) {
  if (!text) return null;

  const lowerText = text.toLowerCase();

  for (const [key, brand] of Object.entries(BRANDS)) {
    if (lowerText.includes(key)) {
      return brand;
    }
  }

  return null;
}

/**
 * Extract bag type from text
 */
function extractBagType(text) {
  if (!text) return null;

  const lowerText = text.toLowerCase();

  for (const [key, type] of Object.entries(BAG_TYPES)) {
    if (lowerText.includes(key)) {
      return type;
    }
  }

  return null;
}

/**
 * Parse all metadata from caption
 */
function parseCaption(caption) {
  if (!caption) return {};

  return {
    price: extractPrice(caption),
    brand: extractBrand(caption),
    bagType: extractBagType(caption),
    currency: 'TZS'
  };
}

module.exports = { extractPrice, extractBrand, extractBagType, parseCaption };
