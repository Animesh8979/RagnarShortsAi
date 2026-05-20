/**
 * yt-uploader.js — YouTube Shorts Uploader
 *
 * Uses the existing OAuth2 credentials from youtube_token.pickle
 * (converted to yt-credentials.json) to upload videos via
 * YouTube Data API v3.
 *
 * Usage:
 *   const { uploadToYouTube } = require('./yt-uploader');
 *   const result = await uploadToYouTube(videoPath, title, description, tags);
 */

const { google } = require('googleapis');

// Optional sleep helper for quota backoff
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fs = require('fs');
const path = require('path');
const { assertPublishPermit } = require('./publish-lock');

const CREDENTIALS_PATH = path.join(__dirname, 'yt-credentials.json');
const MOBILE_SHORTS_TITLE_MAX = 54;

// L107 P1.4: Resolve credentials path with priority:
//   1. options.credentialsPath (explicit)
//   2. env override (YOUTUBE_CHANNEL_ORGANIC_CREDS / YOUTUBE_CHANNEL_CLIPS_CREDS based on options.channelLabel)
//   3. default yt-credentials.json
// Backward compatible: callers without options get the original behavior.
function resolveCredentialsPath(options = {}) {
  if (options.credentialsPath) {
    const explicit = path.isAbsolute(options.credentialsPath)
      ? options.credentialsPath
      : path.join(__dirname, options.credentialsPath);
    return explicit;
  }
  const label = String(options.channelLabel || '').toLowerCase();
  if (label.includes('clip') && process.env.YOUTUBE_CHANNEL_CLIPS_CREDS) {
    return path.isAbsolute(process.env.YOUTUBE_CHANNEL_CLIPS_CREDS)
      ? process.env.YOUTUBE_CHANNEL_CLIPS_CREDS
      : path.join(__dirname, process.env.YOUTUBE_CHANNEL_CLIPS_CREDS);
  }
  if ((label.includes('organic') || label === 'yt1') && process.env.YOUTUBE_CHANNEL_ORGANIC_CREDS) {
    return path.isAbsolute(process.env.YOUTUBE_CHANNEL_ORGANIC_CREDS)
      ? process.env.YOUTUBE_CHANNEL_ORGANIC_CREDS
      : path.join(__dirname, process.env.YOUTUBE_CHANNEL_ORGANIC_CREDS);
  }
  return CREDENTIALS_PATH;
}

function loadCredentials(options = {}) {
  const credsPath = resolveCredentialsPath(options);
  if (!fs.existsSync(credsPath)) {
    throw new Error(`YouTube credentials not found at ${credsPath}. Set YOUTUBE_CHANNEL_*_CREDS or pass options.credentialsPath.`);
  }
  return JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
}

function createAuthClient(creds) {
  const oauth2 = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  oauth2.setCredentials({
    refresh_token: creds.refresh_token,
  });
  return oauth2;
}

