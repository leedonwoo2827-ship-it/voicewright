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

  // ---- 단일 합성 ----
  document.getElementById('generate').addEventListener('click', async () => {
    const text = document.getElementById('text').value.trim();
    const voice = document.getElementById('voice').value;
    const speed = parseFloat(document.getElementById('speed').value);
    const total_step = parseInt(document.getElementById('totalStep').value, 10);

    const errEl = document.getElementById('singleError');
    const resEl = document.getElementById('singleResult');
    errEl.classList.add('hidden');
    resEl.classList.add('hidden');

    if (!text) { errEl.textContent = '텍스트가 비어있습니다.'; errEl.classList.remove('hidden'); return; }

    const btn = document.getElementById('generate');
    btn.disabled = true; btn.textContent = '생성 중…';
    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, speed, total_step, lang: 'ko' }),
      });
      if (!res.ok) {
        let detail = res.statusText;
        try { detail = (await res.json()).detail || detail; } catch {}
        throw new Error(detail);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      document.getElementById('audio').src = url;
      const link = document.getElementById('downloadLink');
      link.href = url;
      link.download = `synth_${voice}_${Date.now()}.wav`;
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
              <button type="button" class="to-pronunciation" title="영문 약자를 한국어 발음으로 자동 전환">한국어 발음 전환</button>
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
  runBtn.addEventListener('click', async () => {
    if (!fileInput.files[0]) { showError('먼저 .json 파일을 올려주세요.'); return; }

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
    runBtn.disabled = true;

    try {
      const fd = new FormData();
      fd.append('script', fileInput.files[0]);
      const ch = document.getElementById('chapterOverride').value.trim();
      if (ch) fd.append('chapter', ch);
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
          // 모든 scene 카드에 결과 채워주기
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
          srt.href = `/api/files/ch${job.chapter}/subtitles_full`;
          srt.download = `ch${job.chapter}.srt`;
          bulkLinks.classList.remove('hidden');

          status.warnings.forEach(w => {
            const li = document.createElement('li');
            li.textContent = w;
            warningList.appendChild(li);
          });

          loadHealth();
          break;
        }
        if (status.status === 'error') {
          progEl.classList.add('hidden');
          throw new Error(status.error || 'batch error');
        }
      }
    } catch (e) {
      showError(`배치 실패: ${e.message}`);
      progEl.classList.add('hidden');
    } finally {
      runBtn.disabled = false;
    }
  });
})();
