---
phase: visual-ai-upgrade
level: 3
researched_at: 2026-04-22
---

# Phase visual-ai-upgrade ULTRA RESEARCH

## Questions Investigated
1. Can **Fish Audio** replace Edge TTS as the primary Hindi (and English) TTS provider?
2. Can **SD WebUI Forge** replace/complement ComfyUI as the local image generation backend on a GTX 1650 (4 GB)?
3. Which of the 6 proposed checkpoints (DreamShaper 8, ToonYou, RevAnimated, Flat2D Animerge, DarkSushi, GhostMix) best serve our cartoon/story pipeline, and how do they perform on 4 GB VRAM?
4. What is the concrete integration path from Node.js for both Fish Audio and Forge?
5. Can Forge and ComfyUI coexist on the same machine, sharing model weights?

---

## Section A — Fish Audio TTS

### A1. What Is Fish Audio?

Fish Audio is a frontier-class TTS platform built around the open-source **S2 model architecture**. Key capabilities:

| Feature | Details |
|---------|---------|
| **Model** | S2 / S2-Pro (latest generation) |
| **Languages** | 80+ languages including **Hindi** natively |
| **Latency** | Sub-150ms time-to-first-audio (API) |
| **Voice Cloning** | 10–30 seconds of reference audio; cross-lingual identity preservation |
| **Inline Expression** | Natural-language tags: `[whisper]`, `[laugh]`, `[emphasis]`, `[pause:500ms]` |
| **Multi-Speaker** | Single-pass multi-speaker dialogue generation |
| **Open Source** | Code open-source; weights under Fish Audio Research License (commercial = paid license) |

### A2. Fish Audio vs Current TTS Stack

| Dimension | Edge TTS (current primary) | Kokoro ONNX (current English) | Fish Audio S2 |
|-----------|---------------------------|-------------------------------|---------------|
| Hindi Quality | Decent (`hi-IN-MadhurNeural`) — robotic under emotion | N/A (English only) | **Native Hindi with emotional depth, code-switching** |
| English Quality | Good but flat | Good, local, zero-cost | **Frontier-class human realism** |
| Voice Cloning | ❌ | ❌ | ✅ 10-30s reference audio |
| Expression Control | SSML (limited) | None | **Inline tags (`[whisper]`, `[angry]`)** |
| Cost | Free (WSS scraping) | Free (local ONNX) | **Paid API — $15/M UTF-8 bytes** |
| Self-Host | ❌ | ✅ | ✅ but needs 12GB+ VRAM (impossible on GTX 1650) |
| Reliability | Flaky (token expires on browser updates) | Stable | **Production-grade API** |

### A3. Fish Audio Pricing Reality Check

| Tier | Price | API Access | Monthly Credits | Notes |
|------|-------|-----------|----------------|-------|
| Free | $0 | ❌ NO API | 8,000 credits | Web UI only, 500 chars/gen max |
| Plus | ~$10/mo | ✅ | Higher credits + pay-as-you-go API | Good for testing |
| Pro | ~$75/mo | ✅ | Team features, 3-member workspace | Production tier |

**API Pay-As-You-Go Rate:** $15.00 per million UTF-8 bytes

**Cost Estimate for Our Pipeline:**
- Average Hindi script: ~800 chars ≈ 2,400 UTF-8 bytes (Devanagari = 3 bytes/char)
- 6 videos/day × 2,400 bytes = 14,400 bytes/day
- Monthly: ~432,000 bytes = **$0.006/month** (negligible!)
- Even with 3x safety margin: **<$0.02/month**

**VERDICT:** Fish Audio API cost is essentially free for our volume. The subscription minimum (~$10/mo for Plus) is the real cost.

### A4. Node.js Integration (Drop-In Ready)

