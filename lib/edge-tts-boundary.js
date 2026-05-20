/**
 * lib/edge-tts-boundary.js — V5 Phase 1A
 *
 * Wraps msedge-tts to synthesize speech AND collect exact word-boundary
 * timing metadata. No Whisper round-trip needed for organic captions —
 * boundaries come straight from the TTS service.
 *
 * Returns:
 *   { audioPath, wordBoundaries: [{ word, startSeconds, durationSeconds }] }
 *
 * Hard rule: if word boundaries are not received (older Edge service
 * versions or transient WS failures), this module returns ok:false with
 * a clear reason. Caller must NEVER fabricate timing data — captions
 * without exact boundaries cannot pass the V5 acceptance gate.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MsEdgeTTS, OUTPUT_FORMAT, MetadataOptions } = require('msedge-tts');

const CACHE_DIR = path.join(__dirname, '..', '.runtime-cache', 'edge-tts');
function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function sha1(s) { return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12); }

// Edge TTS WordBoundary metadata uses 100-nanosecond ticks (10,000,000 ticks = 1 second).
const TICKS_PER_SECOND = 10_000_000;

/**
 * Synthesize text → MP3 with word-boundary timing.
 *
 * @param {object} opts
 * @param {string} opts.text            — full voiceover text
 * @param {string} [opts.voice]         — Edge voice name (default en-US-GuyNeural)
 * @param {string} [opts.rate]          — speech rate e.g. "+13%" (default +0%)
 * @param {string} [opts.pitch]         — e.g. "+0Hz" (default +0Hz)
 * @param {string} [opts.outputDir]     — directory to write audio.mp3 (default .runtime-cache/edge-tts/<sha>/)
 * @returns {Promise<{ok:boolean, audioPath?:string, durationSec?:number, wordBoundaries?:Array, reason?:string}>}
 */
