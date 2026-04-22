---
phase: visual-ai-upgrade
level: 3
researched_at: 2026-04-22
---

# BRUTAL RESEARCH — Max Animation Quality on GTX 1650 (FREE ONLY)

## Hardware Reality

- GPU: GTX 1650, 4GB VRAM, Turing arch (NO FP8 support)
- Usable VRAM: ~3.2GB after Windows/driver overhead
- FP16 only. No FP8. No GGUF tricks that need newer arch.
- System RAM: must be 16GB+ for model offloading

---

## DECISION 1: Forge for Images, ComfyUI for Animation

**Forge** = simple REST API, auto VRAM management, fast txt2img
**ComfyUI** = node-based, AnimateDiff king, max VRAM control

Use BOTH. Never simultaneously. Sequential GPU access.

```
Phase 1: Forge generates all scene images → kill Forge
Phase 2: ComfyUI runs AnimateDiff on key scenes → kill ComfyUI  
Phase 3: Remotion renders final video (CPU only)
```

---

## DECISION 2: The 6 Free Checkpoints (All SD 1.5, all ~2-2.5GB)

Download from CivitAI. All free. All .safetensors.

| Model | Style | Use For | Forge Settings |
|-------|-------|---------|----------------|
| DreamShaper 8 | Versatile/fantasy | News backgrounds, fallback | Steps:25, CFG:7, DPM++ 2M Karras |
| ToonYou | Clean cartoon | Hindi story frames | Steps:20, CFG:5, DPM++ 2M Karras |
| Flat2D Animerge | Flat 2D anime | Hindi cartoon lane | Steps:20, CFG:5, DPM++ 2M Karras |
| RevAnimated | 2.5D semi-real | Supernatural stories | Steps:25, CFG:7, DPM++ 2M Karras |
| DarkSushi Mix | Vibrant anime | Crime noir, hooks | Steps:20, CFG:7, Euler a |
| GhostMix | Detailed painterly | Hero shots, key moments | Steps:25, CFG:7, DPM++ 2M Karras |

**Content routing:**
```
news → DreamShaper 8
story (cartoon) → ToonYou OR Flat2D Animerge
story (dark/supernatural) → RevAnimated OR GhostMix
story (crime) → DarkSushi
thumbnail/hook → DarkSushi OR GhostMix
fallback → DreamShaper 8
```

**Resolution:** 512x768 (portrait, fits in 4GB). Upscale later.

---

## DECISION 3: Animation Pipeline (FREE, LOCAL)

### AnimateDiff Lightning (4-step, fastest)

- Model: `animatediff_lightning_4step_comfyui.safetensors` from ByteDance on HuggingFace (FREE)
- Works with ALL 6 checkpoints above
- 4 steps = fast even on GTX 1650

**ComfyUI Settings for 4GB:**
```
Resolution: 512x512 (NOT 768 for animation — too tight)
Frames: 16 (motion module training length)
Steps: 4
CFG: 1.0-2.0 (Lightning is sensitive, keep low)
Sampler: Euler
Scheduler: sgm_uniform
VAE Decode: USE TILED (prevents OOM on decode)
Launch flags: --lowvram --disable-smart-memory
```

**Motion LoRAs (FREE from CivitAI/HuggingFace):**
- Pan left/right camera LoRA (weight 0.7)
- Zoom in/out camera LoRA (weight 0.7)
- Don't stack more than 1 motion LoRA at a time on 4GB

### Why NOT standard AnimateDiff or AnimateLCM?

| Model | Steps | Quality | 4GB Feasible? |
|-------|-------|---------|---------------|
| Standard AnimateDiff | 20-30 | Best | ⚠️ Slow, OOM risk |
| AnimateLCM | 4-8 | Good | ✅ Yes |
| AnimateDiff Lightning | 4 | Good for cartoon | ✅ Best choice |

Lightning wins for cartoon because stylized checkpoints compensate for the reduced detail.

---

## DECISION 4: Post-Processing Pipeline (FREE)

### Step 1: Upscale frames with Real-ESRGAN (FREE)

Download `realesrgan-ncnn-vulkan` portable exe from GitHub. No Python needed.

```bash
realesrgan-ncnn-vulkan.exe -n realesrgan-x4plus-anime -i input_frames/ -o upscaled_frames/ -s 4 -t 200
```

- Model: `realesrgan-x4plus-anime` (designed for cartoon/anime, preserves lines)
- Tile size `-t 200` prevents OOM
- 512x512 → 2048x2048, then crop to 1080x1920

### Step 2: Frame interpolation with RIFE (FREE)

Use Flowframes (free Windows app) or ComfyUI RIFE node.

