from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import numpy as np

from . import settings as settings_module
from ._assets_check import check_assets
from ._vendor.supertonic_helper import (
    Style,
    TextToSpeech,
    load_text_to_speech_with_providers,
    load_voice_style,
)
from .voices import voice_preset_path

logger = logging.getLogger(__name__)


def _select_providers(use_gpu: bool) -> list[str]:
    if not use_gpu:
        return ["CPUExecutionProvider"]
    try:
        import onnxruntime as ort
        available = set(ort.get_available_providers())
    except Exception:
        available = set()

    preferred = ["CUDAExecutionProvider", "DmlExecutionProvider", "CPUExecutionProvider"]
    chosen = [p for p in preferred if p in available] if available else ["CUDAExecutionProvider", "CPUExecutionProvider"]
    if "CPUExecutionProvider" not in chosen:
        chosen.append("CPUExecutionProvider")
    return chosen


class Engine:
    _instance: "Engine | None" = None
    _init_lock = asyncio.Lock()

    def __init__(self, onnx_dir: Path, voice_styles_dir: Path, use_gpu: bool):
        check_assets(onnx_dir, voice_styles_dir)
        providers = _select_providers(use_gpu)
        logger.info("Loading Supertonic engine from %s with providers=%s", onnx_dir, providers)
        self._tts: TextToSpeech = load_text_to_speech_with_providers(str(onnx_dir), providers)
        self._infer_lock = asyncio.Lock()
        self.providers = providers
        self.use_gpu_active = "CUDAExecutionProvider" in providers or "DmlExecutionProvider" in providers
        self.sample_rate: int = int(self._tts.sample_rate)
        self._voice_styles_dir = voice_styles_dir
        self._style_cache: dict[str, Style] = {}

    @classmethod
    async def get(cls) -> "Engine":
        if cls._instance is None:
            async with cls._init_lock:
                if cls._instance is None:
                    s = settings_module.load()
                    cls._instance = cls(s.onnx_dir, s.voice_styles_dir, s.resolve_use_gpu())
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        cls._instance = None

    def _style_for(self, voice_code: str) -> Style:
        code = voice_code.upper()
        if code not in self._style_cache:
            path = voice_preset_path(self._voice_styles_dir, code)
            self._style_cache[code] = load_voice_style([str(path)])
        return self._style_cache[code]

    def _styles_for(self, voice_codes: list[str]) -> Style:
        paths = [str(voice_preset_path(self._voice_styles_dir, c.upper())) for c in voice_codes]
        return load_voice_style(paths)

    def _trim_wav(self, wav: np.ndarray, dur: np.ndarray, idx: int = 0) -> np.ndarray:
        n = int(self.sample_rate * float(dur[idx]))
        n = max(0, min(n, wav.shape[-1]))
        return wav[idx, :n] if wav.ndim == 2 else wav[:n]

    async def synth(
        self,
        text: str,
        *,
        voice_code: str,
        lang: str = "ko",
        total_step: int | None = None,
        speed: float | None = None,
    ) -> np.ndarray:
        s = settings_module.load()
        ts = total_step if total_step is not None else s.default_total_step
        sp = speed if speed is not None else s.default_speed
        style = self._style_for(voice_code)
        async with self._infer_lock:
            wav, dur = await asyncio.to_thread(self._tts, text, lang, style, ts, sp)
        return self._trim_wav(wav, dur, 0)

    async def synth_batch_same_voice(
        self,
        text_list: list[str],
        *,
        voice_code: str,
        lang: str = "ko",
        total_step: int | None = None,
        speed: float | None = None,
    ) -> list[np.ndarray]:
        s = settings_module.load()
        ts = total_step if total_step is not None else s.default_total_step
        sp = speed if speed is not None else s.default_speed
        style = self._styles_for([voice_code] * len(text_list))
        lang_list = [lang] * len(text_list)
        async with self._infer_lock:
            wav, dur = await asyncio.to_thread(self._tts.batch, text_list, lang_list, style, ts, sp)
        return [self._trim_wav(wav, dur, i) for i in range(len(text_list))]
