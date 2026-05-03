from __future__ import annotations

import io
import logging
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, Response, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse

from pydantic import BaseModel, Field

from .. import settings as settings_module
from ..audio_io import to_wav_bytes
from ..batch import parse_script, run_batch
from ..engine import Engine
from ..pronunciation import load_pronunciation_map
from ..paths import (
    chapter_audio_dir,
    chapter_srt_path,
    chapter_subtitles_dir,
    narration_path,
    resolve_chapter_id,
    srt_path,
)
from ..schemas import (
    BatchSubmitResponse,
    JobStatus,
    SynthesizeRequest,
    VoiceInfoOut,
    VoiceListResponse,
)
from ..srt import make_single_srt
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

    s = settings_module.load()
    audio_dir = chapter_audio_dir(s.workspace_root, rec.chapter)
    sub_dir = chapter_subtitles_dir(s.workspace_root, rec.chapter)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if audio_dir.exists():
            for p in sorted(audio_dir.glob("*.wav")):
                zf.write(p, arcname=f"audio/{p.name}")
        if sub_dir.exists():
            for p in sorted(sub_dir.glob("*.srt")):
                zf.write(p, arcname=f"subtitles/{p.name}")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="ch{rec.chapter}_bundle.zip"'},
    )


# ---------------------------------------------------------------------------
# Scene-by-scene UI: parse → list scenes, synthesize one at a time, serve files
# ---------------------------------------------------------------------------

@router.post("/parse_script")
async def parse_script_endpoint(
    script: UploadFile = File(...),
    chapter: str | None = Form(None),
) -> dict:
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
    vmap = load_voice_map(s.voice_map_path)
    scenes_out = []
    for sc in parsed.scenes:
        code, _ = vmap.resolve(sc.voice_style)
        scenes_out.append({
            "scene": sc.scene,
            "narration_text": sc.narration_text,
            "narration_seconds": sc.narration_seconds,
            "voice_style": sc.voice_style,
            "voice_resolved": code,
            "image_filename": sc.image_filename,
        })
    return {"chapter": chapter_id, "scenes": scenes_out}


@router.post("/synthesize_scene")
async def synthesize_scene(
    chapter: str = Form(...),
    scene: int = Form(...),
    text: str = Form(...),
    srt_text: str | None = Form(None),       # SRT 자막에 들어갈 원본 텍스트 (없으면 text 사용)
    voice: str | None = Form(None),
    voice_style: str | None = Form(None),
    speed: float | None = Form(None),
    total_step: int | None = Form(None),
    narration_seconds: float | None = Form(None),
    output_root: str | None = Form(None),
) -> dict:
    if not text.strip():
        raise HTTPException(status_code=422, detail="empty narration_text")

    engine = await Engine.get()
    s = settings_module.load()
    vmap = load_voice_map(s.voice_map_path)

    if voice:
        voice_code = voice.upper()
        if voice_code not in ALL_VOICE_CODES:
            raise HTTPException(status_code=422, detail=f"unknown voice: {voice}")
    else:
        voice_code, _ = vmap.resolve(voice_style)

    out_root = Path(output_root) if output_root else s.workspace_root

    try:
        wav = await engine.synth(text, voice_code=voice_code, total_step=total_step, speed=speed)
    except Exception as exc:
        logger.exception("synthesize_scene 실패: ch%s scene %s", chapter, scene)
        raise HTTPException(status_code=500, detail=f"synthesis failed: {exc}") from exc

    from ..audio_io import write_wav as _write_wav
    wav_path = narration_path(out_root, chapter, int(scene))
    _write_wav(wav_path, wav, engine.sample_rate)

    actual_duration = float(len(wav)) / float(engine.sample_rate)
    dur_for_srt = narration_seconds if narration_seconds else actual_duration
    body_for_srt = (srt_text or text).strip()  # 자막엔 항상 원본 텍스트가 들어감
    srt_body_str = make_single_srt(body_for_srt, dur_for_srt)
    srt_p = srt_path(out_root, chapter, int(scene))
    srt_p.parent.mkdir(parents=True, exist_ok=True)
    srt_p.write_text(srt_body_str, encoding="utf-8")

    return {
        "chapter": chapter,
        "scene": int(scene),
        "voice": voice_code,
        "duration_seconds": actual_duration,
        "wav_url": f"/api/files/ch{chapter}/audio/{wav_path.name}",
        "srt_url": f"/api/files/ch{chapter}/subtitles/{srt_p.name}",
    }


@router.get("/files/ch{chapter_id}/{kind}/{filename}")
async def serve_workspace_file(chapter_id: str, kind: str, filename: str) -> FileResponse:
    if kind not in ("audio", "subtitles"):
        raise HTTPException(status_code=404, detail="unknown kind")
    if "/" in filename or "\\" in filename or filename.startswith(".."):
        raise HTTPException(status_code=400, detail="invalid filename")
    s = settings_module.load()
    base = s.workspace_root / f"ch{chapter_id}" / kind
    p = base / filename
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    media = "audio/wav" if kind == "audio" else "text/plain; charset=utf-8"
    return FileResponse(str(p), media_type=media, filename=filename)


@router.get("/files/ch{chapter_id}/subtitles_full")
async def serve_chapter_srt(chapter_id: str) -> FileResponse:
    s = settings_module.load()
    p = chapter_srt_path(s.workspace_root, chapter_id)
    if not p.exists():
        raise HTTPException(status_code=404, detail="chapter SRT not generated yet")
    return FileResponse(str(p), media_type="text/plain; charset=utf-8", filename=f"ch{chapter_id}.srt")


class ToPronunciationRequest(BaseModel):
    text: str = Field(..., max_length=5000)


class ToPronunciationResponse(BaseModel):
    text: str


@router.post("/to_pronunciation", response_model=ToPronunciationResponse)
async def to_pronunciation(req: ToPronunciationRequest) -> ToPronunciationResponse:
    """발음 사전 + 미등록 영문 대문자 약어 음역을 적용해 반환."""
    if not req.text.strip():
        return ToPronunciationResponse(text="")
    s = settings_module.load()
    pmap = load_pronunciation_map(s.pronunciation_map_path)
    return ToPronunciationResponse(text=pmap.apply(req.text, spell_unknown_acronyms=True))


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