```javascript
// fish-audio-tts.js — Drop-in replacement for edge-readaloud.js
const { FishAudioClient } = require('fish-audio');
const fs = require('fs');

const client = new FishAudioClient({ 
  apiKey: process.env.FISH_API_KEY 
});

async function generateSpeech(text, outputPath, options = {}) {
  const audio = await client.textToSpeech.convert({
    text: text,
    reference_id: options.voiceId || process.env.FISH_HINDI_VOICE_ID,
    format: 'mp3',
    prosody: {
      speed: options.speed || 1.0,
      volume: options.volume || 0
    }
  });
  
  const buffer = Buffer.from(await new Response(audio).arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

module.exports = { generateSpeech };
```

**Installation:** `npm install fish-audio`

**Required .env:**
```
FISH_API_KEY=your_api_key
FISH_HINDI_VOICE_ID=reference_id_from_fish_audio_website
FISH_ENGLISH_VOICE_ID=reference_id_for_english
```

### A5. Integration Strategy with Existing Pipeline

The existing TTS fallback chain in `v12-factory.js` is:
```
Kokoro TTS (English) → Edge ReadAloud (Hindi) → Google TTS (emergency)
```

**Proposed new chain:**
```
Fish Audio S2 (Hindi + English primary)
  → Kokoro TTS (English fallback, local, free)
    → Edge ReadAloud (Hindi fallback, free)
      → Google TTS (emergency)
```

Fish Audio becomes Tier 0 for BOTH languages. Existing providers remain as free fallbacks.

### A6. Fish Audio Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| API down/rate-limited | TTS fails for slot | Fallback chain stays intact (Edge → Google) |
| Monthly cost if usage spikes | Budget overrun | Pay-as-you-go is usage-proportional; cap via API monitoring |
| Voice model quality varies | Bad Hindi output | Pre-test multiple Hindi voice models, pick the best `reference_id` |
| SDK breaking changes | Build fails | Pin `fish-audio` version in package.json |
| Cannot self-host (12GB VRAM min) | Cloud dependency | Acceptable — API cost is negligible |

---

## Section B — SD WebUI Forge as Image Generation Backend

### B1. Why Forge Over ComfyUI?

We already have ComfyUI for AnimateDiff/video. Forge serves a **different purpose**: reliable, fast **static image generation** with a dead-simple API.

| Dimension | ComfyUI (current) | SD WebUI Forge (proposed) |
|-----------|-------------------|---------------------------|
| Ease of Use | Node graph, steep curve | A1111-style web UI, beginner-friendly |
| API | Complex workflow JSON | Simple REST (`/sdapi/v1/txt2img`) |
| VRAM Management | Manual control, very granular | **Automatic "it just works"** on low VRAM |
| Best For | Complex pipelines (AnimateDiff, video) | **Fast txt2img batch generation** |
| Model Hot-Swap | Workflow-based | **Single API call** to `/sdapi/v1/options` |
| Coexistence | Can share models folder via `extra_model_paths.yaml` | Can share models via symlinks |

**VERDICT:** Use **Forge for static scene images** (story frames, news backgrounds). Keep **ComfyUI for AnimateDiff/video motion**. They complement each other.

### B2. Forge Installation on GTX 1650

1. Download from `github.com/lllyasviel/stable-diffusion-webui-forge` (`.7z` package)
2. Extract to `D:\stable-diffusion-forge\`
3. Run `update.bat` then `run.bat`
4. Edit `webui-user.bat`:
   ```batch
   set COMMANDLINE_ARGS=--api --xformers --always-offload-from-vram
   ```

**Critical 4GB Settings:**
- GPU Weights slider: **3000–3500 MB** (leave buffer for Windows + browser)
- Disable browser hardware acceleration
- Stick to **512×512** base resolution (SD 1.5 native)
- Batch size: **1** always
- Use FP16 precision (default for all SD 1.5 checkpoints)

### B3. Forge API Integration (Node.js)

```javascript
// forge-image-gen.js — Local SD WebUI Forge image generator
const fetch = require('node-fetch');
const fs = require('fs');

const FORGE_URL = process.env.FORGE_URL || 'http://127.0.0.1:7860';

