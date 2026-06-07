/**
 * Cloudinary Client Service
 * Handles Cloudinary SDK initialization and image transformation operations
 */

const cloudinary = require('cloudinary').v2;
const axios = require('axios');

// Initialize Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a single image to Cloudinary
 * @param {Buffer} buffer - Image file buffer
 * @param {string} filename - Filename for the upload
 * @returns {Promise<Object>} Cloudinary response with public_id, secure_url, etc.
 */
async function uploadImageToCloudinary(buffer, filename) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        public_id: filename.replace(/\.[^/.]+$/, ''), // Remove extension for public_id
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          console.error(`❌ Failed to upload to Cloudinary: ${filename}`, error);
          reject(error);
        } else {
          console.log(`✅ Uploaded to Cloudinary: ${filename} (ID: ${result.public_id})`);
          resolve(result);
        }
      }
    );

    uploadStream.end(buffer);
  });
}

const TRANSFORM_URL_TEMPLATES = [
  'https://res.cloudinary.com/dd7i14c28/image/upload/c_auto,g_auto,h_1350,w_1080/c_auto,g_auto,h_1350,w_1080/f_auto/q_auto/b_rgb:ffffff,co_rgb:000000,l_text:Montserrat_60_bold_center:Brand%2520name%2520goes%2520here/fl_layer_apply,fl_no_overflow,g_north,x_-16,y_128/b_rgb:ffffff,co_rgb:000000,l_text:Montserrat_50_left:TSH%253A%252050%252C000/fl_layer_apply,fl_no_overflow,g_west,x_160,y_-400/b_rgb:ffffff,co_rgb:000000,l_text:Montserrat_40_center:Tizama%2520picha%2520zaidi/fl_layer_apply,fl_no_overflow,g_south,y_80/l_Untitled_-_01_June_2026_at_14.47.07_1_vdi2ev/c_scale,fl_relative,w_0.06/fl_layer_apply,fl_no_overflow,g_center,x_-422,y_-400/WhatsApp_Image_2026-05-30_at_14.50.40_eppxr5.jpg',
  'https://res.cloudinary.com/dd7i14c28/image/upload/c_auto,g_auto,h_1350,w_1080/c_auto,g_auto,h_1350,w_1080/f_auto/q_auto/b_rgb:ffffff,co_rgb:000000,l_text:Montserrat_50_left:1.%2520Pochi%2520kali%2520na%2520classic%2520sana/fl_layer_apply,fl_no_overflow,g_west,x_139,y_-240/b_rgb:ffffff,co_rgb:000000,l_text:Montserrat_50_left:2.%2520Pochi%2520nzuri%2520na%2520ya%2520kuvutia/fl_layer_apply,fl_no_overflow,g_west,x_139,y_-320/b_rgb:ffffff,co_rgb:000000,l_text:Montserrat_50_left:3.%2520Pochi%2520kali%2520kwa%2520wadada%2520wote/fl_layer_apply,fl_no_overflow,g_west,x_139,y_-400/WhatsApp_Image_2026-05-30_at_14.50.40_eppxr5.jpg',
  'https://res.cloudinary.com/dd7i14c28/image/upload/c_auto,g_auto,h_1350,w_1080/c_auto,g_auto,h_1350,w_1080/f_auto/q_auto/WhatsApp_Image_2026-05-30_at_14.50.40_eppxr5.jpg',
];

/**
 * Build a transformed Cloudinary URL from the provided template.
 * @param {string} publicFileName - File name with extension for the uploaded image
 * @param {number} index - Index of the image template to use (0 or 1)
 * @returns {string} Transformed Cloudinary URL
 */
function buildTemplateUrl(publicFileName, index = 0) {
  const template = TRANSFORM_URL_TEMPLATES[index] || TRANSFORM_URL_TEMPLATES[0];
  const encodedFileName = encodeURIComponent(publicFileName).replace(/%2F/g, '/');
  return template.replace(/[^/]+$/, encodedFileName);
}

/**
 * The text overlays in TRANSFORM_URL_TEMPLATES are *double* URL-encoded (a space
 * is %2520, ":" is %253A, "," is %252C) because Cloudinary first decodes the URL
 * and then decodes the l_text payload. Re-encode caption text the same way so it
 * can be substituted directly into the template.
 * @param {string} text
 * @returns {string}
 */
function doubleEncode(text) {
  return encodeURIComponent(encodeURIComponent(text));
}

