(() => {
  // ---- 탭 ----
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panel');
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.toggle('active', x === t));
    panels.forEach(p => p.classList.toggle('active', p.id === `tab-${t.dataset.tab}`));
  }));

  // ---- 보이스 목록 + 엔진 정보 ----
  let voicesData = null;
  async function loadVoices() {
    const res = await fetch('/api/voices');
    if (!res.ok) throw new Error('voice list failed');
    voicesData = await res.json();

    const v = document.getElementById('voice');
    const vo = document.getElementById('voiceOverride');
    voicesData.voices.forEach(item => {
      const label = `${item.code} (${item.gender})${item.default_for_unknown ? ' ★' : ''}`;
      const o1 = document.createElement('option');
      o1.value = item.code; o1.textContent = label;
      if (item.default_for_unknown) o1.selected = true;
      v.appendChild(o1);
      const o2 = document.createElement('option');
      o2.value = item.code; o2.textContent = label;
      vo.appendChild(o2);
    });
  }
  async function loadHealth() {
    try {
      const res = await fetch('/api/health');
      const j = await res.json();
      const info = document.getElementById('engineInfo');
      if (j.engine_loaded) {
        info.textContent = `${(j.providers || ['?'])[0]} · ${j.sample_rate}Hz`;
      } else {
        info.textContent = `대기 중 (use_gpu=${j.use_gpu_mode}). 첫 요청 시 모델 로드.`;
      }
    } catch {
      document.getElementById('engineInfo').textContent = '연결 실패';
    }
  }
  loadVoices().catch(e => console.error(e));
  loadHealth();

  // ---- 슬라이더 라벨 ----
  function bindSlider(id, valId) {
    const el = document.getElementById(id);
    const vEl = document.getElementById(valId);
    el.addEventListener('input', () => vEl.textContent = el.value);
  }
  bindSlider('speed', 'speedValue');
  bindSlider('totalStep', 'stepValue');
  bindSlider('batchSpeed', 'batchSpeedValue');
  bindSlider('batchTotalStep', 'batchStepValue');

  // ---- 단일 합성 (자유 텍스트 탭) ----
  //  발음(TTS 입력) / 자막(SRT 출력) 두 textarea를 분리 관리.
  //  - 자막을 따로 손대지 않았으면 발음 입력이 자동 동조 → 자막에도 같은 값
  //  - "한국어 발음 전환"은 발음 박스만 변환 (자막은 원본 유지)
  //  - ↺ 원본은 마지막으로 사용자가 입력한 원본으로 복원
  const singleCard = document.getElementById('singleCard');
  const pronTa = document.getElementById('text');
  const srtTa = document.getElementById('srtText');
  const toPronBtn = document.getElementById('toPronunciation');
  const resetPronBtn = document.getElementById('resetPron');
  const resetSrtBtn = document.getElementById('resetSrt');
  let singleOriginal = '';   // 사용자가 입력한 원본 (발음 전환 전)
  let srtTouched = false;    // 사용자가 자막 박스를 따로 수정했는지

  function updateResetButtons() {
    resetPronBtn.disabled = pronTa.value === singleOriginal;
    resetSrtBtn.disabled = !srtTouched;
    singleCard.classList.toggle('pron-modified', pronTa.value !== singleOriginal);
    singleCard.classList.toggle('srt-modified', srtTouched);
  }

  pronTa.addEventListener('input', () => {
    // 발음 전환 버튼이 변경한 게 아니라 사용자가 직접 친 입력 — singleOriginal 갱신,
    // 자막이 아직 손대지 않았으면 동조
    singleOriginal = pronTa.value;
    if (!srtTouched) srtTa.value = pronTa.value;
    updateResetButtons();
  });
  srtTa.addEventListener('input', () => {
    srtTouched = srtTa.value !== singleOriginal;
    updateResetButtons();
  });
  resetPronBtn.addEventListener('click', () => {
    pronTa.value = singleOriginal;
    updateResetButtons();
  });
  resetSrtBtn.addEventListener('click', () => {
    srtTa.value = singleOriginal;
    srtTouched = false;
    updateResetButtons();
  });

  toPronBtn.addEventListener('click', async () => {
    const src = pronTa.value;
    if (!src.trim()) return;
    toPronBtn.disabled = true;
    const oldLabel = toPronBtn.textContent;
    toPronBtn.textContent = '전환 중…';
    try {
      const res = await fetch('/api/to_pronunciation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: src }),
      });
      if (!res.ok) {
        let detail = res.statusText;
        try { detail = (await res.json()).detail || detail; } catch {}
        throw new Error(detail);
      }
      const data = await res.json();
      if (data.text && data.text !== src) {
        pronTa.value = data.text;
        // 사용자 입력 이벤트가 아니므로 singleOriginal은 그대로 둔다 (자막 동조 X)
        updateResetButtons();
      }
    } catch (e) {
      const errEl = document.getElementById('singleError');
      errEl.textContent = `발음 전환 실패: ${e.message}`;
      errEl.classList.remove('hidden');
    } finally {
      toPronBtn.disabled = false;
      toPronBtn.textContent = oldLabel;
    }
  });

  function formatSrtTime(sec) {
    const total = Math.max(0, sec || 0);
    const ms = Math.round((total - Math.floor(total)) * 1000);
    const t = Math.floor(total);
    const hh = String(Math.floor(t / 3600)).padStart(2, '0');
    const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss},${String(ms).padStart(3, '0')}`;
  }
  function makeSingleSrt(text, durationSec) {
    const dur = Math.max(0.1, durationSec || 1);
    return `1\n00:00:00,000 --> ${formatSrtTime(dur)}\n${text || ''}\n`;
  }

  document.getElementById('generate').addEventListener('click', async () => {
    const pronText = pronTa.value.trim();
    // 자막은 사용자가 따로 손댔으면 그 값, 아니면 발음 변환 전 원본 (없으면 발음 텍스트 폴백)
    const srtText = (srtTouched ? srtTa.value : singleOriginal) || pronText;
    const voice = document.getElementById('voice').value;
    const speed = parseFloat(document.getElementById('speed').value);
    const total_step = parseInt(document.getElementById('totalStep').value, 10);

    const errEl = document.getElementById('singleError');
    const resEl = document.getElementById('singleResult');
    errEl.classList.add('hidden');
    resEl.classList.add('hidden');

    if (!pronText) {
      errEl.textContent = '발음(TTS 입력) 텍스트가 비어있습니다.';
      errEl.classList.remove('hidden');
      return;
    }

    const btn = document.getElementById('generate');
    btn.disabled = true; btn.textContent = '생성 중…';
    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pronText, voice, speed, total_step, lang: 'ko' }),
      });
      if (!res.ok) {
        let detail = res.statusText;
        try { detail = (await res.json()).detail || detail; } catch {}
        throw new Error(detail);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = document.getElementById('audio');
      audio.src = url;

      const wavLink = document.getElementById('downloadLink');
      wavLink.href = url;
      const stamp = Date.now();
      wavLink.download = `synth_${voice}_${stamp}.wav`;

      const srtLink = document.getElementById('downloadSrtLink');
      const finalizeSrt = (dur) => {
        const srt = makeSingleSrt(srtText, dur);
        const srtUrl = URL.createObjectURL(new Blob([srt], { type: 'application/x-subrip' }));
        srtLink.href = srtUrl;
        srtLink.download = `synth_${voice}_${stamp}.srt`;
      };
      // duration은 metadata 로드 후 결정 — 우선 임시로 1초로 셋업한 뒤 갱신
      finalizeSrt(1);
      audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) finalizeSrt(audio.duration);
      }, { once: true });

      resEl.classList.remove('hidden');
      loadHealth();
    } catch (e) {
      errEl.textContent = `합성 실패: ${e.message}`;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = '생성';
    }
  });

  // ---- 배치 (대본 일괄) ----
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const fileNameEl = document.getElementById('fileName');
  const runBtn = document.getElementById('runBatch');
  const batchOptions = document.getElementById('batchOptions');
  const sceneList = document.getElementById('sceneList');
  const batchErr = document.getElementById('batchError');

  let parsedChapter = null;
  let parsedScenes = null;

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }
  function pad2(n) { return String(n).padStart(2, '0'); }

  function showError(msg) {
    batchErr.textContent = msg;
    batchErr.classList.remove('hidden');
  }
  function clearError() { batchErr.classList.add('hidden'); }

  // ---- 파일 입력 핸들링 → 즉시 parse_script ----
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (f) handleScriptFile(f);
  });
  ['dragenter', 'dragover'].forEach(ev =>
    dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev =>
    dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('drag'); }));
  dropzone.addEventListener('drop', e => {
    const f = e.dataTransfer.files[0];
    if (f) { fileInput.files = e.dataTransfer.files; handleScriptFile(f); }
  });

  async function handleScriptFile(f) {
    fileNameEl.textContent = `선택됨: ${f.name}`;
    clearError();
    sceneList.innerHTML = '';
    batchOptions.classList.add('hidden');
    document.getElementById('bulkLinks').classList.add('hidden');

    try {
      const fd = new FormData();
      fd.append('script', f);
      const chOv = document.getElementById('chapterOverride').value.trim();
      if (chOv) fd.append('chapter', chOv);
      const res = await fetch('/api/parse_script', { method: 'POST', body: fd });
      if (!res.ok) {
        let detail = res.statusText;
        try { detail = (await res.json()).detail || detail; } catch {}
        throw new Error(detail);
      }
      const data = await res.json();
      parsedChapter = data.chapter;
      parsedScenes = data.scenes;
      document.getElementById('chapterOverride').value = data.chapter;
      batchOptions.classList.remove('hidden');
      renderScenes(data.scenes, data.chapter);
    } catch (e) {
      showError(`스크립트 파싱 실패: ${e.message}`);
    }
  }

  function renderScenes(scenes, chapter) {
    sceneList.innerHTML = '';
    scenes.forEach(sc => sceneList.appendChild(renderSceneCard(sc, chapter)));
  }

  function renderSceneCard(sc, chapter) {
    const card = document.createElement('div');
    card.className = 'scene-card';
    card.dataset.scene = sc.scene;

    const dur = sc.narration_seconds ? `${sc.narration_seconds}s` : '';
    const voiceLabel = sc.voice_resolved + (sc.voice_style ? ` ← ${sc.voice_style}` : '');

    card.innerHTML = `
      <div class="scene-header">
        <span class="scene-num">#${pad2(sc.scene)}</span>
        <span class="scene-voice-badge" title="${escapeHtml(voiceLabel)}">${sc.voice_resolved}</span>
        <span class="scene-duration">${dur}</span>
        <span class="scene-status">대기</span>
      </div>
      <div class="scene-text-grid">
        <div class="scene-text-col scene-text-pron">
          <div class="scene-text-label">
            <span class="label-title">발음 <small>(TTS 입력)</small></span>
            <div class="label-actions">
              <button type="button" class="to-pronunciation" title="영문 약자 + 연도(1989년→천구백팔십구년) + 숫자+단위(27킬로미터→이십칠 킬로미터)를 한국어 발음으로 자동 전환">한국어 발음 전환</button>
              <button type="button" class="reset-pron" disabled>↺ 원본</button>
            </div>
          </div>
          <textarea class="scene-pron-edit" rows="3" spellcheck="false"></textarea>
        </div>
        <div class="scene-text-col scene-text-srt">
          <div class="scene-text-label">
            <span class="label-title">자막 <small>(SRT 출력)</small></span>
            <div class="label-actions">
              <button type="button" class="reset-srt" disabled>↺ 원본</button>
            </div>
          </div>
          <textarea class="scene-srt-edit" rows="3" spellcheck="false"></textarea>
        </div>
      </div>
      <div class="scene-controls">
        <button type="button" class="generate-scene">▶ 생성</button>
        <audio class="hidden" controls preload="none"></audio>
      </div>
      <div class="scene-downloads hidden">
        <a class="dl-wav download" download>⬇ wav</a>
        <a class="dl-srt download" download>⬇ srt</a>
      </div>
    `;

    const pronTa = card.querySelector('.scene-pron-edit');
    const srtTa = card.querySelector('.scene-srt-edit');
    const resetPronBtn = card.querySelector('.reset-pron');
    const resetSrtBtn = card.querySelector('.reset-srt');
    const toPronBtn = card.querySelector('.to-pronunciation');

    pronTa.value = sc.narration_text;
    srtTa.value = sc.narration_text;

    pronTa.addEventListener('input', () => {
      const modified = pronTa.value !== sc.narration_text;
      card.classList.toggle('pron-modified', modified);
      resetPronBtn.disabled = !modified;
    });
    srtTa.addEventListener('input', () => {
      const modified = srtTa.value !== sc.narration_text;
      card.classList.toggle('srt-modified', modified);
      resetSrtBtn.disabled = !modified;
    });
    resetPronBtn.addEventListener('click', () => {
      pronTa.value = sc.narration_text;
      card.classList.remove('pron-modified');
      resetPronBtn.disabled = true;
    });
    resetSrtBtn.addEventListener('click', () => {
      srtTa.value = sc.narration_text;
      card.classList.remove('srt-modified');
      resetSrtBtn.disabled = true;
    });

    toPronBtn.addEventListener('click', async () => {
      const original = pronTa.value;
      if (!original.trim()) return;
      toPronBtn.disabled = true;
      const oldLabel = toPronBtn.textContent;
      toPronBtn.textContent = '전환 중…';
      try {
        const res = await fetch('/api/to_pronunciation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: original }),
        });
        if (!res.ok) {
          let detail = res.statusText;
          try { detail = (await res.json()).detail || detail; } catch {}
          throw new Error(detail);
        }
        const data = await res.json();
        if (data.text && data.text !== original) {
          pronTa.value = data.text;
          pronTa.dispatchEvent(new Event('input'));
        }
      } catch (e) {
        console.error('to_pronunciation failed', e);
        alert(`발음 전환 실패: ${e.message}`);
      } finally {
        toPronBtn.disabled = false;
        toPronBtn.textContent = oldLabel;
      }
    });

    card.querySelector('.generate-scene').addEventListener('click', () => generateScene(card, sc, chapter));
    return card;
  }

  async function generateScene(card, sc, chapter) {
    const btn = card.querySelector('.generate-scene');
    const status = card.querySelector('.scene-status');
    const audio = card.querySelector('audio');
    const downloads = card.querySelector('.scene-downloads');

    btn.disabled = true;
    btn.textContent = '생성 중…';
    status.textContent = '생성 중';
    card.classList.remove('error', 'done');
    card.classList.add('busy');

    try {
      const pronText = card.querySelector('.scene-pron-edit').value.trim() || sc.narration_text;
      const srtText = card.querySelector('.scene-srt-edit').value.trim() || sc.narration_text;
      const fd = new FormData();
      fd.append('chapter', chapter);
      fd.append('scene', sc.scene);
      fd.append('text', pronText);          // TTS 합성에 쓸 발음 텍스트
      fd.append('srt_text', srtText);       // SRT 자막에 들어갈 텍스트

      const vo = document.getElementById('voiceOverride').value;
      if (vo) fd.append('voice', vo);
      else if (sc.voice_resolved) fd.append('voice', sc.voice_resolved);

      const sp = document.getElementById('batchSpeed').value;
      if (sp) fd.append('speed', sp);
      const ts = document.getElementById('batchTotalStep').value;
      if (ts) fd.append('total_step', ts);
      if (sc.narration_seconds) fd.append('narration_seconds', sc.narration_seconds);

      const res = await fetch('/api/synthesize_scene', { method: 'POST', body: fd });
      if (!res.ok) {
        let detail = res.statusText;
        try { detail = (await res.json()).detail || detail; } catch {}
        throw new Error(detail);
      }
      const data = await res.json();

      const cacheBust = '?t=' + Date.now();
      audio.src = data.wav_url + cacheBust;
      audio.classList.remove('hidden');

      const wavName = `ch${chapter}_${pad2(sc.scene)}_narration.wav`;
      const srtName = `ch${chapter}_${pad2(sc.scene)}_narration.srt`;
      const dlWav = card.querySelector('.dl-wav');
      dlWav.href = data.wav_url; dlWav.download = wavName;
      const dlSrt = card.querySelector('.dl-srt');
      dlSrt.href = data.srt_url; dlSrt.download = srtName;
      downloads.classList.remove('hidden');

      status.textContent = `완료 (${data.duration_seconds.toFixed(1)}s)`;
      card.classList.add('done');
      btn.textContent = '↻ 재생성';
      loadHealth();
    } catch (e) {
      status.textContent = `에러: ${e.message}`;
      card.classList.add('error');
      btn.textContent = '↻ 재시도';
    } finally {
      btn.disabled = false;
      card.classList.remove('busy');
    }
  }

  // ---- 전체 일괄 ----

  // 카드 textarea의 현재 내용으로 새 script JSON을 만든다.
  // narration_text (TTS 입력) ≠ srt_text (자막 원문) — 발음 변환 결과를 자막에
  // 흘리지 않기 위해 분리해서 보낸다.
  function buildScriptFromCards() {
    const cards = [...document.querySelectorAll('#sceneList .scene-card')];
    if (cards.length === 0 || !parsedChapter || !parsedScenes) return null;
    const byScene = new Map(parsedScenes.map(s => [s.scene, s]));
    const scenes = cards.map(card => {
      const sceneNum = parseInt(card.dataset.scene, 10);
      const orig = byScene.get(sceneNum) || {};
      const pron = card.querySelector('.scene-pron-edit').value;
      const srt = card.querySelector('.scene-srt-edit').value;
      return {
        scene: sceneNum,
        narration_text: pron || orig.narration_text || '',
        srt_text: srt || orig.narration_text || '',
        voice_style: orig.voice_style ?? null,
        narration_seconds: orig.narration_seconds ?? null,
        image_filename: orig.image_filename ?? null,
      };
    });
    return { chapter: parsedChapter, scenes };
  }

  // 모든 카드에 /api/to_pronunciation을 적용해 발음 박스를 갱신.
  async function applyPronunciationToAllCards() {
    const cards = [...document.querySelectorAll('#sceneList .scene-card')];
    await Promise.all(cards.map(async card => {
      const ta = card.querySelector('.scene-pron-edit');
      const original = ta.value;
      if (!original.trim()) return;
      try {
        const res = await fetch('/api/to_pronunciation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: original }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.text && data.text !== original) {
          ta.value = data.text;
          ta.dispatchEvent(new Event('input'));
        }
      } catch (e) {
        // 개별 실패는 무시 — 다른 카드라도 변환되도록
        console.warn('to_pronunciation failed for scene', card.dataset.scene, e);
      }
    }));
  }

  // 배치 제출 + 폴링 + 카드 결과 반영 (공통 흐름)
  async function submitBatchScript(scriptObj) {
    const progEl = document.getElementById('batchProgress');
    const bar = document.getElementById('bar');
    const ptext = document.getElementById('progressText');
    const bulkLinks = document.getElementById('bulkLinks');
    const warningList = document.getElementById('warningList');
    clearError();
    bulkLinks.classList.add('hidden');
    warningList.innerHTML = '';
    progEl.classList.remove('hidden');
    bar.style.width = '0%';
    ptext.textContent = '제출 중…';

    const blob = new Blob([JSON.stringify(scriptObj)], { type: 'application/json' });
    const file = new File([blob], `ch${scriptObj.chapter}_edited.json`, { type: 'application/json' });

    const fd = new FormData();
    fd.append('script', file);
    fd.append('chapter', scriptObj.chapter);
    const vo = document.getElementById('voiceOverride').value;
    if (vo) fd.append('voice_override', vo);
    const sp = document.getElementById('batchSpeed').value;
    if (sp) fd.append('speed', sp);
    const ts = document.getElementById('batchTotalStep').value;
    if (ts) fd.append('total_step', ts);

    const submit = await fetch('/api/batch', { method: 'POST', body: fd });
    if (!submit.ok) {
      let detail = submit.statusText;
      try { detail = (await submit.json()).detail || detail; } catch {}
      throw new Error(detail);
    }
    const job = await submit.json();
    ptext.textContent = `ch${job.chapter}: 0 / ${job.scene_count}`;

    while (true) {
      await new Promise(r => setTimeout(r, 1000));
      const sres = await fetch(job.status_url);
      if (!sres.ok) throw new Error(`status fetch failed: ${sres.status}`);
      const status = await sres.json();
      const pct = status.progress.total ? Math.round(100 * status.progress.completed / status.progress.total) : 0;
      bar.style.width = `${pct}%`;
      const cur = status.progress.current_scene;
      ptext.textContent = `ch${job.chapter}: ${status.progress.completed} / ${status.progress.total}` + (cur ? ` (scene ${cur})` : '');

      if (status.status === 'done') {
        progEl.classList.add('hidden');
        status.files.forEach(fname => {
          const m = fname.match(/_(\d+)_narration\.wav$/);
          if (!m) return;
          const sceneNum = parseInt(m[1], 10);
          const card = document.querySelector(`.scene-card[data-scene="${sceneNum}"]`);
          if (!card) return;
          const wavUrl = `/api/files/ch${job.chapter}/audio/${fname}`;
          const srtName = fname.replace(/\.wav$/, '.srt');
          const srtUrl = `/api/files/ch${job.chapter}/subtitles/${srtName}`;
          const audio = card.querySelector('audio');
          audio.src = wavUrl + '?t=' + Date.now();
          audio.classList.remove('hidden');
          const dlWav = card.querySelector('.dl-wav');
          dlWav.href = wavUrl; dlWav.download = fname;
          const dlSrt = card.querySelector('.dl-srt');
          dlSrt.href = srtUrl; dlSrt.download = srtName;
          card.querySelector('.scene-downloads').classList.remove('hidden');
          card.querySelector('.scene-status').textContent = '완료';
          card.classList.remove('error', 'busy');
          card.classList.add('done');
          const btn = card.querySelector('.generate-scene');
          btn.textContent = '↻ 재생성';
          btn.disabled = false;
        });

        const zip = document.getElementById('zipLink');
        zip.href = `${job.status_url}/zip`;
        zip.download = `ch${job.chapter}_bundle.zip`;
        const srt = document.getElementById('srtLink');
        srt.href = `/api/files/ch${job.chapter}/subtitles_full?t=${Date.now()}`;
        srt.download = `ch${job.chapter}.srt`;
        bulkLinks.classList.remove('hidden');

        status.warnings.forEach(w => {
          const li = document.createElement('li');
          li.textContent = w;
          warningList.appendChild(li);
        });

        loadHealth();
        return;
      }
      if (status.status === 'error') {
        progEl.classList.add('hidden');
        throw new Error(status.error || 'batch error');
      }
    }
  }

  runBtn.addEventListener('click', async () => {
    if (!fileInput.files[0]) { showError('먼저 .json 파일을 올려주세요.'); return; }
    const scriptObj = buildScriptFromCards();
    if (!scriptObj) { showError('scene 카드를 찾을 수 없습니다.'); return; }
    runBtn.disabled = true;
    try {
      await submitBatchScript(scriptObj);
    } catch (e) {
      showError(`배치 실패: ${e.message}`);
      document.getElementById('batchProgress').classList.add('hidden');
    } finally {
      runBtn.disabled = false;
    }
  });

  // ---- 발음변환 후 일괄 생성 ----
  const runBatchPronBtn = document.getElementById('runBatchPron');
  runBatchPronBtn.addEventListener('click', async () => {
    if (!fileInput.files[0]) { showError('먼저 .json 파일을 올려주세요.'); return; }
    const cards = document.querySelectorAll('#sceneList .scene-card');
    if (cards.length === 0) { showError('scene 카드를 먼저 불러오세요.'); return; }

    runBatchPronBtn.disabled = true;
    runBtn.disabled = true;
    const oldLabel = runBatchPronBtn.textContent;
    try {
      runBatchPronBtn.textContent = '발음 변환 중…';
      await applyPronunciationToAllCards();

      const scriptObj = buildScriptFromCards();
      if (!scriptObj) { showError('scene 카드를 찾을 수 없습니다.'); return; }
      runBatchPronBtn.textContent = '일괄 합성 중…';
      await submitBatchScript(scriptObj);
    } catch (e) {
      showError(`배치 실패: ${e.message}`);
      document.getElementById('batchProgress').classList.add('hidden');
    } finally {
      runBatchPronBtn.disabled = false;
      runBtn.disabled = false;
      runBatchPronBtn.textContent = oldLabel;
    }
  });

  // ---- SRT 전체 생성 (per-scene SRT/WAV을 다시 합쳐 챕터 자막 갱신) ----
  const regenSrtBtn = document.getElementById('regenChapterSrt');
  regenSrtBtn.addEventListener('click', async () => {
    if (!parsedChapter) { showError('먼저 .json 파일을 올려주세요.'); return; }
    const oldLabel = regenSrtBtn.textContent;
    regenSrtBtn.disabled = true;
    regenSrtBtn.textContent = '병합 중…';
    clearError();
    try {
      const fd = new FormData();
      fd.append('chapter', parsedChapter);
      const res = await fetch('/api/regenerate_chapter_srt', { method: 'POST', body: fd });
      if (!res.ok) {
        let detail = res.statusText;
        try { detail = (await res.json()).detail || detail; } catch {}
        throw new Error(detail);
      }
      const data = await res.json();
      const srt = document.getElementById('srtLink');
      srt.href = `${data.url}?t=${Date.now()}`;
      srt.download = `ch${data.chapter}.srt`;
      document.getElementById('bulkLinks').classList.remove('hidden');
      regenSrtBtn.textContent = `완료 (${data.scene_count} scenes)`;
      setTimeout(() => { regenSrtBtn.textContent = oldLabel; }, 2000);
    } catch (e) {
      showError(`SRT 재생성 실패: ${e.message}`);
      regenSrtBtn.textContent = oldLabel;
    } finally {
      regenSrtBtn.disabled = false;
    }
  });
})();
