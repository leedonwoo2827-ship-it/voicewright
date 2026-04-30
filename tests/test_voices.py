from pathlib import Path

import pytest
import yaml

from voicewright.voices import VoiceMap, load_voice_map, ALL_VOICE_CODES


def _vm(default="F2", styles=None):
    return VoiceMap(default=default, styles={k.lower(): v for k, v in (styles or {}).items()})


def test_resolve_known_style():
    vm = _vm(styles={"narrator": "F2", "calm_female": "F3"})
    code, w = vm.resolve("narrator")
    assert code == "F2"
    assert w is None
    code, w = vm.resolve("Calm_Female")  # case-insensitive
    assert code == "F3"


def test_resolve_default_when_none():
    vm = _vm()
    code, w = vm.resolve(None)
    assert code == "F2"
    assert w is None


def test_resolve_male_heuristic():
    vm = _vm()
    code, w = vm.resolve("super_loud_male_thing")
    assert code == "M3"
    assert "M3" in w


def test_resolve_female_heuristic():
    vm = _vm()
    code, w = vm.resolve("여성_화남")
    assert code == "F2"
    assert "F2" in w


def test_resolve_fallback_default():
    vm = _vm()
    code, w = vm.resolve("totally_unknown")
    assert code == "F2"
    assert "default" in w


def test_load_voice_map(tmp_path: Path):
    p = tmp_path / "voice_map.yaml"
    p.write_text(yaml.safe_dump({
        "default": "F3",
        "styles": {"narrator": "F2", "calm_male": "M3", "BAD_CODE": "ZZ"},
    }), encoding="utf-8")
    vm = load_voice_map(p)
    assert vm.default == "F3"
    assert vm.styles["narrator"] == "F2"
    assert vm.styles["calm_male"] == "M3"
    assert "bad_code" not in vm.styles


def test_load_voice_map_missing_file(tmp_path: Path):
    vm = load_voice_map(tmp_path / "nope.yaml")
    assert vm.default == "M5"
    assert vm.styles == {}


def test_all_voice_codes_have_gender():
    males = [c for c in ALL_VOICE_CODES if c.startswith("M")]
    females = [c for c in ALL_VOICE_CODES if c.startswith("F")]
    assert len(males) == 5
    assert len(females) == 5
