'use strict';

const { placesInText } = require('./geo-coords');

// Known world leaders → display name + portrait query (for real-face scenes).
// Detection is alias-based so demonyms/surnames in scripts still resolve.
const LEADERS = {
  trump: { name: 'DONALD TRUMP', query: 'Donald Trump' },
  biden: { name: 'JOE BIDEN', query: 'Joe Biden' },
  putin: { name: 'VLADIMIR PUTIN', query: 'Vladimir Putin' },
  zelensky: { name: 'VOLODYMYR ZELENSKY', query: 'Volodymyr Zelenskyy' },
  zelenskyy: { name: 'VOLODYMYR ZELENSKY', query: 'Volodymyr Zelenskyy' },
  netanyahu: { name: 'BENJAMIN NETANYAHU', query: 'Benjamin Netanyahu' },
  khamenei: { name: 'ALI KHAMENEI', query: 'Ali Khamenei' },
  xi: { name: 'XI JINPING', query: 'Xi Jinping' },
  jinping: { name: 'XI JINPING', query: 'Xi Jinping' },
  modi: { name: 'NARENDRA MODI', query: 'Narendra Modi' },
  erdogan: { name: 'RECEP ERDOGAN', query: 'Recep Tayyip Erdoğan' },
  macron: { name: 'EMMANUEL MACRON', query: 'Emmanuel Macron' },
  kim: { name: 'KIM JONG UN', query: 'Kim Jong-un' },
  maduro: { name: 'NICOLAS MADURO', query: 'Nicolás Maduro' },
  starmer: { name: 'KEIR STARMER', query: 'Keir Starmer' },
};

function detectLeader(text) {
  const hay = ' ' + lower(text).replace(/[^a-z\s]/g, ' ') + ' ';
  for (const key of Object.keys(LEADERS)) {
    if (hay.includes(' ' + key + ' ')) return { key, ...LEADERS[key] };
  }
  return null;
}

const MAP_MODULES = new Set(['crisis_map', 'route_strike_board', 'radar_intercept']);

function textOf(value) {
  return String(value || '').trim();
}

function lower(value) {
  return textOf(value).toLowerCase();
}

function words(value) {
  return lower(value).replace(/[^a-z0-9\s+]/g, ' ').split(/\s+/).filter(Boolean);
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'this', 'that', 'these', 'those',
  'wait', 'okay', 'here', 'there', 'what', 'why', 'how', 'is', 'are', 'was',
  'were', 'be', 'being', 'been', 'it', 'its', 's', 're', 'they', 'you', 'your',
  'have', 'has', 'had', 'to', 'of', 'in', 'on', 'for', 'with', 'from', 'into',
  'just', 'about', 'listen', 'huge', 'wild', 'part', 'game', 'no', 'text',
  'frame', 'vertical', 'cinematic', 'shallow', 'depth', 'field', 'shot', 'mm',
  'lighting', 'composition', 'words', 'letters', 'numbers', 'screen',
]);

function keywords(value, limit = 8) {
  const preferred = words(value)
    .filter((word) => word.length > 2)
    .filter((word) => !STOPWORDS.has(word))
    .filter((word) => !/^\d+$/.test(word));
  return [...new Set(preferred)].slice(0, limit);
}

function includesAny(text, terms) {
  const hay = lower(text);
  return terms.some((term) => hay.includes(term));
}

function classifyTopic(topic) {
  const t = lower(topic);
  if (includesAny(t, ['ukraine', 'russia', 'oil', 'gas', 'energy', 'nuclear', 'kremlin'])) return 'energy_war';
  if (includesAny(t, ['boat', 'narco', 'cartel', 'caribbean', 'venezuela'])) return 'maritime_strike';
  if (includesAny(t, ['ai', 'model', 'chip', 'nvidia', 'google', 'openai', 'meta'])) return 'ai_race';
  return 'general_news';
}

function beatPurpose(index, total, beatText) {
  const t = lower(beatText);
  if (index === 0) return 'hook';
  if (index >= total - 1) return 'payoff';
  if (includesAny(t, ['dead', 'killed', 'families', 'cost', 'wallet', 'prices'])) return 'human_or_market_cost';
  if (includesAny(t, ['but', 'wild part', 'however', 'denying', 'not just'])) return 'turn';
  if (includesAny(t, ['number', 'over', 'since', 'funding', 'targeting'])) return 'evidence';
  return 'context';
}

