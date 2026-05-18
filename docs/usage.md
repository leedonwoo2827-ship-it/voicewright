# 사용법 (상세)

웹 UI(`start.bat`)면 충분하지만, CLI나 파이프라인 연동이 필요할 때 참고용.

## CLI

가상환경 활성화 상태에서:

### 한 문장 합성
```
voicewright synth "안녕하세요. 반갑습니다." --voice F2 --out hello.wav
```

### scriptforge 대본 일괄 합성
```
voicewright batch path\to\ch05_script.json
```
출력: `workspace\ch05\audio\ch05_NN_narration.wav` → sceneweaver-capcut가 그대로 소비.

옵션:
```
voicewright batch ch05_script.json --output-root .\workspace --voice-override M3 --speed 1.00
```

### 보이스 목록 + 매핑 확인
```
voicewright voices
```

### 웹 UI 직접 실행 (start.bat 우회)
```
voicewright serve
```

### 환경 점검
```
voicewright doctor
```

## 발음 사전 (`config\pronunciation_map.yaml`)

Supertonic은 영문 약자를 음절 단위로 읽는 경향이 있습니다 (예: `MOOC` → "엠오오씨"). 합성 직전에 자동 치환되는 사전을 둡니다.

```yaml
rules:
  MOOC: 무크
  AI: 에이아이
  CERN: 세른
  BBC: 비비씨
  GPU: 지피유
```

특징:
- **단어 경계 매칭** — `MOOC`는 잡지만 `MOOCAR` 같은 합성어는 안 잡힘
- **SRT 자막에는 적용되지 않음** — 자막은 항상 원본 텍스트
- **사용자 편집 우선** — 카드에서 직접 텍스트를 고친 경우 그 텍스트가 우선
- **즉시 반영** — yaml 수정 후 서버 재시작 불필요 (mtime 자동 감지)
- 우선순위: 사용자 텍스트 편집 > pronunciation_map > 원본 narration_text

웹UI에서도 편집 가능: 상단의 **📖 발음 사전 관리** 링크 → `/dict` 페이지.

### 숫자 / 연도 / 단위 자동 변환

발음 변환 시 다음도 함께 처리됩니다:

| 원문 | 변환 결과 |
|---|---|
| `1989년` | 천구백팔십구년 |
| `27분`, `27초`, `27도`, `27원`, `27일` | 이십칠분 등 (붙여 읽음) |
| `27킬로미터`, `27퍼센트`, `27그램` | 이십칠 킬로미터 등 (한 칸 띄움) |

웹UI의 "한국어 발음 전환" 버튼 또는 배치 탭의 "발음변환 후 일괄 생성"에서 자동 적용.

## 보이스 매핑 (`config\voice_map.yaml`)

scriptforge가 각 scene에 적은 `voice_style` 문자열을 Supertonic 보이스 코드(M1-M5 / F1-F5)로 변환합니다.

```yaml
default: F2
styles:
  narrator:        F2
  calm_female:     F3
  energetic_male:  M4
  내레이터:        F2
```

매핑 실패 시 `male`/`남성`/`female`/`여성` 휴리스틱 → 그래도 없으면 `default`(F2). 알 수 없는 style은 batch 결과의 `warnings`에 기록.

## 파이프라인 위치

```
storylens → scriptforge → flowgenie + voicewright → sceneweaver-capcut
```

scriptforge가 만든 `ch{NN}_script.json`을 받아 모든 scene의 한국어 내레이션을 합성하고, sceneweaver-capcut가 기대하는 `workspace/ch{NN}/audio/ch{NN}_{SS}_narration.wav` 형태로 저장합니다.

## 라이선스

- 본 프로젝트: MIT (`LICENSE`)
- 벤더된 Supertonic 코드: MIT (`LICENSE-THIRD-PARTY.md`)
- 모델 가중치(별도 다운로드): **OpenRAIL-M** — Hugging Face 모델 카드 참조
