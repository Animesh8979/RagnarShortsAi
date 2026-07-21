// Smoke test: run analyzeVideo() against the fresh ExplainerVideo render.
// Run from: D:\anitgravity work\packages\skills\video-vision
// Usage: node smoke-test.mjs

import { analyzeVideo } from './dist/index.js';

const VIDEO = 'D:\\anitgravity work\\apps\\studio\\out\\explainer-video.mp4';

console.log('=== video-vision smoke test ===');
console.log('target:', VIDEO);

try {
  const report = await analyzeVideo(VIDEO, {
    sampleFps: 2,
    analysisWidth: 320,
    expectedAspectRatio: 0.5625,  // 9:16
    expectedDurationSec: 23.3,
    durationTolerance: 0.05,
    checkTextLegibility: true,
  });

  console.log('\n=== REPORT ===');
  console.log('passed:', report.passed);
  console.log('qualityScore:', report.qualityScore);
  console.log('issues:', report.issues.length);
  console.log('\n--- issues ---');
  for (const issue of report.issues) {
    console.log(`  [${issue.severity}] ${issue.type}: ${issue.message}`);
  }
  console.log('\n--- meta ---');
  console.log(JSON.stringify(report.meta, null, 2));
  console.log('\n--- frames analyzed ---');
  console.log('count:', report.frames.length);
  if (report.frames.length > 0) {
    const f = report.frames[0];
    console.log('first frame:', JSON.stringify({ index: f.index, time: f.time, mean: f.mean, std: f.std }));
    const last = report.frames[report.frames.length - 1];
    console.log('last frame:', JSON.stringify({ index: last.index, time: last.time, mean: last.mean, std: last.std }));
  }
  console.log('\n=== smoke test PASSED ===');
  process.exit(0);
} catch (e) {
  console.error('\n=== smoke test FAILED ===');
  console.error(e);
  process.exit(1);
}
