/**
 * Child Worker - TikTok Posting
 *
 * Handles individual TikTok post jobs:
 * - Posts videos and carousel slideshows to TikTok via tiktok-uploader
 * - Sends WhatsApp notification after successful post
 * - Waits 3 minutes after completion
 * - Cleans up temp video files after each attempt
 * - Returns result to parent flow
 */

const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getClient } = require('../core/whatsapp');
const { getRandomTemplate } = require('../services/tiktokPublisher');

const POST_DELAY_MS = 180000; // 3 minutes (180,000 ms)
const NOTIFICATION_NUMBER = process.env.NOTIFICATION_NUMBER;
const PROJECT_ROOT = path.join(__dirname, '../..');
const TIKTOK_COOKIES_PATH = process.env.TIKTOK_COOKIES_PATH
  ? path.resolve(PROJECT_ROOT, process.env.TIKTOK_COOKIES_PATH)
  : null; // resolved relative to project root; absolute paths also work
const PYTHON_BIN = path.join(__dirname, '../scripts/.venv/bin/python');
const PYTHON_SCRIPT = path.join(__dirname, '../scripts/upload_tiktok.py');

/**
 * Wait for specified milliseconds
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Limit hashtags in text to maximum of 4
 */
function limitHashtags(text) {
  const hashtagRegex = /#[\w]+/g;
  const hashtags = text.match(hashtagRegex) || [];

  if (hashtags.length <= 4) {
    return text;
  }

  const hashtagsToRemove = hashtags.slice(4);
  let modifiedText = text;
  hashtagsToRemove.forEach(tag => {
    modifiedText = modifiedText.replace(tag, '');
  });

  return modifiedText.replace(/\s+/g, ' ').trim();
}

/**
 * Generate supplier code hashtag
 */
function generateSupplierCode(groupName, timestamp) {
  const cleanName = groupName.replace(/[^a-zA-Z0-9]/g, '');
  const groupPrefix = cleanName.substring(0, 3).toUpperCase();
  const date = new Date(timestamp * 1000);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dateStr = `${day}${month}`;
  return `#${groupPrefix}HK${dateStr}`;
}

/**
 * Process description with hashtag rules
 */
function processDescription(description, groupName, timestamp) {
  let processed = limitHashtags(description);
  const supplierCode = generateSupplierCode(groupName, timestamp);
  processed = `${processed} ${supplierCode}`;
  return processed;
}

/**
 * Upload a video to TikTok via the Python tiktok-uploader script.
 * @param {string} videoPath - Absolute path to the video file
 * @param {string} description - Post caption/description
 * @returns {Promise<Object>} Result object { success: boolean, error?: string }
 */
