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
  'https://res.cloudinary.com/dd7i14c28/image/upload/c_auto,g_auto,h_1350,w_1080/c_auto,g_auto,h_1350,w_1080/f_auto/q_auto/b_rgb:FFFFFF,co_rgb:000000,l_text:Montserrat_50_bold_center:Brand%2520name%2520goes%2520here/fl_layer_apply,fl_no_overflow,g_north,x_-16,y_128/b_rgb:ffffff,co_rgb:000000,l_text:Montserrat_45_left:TSH%253A%252050%252C000/fl_layer_apply,fl_no_overflow,g_center,x_-238,y_-405/b_rgb:FFFFFFB3,co_rgb:000000,l_text:Montserrat_40_left:Tizama%2520picha%2520zaidi/fl_layer_apply,fl_no_overflow,g_center,x_-2,y_582/l_Untitled_-_01_June_2026_at_14.47.07_1_vdi2ev/c_scale,fl_relative,w_0.06/fl_layer_apply,fl_no_overflow,g_center,x_-422,y_-402/WhatsApp_Image_2026-05-30_at_14.50.40_eppxr5.jpg',
  'https://res.cloudinary.com/dd7i14c28/image/upload/c_auto,g_auto,h_1350,w_1080/c_auto,g_auto,h_1350,w_1080/f_auto/q_auto/b_rgb:ffffff,co_rgb:000000,l_text:Montserrat_45_left:Sifa%2520ya%2520tatu%2520ya%2520pochi/fl_layer_apply,fl_no_overflow,g_center,x_-162,y_-254/b_rgb:ffffff,co_rgb:000000,l_text:Montserrat_45_left:Sifa%2520ya%2520pili%2520ya%2520pochi/fl_layer_apply,fl_no_overflow,g_center,x_-171,y_-330/b_rgb:ffffff,co_rgb:000000,l_text:Montserrat_45_left:Sifa%2520ya%2520kwanza%2520ya%2520pochi/fl_layer_apply,fl_no_overflow,g_center,x_-120,y_-404/WhatsApp_Image_2026-05-30_at_14.50.40_eppxr5.jpg',
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
  downloadImageFromUrl,
  transformAndDownloadImage,
};