function extractNumbers(value) {
  const cleaned = textOf(value).replace(/\b9\s*:\s*16\b/g, '').replace(/\bvertical\s+9\s+16\b/gi, '');
  const matches = cleaned.match(/\b\d+[\d,.]*\+?\b/g);
  return matches ? matches.slice(0, 3) : [];
}

function chooseModule({ topicClass, purpose, beatText, index }) {
  const t = lower(beatText);
  if (topicClass === 'energy_war') {
    if (purpose === 'hook') return 'crisis_map';
    if (includesAny(t, ['oil', 'gas', 'facility', 'facilities', 'energy'])) return 'route_strike_board';
    if (includesAny(t, ['funding', 'war machine', 'moscow'])) return 'funding_flow';
    if (includesAny(t, ['prices', 'wallet', 'global', 'ww3', 'stakes'])) return 'stakes_meter';
    if (purpose === 'payoff') return 'negotiation_table';
    return ['crisis_map', 'route_strike_board', 'funding_flow'][index % 3];
  }
  if (topicClass === 'maritime_strike') {
    if (purpose === 'hook') return 'radar_intercept';
    if (includesAny(t, ['three', 'killed', 'dead', '200', 'deaths'])) return 'death_toll_ledger';
    if (includesAny(t, ['offensive', 'escalating', 'targeting'])) return 'policy_escalation';
    if (includesAny(t, ['families', 'friends', 'cost'])) return 'human_cost_grid';
    if (purpose === 'payoff') return 'legal_question_board';
    return ['radar_intercept', 'policy_escalation', 'death_toll_ledger'][index % 3];
  }
  if (topicClass === 'ai_race') {
    if (purpose === 'hook') return 'compute_shock';
    if (includesAny(t, ['chip', 'compute', 'gpu'])) return 'compute_supply';
    if (includesAny(t, ['model', 'release', 'benchmark'])) return 'model_battlecard';
    return 'evidence_board';
  }
  return ['evidence_board', 'stakes_meter', 'timeline_collapse', 'human_cost_grid'][index % 4];
}

function visualProof({ topicClass, module, beatText, visualPrompt, numbers }) {
  const compactBeat = textOf(beatText).replace(/\s+/g, ' ');
  const compactVisual = textOf(visualPrompt).replace(/\s+/g, ' ');
  if (module === 'route_strike_board') return 'Animated route line, impact nodes, and energy-asset icons prove the strike/facility sentence.';
  if (module === 'funding_flow') return 'Money-to-war-machine flow shows why energy targets matter strategically.';
  if (module === 'stakes_meter') return `Rising risk meter and ${numbers[0] || 'price'} marker convert the stakes into a visual consequence.`;
  if (module === 'negotiation_table') return 'Two-sided negotiation table visualizes the endgame question.';
  if (module === 'radar_intercept') return 'Radar sweep, boat silhouette, and intercept line prove the maritime strike claim.';
  if (module === 'death_toll_ledger') return `Counting ledger foregrounds the death toll${numbers.length ? ` (${numbers.join(', ')})` : ''}.`;
  if (module === 'policy_escalation') return 'Escalation ladder shows the offensive moving from one strike to a campaign.';
  if (module === 'human_cost_grid') return 'Human-light grid turns the abstract death count into emotional cost.';
  if (module === 'legal_question_board') return 'Split verdict board frames the unresolved legitimacy question.';
  if (module === 'compute_shock') return 'Compute shock board turns abstract AI news into visible chip/model pressure.';
  if (module === 'compute_supply') return 'Chip pipeline and bottleneck gauges show the compute constraint.';
  if (module === 'model_battlecard') return 'Model cards and score bars show the comparison being argued.';
  if (module === 'crisis_map') return `${topicClass === 'energy_war' ? 'Crisis map anchors the war geography' : 'Crisis board anchors the event'} before details arrive.`;
  return compactVisual || compactBeat || 'Concrete evidence board tied to the beat.';
}

function motionVerb(module, purpose) {
  if (purpose === 'hook') return 'snap push-in with evidence reveal';
  if (module.includes('meter') || module.includes('ledger')) return 'rising count with impact pulse';
  if (module.includes('route') || module.includes('radar') || module.includes('map')) return 'tracking line draw with camera drift';
  if (module.includes('table') || module.includes('question')) return 'two-side split reveal';
  if (module.includes('human')) return 'lights dimming into payoff hold';
  return 'layered board build with parallax camera';
}

