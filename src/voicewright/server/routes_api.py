from __future__ import annotations

import io
import logging
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, Response, UploadFile, File
from fastapi.responses import StreamingResponse

from .. import settings as settings_module
from ..audio_io import to_wav_bytes
from ..batch import parse_script, run_batch
from ..engine import Engine
from ..paths import resolve_chapter_id
from ..schemas import (
    BatchSubmitResponse,
    JobStatus,
    SynthesizeRequest,
    VoiceInfoOut,
    VoiceListResponse,
)
from ..voices import ALL_VOICE_CODES, load_voice_map
from .jobs import JobRecord, get_registry

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/voices", response_model=VoiceListResponse)
async def get_voices() -> VoiceListResponse:
    s = settings_module.load()
    vmap = load_voice_map(s.voice_map_path)
    voices = [
        VoiceInfoOut(
            code=c,
            gender="male" if c.startswith("M") else "female",
            default_for_unknown=(c == vmap.default),
        )
        for c in ALL_VOICE_CODES
    ]
    return VoiceListResponse(voices=voices, voice_map=dict(vmap.styles), default=vmap.default)


@router.post("/synthesize")
async def synthesize(req: SynthesizeRequest) -> Response:
    engine = await Engine.get()
    s = settings_module.load()
    vmap = load_voice_map(s.voice_map_path)

    if req.voice:
        voice_code = req.voice.upper()
        if voice_code not in ALL_VOICE_CODES:
            raise HTTPException(status_code=422, detail=f"unknown voice: {req.voice}")
    else:
        voice_code, _ = vmap.resolve(req.voice_style)

    try:
        wav = await engine.synth(
            req.text,
            voice_code=voice_code,
            lang=req.lang,
            total_step=req.total_step,
            speed=req.speed,
        )
    except Exception as exc:
        logger.exception("synthesize 실패")
        raise HTTPException(status_code=500, detail=f"synthesis failed: {exc}") from exc

    data = to_wav_bytes(wav, engine.sample_rate)
    ts = int(time.time())
    return Response(
        content=data,
        media_type="audio/wav",
        headers={"Content-Disposition": f'attachment; filename="synth_{voice_code}_{ts}.wav"'},
    )


async def _run_batch_job(rec: JobRecord, *, raw: bytes, filename: str | None,
                        chapter_explicit: str | None, output_root: str | None,
                        voice_override: str | None, speed: float | None,
                        total_step: int | None) -> None:
    try:
        rec.status = "running"
        engine = await Engine.get()
        script = parse_script(raw)

        async def cb(completed: int, total: int, current: int | None):
            rec.completed = completed
            rec.current_scene = current

        result = await run_batch(
            engine=engine,
            script=script,
            chapter_id_explicit=chapter_explicit,
            filename_hint=filename,
            output_root=Path(output_root) if output_root else None,
            voice_override=voice_override,
            speed=speed,
            total_step=total_step,
            on_progress=cb,
        )
        rec.files = result.files
        rec.warnings = result.warnings
        rec.output_dir = result.output_dir
        rec.status = "done"
    except Exception as exc:
        logger.exception("batch job 실패: %s", rec.job_id)
        rec.status = "error"
        rec.error = str(exc)
    finally:
        rec.finished_at = datetime.now(timezone.utc)


@router.post("/batch", response_model=BatchSubmitResponse)
async def submit_batch(
    background: BackgroundTasks,
    script: UploadFile = File(...),
    chapter: str | None = Form(None),
    output_root: str | None = Form(None),
    voice_override: str | None = Form(None),
    speed: float | None = Form(None),
    total_step: int | None = Form(None),
) -> BatchSubmitResponse:
    raw = await script.read()
    if not raw:
        raise HTTPException(status_code=422, detail="empty script file")

    try:
        parsed = parse_script(raw)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"invalid script JSON: {exc}") from exc

    try:
        chapter_id = resolve_chapter_id(
            explicit=chapter,
            script_field=parsed.chapter,
            filename_hint=script.filename,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    s = settings_module.load()
    out_root = Path(output_root) if output_root else s.workspace_root
    out_dir = out_root / f"ch{chapter_id}" / "audio"

    if voice_override and voice_override.upper() not in ALL_VOICE_CODES:
        raise HTTPException(status_code=422, detail=f"unknown voice: {voice_override}")

    registry = get_registry()
    rec = await registry.create(chapter=chapter_id, scene_count=len(parsed.scenes), output_dir=out_dir)

    background.add_task(
        _run_batch_job,
        rec,
        raw=raw,
        filename=script.filename,
        chapter_explicit=chapter,
        output_root=output_root,
        voice_override=voice_override.upper() if voice_override else None,
        speed=speed,
        total_step=total_step,
    )

    return BatchSubmitResponse(
        job_id=rec.job_id,
        scene_count=len(parsed.scenes),
        chapter=chapter_id,
        status_url=f"/api/jobs/{rec.job_id}",
    )


@router.get("/jobs/{job_id}", response_model=JobStatus)
async def get_job(job_id: str) -> JobStatus:
    rec = await get_registry().get(job_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="job not found")
    return rec.to_status()


@router.get("/jobs/{job_id}/zip")
async def get_job_zip(job_id: str) -> StreamingResponse:
    rec = await get_registry().get(job_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="job not found")
    if rec.status != "done":
        raise HTTPException(status_code=409, detail=f"job not done (status={rec.status})")

    out_dir = Path(rec.output_dir)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in rec.files:
            p = out_dir / fname
            if p.exists():
                zf.write(p, arcname=fname)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="ch{rec.chapter}_audio.zip"'},
    )


@router.get("/health")
async def health() -> dict:
    s = settings_module.load()
    info: dict = {
        "status": "ok",
        "use_gpu_mode": s.use_gpu_mode,
        "engine_loaded": Engine._instance is not None,
    }
    if Engine._instance is not None:
        info["providers"] = Engine._instance.providers
        info["sample_rate"] = Engine._instance.sample_rate
    return info
