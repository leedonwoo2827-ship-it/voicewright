"""실제 모델을 로드해 합성을 돌리는 slow 스모크 테스트.

실행 조건:
  - assets/가 setup_assets로 채워져 있어야 함
  - onnxruntime(또는 onnxruntime-gpu)이 설치되어 있어야 함

기본은 skip. 명시적으로 활성화: VOICEWRIGHT_RUN_SMOKE=1 pytest tests/test_batch_smoke.py
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest

from voicewright.batch import parse_script, run_batch
from voicewright.engine import Engine
from voicewright.paths import narration_filename
from voicewright import settings as settings_module


pytestmark = pytest.mark.skipif(
    os.environ.get("VOICEWRIGHT_RUN_SMOKE") != "1",
    reason="VOICEWRIGHT_RUN_SMOKE=1로 실행해야 함 (실제 모델 합성)",
)


FIXTURE = Path(__file__).parent / "fixtures" / "ch99_script.json"


@pytest.mark.slow
def test_batch_e2e(tmp_path: Path):
    s = settings_module.load()
    if not (s.voice_styles_dir / "F2.json").exists():
        pytest.skip("assets/voice_styles/F2.json 없음 — setup_assets 먼저 실행")

    raw = FIXTURE.read_bytes()
    script = parse_script(raw)

    async def _run():
        engine = await Engine.get()
        result = await run_batch(
            engine=engine,
            script=script,
            output_root=tmp_path,
            filename_hint=FIXTURE.name,
        )
        return engine, result

    engine, result = asyncio.run(_run())

    assert result.chapter_id == "99"
    assert len(result.files) == 3
    for n in (1, 2, 3):
        f = tmp_path / "ch99" / "audio" / narration_filename("99", n)
        assert f.exists(), f"missing: {f}"
        assert f.stat().st_size > 1024, f"too small: {f}"

    # 매핑되지 않은 voice_style → 경고 1개 이상
    assert any("totally_unknown_style" in w for w in result.warnings)