function cameraMove(module, index) {
  if (module.includes('radar')) return 'orbit-scan';
  if (module.includes('route') || module.includes('map')) return index % 2 ? 'diagonal-dolly' : 'slow-tilt-in';
  if (module.includes('meter') || module.includes('ledger')) return 'center-lock-punch';
  if (module.includes('table') || module.includes('question')) return 'split-screen-settle';
  return index % 2 ? 'left-pan-depth' : 'right-pan-depth';
}

function alternateModule(topicClass, beat, previousModule) {
  const energy = ['crisis_map', 'route_strike_board', 'funding_flow', 'stakes_meter', 'negotiation_table'];
  const maritime = ['radar_intercept', 'policy_escalation', 'death_toll_ledger', 'human_cost_grid', 'legal_question_board'];
  const ai = ['compute_shock', 'compute_supply', 'model_battlecard', 'evidence_board', 'stakes_meter'];
  const general = ['evidence_board', 'stakes_meter', 'timeline_collapse', 'human_cost_grid', 'policy_escalation'];
  const pool = topicClass === 'energy_war' ? energy : topicClass === 'maritime_strike' ? maritime : topicClass === 'ai_race' ? ai : general;
  if (beat.purpose === 'human_or_market_cost') {
    const cost = topicClass === 'maritime_strike' ? 'human_cost_grid' : 'stakes_meter';
    if (cost !== previousModule) return cost;
  }
  if (beat.purpose === 'turn') {
    const turn = topicClass === 'energy_war' ? 'funding_flow' : 'policy_escalation';
    if (turn !== previousModule) return turn;
  }
  const next = pool.find((candidate) => candidate !== previousModule && candidate !== beat.module);
  return next || beat.module;
}

function refreshBeatModule(beat, topicClass, module) {
  const next = { ...beat, module };
  next.visualProof = visualProof({
    topicClass,
    module,
    beatText: next.voiceover,
    visualPrompt: '',
    numbers: next.numbers || [],
  });
  next.motionVerb = motionVerb(module, next.purpose);
  next.cameraMove = cameraMove(module, next.index);
  next.dataObject = (next.numbers && next.numbers[0]) || (module.includes('meter') ? 'risk' : module.includes('route') ? 'route' : 'evidence');
  next.audioAccent = next.purpose === 'hook' ? 'hit' : module.includes('ledger') || module.includes('meter') ? 'tick' : 'whoosh';
  return next;
}

function enforceVisualVariety(beats, topicClass) {
  const out = [];
  for (const beat of beats) {
    let next = beat;
    const prev = out[out.length - 1];
    if (prev && prev.module === next.module) {
      next = refreshBeatModule(next, topicClass, alternateModule(topicClass, next, prev.module));
    }
    out.push(next);
  }
  return out;
}

// Guarantee the talking-anchor presenter appears once per video: convert the
// single most "talky"/abstract mid beat (no place, no person, fewest numbers)
// into a presenter_brief. Skips short videos and never touches hook/payoff.
function assignPresenter(beats) {
  if (!Array.isArray(beats) || beats.length < 4) return beats;
  if (beats.some((b) => b.module === 'presenter_brief')) return beats;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    if (b.purpose === 'hook') continue; // hook stays a strong muted-readable visual
    if ((b.places && b.places.length) || b.person) continue;
    // a clean sign-off anchor on the payoff is natural, so payoff is allowed
    const score = (b.numbers ? b.numbers.length : 0) + (b.purpose === 'payoff' ? 0.5 : 0);
    if (score < bestScore) { bestScore = score; best = i; }
  }
  if (best >= 0) beats[best] = { ...beats[best], module: 'presenter_brief' };
  return beats;
}

