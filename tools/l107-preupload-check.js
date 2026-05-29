/**
 * tools/l107-preupload-check.js — verify all 4 lanes are auth-ready BEFORE
 * the upload chain fires. Reads:
 *   - yt-credentials.json     → RagnarShortsUltimate (organic YT)
 *   - yt-credentials-2.json   → RagnarShortsAI       (clip    YT)
 *   - INSTAGRAM_USER_ID_ORGANIC → @ragnar_ultimate007
 *   - INSTAGRAM_USER_ID_CLIPS    → @ragnarautomated
 *
 * Returns exit code 0 if all 4 pass; 1 if any fail.
 */
'use strict';
require('../lib/env-d-drive-only');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

const ROOT = path.resolve(__dirname, '..');

async function ytAuthCheck(label, credPath) {
  try {
    const cred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    const auth = new google.auth.OAuth2(cred.client_id, cred.client_secret, cred.redirect_uris && cred.redirect_uris[0]);
    auth.setCredentials({ access_token: cred.access_token, refresh_token: cred.refresh_token });
    const yt = google.youtube({ version: 'v3', auth });
    const r = await yt.channels.list({ mine: true, part: ['snippet', 'id'] });
    const channel = r.data.items && r.data.items[0];
    if (channel) {
      console.log(`  ✓ YT [${label}] → ${channel.snippet.title} (${channel.id})`);
      return { ok: true, channel: channel.snippet.title, channelId: channel.id };
    }
    console.log(`  ✗ YT [${label}]: no channels found`);
    return { ok: false, reason: 'no_channels' };
  } catch (e) {
    console.log(`  ✗ YT [${label}]: ${e.message.slice(0, 160)}`);
    return { ok: false, reason: e.message };
  }
}

async function igAuthCheck(label) {
  try {
    const ig = require('../ig-uploader');
    const ok = await ig.testInstagramAuth({ channelLabel: label });
    return { ok };
  } catch (e) {
    console.log(`  ✗ IG [${label}]: ${e.message.slice(0, 160)}`);
    return { ok: false, reason: e.message };
  }
}

async function main() {
  console.log('=== L107 PRE-UPLOAD AUTH CHECK ===');
  console.log('verifying all 4 lanes can authenticate before upload chain fires.\n');

  const results = {
    yt_organic: await ytAuthCheck('organic → RagnarShortsUltimate', path.join(ROOT, 'yt-credentials.json')),
    yt_clip:    await ytAuthCheck('clip    → RagnarShortsAI',       path.join(ROOT, 'yt-credentials-2.json')),
  };
  console.log('');
  console.log('-- Instagram --');
  results.ig_organic = await igAuthCheck('organic');
  results.ig_clip    = await igAuthCheck('clip');

  const allOk = Object.values(results).every((r) => r.ok);
  console.log('\n=== summary ===');
  console.log(`YT organic: ${results.yt_organic.ok ? 'OK' : 'FAIL'}`);
  console.log(`YT clip   : ${results.yt_clip.ok    ? 'OK' : 'FAIL'}`);
  console.log(`IG organic: ${results.ig_organic.ok ? 'OK' : 'FAIL'}`);
  console.log(`IG clip   : ${results.ig_clip.ok    ? 'OK' : 'FAIL'}`);
  console.log(allOk ? '\n✅ ALL 4 LANES READY' : '\n❌ ONE OR MORE LANES BLOCKED');

  // Write a small report so the live upload step can re-read this without a re-probe.
  try {
    const report = path.join(ROOT, 'renders', 'analytics', `preupload-${new Date().toISOString().slice(0,10)}.json`);
    fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.writeFileSync(report, JSON.stringify({ ts: new Date().toISOString(), results, allOk }, null, 2));
    console.log('report:', report);
  } catch (_) {}
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
