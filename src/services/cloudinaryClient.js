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
  'https://res.cloudinary.com/dd7i14c28/image/upload/c_auto,g_auto,h_1350,w_1080/c_auto,g_auto,h_1350,w_1080/f_auto/q_auto/b_rgb:ffffff,co_rgb:000000,l_text:Montserrat_50_left:Pochi%2520kali%2520na%2520classic%2520sana/fl_layer_apply,fl_no_overflow,g_west,x_139,y_-240/b_rgb:ffffff,co_rgb:000000,l_text:Montserrat_50_left:Pochi%2520nzuri%2520na%2520ya%2520kuvutia/fl_layer_apply,fl_no_overflow,g_west,x_139,y_-320/b_rgb:ffffff,co_rgb:000000,l_text:Montserrat_50_left:Pochi%2520kali%2520kwa%2520wadada%2520wote/fl_layer_apply,fl_no_overflow,g_west,x_139,y_-400/WhatsApp_Image_2026-05-30_at_14.50.40_eppxr5.jpg',
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
    // index 1 — bullets keyed by on-image position
    bullet0: 'Sifa%2520ya%2520kwanza%2520ya%2520pochi', // top
    bullet1: 'Sifa%2520ya%2520pili%2520ya%2520pochi',   // middle
    bullet2: 'Sifa%2520ya%2520tatu%2520ya%2520pochi',   // bottom
  },
];

/**
 * Build a transformed Cloudinary URL with caption text substituted into the
 * template's placeholder overlays. Missing caption fields keep the template
 * default. The uploaded image filename is swapped in via buildTemplateUrl.
 * @param {string} publicFileName - File name with extension for the uploaded image
 * @param {number} index - Template index (0 = brand/price, 1 = bullet features)
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
    if (bullets[0]) {
      replacements[placeholders.bullet0] = doubleEncode(bullets[0]);
    }
    if (bullets[1]) {
      replacements[placeholders.bullet1] = doubleEncode(bullets[1]);
    }
    if (bullets[2]) {
      replacements[placeholders.bullet2] = doubleEncode(bullets[2]);
    }
  }

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