function buildDirectorPlan(script, props = {}) {
  const opt = (script && script.optimized) || script || {};
  const beats = Array.isArray(opt.beats) ? opt.beats : [];
  const topic = textOf(opt.title || script.topic || props.scriptId || 'organic story');
  const topicClass = classifyTopic(`${topic} ${textOf(script.topic)}`);
  const total = beats.length;
  const planBeats = beats.map((beat, index) => {
    const beatText = textOf(beat.vo || beat.voiceover);
    const visualPrompt = textOf(beat.visualPrompt || beat.visual_prompt);
    const purpose = beatPurpose(index, total, beatText);
    let module = chooseModule({ topicClass, purpose, beatText: `${beatText} ${visualPrompt}`, index });
    const nums = extractNumbers(`${beatText} ${visualPrompt}`);
    const tokenSet = keywords(`${beatText} ${visualPrompt}`, 8);
    // Content-true scene data: the REAL places + person named in this beat.
    const places = placesInText(`${beatText} ${visualPrompt}`);
    const person = detectLeader(beatText);
    // Overrides so the visual matches what the line actually says:
    //  • names a leader but no place → real portrait scene
    //  • names ≥2 places and wasn't already a map → force a real map
    if (person && places.length === 0 && purpose !== 'hook' && purpose !== 'payoff') module = 'leader_portrait';
    else if (places.length >= 2 && !MAP_MODULES.has(module)) module = 'crisis_map';
    return {
      index,
      places,
      person: person ? person.name : null,
      personQuery: person ? person.query : null,
      fromSec: Number(beat.tStart || beat.fromSec || 0),
      toSec: Number(beat.tEnd || beat.toSec || 0),
      voiceover: beatText,
      purpose,
      module,
      intensity: purpose === 'hook' ? 95 : purpose === 'payoff' ? 82 : Math.min(92, 58 + index * 7 + nums.length * 5),
      visualProof: visualProof({ topicClass, module, beatText, visualPrompt, numbers: nums }),
      mustShow: tokenSet.slice(0, 5),
      numbers: nums,
      motionVerb: motionVerb(module, purpose),
      cameraMove: cameraMove(module, index),
      foregroundObject: tokenSet[0] || topicClass.replace(/_/g, ' '),
      backgroundWorld: topicClass,
      dataObject: nums[0] || (module.includes('meter') ? 'risk' : module.includes('route') ? 'route' : 'evidence'),
      emotion: purpose === 'human_or_market_cost' ? 'cost' : purpose === 'turn' ? 'tension' : purpose === 'payoff' ? 'uncertainty' : 'urgency',
      cutType: index === 0 ? 'cold-open snap' : purpose === 'payoff' ? 'payoff settle' : 'match cut',
      audioAccent: purpose === 'hook' ? 'hit' : module.includes('ledger') || module.includes('meter') ? 'tick' : 'whoosh',
    };
  });

  const variedBeats = assignPresenter(enforceVisualVariety(planBeats, topicClass));
  const plan = {
    version: 'v9-director-plan-1',
    mode: 'news_premium',
    topic,
    topicClass,
    scriptId: textOf(script.scriptId || props.scriptId || topic),
    generatedAt: new Date().toISOString(),
    beats: variedBeats,
  };
  return { ...plan, audit: auditDirectorPlan(plan) };
}

function auditDirectorPlan(plan) {
  const reasons = [];
  const beats = Array.isArray(plan && plan.beats) ? plan.beats : [];
  if (beats.length < 5) reasons.push('director plan needs at least 5 beats');
  if (!beats[0] || beats[0].purpose !== 'hook') reasons.push('first beat must be hook');
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    if (!beat.module) reasons.push(`beat ${i} missing module`);
    if (!beat.visualProof || beat.visualProof.length < 24) reasons.push(`beat ${i} missing concrete visual proof`);
    if (!beat.motionVerb) reasons.push(`beat ${i} missing motion verb`);
    if (i > 0 && beats[i - 1].module === beat.module) reasons.push(`beats ${i - 1}/${i} repeat module ${beat.module}`);
  }
  const uniqueModules = new Set(beats.map((b) => b.module)).size;
  const variety = beats.length ? uniqueModules / beats.length : 0;
  if (variety < 0.66) reasons.push(`module variety too low ${variety.toFixed(2)}`);
  const score = Math.max(0, Math.min(100, Math.round(100 - reasons.length * 12 + variety * 10)));
  return {
    status: reasons.length ? 'review' : 'ready',
    score,
    reasons,
    uniqueModules,
    moduleVariety: Number(variety.toFixed(3)),
  };
}

module.exports = {
  buildDirectorPlan,
  auditDirectorPlan,
  classifyTopic,
};