- Input: 16 frames at 8 FPS from AnimateDiff
- Output: 48-64 frames at 24 FPS (smooth cartoon motion)
- Enable scene detection to prevent cross-cut artifacts
- Enable frame deduplication (cartoon "on-twos" cleanup)

### Full post-processing chain:
```
AnimateDiff 16 frames @ 512x512
  → Real-ESRGAN 4x anime upscale → 2048x2048
    → RIFE interpolation 8→24 FPS → 48 frames
      → FFmpeg crop/resize to 1080x1920
        → Feed to Remotion as scene clip
```

---

## DECISION 5: Forge Setup (FREE)

### Install
1. Download from github.com/lllyasviel/stable-diffusion-webui-forge (.7z)
2. Extract to `D:\sd-forge\`
3. Run `update.bat` then edit `webui-user.bat`:

```batch
set COMMANDLINE_ARGS=--api --xformers --always-offload-from-vram
```

4. Run `run.bat` — opens on http://127.0.0.1:7860
5. Set GPU Weights slider to 3000-3500 MB in UI

### Models folder
Put all 6 checkpoints in `D:\sd-forge\models\Stable-diffusion\`

### Share with ComfyUI
ComfyUI: rename `extra_model_paths.yaml.example` → `extra_model_paths.yaml`
Set `base_path: D:\sd-forge` — now ComfyUI sees all Forge models. Zero duplication.

---

## DECISION 6: Node.js Integration (Forge API)

```javascript
// forge-image-provider.js
const fetch = require('node-fetch');
const fs = require('fs');

const FORGE_URL = 'http://127.0.0.1:7860';

// Content-type → checkpoint routing
const MODEL_MAP = {
  news: 'dreamshaper_8.safetensors',
  cartoon: 'toonyou_beta6.safetensors',
  flat_cartoon: 'flat2DAnimerge_v45Sharp.safetensors',
  supernatural: 'revAnimated_v122.safetensors',
  crime: 'darkSushiMixMix_225D.safetensors',
  hero: 'ghostmix_v20Bakedvae.safetensors',
  fallback: 'dreamshaper_8.safetensors'
};

async function generateSceneImage(prompt, negPrompt, outputPath, contentType) {
  const checkpoint = MODEL_MAP[contentType] || MODEL_MAP.fallback;
  
  const payload = {
    prompt,
    negative_prompt: negPrompt || '(worst quality:0.8), blurry, deformed, extra limbs, watermark, text',
    steps: contentType === 'cartoon' || contentType === 'flat_cartoon' ? 20 : 25,
    width: 512,
    height: 768,
    cfg_scale: contentType === 'cartoon' || contentType === 'flat_cartoon' ? 5 : 7,
    sampler_name: contentType === 'crime' ? 'Euler a' : 'DPM++ 2M Karras',
    batch_size: 1,
    override_settings: { sd_model_checkpoint: checkpoint }
  };

  const res = await fetch(`${FORGE_URL}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) throw new Error(`Forge API error: ${res.status}`);
  const data = await res.json();
  fs.writeFileSync(outputPath, Buffer.from(data.images[0], 'base64'));
  return outputPath;
}

async function isForgeAlive() {
  try {
    const res = await fetch(`${FORGE_URL}/sdapi/v1/sd-models`, { timeout: 5000 });
    return res.ok;
  } catch { return false; }
}

module.exports = { generateSceneImage, isForgeAlive, MODEL_MAP };
```

---

## DECISION 7: ComfyUI Animation Integration (Node.js)

ComfyUI exposes API at `http://127.0.0.1:8188`

```javascript
// comfyui-animator.js  
const fetch = require('node-fetch');
const WebSocket = require('ws');
const fs = require('fs');

const COMFY_URL = 'http://127.0.0.1:8188';

async function queueAnimation(workflowJson, promptOverrides) {
  // Load saved API-format workflow
  const workflow = JSON.parse(fs.readFileSync(workflowJson, 'utf8'));
  
  // Inject prompt into the correct node
  if (promptOverrides.positive) {
    // Node IDs vary per workflow — set during setup
    workflow[promptOverrides.positiveNodeId].inputs.text = promptOverrides.positive;
  }
  if (promptOverrides.negative) {
    workflow[promptOverrides.negativeNodeId].inputs.text = promptOverrides.negative;
  }
  if (promptOverrides.seed !== undefined) {
    workflow[promptOverrides.samplerNodeId].inputs.seed = promptOverrides.seed;
  }

  const clientId = `pipeline-${Date.now()}`;
  const res = await fetch(`${COMFY_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId })
  });
  
  if (!res.ok) throw new Error(`ComfyUI queue error: ${res.status}`);
  const { prompt_id } = await res.json();
  
  // Wait for completion via WebSocket
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:8188/ws?clientId=${clientId}`);
    const timeout = setTimeout(() => { ws.close(); reject(new Error('ComfyUI timeout')); }, 600000);
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.type === 'executed' && msg.data.prompt_id === prompt_id) {
        clearTimeout(timeout);
        ws.close();
        resolve(msg.data.output);
      }
    });
    ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

module.exports = { queueAnimation };
```

