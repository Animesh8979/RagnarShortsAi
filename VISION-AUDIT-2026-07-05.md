# Video Vision Audit — explainer-video.mp4
Performed: 2026-07-05 (this session)
Method: NVIDIA NIM `meta/llama-3.2-90b-vision-instruct` vision-language model
Frames analyzed: 6 (at t=0.5s, 5s, 10s, 15s, 20s, 22.8s) from `apps/studio/out/frames/`
Source render: `apps/studio/out/explainer-video.mp4` (1080x1920, 23.3s, 13MB)

## Verdict: CONFIRMS USER'S "ALL BAD" JUDGMENT

The user's instinct was correct on every axis. The vision model independent assessment:

### 1. Character doesn't look human (CONFIRMED, all 5 character frames)
- Frame 0: "flat, simplistic icon with a circular head, rectangular body, and stick-like limbs. The face is featureless."
- Frame 1: "flat, simplistic icon with a green torso, pink limbs, and a round head... neutral pose."
- Frame 3: "flat, simplistic icon with a green body, pink arms, and a blue face."
- Frame 4: "flat, simplistic icon with a circular head, rectangular body, and stick-like limbs. The character's face is not visible."
- Frame 5: same as 4.
- **Root cause**: this render used `LottieCharacter` (flat 400×400 Lottie vector loops), NOT the articulated SVG `Character.tsx` (which has real human-figure articulation — limbs, head, eyes with pupils+highlights, brows, mouth-open synced to speech). NOTE: A swap was started this session (`USE_SVG_CHARACTER=true` flag added in ExplainerVideo.tsx) but NOT yet rebuilt or re-rendered. The render analyzed here is the OLD one.

### 2. Text/headers hard to read (CONFIRMED, frames 0/1/3/5)
- Frame 0: text "blends into the background due to its similar color scheme"
- Frame 1: text "overlaps with the character's body"
- Frame 3: text "blends into the background due to its light color"
- Frame 5: text "blends into the background due to its similar color tone, making it difficult to read"
- **Root cause**: no backing plate behind headline; text-shadow too soft; headline placed over aurora bg without contrast floor. A backing-plate div was added this session but NOT yet rebuilt/re-rendered.

### 3. Animations look stiff/looping (INFERRED — character is a flat icon, not articulated)
- Vision can't see motion in a still frame, but the character's static pose ("neutral, arms at sides, legs together") across multiple frames confirms Lottie is a flat stylized loop, no real articulation. The SVG Character's breathing/blink/mouth-open-synced-to-speech would fix this.

### 4. Colors/mood feel wrong (CONFIRMED, frames 0/5/1)
- Frame 0: "gradient of reds and oranges, which creates a jarring effect"
- Frame 5: "gradient of reds and oranges, which creates a jarring effect"
- Frame 1: "purple, which creates a cohesive visual theme" (mixed result — some segments work, some don't)
- Frame 2 (no character): "cohesive blend of dark blues and grays, creating a visually appealing and professional atmosphere" — the SEGMENTS WITHOUT THE CHARACTER look good
- **Root cause**: the deep-red/orange mood palette for "shocked" and the purple for "mysterious" are too saturated; the bg alone (frames 2) is fine, the character+bg together clash. Palette was softened this session (MOOD_ACCENT/BG_TOP/BG_BOTTOM tweaked) but NOT yet rebuilt/re-rendered.

### 5. Pacing/timing is off (CONFIRMED, frame 1)
- Frame 1: "character's limbs are partially cut off by the edges of the image" + "significant amount of empty space around the character" — composition is unbalanced, the character is too small/cropped wrong.
- Frame 5: "empty space at the bottom of the frame and a small, illegible number '1/6' in the top-right corner" — progress indicator is too small to read.

### 6. Other artifacts
- Frame 0: "misspelling: 'EXPLAI NED' instead of 'EXPLAINED'" — likely a text-wrap issue in TextReveal mid-word
- Frame 1: heading "1977.Aradiotelescopepicks" — words concatenated, no spaces (heading text-wrap broken)
- Frame 5: "1/6" progress indicator illegible (too small)

## FIXES IN PROGRESS (started this session, NOT yet rebuilt):
1. ✅ Character swap: `ExplainerVideo.tsx` now imports `SvgCharacter` and gates on `USE_SVG_CHARACTER=true` — fixes #1 and #3.
2. ✅ Palette soften: MOOD_BG_TOP/BOTTOM/ACCENT values desaturated — fixes #4.
3. ✅ Text backing plate: rgba(8,10,18,0.62) + border + blur + stronger text-shadow added behind headline — fixes #2.
4. ❌ NOT FIXED: text-wrap mid-word break (frame 0 "EXPLAI NED", frame 1 "1977.Aradiotelescopepicks") — TextReveal component needs word-boundary fix.
5. ❌ NOT FIXED: character composition/limb cropping (frame 1) — character positioned/scaled wrong.
6. ❌ NOT FIXED: "1/6" progress indicator too small (frame 5) — needs bump.

## NEXT STEPS
1. Finish the in-progress source fixes (the 3 already applied + the 3 outstanding).
2. Run `npm run build -w apps/studio` to compile.
3. Re-render: `cmd /c "npx remotion render ExplainerVideo out\explainer-video.mp4 > out\render.log 2>&1"` from `apps/studio`.
4. Extract 6 new sample frames.
5. Run this same vision audit on the NEW render to verify fixes landed.
6. Iterate until the vision model stops flagging issues.