// Encoded placeholder strings present in each template, mapped to caption fields.
const TEMPLATE_PLACEHOLDERS = [
  {
    // index 0
    brand: 'Brand%2520name%2520goes%2520here',
    price: 'TSH%253A%252050%252C000',
  },
  {
    // index 1 — numbered bullet list keyed by on-image position (g_west: more negative y = higher)
    bullet0: '1.%2520Pochi%2520kali%2520na%2520classic%2520sana', // bottom (y_-240)
    bullet1: '2.%2520Pochi%2520nzuri%2520na%2520ya%2520kuvutia',   // middle (y_-320)
    bullet2: '3.%2520Pochi%2520kali%2520kwa%2520wadada%2520wote',   // top (y_-400)
  },
  {
    // index 2+ — no text overlays, pure transformation
  },
];

/**
 * Build a transformed Cloudinary URL with caption text substituted into the
 * template's placeholder overlays. Missing caption fields keep the template
 * default. The uploaded image filename is swapped in via buildTemplateUrl.
 * For index 2+, only the image filename is substituted (no text overlays).
 * @param {string} publicFileName - File name with extension for the uploaded image
 * @param {number} index - Template index (0 = brand/price, 1 = bullet features, 2+ = pure transformation)
 * @param {{brand?: string, priceText?: string, bullets?: string[]}} caption
 * @returns {string} Transformed Cloudinary URL
 */
function buildDynamicTemplateUrl(publicFileName, index = 0, caption = {}) {
  let url = buildTemplateUrl(publicFileName, index);
  const placeholders = TEMPLATE_PLACEHOLDERS[index] || {};
  const replacements = {};

  if (index === 0) {
    if (caption.brand) {
      replacements[placeholders.brand] = doubleEncode(caption.brand);
    }
    if (caption.priceText) {
      replacements[placeholders.price] = doubleEncode(caption.priceText);
    }
  } else if (index === 1) {
    const bullets = caption.bullets || [];
    // Template slots are bottom-to-top (y_-240, y_-320, y_-400); map 1→top … 3→bottom.
    const bulletSlots = [placeholders.bullet2, placeholders.bullet1, placeholders.bullet0];
    bullets.slice(0, 3).forEach((text, i) => {
      if (text && bulletSlots[i]) {
        replacements[bulletSlots[i]] = doubleEncode(text);
      }
    });
  }
  // index 2+ has no placeholders, just return the url with swapped image filename

  for (const [from, to] of Object.entries(replacements)) {
    url = url.replace(from, to);
  }

  return url;
}

/**
 * Build a transformed Cloudinary URL with custom transformations
 * @param {string} publicId - Cloudinary public_id
 * @param {Object} transformations - Transformation parameters (e.g., { width: 1200, height: 1200, crop: 'limit', quality: 'auto' })
 * @returns {string} Transformed Cloudinary URL
 */
function buildTransformedUrl(publicId, transformations = {}) {
  // Default transformations if none provided
  const defaults = {
    width: 1200,
    height: 1200,
    crop: 'limit',
    quality: 'auto',
  };

  const finalTransformations = { ...defaults, ...transformations };

  // Build transformation string from parameters
  const transformString = Object.entries(finalTransformations)
    .map(([key, value]) => `${key}_${value}`)
    .join(',');

  const baseUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`;
  const url = `${baseUrl}/${transformString}/${publicId}`;

  return url;
}

/**
 * Download image from URL and return as buffer
 * @param {string} url - Image URL
 * @returns {Promise<Buffer>} Image buffer
 */
async function downloadImageFromUrl(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
    });
    console.log(`✅ Downloaded transformed image from: ${url}`);
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`❌ Failed to download image from URL: ${url}`, error.message);
    throw error;
  }
}

/**
 * Transform image on Cloudinary and download the transformed version
 * @param {string} publicId - Cloudinary public_id
 * @param {Object} transformations - Transformation parameters
 * @returns {Promise<Buffer>} Transformed image buffer
 */
async function transformAndDownloadImage(publicFileName, templateIndex = 0) {
  try {
    const transformedUrl = buildTemplateUrl(publicFileName, templateIndex);
    console.log(`🔄 Transforming image with URL: ${transformedUrl}`);
    const imageBuffer = await downloadImageFromUrl(transformedUrl);
    return imageBuffer;
  } catch (error) {
    console.error(`❌ Failed to transform and download image: ${publicFileName}`, error.message);
    throw error;
  }
}

module.exports = {
  uploadImageToCloudinary,
  buildTransformedUrl,
  buildTemplateUrl,
  buildDynamicTemplateUrl,
  downloadImageFromUrl,
  transformAndDownloadImage,
};
