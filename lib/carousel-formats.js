/**
 * lib/carousel-formats.js — viral IG carousel FORMAT library + niche adapter.
 *
 * Source insight (from the "8 Viral Prompts for AI Instagram Carousels" deck,
 * each reached 100K+ views / 1K+ comments): the FORMAT is what goes viral, not
 * the specific topic — "trending topics change, human behavior doesn't." So we
 * encode the 8 proven formats as reusable templates and adapt each to our niche
 * (geopolitics organic / creator-clip) via LLM, exactly like the deck's method:
 *   take a format → "adapt the idea to my niche, give me a new script" → render.
 *
 * Each slide carries: imagePrompt (consistent character + clean style) + a bold
 * overlayText (the hook beat). Our existing FLUX (NVIDIA NIM) renders the image,
 * ffmpeg drawtext burns the overlay, ig-uploader.uploadCarousel publishes.
 * $0, D:\, no GPU. One image generated at a time for max quality (per the deck).
 */
'use strict';
const fetch = (() => { try { return require('node-fetch'); } catch (_) { return global.fetch; } })();

// ── The 8 proven formats ────────────────────────────────────────────────────
// `structure` = the per-slide beat skeleton the LLM fills for the topic.
// `styleAnchor` = the consistent visual style repeated on EVERY slide (the deck's
// #1 trick: same character/style, one variable changes per slide → cohesion).
const FORMATS = [
  {
    id: 'only_x_minutes', name: "It's only X", slides: 4,
    hook: 'relatable-struggle → effortless-payoff',
    structure: ['lazy/struggling at the doom-scroll', 'energized doing the productive thing', 'tempted back to the easy vice', 'winning / result on screen'],
    styleAnchor: 'clean flat vector cartoon, consistent single character, dark-teal↔warm-orange palette swap to signal struggle vs win',
    textStyle: 'centered bold YELLOW caption, identical line every slide (the excuse) until the last',
    bestFor: ['habit', 'discipline', 'creator-advice'],
  },
  {
    id: 'do_more_not_one', name: 'Do 3, not 1', slides: 5,
    hook: 'quantity-multiplier listicle',
    structure: ['do X 3x not 1x', 'do Y 3x not 1x', 'have 3 Z not 1', 'create 3 W not 1', 'final compounding payoff'],
    styleAnchor: 'clean vector cartoon, same character black tee, warm yellow-brown palette, faint platform icons behind',
    textStyle: 'top bold WHITE "[Verb] 3 [thing]s, not 1"',
    bestFor: ['tactics', 'growth-tips', 'checklist'],
  },
  {
    id: 'different_eras', name: 'Different Eras', slides: 5,
    hook: 'nostalgia → evolution timeline (huge saves/shares)',
    structure: ['era 1 (origin)', 'era 2', 'era 3', 'era 4', 'now / where it is heading'],
    styleAnchor: 'cartoon digital illustration, same subject aged/re-styled per era, warm cinematic lighting, era label bold white centered + era logo',
    textStyle: 'center bold WHITE "[YEAR] [Era] Era"',
    bestFor: ['geopolitics', 'history', 'timeline', 'conflict-escalation'],
  },
  {
    id: 'dont_do_instead', name: "Don't do X, do Y", slides: 5,
    hook: 'contrarian pattern-interrupt + payoff reveal',
    structure: ['"Don\'t do [common thing]..."', '"...until you\'ve done this one thing"', 'the reveal / mechanism', 'proof or how-to', 'CTA'],
    styleAnchor: 'clean vector cartoon, same character, purple gradient + soft clouds, floating notification icons',
    textStyle: 'top bold WHITE contrarian line',
    bestFor: ['myth-bust', 'hot-take', 'advice'],
  },
  {
    id: 'split_struggle', name: 'Split struggle→solution', slides: 3,
    hook: 'two-panel before/after per slide',
    structure: ['panel: vice vs work', 'panel: distraction vs build', 'panel: consumer vs creator'],
    styleAnchor: 'two-panel vector cartoon, dark-teal top (struggle) / bright-orange bottom (action), same character',
    textStyle: 'light-yellow caption top & bottom panel',
    bestFor: ['contrast', 'motivation'],
  },
  {
    id: 'format_truth', name: 'HOW TO / format-truth', slides: 5,
    hook: 'book-cover hook → minimal text-only truth slides',
    structure: ['book cover "HOW TO [GOAL]"', 'open book "DON\'T [X]. [Y] INSTEAD"', 'setup line', 'the core truth', 'apply-it CTA'],
    styleAnchor: 'slide 1-2 cartoon man reading book w/ bold cover text; slides 3-5 FLAT minimal warm-orange gradient, white centered sans-serif only',
    textStyle: 'mix: book-cover bold black, then large white centered statements',
    bestFor: ['principle', 'education', 'mindset'],
  },
  {
    id: 'why_does_x', name: 'Why does X do this?', slides: 4,
    hook: 'curiosity-gap aspiration (two-panel question→implied answer)',
    structure: ['"Why does [subject] do [behavior]?"', '"Why does [subject] get [result]?"', '"Why does [subject] [repeat behavior]?"', 'confident answer + CTA'],
    styleAnchor: 'two-panel vector cartoon, dark muted (question) / warm spotlight (answer), same subject, faint engagement icons',
    textStyle: 'bold light-yellow / white question per panel',
    bestFor: ['geopolitics', 'curiosity', 'analysis', 'why-explainer'],
  },
  {
    id: 'niche_hook_infographic', name: 'Hook-sign + infographics', slides: 5,
    hook: 'hyper-real protest-sign hook → clean infographic value slides',
    structure: ['hyper-real person holding sign w/ the promise', 'infographic #1 (the framework)', 'infographic #2', 'infographic #3', 'CTA infographic'],
    styleAnchor: 'slide 1 hyper-realistic cinematic photo w/ motion-blur urgency; slides 2-5 white crumpled-paper infographic, red+black titles, clean typography',
    textStyle: 'sign: bold black uppercase promise; infographics: red keyword + black body',
    bestFor: ['authority', 'framework', 'save-bait'],
  },
];

