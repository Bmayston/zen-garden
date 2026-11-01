/*
 * Mochi Hop
 * Tap to make Mochi hop between hanami dango skewers in a cherry-blossom zen garden.
 * Everything (character, scenery, sound, music) is generated in code: no image or audio assets.
 */
(() => {
  'use strict';

  const native = window.MochiNative || null;

  // ---------------------------------------------------------------------------
  // Setup & scaling
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const screenCtx = canvas.getContext('2d');
  let ctx = screenCtx;

  const H = 640;          // virtual height; width adapts to the screen aspect ratio
  let W = 360;
  let scale = 1;
  let dpr = 1;
  let topInset = 0;       // virtual units kept clear for camera cutouts

  const GROUND_H = 92;
  const groundY = () => H - GROUND_H;

  function readTopInset() {
    let css = 0;
    try { if (native && native.safeTop) css = Number(native.safeTop()) || 0; } catch (e) { /* ignore */ }
    try {
      const probe = document.getElementById('safe-probe');
      if (probe) css = Math.max(css, parseFloat(getComputedStyle(probe).paddingTop) || 0);
    } catch (e) { /* ignore */ }
    topInset = (css * dpr) / scale;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    scale = canvas.height / H;
    W = canvas.width / scale;
    readTopInset();
    buildSprites();
    groundGrad = null;
  }
  window.addEventListener('resize', resize);

  // ---------------------------------------------------------------------------
  // Persistence: native SharedPreferences on Android, localStorage in a browser
  // ---------------------------------------------------------------------------
  const store = {
    get(key, fallback) {
      let raw = null;
      try { if (native && native.getItem) raw = native.getItem('mochihop.' + key); } catch (e) { /* ignore */ }
      if (raw === null || raw === undefined) {
        try { raw = localStorage.getItem('mochihop.' + key); } catch (e) { /* ignore */ }
      }
      if (raw === null || raw === undefined) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    },
    set(key, value) {
      const raw = JSON.stringify(value);
      try { if (native && native.setItem) native.setItem('mochihop.' + key, raw); } catch (e) { /* ignore */ }
      try { localStorage.setItem('mochihop.' + key, raw); } catch (e) { /* ignore */ }
    },
  };

  // ---------------------------------------------------------------------------
  // Friends (skins). Every friend keeps Mochi's signature sprout.
  // ---------------------------------------------------------------------------
  const SKINS = [
    { id: 'classic', name: 'Mochi',  cost: 0,   body: '#fff8f0', shade: '#efd9c6', cheek: '#ff9fb2', acc: null },
    { id: 'sakura',  name: 'Sakura', cost: 25,  body: '#ffd9e4', shade: '#f4b2c6', cheek: '#ff6f91', acc: 'blossom' },
    { id: 'matcha',  name: 'Matcha', cost: 60,  body: '#cfe8ab', shade: '#a8cc80', cheek: '#ff9e9e', acc: 'tea' },
    { id: 'ube',     name: 'Ube',    cost: 120, body: '#d4bdf5', shade: '#ab8ed8', cheek: '#ff9ed2', acc: 'bow' },
    { id: 'golden',  name: 'Golden', cost: 250, body: '#ffe37e', shade: '#efbf3d', cheek: '#ff9a6b', acc: 'crown' },
  ];

  const save = {
    best: store.get('best', 0),
    petals: store.get('petals', 0),
    unlocked: store.get('unlocked', ['classic']),
    skin: store.get('skin', 'classic'),
    muted: store.get('muted', false),
    haptics: store.get('haptics', true),
    played: store.get('played', 0),
    daily: store.get('daily', { date: '', best: 0, streak: 0, lastDate: '', runs: 0 }),
    missions: store.get('missions', null),
    totals: store.get('totals', { splats: 0, petals: 0, near: 0, runs: 0, score: 0 }),
  };
  let skinIndex = Math.max(0, SKINS.findIndex(s => s.id === save.skin));

  // ---------------------------------------------------------------------------
  // Audio: synthesized sound effects + generative koto-style music
  // ---------------------------------------------------------------------------
  let audio = null, sfxGain = null, musicGain = null;
  function initAudio() {
    if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
    try {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      sfxGain = audio.createGain();
      sfxGain.gain.value = 1;
      sfxGain.connect(audio.destination);
      musicGain = audio.createGain();
      musicGain.gain.value = 0.55;
      musicGain.connect(audio.destination);
      music.next = audio.currentTime + 0.2;
    } catch (e) { audio = null; }
  }
  const audioOn = () => audio && !save.muted;

  function tone(freq, freqEnd, dur, type = 'sine', vol = 0.18, delay = 0, dest = null) {
    if (!audioOn()) return;
    const t = audio.currentTime + delay;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd !== freq) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.25, cutoff = 900) {
    if (!audioOn()) return;
    const len = Math.floor(audio.sampleRate * dur);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.createBufferSource();
    const g = audio.createGain();
    const f = audio.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(f).connect(g).connect(sfxGain);
    src.start();
  }

  // Japanese "yo" pentatonic, in semitones above C5
  const YO = [0, 2, 5, 7, 9, 12, 14, 17, 19, 21];
  const noteHz = (semi, base = 523.25) => base * Math.pow(2, semi / 12);

  const sfx = {
    // Signature "boing": quick rise, little wobble down
    hop() {
      if (!audioOn()) return;
      const t = audio.currentTime;
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(300, t);
      o.frequency.exponentialRampToValueAtTime(640, t + 0.06);
      o.frequency.exponentialRampToValueAtTime(520, t + 0.14);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.17, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(sfxGain);
      o.start(t); o.stop(t + 0.18);
    },
    // Score chime climbs the scale with each gap in a row
    score(n) {
      const semi = YO[(n - 1) % YO.length];
      tone(noteHz(semi), noteHz(semi), 0.16, 'triangle', 0.11);
      tone(noteHz(semi + 12), noteHz(semi + 12), 0.1, 'sine', 0.04, 0.02);
    },
    milestone() { [0, 5, 9, 12].forEach((s, i) => tone(noteHz(s + 12), noteHz(s + 12), 0.2, 'triangle', 0.1, i * 0.07)); },
    petal()  { tone(1568, 2093, 0.18, 'sine', 0.1); tone(2093, 2637, 0.2, 'sine', 0.07, 0.05); },
    close()  { tone(2637, 3520, 0.08, 'triangle', 0.07); tone(3136, 3951, 0.12, 'sine', 0.05, 0.05); },
    mission() { [7, 12, 16, 19].forEach((s, i) => tone(noteHz(s), noteHz(s), 0.16, 'triangle', 0.1, i * 0.06)); },
    // Squishy "bloop" splat
    splat() {
      if (!audioOn()) return;
      const t = audio.currentTime;
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(820, t);
      o.frequency.exponentialRampToValueAtTime(150, t + 0.28);
      const lfo = audio.createOscillator();
      const lg = audio.createGain();
      lfo.frequency.value = 28; lg.gain.value = 40;
      lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(g).connect(sfxGain);
      o.start(t); lfo.start(t);
      o.stop(t + 0.34); lfo.stop(t + 0.34);
      noise(0.12, 0.2, 1400);
    },
    slide()  { tone(500, 300, 0.4, 'sine', 0.03); },
    flop()   { tone(160, 70, 0.2, 'sine', 0.22); noise(0.08, 0.12, 600); },
    click()  { tone(600, 500, 0.05, 'triangle', 0.1); },
    unlock() { [0, 4, 7, 12].forEach((s, i) => tone(noteHz(s), noteHz(s), 0.18, 'triangle', 0.12, i * 0.08)); },
    nope()   { tone(200, 150, 0.15, 'square', 0.06); },
  };

  // Generative music: soft koto-like plucks on the yo scale over a gentle drone
  const music = { next: 0, step: 0, last: 4, tempo: 0.34 };
  function pluck(freq, t, vol) {
    const o1 = audio.createOscillator(), o2 = audio.createOscillator();
    const g = audio.createGain();
    const f = audio.createBiquadFilter();
    o1.type = 'triangle'; o2.type = 'sine';
    o1.frequency.value = freq; o2.frequency.value = freq * 2.01;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o1.connect(f); o2.connect(f);
    f.connect(g).connect(musicGain);
    o1.start(t); o2.start(t); o1.stop(t + 0.95); o2.stop(t + 0.95);
  }
  function scheduleMusic() {
    if (!audioOn()) { if (audio) music.next = audio.currentTime + 0.1; return; }
    const tempo = state === 'play' ? 0.3 : 0.38;
    while (music.next < audio.currentTime + 0.25) {
      const t = music.next;
      const s = music.step;
      if (s % 16 === 0) {
        // drone: alternate C and G every bar
        const root = (s / 16) % 2 === 0 ? 130.81 : 98.0;
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'sine'; o.frequency.value = root;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + tempo * 16);
        o.connect(g).connect(musicGain);
        o.start(t); o.stop(t + tempo * 16 + 0.05);
      }
      if (Math.random() > (s % 2 ? 0.55 : 0.25)) {
        music.last = clamp(music.last + Math.round(rand(-2.4, 2.4)), 0, YO.length - 1);
        pluck(noteHz(YO[music.last], 261.63), t, s % 4 === 0 ? 0.07 : 0.045);
      }
      music.step++;
      music.next += tempo;
    }
  }

  function haptic(kind) {
    if (!save.haptics) return;
    try {
      if (native && native.haptic) native.haptic(kind);
      else if (navigator.vibrate) navigator.vibrate(kind === 'heavy' ? 40 : kind === 'click' ? 12 : 6);
    } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Seeded RNG for the daily challenge: everyone gets the same skewers each day
  // ---------------------------------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function dateKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function seedFor(key) {
    let h = 2166136261;
    for (const ch of 'mochi-hop/' + key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function prettyDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]}`;
  }
  // Public web version of the game (GitHub Pages). Shared links open here, so a
  // friend can play instantly in the browser with no install.
  const SHARE_URL = 'https://bmayston.github.io/zen-garden/play/';
  const DAILY_EPOCH = Date.UTC(2026, 10, 1);   // 1 Nov 2026 = Daily #1
  function dailyNumber(key) {
    const [y, m, d] = key.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - DAILY_EPOCH) / 86400000) + 1;
  }
  // A challenge link looks like ?c=2026-11-01&s=26 (daily course) or ?s=26 (classic).
  const challenge = (() => {
    try {
      const q = new URLSearchParams(location.search);
      const sc = parseInt(q.get('s'), 10);
      if (!(sc >= 0 && sc < 10000)) return null;
      const c = q.get('c');
      return { score: sc, date: c && /^\d{4}-\d{2}-\d{2}$/.test(c) ? c : null };
    } catch (e) { return null; }
  })();
  let runDate = '';          // date whose skewers the daily run uses
  let target = 0;            // score to beat in a challenge run (0 = none)

  let rng = Math.random;
  const srand = (a, b) => a + rng() * (b - a);

  function refreshDaily() {
    const today = dateKey();
    if (save.daily.date !== today) {
      save.daily.date = today;
      save.daily.best = 0;
      save.daily.runs = 0;
      store.set('daily', save.daily);
    }
    // a streak survives only if yesterday (or today) was played
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (save.daily.lastDate !== today && save.daily.lastDate !== dateKey(y) && save.daily.streak !== 0) {
      save.daily.streak = 0;
      store.set('daily', save.daily);
    }
  }

  // ---------------------------------------------------------------------------
  // Missions: three small goals at a time, paid out in petals
  // ---------------------------------------------------------------------------
  const MISSION_POOL = [
    { type: 'score_run', n: 5, reward: 4 },
    { type: 'score_run', n: 15, reward: 10 },
    { type: 'score_run', n: 30, reward: 20 },
    { type: 'score_run', n: 50, reward: 35 },
    { type: 'petals_run', n: 3, reward: 6 },
    { type: 'petals_run', n: 6, reward: 12 },
    { type: 'near_run', n: 2, reward: 6 },
    { type: 'near_run', n: 5, reward: 15 },
    { type: 'nopetal_run', n: 10, reward: 12 },
    { type: 'splats_total', n: 15, reward: 6 },
    { type: 'petals_total', n: 30, reward: 10 },
    { type: 'near_total', n: 15, reward: 12 },
    { type: 'runs_total', n: 10, reward: 6 },
    { type: 'score_total', n: 100, reward: 12 },
    { type: 'daily_play', n: 1, reward: 8 },
  ].map(m => Object.assign(m, { id: `${m.type}:${m.n}` }));

  function missionText(m) {
    switch (m.type) {
      case 'score_run': return `Score ${m.n} in one run`;
      case 'petals_run': return `Catch ${m.n} petals in one run`;
      case 'near_run': return `${m.n} close calls in one run`;
      case 'nopetal_run': return `Score ${m.n} without a petal`;
      case 'splats_total': return `Splat ${m.n} times`;
      case 'petals_total': return `Catch ${m.n} petals`;
      case 'near_total': return `Get ${m.n} close calls`;
      case 'runs_total': return `Play ${m.n} runs`;
      case 'score_total': return `Score ${m.n} points in total`;
      case 'daily_play': return 'Play the daily challenge';
    }
    return '';
  }
  const missionDef = id => MISSION_POOL.find(m => m.id === id);

  function pickMission(excludeIds, excludeTypes = []) {
    let options = MISSION_POOL.filter(m => !excludeIds.includes(m.id) && !excludeTypes.includes(m.type));
    if (!options.length) options = MISSION_POOL.filter(m => !excludeIds.includes(m.id));
    return { id: options[Math.floor(Math.random() * options.length)].id, progress: 0, done: false, isNew: true };
  }
  // Replaces finished missions; only writes to storage when something changed.
  function ensureMissions() {
    const old = Array.isArray(save.missions) ? save.missions : [];
    const used = old.map(m => m.id);
    const list = [];
    let changed = old.length !== 3;
    const finishedTypes = [];
    for (const m of old) {
      if (list.length >= 3) break;
      if (!missionDef(m.id) || m.done) {
        changed = true;
        if (missionDef(m.id)) finishedTypes.push(missionDef(m.id).type);
        continue;
      }
      list.push(m);
    }
    while (list.length < 3) {
      // a different kind of goal than the ones just finished, so it never looks like a reset
      const types = finishedTypes.concat(list.map(x => missionDef(x.id).type));
      const m = pickMission(used.concat(list.map(x => x.id)), types);
      used.push(m.id);
      list.push(m);
    }
    if (changed) { save.missions = list; store.set('missions', list); }
  }

  // Current value of a mission during a run (for the live "Mission complete!" toast).
  function liveMissionValue(m, d) {
    switch (d.type) {
      case 'score_run': return score;
      case 'petals_run': return caught;
      case 'near_run': return nearCount;
      case 'nopetal_run': return caught === 0 ? score : 0;
      case 'petals_total': return m.progress + caught;
      case 'near_total': return m.progress + nearCount;
      case 'score_total': return m.progress + score;
    }
    return 0;
  }
  function liveMissionCheck() {
    for (const m of save.missions || []) {
      if (m.done || m.toasted) continue;
      const d = missionDef(m.id);
      if (liveMissionValue(m, d) >= d.n) {
        m.toasted = true;
        sfx.mission();
        haptic('click');
        popups.push({ x: W / 2, y: 150 + topInset, text: `Mission complete! +${d.reward}`, life: 1.8, size: 20, color: '#8ff0b4', vy: 12 });
      }
    }
  }

  // Applies a finished run to the missions; returns petals earned.
  function applyMissions(run) {
    let earned = 0;
    for (const m of save.missions) {
      if (m.done) continue;
      const d = missionDef(m.id);
      let v = m.progress;
      switch (d.type) {
        case 'score_run': v = Math.max(v, run.score); break;
        case 'petals_run': v = Math.max(v, run.petals); break;
        case 'near_run': v = Math.max(v, run.near); break;
        case 'nopetal_run': v = Math.max(v, run.petalFreeScore); break;
        case 'splats_total': if (!run.quit) v += 1; break;
        case 'petals_total': v += run.petals; break;
        case 'near_total': v += run.near; break;
        case 'runs_total': v += 1; break;
        case 'score_total': v += run.score; break;
        case 'daily_play': if (run.daily) v = 1; break;
      }
      m.progress = Math.min(v, d.n);
      m.isNew = false;
      if (m.progress >= d.n) { m.done = true; if (!m.toasted) m.lateDone = true; earned += d.reward; }
    }
    store.set('missions', save.missions);
    return earned;
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
  // Hanami dango obstacles: a wooden skewer with pink, white and green dango.
  // The sharp tip points into the gap.
  // ---------------------------------------------------------------------------
  const DANGO_R = 26;
  const DANGO_STEP = 46;        // centre-to-centre (balls squish together a little)
  const TIP = 16;               // skewer tip poking past the last ball
  const STICK_W = 7;
  const COL_W = DANGO_R * 2;    // obstacle column width
  const DANGO_COLORS = [
    { base: '#ffb7cb', dark: '#ec8aa8', light: '#ffe3ec' },  // pink (nearest the tip)
    { base: '#fffaf0', dark: '#e3d5c1', light: '#ffffff' },  // white
    { base: '#bfe08f', dark: '#86b85c', light: '#e6f6cf' },  // green
  ];
  let dangoSprites = [];
  let groundGrad = null;

  function buildSprites() {
    const px = Math.max(1, scale);
    const size = Math.ceil((DANGO_R * 2 + 6) * px);
    dangoSprites = DANGO_COLORS.map(c => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const g = cv.getContext('2d');
      g.scale(px, px);
      const cx = DANGO_R + 3, cy = DANGO_R + 3;
      const grad = g.createRadialGradient(cx - 8, cy - 9, 3, cx, cy, DANGO_R);
      grad.addColorStop(0, c.light);
      grad.addColorStop(0.55, c.base);
      grad.addColorStop(1, c.dark);
      g.fillStyle = grad;
      g.beginPath(); g.ellipse(cx, cy, DANGO_R, DANGO_R * 0.94, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(80,50,60,0.55)';
      g.lineWidth = 1.8;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath(); g.ellipse(cx - 9, cy - 10, 7, 3.6, -0.6, 0, Math.PI * 2); g.fill();
      return cv;
    });
  }

  function drawStick(cx, y0, y1, tipDown) {
    // wooden skewer from y0 to y1, sharpened at the gap end
    const w = STICK_W;
    ctx.fillStyle = '#d9a866';
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (tipDown) {
      ctx.moveTo(cx - w / 2, y0);
      ctx.lineTo(cx + w / 2, y0);
      ctx.lineTo(cx + w / 2, y1 - 9);
      ctx.lineTo(cx, y1);
      ctx.lineTo(cx - w / 2, y1 - 9);
    } else {
      ctx.moveTo(cx - w / 2, y1);
      ctx.lineTo(cx + w / 2, y1);
      ctx.lineTo(cx + w / 2, y0 + 9);
      ctx.lineTo(cx, y0);
      ctx.lineTo(cx - w / 2, y0 + 9);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // wood grain highlight
    ctx.fillStyle = 'rgba(255,240,210,0.6)';
    ctx.fillRect(cx - w / 2 + 1.5, tipDown ? y0 : y0 + 10, 1.5, Math.max(0, y1 - y0 - 10));
  }

  // Ball centres for an obstacle half. Top skewer hangs down, bottom one stands up.
  function ballCenters(p, top) {
    const out = [];
    for (let i = 0; i < 3; i++) {
      out.push(top
        ? p.gapY - p.gap / 2 - TIP - DANGO_R + 4 - i * DANGO_STEP
        : p.gapY + p.gap / 2 + TIP + DANGO_R - 4 + i * DANGO_STEP);
    }
    return out;
  }

  function drawDangoColumn(p) {
    const cx = p.x + COL_W / 2;
    const tTop = p.gapY - p.gap / 2;
    const tBot = p.gapY + p.gap / 2;
    const wob = Math.sin(time * 2 + p.sway) * 1.2;

    // top: skewer from above the screen down to the tip
    drawStick(cx, -20, tTop, true);
    const topBalls = ballCenters(p, true);
    for (let i = 2; i >= 0; i--) drawBall(i, cx + (i === 0 ? wob * 0.3 : 0), topBalls[i]);

    // bottom: skewer planted in the sand, pointing up
    drawStick(cx, tBot, groundY() + 14, false);
    const botBalls = ballCenters(p, false);
    for (let i = 2; i >= 0; i--) drawBall(i, cx - (i === 0 ? wob * 0.3 : 0), botBalls[i]);
  }

  function drawBall(i, x, y) {
    const r = DANGO_R + 3;
    ctx.drawImage(dangoSprites[i], x - r, y - r, r * 2, r * 2);
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  const GRAVITY = 1650;
  const HOP_V = -470;
  const MAX_FALL = 820;
  const SPACING = 230;
  const RETRY_DELAY = 0.45;

  const mochi = {
    x: 0, y: 0, vy: 0, r: 18, rot: 0,
    sx: 1, sy: 1,           // squash & stretch
    spin: 0, spinV: 0,      // sprout helicopter spin
    perk: 0,                // sprout perks up after scoring
    blink: 0, blinkT: 2,
    happy: 0,
    dead: false,
    splat: null,            // { sx, sy, hold, slide }
  };

  let state = 'title';      // title | ready | play | dying | over
  let stateT = 0;
  let paused = false;
  let countdown = 0;          // 3-2-1 after resuming
  let score = 0;
  let runPetals = 0;
  let newBest = false;
  let deathT = 0;           // time since crash (dying + over)
  let pipes = [];
  let particles = [];
  let floaters = [];
  let popups = [];
  let distance = 0;
  let speed = 150;
  let shake = 0;
  let flash = 0;
  let scorePop = 0;
  let displaySky = 0;
  let uiShake = 0;
  let time = 0;
  let firstPipes = 0;
  let mode = 'classic';       // classic | daily
  let nearCount = 0;
  let petalFreeScore = 0;     // score reached before the first petal of the run
  let caught = 0;             // petals caught (not close-call bonuses)
  let missionsOpen = false;
  let missionPetals = 0;      // petals earned from missions this run

  for (let i = 0; i < 14; i++) floaters.push(newFloater(true));
  function newFloater(anywhere) {
    return {
      x: anywhere ? rand(0, 1) : 1.05, y: rand(0.05, 0.75),
      s: rand(3, 6), vx: rand(0.03, 0.07), vy: rand(-0.01, 0.02),
      a: rand(0, Math.PI * 2), va: rand(-2, 2),
    };
  }

  // Difficulty in clear steps, with a gentle first few gaps.
  function tier(s) {
    if (s < 3)  return { gap: 196, speed: 150, shift: 70 };
    if (s < 10) return { gap: 182, speed: 160, shift: 150 };
    if (s < 25) return { gap: 170, speed: 172, shift: 190 };
    if (s < 50) return { gap: 160, speed: 184, shift: 210 };
    return { gap: 152, speed: 196, shift: 225 };
  }

  function resetRun() {
    mochi.x = W * 0.3;
    mochi.y = H * 0.42;
    mochi.vy = 0; mochi.rot = 0; mochi.sx = 1; mochi.sy = 1;
    mochi.dead = false; mochi.splat = null; mochi.spinV = 0;
    pipes = [];
    popups = [];
    score = 0;
    runPetals = 0;
    newBest = false;
    speed = tier(0).speed;
    scorePop = 0;
    firstPipes = 0;
    nearCount = 0;
    petalFreeScore = 0;
    caught = 0;
    missionPetals = 0;
    ensureMissions();
    if (mode === 'daily') {
      refreshDaily();
      if (!runDate) runDate = save.daily.date;
      rng = mulberry32(seedFor(runDate));
    } else {
      rng = Math.random;
    }
  }

  function setState(s) {
    state = s; stateT = 0;
    if (s === 'title') {
      // clear the crash pose so the menu shows a normal, round Mochi
      mochi.splat = null; mochi.dead = false;
      mochi.sx = 1; mochi.sy = 1; mochi.rot = 0; mochi.vy = 0;
      missionsOpen = false;
    }
  }

  function spawnParticle(x, y, vx, vy, life, size, color, kind) {
    particles.push({ x, y, vx, vy, life, max: life, size, color, kind });
  }

  function hop() {
    mochi.vy = HOP_V;
    mochi.sx = 0.78; mochi.sy = 1.28;
    mochi.spinV = 30;
    sfx.hop();
    haptic('tick');
    for (let i = 0; i < 5; i++) {
      spawnParticle(mochi.x - 6, mochi.y + mochi.r * 0.8, rand(-90, -20), rand(20, 90), 0.45, rand(3, 6), 'rgba(255,255,255,0.9)', 'puff');
    }
  }

  function spawnPipe(x) {
    const t = tier(score + pipes.filter(p => !p.passed).length);
    const gap = t.gap;
    const minC = 60 + topInset + gap / 2;
    const maxC = groundY() - 60 - gap / 2;
    const mid = (minC + maxC) / 2;
    let c = firstPipes < 3 ? mid + srand(-t.shift, t.shift) * 0.5 : srand(minC, maxC);
    const prev = pipes[pipes.length - 1];
    if (prev) c = clamp(c, prev.gapY - t.shift, prev.gapY + t.shift);
    c = clamp(c, minC, maxC);
    firstPipes++;
    const hasPetal = rng() < 0.55;
    const pdx = COL_W / 2 + srand(75, SPACING - 80), pdy = srand(-gap * 0.3, gap * 0.3);
    pipes.push({
      x, gapY: c, gap, passed: false, minClear: Infinity,
      petal: hasPetal ? { dx: pdx, y: c + pdy, taken: false, bob: rand(0, 6) } : null,
      sway: rand(0, Math.PI * 2),
    });
  }

  // Mochi is sticky: it splats onto whatever it hit, hangs there, then slides down.
  function die(hit) {
    if (mochi.dead) return;
    mochi.dead = true;
    deathT = 0;
    shake = 10;
    flash = 0.6;
    sfx.splat();
    haptic('heavy');

    let sx = 1.35, sy = 0.65;  // squashed vertically (hit from above/below)
    if (hit === 'side' || hit === 'stick') { sx = 0.62; sy = 1.32; }
    mochi.splat = { sx, sy, hold: hit === 'ground' ? 0 : 0.4, sliding: false };
    mochi.vy = 0;
    mochi.rot = 0;

    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2);
      spawnParticle(mochi.x, mochi.y, Math.cos(a) * rand(80, 220), Math.sin(a) * rand(80, 220) - 60, 0.6, rand(3, 6),
        SKINS[skinIndex].body, 'blob');
    }
    for (let i = 0; i < 6; i++) {
      const a = rand(0, Math.PI * 2);
      spawnParticle(mochi.x, mochi.y, Math.cos(a) * rand(140, 260), Math.sin(a) * rand(140, 260), 0.6, rand(4, 7), '#ffe36e', 'star');
    }
    if (hit === 'ground') { mochi.y = groundY() - mochi.r * 0.6; }
    endRun();
    setState('dying');
  }

  function endRun(quit = false) {
    save.played++;
    store.set('played', save.played);
    if (mode === 'daily' && runDate === dateKey()) {
      refreshDaily();
      const d = save.daily;
      const today = dateKey();
      if (d.lastDate !== today) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        d.streak = d.lastDate === dateKey(y) ? d.streak + 1 : 1;
        d.lastDate = today;
      }
      d.runs++;
      if (score > d.best) { d.best = score; newBest = true; }
      store.set('daily', d);
    } else if (mode === 'classic' && score > save.best) {
      save.best = score; newBest = true; store.set('best', save.best);
    }
    if (caught === 0) petalFreeScore = score;
    const t = save.totals;
    if (!quit) t.splats++;
    t.runs++; t.petals += caught; t.near += nearCount; t.score += score;
    store.set('totals', t);
    missionPetals = applyMissions({ score, petals: caught, near: nearCount, petalFreeScore, daily: mode === 'daily', quit });
    if (save.missions.some(m => m.lateDone)) { setTimeout(() => { sfx.mission(); haptic('click'); }, 350); }
    save.missions.forEach(m => { delete m.lateDone; });
    save.petals += runPetals + missionPetals;
    store.set('petals', save.petals);
  }

  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  // Returns null, 'side' or 'end' for a hit against a dango column.
  function hitColumn(p, hr) {
    const cx = p.x + COL_W / 2;
    const tTop = p.gapY - p.gap / 2;
    const tBot = p.gapY + p.gap / 2;
    const side = mochi.x < cx - DANGO_R * 0.55 ? 'side' : 'end';
    // skewers (thin, run the full height)
    const stick = side === 'side' ? 'stick' : 'end';
    if (circleRect(mochi.x, mochi.y, hr, cx - STICK_W / 2, -200, STICK_W, tTop + 200)) return stick;
    if (circleRect(mochi.x, mochi.y, hr, cx - STICK_W / 2, tBot, STICK_W, groundY() - tBot)) return stick;
    // dango balls
    const rr = (hr + DANGO_R * 0.94) ** 2;
    for (const top of [true, false]) {
      for (const by of ballCenters(p, top)) {
        const dx = mochi.x - cx, dy = mochi.y - by;
        if (dx * dx + dy * dy < rr) return side;
      }
    }
    return null;
  }

  function rectDist(cx, cy, rx, ry, rw, rh) {
    const dx = cx - clamp(cx, rx, rx + rw), dy = cy - clamp(cy, ry, ry + rh);
    return Math.sqrt(dx * dx + dy * dy);
  }
  // Smallest gap between Mochi's hitbox and a column (negative = touching).
  function clearance(p, hr) {
    const cx = p.x + COL_W / 2;
    const tTop = p.gapY - p.gap / 2, tBot = p.gapY + p.gap / 2;
    let c = Math.min(
      rectDist(mochi.x, mochi.y, cx - STICK_W / 2, -200, STICK_W, tTop + 200),
      rectDist(mochi.x, mochi.y, cx - STICK_W / 2, tBot, STICK_W, groundY() - tBot)) - hr;
    for (const top of [true, false]) {
      for (const by of ballCenters(p, top)) {
        c = Math.min(c, Math.hypot(mochi.x - cx, mochi.y - by) - hr - DANGO_R * 0.94);
      }
    }
    return c;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------
  function update(dt) {
    time += dt;
    stateT += dt;
    displaySky = lerp(displaySky, score, Math.min(1, dt * 1.5));

    if (!mochi.splat) {
      mochi.sx = lerp(mochi.sx, 1, Math.min(1, dt * 10));
      mochi.sy = lerp(mochi.sy, 1, Math.min(1, dt * 10));
    }
    // sprout spin: decays, then settles flat
    mochi.spin += mochi.spinV * dt;
    mochi.spinV *= Math.exp(-dt * 3.2);
    if (Math.abs(mochi.spinV) < 2) {
      const target = Math.round(mochi.spin / Math.PI) * Math.PI;
      mochi.spin = lerp(mochi.spin, target, Math.min(1, dt * 8));
      mochi.spinV = 0;
    }
    mochi.perk = Math.max(0, mochi.perk - dt * 2.5);
    mochi.happy = Math.max(0, mochi.happy - dt);
    mochi.blinkT -= dt;
    if (mochi.blinkT <= 0) { mochi.blink = 0.12; mochi.blinkT = rand(1.8, 4.5); }
    mochi.blink = Math.max(0, mochi.blink - dt);

    shake = Math.max(0, shake - dt * 40);
    flash = Math.max(0, flash - dt * 3);
    scorePop = Math.max(0, scorePop - dt * 4);
    uiShake = Math.max(0, uiShake - dt * 3);

    const scrolling = state === 'title' || state === 'ready' || state === 'play';
    if (scrolling) distance += speed * dt;

    for (const f of floaters) {
      f.x -= f.vx * dt * (scrolling ? 1.6 : 0.6);
      f.y += f.vy * dt + Math.sin(time + f.a) * 0.0006;
      f.a += f.va * dt;
      if (f.x < -0.05 || f.y > 0.9) Object.assign(f, newFloater(false));
    }

    if (state === 'title') {
      mochi.x = W / 2;
      mochi.y = 254 + titleY() + Math.sin(time * 3) * 6;
      if (Math.sin(time * 3) > 0.995 && mochi.spinV === 0) mochi.spinV = 18;
    } else if (state === 'ready') {
      mochi.x = W * 0.3;
      mochi.y = H * 0.42 + Math.sin(time * 4) * 7;
      mochi.rot = 0;
    } else if (state === 'play') {
      speed = lerp(speed, tier(score).speed, Math.min(1, dt * 1.5));
      mochi.vy = Math.min(MAX_FALL, mochi.vy + GRAVITY * dt);
      mochi.y += mochi.vy * dt;
      if (mochi.vy > 200) { mochi.sx = lerp(mochi.sx, 0.94, dt * 4); mochi.sy = lerp(mochi.sy, 1.08, dt * 4); }
      mochi.rot = clamp(mochi.vy / 1400, -0.35, 0.5);
      if (mochi.y < mochi.r) { mochi.y = mochi.r; mochi.vy = 0; }

      for (const p of pipes) p.x -= speed * dt;
      while (pipes.length && pipes[0].x < -COL_W - SPACING) pipes.shift();
      const last = pipes[pipes.length - 1];
      if (!last || last.x < W + 40 - SPACING) spawnPipe(last ? last.x + SPACING : W + 120);

      const hr = mochi.r * 0.82;
      for (const p of pipes) {
        if (!p.passed && Math.abs(mochi.x - (p.x + COL_W / 2)) < DANGO_R + mochi.r) {
          p.minClear = Math.min(p.minClear, clearance(p, hr));
        }
        const hit = hitColumn(p, hr);
        if (hit) {
          // stick to the side of the dango we hit
          const cx = p.x + COL_W / 2;
          if (hit === 'side') mochi.x = Math.min(mochi.x, cx - DANGO_R - mochi.r * 0.45);
          if (hit === 'stick') mochi.x = Math.min(mochi.x, cx - STICK_W / 2 - mochi.r * 0.6);
          die(hit);
          break;
        }
        if (!p.passed && p.x + COL_W < mochi.x) {
          p.passed = true;
          score++;
          if (caught === 0) petalFreeScore = score;
          liveMissionCheck();
          if (p.minClear < 7) {
            // scraped past a skewer: reward the risk
            nearCount++;
            runPetals++;
            sfx.close();
            haptic('tick');
            popups.push({ x: mochi.x + 10, y: mochi.y - 30, text: 'Close! +1', life: 0.9, size: 17, color: '#fff3a0' });
            for (let i = 0; i < 6; i++) spawnParticle(mochi.x, mochi.y, rand(-80, 80), rand(-160, -40), 0.5, rand(3, 5), '#fff3a0', 'star');
            liveMissionCheck();
          }
          scorePop = 1;
          mochi.perk = 1;
          mochi.happy = 0.3;
          if (score % 10 === 0) {
            sfx.milestone();
            haptic('heavy');
            popups.push({ x: W / 2, y: 130 + topInset, text: `${score}!`, life: 1.1, size: 34, color: '#ffe36e' });
          } else {
            sfx.score(score);
            haptic('click');
          }
        }
        if (p.petal && !p.petal.taken) {
          const px = p.x + p.petal.dx;
          const py = p.petal.y + Math.sin(time * 3 + p.petal.bob) * 6;
          const dx = px - mochi.x, dy = py - mochi.y;
          if (dx * dx + dy * dy < (mochi.r + 14) ** 2) {
            p.petal.taken = true;
            runPetals++;
            caught++;
            sfx.petal();
            liveMissionCheck();
            popups.push({ x: px, y: py, text: '+1', life: 0.8, size: 18, color: '#ffb3cc' });
            for (let i = 0; i < 8; i++) spawnParticle(px, py, rand(-120, 120), rand(-160, 60), 0.6, rand(3, 5), '#ff9ec0', 'petal');
          }
        }
      }

      if (state === 'play' && mochi.y + mochi.r >= groundY()) die('ground');
    } else if (state === 'dying' || state === 'over') {
      deathT += dt;
      const sp = mochi.splat;
      mochi.sx = lerp(mochi.sx, sp.sx, Math.min(1, dt * 25));
      mochi.sy = lerp(mochi.sy, sp.sy, Math.min(1, dt * 25));
      if (sp.hold > 0) {
        sp.hold -= dt;
        if (sp.hold <= 0) sfx.slide();
      } else {
        // sticky slide down to the sand
        const floor = groundY() - mochi.r * 0.6;
        if (mochi.y < floor) {
          mochi.vy = Math.min(380, mochi.vy + 700 * dt);
          mochi.y += mochi.vy * dt;
          if (mochi.y >= floor) {
            mochi.y = floor;
            mochi.vy = 0;
            sp.sx = 1.5; sp.sy = 0.55;   // pancake
            sfx.flop();
          }
        }
      }
      if (state === 'dying' && deathT >= RETRY_DELAY) setState('over');
    }

    for (const pt of particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.kind !== 'puff') pt.vy += 400 * dt;
      pt.vx *= 0.98;
    }
    // in-place compaction (no per-frame array allocation)
    let n = 0;
    for (let i = 0; i < particles.length; i++) if (particles[i].life > 0) particles[n++] = particles[i];
    particles.length = n;
    for (const u of popups) { u.life -= dt; u.y -= (u.vy ?? 40) * dt; }
    n = 0;
    for (let i = 0; i < popups.length; i++) if (popups[i].life > 0) popups[n++] = popups[i];
    popups.length = n;
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
        ctx.fillRect(x - 22, baseY - 46, 5, 46);
        ctx.fillRect(x + 17, baseY - 46, 5, 46);
        ctx.fillRect(x - 30, baseY - 52, 60, 6);
        ctx.fillRect(x - 24, baseY - 40, 48, 4);
      } else {
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

  // Distant cherry trees in bloom
  function drawSakuraTrees(offset, baseY, trunk, bloom) {
    const period = 260;
    const start = Math.floor(offset / period) - 1;
    for (let k = start; k < start + Math.ceil(W / period) + 3; k++) {
      const x = k * period - offset + ((k * 53) % 120);
      const s = 0.8 + ((k * 31) % 5) / 10;
      ctx.fillStyle = trunk;
      ctx.fillRect(x - 2.5 * s, baseY - 26 * s, 5 * s, 26 * s);
      ctx.fillStyle = bloom;
      for (const [dx, dy, r] of [[0, -38, 18], [-14, -30, 13], [14, -30, 13], [-6, -46, 11], [8, -45, 12]]) {
        ctx.beginPath(); ctx.arc(x + dx * s, baseY + dy * s, r * s, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawBackground(sky) {
    const g = ctx.createLinearGradient(0, 0, 0, groundY());
    g.addColorStop(0, sky.top);
    g.addColorStop(1, sky.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (sky.night > 0.05) {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 40; i++) {
        const sx = (i * 137 + i * i * 7) % W;
        const sy = (i * 53) % 300;
        ctx.globalAlpha = sky.night * (0.6 + 0.4 * Math.sin(time * 2 + i));
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    const sunX = W * 0.75, sunY = 120 + topInset * 0.5;
    ctx.fillStyle = sky.sun;
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(sunX, sunY, 58, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(sunX, sunY, 40, 0, Math.PI * 2); ctx.fill();

    ridge(distance * 0.08, groundY() - 150, 50, 1.3, sky.far, 10);
    drawToriiAndPagodas(distance * 0.18, groundY() - 62, sky.near);
    ridge(distance * 0.25, groundY() - 40, 26, 4.1, sky.near, 8);
    drawSakuraTrees(distance * 0.4, groundY() - 2, 'rgba(90,60,70,0.55)', sky.night > 0.5 ? 'rgba(210,150,190,0.55)' : 'rgba(255,190,210,0.8)');

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

  function drawObstacles() {
    for (const p of pipes) {
      drawDangoColumn(p);
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
    ctx.fillStyle = '#ffb3cc';
    for (let i = 0; i < 5; i++) {
      ctx.rotate(Math.PI * 2 / 5);
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
    ctx.fillStyle = '#5a8f4e';
    ctx.fillRect(0, gy - 4, W, 10);
    if (!groundGrad) {
      groundGrad = ctx.createLinearGradient(0, gy, 0, H);
      groundGrad.addColorStop(0, '#eedfba');
      groundGrad.addColorStop(1, '#d8c294');
    }
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, gy + 6, W, H - gy);

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
      ctx.beginPath(); ctx.ellipse(x - 3, y - 5, 8, 4, -0.6, 0, Math.PI * 2); ctx.fill();
    }

    // little sand mounds where the skewers are planted
    ctx.fillStyle = '#e3d1a6';
    for (const p of pipes) {
      const cx = p.x + COL_W / 2;
      ctx.beginPath(); ctx.ellipse(cx, gy + 6, 14, 5, 0, Math.PI, 0); ctx.fill();
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing: Mochi
  // ---------------------------------------------------------------------------

  // The signature sprout: two big leaves that spin like a helicopter on each hop,
  // droop while falling and perk up after scoring.
  function drawSprout(top, o) {
    const lift = o.dead ? -0.7 : (o.perk > 0 ? lerp(0.35, 1.05, o.perk) : lerp(0.35, -0.45, clamp(((o.vy || 0) - 150) / 500, 0, 1)));
    const c = Math.cos(o.spin || 0);
    ctx.save();
    ctx.translate(0, top + 3);
    ctx.strokeStyle = '#3d8a34';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(1.5, -5, 0, -10); ctx.stroke();
    ctx.translate(0, -10);
    for (const s of [1, -1]) {
      const proj = s * c;                       // projected blade direction (fake 3D spin)
      ctx.save();
      ctx.scale(proj, 1);
      ctx.rotate(-lift);
      ctx.fillStyle = proj * s > 0 ? (s > 0 ? '#4aa83c' : '#5cbf4a') : '#3a8a30';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(7, -10, 19, -4);
      ctx.quadraticCurveTo(9, 4, 0, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,90,30,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(1, -0.5); ctx.quadraticCurveTo(9, -4, 16, -3.5); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawMochi(x, y, size, skin, o = {}) {
    const r = mochi.r;
    const sx = o.sx ?? 1, sy = o.sy ?? 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.rotate(o.rot || 0);

    // soft shadow
    ctx.fillStyle = 'rgba(40,20,40,0.15)';
    ctx.beginPath(); ctx.ellipse(1.5, r * 0.95 * sy, r * 0.9 * sx, r * 0.18, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.scale(sx, sy);
    const rx = r * 1.1, ry = r * 0.96;
    const top = -ry * 0.92;

    drawSprout(top, o);

    // body
    ctx.fillStyle = skin.shade;
    ctx.beginPath(); ctx.ellipse(0, 1.5, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin.body;
    ctx.beginPath(); ctx.ellipse(0, -0.5, rx * 0.97, ry * 0.94, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(80,50,60,0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, 0.5, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(-r * 0.5, -r * 0.5, r * 0.28, r * 0.15, -0.6, 0, Math.PI * 2); ctx.fill();

    drawAccessory(skin.acc, r, top);

    // cheeks
    ctx.fillStyle = skin.cheek;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.ellipse(-r * 0.62, r * 0.2, r * 0.2, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.62, r * 0.2, r * 0.2, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // eyes (pupils glance up when rising, down when falling)
    const ex = r * 0.36, ey = -r * 0.06;
    const look = clamp((o.vy || 0) / 400, -1, 1) * 1.4;
    ctx.strokeStyle = '#2b1d2e';
    ctx.fillStyle = '#2b1d2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (o.dead) {
      // squeezed > < eyes
      for (const s of [-1, 1]) {
        const cx = s * ex;
        ctx.beginPath();
        ctx.moveTo(cx - s * 3.5, ey - 3.5);
        ctx.lineTo(cx + s * 2.5, ey);
        ctx.lineTo(cx - s * 3.5, ey + 3.5);
        ctx.stroke();
      }
    } else if (o.happy) {
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.arc(s * ex, ey + 2, 3.6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      }
    } else if (o.blink) {
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * ex - 3.5, ey); ctx.lineTo(s * ex + 3.5, ey); ctx.stroke();
      }
    } else {
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(s * ex, ey + look * 0.4, 3.2, 4.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * ex + 1.1, ey - 1.6 + look * 0.4, 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2b1d2e';
      }
    }

    // mouth
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (o.dead) {
      // little "o" of surprise
      ctx.fillStyle = '#c94a6a';
      ctx.ellipse(0, r * 0.34, 2.4, 2.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (o.hopping) {
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

  function drawAccessory(kind, r, top) {
    if (!kind) return;
    ctx.save();
    if (kind === 'blossom') {
      ctx.translate(r * 0.62, top + 5);
      ctx.fillStyle = '#ff8fb3';
      for (let i = 0; i < 5; i++) {
        ctx.rotate(Math.PI * 2 / 5);
        ctx.beginPath(); ctx.ellipse(0, -4.2, 3.2, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ffe36e';
      ctx.beginPath(); ctx.arc(0, 0, 2.3, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'tea') {
      // a little tea-whisk tuft on the side
      ctx.translate(-r * 0.62, top + 6);
      ctx.rotate(-0.4);
      ctx.fillStyle = '#e8d3a2';
      roundRect(-3, -2, 6, 9, 2); ctx.fill();
      ctx.strokeStyle = '#b8975a'; ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 1.2, -2); ctx.lineTo(i * 2.2, -9); ctx.stroke(); }
    } else if (kind === 'bow') {
      ctx.translate(-r * 0.6, top + 5);
      ctx.rotate(-0.35);
      ctx.fillStyle = '#ff5f8f';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(s * 9, -6); ctx.lineTo(s * 10, 5); ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, 2.8, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'crown') {
      // tiny crown worn at a jaunty angle, beside the sprout
      ctx.translate(r * 0.52, top + 3);
      ctx.rotate(0.35);
      ctx.fillStyle = '#ffcf33';
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-7, 0); ctx.lineTo(-8, -8); ctx.lineTo(-3.5, -4); ctx.lineTo(0, -10);
      ctx.lineTo(3.5, -4); ctx.lineTo(8, -8); ctx.lineTo(7, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff4f7a';
      ctx.beginPath(); ctx.arc(0, -3, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function mochiOpts(extra) {
    return Object.assign({
      rot: mochi.rot, sx: mochi.sx, sy: mochi.sy, spin: mochi.spin, perk: mochi.perk, vy: mochi.vy,
      blink: mochi.blink > 0, happy: mochi.happy > 0, dead: mochi.dead,
      hopping: state === 'play' && mochi.vy < -150,
    }, extra);
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
      } else if (p.kind === 'blob') {
        ctx.fillStyle = p.color;
        ctx.strokeStyle = 'rgba(80,50,60,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.5 - a * 0.5), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const u of popups) {
      ctx.globalAlpha = clamp(u.life / 0.6, 0, 1);
      text(u.text, u.x, u.y, u.size, u.color);
    }
    ctx.globalAlpha = 1;
  }

  const ui = {};

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

  function petalCounter(x, y, label) {
    drawSakura(x, y, 11, 0);
    text(String(label), x + 18, y + 1, 20, '#fff', 'left');
  }

  function roundIcon(id, cx, cy) {
    ui[id] = { x: cx - 24, y: cy - 24, w: 48, h: 48 };
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(cx, cy, 19, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2a3f'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#3a2a3f';
    ctx.strokeStyle = '#3a2a3f';
  }

  function settingsButtons() {
    const cx = W - 34, cy = 36 + topInset;
    roundIcon('mute', cx, cy);
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

    const hy = cy, hx = cx - 50;
    roundIcon('haptics', hx, hy);
    ctx.lineWidth = 2;
    roundRect(hx - 5, hy - 9, 10, 18, 2.5); ctx.stroke();
    if (save.haptics) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + s * 9, hy - 6); ctx.lineTo(hx + s * 12, hy - 2); ctx.lineTo(hx + s * 9, hy + 2); ctx.lineTo(hx + s * 12, hy + 6);
        ctx.stroke();
      }
    } else {
      ctx.beginPath(); ctx.moveTo(hx - 12, hy + 11); ctx.lineTo(hx + 12, hy - 11); ctx.stroke();
    }
  }

  const titleY = () => Math.max(0, topInset - 16);

  function drawMissions(x, y, w, compact, live = false) {
    const rowH = 26;
    const h = rowH * save.missions.length + 34;
    ctx.fillStyle = 'rgba(58,42,63,0.55)';
    roundRect(x, y, w, h, 14); ctx.fill();
    text('MISSIONS', x + 12, y + 14, 12, '#ffe3ee', 'left', null);
    save.missions.forEach((m, i) => {
      const d = missionDef(m.id);
      const ry = y + 36 + i * rowH;
      // tick box
      ctx.fillStyle = m.done ? '#7be0a0' : 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(x + 20, ry, 8, 0, Math.PI * 2); ctx.fill();
      if (m.done) {
        ctx.strokeStyle = '#1f5c3a'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x + 16, ry); ctx.lineTo(x + 19, ry + 3); ctx.lineTo(x + 24, ry - 3); ctx.stroke();
      }
      ctx.globalAlpha = (m.done && !compact) ? 1 : (m.done ? 0.6 : 1);
      text(missionText(d), x + 34, ry + 1, 13, '#fff', 'left', null);
      const tw = ctx.measureText(missionText(d)).width;
      if (m.isNew && !m.done && 40 + tw + 32 < w - 72) {
        ctx.fillStyle = '#ff5f8f';
        roundRect(x + 40 + tw, ry - 8, 32, 16, 6); ctx.fill();
        text('NEW', x + 56 + tw, ry + 1, 10, '#fff', 'center', null);
      }
      const shown = live ? Math.min(d.n, Math.max(m.progress, liveMissionValue(m, d))) : m.progress;
      const right = m.done ? `+${d.reward}` : (live && shown >= d.n ? 'Done!' : `${shown}/${d.n}`);
      text(right, x + w - 30, ry + 1, 13, m.done ? '#ffe36e' : '#ffd3e2', 'right', null);
      drawSakura(x + w - 16, ry, 6, 0);
      ctx.globalAlpha = 1;
    });
    return h;
  }

  function drawTitle() {
    const cx = W / 2;
    const skin = SKINS[skinIndex];
    const unlocked = save.unlocked.includes(skin.id);
    const ty = titleY();

    const bob = Math.sin(time * 2) * 3;
    text('Mochi', cx, 112 + ty + bob, 56, '#fff8f0', 'center', '#3a2a3f');
    text('HOP', cx, 158 + ty + bob, 40, '#ff8fb3', 'center', '#3a2a3f');

    const sh = uiShake > 0 ? Math.sin(uiShake * 40) * 6 * uiShake : 0;
    ctx.globalAlpha = unlocked ? 1 : 0.55;
    drawMochi(cx + sh, mochi.y, 1.9, skin, mochiOpts({ rot: 0, vy: 0, dead: false, hopping: false, sx: 1, sy: 1 }));
    ctx.globalAlpha = 1;
    if (!unlocked) {
      const lx = cx + 36, ly = mochi.y + 24;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(lx, ly, 18, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3a2a3f'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#3a2a3f';
      roundRect(lx - 8, ly - 3, 16, 13, 3); ctx.fill();
      ctx.beginPath(); ctx.arc(lx, ly - 3, 5, Math.PI, 0); ctx.stroke();
    }

    const ax = Math.min(115, W / 2 - 34);
    arrowButton('left', cx - ax, 254 + ty, -1);
    arrowButton('right', cx + ax, 254 + ty, 1);

    text(skin.name, cx, 316 + ty, 24, '#fff');
    for (let i = 0; i < SKINS.length; i++) {
      ctx.fillStyle = i === skinIndex ? '#fff' : 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.arc(cx + (i - (SKINS.length - 1) / 2) * 16, 340 + ty, i === skinIndex ? 5 : 4, 0, Math.PI * 2); ctx.fill();
    }

    if (unlocked) {
      button('play', cx, 386 + ty, 180, 52, 'PLAY', '#ff7aa2');
    } else {
      const can = save.petals >= skin.cost;
      button('play', cx, 386 + ty, 200, 52, `UNLOCK ${skin.cost}`, '#ffb347', can);
      if (!can) text(`Collect ${skin.cost - save.petals} more petals`, cx, 356 + ty, 13, '#fff');
    }

    refreshDaily();
    const d = save.daily;
    if (challenge) {
      // opened from a friend's challenge link
      const pulse = 1 + Math.sin(time * 5) * 0.03;
      ctx.save(); ctx.translate(cx, 446 + ty); ctx.scale(pulse, pulse);
      button('daily', 0, 0, 200, 46, `BEAT ${challenge.score}`, '#ffb000', unlocked);
      ctx.restore();
      ui.daily = { x: cx - 100, y: 446 + ty - 23, w: 200, h: 46 };
      text(challenge.date ? `A friend's score on Daily #${dailyNumber(challenge.date)}` : "A friend's score — can you beat it?", cx, 480 + ty, 12, '#fff');
    } else {
      button('daily', cx, 446 + ty, 180, 46, 'DAILY', '#9b7bff', unlocked);
      const dailyInfo = d.runs > 0 ? `Daily #${dailyNumber(d.date)} · best ${d.best}` : `Daily #${dailyNumber(d.date)} · new skewers today`;
      text(d.streak > 0 ? `${dailyInfo} · ${d.streak} day streak` : dailyInfo, cx, 480 + ty, 12, '#fff');
    }

    // missions toggle
    ensureMissions();
    const done = save.missions.filter(m => m.done).length;
    const fresh = save.missions.filter(m => m.isNew && !m.done).length;
    missionsButton(cx, 524 + ty, fresh);

    petalCounter(26, 36 + topInset, save.petals);
    text(`BEST ${save.best}`, W / 2, 37 + topInset, 17, '#fff');
    settingsButtons();

    if (missionsOpen) drawMissionsOverlay();
  }

  function missionsButton(cx, cy, badge) {
    const w = 150, h = 36;
    ui.missions = { x: cx - w / 2, y: cy - h / 2, w, h };
    ctx.fillStyle = 'rgba(58,42,63,0.6)';
    roundRect(cx - w / 2, cy - h / 2, w, h, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
    // scroll icon
    const ix = cx - w / 2 + 22;
    ctx.fillStyle = '#fff6ea';
    roundRect(ix - 8, cy - 9, 16, 18, 3); ctx.fill();
    ctx.strokeStyle = '#b06b85'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(ix - 4, cy - 4 + i * 4); ctx.lineTo(ix + 4, cy - 4 + i * 4); ctx.stroke(); }
    text('MISSIONS', cx + 12, cy + 1, 15, '#fff', 'center', null);
    if (badge > 0) {
      ctx.fillStyle = '#ff4f7a';
      ctx.beginPath(); ctx.arc(cx + w / 2 - 4, cy - h / 2 + 4, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      text(String(badge), cx + w / 2 - 4, cy - h / 2 + 5, 11, '#fff', 'center', null);
    }
  }

  function drawMissionsOverlay() {
    for (const k of ['play', 'daily', 'left', 'right', 'missions']) delete ui[k];
    ctx.fillStyle = 'rgba(29,27,47,0.6)';
    ctx.fillRect(0, 0, W, H);
    const pw = Math.min(310, W - 24), px = W / 2 - pw / 2, py = 200 + titleY();
    const cardH = 26 * save.missions.length + 34 + 44;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(px - 6, py - 6 + 6, pw + 12, cardH + 12, 20); ctx.fill();
    ctx.fillStyle = '#4a3550';
    roundRect(px - 6, py - 6, pw + 12, cardH + 12, 20); ctx.fill();
    ctx.strokeStyle = '#ffd3e2'; ctx.lineWidth = 2; ctx.stroke();
    const h = drawMissions(px, py, pw, false);
    const t = save.totals;
    text(`All time: ${t.runs} runs · ${t.near} close calls · ${t.petals} petals`, W / 2, py + h + 14, 11, '#ffe3ee', 'center', null);
    text('Tap anywhere to close', W / 2, py + h + 34, 13, '#fff', 'center', null);
    // the overlay swallows taps until closed
    ui.overlay = { x: 0, y: 0, w: W, h: H };
  }

  function drawReady() {
    const cx = W / 2;
    text('Get Ready!', cx, 150 + topInset * 0.5, 40, '#fff');
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
    text("Don't get skewered!", cx, 392, 15, '#ffe3ee');
    text('Catch sakura petals to unlock friends', cx, 416, 13, '#ffe3ee');
  }

  function medalFor(s) {
    if (s >= 80) return { name: 'JADE', c1: '#7be0b0', c2: '#2e9b6c' };
    if (s >= 40) return { name: 'GOLD', c1: '#ffe066', c2: '#c99a10' };
    if (s >= 20) return { name: 'SILVER', c1: '#eef2f5', c2: '#9aa6b1' };
    if (s >= 10) return { name: 'BRONZE', c1: '#f1b27a', c2: '#a8642c' };
    return null;
  }

  // Compact game-over card. Tap anywhere to retry instantly.
  function drawOver() {
    const cx = W / 2;
    const t = clamp(stateT / 0.22, 0, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const dy = (1 - ease) * 40;
    ctx.fillStyle = `rgba(29,27,47,${0.32 * ease})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = ease;

    const pw = Math.min(290, W - 30), ph = 130;
    const px = cx - pw / 2, py = 104 + topInset * 0.7 + dy;
    if (target > 0) {
      const won = score > target;
      text(won ? `You beat ${target}!` : `${target - score + 1} more to beat ${target}`, cx, py - 18, 17, won ? '#8ff0b4' : '#ffd3e2');
    } else if (mode === 'daily') {
      text(`DAILY #${dailyNumber(runDate)} · ${prettyDate(runDate)}`, cx, py - 18, 15, '#e3d6ff');
    }
    drawScoreCard(px, py, pw, ph);

    let ly = py + ph + 28;
    petalCounter(px + 12, ly, `+${runPetals + missionPetals}  (${save.petals})`);
    if (nearCount > 0) text(`${nearCount} close call${nearCount > 1 ? 's' : ''}`, px + pw - 6, ly + 1, 15, '#fff3a0', 'right');

    drawMissions(px, ly + 20, pw, false);

    const pulse = 1 + Math.sin(time * 6) * 0.05;
    ctx.save();
    ctx.translate(cx, ly + 158);
    ctx.scale(pulse, pulse);
    text('Tap to retry', 0, 0, 26, '#fff');
    ctx.restore();

    const by = groundY() - 34;
    const brag = newBest || score >= 10 || (target > 0 && score > target);
    if (brag) {
      ctx.save();
      ctx.globalAlpha = ease * (0.35 + 0.25 * Math.sin(time * 5));
      ctx.fillStyle = '#ffe36e';
      roundRect(cx - 68 - 70, by - 28, 140, 58, 22); ctx.fill();
      ctx.restore();
    }
    button('share', cx - 68, by, 124, 44, 'CHALLENGE', '#ff9f43');
    button('skins', cx + 68, by, 124, 44, 'MENU', '#7ac7ff');
    ctx.globalAlpha = 1;
    settingsButtons();
  }

  function drawScoreCard(px, py, pw, ph) {
    const best = target > 0 ? target : (mode === 'daily' ? save.daily.best : save.best);
    ctx.fillStyle = 'rgba(58,42,63,0.9)';
    roundRect(px, py + 6, pw, ph, 20); ctx.fill();
    ctx.fillStyle = '#fff6ea';
    roundRect(px, py, pw, ph, 20); ctx.fill();
    ctx.strokeStyle = '#3a2a3f'; ctx.lineWidth = 3; ctx.stroke();

    const m = medalFor(score);
    const mx = px + 58, my = py + ph / 2 - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.arc(mx, my, 34, 0, Math.PI * 2); ctx.fill();
    if (m) {
      const g = ctx.createRadialGradient(mx - 8, my - 8, 3, mx, my, 32);
      g.addColorStop(0, m.c1); g.addColorStop(1, m.c2);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(mx, my, 30, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3a2a3f'; ctx.lineWidth = 2.5; ctx.stroke();
      drawMochi(mx, my + 4, 0.95, SKINS[skinIndex], { happy: true, spin: 0 });
      text(m.name, mx, py + ph - 14, 12, m.c2, 'center', null);
    } else {
      text('?', mx, my, 26, 'rgba(58,42,63,0.25)', 'center', null);
      text('10 for medal', mx, py + ph - 14, 10, 'rgba(58,42,63,0.5)', 'center', null);
    }

    const rx = px + pw - 22;
    text('SCORE', rx, py + 24, 13, '#b06b85', 'right', null);
    text(String(score), rx, py + 50, 30, '#fff', 'right');
    text(target > 0 ? 'TO BEAT' : (mode === 'daily' ? 'TODAY' : 'BEST'), rx, py + 80, 13, '#b06b85', 'right', null);
    text(String(best), rx, py + 104, 26, '#fff', 'right');
    if (newBest) {
      ctx.save();
      ctx.translate(rx - 74, py + 102);
      ctx.rotate(-0.15);
      ctx.fillStyle = '#ff5f8f';
      roundRect(-24, -11, 48, 22, 8); ctx.fill();
      text('NEW!', 0, 1, 13, '#fff', 'center', null);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Share card (1080x1350). Built to be read in a chat thumbnail:
  // one big challenge ("BEAT MY 26"), a funny Mochi, and a clear "play free" call to action.
  // ---------------------------------------------------------------------------
  function drawMedal(x, y, r, m) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
    g.addColorStop(0, m.c1); g.addColorStop(1, m.c2);
    // ribbon
    ctx.fillStyle = '#ff6f91';
    ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.4); ctx.lineTo(x - r * 0.25, y - r * 1.5); ctx.lineTo(x + r * 0.05, y - r * 1.5); ctx.lineTo(x - r * 0.2, y - r * 0.5); ctx.fill();
    ctx.fillStyle = '#7ac7ff';
    ctx.beginPath(); ctx.moveTo(x + r * 0.7, y - r * 0.4); ctx.lineTo(x + r * 0.25, y - r * 1.5); ctx.lineTo(x - r * 0.05, y - r * 1.5); ctx.lineTo(x + r * 0.2, y - r * 0.5); ctx.fill();
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2a3f'; ctx.lineWidth = 2.5; ctx.stroke();
    text(m.name, x, y + 1, r * 0.42, '#fff', 'center', '#3a2a3f');
  }

  function makeShareCanvas() {
    const CW = 360, CH = 450, k = 3;
    const cv = document.createElement('canvas');
    cv.width = CW * k; cv.height = CH * k;
    const prev = ctx;
    ctx = cv.getContext('2d');
    ctx.scale(k, k);
    const cx = CW / 2;
    try {
      const sky = skyAt(score);
      const g = ctx.createLinearGradient(0, 0, 0, CH);
      g.addColorStop(0, sky.top); g.addColorStop(1, sky.bot);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CW, CH);
      for (let i = 0; i < 22; i++) drawPetal((i * 97 + 13) % CW, (i * 61) % 380 + 10, 4 + (i % 3), i, 'rgba(255,190,212,0.85)');

      // logo + mode pill
      text('Mochi', cx - 4, 30, 26, '#fff8f0', 'right');
      text('HOP', cx + 4, 30, 26, '#ff8fb3', 'left');
      const pill = mode === 'daily' ? `DAILY #${dailyNumber(runDate)} · ${prettyDate(runDate).toUpperCase()}` : 'ENDLESS MODE';
      ctx.font = '900 12px "Trebuchet MS", Verdana, sans-serif';
      const pw = ctx.measureText(pill).width + 26;
      ctx.fillStyle = mode === 'daily' ? '#9b7bff' : 'rgba(58,42,63,0.6)';
      roundRect(cx - pw / 2, 50, pw, 22, 11); ctx.fill();
      text(pill, cx, 62, 12, '#fff', 'center', null);

      // headline: the challenge
      text('BEAT MY', cx, 104, 26, '#fff');
      text(String(score), cx, 166, 88, '#fff');
      const m = medalFor(score);
      if (m) drawMedal(cx + 112, 172, 26, m);

      // scene: a skewer with Mochi splatted on it, stats on the left
      const sx = 268, tipY = 236, ground = 382;
      ctx.fillStyle = '#5a8f4e'; ctx.fillRect(0, ground - 4, CW, 6);
      ctx.fillStyle = '#eadbb3'; ctx.fillRect(0, ground + 2, CW, CH - ground);
      drawStick(sx, tipY, ground + 10, false);
      for (let i = 2; i >= 0; i--) drawBall(i, sx, tipY + TIP + DANGO_R - 4 + i * DANGO_STEP);
      drawMochi(sx - DANGO_R - 18, 292, 2.1, SKINS[skinIndex], { dead: true, sx: 0.66, sy: 1.3, spin: 0 });

      const stats = [];
      stats.push(['petal', `${caught} petal${caught === 1 ? '' : 's'}`]);
      stats.push(['star', `${nearCount} close call${nearCount === 1 ? '' : 's'}`]);
      if (mode === 'daily' && save.daily.streak > 1) stats.push(['fire', `${save.daily.streak} day streak`]);
      stats.forEach(([icon, label], i) => {
        const y = 262 + i * 34;
        ctx.fillStyle = 'rgba(58,42,63,0.45)';
        roundRect(18, y - 14, 150, 28, 14); ctx.fill();
        if (icon === 'petal') drawSakura(34, y, 9, 0);
        else if (icon === 'star') { ctx.fillStyle = '#fff3a0'; ctx.save(); ctx.translate(34, y); ctx.rotate(0.6); ctx.fillRect(-6, -6, 12, 12); ctx.restore(); }
        else { ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.arc(34, y + 2, 7, 0, Math.PI * 2); ctx.fill(); }
        text(label, 50, y + 1, 14, '#fff', 'left', null);
      });

      // call to action
      ctx.fillStyle = 'rgba(58,42,63,0.9)';
      roundRect(cx - 130, 401, 260, 38, 19); ctx.fill();
      ctx.fillStyle = '#ff7aa2';
      roundRect(cx - 130, 397, 260, 38, 19); ctx.fill();
      ctx.strokeStyle = '#3a2a3f'; ctx.lineWidth = 2.5; ctx.stroke();
      text('Tap the link · play free', cx, 417, 17, '#fff');
    } finally {
      ctx = prev;
    }
    return cv;
  }

  function challengeLink() {
    const q = mode === 'daily' ? `?c=${runDate}&s=${score}` : `?s=${score}`;
    return SHARE_URL + q;
  }

  function shareText() {
    const m = medalFor(score);
    const medal = m ? { BRONZE: ' 🥉', SILVER: ' 🥈', GOLD: ' 🥇', JADE: ' 💚' }[m.name] : '';
    const stats = `🌸 ${caught}  ✨ ${nearCount} close call${nearCount === 1 ? '' : 's'}`;
    if (mode === 'daily') {
      const streak = save.daily.streak > 1 ? `  🔥 ${save.daily.streak}` : '';
      return `🍡 Mochi Hop Daily #${dailyNumber(runDate)}: ${score}${medal}\n${stats}${streak}\nSame skewers for everyone today. Beat me 👉 ${challengeLink()}`;
    }
    return `🍡 I scored ${score}${medal} in Mochi Hop!\n${stats}\nBeat me 👉 ${challengeLink()}`;
  }

  function shareScore() {
    const cv = makeShareCanvas();
    const msg = shareText();
    const dataUrl = cv.toDataURL('image/png');
    try {
      if (native && native.shareImage) { native.shareImage(dataUrl.split(',')[1], msg); return; }
    } catch (e) { /* fall through */ }
    cv.toBlob(async (blob) => {
      try {
        const file = new File([blob], 'mochi-hop.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: msg });
          return;
        }
        if (navigator.share) { await navigator.share({ text: msg }); return; }
      } catch (e) { /* fall through to download */ }
      const a = document.createElement('a');
      a.href = dataUrl; a.download = 'mochi-hop.png';
      a.click();
    });
  }

  function drawHud() {
    const pop = 1 + scorePop * 0.35;
    ctx.save();
    ctx.translate(W / 2, 70 + topInset);
    ctx.scale(pop, pop);
    text(String(score), 0, 0, 56, '#fff');
    ctx.restore();
    if (runPetals > 0) petalCounter(26, 36 + topInset, runPetals);
    if (target > 0) text(score > target ? `BEAT ${target}!` : `TARGET ${target}`, W / 2, 112 + topInset, 14, score > target ? '#8ff0b4' : '#ffe36e');
    else if (mode === 'daily') text(`DAILY #${dailyNumber(runDate)}`, W / 2, 112 + topInset, 13, '#e3d6ff');
    if (state === 'play' && !paused) {
      const bx = W - 34, by = 36 + topInset;
      roundIcon('pause', bx, by);
      ui.pause = { x: bx - 30, y: by - 30, w: 60, h: 60 };   // generous touch target
      ctx.fillRect(bx - 7, by - 8, 5, 16);
      ctx.fillRect(bx + 2, by - 8, 5, 16);
    }
  }

  function drawPause() {
    const cx = W / 2;
    ctx.fillStyle = 'rgba(29,27,47,0.7)';
    ctx.fillRect(0, 0, W, H);
    for (const k of ['pause']) delete ui[k];
    const ty = topInset * 0.6;
    text('Paused', cx, 92 + ty, 44, '#fff');

    // current run
    const pw = Math.min(290, W - 30), px = cx - pw / 2, py = 128 + ty;
    const ch = 112;
    ctx.fillStyle = 'rgba(58,42,63,0.9)';
    roundRect(px, py + 5, pw, ch, 18); ctx.fill();
    ctx.fillStyle = '#fff6ea';
    roundRect(px, py, pw, ch, 18); ctx.fill();
    ctx.strokeStyle = '#3a2a3f'; ctx.lineWidth = 3; ctx.stroke();
    text('SCORE', px + 24, py + 24, 13, '#b06b85', 'left', null);
    text(String(score), px + 24, py + 58, 40, '#fff', 'left');
    const best = target > 0 ? target : (mode === 'daily' ? save.daily.best : save.best);
    const bestLabel = target > 0 ? 'TO BEAT' : (mode === 'daily' ? `DAILY #${dailyNumber(runDate)} BEST` : 'BEST');
    text(bestLabel, px + pw - 20, py + 24, 13, '#b06b85', 'right', null);
    text(String(best), px + pw - 20, py + 52, 26, '#fff', 'right');
    // run stats row
    ctx.fillStyle = 'rgba(176,107,133,0.25)';
    ctx.fillRect(px + 16, py + 82, pw - 32, 1.5);
    drawSakura(px + 30, py + 97, 7, 0);
    text(`${caught} petal${caught === 1 ? '' : 's'}`, px + 44, py + 98, 13, '#b06b85', 'left', null);
    ctx.fillStyle = '#e0b100';
    ctx.save(); ctx.translate(px + pw / 2 + 14, py + 97); ctx.rotate(0.6); ctx.fillRect(-4, -4, 8, 8); ctx.restore();
    text(`${nearCount} close call${nearCount === 1 ? '' : 's'}`, px + pw / 2 + 26, py + 98, 13, '#b06b85', 'left', null);

    // live mission progress
    ctx.fillStyle = '#3d2c44';
    roundRect(px, py + ch + 16, pw, 26 * save.missions.length + 34, 14); ctx.fill();
    const mh = drawMissions(px, py + ch + 16, pw, false, true);

    const by = py + ch + 16 + mh + 44;
    button('resume', cx, by, 190, 56, 'RESUME', '#ff7aa2');
    button('quit', cx, by + 66, 160, 42, 'END RUN', '#9a8aa0');
    text('Petals and progress so far are kept', cx, by + 102, 11, '#ffe3ee', 'center', null);
  }

  function resumeGame() {
    paused = false;
    countdown = 1.5;
    last = performance.now();
    if (audio && !save.muted) audio.resume();
    sfx.click();
  }

  function quitRun() {
    paused = false;
    countdown = 0;
    endRun(true);
    sfx.click();
    setState('title');
  }

  function draw() {
    for (const k in ui) delete ui[k];
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);

    drawBackground(skyAt(displaySky));
    if (state !== 'title') drawObstacles();
    drawGround();

    if (state !== 'title') drawMochi(mochi.x, mochi.y, 1, SKINS[skinIndex], mochiOpts());
    drawParticles();

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.6})`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }

    if (state === 'title') drawTitle();
    else if (state === 'ready') drawReady();
    else if ((state === 'play' || state === 'dying') && !paused) drawHud();
    else if (state === 'over') drawOver();

    if (paused) drawPause();
    else if (countdown > 0) {
      const n = Math.ceil(countdown / 0.5);
      const f = (countdown % 0.5) / 0.5;
      ctx.save();
      ctx.translate(W / 2, H * 0.42);
      ctx.scale(1 + f * 0.4, 1 + f * 0.4);
      ctx.globalAlpha = 0.4 + 0.6 * f;
      text(String(n), 0, 0, 72, '#fff');
      ctx.restore();
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
    mochi.spinV = 22;
    const s = SKINS[skinIndex];
    if (save.unlocked.includes(s.id)) { save.skin = s.id; store.set('skin', s.id); }
  }

  function retry() {
    resetRun();
    setState('play');
    hop();
  }

  function onTap(x, y) {
    initAudio();
    if (paused) {
      if (hitTest('resume', x, y)) resumeGame();
      else if (hitTest('quit', x, y)) quitRun();
      return;
    }
    if (countdown > 0) return;
    if (state === 'play' && hitTest('pause', x, y)) {
      paused = true;
      sfx.click();
      haptic('tick');
      return;
    }

    if (state === 'title' && missionsOpen) { missionsOpen = false; sfx.click(); return; }
    if (state === 'title' || state === 'over') {
      if (hitTest('mute', x, y)) {
        save.muted = !save.muted;
        store.set('muted', save.muted);
        sfx.click();
        return;
      }
      if (hitTest('haptics', x, y)) {
        save.haptics = !save.haptics;
        store.set('haptics', save.haptics);
        haptic('click');
        sfx.click();
        return;
      }
    }

    if (state === 'title') {
      if (hitTest('missions', x, y)) {
        missionsOpen = true;
        sfx.click();
        return;
      }
      if (hitTest('left', x, y)) return changeSkin(-1);
      if (hitTest('right', x, y)) return changeSkin(1);
      const skin = SKINS[skinIndex];
      if (hitTest('daily', x, y)) {
        if (!save.unlocked.includes(skin.id)) { uiShake = 1; sfx.nope(); return; }
        mode = 'daily';
        if (challenge) {
          runDate = challenge.date || '';
          if (!challenge.date) mode = 'classic';
          target = challenge.score;
        } else {
          runDate = '';
          target = 0;
        }
        resetRun();
        sfx.click();
        setState('ready');
        return;
      }
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
            haptic('heavy');
            mochi.spinV = 40;
            for (let i = 0; i < 24; i++) spawnParticle(W / 2, mochi.y, rand(-220, 220), rand(-320, 40), 1, rand(4, 7), '#ffb3cc', 'petal');
          } else {
            uiShake = 1;
            sfx.nope();
          }
        }
        return;
      }
      mode = 'classic';
      target = 0;
      resetRun();
      sfx.click();
      // Returning players skip the "Get Ready" hint.
      if (save.played >= 3) { setState('play'); hop(); } else setState('ready');
    } else if (state === 'ready') {
      setState('play');
      hop();
    } else if (state === 'play') {
      hop();
    } else if (state === 'over') {
      if (hitTest('skins', x, y)) { sfx.click(); ensureMissions(); setState('title'); return; }
      if (hitTest('share', x, y)) { sfx.click(); shareScore(); return; }
      retry();
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
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (state === 'title') { onTap(W / 2, 446); return; }
      onTap(-1, -1);
    } else if ((e.code === 'Escape' || e.code === 'KeyP') && state === 'play') {
      if (paused) resumeGame(); else if (countdown <= 0) { paused = true; sfx.click(); }
    } else if (state === 'title' && e.code === 'ArrowLeft') changeSkin(-1);
    else if (state === 'title' && e.code === 'ArrowRight') changeSkin(1);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'play') paused = true;
    if (audio) { if (document.hidden) audio.suspend(); else if (!save.muted) audio.resume(); }
  });

  // Called by the Android back button.
  window.mochiBack = function () {
    if (paused) { resumeGame(); return true; }
    if (state === 'play') { paused = true; return true; }
    if (state === 'ready' || state === 'over' || state === 'dying') { setState('title'); return true; }
    return false;
  };

  // ---------------------------------------------------------------------------
  // Main loop (fixed timestep for consistent physics on any refresh rate)
  // ---------------------------------------------------------------------------
  const STEP = 1 / 120;
  let acc = 0;
  let last = performance.now();
  let insetCheck = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (countdown > 0 && !paused) {
      countdown -= dt;
      if (countdown <= 0) { countdown = 0; acc = 0; }
    } else if (!paused) {
      acc += dt;
      while (acc >= STEP) { update(STEP); acc -= STEP; }
    }
    if ((insetCheck += dt) > 1) { insetCheck = 0; readTopInset(); }
    if (audio) scheduleMusic();
    draw();
    requestAnimationFrame(frame);
  }
  resize();
  resetRun();
  requestAnimationFrame(frame);

  // test hook
  window.__mochi = {
    get state() { return state; }, get score() { return score; }, get W() { return W; },
    mochi, pipes: () => pipes, save, ballCenters, COL_W, DANGO_R,
    get mode() { return mode; }, get paused() { return paused; }, get countdown() { return countdown; }, get target() { return target; }, shareText, get near() { return nearCount; }, makeShareCanvas,
  };
})();
