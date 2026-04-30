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

  // ---- 배치 ----
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const fileNameEl = document.getElementById('fileName');
  const runBtn = document.getElementById('runBatch');
  let selectedFile = null;

  function setFile(f) {
    selectedFile = f;
    fileNameEl.textContent = f ? `선택됨: ${f.name}` : '';
    runBtn.disabled = !f;
  }
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => setFile(fileInput.files[0] || null));
  ['dragenter', 'dragover'].forEach(ev =>
    dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev =>
    dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('drag'); }));
  dropzone.addEventListener('drop', e => {
    const f = e.dataTransfer.files[0];
    if (f) { fileInput.files = e.dataTransfer.files; setFile(f); }
  });

  runBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    const errEl = document.getElementById('batchError');
    const resEl = document.getElementById('batchResult');
    const progEl = document.getElementById('batchProgress');
    const bar = document.getElementById('bar');
    const ptext = document.getElementById('progressText');
    errEl.classList.add('hidden');
    resEl.classList.add('hidden');
    progEl.classList.remove('hidden');
    bar.style.width = '0%';
    ptext.textContent = '제출 중…';
    runBtn.disabled = true;

    try {
      const fd = new FormData();
      fd.append('script', selectedFile);
      const ch = document.getElementById('chapterOverride').value.trim();
      if (ch) fd.append('chapter', ch);
      const vo = document.getElementById('voiceOverride').value;
      if (vo) fd.append('voice_override', vo);
      const sp = document.getElementById('batchSpeed').value;
      if (sp) fd.append('speed', sp);

      const submit = await fetch('/api/batch', { method: 'POST', body: fd });
      if (!submit.ok) {
        let detail = submit.statusText;
        try { detail = (await submit.json()).detail || detail; } catch {}
        throw new Error(detail);
      }
      const job = await submit.json();
      ptext.textContent = `ch${job.chapter}: 0 / ${job.scene_count}`;

      // 폴링
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
          document.getElementById('batchSummary').textContent =
            `완료: ${status.files.length}개 파일 → ${status.output_dir}`;
          const ul = document.getElementById('fileList');
          ul.innerHTML = '';
          status.files.forEach(f => { const li = document.createElement('li'); li.textContent = f; ul.appendChild(li); });
          const zip = document.getElementById('zipLink');
          zip.href = `${job.status_url}/zip`;
          zip.download = `ch${job.chapter}_audio.zip`;
          const wl = document.getElementById('warningList');
          wl.innerHTML = '';
          status.warnings.forEach(w => { const li = document.createElement('li'); li.textContent = w; wl.appendChild(li); });
          resEl.classList.remove('hidden');
          break;
        }
        if (status.status === 'error') {
          progEl.classList.add('hidden');
          throw new Error(status.error || 'batch error');
        }
      }
    } catch (e) {
      errEl.textContent = `배치 실패: ${e.message}`;
      errEl.classList.remove('hidden');
      progEl.classList.add('hidden');
    } finally {
      runBtn.disabled = false;
    }
  });
})();
