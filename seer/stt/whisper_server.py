#!/usr/bin/env python3
"""Speech to text for the companion, on roverbyteseer (companion C-83, 2026-10-07).

An OpenAI-compatible transcription server on MLX Whisper, so it runs on the Mac's own GPU and nothing leaves the
house. n8n's daemon/talk and daemon/hear call it (DAEMONS_STT_URL); anything that speaks OpenAI's API can.

    POST /v1/audio/transcriptions   multipart: file=<audio>, model (ignored: this server has one), language (optional),
                                    response_format=json|text  ->  {"text": "..."}
    GET  /health                    {"ok": true, "model": ...}

Run:   WHISPER_MODEL=mlx-community/whisper-large-v3-turbo  python3 whisper_server.py   (port 8770, all interfaces; 8000 is taken on roverbyteseer)
The model downloads on first use (about 1.6 GB for large-v3-turbo) and stays loaded. ffmpeg must be installed: it
reads whatever the device recorded (wav, mp3, m4a, ...).
"""
import os, tempfile, time

import mlx_whisper
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse

MODEL = os.environ.get("WHISPER_MODEL", "mlx-community/whisper-large-v3-turbo")
PORT = int(os.environ.get("WHISPER_PORT", "8770"))
app = FastAPI(title="DAEMONS speech to text")


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL}


@app.post("/v1/audio/transcriptions")
async def transcriptions(file: UploadFile = File(...), model: str = Form("whisper-1"), language: str = Form(None),
                         response_format: str = Form("json")):
    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(await file.read())
        path = f.name
    try:
        t = time.time()
        out = mlx_whisper.transcribe(path, path_or_hf_repo=MODEL, language=language or None)
        text = (out.get("text") or "").strip()
        print("heard in %.1fs: %s" % (time.time() - t, text[:80]), flush=True)
    except Exception as e:                       # a bad file is the caller's answer, not a crash
        return JSONResponse({"text": "", "error": str(e)[:200]}, status_code=400)
    finally:
        os.unlink(path)
    if response_format == "text":
        return PlainTextResponse(text)
    return {"text": text}


if __name__ == "__main__":
    # Warm the model once at start, so the first person to speak does not wait for the download and the load.
    try:
        import numpy as np
        mlx_whisper.transcribe(np.zeros(16000, dtype=np.float32), path_or_hf_repo=MODEL)
        print("model ready:", MODEL, flush=True)
    except Exception as e:
        print("warm-up skipped:", e, flush=True)
    uvicorn.run(app, host="0.0.0.0", port=PORT)
