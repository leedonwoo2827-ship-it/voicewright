from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)


@dataclass
class PronunciationMap:
    """약자/외래어를 한국어 발음으로 치환하는 사전.

    SRT 자막에는 적용하지 않는다 — 합성용 텍스트만 변환.
    """
    rules: dict[str, str] = field(default_factory=dict)
    _pattern: "re.Pattern[str] | None" = field(default=None, init=False, repr=False)

    def __post_init__(self) -> None:
        self._compile()

    def _compile(self) -> None:
        if not self.rules:
            self._pattern = None
            return
        # 긴 키부터 매칭 (e.g., HTTPS가 HTTP보다 먼저 잡혀야 함)
        keys = sorted(self.rules.keys(), key=len, reverse=True)
        escaped = [re.escape(k) for k in keys]
        # 단어 경계 — 영문 약자는 \b로 충분, 한글 외래어는 영문 인접일 때만 잡힘
        self._pattern = re.compile(r"\b(?:" + "|".join(escaped) + r")\b")

    def apply(self, text: str) -> str:
        if not text or self._pattern is None:
            return text
        return self._pattern.sub(lambda m: self.rules[m.group(0)], text)


def load_pronunciation_map(path: Path) -> PronunciationMap:
    if not path.exists():
        return PronunciationMap(rules={})
    try:
        with path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    except Exception as exc:
        logger.warning("pronunciation_map.yaml 로드 실패 (%s): %s", path, exc)
        return PronunciationMap(rules={})

    raw = data.get("rules") or {}
    rules: dict[str, str] = {}
    for k, v in raw.items():
        key = str(k).strip()
        val = str(v).strip()
        if key and val:
            rules[key] = val
    return PronunciationMap(rules=rules)
