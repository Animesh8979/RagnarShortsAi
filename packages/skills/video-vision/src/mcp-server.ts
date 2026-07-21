// video-vision/src/mcp-server.ts — Expose the video-vision skill as an MCP server
//
// Tools provided:
//   - analyze_video: full VisionReport (container + frame flaws + verdict + score)
//   - get_video_info: cheap container probe only
//   - extract_frames_debug: dump N evenly-spaced frames as PNGs for human review
//
// Runs over stdio. No auth - this server is for local agent use only.
// All paths must be on the D: drive (enforced by @antigravity/config).

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { analyzeVideo, probeVideo } from './index.js';
import { validateDrivePath } from '@antigravity/config';
import * as fs from 'fs';
import * as path from 'path';

const TOOLS = [
  {
    name: 'analyze_video',
    description:
      'Run full frame-level vision analysis on a rendered video. Returns container metadata, per-frame statistics, detected flaws (black frames, freeze, letterbox, aspect dev, brightness drift, clipping, text legibility, flicker), a 0-100 quality score, and a boolean pass/fail verdict.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        videoPath: { type: 'string', description: 'Absolute path to the .mp4 file (D: drive only)' },
        sampleFps: { type: 'number', description: 'Sampling rate in fps. Default 2 (lower = faster).' },
        analysisWidth: { type: 'number', description: 'Downscale width before pixel analysis. Default 320.' },
        expectedAspectRatio: { type: 'number', description: 'Target aspect ratio. Default 0.5625 (9:16).' },
        expectedDurationSec: { type: 'number', description: 'Expected duration in seconds for tolerance check. Default 0 = skip.' },
        checkTextLegibility: { type: 'boolean', description: 'Run the text-contrast heuristic. Default true.' },
      },
      required: ['videoPath'],
    },
  },
  {
    name: 'get_video_info',
    description: 'Probe a video file with ffprobe. Returns duration, resolution, fps, codec, audio presence, file size. Cheap - no frame extraction.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        videoPath: { type: 'string', description: 'Absolute path to the video file (D: drive only)' },
      },
      required: ['videoPath'],
    },
  },
  {
    name: 'extract_frames_debug',
    description: 'Dump N evenly-spaced frames as PNGs into a directory for human/machine review. Useful when a flaw is flagged and you want to eyeball the frame.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        videoPath: { type: 'string', description: 'Absolute path to the video file' },
        outputDir: { type: 'string', description: 'Directory to save frames (D: drive only)' },
        count: { type: 'number', description: 'Number of frames to extract. Default 12.' },
      },
      required: ['videoPath', 'outputDir'],
    },
  },
];

const server = new Server(
  { name: 'video-vision-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params as any;
  try {
    if (name === 'analyze_video') {
      const { videoPath, ...opts } = args;
      validateDrivePath(videoPath);
      const report = await analyzeVideo(videoPath, opts);
      const summary = {
        passed: report.passed,
        qualityScore: report.qualityScore,
        issueCount: report.issues.length,
        issues: report.issues.map((i: any) => `[${i.severity}] ${i.code}: ${i.message}`),
        meta: report.meta,
      };
      return {
        content: [
          { type: 'text', text: JSON.stringify(summary, null, 2) },
          { type: 'text', text: 'Full report (with per-frame stats) available in the returned JSON object.' },
        ],
        isError: false,
      };
    }
    if (name === 'get_video_info') {
      const { videoPath } = args;
      validateDrivePath(videoPath);
      const meta = await probeVideo(videoPath);
      return { content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }], isError: false };
    }
    if (name === 'extract_frames_debug') {
      const { videoPath, outputDir, count = 12 } = args;
      validateDrivePath(videoPath);
      validateDrivePath(outputDir);
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      // Use ffmpeg select filter to grab evenly spaced frames.
      const { spawn } = await import('child_process');
      await new Promise<void>((resolve, reject) => {
        const child = spawn('ffmpeg', [
          '-i', videoPath,
          '-vf', `fps=${count}/duration`,
          '-q:v', '2',
          path.join(outputDir, 'frame_%03d.png'),
        ], { shell: false, windowsHide: true });
        let stderr = '';
        child.stderr.on('data', (b: Buffer) => { stderr += b.toString(); });
        child.on('close', (c) => c === 0 ? resolve() : reject(new Error(stderr.slice(0, 300))));
      });
      const written = fs.readdirSync(outputDir).filter((f) => f.endsWith('.png'));
      return {
        content: [{ type: 'text', text: `Extracted ${written.length} frames to ${outputDir}: ${written.join(', ')}` }],
        isError: false,
      };
    }
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `video-vision error: ${(err as Error).message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('video-vision-mcp running on stdio');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
