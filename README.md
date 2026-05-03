# voicewright

> 로컬 한국어 TTS. **Supertone Supertonic** 기반.
> 파이프라인: storylens → scriptforge → flowgenie + **voicewright** → sceneweaver-capcut

scriptforge가 만든 `ch{NN}_script.json`을 받아 모든 scene의 한국어 내레이션을 합성하고, sceneweaver-capcut가 기대하는 `workspace/ch{NN}/audio/ch{NN}_{SS}_narration.wav` 형태로 저장합니다.

---

## 빠른 시작 (Windows, 더블클릭)

레포 클론 후:

| 파일 | 동작 |
|---|---|
| **`install.bat`** | venv 생성 → GPU 자동 감지 → 의존성 설치 → 모델 다운로드(~250MB) → doctor |
| **`start.bat`** | 웹 UI 실행 (`http://localhost:7878`) |
| `doctor.bat` | 환경 점검 (GPU/CPU 모드, sample rate 확인) |

> 사전 요구: [Python 3.11+](https://python.org), [git](https://git-scm.com), [git-lfs](https://git-lfs.com)
> NVIDIA GPU가 있으면 자동으로 GPU(CUDA) 모드로 설치, 없으면 CPU 모드로 설치됩니다.

---

## 설치 (수동, 한 번만)

### 1. 가상환경 만들기

```
python -m venv .venv
```

### 2. 가상환경 활성화

cmd:
```
.venv\Scripts\activate.bat
```

PowerShell:
```
.\.venv\Scripts\Activate.ps1
```

프롬프트 앞에 `(.venv)` 표시가 붙으면 성공.

### 3. pip 업그레이드

```
python -m pip install --upgrade pip
```

### 4. voicewright 설치

NVIDIA GPU(CUDA) 있으면:
```
pip install -e ".[gpu]"
```

GPU 없으면:
```
pip install -e ".[cpu]"
```

> `onnxruntime`과 `onnxruntime-gpu`는 같은 모듈명이라 둘 중 하나만 설치해야 합니다.

### 5. 모델 다운로드 (1~2GB)

git-lfs가 필요합니다. 미설치라면 https://git-lfs.com 에서 먼저 설치.

cmd:
```
powershell -ExecutionPolicy Bypass -File scripts\setup_assets.ps1
```

PowerShell:
```
.\scripts\setup_assets.ps1
```

### 6. 환경 점검

```
voicewright doctor
```

GPU/CPU 모드, sample rate, 더미 합성 성공 메시지가 나오면 설치 완료.

---

## 실행

### 한 문장 합성

```
voicewright synth "안녕하세요. 반갑습니다." --voice F2 --out hello.wav
```

### scriptforge 대본 일괄 합성

```
voicewright batch path\to\ch05_script.json
```

출력: `workspace\ch05\audio\ch05_NN_narration.wav`
→ sceneweaver-capcut가 그대로 소비.

옵션:
```
voicewright batch ch05_script.json --output-root .\workspace --voice-override M3 --speed 1.00
```

### 보이스 목록 + 매핑 확인

```
voicewright voices
```

### 브라우저 UI (옵션)

```
voicewright serve
```
브라우저로 `http://localhost:7878` 접속. 자유 텍스트 / 대본 일괄 두 탭.

---

## 발음 사전 (config\pronunciation_map.yaml)

Supertonic은 영문 약자를 음절 단위로 읽는 경향이 있습니다 (예: `MOOC` → "엠오오씨"). 자연스러운 한국어 발음을 위해 합성 직전에 자동 치환되는 사전을 둡니다.

```yaml
# config/pronunciation_map.yaml
rules:
  MOOC: 무크
  AI: 에이아이
  CERN: 세른
  BBC: 비비씨
  GPU: 지피유
  # 새 약자가 등장하면 한 줄 추가
```

특징:
- **단어 경계 매칭** — `MOOC` 는 잡지만 `MOOCAR` 같은 합성어는 안 잡힘
- **SRT 자막에는 적용되지 않음** — 자막에는 항상 원본 텍스트가 들어갑니다
- **사용자 편집 우선** — 카드의 textarea에서 직접 발음을 고친 경우, 그 텍스트가 우선 사용됩니다
- **즉시 반영** — yaml 수정 후 서버 재시작 불필요. 다음 합성 호출에 적용됨
- 우선순위: 사용자 텍스트 편집 > pronunciation_map > 원본 narration_text

기본 사전에 학습/방송/IT/기관/포맷 관련 일반적인 약자가 미리 들어있고, 본인 콘텐츠에 자주 등장하는 단어를 자유롭게 추가하시면 됩니다.

## 보이스 매핑 (config\voice_map.yaml)

scriptforge가 각 scene에 적은 `voice_style` 문자열을 Supertonic 보이스 코드(M1-M5 / F1-F5)로 변환합니다.

`config\voice_map.yaml` 편집:
```yaml
default: F2
styles:
  narrator:        F2
  calm_female:     F3
  energetic_male:  M4
  내레이터:        F2
```

매핑 실패 시 `male`/`남성`/`female`/`여성` 휴리스틱 → 그래도 없으면 `default`(F2). 알 수 없는 style은 batch 결과의 `warnings`에 기록.

---

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `VOICEWRIGHT_USE_GPU` | `auto` | `auto` / `1` / `0` |
| `VOICEWRIGHT_WORKSPACE` | `./workspace` | 배치 출력 루트 |
| `VOICEWRIGHT_VOICE_MAP` | `./config/voice_map.yaml` | 매핑 파일 |
| `VOICEWRIGHT_DEFAULT_SPEED` | `1.00` | 발화 속도 |
| `VOICEWRIGHT_TOTAL_STEP` | `5` | 디노이징 스텝 (높이면 품질↑/시간↑) |
| `VOICEWRIGHT_BATCH_CHUNK_SIZE` | `4` | 배치 청크 크기 (GPU OOM이면 1-2로) |

---

## 라이선스

- 본 프로젝트: MIT (`LICENSE`)
- 벤더된 Supertonic 코드: MIT (`LICENSE-THIRD-PARTY.md`)
- 모델 가중치(별도 다운로드): **OpenRAIL-M** — Hugging Face 모델 카드 참조