function pickFormat(topicOrNiche) {
  const t = String(topicOrNiche || '').toLowerCase();
  // geopolitics organic → timeline / why-explainer convert best
  if (/iran|israel|ukraine|war|sanction|border|nuclear|strike|conflict|nato|china|russia|gaza|election/.test(t)) {
    return Math.random() < 0.5 ? byId('different_eras') : byId('why_does_x');
  }
  return FORMATS[Math.floor(Math.random() * FORMATS.length)];
}
function byId(id) { return FORMATS.find((f) => f.id === id) || FORMATS[0]; }

/**
 * adaptToTopic — the deck's "adapt this format to my niche, give me a NEW script"
 * step, automated. Returns slide specs ready for FLUX + drawtext.
 * @param {object} o { topic, summary?, niche?, formatId?, llm? }
 * @returns {Promise<{ok, format, slides:[{index,imagePrompt,overlayText}], caption?, reason?}>}
 */
async function adaptToTopic(o) {
  const topic = o && o.topic;
  if (!topic) return { ok: false, reason: 'no_topic' };
  const fmt = o.formatId ? byId(o.formatId) : pickFormat(`${topic} ${o.niche || ''}`);
  const prompt = `You adapt PROVEN viral Instagram-carousel FORMATS to a new topic. The format is what makes it work — keep its skeleton, swap in the topic.

FORMAT: "${fmt.name}" (${fmt.hook})
Per-slide beats: ${fmt.structure.map((s, i) => `(${i + 1}) ${s}`).join('  ')}
VISUAL STYLE (repeat on EVERY slide for cohesion): ${fmt.styleAnchor}
TEXT STYLE: ${fmt.textStyle}

TOPIC: ${topic}${o.summary ? `\nCONTEXT: ${String(o.summary).slice(0, 400)}` : ''}
NICHE: ${o.niche || 'geopolitics / world-conflict explainer'}

Write the carousel as STRICT JSON, ${fmt.slides} slides. Each slide:
  - "overlayText": the bold on-image text for THAT slide (≤9 words, punchy, scroll-stopping; slide 1 must hook in <3s, readable muted)
  - "imagePrompt": a full image-gen prompt that BAKES IN the visual style above + this slide's beat. Keep the recurring subject/style identical across slides; change only what the beat requires. No text inside the image (we burn overlayText separately).
Also a "caption" (the IG post caption: 1 hook line + 2-3 value lines + 4-6 niche hashtags).

Return ONLY: { "caption": "...", "slides": [ { "overlayText": "...", "imagePrompt": "..." }, ... ] }`;

  let raw;
  try { raw = await (o.llm ? o.llm(prompt) : callLLM(prompt)); }
  catch (e) { return { ok: false, reason: 'llm_failed: ' + (e && e.message || e).slice(0, 120), format: fmt.id }; }
  let obj; try { obj = JSON.parse(raw); } catch (_) {
    const m = /\{[\s\S]*\}/.exec(raw || ''); try { obj = JSON.parse(m && m[0]); } catch (_) { return { ok: false, reason: 'bad_json', format: fmt.id }; }
  }
  if (!obj || !Array.isArray(obj.slides) || !obj.slides.length) return { ok: false, reason: 'no_slides', format: fmt.id };
  const clean = (s) => String(s || '').replace(/\*\*/g, '').replace(/^["'\s]+|["'\s]+$/g, '').trim();
  const slides = obj.slides.slice(0, fmt.slides).map((s, i) => ({
    index: i, overlayText: clean(s.overlayText).slice(0, 80), imagePrompt: clean(s.imagePrompt).slice(0, 700),
  }));
  return { ok: true, format: fmt.id, formatName: fmt.name, caption: obj.caption || '', slides };
}

async function callLLM(prompt) {
  // Groq primary, Gemini fallback (both free-tier, same pattern as the rest of the pipeline).
  if (process.env.GROQ_API_KEY) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.9, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(60000),
    });
    if (r.ok) return (await r.json()).choices[0].message.content;
  }
  if (process.env.GEMINI_API_KEY) {
    // L114 — Gemini MODEL LADDER (no single-model 503 "Gemini down").
    const g = await require('./gemini-call').geminiGenerate({ text: prompt, json: true, temperature: 0.9 });
    if (g.ok) return g.text;
  }
  throw new Error('no_llm_key');
}

module.exports = { FORMATS, pickFormat, adaptToTopic };

if (require.main === module) {
  require('./env-d-drive-only');
  const topic = process.argv.slice(2).join(' ') || 'Iran and Israel edge closer to direct war';
  adaptToTopic({ topic, niche: 'geopolitics' }).then((r) => {
    if (!r.ok) { console.error('FAIL:', r.reason); process.exit(1); }
    console.log(`format: ${r.formatName} (${r.format}) — ${r.slides.length} slides\n`);
    r.slides.forEach((s) => console.log(`  [${s.index + 1}] "${s.overlayText}"\n      img: ${s.imagePrompt.slice(0, 110)}...`));
    console.log(`\ncaption: ${r.caption.slice(0, 200)}`);
    process.exit(0);
  });
}
