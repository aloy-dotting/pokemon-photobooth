/* ============================================================
   Pokémon Photobooth — app logic
   States: setup -> shooting -> review -> setup
   ============================================================ */
(() => {
  'use strict';

  const CFG = window.BOOTH_CONFIG;
  const $ = (sel) => document.querySelector(sel);

  // ---------- DOM ----------
  const body = document.body;
  const cam = $('#cam');
  const shotPreview = $('#shotPreview');
  const guideImg = $('#guide');
  const guideToggle = $('#guideToggle');
  const pokemonOverlay = $('#pokemonOverlay');
  const frameImg = $('#frameImg');
  const flashEl = $('#flash');
  const countdownEl = $('#countdown');
  const dateText = $('#dateText');
  const eventText = $('#eventText');
  const stampEl = $('#stamp');
  const camError = $('#camError');
  const retryCam = $('#retryCam');
  const listPokemon = $('#listPokemon');
  const listFrame = $('#listFrame');
  const startBtn = $('#startBtn');
  const review = $('#review');
  const reviewGrid = $('#reviewGrid');
  const retakeBtn = $('#retakeBtn');
  const shareBtn = $('#shareBtn');
  const doneBtn = $('#doneBtn');
  const reviewStatus = $('#reviewStatus');
  const shotCounter = $('#shotCounter');
  const stripThumbs = $('#stripThumbs');
  const photoCanvas = $('#photoCanvas');
  const videoCanvas = $('#videoCanvas');

  // ---------- State ----------
  const state = {
    pokemon: CFG.pokemon[0],
    frame: CFG.frames[0],
    guideOn: true,
    stream: null,
    shots: [],          // [{ blob, url, selected }]
    videoBlob: null,
    videoExt: 'mp4',
    busy: false,
  };

  const images = {}; // loaded Image objects, keyed by src

  // ---------- Helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (images[src]) return Promise.resolve(images[src]);
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => { images[src] = im; resolve(im); };
      im.onerror = () => reject(new Error('Failed to load ' + src));
      im.src = src;
    });
  }

  function todayParts() {
    const d = new Date();
    const dd = String(d.getDate());          // no zero padding: 5·10·26
    const mm = String(d.getMonth() + 1);
    const yy = String(d.getFullYear()).slice(-2);
    return [dd, mm, yy];
  }

  function fileStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  // ---------- Setup UI ----------
  function renderCaption() {
    const [dd, mm, yy] = todayParts();
    dateText.innerHTML = `<span>${dd}</span><span class="dot"></span><span>${mm}</span><span class="dot"></span><span>${yy}</span>`;
    eventText.textContent = CFG.eventName;
  }

  function renderLists() {
    listPokemon.innerHTML = '';
    CFG.pokemon.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'item' + (p.id === state.pokemon.id ? ' selected' : '') + (p.overlay ? '' : ' disabled');
      b.innerHTML = `<img class="icon" src="${p.icon}" alt="" /><span>${p.name}</span>${p.overlay ? '' : '<span class="sub">coming soon</span>'}`;
      b.addEventListener('click', () => selectPokemon(p));
      listPokemon.appendChild(b);
    });

    listFrame.innerHTML = '';
    CFG.frames.forEach((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'item' + (f.id === state.frame.id ? ' selected' : '');
      b.innerHTML = `<img class="icon" src="${f.src}" alt="" style="image-rendering:auto" /><span>${f.name}</span>`;
      b.addEventListener('click', () => selectFrame(f));
      listFrame.appendChild(b);
    });
  }

  function selectPokemon(p) {
    state.pokemon = p;
    pokemonOverlay.src = p.overlay || '';
    guideImg.src = p.guide || '';
    applyGuide();
    renderLists();
    loadImage(p.overlay).catch(console.warn);
  }

  function selectFrame(f) {
    state.frame = f;
    frameImg.src = f.src;
    const w = f.window;
    const win = $('.pwindow');
    win.style.left = (w.x * 100) + '%';
    win.style.top = (w.y * 100) + '%';
    win.style.width = (w.w * 100) + '%';
    win.style.height = (w.h * 100) + '%';
    renderLists();
    loadImage(f.src).catch(console.warn);
  }

  function applyGuide() {
    const show = state.guideOn && !!state.pokemon.guide;
    guideImg.classList.toggle('on', show);
  }

  guideToggle.addEventListener('change', () => {
    state.guideOn = guideToggle.checked;
    applyGuide();
  });

  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
      listPokemon.hidden = t.dataset.tab !== 'pokemon';
      listFrame.hidden = t.dataset.tab !== 'frame';
    });
  });

  // ---------- Camera ----------
  async function startCamera() {
    camError.hidden = true;
    if (state.stream) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      state.stream = stream;
      cam.srcObject = stream;
      await cam.play().catch(() => {});
    } catch (err) {
      console.error('Camera error', err);
      camError.hidden = false;
    }
  }
  retryCam.addEventListener('click', startCamera);

  // ---------- Rendering (shared by photo + video) ----------
  // Draw `src` (video or image) to cover rect (x,y,w,h), optionally mirrored.
  function drawCover(ctx, src, x, y, w, h, mirror, align = 'center') {
    const sw = src.videoWidth || src.naturalWidth || src.width;
    const sh = src.videoHeight || src.naturalHeight || src.height;
    if (!sw || !sh) return;
    const scale = Math.max(w / sw, h / sh);
    const dw = sw * scale, dh = sh * scale;
    const dx = x + (w - dw) / 2;
    const dy = align === 'bottom' ? y + (h - dh) : y + (h - dh) / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (mirror) {
      ctx.translate(x + w, 0); ctx.scale(-1, 1);
      ctx.drawImage(src, dx - x, dy, dw, dh);
    } else {
      ctx.drawImage(src, dx, dy, dw, dh);
    }
    ctx.restore();
  }

  // Draw the complete polaroid (photo content + pokemon + frame + text + stamp)
  // at (fx, fy) with frame width fw. `content` is a video element or an image.
  // `contentMirrored` = true when drawing live video (needs mirroring);
  // false when drawing an already-rendered photo.
  function drawPolaroid(ctx, fx, fy, fw, content, contentMirrored) {
    const frame = images[state.frame.src];
    const fh = fw / state.frame.aspect;
    const w = state.frame.window;
    const wx = fx + w.x * fw, wy = fy + w.y * fh, ww = w.w * fw, wh = w.h * fh;

    // photo window background
    ctx.fillStyle = '#b9c0c6';
    ctx.fillRect(wx, wy, ww, wh);
    if (content) drawCover(ctx, content, wx, wy, ww, wh, contentMirrored && CFG.mirror);

    // pokemon overlay
    const pk = state.pokemon.overlay && images[state.pokemon.overlay];
    if (pk) drawCover(ctx, pk, wx, wy, ww, wh, false, 'bottom');

    // frame
    if (frame) ctx.drawImage(frame, fx, fy, fw, fh);

    // caption
    const t = CFG.text;
    ctx.fillStyle = t.color;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const dateSize = t.dateSize * fh;
    ctx.font = `${dateSize}px SmoothMarker`;
    const [dd, mm, yy] = todayParts();
    ctx.save();
    ctx.translate(fx + t.x * fw, fy + t.dateY * fh);
    ctx.rotate(((t.dateRotateDeg || 0) * Math.PI) / 180);
    let x = 0;
    const dotR = dateSize * 0.06;
    const gap = dateSize * 0.04;
    [dd, mm, yy].forEach((part, i) => {
      ctx.fillText(part, x, 0);
      x += ctx.measureText(part).width;
      if (i < 2) {
        x += gap + dotR;
        ctx.beginPath(); ctx.arc(x, -dateSize * 0.33, dotR, 0, Math.PI * 2); ctx.fill();
        x += dotR + gap;
      }
    });
    ctx.restore();
    ctx.font = `${t.eventSize * fh}px SmoothMarker`;
    ctx.save();
    // letter-spacing substitute: draw char by char
    let ex = fx + t.x * fw;
    const ey = fy + t.eventY * fh;
    const ls = t.eventSize * fh * 0.08;
    for (const ch of CFG.eventName) {
      ctx.fillText(ch, ex, ey);
      ex += ctx.measureText(ch).width + ls;
    }
    ctx.restore();

    // stamp
    const st = images[CFG.stamp.src];
    if (st) {
      const sw = CFG.stamp.width * fw;
      const sh = sw * (st.naturalHeight / st.naturalWidth);
      ctx.save();
      ctx.translate(fx + CFG.stamp.cx * fw, fy + CFG.stamp.cy * fh);
      ctx.rotate((CFG.stamp.rotateDeg * Math.PI) / 180);
      if (CFG.stamp.shadow) {
        ctx.shadowColor = CFG.stamp.shadow.color;
        ctx.shadowBlur = CFG.stamp.shadow.blur * fw;
        ctx.shadowOffsetY = CFG.stamp.shadow.offsetY * fw;
      }
      ctx.drawImage(st, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
    }
  }

  // Render a full-resolution polaroid photo from the current camera frame.
  function renderPhoto() {
    const fw = CFG.photoWidth;
    const fh = Math.round(fw / state.frame.aspect);
    photoCanvas.width = fw; photoCanvas.height = fh;
    const ctx = photoCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // JPEG has no alpha: white behind the frame edges (print-friendly)
    ctx.fillRect(0, 0, fw, fh);
    drawPolaroid(ctx, 0, 0, fw, cam, true);
    return new Promise((resolve) => {
      photoCanvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
    });
  }

  // ---------- Video recorder ----------
  function pickMime() {
    const cands = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (const c of cands) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
    }
    return '';
  }

  function createRecorder() {
    const vw = CFG.videoWidth, vh = CFG.videoHeight;
    videoCanvas.width = vw; videoCanvas.height = vh;
    const ctx = videoCanvas.getContext('2d');

    // polaroid centred, ~72% of the video width
    const fw = Math.round(vw * 0.72);
    const fh = Math.round(fw / state.frame.aspect);
    const fx = Math.round((vw - fw) / 2);
    const fy = Math.round((vh - fh) / 2);

    const rec = {
      frozen: null,        // Image of a captured shot while "paused"
      flashAt: 0,          // timestamp of last flash
      running: false,
      recorder: null,
      chunks: [],
      mime: pickMime(),
      raf: 0,
    };

    function paint(now) {
      if (!rec.running) return;
      ctx.fillStyle = '#e9ebee';
      ctx.fillRect(0, 0, vw, vh);
      // subtle drop shadow
      ctx.save();
      ctx.shadowColor = 'rgba(40,45,55,.25)';
      ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
      ctx.fillStyle = '#fff';
      ctx.fillRect(fx + fw * 0.02, fy + fh * 0.01, fw * 0.96, fh * 0.98);
      ctx.restore();

      if (rec.frozen) drawPolaroid(ctx, fx, fy, fw, rec.frozen, false);
      else drawPolaroid(ctx, fx, fy, fw, cam, true);

      // flash
      const dt = now - rec.flashAt;
      if (dt >= 0 && dt < 450) {
        ctx.fillStyle = `rgba(255,255,255,${1 - dt / 450})`;
        ctx.fillRect(0, 0, vw, vh);
      }
      rec.raf = requestAnimationFrame(paint);
    }

    rec.start = () => {
      rec.running = true;
      rec.chunks = [];
      rec.raf = requestAnimationFrame(paint);
      try {
        const stream = videoCanvas.captureStream(CFG.videoFps);
        const opts = rec.mime ? { mimeType: rec.mime, videoBitsPerSecond: 6_000_000 } : undefined;
        rec.recorder = new MediaRecorder(stream, opts);
        rec.recorder.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
        rec.recorder.start(500);
      } catch (err) {
        console.warn('Recording unavailable', err);
        rec.recorder = null;
      }
    };

    rec.stop = () => new Promise((resolve) => {
      rec.running = false;
      cancelAnimationFrame(rec.raf);
      if (!rec.recorder) return resolve(null);
      const r = rec.recorder;
      r.onstop = () => {
        const type = r.mimeType || rec.mime || 'video/mp4';
        resolve(new Blob(rec.chunks, { type }));
      };
      try { r.stop(); } catch { resolve(null); }
    });

    return rec;
  }

  // ---------- Film strip (shooting screen) ----------
  function buildStrip() {
    stripThumbs.innerHTML = '';
    const w = state.frame.window;
    for (let i = 0; i < CFG.shotsPerSession; i++) {
      const t = document.createElement('div');
      t.className = 'thumb';
      t.innerHTML = `<div class="thumb-win" style="left:${w.x * 100}%;top:${w.y * 100}%;width:${w.w * 100}%;height:${w.h * 100}%"></div>` +
        `<img class="thumb-frame" src="${state.frame.src}" alt="" /><img class="thumb-shot" alt="" />`;
      stripThumbs.appendChild(t);
    }
    setCounter(1);
  }
  function setCounter(n) {
    shotCounter.textContent = `${Math.min(n, CFG.shotsPerSession)}/${CFG.shotsPerSession}`;
  }
  function fillThumb(i, url) {
    const t = stripThumbs.children[i];
    if (!t) return;
    t.querySelector('.thumb-shot').src = url;
    t.classList.add('filled');
  }

  // ---------- Shooting sequence ----------
  async function countdown(n) {
    for (let i = n; i > 0; i--) {
      countdownEl.textContent = String(i);
      countdownEl.classList.remove('tick');
      void countdownEl.offsetWidth; // restart animation
      countdownEl.classList.add('tick');
      await sleep(1000);
    }
    countdownEl.classList.remove('tick');
    countdownEl.textContent = '';
  }

  function flash() {
    flashEl.classList.remove('go');
    void flashEl.offsetWidth;
    flashEl.classList.add('go');
  }

  async function startShooting() {
    if (state.busy) return;
    if (!state.stream) { await startCamera(); if (!state.stream) return; }
    state.busy = true;

    // reset previous session
    state.shots.forEach((s) => URL.revokeObjectURL(s.url));
    state.shots = [];
    state.videoBlob = null;

    // make sure render assets are ready
    await Promise.all([
      loadImage(state.frame.src),
      loadImage(state.pokemon.overlay),
      loadImage(CFG.stamp.src),
      document.fonts.load(`100px SmoothMarker`),
      document.fonts.load('40px Pixellari'),
    ]).catch(console.warn);

    buildStrip();
    body.dataset.state = 'shooting';
    await sleep(600); // let the layout transition settle

    const rec = createRecorder();
    rec.start();
    await sleep(400);

    for (let i = 0; i < CFG.shotsPerSession; i++) {
      setCounter(i + 1);
      await countdown(CFG.countdownSeconds);

      // capture
      const blob = await renderPhoto();
      const url = URL.createObjectURL(blob);
      const img = await loadImage(url);
      state.shots.push({ blob, url, selected: true });

      // flash + freeze (screen + video)
      flash();
      rec.flashAt = performance.now();
      rec.frozen = img;
      shotPreview.src = url;
      shotPreview.classList.add('show');
      const screenHold = CFG.shotPreviewMs ?? 1000;
      await sleep(screenHold);
      // hand the shot to the film strip and resume the live view
      shotPreview.classList.remove('show');
      fillThumb(i, url);
      // keep the video frozen for the full hold even if the screen has moved on
      setTimeout(() => { if (rec.frozen === img) rec.frozen = null; }, Math.max(0, CFG.shotHoldMs - screenHold));
      await sleep(400);
    }

    await sleep(300);
    const videoBlob = await rec.stop();
    state.videoBlob = videoBlob;
    state.videoExt = videoBlob && videoBlob.type.includes('webm') ? 'webm' : 'mp4';

    showReview();
    state.busy = false;
  }
  startBtn.addEventListener('click', startShooting);

  // ---------- Review ----------
  function showReview() {
    body.dataset.state = 'review';
    review.hidden = false;
    review.classList.remove('shared');
    reviewStatus.textContent = state.videoBlob ? '' : 'Video recording is not supported on this browser; photos only.';
    reviewGrid.innerHTML = '';
    state.shots.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'review-shot selected';
      d.innerHTML = `<img src="${s.url}" alt="Shot ${i + 1}" />`;
      d.addEventListener('click', () => {
        s.selected = !s.selected;
        d.classList.toggle('selected', s.selected);
        updateShareBtn();
      });
      reviewGrid.appendChild(d);
    });
    updateShareBtn();
  }

  function updateShareBtn() {
    shareBtn.disabled = !state.shots.some((s) => s.selected);
  }

  function backToSetup() {
    review.hidden = true;
    body.dataset.state = 'setup';
    shotPreview.classList.remove('show');
    shotPreview.removeAttribute('src');
  }

  retakeBtn.addEventListener('click', () => {
    backToSetup();
    setTimeout(startShooting, 400);
  });
  doneBtn.addEventListener('click', backToSetup);

  async function share() {
    const stamp = fileStamp();
    const files = [];
    state.shots.forEach((s, i) => {
      if (s.selected) files.push(new File([s.blob], `photobooth-${stamp}-${i + 1}.jpg`, { type: 'image/jpeg' }));
    });
    if (state.videoBlob) {
      files.push(new File([state.videoBlob], `photobooth-${stamp}.${state.videoExt}`, { type: state.videoBlob.type || 'video/mp4' }));
    }
    if (!files.length) return;

    if (navigator.canShare && navigator.canShare({ files })) {
      try {
        await navigator.share({ files, title: 'Pokémon Photobooth' });
        reviewStatus.textContent = 'Shared! Tap Done to start a new session.';
        review.classList.add('shared');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') { reviewStatus.textContent = 'Share cancelled.'; return; }
        console.warn('share failed', err);
      }
    }
    // Fallback: download each file
    files.forEach((f) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(f); a.download = f.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    });
    reviewStatus.textContent = 'Sharing is not available here — files downloaded instead.';
    review.classList.add('shared');
  }
  shareBtn.addEventListener('click', share);

  window.__booth = state; // handy for debugging in Safari's Web Inspector

  // ---------- Init ----------
  async function init() {
    body.classList.toggle('mirror', !!CFG.mirror);
    document.documentElement.style.setProperty('--date-rot', (CFG.text.dateRotateDeg || 0) + 'deg');
    renderCaption();
    selectFrame(state.frame);
    selectPokemon(state.pokemon);
    loadImage(CFG.stamp.src).catch(console.warn);
    document.fonts.load('100px SmoothMarker').catch(() => {});
    startCamera();

    // refresh the date if the booth is left open overnight
    setInterval(renderCaption, 60 * 1000);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  init();
})();
