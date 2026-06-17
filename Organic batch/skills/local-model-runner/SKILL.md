---
name: local-model-runner
description: Safe execution of local Python ML models without OOM or C-drive bloat
---

# Local Model Runner

<objective>
Execute local ML binaries (Kokoro, Whisper) smoothly through Node.js orchestrators while respecting memory limits (GTX 1650) and file system constraints (D: drive only).
</objective>

<rules>
1. **Never use the global `python` alias blindly.** Always explicitly call the isolated environment: `D:\python_env\python.exe`.
2. **Memory Constraint (VRAM):** When executing `faster-whisper`, configure `device="cuda", compute_type="float16"` to prevent VRAM overflow on the GTX 1650.
3. **Storage Constraint (C-Drive):** Never download HuggingFace models to the C drive. The `.env` file MUST contain `HF_HOME=D:\anitgravity work\.cache\huggingface`. Verify this environment variable is passed to the spawned Python sub-process.
4. **Synchronous Execution:** Await the completion of the Python script and parse its JSON standard output before proceeding. Do not attempt asynchronous overlapping of Whisper and Kokoro if VRAM is limited.
</rules>
