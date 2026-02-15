/**
 * Media Uploader Utility
 * Handles uploading media files directly to Publer
 */

const axios = require('axios');
const FormData = require('form-data');

const PUBLER_API_BASE = 'https://app.publer.com/api/v1';
const PUBLER_API_KEY = process.env.PUBLER_API_KEY;
const PUBLER_WORKSPACE_ID = process.env.PUBLER_WORKSPACE_ID;

/**
 * Upload single media file to Publer
 * @param {Buffer} buffer - Media file buffer
 * @param {string} filename - Filename with extension
 * @param {string} mimetype - MIME type
 * @returns {Promise<Object>} Media object with id, path, etc.
 */
async function uploadSingleMedia(buffer, filename, mimetype) {
  try {
    const formData = new FormData();
    formData.append('file', buffer, {
      filename: filename,
      contentType: mimetype,
    });
    formData.append('direct_upload', 'false');
    formData.append('in_library', 'true');

    const response = await axios.post(
      `${PUBLER_API_BASE}/media`,
      formData,
      {
        headers: {
          'Authorization': `Bearer-API ${PUBLER_API_KEY}`,
          'Publer-Workspace-Id': PUBLER_WORKSPACE_ID,
          ...formData.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    console.log(`✅ Uploaded to Publer: ${filename} (ID: ${response.data.id})`);
    return response.data;

  } catch (error) {
    console.error(`❌ Failed to upload ${filename}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Upload media files directly to Publer and get media IDs
 * @param {Object} params - Upload parameters
 * @param {Array} params.videos - Array of video objects with mimetype and data
 * @param {Array} params.images - Array of image objects with mimetype and data
 * @param {number} params.timestamp - Message timestamp
 * @returns {Promise<Object>} Object with uploadedVideos and uploadedImages arrays containing Publer media IDs
 */
async function uploadMediaToPubler({ videos, images, timestamp }) {
  console.log(`📤 Uploading ${videos.length} videos and ${images.length} images to Publer...`);

  const uploadPromises = [];

  // Upload videos
  videos.forEach((video, index) => {
    const extension = getFileExtension(video.mimetype);
    const filename = `pochi_kali_video_${timestamp}_${index}.${extension}`;
    const buffer = Buffer.from(video.data, 'base64');

    uploadPromises.push(
      uploadSingleMedia(buffer, filename, video.mimetype)
        .then(publerMedia => ({
          ...video,
          publerId: publerMedia.id,
          publerPath: publerMedia.path,
          publerThumbnail: publerMedia.thumbnail,
          type: publerMedia.type,
          width: publerMedia.width,
          height: publerMedia.height,
        }))
        .catch(err => {
          console.error(`❌ Failed to upload video ${index}:`, err.message);
          return {
            ...video,
            publerId: null,
            error: err.message
          };
        })
    );
  });

  // Upload images
  images.forEach((image, index) => {
    const extension = getFileExtension(image.mimetype);
    const filename = `pochi_kali_image_${timestamp}_${index}.${extension}`;
    const buffer = Buffer.from(image.data, 'base64');

    uploadPromises.push(
      uploadSingleMedia(buffer, filename, image.mimetype)
        .then(publerMedia => ({
          ...image,
          publerId: publerMedia.id,
          publerPath: publerMedia.path,
          publerThumbnail: publerMedia.thumbnail,
          type: publerMedia.type,
          width: publerMedia.width,
          height: publerMedia.height,
        }))
        .catch(err => {
          console.error(`❌ Failed to upload image ${index}:`, err.message);
          return {
            ...image,
            publerId: null,
            error: err.message
          };
        })
    );
  });

  // Wait for all uploads to complete
  const uploadedMedia = await Promise.all(uploadPromises);

  // Separate videos and images from uploaded media
  const uploadedVideos = uploadedMedia.slice(0, videos.length);
  const uploadedImages = uploadedMedia.slice(videos.length);

  console.log(`✅ Uploaded to Publer: ${uploadedVideos.length} videos, ${uploadedImages.length} images`);

  return {
    uploadedVideos,
    uploadedImages
  };
}

/**
 * Get file extension from mimetype
 * @param {string} mimetype - MIME type (e.g., 'image/jpeg', 'video/mp4')
 * @returns {string} File extension (e.g., 'jpg', 'mp4')
 */
function getFileExtension(mimetype) {
  const mimetypeMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/mpeg': 'mpeg',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  };

  return mimetypeMap[mimetype] || 'bin';
}

module.exports = {
  uploadMediaToPubler
};
