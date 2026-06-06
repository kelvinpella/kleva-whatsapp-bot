/**
 * Pending Albums Store (Redis-backed)
 *
 * Album media arrives before its caption, so uploaded Cloudinary image refs are
 * parked here until a caption message for the same group arrives. Each record
 * holds the ordered images (publicFileName + originalUrl) plus album metadata.
 *
 * Layout:
 * - pendingAlbum:<groupId>:<timestamp>  -> JSON record (string, with TTL)
 * - pendingAlbumIndex:<groupId>         -> sorted set, score=timestamp, member=record key
 *
 * Records are matched to captions newest-first within a group and consumed
 * (deleted) on assignment.
 */

const PENDING_TTL_SECONDS = 24 * 3600;

function albumKey(groupId, timestamp) {
  return `pendingAlbum:${groupId}:${timestamp}`;
}

function indexKey(groupId) {
  return `pendingAlbumIndex:${groupId}`;
}

/**
 * Persist an uncaptioned album.
 * @param {import('ioredis').Redis} redis
 * @param {Object} record - { groupId, groupName, author, timestamp, messageBody, images }
 * @returns {Promise<string>} the record key
 */
async function savePendingAlbum(redis, record) {
  const { groupId, timestamp } = record;
  const key = albumKey(groupId, timestamp);
  const idx = indexKey(groupId);

  await redis
    .multi()
    .set(key, JSON.stringify(record), 'EX', PENDING_TTL_SECONDS)
    .zadd(idx, timestamp, key)
    .expire(idx, PENDING_TTL_SECONDS)
    .exec();

  return key;
}

/**
 * Pop the most recent uncaptioned album for a group (deletes it).
 * Skips and cleans up index entries whose records have already expired.
 * @param {import('ioredis').Redis} redis
 * @param {string} groupId
 * @returns {Promise<Object|null>} the album record, or null if none
 */
async function consumeLatestPendingAlbum(redis, groupId) {
  const idx = indexKey(groupId);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [key] = await redis.zrevrange(idx, 0, 0);
    if (!key) {
      return null;
    }

    const raw = await redis.get(key);
    if (!raw) {
      // Record TTL'd out; drop the stale index entry and keep looking.
      await redis.zrem(idx, key);
      continue;
    }

    await redis.multi().zrem(idx, key).del(key).exec();

    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error(`⚠️ Failed to parse pending album ${key}:`, err.message);
      return null;
    }
  }
}

module.exports = { savePendingAlbum, consumeLatestPendingAlbum };
