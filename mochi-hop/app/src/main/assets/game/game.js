/*
 * Mochi Hop
 * Tap to make Mochi hop through the bamboo grove.
 * Everything (character, scenery, sound) is generated in code: no image or audio assets.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Setup & scaling
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const H = 640;          // virtual height; width adapts to the screen aspect ratio
  let W = 360;
  let scale = 1;
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    scale = canvas.height / H;
    W = canvas.width / scale;
  }
  window.addEventListener('resize', resize);
  resize();

  const GROUND_H = 92;
  const groundY = () => H - GROUND_H;

  // ---------------------------------------------------------------------------
  // Persistence (wrapped: storage can be unavailable)
  // ---------------------------------------------------------------------------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('mochihop.' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('mochihop.' + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    },
  };

  // ---------------------------------------------------------------------------
  // Skins: unlocked with sakura petals collected during runs
  // ---------------------------------------------------------------------------
  const SKINS = [
    { id: 'classic', name: 'Mochi',  cost: 0,   body: '#fff8f0', shade: '#efd9c6', cheek: '#ff9fb2', acc: 'sprout' },
    { id: 'sakura',  name: 'Sakura', cost: 25,  body: '#ffd9e4', shade: '#f4b2c6', cheek: '#ff6f91', acc: 'blossom' },
    { id: 'matcha',  name: 'Matcha', cost: 60,  body: '#cfe8ab', shade: '#a8cc80', cheek: '#ff9e9e', acc: 'sprout' },
    { id: 'ube',     name: 'Ube',    cost: 120, body: '#d4bdf5', shade: '#ab8ed8', cheek: '#ff9ed2', acc: 'bow' },
    { id: 'golden',  name: 'Golden', cost: 250, body: '#ffe37e', shade: '#efbf3d', cheek: '#ff9a6b', acc: 'crown' },
  ];

  const save = {
    best: store.get('best', 0),
    petals: store.get('petals', 0),
    unlocked: store.get('unlocked', ['classic']),
    skin: store.get('skin', 'classic'),
    muted: store.get('muted', false),
  };
  let skinIndex = Math.max(0, SKINS.findIndex(s => s.id === save.skin));

  // ---------------------------------------------------------------------------
  // Sound (WebAudio synth; created on first touch)
  // ---------------------------------------------------------------------------
  let audio = null;
  function initAudio() {
    if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
  }
  function tone(freq, freqEnd, dur, type = 'sine', vol = 0.18, delay = 0) {
    if (!audio || save.muted) return;
    const t = audio.currentTime + delay;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.25) {
    if (!audio || save.muted) return;
    const len = Math.floor(audio.sampleRate * dur);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.createBufferSource();
    const g = audio.createGain();
    const f = audio.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(f).connect(g).connect(audio.destination);
    src.start();
  }
  const sfx = {
    hop()    { tone(380, 720, 0.12, 'sine', 0.16); },
    score()  { tone(880, 880, 0.08, 'triangle', 0.12); tone(1320, 1320, 0.14, 'triangle', 0.12, 0.07); },
    petal()  { tone(1568, 2093, 0.18, 'sine', 0.1); tone(2093, 2637, 0.2, 'sine', 0.07, 0.05); },
    hit()    { noise(0.25, 0.35); tone(220, 70, 0.35, 'square', 0.08); },
    thud()   { tone(140, 60, 0.18, 'sine', 0.25); },
    click()  { tone(600, 500, 0.05, 'triangle', 0.1); },
    unlock() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, 'triangle', 0.12, i * 0.08)); },
    nope()   { tone(200, 150, 0.15, 'square', 0.06); },
  };

  function vibrate(ms) {
    try {
      if (window.MochiNative && window.MochiNative.vibrate) window.MochiNative.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mixHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function text(str, x, y, size, color = '#fff', align = 'center', outline = '#3a2a3f') {
    ctx.font = `900 ${size}px "Trebuchet MS", "Arial Rounded MT Bold", Verdana, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (outline) {
      ctx.lineWidth = Math.max(3, size * 0.18);
      ctx.strokeStyle = outline;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  // ---------------------------------------------------------------------------
  // Sky palettes: the garden drifts from day to sunset to night as you score
  // ---------------------------------------------------------------------------
  const SKY = [
    { top: '#8fd3ff', bot: '#fff1d6', sun: '#fff6b0', far: '#a7c7e7', near: '#7fb59a' }, // day
    { top: '#ff9a8b', bot: '#ffd59e', sun: '#fff0c2', far: '#c58aa8', near: '#8a6d8f' }, // sunset
    { top: '#1d1b4f', bot: '#5b4a8a', sun: '#f4f1ff', far: '#3c3470', near: '#2b2655' }, // night
    { top: '#7fb4ff', bot: '#ffd1e8', sun: '#fff3c9', far: '#9eb2e0', near: '#7a9bb8' }, // dawn
  ];
  function skyAt(score) {
    const phase = (score / 12) % SKY.length;
    const i = Math.floor(phase);
    const t = clamp((phase - i - 0.75) / 0.25, 0, 1); // hold, then blend in the last quarter
    const a = SKY[i], b = SKY[(i + 1) % SKY.length];
    const out = {};
    for (const k in a) out[k] = mixHex(a[k], b[k], t);
    out.night = (i === 2 ? 1 - t : 0) + (i === 1 ? t : 0);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  const PIPE_W = 64;
  const GRAVITY = 1650;
  const HOP_V = -470;
  const MAX_FALL = 820;

  const mochi = {
    x: 0, y: 0, vy: 0, r: 18, rot: 0,
    sx: 1, sy: 1,           // squash & stretch
    leaf: 0,                // sprout leaf flap
    blink: 0, blinkT: 2,
    dead: false,
  };

  let state = 'title';      // title | ready | play | dying | over
  let stateT = 0;
  let paused = false;
  let score = 0;
  let runPetals = 0;
  let newBest = false;
  let pipes = [];
  let particles = [];
  let floaters = [];         // background drifting petals
  let popups = [];
  let distance = 0;          // scrolled distance (parallax / ground)
  let speed = 160;
  let shake = 0;
  let flash = 0;
  let scorePop = 0;
  let displaySky = 0;        // smoothed score used for sky color
  let uiShake = 0;
  let time = 0;

  for (let i = 0; i < 14; i++) floaters.push(newFloater(true));
  function newFloater(anywhere) {
    return {
      x: anywhere ? rand(0, 1) : 1.05, y: rand(0.05, 0.75),
      s: rand(3, 6), vx: rand(0.03, 0.07), vy: rand(-0.01, 0.02),
      a: rand(0, Math.PI * 2), va: rand(-2, 2),
    };
  }

  function resetRun() {
    mochi.x = W * 0.3;
    mochi.y = H * 0.42;
    mochi.vy = 0; mochi.rot = 0; mochi.sx = 1; mochi.sy = 1; mochi.dead = false;
    pipes = [];
    popups = [];
    score = 0;
    runPetals = 0;
    newBest = false;
    speed = 160;
    scorePop = 0;
  }

  function setState(s) { state = s; stateT = 0; }

  function hop() {
    mochi.vy = HOP_V;
    mochi.sx = 0.78; mochi.sy = 1.28;
    mochi.leaf = 1;
    sfx.hop();
    for (let i = 0; i < 5; i++) {
      particles.push({
        x: mochi.x - 6, y: mochi.y + mochi.r * 0.8,
        vx: rand(-90, -20), vy: rand(20, 90), life: 0.45, max: 0.45,
        size: rand(3, 6), color: 'rgba(255,255,255,0.9)', kind: 'puff',
      });
    }
  }

  function spawnPipe(x) {
    const gap = Math.max(148, 188 - score * 1.1);
    const minC = 70 + gap / 2;
    const maxC = groundY() - 50 - gap / 2;
    let c = rand(minC, maxC);
    const prev = pipes[pipes.length - 1];
    if (prev) c = clamp(c, prev.gapY - 210, prev.gapY + 210);
    const hasPetal = Math.random() < 0.55;
    pipes.push({
      x, gapY: c, gap, passed: false,
      petal: hasPetal ? { dx: PIPE_W / 2 + rand(70, 120), y: c + rand(-gap * 0.3, gap * 0.3), taken: false, bob: rand(0, 6) } : null,
      sway: rand(0, Math.PI * 2),
    });
  }

  function die() {
    if (mochi.dead) return;
    mochi.dead = true;
    shake = 14;
    flash = 1;
    sfx.hit();
    vibrate(60);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      particles.push({
        x: mochi.x, y: mochi.y, vx: Math.cos(a) * rand(120, 260), vy: Math.sin(a) * rand(120, 260),
        life: 0.7, max: 0.7, size: rand(4, 8), color: i % 2 ? '#ffe36e' : '#fff', kind: 'star',
      });
    }
    mochi.vy = Math.min(mochi.vy, -200);
    setState('dying');
  }

  function finishRun() {
    if (score > save.best) { save.best = score; newBest = true; store.set('best', save.best); }
    save.petals += runPetals;
    store.set('petals', save.petals);
    setState('over');
  }

  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------
  function update(dt) {
    time += dt;
    stateT += dt;
    displaySky = lerp(displaySky, score, Math.min(1, dt * 1.5));

    // Squash & stretch relax, leaf flap decay, blinking
    mochi.sx = lerp(mochi.sx, 1, Math.min(1, dt * 10));
    mochi.sy = lerp(mochi.sy, 1, Math.min(1, dt * 10));
    mochi.leaf = Math.max(0, mochi.leaf - dt * 4);
    mochi.blinkT -= dt;
    if (mochi.blinkT <= 0) { mochi.blink = 0.12; mochi.blinkT = rand(1.8, 4.5); }
    mochi.blink = Math.max(0, mochi.blink - dt);

    shake = Math.max(0, shake - dt * 40);
    flash = Math.max(0, flash - dt * 3);
    scorePop = Math.max(0, scorePop - dt * 4);
    uiShake = Math.max(0, uiShake - dt * 3);

    const scrolling = state === 'title' || state === 'ready' || state === 'play';
    if (scrolling) distance += speed * dt;

    // Background petals
    for (const f of floaters) {
      f.x -= f.vx * dt * (scrolling ? 1.6 : 0.6);
      f.y += f.vy * dt + Math.sin(time + f.a) * 0.0006;
      f.a += f.va * dt;
      if (f.x < -0.05 || f.y > 0.9) Object.assign(f, newFloater(false));
    }

    if (state === 'title') {
      mochi.x = W / 2;
      mochi.y = 285 + Math.sin(time * 3) * 6;
    } else if (state === 'ready') {
      mochi.x = W * 0.3;
      mochi.y = H * 0.42 + Math.sin(time * 4) * 7;
      mochi.rot = 0;
    } else if (state === 'play') {
      speed = 160 + Math.min(score, 50) * 1.6;
      mochi.vy = Math.min(MAX_FALL, mochi.vy + GRAVITY * dt);
      mochi.y += mochi.vy * dt;
      if (mochi.vy > 200) { mochi.sx = lerp(mochi.sx, 0.94, dt * 4); mochi.sy = lerp(mochi.sy, 1.08, dt * 4); }
      mochi.rot = clamp(mochi.vy / 1400, -0.35, 0.5);

      if (mochi.y < mochi.r) { mochi.y = mochi.r; mochi.vy = 0; }

      // Pipes
      for (const p of pipes) p.x -= speed * dt;
      while (pipes.length && pipes[0].x < -PIPE_W - 200) pipes.shift();
      const spacing = 225;
      const last = pipes[pipes.length - 1];
      if (!last || last.x < W + 40 - spacing) spawnPipe(last ? last.x + spacing : W + 60);

      const hitR = mochi.r * 0.82;
      for (const p of pipes) {
        const top = p.gapY - p.gap / 2;
        const bot = p.gapY + p.gap / 2;
        if (circleRect(mochi.x, mochi.y, hitR, p.x, -100, PIPE_W, top + 100) ||
            circleRect(mochi.x, mochi.y, hitR, p.x, bot, PIPE_W, groundY() - bot)) {
          die();
          break;
        }
        if (!p.passed && p.x + PIPE_W < mochi.x) {
          p.passed = true;
          score++;
          scorePop = 1;
          sfx.score();
        }
        if (p.petal && !p.petal.taken) {
          const px = p.x + p.petal.dx;
          const py = p.petal.y + Math.sin(time * 3 + p.petal.bob) * 6;
          const dx = px - mochi.x, dy = py - mochi.y;
          if (dx * dx + dy * dy < (mochi.r + 14) ** 2) {
            p.petal.taken = true;
            runPetals++;
            sfx.petal();
            popups.push({ x: px, y: py, text: '+1', life: 0.8 });
            for (let i = 0; i < 8; i++) {
              particles.push({
                x: px, y: py, vx: rand(-120, 120), vy: rand(-160, 60), life: 0.6, max: 0.6,
                size: rand(3, 5), color: '#ff9ec0', kind: 'petal',
              });
            }
          }
        }
      }

      if (mochi.y + mochi.r >= groundY()) {
        mochi.y = groundY() - mochi.r;
        die();
      }
    } else if (state === 'dying') {
      mochi.vy = Math.min(MAX_FALL * 1.2, mochi.vy + GRAVITY * dt);
      mochi.y += mochi.vy * dt;
      mochi.rot += dt * 6;
      const floor = groundY() - mochi.r * 0.7;
      if (mochi.y >= floor) {
        if (mochi.vy > 100) { sfx.thud(); mochi.sx = 1.4; mochi.sy = 0.6; }
        mochi.y = floor;
        mochi.vy = 0;
        mochi.rot = 0;
      }
      if (mochi.vy === 0 && stateT > 0.6) finishRun();
    }

    for (const pt of particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.kind !== 'puff') pt.vy += 400 * dt;
      pt.vx *= 0.98;
    }
    particles = particles.filter(p => p.life > 0);
    for (const u of popups) { u.life -= dt; u.y -= 40 * dt; }
    popups = popups.filter(u => u.life > 0);
  }

  // ---------------------------------------------------------------------------
  // Drawing: scenery
  // ---------------------------------------------------------------------------
  function ridge(offset, baseY, amp, seed, color, step = 8) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + step; x += step) {
      const wx = x + offset;
      const y = baseY
        - Math.sin(wx * 0.006 + seed) * amp
        - Math.sin(wx * 0.013 + seed * 2.1) * amp * 0.45
        - Math.abs(Math.sin(wx * 0.0021 + seed * 0.7)) * amp * 1.2;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawToriiAndPagodas(offset, baseY, color) {
    const period = 900;
    ctx.fillStyle = color;
    const start = Math.floor(offset / period) - 1;
    for (let k = start; k < start + Math.ceil(W / period) + 3; k++) {
      const x = k * period - offset + 300;
      if (k % 2 === 0) {
        // torii gate
        ctx.fillRect(x - 22, baseY - 46, 5, 46);
        ctx.fillRect(x + 17, baseY - 46, 5, 46);
        ctx.fillRect(x - 30, baseY - 52, 60, 6);
        ctx.fillRect(x - 24, baseY - 40, 48, 4);
      } else {
        // pagoda
        for (let i = 0; i < 3; i++) {
          const w = 46 - i * 10, y = baseY - 16 - i * 18;
          ctx.beginPath();
          ctx.moveTo(x - w / 2 - 8, y);
          ctx.lineTo(x + w / 2 + 8, y);
          ctx.lineTo(x + w / 2 - 4, y - 7);
          ctx.lineTo(x - w / 2 + 4, y - 7);
          ctx.closePath();
          ctx.fill();
          ctx.fillRect(x - w / 2 + 6, y, w - 12, 12);
        }
        ctx.fillRect(x - 1.5, baseY - 80, 3, 14);
      }
    }
  }

  function drawBackground(sky) {
    const g = ctx.createLinearGradient(0, 0, 0, groundY());
    g.addColorStop(0, sky.top);
    g.addColorStop(1, sky.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // stars at night
    if (sky.night > 0.05) {
      ctx.fillStyle = `rgba(255,255,255,${sky.night * 0.85})`;
      for (let i = 0; i < 40; i++) {
        const sx = ((i * 97.3 + 13) % 1) * W + ((i * 137) % W);
        const sy = (i * 53) % 300;
        const tw = 0.6 + 0.4 * Math.sin(time * 2 + i);
        ctx.globalAlpha = sky.night * tw;
        ctx.fillRect(sx % W, sy, 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    // sun / moon
    const sunX = W * 0.75, sunY = 120;
    ctx.fillStyle = sky.sun;
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(sunX, sunY, 58, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(sunX, sunY, 40, 0, Math.PI * 2); ctx.fill();

    ridge(distance * 0.08, groundY() - 150, 50, 1.3, sky.far, 10);
    drawToriiAndPagodas(distance * 0.18, groundY() - 62, sky.near);
    ridge(distance * 0.25, groundY() - 40, 26, 4.1, sky.near, 8);

    // drifting background petals
    for (const f of floaters) drawPetal(f.x * W, f.y * H, f.s, f.a, 'rgba(255,183,206,0.75)');
  }

  function drawPetal(x, y, s, a, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(s, -s * 0.2, 0, s);
    ctx.quadraticCurveTo(-s, -s * 0.2, 0, -s);
    ctx.fill();
    ctx.restore();
  }

  function drawBambooSegment(x, y0, y1, flip, sway) {
    const w = PIPE_W;
    if (y1 <= y0) return;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#3f8f3a');
    g.addColorStop(0.25, '#8fd36a');
    g.addColorStop(0.55, '#5fb24a');
    g.addColorStop(1, '#2f6e2c');
    ctx.fillStyle = g;
    ctx.fillRect(x, y0, w, y1 - y0);

    // nodes, anchored to the cap end so they don't slide
    const anchor = flip ? y1 : y0;
    ctx.fillStyle = 'rgba(30,80,30,0.55)';
    for (let k = 0; ; k++) {
      const ny = flip ? anchor - 30 - k * 52 : anchor + 30 + k * 52;
      if (ny < y0 - 4 || ny > y1 + 4) break;
      ctx.fillRect(x - 2, ny - 3, w + 4, 6);
      ctx.fillStyle = 'rgba(200,255,170,0.35)';
      ctx.fillRect(x - 2, ny + 3, w + 4, 2);
      ctx.fillStyle = 'rgba(30,80,30,0.55)';
    }

    // cap (cut end) facing the gap
    const capY = flip ? y1 - 16 : y0;
    roundRect(x - 5, capY, w + 10, 16, 6);
    const cg = ctx.createLinearGradient(x, 0, x + w, 0);
    cg.addColorStop(0, '#4c9e44');
    cg.addColorStop(0.3, '#a3e07c');
    cg.addColorStop(1, '#357a31');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = '#265d24';
    ctx.lineWidth = 2;
    ctx.stroke();

    // a little leaf sprig near the cap
    const ly = flip ? y1 - 40 : y0 + 40;
    ctx.save();
    ctx.translate(x + w, ly);
    ctx.rotate((flip ? -0.5 : 0.5) + Math.sin(time * 2 + sway) * 0.12);
    ctx.fillStyle = '#4aa840';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(18, -8, 34, 0);
    ctx.quadraticCurveTo(18, 6, 0, 0);
    ctx.fill();
    ctx.restore();
  }

  function drawPipes() {
    for (const p of pipes) {
      const top = p.gapY - p.gap / 2;
      const bot = p.gapY + p.gap / 2;
      drawBambooSegment(p.x, -10, top, true, p.sway);
      drawBambooSegment(p.x, bot, groundY(), false, p.sway);
      if (p.petal && !p.petal.taken) {
        const px = p.x + p.petal.dx;
        const py = p.petal.y + Math.sin(time * 3 + p.petal.bob) * 6;
        drawSakura(px, py, 11, time * 0.8);
      }
    }
  }

  function drawSakura(x, y, r, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.rotate(a);
    for (let i = 0; i < 5; i++) {
      ctx.rotate(Math.PI * 2 / 5);
      ctx.fillStyle = '#ffb3cc';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(r * 0.9, -r * 0.5, r * 0.25, -r);
      ctx.lineTo(0, -r * 0.82);
      ctx.lineTo(-r * 0.25, -r);
      ctx.quadraticCurveTo(-r * 0.9, -r * 0.5, 0, 0);
      ctx.fill();
    }
    ctx.fillStyle = '#ff6f9a';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawGround() {
    const gy = groundY();
    // moss edge
    ctx.fillStyle = '#5a8f4e';
    ctx.fillRect(0, gy - 4, W, 10);
    // raked sand
    const g = ctx.createLinearGradient(0, gy, 0, H);
    g.addColorStop(0, '#eedfba');
    g.addColorStop(1, '#d8c294');
    ctx.fillStyle = g;
    ctx.fillRect(0, gy + 6, W, H - gy);

    // rake lines
    ctx.strokeStyle = 'rgba(160,130,85,0.45)';
    ctx.lineWidth = 2;
    for (let row = 0; row < 5; row++) {
      const y = gy + 20 + row * 15;
      ctx.beginPath();
      for (let x = 0; x <= W + 6; x += 6) {
        const yy = y + Math.sin((x + distance) * 0.05 + row) * 2;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }

    // stones with ripple rings
    const period = 340;
    const start = Math.floor(distance / period) - 1;
    for (let k = start; k < start + Math.ceil(W / period) + 2; k++) {
      const x = k * period - distance + 120 + ((k * 71) % 90);
      const y = gy + 48 + ((k * 37) % 20);
      ctx.strokeStyle = 'rgba(160,130,85,0.5)';
      for (let r = 1; r <= 3; r++) {
        ctx.beginPath(); ctx.ellipse(x, y, 16 + r * 9, 7 + r * 4, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#8a8a8f';
      ctx.beginPath(); ctx.ellipse(x, y - 2, 15, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a9a9ae';
      ctx.beginPath(); ctx.ellipse(x - 3, y - 5, 8, 4, -0.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing: Mochi
  // ---------------------------------------------------------------------------
  function drawMochi(x, y, size, skin, opts = {}) {
    const r = mochi.r;
    const sx = opts.sx ?? 1, sy = opts.sy ?? 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.rotate(opts.rot || 0);

    // soft shadow
    ctx.fillStyle = 'rgba(40,20,40,0.15)';
    ctx.beginPath(); ctx.ellipse(1.5, r * 0.95 * sy, r * 0.9 * sx, r * 0.18, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.scale(sx, sy);

    const rx = r * 1.1, ry = r * 0.96;

    // accessory behind body top
    drawAccessory(skin.acc, r, opts.leaf || 0, ry);

    // body
    ctx.fillStyle = skin.shade;
    ctx.beginPath(); ctx.ellipse(0, 1.5, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin.body;
    ctx.beginPath(); ctx.ellipse(0, -0.5, rx * 0.97, ry * 0.94, 0, 0, Math.PI * 2); ctx.fill();
    // outline
    ctx.strokeStyle = 'rgba(80,50,60,0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, 0.5, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(-r * 0.5, -r * 0.5, r * 0.28, r * 0.15, -0.6, 0, Math.PI * 2); ctx.fill();

    // cheeks
    ctx.fillStyle = skin.cheek;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.ellipse(-r * 0.62, r * 0.2, r * 0.2, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.62, r * 0.2, r * 0.2, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // eyes
    const ex = r * 0.36, ey = -r * 0.06;
    ctx.strokeStyle = '#2b1d2e';
    ctx.fillStyle = '#2b1d2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    if (opts.dead) {
      for (const s of [-1, 1]) {
        const cx = s * ex;
        ctx.beginPath();
        ctx.moveTo(cx - 3.5, ey - 3.5); ctx.lineTo(cx + 3.5, ey + 3.5);
        ctx.moveTo(cx + 3.5, ey - 3.5); ctx.lineTo(cx - 3.5, ey + 3.5);
        ctx.stroke();
      }
    } else if (opts.blink || opts.happy) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        if (opts.happy) ctx.arc(s * ex, ey + 2, 3.6, Math.PI * 1.1, Math.PI * 1.9);
        else { ctx.moveTo(s * ex - 3.5, ey); ctx.lineTo(s * ex + 3.5, ey); }
        ctx.stroke();
      }
    } else {
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(s * ex, ey, 3.2, 4.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * ex + 1.1, ey - 1.6, 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2b1d2e';
      }
    }

    // mouth
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (opts.dead) {
      ctx.ellipse(0, r * 0.32, 2.6, 3.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (opts.hopping) {
      ctx.fillStyle = '#c94a6a';
      ctx.ellipse(0, r * 0.3, 3, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(-3.6, r * 0.24);
      ctx.quadraticCurveTo(-1.8, r * 0.42, 0, r * 0.26);
      ctx.quadraticCurveTo(1.8, r * 0.42, 3.6, r * 0.24);
      ctx.stroke();
    }

    ctx.restore();
    ctx.restore();
  }

  function drawAccessory(kind, r, leaf, ry) {
    const top = -ry * 0.92;
    ctx.save();
    if (kind === 'sprout') {
      ctx.strokeStyle = '#3d8a34';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, top + 2); ctx.quadraticCurveTo(1, top - 5, 0, top - 8); ctx.stroke();
      const flap = leaf * 0.7;
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(0, top - 8);
        ctx.rotate(s * (0.35 + flap) - (s < 0 ? 0 : 0));
        ctx.fillStyle = s < 0 ? '#5cbf4a' : '#4aa83c';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(s * 6, -9, s * 14, -4);
        ctx.quadraticCurveTo(s * 7, 3, 0, 0);
        ctx.fill();
        ctx.restore();
      }
    } else if (kind === 'blossom') {
      ctx.translate(r * 0.45, top + 3);
      for (let i = 0; i < 5; i++) {
        ctx.rotate(Math.PI * 2 / 5);
        ctx.fillStyle = '#ff8fb3';
        ctx.beginPath(); ctx.ellipse(0, -4.5, 3.4, 4.8, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ffe36e';
      ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'bow') {
      ctx.translate(0, top + 1);
      ctx.fillStyle = '#ff5f8f';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(s * 10, -7 - leaf * 3);
        ctx.lineTo(s * 11, 5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'crown') {
      ctx.translate(0, top + 2);
      ctx.fillStyle = '#ffcf33';
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-9, 0); ctx.lineTo(-10, -10); ctx.lineTo(-4.5, -5); ctx.lineTo(0, -13);
      ctx.lineTo(4.5, -5); ctx.lineTo(10, -10); ctx.lineTo(9, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff4f7a';
      ctx.beginPath(); ctx.arc(0, -4, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Drawing: effects & UI
  // ---------------------------------------------------------------------------
  function drawParticles() {
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      if (p.kind === 'petal') drawPetal(p.x, p.y, p.size, p.life * 10, p.color);
      else if (p.kind === 'star') {
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * 8);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.5 - a * 0.5), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const u of popups) {
      ctx.globalAlpha = clamp(u.life / 0.8, 0, 1);
      text(u.text, u.x, u.y, 18, '#ffb3cc');
    }
    ctx.globalAlpha = 1;
  }

  const ui = {};  // hit areas, rebuilt each frame

  function button(id, cx, cy, w, h, label, color, enabled = true) {
    ui[id] = { x: cx - w / 2, y: cy - h / 2, w, h };
    ctx.fillStyle = 'rgba(58,42,63,0.9)';
    roundRect(cx - w / 2, cy - h / 2 + 5, w, h, 16); ctx.fill();
    ctx.fillStyle = enabled ? color : '#b9aebb';
    roundRect(cx - w / 2, cy - h / 2, w, h, 16); ctx.fill();
    ctx.strokeStyle = '#3a2a3f'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    roundRect(cx - w / 2 + 6, cy - h / 2 + 5, w - 12, h * 0.32, 10); ctx.fill();
    text(label, cx, cy + 1, h * 0.42, '#fff');
  }

  function arrowButton(id, cx, cy, dir) {
    ui[id] = { x: cx - 28, y: cy - 28, w: 56, h: 56 };
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2a3f'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#3a2a3f';
    ctx.beginPath();
    ctx.moveTo(cx + dir * 9, cy);
    ctx.lineTo(cx - dir * 6, cy - 10);
    ctx.lineTo(cx - dir * 6, cy + 10);
    ctx.closePath(); ctx.fill();
  }

  function petalCounter(x, y, n) {
    drawSakura(x, y, 11, 0);
    text(String(n), x + 18, y + 1, 20, '#fff', 'left');
  }

  function muteButton() {
    const cx = W - 34, cy = 36;
    ui.mute = { x: cx - 24, y: cy - 24, w: 48, h: 48 };
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(cx, cy, 19, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2a3f'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#3a2a3f';
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy - 4); ctx.lineTo(cx - 4, cy - 4); ctx.lineTo(cx + 2, cy - 10);
    ctx.lineTo(cx + 2, cy + 10); ctx.lineTo(cx - 4, cy + 4); ctx.lineTo(cx - 9, cy + 4);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 2;
    if (save.muted) {
      ctx.beginPath(); ctx.moveTo(cx + 5, cy - 5); ctx.lineTo(cx + 12, cy + 5);
      ctx.moveTo(cx + 12, cy - 5); ctx.lineTo(cx + 5, cy + 5); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(cx + 3, cy, 6, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 3, cy, 10, -0.9, 0.9); ctx.stroke();
    }
  }

  function drawTitle() {
    const cx = W / 2;
    const skin = SKINS[skinIndex];
    const unlocked = save.unlocked.includes(skin.id);

    // title logo
    const bob = Math.sin(time * 2) * 3;
    text('Mochi', cx, 120 + bob, 64, '#fff8f0', 'center', '#3a2a3f');
    text('HOP', cx, 178 + bob, 46, '#ff8fb3', 'center', '#3a2a3f');

    // character preview
    const s = 2.4;
    const sh = uiShake > 0 ? Math.sin(uiShake * 40) * 6 * uiShake : 0;
    ctx.globalAlpha = unlocked ? 1 : 0.55;
    drawMochi(cx + sh, mochi.y, s, skin, { blink: mochi.blink > 0, leaf: (Math.sin(time * 6) + 1) * 0.3 });
    ctx.globalAlpha = 1;
    if (!unlocked) {
      // lock badge
      const lx = cx + 40, ly = mochi.y + 28;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(lx, ly, 20, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3a2a3f'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#3a2a3f';
      roundRect(lx - 9, ly - 3, 18, 14, 3); ctx.fill();
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(lx, ly - 3, 5.5, Math.PI, 0); ctx.stroke();
    }

    const ax = Math.min(120, W / 2 - 34);
    arrowButton('left', cx - ax, 285, -1);
    arrowButton('right', cx + ax, 285, 1);

    text(skin.name, cx, 358, 28, '#fff');
    // skin dots
    for (let i = 0; i < SKINS.length; i++) {
      ctx.fillStyle = i === skinIndex ? '#fff' : 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.arc(cx + (i - (SKINS.length - 1) / 2) * 16, 386, i === skinIndex ? 5 : 4, 0, Math.PI * 2); ctx.fill();
    }

    if (unlocked) {
      button('play', cx, 446, 180, 60, 'PLAY', '#ff7aa2');
    } else {
      const can = save.petals >= skin.cost;
      button('play', cx, 446, 200, 60, `UNLOCK ${skin.cost}`, '#ffb347', can);
      if (!can) text(`Collect ${skin.cost - save.petals} more petals`, cx, 496, 15, '#fff');
    }

    text(`BEST ${save.best}`, cx, 532, 20, '#fff');
    petalCounter(26, 36, save.petals);
    muteButton();
  }

  function drawReady() {
    const cx = W / 2;
    text('Get Ready!', cx, 150, 40, '#fff');
    // tap hint
    const t = (Math.sin(time * 6) + 1) / 2;
    ctx.save();
    ctx.translate(mochi.x + 4, mochi.y + 70 + t * 6);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#3a2a3f';
    ctx.lineWidth = 3;
    roundRect(-11, -4, 22, 30, 10); ctx.fill(); ctx.stroke();
    roundRect(-4, -22, 8, 26, 4); ctx.fill(); ctx.stroke();
    ctx.restore();
    text('Tap to hop', cx, 360, 22, '#fff');
    text('Catch sakura petals to unlock friends!', cx, 395, 14, '#ffe3ee');
  }

  function medalFor(s) {
    if (s >= 80) return { name: 'JADE', c1: '#7be0b0', c2: '#2e9b6c' };
    if (s >= 40) return { name: 'GOLD', c1: '#ffe066', c2: '#c99a10' };
    if (s >= 20) return { name: 'SILVER', c1: '#eef2f5', c2: '#9aa6b1' };
    if (s >= 10) return { name: 'BRONZE', c1: '#f1b27a', c2: '#a8642c' };
    return null;
  }

  function drawOver() {
    const cx = W / 2;
    const t = clamp(stateT / 0.35, 0, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const dy = (1 - ease) * 300;

    text('Squish!', cx, 128 - (1 - ease) * 80, 52, '#fff');

    // panel
    const pw = Math.min(300, W - 40), ph = 180, px = cx - pw / 2, py = 180 + dy;
    ctx.fillStyle = 'rgba(58,42,63,0.9)';
    roundRect(px, py + 6, pw, ph, 20); ctx.fill();
    ctx.fillStyle = '#fff6ea';
    roundRect(px, py, pw, ph, 20); ctx.fill();
    ctx.strokeStyle = '#3a2a3f'; ctx.lineWidth = 3; ctx.stroke();

    // medal
    const m = medalFor(score);
    const mx = px + 70, my = py + 92;
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.arc(mx, my, 40, 0, Math.PI * 2); ctx.fill();
    if (m) {
      const g = ctx.createRadialGradient(mx - 10, my - 10, 4, mx, my, 38);
      g.addColorStop(0, m.c1); g.addColorStop(1, m.c2);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(mx, my, 36, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3a2a3f'; ctx.lineWidth = 2.5; ctx.stroke();
      drawMochi(mx, my + 2, 1.1, SKINS[skinIndex], { happy: true });
      text(m.name, mx, py + 150, 13, m.c2, 'center', null);
    } else {
      text('?', mx, my, 30, 'rgba(58,42,63,0.25)', 'center', null);
      text('10 for medal', mx, py + 150, 11, 'rgba(58,42,63,0.5)', 'center', null);
    }

    const rx = px + pw - 24;
    text('SCORE', rx, py + 32, 14, '#b06b85', 'right', null);
    text(String(score), rx, py + 62, 32, '#fff', 'right');
    text('BEST', rx, py + 100, 14, '#b06b85', 'right', null);
    text(String(save.best), rx, py + 130, 32, '#fff', 'right');
    if (newBest) {
      ctx.save();
      ctx.translate(rx - 78, py + 128);
      ctx.rotate(-0.15);
      ctx.fillStyle = '#ff5f8f';
      roundRect(-24, -11, 48, 22, 8); ctx.fill();
      text('NEW!', 0, 1, 13, '#fff', 'center', null);
      ctx.restore();
    }

    petalCounter(px + 22, py + ph + 34, `+${runPetals}  (${save.petals})`);

    if (stateT > 0.5) {
      button('again', cx - 72, 450 + dy, 128, 56, 'AGAIN', '#ff7aa2');
      button('skins', cx + 72, 450 + dy, 128, 56, 'FRIENDS', '#7ac7ff');
    }
    muteButton();
  }

  function drawHud() {
    const pop = 1 + scorePop * 0.35;
    ctx.save();
    ctx.translate(W / 2, 70);
    ctx.scale(pop, pop);
    text(String(score), 0, 0, 56, '#fff');
    ctx.restore();
    if (runPetals > 0) petalCounter(26, 36, runPetals);
  }

  function draw() {
    for (const k in ui) delete ui[k];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);

    const sky = skyAt(displaySky);
    drawBackground(sky);
    if (state !== 'title') drawPipes();
    drawGround();

    if (state !== 'title') {
      drawMochi(mochi.x, mochi.y, 1, SKINS[skinIndex], {
        rot: mochi.rot, sx: mochi.sx, sy: mochi.sy, leaf: mochi.leaf,
        blink: mochi.blink > 0, dead: mochi.dead, hopping: state === 'play' && mochi.vy < -150,
      });
    }
    drawParticles();

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.7})`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }

    if (state === 'title') drawTitle();
    else if (state === 'ready') drawReady();
    else if (state === 'play' || state === 'dying') drawHud();
    else if (state === 'over') drawOver();

    if (paused) {
      ctx.fillStyle = 'rgba(29,27,47,0.55)';
      ctx.fillRect(0, 0, W, H);
      text('Paused', W / 2, H * 0.4, 44, '#fff');
      text('Tap to continue', W / 2, H * 0.4 + 50, 20, '#fff');
    }
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  function hitTest(id, x, y) {
    const b = ui[id];
    return b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  function changeSkin(dir) {
    skinIndex = (skinIndex + dir + SKINS.length) % SKINS.length;
    sfx.click();
    const s = SKINS[skinIndex];
    if (save.unlocked.includes(s.id)) { save.skin = s.id; store.set('skin', s.id); }
  }

  function onTap(x, y) {
    initAudio();
    if (paused) { paused = false; last = performance.now(); return; }

    if ((state === 'title' || state === 'over') && hitTest('mute', x, y)) {
      save.muted = !save.muted;
      store.set('muted', save.muted);
      sfx.click();
      return;
    }

    if (state === 'title') {
      if (hitTest('left', x, y)) return changeSkin(-1);
      if (hitTest('right', x, y)) return changeSkin(1);
      const skin = SKINS[skinIndex];
      if (!save.unlocked.includes(skin.id)) {
        if (hitTest('play', x, y)) {
          if (save.petals >= skin.cost) {
            save.petals -= skin.cost;
            save.unlocked.push(skin.id);
            save.skin = skin.id;
            store.set('petals', save.petals);
            store.set('unlocked', save.unlocked);
            store.set('skin', skin.id);
            sfx.unlock();
            vibrate(30);
            for (let i = 0; i < 24; i++) {
              particles.push({
                x: W / 2, y: mochi.y, vx: rand(-220, 220), vy: rand(-320, 40), life: 1, max: 1,
                size: rand(4, 7), color: '#ffb3cc', kind: 'petal',
              });
            }
          } else {
            uiShake = 1;
            sfx.nope();
          }
        }
        return;
      }
      resetRun();
      sfx.click();
      setState('ready');
    } else if (state === 'ready') {
      setState('play');
      hop();
    } else if (state === 'play') {
      hop();
    } else if (state === 'over') {
      if (stateT < 0.5) return;
      if (hitTest('skins', x, y)) { sfx.click(); setState('title'); return; }
      if (hitTest('again', x, y)) { resetRun(); sfx.click(); setState('ready'); }
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * dpr) / scale;
    const y = ((e.clientY - rect.top) * dpr) / scale;
    onTap(x, y);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (state === 'over' && stateT >= 0.5) { resetRun(); setState('ready'); return; }
      if (state === 'title') { onTap(W / 2, 446); return; }
      onTap(-1, -1);
    } else if (state === 'title' && e.code === 'ArrowLeft') changeSkin(-1);
    else if (state === 'title' && e.code === 'ArrowRight') changeSkin(1);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'play') paused = true;
    if (document.hidden && audio) audio.suspend();
  });

  // Exposed for the Android back button.
  window.mochiBack = function () {
    if (state === 'play') { paused = true; return true; }
    if (state === 'ready' || state === 'over') { setState('title'); return true; }
    return false;
  };

  // ---------------------------------------------------------------------------
  // Main loop (fixed timestep for consistent physics on any refresh rate)
  // ---------------------------------------------------------------------------
  const STEP = 1 / 120;
  let acc = 0;
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (!paused) {
      acc += dt;
      while (acc >= STEP) { update(STEP); acc -= STEP; }
    }
    draw();
    requestAnimationFrame(frame);
  }
  resetRun();
  requestAnimationFrame(frame);

  // test hook
  window.__mochi = { get state() { return state; }, get score() { return score; }, mochi, pipes: () => pipes, save };
})();
