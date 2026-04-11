#!/usr/bin/env python3
"""
Chatterbox TTS inference script.

Called from Node.js via chatterbox-bridge.js.
Accepts JSON params as first CLI argument.

Usage:
    python scripts/chatterbox_tts.py '{"text": "Hello world", "output": "out.wav", "exaggeration": 0.5}'
"""

import sys
import json
import os

def main():
    if len(sys.argv) < 2:
        print("Usage: chatterbox_tts.py '<json_params>'", file=sys.stderr)
        sys.exit(1)

    try:
        params = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(f"Invalid JSON params: {e}", file=sys.stderr)
        sys.exit(1)

    text = params.get('text', '')
    output_path = params.get('output', 'output.wav')
    exaggeration = float(params.get('exaggeration', 0.5))
    cfg_scale = float(params.get('cfg_scale', 0.5))
    reference_audio = params.get('reference_audio', None)

    if not text:
        print("Error: empty text", file=sys.stderr)
        sys.exit(1)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    try:
        from chatterbox.tts import ChatterboxTTS
        import torchaudio

        print(f"Loading Chatterbox model...", file=sys.stderr)
        model = ChatterboxTTS.from_pretrained(device="cuda")

        print(f"Generating speech: \"{text[:60]}...\" (exaggeration={exaggeration})", file=sys.stderr)

        generate_kwargs = {
            'exaggeration': exaggeration,
            'cfg_scale': cfg_scale,
        }

        if reference_audio and os.path.exists(reference_audio):
            generate_kwargs['audio_prompt_path'] = reference_audio
            print(f"Using reference audio: {reference_audio}", file=sys.stderr)

        wav = model.generate(text, **generate_kwargs)
        torchaudio.save(output_path, wav, model.sr)

        file_size = os.path.getsize(output_path)
        print(f"Saved: {output_path} ({file_size / 1024:.0f}KB)", file=sys.stderr)

    except ImportError as e:
        print(f"Chatterbox not installed: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Generation failed: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