function clipTitleForMobile(title) {
  const compact = String(title || '').replace(/\s+/g, ' ').trim();
  if (compact.length <= MOBILE_SHORTS_TITLE_MAX) {
    return compact;
  }
  const hasShortsSuffix = /\s#shorts$/i.test(compact);
  const baseTitle = hasShortsSuffix ? compact.replace(/\s#shorts$/i, '').trim() : compact;
  const maxBaseLength = hasShortsSuffix ? MOBILE_SHORTS_TITLE_MAX - 8 : MOBILE_SHORTS_TITLE_MAX;
  const target = baseTitle.slice(0, maxBaseLength);
  const cut = target.lastIndexOf(' ');
  const clipped = (cut > 24 ? target.slice(0, cut) : target)
    .replace(/[,:;.\-]+$/g, '')
    .trim();
  return hasShortsSuffix ? `${clipped} #shorts` : clipped;
}

async function uploadToYouTube(videoPath, title, description, tags = [], options = {}) {
  assertPublishPermit(options, { platform: 'youtube_shorts', videoPath });
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const fileSizeMb = (fs.statSync(videoPath).size / (1024 * 1024)).toFixed(2);
  console.log(`\n📺 YouTube Upload Starting...`);
  console.log(`   File: ${path.basename(videoPath)} (${fileSizeMb} MB)`);
  console.log(`   Title: ${title}`);
  if (options.channelLabel) {
    console.log(`   🏷  Channel: ${options.channelLabel} (creds: ${path.basename(resolveCredentialsPath(options))})`);
  }

  const creds = loadCredentials(options);
  const auth = createAuthClient(creds);

  // Force token refresh
  try {
    const { credentials } = await auth.refreshAccessToken();
    auth.setCredentials(credentials);
    console.log('   🔑 Access token refreshed successfully');
  } catch (refreshError) {
    console.log(`   ⚠️  Token refresh warning: ${refreshError.message}`);
    // Continue anyway — googleapis may handle it internally
  }

  const youtube = google.youtube({ version: 'v3', auth });

  // Ensure title has #shorts
  const finalTitle = title.includes('#shorts') || title.includes('#Shorts')
    ? title
    : `${title} #shorts`;

  const clippedTitle = clipTitleForMobile(finalTitle);

  const snippet = {
    title: clippedTitle,
    description: description || `${title}\n\n#shorts #viral #ai #trending`,
    tags: tags.length > 0 ? tags : ['shorts', 'viral', 'ai', 'trending', 'tech'],
    categoryId: options.categoryId || '28', // 28 = Science & Technology
    defaultLanguage: 'en',
  };

  const status = {
    privacyStatus: options.privacyStatus || 'public',
    selfDeclaredMadeForKids: false,
    embeddable: true,
  };

  try {
    console.log('   ⬆️  Uploading video...');
    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: { snippet, status },
      media: {
        body: fs.createReadStream(videoPath),
      },
    });

    const videoId = response.data.id;
    const videoUrl = `https://www.youtube.com/shorts/${videoId}`;

    console.log(`   ✅ Upload successful!`);
    console.log(`   🔗 URL: ${videoUrl}`);
    console.log(`   📌 Video ID: ${videoId}`);

    if (options.pinnedComment) {
      try {
        console.log(`   📌 Pinning auto-generated comment...`);
        // We must wait briefly for the video to fully index before commenting
        await sleep(5000);
        await youtube.commentThreads.insert({
          part: ['snippet'],
          requestBody: {
            snippet: {
              videoId: videoId,
              topLevelComment: {
                snippet: {
                  textOriginal: options.pinnedComment
                }
              }
            }
          }
        });
        console.log(`   💬 Comment successfully pinned!`);
      } catch (commentErr) {
        console.log(`   ⚠️ Could not insert pinned comment: ${commentErr.message}`);
      }
    }

    if (options.thumbPath && fs.existsSync(options.thumbPath)) {
      try {
        console.log(`   🖼️ Uploading custom thumbnail...`);
        await youtube.thumbnails.set({
          videoId: videoId,
          media: {
            body: fs.createReadStream(options.thumbPath),
          },
        });
        console.log(`   ✅ Thumbnail set successfully!`);
      } catch (thumbErr) {
        console.log(`   ⚠️ Could not set thumbnail: ${thumbErr.message}`);
      }
    }

    return {
      success: true,
      videoId,
      videoUrl,
      title: clippedTitle,
      platform: 'youtube_shorts',
    };
  } catch (error) {
    const errorMsg = error?.errors?.[0]?.message || error?.message || String(error);
    const reason = error?.errors?.[0]?.reason;
    console.error(`   ❌ YouTube upload failed: ${errorMsg}`);
    
    // Auto-Hibernate if Quota Exceeded (re-throw a specific mapped error)
    if (reason === 'quotaExceeded') {
      console.error(`   🚫 QUOTA EXCEEDED! The system should hibernate until PST Midnight.`);
      return { success: false, error: 'QUOTA_EXCEEDED', platform: 'youtube_shorts' };
    }

    return {
      success: false,
      error: errorMsg,
      platform: 'youtube_shorts',
    };
  }
}

// Test the credentials without uploading
async function testYouTubeAuth(options = {}) {
  try {
    const creds = loadCredentials(options);
    const auth = createAuthClient(creds);
    const { credentials } = await auth.refreshAccessToken();
    console.log('✅ YouTube authentication successful');
    console.log(`   Token expires: ${new Date(credentials.expiry_date).toISOString()}`);
    return true;
  } catch (error) {
    console.error(`❌ YouTube authentication failed: ${error.message}`);
    return false;
  }
}

async function updateYouTubeMetadata(videoId, title, description, tags = [], options = {}) {
  if (!videoId) {
    throw new Error('Missing videoId for metadata update');
  }

  const creds = loadCredentials(options);
  const auth = createAuthClient(creds);
  try {
    const { credentials } = await auth.refreshAccessToken();
    auth.setCredentials(credentials);
  } catch (_) {
    // Ignore refresh warnings here; the API call can still succeed with cached creds.
  }

  const youtube = google.youtube({ version: 'v3', auth });
  const finalTitle = title && (title.includes('#shorts') || title.includes('#Shorts'))
    ? title
    : `${title} #shorts`;
  const clippedTitle = clipTitleForMobile(finalTitle);
  const snippet = {
    title: clippedTitle,
    description: description || `${title}\n\n#shorts #viral #ai #trending`,
    tags: Array.isArray(tags) && tags.length > 0 ? tags : ['shorts', 'viral', 'ai', 'trending', 'tech'],
    categoryId: options.categoryId || '28',
    defaultLanguage: 'en',
  };

  const response = await youtube.videos.update({
    part: ['snippet'],
    requestBody: {
      id: videoId,
      snippet,
    },
  });

  return {
    success: true,
    videoId,
    title: clippedTitle,
    response: response.data,
  };
}

module.exports = { uploadToYouTube, testYouTubeAuth, updateYouTubeMetadata };

// Phase 7C: Thumbnail A/B Testing via YouTube API
async function swapThumbnail(videoId, thumbnailPath, options = {}) {
  const creds = loadCredentials(options);
  const auth = createAuthClient(creds);
  const youtube = google.youtube({ version: 'v3', auth });
  
  if (!fs.existsSync(thumbnailPath)) {
    throw new Error('Thumbnail file not found: ' + thumbnailPath);
  }

  const fileSize = fs.statSync(thumbnailPath).size;
  console.log(`Uploading new thumbnail (${fileSize} bytes) for video ${videoId}...`);

  try {
    const response = await youtube.thumbnails.set({
      videoId: videoId,
      media: {
        body: fs.createReadStream(thumbnailPath),
      },
    });
    console.log('Thumbnail successfully updated for video:', videoId);
    return response.data;
  } catch (error) {
    console.error('Failed to swap thumbnail:', error.message);
    throw error;
  }
}

module.exports.swapThumbnail = swapThumbnail;
