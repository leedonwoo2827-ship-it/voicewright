from __future__ import annotations

from dataclasses import dataclass


def format_timestamp(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    total_ms = int(round(seconds * 1000))
    h, rem = divmod(total_ms, 3600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def make_single_srt(text: str, duration: float, *, index: int = 1) -> str:
    end = format_timestamp(max(duration, 0.1))
    body = (text or "").strip()
    return f"{index}\n00:00:00,000 --> {end}\n{body}\n"


@dataclass
class SrtEntry:
    scene: int
    text: str
    duration: float


def make_chapter_srt(entries: list[SrtEntry]) -> str:
    cursor = 0.0
    parts: list[str] = []
    for i, e in enumerate(entries, 1):
        dur = max(e.duration, 0.1)
        start = cursor
        end = cursor + dur
        parts.append(str(i))
        parts.append(f"{format_timestamp(start)} --> {format_timestamp(end)}")
        parts.append((e.text or "").strip())
        parts.append("")
        cursor = end
    return "\n".join(parts).rstrip() + "\n"
