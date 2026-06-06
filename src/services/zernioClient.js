const { Zernio } = require('@zernio/node');

const ZERNIO_API_KEY = process.env.ZERNIO_API_KEY;
const ZERNIO_TIKTOK_ACCOUNT_ID = process.env.ZERNIO_TIKTOK_ACCOUNT_ID;
const ZERNIO_INSTAGRAM_ACCOUNT_ID = process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID;

if (!ZERNIO_API_KEY) {
    throw new Error('Missing ZERNIO_API_KEY environment variable for Zernio SDK');
}

const zernio = new Zernio({
    apiKey: ZERNIO_API_KEY
});

function parseScheduledAt(post) {
    const scheduleValue = post.scheduledFor;
    if (!scheduleValue) {
        return null;
    }

    const parsed = new Date(scheduleValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatTanzaniaIsoString(date) {
    const offsetMs = 3 * 60 * 60 * 1000;
    const tzDate = new Date(date.getTime() + offsetMs);
    const pad = (value) => String(value).padStart(2, '0');

    const year = tzDate.getUTCFullYear();
    const month = pad(tzDate.getUTCMonth() + 1);
    const day = pad(tzDate.getUTCDate());
    const hours = pad(tzDate.getUTCHours());
    const minutes = pad(tzDate.getUTCMinutes());
    const seconds = pad(tzDate.getUTCSeconds());

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+03:00`;
}

function getPlatformAccounts() {
    const accounts = [];
    if (ZERNIO_TIKTOK_ACCOUNT_ID) {
        accounts.push({ platform: 'tiktok', accountId: ZERNIO_TIKTOK_ACCOUNT_ID });
    }
    if (ZERNIO_INSTAGRAM_ACCOUNT_ID) {
        accounts.push({ platform: 'instagram', accountId: ZERNIO_INSTAGRAM_ACCOUNT_ID });
    }

    if (accounts.length === 0) {
        throw new Error('Missing ZERNIO_TIKTOK_ACCOUNT_ID or ZERNIO_INSTAGRAM_ACCOUNT_ID environment variables');
    }

    return accounts;
}

/**
 * Unwrap a @hey-api/client-fetch RequestResult ({ data, error, ... }).
 * The Zernio SDK does not throw on API errors by default, so we surface them here.
 */
function unwrap(result, action) {
    if (result?.error) {
        const detail = result.error?.error || result.error?.message || JSON.stringify(result.error);
        throw new Error(`Zernio ${action} failed: ${detail}`);
    }
    return result?.data ?? result;
}

// listPosts returns { posts, pagination } (see https://docs.zernio.com/posts/list-posts).
function extractPosts(payload) {
    return Array.isArray(payload?.posts) ? payload.posts : [];
}

async function getScheduledPosts({ accountId, limit = 100, status = 'scheduled' } = {}) {
    const accounts = [];
    if (accountId) {
        accounts.push(accountId);
    }
    if (!accounts.length) {
        if (ZERNIO_TIKTOK_ACCOUNT_ID) accounts.push(ZERNIO_TIKTOK_ACCOUNT_ID);
        if (ZERNIO_INSTAGRAM_ACCOUNT_ID) accounts.push(ZERNIO_INSTAGRAM_ACCOUNT_ID);
    }

    const query = {
        status,
        limit,
        page: 1,
        sortBy: 'scheduled-desc',
    };

    if (accounts.length === 1) {
        query.accountId = accounts[0];
    }

    const result = await zernio.posts.listPosts({ query });
    const payload = unwrap(result, 'listPosts');

    // Keep the documented post keys (_id, scheduledFor, status, ...) and add a parsed
    // scheduledAt Date derived from scheduledFor for internal sorting/scheduling math.
    return extractPosts(payload).map((post) => ({
        ...post,
        scheduledAt: parseScheduledAt(post),
    }));
}

async function getLatestScheduledPost(options = {}) {
    const posts = await getScheduledPosts({ ...options, status: 'scheduled', limit: 100 });
    const pendingPosts = posts
        .filter(post => post.scheduledAt)
        .sort((a, b) => b.scheduledAt - a.scheduledAt);

    return pendingPosts.length > 0 ? pendingPosts[0] : null;
}

async function scheduleSocialPost({
    title,
    description,
    mediaUrls,
    scheduledAt,
    timezone = 'Africa/Dar_es_Salaam',
    type = 'carousel',
    sourceMetadata = {},
} = {}) {
    if (!title || !description || !Array.isArray(mediaUrls) || mediaUrls.length === 0) {
        throw new Error('Invalid Zernio schedule request: title, description, and mediaUrls are required');
    }

    // currently handles carousel for tiktok & IG. Provide customization for videos in the future
    const tiktokTitle = (title || '').slice(0, 90);
    const platforms = getPlatformAccounts().map((account) =>
        account.platform === 'instagram'
            ? { ...account, customContent: description }
            : account
    );
    const content = tiktokTitle;
    const mediaItems = [];

    mediaUrls.forEach((url) => {
        mediaItems.push({ url, type: 'image' });
    });


    const result = await zernio.posts.createPost({
        body: {
            title,
            content,
            scheduledFor: formatTanzaniaIsoString(scheduledAt),
            timezone,
            platforms,
            mediaItems,
            metadata: sourceMetadata,
            tiktokSettings: {
                description, autoAddMusic: true,
                allowComments: true,
                allowDuet: true,
                allowStitch: true,
            },
        },
    });

    const payload = unwrap(result, 'createPost');
    return payload.post || payload;
}

module.exports = {
    getScheduledPosts,
    getLatestScheduledPost,
    scheduleSocialPost,
};
