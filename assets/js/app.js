/* ============================================================
   جمعه — فرهاد مهراد
   پخش‌کننده، نوار پیشرفت، رهاکردن فایل، چرخش صفحه و میله‌های صدا
   بدون هیچ کتابخانهٔ بیرونی
   ============================================================ */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);

  const audio    = $('#audio');
  const player   = $('#player');
  const playBtn  = $('#playBtn');
  const discBtn  = $('#discBtn');
  const seek     = $('#seek');
  const fill     = $('#fill');
  const bufferEl = $('#buffer');
  const curEl    = $('#cur');
  const durEl    = $('#dur');
  const hintEl   = $('#hint');
  const volEl    = $('#vol');
  const muteBtn  = $('#muteBtn');
  const canvas   = $('#viz');
  const nameEl   = $('.player__name');

  const SRC = 'assets/audio/jomeh.mp3';
  const HINTS = {
    idle:    'برای پخش، دکمه را بزن — یا فایل MP3 را روی همین کادر رها کن.',
    nofile:  'فایل صوتی هنوز اضافه نشده؛ با زدن دکمه، فایل آهنگ را از دستگاهت انتخاب کن.',
    loading: 'در حال آماده‌سازی…',
    playing: 'در حال پخش — دکمهٔ فاصله برای توقف.',
    paused:  'متوقف شد.',
    ended:   'به پایان رسید — دوباره از اول؟',
    error:   'فایل صوتی در دسترس نیست. فایل آهنگ را از دستگاهت انتخاب کن یا آن را داخل کادر رها کن.'
  };

  /* ── عدد فارسی و زمان ─────────────────────────────────── */
  const FA = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
  const fa = (v) => String(v).replace(/\d/g, (d) => FA[+d]);

  const fmt = (sec) => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return fa(m) + ':' + fa(String(s).padStart(2, '0'));
  };

  const setState = (state, hint) => {
    player.dataset.state = state;
    const playing = state === 'playing';
    discBtn.dataset.playing = String(playing);
    if (playing) discBtn.dataset.live = 'true';
    playBtn.setAttribute('aria-label', playing ? 'توقف' : 'پخش');
    if (hint) hintEl.textContent = hint;
  };

  /* ── بارگذاری فایل ───────────────────────────────────── */
  let objectURL = null;

  const loadSource = (src, label) => {
    if (objectURL) { URL.revokeObjectURL(objectURL); objectURL = null; }
    audio.src = src;
    audio.load();
    if (label) {
      nameEl.innerHTML = '';
      nameEl.append(document.createTextNode(label + ' '));
      const em = document.createElement('em');
      em.textContent = '· فایل محلی';
      nameEl.append(em);
    }
  };

  const loadFile = (file) => {
    if (!file || !/^audio\//.test(file.type) && !/\.(mp3|m4a|ogg|wav|flac|aac|opus)$/i.test(file.name)) {
      hintEl.textContent = 'این فایل صوتی نیست.';
      return;
    }
    objectURL = URL.createObjectURL(file);
    loadSource(objectURL, file.name.replace(/\.[^.]+$/, ''));
    setState('loading', HINTS.loading);
    // با اجازهٔ کاربر شروع می‌کنیم؛ در همان کلیک رخ می‌دهد پس مسدود نمی‌شود
    audio.play().catch(() => setState('paused', HINTS.paused));
  };

  /* فایل پیش‌فرض (اگر کنار پروژه گذاشته شده باشد) */
  const probeDefault = async () => {
    try {
      const res = await fetch(SRC, { method: 'HEAD', cache: 'no-store' });
      if (!res.ok) throw new Error('missing');
      loadSource(SRC);
      setState('idle', HINTS.idle);
    } catch {
      setState('nofile', HINTS.nofile);
    }
  };

  /* ── انتخاب فایل با کلیک روی پخش (وقتی فایلی نیست) ────── */
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'audio/*';
  picker.hidden = true;
  document.body.append(picker);
  picker.addEventListener('change', () => picker.files[0] && loadFile(picker.files[0]));

  /* ── پخش / توقف ──────────────────────────────────────── */
  const toggle = () => {
    if (!audio.getAttribute('src')) { picker.click(); return; }
    if (audio.paused) {
      const p = audio.play();
      if (p) p.catch(() => setState('error', HINTS.error));
    } else {
      audio.pause();
    }
  };

  playBtn.addEventListener('click', toggle);
  discBtn.addEventListener('click', toggle);

  audio.addEventListener('loadstart', () => setState('loading', HINTS.loading));
  audio.addEventListener('waiting',   () => player.dataset.state !== 'playing' && setState('loading', HINTS.loading));
  audio.addEventListener('playing',   () => setState('playing', HINTS.playing));
  audio.addEventListener('pause',     () => { if (!audio.ended) setState('paused', HINTS.paused); });
  audio.addEventListener('ended',     () => { setState('ended', HINTS.ended); clearViz(); });
  audio.addEventListener('error',     () => { setState('error', HINTS.error); clearViz(); });

  audio.addEventListener('loadedmetadata', () => {
    durEl.textContent = fmt(audio.duration);
    if (player.dataset.state === 'idle') setState('paused', HINTS.idle);
  });

  /* ── نوار پیشرفت ─────────────────────────────────────── */
  let scrubbing = false;

  const paint = () => {
    const d = audio.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    const pct = Math.min(100, (audio.currentTime / d) * 100);
    fill.style.width = pct + '%';
    seek.setAttribute('aria-valuenow', Math.round(pct));
    seek.setAttribute('aria-valuetext', fmt(audio.currentTime));
    curEl.textContent = fmt(audio.currentTime);
    if (audio.buffered.length) {
      try {
        const end = audio.buffered.end(audio.buffered.length - 1);
        bufferEl.style.width = Math.min(100, (end / d) * 100) + '%';
      } catch { /* بی‌اهمیت */ }
    }
  };

  audio.addEventListener('timeupdate', () => { if (!scrubbing) paint(); });
  audio.addEventListener('progress', paint);

  const seekTo = (clientX) => {
    const d = audio.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    const r = seek.getBoundingClientRect();
    // در چپ‌به‌راست از چپ و در راست‌به‌چپ از راست اندازه می‌گیریم
    const fromStart = getComputedStyle(seek).direction === 'rtl'
      ? r.right - clientX
      : clientX - r.left;
    const ratio = Math.min(1, Math.max(0, fromStart / r.width));
    curEl.textContent = fmt(ratio * d);
    fill.style.width = ratio * 100 + '%';
    return ratio * d;
  };

  seek.addEventListener('pointerdown', (e) => {
    if (!audio.getAttribute('src')) return;
    scrubbing = true;
    seek.setPointerCapture(e.pointerId);
    seekTo(e.clientX);
  });
  seek.addEventListener('pointermove', (e) => {
    if (!scrubbing) return;
    seekTo(e.clientX);
  });
  seek.addEventListener('pointerup', (e) => {
    if (!scrubbing) return;
    const t = seekTo(e.clientX);
    scrubbing = false;
    if (Number.isFinite(t)) audio.currentTime = t;
  });
  seek.addEventListener('pointercancel', () => { scrubbing = false; paint(); });

  seek.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 15 : 5;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const dir = e.key === 'ArrowLeft' ? -1 : 1; // در RTL چپ = جلوتر
      audio.currentTime = Math.min(audio.duration || 0, Math.max(0, audio.currentTime + dir * step));
      paint();
    }
    if (e.key === 'Home') { audio.currentTime = 0; paint(); }
    if (e.key === 'End' && Number.isFinite(audio.duration)) { audio.currentTime = audio.duration - 1; paint(); }
  });

  /* ── صدا ─────────────────────────────────────────────── */
  let lastVol = 0.85;

  const paintVol = () => {
    const v = audio.muted ? 0 : audio.volume;
    volEl.value = String(v);
    const pct = Math.round(v * 100);
    volEl.style.background =
      `linear-gradient(90deg, var(--amber) 0%, var(--amber) ${pct}%, rgba(236,230,217,.16) ${pct}%)`;
    muteBtn.setAttribute('aria-pressed', String(audio.muted || v === 0));
    muteBtn.setAttribute('aria-label', audio.muted ? 'باصدا' : 'بی‌صدا');
  };

  try {
    const saved = parseFloat(localStorage.getItem('jomeh.vol'));
    if (Number.isFinite(saved)) { audio.volume = Math.min(1, Math.max(0, saved)); lastVol = audio.volume || 0.85; }
    else audio.volume = 0.85;
  } catch { audio.volume = 0.85; }

  volEl.addEventListener('input', () => {
    audio.volume = parseFloat(volEl.value);
    if (audio.volume > 0) { audio.muted = false; lastVol = audio.volume; }
    paintVol();
    try { localStorage.setItem('jomeh.vol', String(audio.volume)); } catch {}
  });

  muteBtn.addEventListener('click', () => {
    if (audio.muted || audio.volume === 0) {
      audio.muted = false;
      audio.volume = lastVol || 0.85;
    } else {
      lastVol = audio.volume;
      audio.muted = true;
    }
    paintVol();
  });

  paintVol();

  /* ── کشیدن و رهاکردن فایل ────────────────────────────── */
  let dragDepth = 0;
  const isDragging = () => player.classList.contains('is-dragover');

  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  player.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    player.classList.add('is-dragover');
  });
  player.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  player.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) player.classList.remove('is-dragover');
  });
  player.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    player.classList.remove('is-dragover');
    const f = e.dataTransfer?.files?.[0];
    if (f) loadFile(f);
  });

  /* ── کلید فاصله ───────────────────────────────────────── */
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    if (e.target instanceof Element && e.target.closest('input, textarea, button, [contenteditable]')) return;
    e.preventDefault();
    toggle();
  });

  /* ── میله‌های صدا (Web Audio) ─────────────────────────── */
  let analyser = null, freq = null, ctx = null, source = null, raf = 0, dpr = 1;

  const sizeCanvas = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    if (!analyser) drawIdle();
  };

  const clearViz = () => {
    canvas.dataset.active = 'false';
    const w = canvas.width, h = canvas.height;
    if (w && h) canvas.getContext('2d').clearRect(0, 0, w, h);
  };

  const drawRing = (values) => {
    const g = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    const base = Math.min(w, h) / 2;
    const inner = base * 0.735;
    const N = 84;

    g.clearRect(0, 0, w, h);
    g.lineCap = 'round';

    for (let i = 0; i < N; i++) {
      const v = values ? values[Math.floor((i / N) * values.length)] / 255 : 0;
      const eased = Math.pow(v, 0.72);
      const len = base * 0.03 + eased * base * 0.15;
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      const x1 = cx + Math.cos(a) * inner;
      const y1 = cy + Math.sin(a) * inner;
      const x2 = cx + Math.cos(a) * (inner + len);
      const y2 = cy + Math.sin(a) * (inner + len);

      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.strokeStyle = `rgba(${240 - eased * 30}, ${200 - eased * 40}, ${130 - eased * 60}, ${0.28 + eased * 0.62})`;
      g.lineWidth = base * 0.016;
      g.stroke();
    }
  };

  const drawIdle = () => {
    drawRing(null);
  };

  const tick = () => {
    raf = requestAnimationFrame(tick);
    analyser.getByteFrequencyData(freq);
    drawRing(freq);
  };

  const initAudioGraph = () => {
    if (analyser) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      source = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      freq = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      return true;
    } catch {
      analyser = null;
      return false;
    }
  };

  const startViz = () => {
    if (!initAudioGraph()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    discBtn.dataset.live = 'true';
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const stopViz = () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    discBtn.dataset.live = 'false';
    clearViz();
    drawIdle();
  };

  audio.addEventListener('play', startViz);
  audio.addEventListener('pause', stopViz);
  audio.addEventListener('ended', stopViz);

  if ('ResizeObserver' in window) {
    new ResizeObserver(sizeCanvas).observe(canvas);
  } else {
    window.addEventListener('resize', sizeCanvas);
  }
  window.addEventListener('load', sizeCanvas);
  sizeCanvas();

  /* ── نمایان‌شدن بندهای ترانه ─────────────────────────── */
  const stanzas = document.querySelectorAll('.stanza');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.25, rootMargin: '0px 0px -8% 0px' });
    stanzas.forEach((s) => io.observe(s));
  } else {
    stanzas.forEach((s) => s.classList.add('in'));
  }

  /* ── شروع ─────────────────────────────────────────────── */
  probeDefault();
})();