---

## DECISION 8: TTS — Stay Free

Fish Audio needs paid subscription for API. **Skip it.**

Keep current free stack:
```
Hindi: Edge TTS (hi-IN-MadhurNeural) → FREE
English: Kokoro ONNX (local) → FREE  
Emergency: Google TTS → FREE
```

If Edge TTS quality isn't enough later, revisit Fish Audio. But don't pay now.

---

## DECISION 9: Character Consistency (FREE techniques)

On 4GB VRAM, heavy solutions (IP-Adapter, FaceID) are OOM risks. Use free lightweight methods:

1. **Rigid prompt anchoring** — same character description in every scene prompt:
   `"a young Indian boy with messy black hair, red kurta, determined eyes"`
   
2. **Seed locking** — use same seed across scenes for consistent style

3. **ControlNet Canny (lightweight)** — extract edges from reference frame, apply to new scenes. Smallest VRAM hit of all ControlNet types.

4. **img2img with low denoise (0.2-0.3)** — feed previous frame, get consistent next frame

5. **Post-hoc fix** — if character drifts, re-generate only that frame

---

## Full Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     v12-factory.js                         │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  TTS (FREE):                                               │
│  Edge TTS (Hindi) → Kokoro ONNX (English) → Google TTS    │
│                                                            │
│  STATIC IMAGES (FREE, LOCAL):                              │
│  Forge API (6 checkpoints, content-routed)                 │
│    → Pollinations (remote free fallback)                   │
│      → HF FLUX.1 (remote free fallback)                   │
│                                                            │
│  ANIMATION (FREE, LOCAL):                                  │
│  ComfyUI + AnimateDiff Lightning (4-step, 16 frames)       │
│    → Real-ESRGAN 4x anime upscale                         │
│      → RIFE frame interpolation (8→24 FPS)                │
│        → HF Spaces Gradio (remote free fallback)          │
│                                                            │
│  GPU SEQUENCING:                                           │
│  Forge (images) → kill → ComfyUI (motion) → kill → Render │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Downloads Needed (All FREE)

| Item | Source | Size |
|------|--------|------|
| SD WebUI Forge | github.com/lllyasviel/stable-diffusion-webui-forge | ~5 GB |
| DreamShaper 8 | civitai.com | ~2 GB |
| ToonYou Beta 6 | civitai.com | ~2 GB |
| Flat2D Animerge v4.5 | civitai.com | ~2 GB |
| RevAnimated v1.2.2 | civitai.com | ~2.5 GB |
| DarkSushi Mix 2.25D | civitai.com | ~2.5 GB |
| GhostMix v2.0 | civitai.com | ~2.5 GB |
| AnimateDiff Lightning 4-step | huggingface.co/ByteDance | ~1.5 GB |
| mm_sd_v15_v2 motion module | huggingface.co/guoyww | ~1.5 GB |
| realesrgan-ncnn-vulkan | github.com/xinntao/Real-ESRGAN | ~50 MB |
| Flowframes (RIFE) | github.com/n00mkrad/flowframes | ~200 MB |
| **TOTAL** | | **~21.5 GB disk** |

## Risks

| Risk | Mitigation |
|------|------------|
| 512x512 animation looks small | Real-ESRGAN 4x upscale fixes this |
| AnimateDiff OOM on 4GB | Use --lowvram, tiled VAE, 512x512 only |
| Character inconsistency | Rigid prompts + seed lock + ControlNet Canny |
| Forge/ComfyUI process crash | Wrap in try/catch, health checks, auto-restart |
| Model swap takes 15-30s | Pre-warm before batch, acceptable in 60-min gap |
| 21.5 GB disk space | Store on largest drive available |

## Ready for Planning
- [x] All tools are FREE
- [x] All run LOCAL on GTX 1650
- [x] Animation pipeline mapped end-to-end
- [x] Post-processing chain defined (upscale + interpolation)
- [x] Node.js integration code written for both Forge and ComfyUI
- [x] Character consistency techniques identified (lightweight, no OOM)
- [x] Fallback chains preserved (Pollinations, HF Spaces)
- [x] TTS stays free (Edge + Kokoro)
