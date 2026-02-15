/**
 * Video Processor Utility
 * Handles video processing operations like muting audio
 */

const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Mute video by removing audio track
 * @param {string} base64Data - Base64 encoded video data
 * @param {string} mimetype - Video MIME type
 * @returns {Promise<string>} Base64 encoded muted video
 */
async function muteVideo(base64Data, mimetype) {
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `input_${Date.now()}.mp4`);
  const outputPath = path.join(tempDir, `output_${Date.now()}.mp4`);

  try {
    // Convert base64 to buffer and write to temp file
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(inputPath, buffer);

    // Process video with ffmpeg to remove audio
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noAudio() // Remove audio track
        .videoCodec('copy') // Copy video without re-encoding (faster)
        .output(outputPath)
        .on('end', () => {
          console.log('✅ Video muted successfully');
          resolve();
        })
        .on('error', (err) => {
          console.error('❌ Error muting video:', err.message);
          reject(err);
        })
        .run();
    });

    // Read muted video and convert back to base64
    const mutedBuffer = await fs.readFile(outputPath);
    const mutedBase64 = mutedBuffer.toString('base64');

    // Clean up temp files
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});

    return mutedBase64;

  } catch (error) {
    // Clean up temp files on error
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});

    console.error('❌ Failed to mute video:', error.message);
    throw error;
  }
}

/**
 * Process videos by muting them
 * @param {Array} videos - Array of video objects with data and mimetype
 * @returns {Promise<Array>} Array of videos with muted data
 */
async function processVideos(videos) {
  if (videos.length === 0) {
    return [];
  }

  console.log(`🔇 Muting ${videos.length} video(s)...`);

  const mutePromises = videos.map(async (video, index) => {
    try {
      const mutedData = await muteVideo(video.data, video.mimetype);
      console.log(`✅ Video ${index + 1}/${videos.length} muted`);
      return {
        ...video,
        data: mutedData,
        muted: true
      };
    } catch (error) {
      console.error(`❌ Failed to mute video ${index + 1}:`, error.message);
      // Return original video if muting fails
      return {
        ...video,
        muted: false,
        muteError: error.message
      };
    }
  });

  const processedVideos = await Promise.all(mutePromises);
  const successCount = processedVideos.filter(v => v.muted).length;
  console.log(`✅ Muted ${successCount}/${videos.length} video(s)`);

  return processedVideos;
}

module.exports = {
  muteVideo,
  processVideos
};
