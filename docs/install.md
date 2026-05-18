# 설치 (수동, 한 번만)

대부분의 경우는 루트의 `install.bat` 더블클릭이면 끝입니다. 아래는 수동 설치 / 문제 해결용입니다.

## 사전 요구

| 항목 | 링크 | 비고 |
|---|---|---|
| Python 3.11~3.13 | https://python.org | 설치 시 **Add python.exe to PATH** 체크 |
| git | https://git-scm.com | |
| git-lfs | https://git-lfs.com | 모델 다운로드용 |
| (선택) NVIDIA GPU + 최신 드라이버 | | CUDA 자동 인식, 없으면 CPU 모드 |
| (선택) Visual C++ Redistributable | https://aka.ms/vs/17/release/vc_redist.x64.exe | onnxruntime이 의존 — DLL 로드 에러 시 설치 |

## 수동 설치 절차

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

### 5. 모델 다운로드 (~250MB)

`install.bat`이 받지 않은 경우 수동으로:

cmd:
```
powershell -ExecutionPolicy Bypass -File scripts\setup_assets.ps1
```
PowerShell:
```
.\scripts\setup_assets.ps1
```

이미 받은 모델을 갈아끼울 때는 `-Force` 옵션, 또는 그냥 `assets` 폴더를 통째로 지우고 다시 실행.

### 6. 환경 점검
```
voicewright doctor
```
GPU/CPU 모드, sample rate, 더미 합성 성공 메시지가 나오면 설치 완료.

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `VOICEWRIGHT_USE_GPU` | `auto` | `auto` / `1` / `0` |
| `VOICEWRIGHT_WORKSPACE` | `./workspace` | 배치 출력 루트 |
| `VOICEWRIGHT_VOICE_MAP` | `./config/voice_map.yaml` | 매핑 파일 |
| `VOICEWRIGHT_PRONUNCIATION_MAP` | `./config/pronunciation_map.yaml` | 발음 사전 |
| `VOICEWRIGHT_DEFAULT_SPEED` | `1.00` | 발화 속도 |
| `VOICEWRIGHT_TOTAL_STEP` | `7` | 디노이징 스텝 (높이면 품질↑/시간↑) |
| `VOICEWRIGHT_BATCH_CHUNK_SIZE` | `4` | 배치 청크 크기 (GPU OOM이면 1~2로) |
| `VOICEWRIGHT_HOST` | `0.0.0.0` | 웹 서버 호스트 |
| `VOICEWRIGHT_PORT` | `7878` | 웹 서버 포트 |

## 문제 해결

| 증상 | 원인 / 조치 |
|---|---|
| `Python not found in PATH` | python.org에서 3.11~3.13 설치 시 "Add to PATH" 체크. cmd 새로 열기. |
| `No Python at '...\Python311\python.exe'` | 옛 가상환경이 사라진 Python을 가리킴. `rmdir /s /q .venv` 후 `install.bat`. |
| `DLL load failed while importing onnxruntime_pybind11_state` | Visual C++ 재배포 패키지 설치(위 표 링크) 후 재부팅. |
| `git-lfs is required` | https://git-lfs.com 설치 후 `git lfs install` 한 번. |
| GPU OOM | `VOICEWRIGHT_BATCH_CHUNK_SIZE=1` 또는 `2`로. |
