# voicewright

> 로컬 한국어 TTS. **Supertone Supertonic** 기반.
> 파이프라인: storylens → scriptforge → flowgenie + **voicewright** → sceneweaver-capcut

scriptforge가 만든 `ch{NN}_script.json`을 받아 모든 scene의 한국어 내레이션을 합성하고, sceneweaver-capcut가 기대하는 `workspace/ch{NN}/audio/ch{NN}_{SS}_narration.wav` 형태로 저장합니다.

---

## 설치 (한 번만)

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
voicewright batch ch05_script.json --output-root .\workspace --voice-override M3 --speed 1.05
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

## 보이스 매핑

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
| `VOICEWRIGHT_DEFAULT_SPEED` | `1.05` | 발화 속도 |
| `VOICEWRIGHT_TOTAL_STEP` | `5` | 디노이징 스텝 (높이면 품질↑/시간↑) |
| `VOICEWRIGHT_BATCH_CHUNK_SIZE` | `4` | 배치 청크 크기 (GPU OOM이면 1-2로) |

---

## 라이선스

- 본 프로젝트: MIT (`LICENSE`)
- 벤더된 Supertonic 코드: MIT (`LICENSE-THIRD-PARTY.md`)
- 모델 가중치(별도 다운로드): **OpenRAIL-M** — Hugging Face 모델 카드 참조
