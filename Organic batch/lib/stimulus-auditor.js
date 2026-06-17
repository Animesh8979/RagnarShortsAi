'use strict';

function auditStimulus(beats, totalDurationSec) {
  let totalWords = 0;
  let maxStaticDuration = 0;
  let currentStaticDuration = 0;
  let motionEvents = 0;

  beats.forEach(beat => {
    const wordCount = (beat.headline || '').split(/\\s+/).filter(Boolean).length;
    totalWords += wordCount;
    
    // Assume each beat is a motion event if cameraMove is defined and not static
    if (beat.cameraMove && beat.cameraMove.trim().toLowerCase() !== 'static' && beat.cameraMove.trim() !== '') {
      motionEvents++;
      if (currentStaticDuration > maxStaticDuration) {
        maxStaticDuration = currentStaticDuration;
      }
      currentStaticDuration = 0;
    } else {
      const beatDur = (beat.toSec || 0) - (beat.fromSec || 0);
      currentStaticDuration += beatDur;
    }
  });

  if (currentStaticDuration > maxStaticDuration) {
    maxStaticDuration = currentStaticDuration;
  }

  const avgWordsPerBeat = totalWords / (beats.length || 1);
  const motionEventsPerMinute = (motionEvents / (totalDurationSec || 1)) * 60;
  const warnings = [];

  if (avgWordsPerBeat > 4) warnings.push('OVERLOAD: Too many words per beat on average.');
  if (motionEventsPerMinute > 25) warnings.push('OVERLOAD: Too many motion events. Risk of viewer fatigue.');
  if (motionEventsPerMinute < 5) warnings.push('UNDER-STIMULATION: Insufficient kinetic motion.');
  if (maxStaticDuration > 8) warnings.push(`STALE FRAME: Found a static shot lasting ${maxStaticDuration.toFixed(1)}s.`);

  return {
    metrics: {
      avgWordsPerBeat: avgWordsPerBeat.toFixed(1),
      motionEventsPerMinute: motionEventsPerMinute.toFixed(1),
      maxStaticDurationSec: maxStaticDuration.toFixed(1),
      totalWords
    },
    warnings
  };
}

module.exports = { auditStimulus };
