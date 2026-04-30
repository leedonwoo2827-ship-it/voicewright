from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice: str | None = None
    voice_style: str | None = None
    speed: float | None = None
    total_step: int | None = None
    lang: str = "ko"


class VoiceInfoOut(BaseModel):
    code: str
    gender: Literal["male", "female"]
    default_for_unknown: bool = False


class VoiceListResponse(BaseModel):
    voices: list[VoiceInfoOut]
    voice_map: dict[str, str]
    default: str


class ScriptScene(BaseModel):
    scene: int
    narration_text: str
    narration_seconds: float | None = None
    voice_style: str | None = None
    image_filename: str | None = None

    model_config = {"extra": "ignore"}


class Script(BaseModel):
    chapter: str | int | None = None
    scenes: list[ScriptScene]

    model_config = {"extra": "ignore"}


class BatchSubmitResponse(BaseModel):
    job_id: str
    scene_count: int
    chapter: str
    status_url: str


class JobProgress(BaseModel):
    completed: int = 0
    total: int = 0
    current_scene: int | None = None


class JobStatus(BaseModel):
    job_id: str
    status: Literal["queued", "running", "done", "error"]
    progress: JobProgress
    output_dir: str
    files: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