async function synthesize(opts) {
  const options = opts || {};
  const text = String(options.text || '').trim();
  if (!text) return { ok: false, reason: 'empty_text' };

  const voice = options.voice || 'en-US-GuyNeural';
  const rate = options.rate || '+0%';
  const pitch = options.pitch || '+0Hz';
  const key = sha1(`${voice}|${rate}|${pitch}|${text}`);
  const outDir = options.outputDir || path.join(CACHE_DIR, key);
  ensureDir(outDir);
  const audioPath = path.join(outDir, 'audio.mp3');
  const boundariesPath = path.join(outDir, 'boundaries.json');

  // Cache hit: re-use prior synth if same key
  if (fs.existsSync(audioPath) && fs.existsSync(boundariesPath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(boundariesPath, 'utf8'));
      return { ok: true, audioPath, durationSec: cached.durationSec, wordBoundaries: cached.wordBoundaries, cached: true };
    } catch (_) { /* fall through to re-synth */ }
  }

  const tts = new MsEdgeTTS();
  const metaOpts = new MetadataOptions();
  metaOpts.wordBoundaryEnabled = true;
  metaOpts.sentenceBoundaryEnabled = false;

  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, metaOpts);
  } catch (err) {
    return { ok: false, reason: `setMetadata_failed: ${err && err.message || err}` };
  }

  const wordBoundaries = [];
  let totalDurationTicks = 0;

  return new Promise((resolve) => {
    let resolved = false;
    const timeoutHandle = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      resolve({ ok: false, reason: 'edge_tts_timeout_60s' });
    }, 60_000);

    try {
      // Use toStream(text, options) which builds SSML internally with prosody
      // and (critically) sends SPEECH_CONFIG with wordBoundaryEnabled to the WS
      // before the request — this is the working code path observed in probes.
      const { audioStream, metadataStream } = tts.toStream(text, { rate, pitch });
      if (process.env.EDGE_TTS_DEBUG) console.log('[edge-tts] streams created, metaStream:', !!metadataStream);

      const out = fs.createWriteStream(audioPath);
      audioStream.pipe(out);

      if (metadataStream) {
        metadataStream.on('data', (chunk) => {
          if (process.env.EDGE_TTS_DEBUG) console.log('[edge-tts] meta chunk', chunk.length);
          // Each chunk is a complete pretty-printed JSON object spanning multiple lines:
          //   { "Metadata": [ { "Type": "WordBoundary", "Data": { "Offset": ..., ... } } ] }
          const chunkText = chunk.toString ? chunk.toString() : String(chunk);
          try {
            const obj = JSON.parse(chunkText);
            const metas = obj.Metadata || obj.metadata || [];
            for (const m of metas) {
              const type = m.Type || m.type;
              const data = m.Data || m.data;
              if (type === 'WordBoundary' && data) {
                const offset = Number(data.Offset || data.offset || 0);
                const duration = Number(data.Duration || data.duration || 0);
                const wordText = (data.text && (data.text.Text || data.text.text)) || data.Text || data.text || '';
                wordBoundaries.push({
                  word: String(wordText),
                  startSeconds: offset / TICKS_PER_SECOND,
                  durationSeconds: duration / TICKS_PER_SECOND,
                });
                if (offset + duration > totalDurationTicks) totalDurationTicks = offset + duration;
              }
            }
          } catch (err) {
            if (process.env.EDGE_TTS_DEBUG) console.log('[edge-tts] parse err:', err.message, 'chunk head:', chunkText.slice(0, 80));
          }
        });
        metadataStream.on('error', () => { /* error handled by audio close */ });
      }

      // Wait for BOTH audio (file write done) AND metadata (boundary stream end)
      // because metadata can lag the audio chunks.
      let audioDone = false;
      let metaDone = false;
      const tryFinish = () => {
        if (resolved) return;
        if (!audioDone || (metadataStream && !metaDone)) return;
        resolved = true;
        clearTimeout(timeoutHandle);
        try { tts.close && tts.close(); } catch (_) {}
        if (wordBoundaries.length === 0) {
          resolve({ ok: false, reason: 'no_word_boundaries_received', audioPath });
          return;
        }
        const durationSec = totalDurationTicks / TICKS_PER_SECOND;
        fs.writeFileSync(boundariesPath, JSON.stringify({ durationSec, wordBoundaries, voice, rate, pitch, text }, null, 2));
        resolve({ ok: true, audioPath, durationSec, wordBoundaries, cached: false });
      };
      // Small grace period after audio ends, in case metadata is still flushing.
      out.on('finish', () => { audioDone = true; setTimeout(tryFinish, 250); });
      if (metadataStream) {
        metadataStream.on('end', () => { metaDone = true; tryFinish(); });
        metadataStream.on('close', () => { metaDone = true; tryFinish(); });
      } else {
        metaDone = true;
      }
      audioStream.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutHandle);
        resolve({ ok: false, reason: `audio_stream_error: ${err && err.message || err}` });
      });
    } catch (err) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutHandle);
      resolve({ ok: false, reason: `synthesize_threw: ${err && err.message || err}` });
    }
  });
}

module.exports = { synthesize, _internals: { sha1, TICKS_PER_SECOND } };

if (require.main === module) {
  const text = process.argv.slice(2).join(' ') || 'Pakistan just made the choice that breaks the Quad.';
  synthesize({ text, voice: 'en-US-GuyNeural', rate: '+13%' }).then((r) => {
    console.log(JSON.stringify({
      ok: r.ok, reason: r.reason, audioPath: r.audioPath, durationSec: r.durationSec,
      boundaryCount: r.wordBoundaries ? r.wordBoundaries.length : 0,
      firstFew: r.wordBoundaries ? r.wordBoundaries.slice(0, 5) : null,
      monotonic: r.wordBoundaries ? r.wordBoundaries.every((b, i, a) => i === 0 || b.startSeconds >= a[i-1].startSeconds) : null,
    }, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
