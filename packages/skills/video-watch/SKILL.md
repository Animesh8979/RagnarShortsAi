# Video Watch — Auto-QA for Rendered Videos

**Purpose**: Monitor the renders directory and automatically run quality checks on every rendered video.
**Triggers**: File watcher on D:\antigravity-renders (or configured path).

## What It Checks

| Check | Threshold | Action on Fail |
|---|---|---|
| File size > 10KB | No empty renders | Log warning |
| Audio track present | Must have audio | Log warning |
| No black frames (first 2s) | > 95% brightness | Log warning, mark for re-render |
| Duration matches target | ±5% of expected | Log warning |

## Usage

```typescript
import { startWatching } from '@antigravity/skills/video-watch';

const watcher = startWatching('D:\\antigravity-renders', {
  onVideoDetected: async (videoPath) => {
    console.log('New render detected:', videoPath);
  },
  onQaCompleted: (result) => {
    if (!result.passed) {
      console.error('QA failed:', result.issues);
    }
  }
});

// Stop later
watcher.close();
```

## Dependencies

- `ffprobe` (via `safeExec` from `@antigravity/security`)
- `@antigravity/utils` for file ops