async function switchModel(checkpointName) {
  await fetch(`${FORGE_URL}/sdapi/v1/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sd_model_checkpoint: checkpointName })
  });
}

async function generateImage(prompt, negativePrompt, outputPath, options = {}) {
  const payload = {
    prompt,
    negative_prompt: negativePrompt || 'blurry, low quality, distorted, 3d, photorealistic',
    steps: options.steps || 20,
    width: options.width || 512,
    height: options.height || 768,   // 9:16 portrait for Shorts
    cfg_scale: options.cfg || 7,
    sampler_name: options.sampler || 'DPM++ 2M Karras',
    batch_size: 1,
    override_settings: options.checkpoint ? {
      sd_model_checkpoint: options.checkpoint
    } : undefined
  };

  const res = await fetch(`${FORGE_URL}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  const imgBuffer = Buffer.from(data.images[0], 'base64');
  fs.writeFileSync(outputPath, imgBuffer);
  return outputPath;
}

async function listModels() {
  const res = await fetch(`${FORGE_URL}/sdapi/v1/sd-models`);
  return await res.json();
}

module.exports = { generateImage, switchModel, listModels };
```

**Required .env:**
```
FORGE_URL=http://127.0.0.1:7860
```

### B4. Coexistence with ComfyUI

Both can live on the same machine. **DO NOT run simultaneously** (GPU contention).

**Model Sharing Strategy:**
- Create central directory: `D:\AI_Models\checkpoints\`
- Forge: Symlink `models\Stable-diffusion\` → `D:\AI_Models\checkpoints\`
- ComfyUI: Edit `extra_model_paths.yaml` to point to same directory
- **Result:** One copy of each checkpoint serves both UIs

---

## Section C — Checkpoint Model Deep Dive

### C1. Model Matrix

All 6 models are SD 1.5 based (2-4 GB file size, ~3.5 GB VRAM at runtime with FP16).

| Model | File Size | Primary Style | Best For Our Pipeline | Recommended Settings |
|-------|-----------|---------------|----------------------|---------------------|
| **DreamShaper 8** | ~2 GB | Swiss-army-knife (artistic/fantasy/semi-real) | **News backgrounds**, versatile fallback | Steps: 25, CFG: 7, Sampler: DPM++ 2M Karras, Clip Skip: 2 |
| **ToonYou** | ~2 GB | Clean cartoon/toon | **Story scene frames** (cartoon lane) | Steps: 20, CFG: 5-6, Sampler: DPM++ 2M Karras |
| **RevAnimated** | ~2.5 GB | 2.5D semi-realistic anime | **Premium story scenes** with game/fantasy feel | Steps: 25, CFG: 7, Sampler: DPM++ 2M Karras |
| **Flat2D Animerge** | ~2 GB | Traditional flat 2D anime | **Hindi story frames** (classic cartoon look) | Steps: 20, CFG: 5, Sampler: DPM++ 2M Karras |
| **DarkSushi (Mix)** | ~2.5 GB | Vibrant high-contrast anime | **Eye-catching thumbnails**, hook frames | Steps: 20, CFG: 7, Sampler: Euler a |
| **GhostMix** | ~2.5 GB | Highly detailed painterly | **High-quality hero shots**, key moments | Steps: 25, CFG: 7, Sampler: DPM++ 2M Karras |

### C2. Content-Type → Model Routing

```
content-type mapping:
  news → DreamShaper 8 (versatile, semi-real, editorial feel)
  story (hindi cartoon) → ToonYou OR Flat2D Animerge (random)
  story (supernatural) → RevAnimated OR GhostMix (dark/fantasy)
  story (crime noir) → DarkSushi (high contrast, moody)
  hook/thumbnail → DarkSushi (eye-catching) OR GhostMix (detailed)
  fallback → DreamShaper 8 (never fails)
```

### C3. Universal Negative Prompt Template

```
(worst quality:0.8), (low quality:0.8), blurry, deformed, 
distorted hands, extra limbs, bad anatomy, watermark, 
signature, text, logo, cropped, out of frame, 
(photorealistic:0.6), 3d render, gradient background
```

For cartoon-specific (ToonYou/Flat2D):
```
(worst quality:0.8), (surreal:0.8), (modernism:0.8), 
photorealistic, 3d, gradient, textures, cross-hatching, 
blurry, deformed hands, extra limbs
```

### C4. VRAM Reality on GTX 1650

| Operation | VRAM Usage | Feasible? |
|-----------|-----------|-----------|
| Load SD 1.5 checkpoint (FP16) | ~3.2 GB | ✅ Yes (with offloading) |
| Generate 512×512 | ~3.5 GB peak | ✅ Yes |
| Generate 512×768 (portrait) | ~3.8 GB peak | ✅ Tight but works |
| Generate 768×1024 | ~4.5 GB peak | ❌ OOM — use Hires Fix instead |
| Model hot-swap | ~15-30 sec | ✅ (loads new, unloads old) |
| Forge + ComfyUI simultaneous | N/A | ❌ NEVER — GPU contention |

**Resolution Strategy:**
1. Generate at **512×768** (portrait, SD 1.5 optimal for 9:16)
2. Upscale via **R-ESRGAN 4x** to 2048×3072 (post-processing, lower VRAM)
3. Crop/resize to **1080×1920** for final Shorts resolution

### C5. Disk Space Requirements

| Item | Size | Notes |
|------|------|-------|
| SD WebUI Forge (base) | ~5 GB | Python env + core files |
| DreamShaper 8 | ~2 GB | `.safetensors` |
| ToonYou | ~2 GB | `.safetensors` |
| RevAnimated | ~2.5 GB | `.safetensors` |
| Flat2D Animerge | ~2 GB | `.safetensors` |
| DarkSushi | ~2.5 GB | `.safetensors` |
| GhostMix | ~2.5 GB | `.safetensors` |
| **TOTAL** | **~18.5 GB** | All 6 models + Forge |

---

## Section D — Architecture: How It All Fits Together

### D1. Proposed Dual-Backend Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         v12-factory.js                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TTS CHAIN:                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │ Fish Audio S2 │──▶│ Kokoro ONNX  │──▶│ Edge TTS     │──▶ ... │
│  │ (Hindi+EN)   │   │ (EN fallback)│   │ (HI fallback)│        │
│  └──────────────┘   └──────────────┘   └──────────────┘        │
│                                                                 │
│  IMAGE GEN CHAIN:                                               │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │ Forge API    │──▶│ Pollinations │──▶│ HF FLUX.1    │──▶ ... │
│  │ (6 models)   │   │ (remote free)│   │ (remote free)│        │
│  └──────────────┘   └──────────────┘   └──────────────┘        │
│                                                                 │
│  VIDEO/MOTION CHAIN:                                            │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │ ComfyUI      │──▶│ HF Spaces   │──▶│ 2.5D Parallax│        │
│  │ (AnimateDiff)│   │ (Gradio)    │   │ (Depth Map)  │        │
│  └──────────────┘   └──────────────┘   └──────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### D2. Runtime Orchestration (Critical Constraint)

The GTX 1650 cannot run Forge and ComfyUI at the same time. The pipeline must:

1. **Phase 1 (Image Gen):** Start Forge → generate all scene images for batch → kill Forge
2. **Phase 2 (Motion):** Start ComfyUI → run AnimateDiff on key frames → kill ComfyUI
3. **Phase 3 (Render):** Run Remotion (CPU-bound, GPU-free)

This is compatible with our 60-minute inter-slot gap.

### D3. Fish Audio runs completely independently (cloud API, no GPU needed).

---

## Section E — Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Hindi TTS Primary | Fish Audio S2 API | Best Hindi quality, inline emotion tags, negligible cost (~$0.02/mo) |
| English TTS Primary | Fish Audio S2 API | Unified provider, frontier quality, voice cloning capability |
| TTS Fallback Chain | Keep Kokoro + Edge + Google | Zero-cost safety net for API failures |
| Image Gen Backend | SD WebUI Forge (local) | Simpler API than ComfyUI for static images, better VRAM auto-mgmt |
| Video/Motion Backend | Keep ComfyUI | Already works for AnimateDiff, keep for motion tasks |
| Checkpoint Strategy | All 6 models, content-routed | Different styles for different content types maximize visual variety |
| Default Checkpoint | DreamShaper 8 | Most versatile, works for any content type |
| Cartoon Checkpoint | ToonYou + Flat2D Animerge | Clean cartoon look for Hindi story lane |
| Dark/Mood Checkpoint | DarkSushi + GhostMix | Supernatural/crime stories |
| Resolution | 512×768 → R-ESRGAN 4x → crop 1080×1920 | Max quality within 4GB VRAM limit |
| Forge + ComfyUI | Sequential, never simultaneous | Single GPU constraint |
| Fish Audio Self-Host | ❌ Cloud API only | Needs 12GB+ VRAM, impossible on GTX 1650 |
| Model Storage | Shared `D:\AI_Models\` | Symlinks for Forge, `extra_model_paths.yaml` for ComfyUI |

## Patterns to Follow
- Content-type → model routing (automatic checkpoint selection per video category)
- Fallback chains for everything (TTS: Fish → Kokoro → Edge → Google; Image: Forge → Pollinations → FLUX)
- Sequential GPU workloads (never run Forge + ComfyUI concurrently)
- Pre-generate images in batch before render phase starts
- Use `override_settings.sd_model_checkpoint` for per-request model switching (no global state change)

## Anti-Patterns to Avoid
- **Running Forge + ComfyUI simultaneously:** Guaranteed OOM crash on 4GB VRAM
- **Generating above 512×768 directly:** Use upscaler post-processing instead
- **Self-hosting Fish Audio:** 12GB VRAM minimum, not viable on our hardware
- **Hardcoding checkpoint names:** Use config/env variables for model names
- **Ignoring Forge health check:** Always ping `/sdapi/v1/sd-models` before sending generation requests
- **Batch size > 1 on Forge:** VRAM spike will crash generation

## Dependencies Identified

| Package | Version | Purpose |
|---------|---------|---------|
| `fish-audio` | latest | Fish Audio Node.js SDK for TTS |
| `@gradio/client` | latest | HF Spaces video generation (from original research) |
| SD WebUI Forge | latest | Local image generation backend (separate install, not npm) |
| DreamShaper 8 | v8 | Swiss-army-knife checkpoint |
| ToonYou | latest | Cartoon checkpoint |
| RevAnimated | latest | 2.5D anime checkpoint |
| Flat2D Animerge | latest | Flat cartoon checkpoint |
| DarkSushi Mix | latest | Vibrant anime checkpoint |
| GhostMix | latest | High-detail painterly checkpoint |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Fish Audio API cost escalation | Low | Medium | Monitor usage, cap via alerts; fallback to free Edge TTS |
| Forge OOM on 512×768 | Medium | Low | Fall back to 512×512, use `--always-offload-from-vram` |
| Checkpoint model swap latency (15-30s) | High | Low | Pre-warm model before batch; use `override_settings` |
| Disk space (18.5 GB for all models) | Low | Medium | Store on larger drive; lazy-load only needed models |
| Fish Audio SDK breaking changes | Low | Medium | Pin version, wrap in try/catch with Edge TTS fallback |
| Forge process management complexity | Medium | Medium | Use `child_process.spawn` with health monitoring |
| Hindi voice model quality on Fish Audio | Medium | High | Test 5+ Hindi voices before committing to a `reference_id` |

## Ready for Planning
- [x] Fish Audio integration path fully mapped (SDK, pricing, code patterns)
- [x] SD WebUI Forge setup documented (install, settings, API, Node.js code)
- [x] All 6 checkpoints evaluated (style, VRAM, settings, routing logic)
- [x] Architecture designed (dual-backend, sequential GPU, fallback chains)
- [x] Coexistence strategy confirmed (Forge + ComfyUI sharing models)
- [x] Cost analysis completed (Fish Audio ~$0.02/mo, models ~18.5 GB disk)
- [x] Risk matrix populated with mitigations
- [x] Questions answered comprehensively
- [x] Dependencies identified (npm + external tools)