async function uploadVideoToTikTok(videoPath, description) {
  if (!TIKTOK_COOKIES_PATH) {
    throw new Error('TIKTOK_COOKIES_PATH env var is not set');
  }

  return await new Promise((resolve, reject) => {
    const args = [
        PYTHON_SCRIPT,
        '--video', videoPath,
        '--description', description,
        '--cookies', TIKTOK_COOKIES_PATH,
      ];

      console.log(`🐍 [CHILD] Spawning Python upload script...`);
      const proc = spawn(PYTHON_BIN, args);

      let stdout = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        process.stderr.write(data); // stream Python logs to Node stderr in real time
      });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim());
            resolve(result);
          } catch {
            resolve({ success: true }); // treat as success if JSON parse fails but exit 0
          }
        } else {
          let errorMessage = `Python script exited with code ${code}`;
          try {
            const result = JSON.parse(stdout.trim());
            if (result.error) errorMessage = result.error;
          } catch { /* ignore */ }
          reject(new Error(errorMessage));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn Python process: ${err.message}`));
      });
    });
}

/**
 * Delete a temp file, ignoring errors
 * @param {string} filePath
 */
async function deleteTempFile(filePath) {
  try {
    await fs.promises.unlink(filePath);
    console.log(`🗑️ [CHILD] Deleted temp file: ${filePath}`);
  } catch {
    // Non-fatal — file may have already been removed
  }
}

/**
 * Send a WhatsApp notification to the configured number
 * @param {string} message
 */
async function sendNotification(message) {
  if (!NOTIFICATION_NUMBER) {
    console.log('⚠️ [CHILD] NOTIFICATION_NUMBER not set, skipping notification');
    return;
  }
  try {
    const whatsappClient = getClient();
    if (!whatsappClient) {
      console.log('⚠️ [CHILD] WhatsApp client not ready, skipping notification');
      return;
    }
    await whatsappClient.sendMessage(NOTIFICATION_NUMBER, message);
    console.log(`📲 [CHILD] Notification sent to ${NOTIFICATION_NUMBER}`);
  } catch (err) {
    console.error('⚠️ [CHILD] Failed to send WhatsApp notification:', err?.message || err);
  }
}

/**
 * Initialize the child worker for TikTok posting
 */
function initializeTikTokWorker() {
  const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker(
    'tiktokPosting',
    async (job) => {
      try {
        console.log(`\n🔄 [CHILD] Processing TikTok post job: ${job.name}`);
        const { type, media, groupName, timestamp, videoIndex } = job.data;

        let postResult;

        // Get template and process description
        const template = getRandomTemplate();
        const processedDescription = processDescription(template.description, groupName, timestamp);

        if (type === 'video') {
          console.log(`📹 [CHILD] Posting video ${videoIndex !== undefined ? videoIndex + 1 : ''}...`);
          console.log(`   File: ${media.filePath}`);
          console.log(`   Description: ${processedDescription.substring(0, 60)}...`);

          let uploadSuccess = false;

          await uploadVideoToTikTok(media.filePath, processedDescription);
          uploadSuccess = true;
          console.log(`✅ [CHILD] Video uploaded to TikTok successfully!`);

          // Notify via WhatsApp after successful post
          await sendNotification(
            `✅ TikTok video published! Go check it out.\n\nCaption: ${processedDescription.substring(0, 120)}...`
          );

          postResult = {
            success: uploadSuccess,
            type,
            processedDescription,
            videoIndex,
            filePath: media.filePath,
          };

        } else if (type === 'carousel') {
          // Carousel images were converted to a slideshow video by albumProcessingWorker
          console.log(`🖼️ [CHILD] Posting carousel slideshow video...`);
          console.log(`   File: ${media.filePath}`);
          console.log(`   Description: ${processedDescription.substring(0, 60)}...`);

          await uploadVideoToTikTok(media.filePath, processedDescription);
          console.log(`✅ [CHILD] Carousel slideshow uploaded to TikTok successfully!`);

          await sendNotification(
            `✅ TikTok carousel slideshow published!\n\nCaption: ${processedDescription.substring(0, 120)}...`
          );

          postResult = {
            success: true,
            type,
            processedDescription,
            filePath: media.filePath,
          };

        } else {
          throw new Error(`Unknown post type: ${type}`);
        }

        // Wait 3 minutes after post completion before next post can proceed
        console.log(`⏳ [CHILD] Waiting 3 minutes before next post can proceed...`);
        await delay(POST_DELAY_MS);
        console.log(`✅ [CHILD] 3-minute delay completed`);

        console.log(`✅ [CHILD] Job ${job.name} completed`);
        return postResult;

      } catch (error) {
        console.error(`❌ [CHILD] Error in TikTok posting job ${job.name}:`, error.message);
        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: 1, // Process one TikTok post at a time to respect rate limits
    }
  );

  // Event handlers
  worker.on('completed', (job, result) => {
    console.log(`✅ [CHILD] Job ${job.id} - Post ${result.success ? 'succeeded' : (result.skipped ? 'skipped' : 'failed')}`);
    // Clean up video temp file now that the job is fully done (after delay)
    if (result.filePath) {
      deleteTempFile(result.filePath);
    }
  });

  worker.on('failed', (job, err) => {
    const maxAttempts = job.opts?.attempts ?? 1;
    const isPermanent = job.attemptsMade >= maxAttempts;

    if (isPermanent) {
      console.error(`❌ [CHILD] Job ${job.id} permanently failed after ${job.attemptsMade} attempt(s): ${err.message}`);
      // Clean up video temp file only on permanent failure (no more retries)
      if (job?.data?.media?.filePath) {
        deleteTempFile(job.data.media.filePath);
      }
    } else {
      console.warn(`⚠️ [CHILD] Job ${job.id} attempt ${job.attemptsMade}/${maxAttempts} failed, will retry: ${err.message}`);
    }
  });

  worker.on('error', (err) => {
    console.error('❌ [CHILD] Worker error:', err.message);
  });

  console.log('🚀 TikTok Posting Worker (Child) started');

  return worker;
}

module.exports = { initializeTikTokWorker };
