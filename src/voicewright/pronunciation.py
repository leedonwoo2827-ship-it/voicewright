from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)


_LETTER_HANGUL = {
    "A": "에이", "B": "비", "C": "씨", "D": "디", "E": "이", "F": "에프",
    "G": "지", "H": "에이치", "I": "아이", "J": "제이", "K": "케이", "L": "엘",
    "M": "엠", "N": "엔", "O": "오", "P": "피", "Q": "큐", "R": "알",
    "S": "에스", "T": "티", "U": "유", "V": "브이", "W": "더블유",
    "X": "엑스", "Y": "와이", "Z": "제트",
}
_ACRONYM_RE = re.compile(r"(?<![A-Za-z])[A-Z]{2,}(?![A-Za-z])")


def _spell_acronym(word: str) -> str:
    return "".join(_LETTER_HANGUL.get(c, c) for c in word)


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
        # 라틴 알파벳 기준 경계 — `\b`를 쓰면 Python regex가 한글도 \w로 취급해서
        # "CERN의" 같은 조사 결합형이 매칭에서 누락된다. lookaround로 인접한
        # 라틴 글자만 차단해서 한글/숫자/공백은 모두 경계로 인정한다.
        self._pattern = re.compile(
            r"(?<![A-Za-z])(?:" + "|".join(escaped) + r")(?![A-Za-z])"
        )

    def apply(self, text: str, *, spell_unknown_acronyms: bool = False) -> str:
        if not text:
            return text
        if self._pattern is not None:
            text = self._pattern.sub(lambda m: self.rules[m.group(0)], text)
        if spell_unknown_acronyms:
            # 사전에 없는 2글자 이상 영문 대문자 약어는 알파벳 단위로 음역
            text = _ACRONYM_RE.sub(lambda m: _spell_acronym(m.group(0)), text)
        return text


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
