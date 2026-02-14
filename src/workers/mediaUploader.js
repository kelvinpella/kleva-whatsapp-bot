/**
 * Media Uploader Utility
 * Handles uploading media files to Supabase Storage
 */

const { processVideos } = require('./videoProcessor');

/**
 * Upload media files to Supabase Storage and get public URLs
 * @param {Object} params - Upload parameters
 * @param {Object} params.db - Database handler with Supabase client
 * @param {Array} params.videos - Array of video objects with mimetype and data
 * @param {Array} params.images - Array of image objects with mimetype and data
 * @param {string} params.groupId - WhatsApp group ID
 * @param {number} params.timestamp - Message timestamp
 * @returns {Promise<Object>} Object with uploadedVideos and uploadedImages arrays
 */
async function uploadMediaToStorage({ db, videos, images, groupId, timestamp }) {
  console.log(`📤 Uploading ${videos.length} videos and ${images.length} images to Supabase Storage...`);

  // Mute videos before uploading
  const mutedVideos = await processVideos(videos);

  const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const uploadPromises = [];

  // Upload muted videos
  mutedVideos.forEach((video, index) => {
    const extension = getFileExtension(video.mimetype);
    const filename = `pochi_kali_video_${timestamp}_${index}.${extension}`;
    const path = `videos/${currentDate}/${groupId}/${filename}`;

    uploadPromises.push(
      uploadToSupabase(db, video.data, path, video.mimetype)
        .then(url => ({ ...video, url, path }))
        .catch(err => {
          console.error(`❌ Failed to upload video ${index}:`, err.message);
          return { ...video, url: null, path, error: err.message };
        })
    );
  });

  // Upload images
  images.forEach((image, index) => {
    const extension = getFileExtension(image.mimetype);
    const filename = `pochi_kali_image_${timestamp}_${index}.${extension}`;
    const path = `images/${currentDate}/${groupId}/${filename}`;

    uploadPromises.push(
      uploadToSupabase(db, image.data, path, image.mimetype)
        .then(url => ({ ...image, url, path }))
        .catch(err => {
          console.error(`❌ Failed to upload image ${index}:`, err.message);
          return { ...image, url: null, path, error: err.message };
        })
    );
  });

  // Wait for all uploads to complete
  const uploadedMedia = await Promise.all(uploadPromises);

  // Separate videos and images from uploaded media
  const uploadedVideos = uploadedMedia.slice(0, videos.length);
  const uploadedImages = uploadedMedia.slice(videos.length);

  console.log(`✅ Uploaded ${uploadedVideos.length} videos and ${uploadedImages.length} images`);

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

/**
 * Upload media to Supabase Storage
 * @param {Object} db - Database handler with Supabase client
 * @param {string} base64Data - Base64 encoded media data
 * @param {string} path - Storage path (e.g., 'videos/2024-02-14/groupId/video.mp4')
 * @param {string} mimetype - MIME type for content-type header
 * @returns {Promise<string>} Public URL of uploaded file
 */
async function uploadToSupabase(db, base64Data, path, mimetype) {
  try {
    // Convert base64 to Buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Upload to Supabase Storage bucket 'handbags'
    const { error } = await db.supabase.storage
      .from('handbags')
      .upload(path, buffer, {
        contentType: mimetype,
        upsert: false, // Don't overwrite existing files
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: publicUrlData } = db.supabase.storage
      .from('handbags')
      .getPublicUrl(path);

    console.log(`✅ Uploaded: ${path}`);
    return publicUrlData.publicUrl;

  } catch (error) {
    console.error(`❌ Upload failed for ${path}:`, error.message);
    throw error;
  }
}

module.exports = {
  uploadMediaToStorage,
  getFileExtension,
  uploadToSupabase
};
