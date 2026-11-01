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
  // pitch: hop "boing" pitch multiplier. splat: colour of the splat blobs.
  // season: [firstMonth, lastMonth] (1-12) when a seasonal friend can be unlocked.
  const SKINS = [
    { id: 'classic',    name: 'Mochi',      cost: 0,   body: '#fff8f0', shade: '#efd9c6', cheek: '#ff9fb2', acc: null,         pitch: 1 },
    { id: 'sakura',     name: 'Sakura',     cost: 25,  body: '#ffd9e4', shade: '#f4b2c6', cheek: '#ff6f91', acc: 'blossom',    pitch: 1.12 },
    { id: 'yuzu',       name: 'Yuzu',       cost: 40,  body: '#ffe9a8', shade: '#f5c95a', cheek: '#ff9a6b', acc: 'leaf',       pitch: 1.2 },
    { id: 'matcha',     name: 'Matcha',     cost: 60,  body: '#cfe8ab', shade: '#a8cc80', cheek: '#ff9e9e', acc: 'cup',        pitch: 0.95 },
    { id: 'kinako',     name: 'Kinako',     cost: 80,  body: '#f3dcb0', shade: '#d8b77d', cheek: '#ff9e8a', acc: null,         pitch: 0.9,  pattern: 'dust' },
    { id: 'sesame',     name: 'Sesame',     cost: 100, body: '#5c5660', shade: '#433e47', cheek: '#ff8fb0', acc: null,         pitch: 0.78, pattern: 'seeds', eye: '#fff', splat: '#2e2a31' },
    { id: 'ube',        name: 'Ube',        cost: 120, body: '#d4bdf5', shade: '#ab8ed8', cheek: '#ff9ed2', acc: 'bow',        pitch: 1.05 },
    { id: 'strawberry', name: 'Ichigo',     cost: 160, body: '#fff3f3', shade: '#f2d2d2', cheek: '#ff7f96', acc: 'strawberry', pitch: 1.1,  splat: '#ff5c7a' },
    { id: 'sora',       name: 'Sora',       cost: 200, body: '#cfe9ff', shade: '#9ccaf0', cheek: '#ff9fc4', acc: 'cloud',      pitch: 1.25 },
    { id: 'golden',     name: 'Golden',     cost: 250, body: '#ffe37e', shade: '#efbf3d', cheek: '#ff9a6b', acc: 'crown',      pitch: 1.0,  splat: '#ffd23f' },
    { id: 'pumpkin',    name: 'Kabocha',    cost: 50,  body: '#ffb35c', shade: '#e98a2e', cheek: '#ff7a6b', acc: 'stem',       pitch: 0.85, pattern: 'ribs', season: [10, 11], seasonName: 'Oct–Nov' },
    { id: 'snow',       name: 'Yuki',       cost: 50,  body: '#f4fbff', shade: '#cfe3f2', cheek: '#ffa8c0', acc: 'scarf',      pitch: 1.3,  splat: '#e6f4ff', season: [12, 2], seasonName: 'Dec–Feb' },
    { id: 'hanami',     name: 'Hanami',     cost: 50,  body: '#fff8f0', shade: '#efd9c6', cheek: '#ff9fb2', acc: 'blossom',    pitch: 1.15, pattern: 'bands', season: [3, 5], seasonName: 'Mar–May' },
  ];
  function inSeason(skin, d = new Date()) {
    if (!skin.season) return true;
    const m = d.getMonth() + 1, [a, b] = skin.season;
    return a <= b ? (m >= a && m <= b) : (m >= a || m <= b);
  }

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
    settings: Object.assign({ music: 2, sfx: 3, reduced: false, lefty: false }, store.get('settings', {})),
    tips: store.get('tips', {}),
    weekly: store.get('weekly', null),
  };
  const reducedMotion = () => save.settings.reduced;
  const LEVELS = ['Off', 'Low', 'Medium', 'High'];
  function applyVolumes() {
    if (!audio) return;
    sfxGain.gain.value = [0, 0.4, 0.75, 1][save.settings.sfx];
    musicGain.gain.value = [0, 0.2, 0.38, 0.55][save.settings.music];
  }
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
      applyVolumes();
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
      const k = (SKINS[skinIndex] && SKINS[skinIndex].pitch) || 1;
      o.frequency.setValueAtTime(300 * k, t);
      o.frequency.exponentialRampToValueAtTime(640 * k, t + 0.06);
      o.frequency.exponentialRampToValueAtTime(520 * k, t + 0.14);
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
    golden() { [0, 4, 7, 12, 16].forEach((s2, i) => tone(noteHz(s2 + 12), noteHz(s2 + 12), 0.12, 'triangle', 0.09, i * 0.04)); },
    whoosh() { noise(0.9, 0.12, 500); },
    medal()  { tone(1046, 1046, 0.1, 'triangle', 0.12); tone(1568, 1568, 0.3, 'sine', 0.1, 0.08); },
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
  // Brand logo (cut out from the artwork, see tools/), drawn on the title, share card and previews.
  const logoImg = new Image();
  let logoReady = false;
  logoImg.onload = () => { logoReady = true; };
  logoImg.src = window.MOCHI_LOGO || '';
  if (document.fonts) { document.fonts.load('700 20px Fredoka'); document.fonts.load('600 20px Fredoka'); }
  const LOGO_ASPECT = 687 / 800;
  function drawLogo(cx, top, w) {
    if (logoReady) { ctx.drawImage(logoImg, cx - w / 2, top, w, w * LOGO_ASPECT); return; }
    text('Mochi', cx, top + w * 0.36, w * 0.24, '#feedde');
    text('HOP', cx, top + w * 0.6, w * 0.2, '#fd64a6');
  }
  window.mochiAssetsReady = () => Promise.all([
    document.fonts ? document.fonts.load('700 20px Fredoka') : null,
    logoReady ? null : new Promise(res => { logoImg.addEventListener('load', res); logoImg.addEventListener('error', res); }),
  ]);

  // Shared scores send friends to the game on Google Play. The URL comes from the app's ID
  // (applicationId in app/build.gradle.kts), so it starts working as soon as the listing exists;
  // during closed testing only opted-in testers can open it.
  const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.mochihop.game';
  const DAILY_EPOCH = Date.UTC(2026, 10, 1);   // 1 Nov 2026 = Daily #1
  function dailyNumber(key) {
    const [y, m, d] = key.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - DAILY_EPOCH) / 86400000) + 1;
  }
  // A friend's score to beat ({ score, date }). Nothing sets this yet: a later update can fill it from
  // the Google Play install referrer so a shared challenge opens straight into the same course.
  const challenge = null;
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
      case 'golden_total': return `Pass ${m.n} golden gaps`;
      case 'daily_days': return `Play the daily on ${m.n} days`;
    }
    return '';
  }
  const missionDef = id => MISSION_POOL.find(m => m.id === id) || WEEKLY_POOL.find(m => m.id === id);

  // Weekly missions: three bigger goals that reset every Monday, plus a bonus for all three.
  const WEEKLY_POOL = [
    { type: 'score_total', n: 400, reward: 40 },
    { type: 'near_total', n: 30, reward: 40 },
    { type: 'petals_total', n: 60, reward: 40 },
    { type: 'runs_total', n: 30, reward: 30 },
    { type: 'score_run', n: 35, reward: 45 },
    { type: 'golden_total', n: 5, reward: 45 },
    { type: 'daily_days', n: 4, reward: 50 },
  ].map(m => Object.assign(m, { id: `w:${m.type}:${m.n}` }));
  const WEEKLY_BONUS = 60;
  function weekKey(d = new Date()) {
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7));   // back to Monday
    return dateKey(m);
  }
  function refreshWeekly() {
    const wk = weekKey();
    if (save.weekly && save.weekly.week === wk && Array.isArray(save.weekly.list)) return;
    const pool = WEEKLY_POOL.slice();
    const list = [];
    while (list.length < 3) list.push({ id: pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id, progress: 0, done: false });
    save.weekly = { week: wk, list, days: [], bonus: false };
    store.set('weekly', save.weekly);
  }
  function weeklyResetText() {
    const [y, m, d] = save.weekly.week.split('-').map(Number);
    const end = new Date(y, m - 1, d + 7);
    const hrs = Math.max(0, Math.round((end - new Date()) / 3600000));
    return hrs >= 48 ? `resets in ${Math.round(hrs / 24)} days` : `resets in ${hrs}h`;
  }
  function applyWeekly(run) {
    refreshWeekly();
    const wkl = save.weekly;
    if (run.daily && run.date && !wkl.days.includes(run.date)) wkl.days.push(run.date);
    let earned = 0;
    for (const m of wkl.list) {
      if (m.done) continue;
      const d = missionDef(m.id);
      let v = m.progress;
      switch (d.type) {
        case 'score_total': v += run.score; break;
        case 'near_total': v += run.near; break;
        case 'petals_total': v += run.petals; break;
        case 'runs_total': v += 1; break;
        case 'score_run': v = Math.max(v, run.score); break;
        case 'golden_total': v += run.golden; break;
        case 'daily_days': v = wkl.days.length; break;
      }
      m.progress = Math.min(v, d.n);
      if (m.progress >= d.n) { m.done = true; m.lateDone = true; earned += d.reward; }
    }
    if (!wkl.bonus && wkl.list.every(m => m.done)) { wkl.bonus = true; earned += WEEKLY_BONUS; }
    store.set('weekly', wkl);
    return earned;
  }

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
  // Brand: Fredoka (bundled in fonts/) with the logo's dark plum outline.
  const FONT = '"Fredoka", "Trebuchet MS", "Arial Rounded MT Bold", Verdana, sans-serif';
  const PLUM = '#2e0b20';
  function text(str, x, y, size, color = '#fff', align = 'center', outline = PLUM) {
    ctx.font = `${outline ? 700 : 600} ${size}px ${FONT}`;
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
    dangoSprites = DANGO_COLORS.concat([{ base: '#ffd84a', dark: '#d9a10f', light: '#fff6c2' }]).map(c => {
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
    if (p.golden) drawGoldGlow(cx, p.gapY, p.gap);
    for (let i = 2; i >= 0; i--) drawBall(p.golden ? 3 : i, cx + (i === 0 ? wob * 0.3 : 0), topBalls[i]);

    // bottom: skewer planted in the sand, pointing up
    drawStick(cx, tBot, groundY() + 14, false);
    const botBalls = ballCenters(p, false);
    for (let i = 2; i >= 0; i--) drawBall(p.golden ? 3 : i, cx - (i === 0 ? wob * 0.3 : 0), botBalls[i]);
  }

  function drawGoldGlow(cx, cy, gap) {
    ctx.save();
    ctx.globalAlpha = 0.28 + 0.12 * Math.sin(time * 6);
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, gap * 0.75);
    g.addColorStop(0, '#fff3a0'); g.addColorStop(1, 'rgba(255,220,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, gap * 0.75, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    for (let k = 0; k < 3; k++) {
      const a = time * 2 + k * 2.1;
      ctx.fillStyle = '#fff3a0';
      ctx.save(); ctx.translate(cx + Math.cos(a) * 22, cy + Math.sin(a * 1.3) * gap * 0.3); ctx.rotate(a);
      ctx.fillRect(-2.5, -2.5, 5, 5); ctx.restore();
    }
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

  let state = 'splash';     // splash | title | ready | play | dying | over
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
  let bookOpen = false;
  let settingsOpen = false;
  let reveal = null;          // { skin, t } after unlocking a friend
  let gustT = 0;
  const GUST_WARN = 0.8, GUST_TIME = 1.1;
  let bestCelebrated = false;
  let hints = [];             // first-time tips that follow an obstacle
  let medalPlayed = false;
  let goldenCount = 0;
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
    gustT = 0;
    bestCelebrated = false;
    hints = [];
    medalPlayed = false;
    goldenCount = 0;
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
      bookOpen = false;
    }
  }

  // First-time tips: shown once per install, optionally following an obstacle.
  function tip(key, msg, x, y, follow = null, petal = null) {
    if (save.tips[key]) return;
    save.tips[key] = true;
    store.set('tips', save.tips);
    hints.push({ msg, x, y, follow, petal, offX: follow ? x - follow.x : 0, life: 2.6 });
  }

  function celebrateIfBest() {
    if (bestCelebrated) return;
    let label = null;
    if (target > 0 && score > target) label = `You beat ${target}!`;
    else if (target === 0 && mode === 'classic' && save.best > 0 && score > save.best) label = 'NEW BEST!';
    else if (target === 0 && mode === 'daily' && save.daily.best > 0 && score > save.daily.best && runDate === save.daily.date) label = 'DAILY BEST!';
    if (!label) return;
    bestCelebrated = true;
    mochi.spinV = 50;
    mochi.happy = 0.8;
    sfx.unlock();
    haptic('heavy');
    popups.push({ x: W / 2, y: 170 + topInset, text: label, life: 1.6, size: 30, color: '#ffe36e', vy: 18 });
    for (let i = 0; i < 30; i++) spawnParticle(mochi.x, mochi.y, rand(-260, 260), rand(-320, 80), 1.1, rand(4, 7), i % 3 ? '#ffb3cc' : '#ffe36e', 'petal');
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
    const lvl = score + pipes.filter(p => !p.passed).length;
    // from 25 points some skewers bob up and down
    const bobAmp = lvl >= 25 && rng() < 0.5 ? Math.min(26, 10 + (lvl - 25) * 0.5) : 0;
    c = clamp(c, minC + bobAmp, maxC - bobAmp);
    firstPipes++;
    const golden = lvl >= 12 && rng() < 0.12;
    const night = Math.floor((lvl / 12) % 4) === 2;
    const gust = night && lvl >= 28 && rng() < 0.35;
    const hasPetal = rng() < 0.55;
    const pdx = COL_W / 2 + srand(75, SPACING - 80), pdy = srand(-gap * 0.3, gap * 0.3);
    pipes.push({
      x, gapY: c, baseY: c, gap, passed: false, minClear: Infinity,
      bobAmp, bobSpeed: 1.3 + rng() * 0.8, bobPhase: rng() * Math.PI * 2, golden, gust,
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
        SKINS[skinIndex].splat || SKINS[skinIndex].body, 'blob');
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
    const weeklyEarned = applyWeekly({ score, petals: caught, near: nearCount, golden: goldenCount, daily: mode === 'daily', date: runDate });
    if (weeklyEarned > 0) {
      missionPetals += weeklyEarned;
      save.weekly.list.forEach(m => { if (m.lateDone) { delete m.lateDone; popups.push({ x: W / 2, y: 120 + topInset, text: 'Weekly mission done!', life: 2, size: 18, color: '#8ff0b4', vy: 10 }); } });
      store.set('weekly', save.weekly);
      setTimeout(() => { sfx.mission(); haptic('click'); }, 500);
    }
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

    const scrolling = state === 'title' || state === 'splash' || state === 'ready' || state === 'play';
    if (scrolling) distance += speed * dt;

    for (const f of floaters) {
      f.x -= f.vx * dt * (scrolling ? 1.6 : 0.6);
      f.y += f.vy * dt + Math.sin(time + f.a) * 0.0006;
      f.a += f.va * dt;
      if (f.x < -0.05 || f.y > 0.9) Object.assign(f, newFloater(false));
    }

    if (state === 'splash') {
      if (stateT > SPLASH_HOLD + SPLASH_OUT) { setState('title'); titleIntroT = time; }
    } else if (state === 'title') {
      mochi.x = W / 2;
      mochi.y = 236 + titleY() + Math.sin(time * 3) * 4;
      if (Math.sin(time * 3) > 0.995 && mochi.spinV === 0) mochi.spinV = 18;
      if (mochi.happy <= 0 && Math.random() < dt * 0.2) mochi.happy = 0.7;   // the odd cheeky wink
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

      for (const p of pipes) {
        p.x -= speed * dt;
        if (p.bobAmp) p.gapY = p.baseY + Math.sin(time * p.bobSpeed + p.bobPhase) * p.bobAmp;
        // a gust is tied to a skewer, so daily runs get the same wind
        if (p.gust && !p.gustDone && p.x < W * 0.95) { p.gustDone = true; gustT = GUST_WARN + GUST_TIME; sfx.whoosh(); tip('wind', 'Wind! Hop a bit more', W / 2, 136 + topInset); }
        if (p.golden && !p.goldSeen && p.x < W - 20) { p.goldSeen = true; tip('golden', 'Golden gap = 3 points!', p.x + COL_W / 2, p.gapY - p.gap / 2 - 24, p); }
        if (p.petal && !p.petal.taken && !p.petal.hinted && p.x + p.petal.dx < W - 30) { p.petal.hinted = true; tip('petal', 'Catch petals!', p.x + p.petal.dx, p.petal.y - 30, p, p.petal); }
      }
      if (gustT > 0) {
        gustT -= dt;
        if (gustT < GUST_TIME) mochi.vy += GRAVITY * 0.22 * dt;   // gentle downdraft
      }
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
          const before = score;
          const pts = p.golden ? 3 : 1;
          score += pts;
          if (p.golden) {
            goldenCount++;
            popups.push({ x: mochi.x + 10, y: mochi.y - 46, text: '+3 GOLDEN!', life: 1, size: 20, color: '#ffd84a' });
            for (let i = 0; i < 12; i++) spawnParticle(mochi.x, mochi.y, rand(-160, 160), rand(-220, 40), 0.7, rand(3, 6), '#ffd84a', 'star');
            sfx.golden();
          }
          celebrateIfBest();
          if (caught === 0) petalFreeScore = score;
          liveMissionCheck();
          if (p.minClear < 7) {
            // scraped past a skewer: reward the risk
            nearCount++;
            runPetals++;
            sfx.close();
            haptic('tick');
            popups.push({ x: mochi.x + 10, y: mochi.y - 30, text: 'Close! +1', life: 0.9, size: 17, color: '#fff3a0' });
            tip('close', 'Close call! Scrape tips for bonus petals', W / 2, 136 + topInset);
            for (let i = 0; i < 6; i++) spawnParticle(mochi.x, mochi.y, rand(-80, 80), rand(-160, -40), 0.5, rand(3, 5), '#fff3a0', 'star');
            liveMissionCheck();
          }
          scorePop = 1;
          mochi.perk = 1;
          mochi.happy = 0.3;
          if (Math.floor(before / 10) < Math.floor(score / 10)) {
            sfx.milestone();
            haptic('heavy');
            popups.push({ x: W / 2, y: 130 + topInset, text: `${Math.floor(score / 10) * 10}!`, life: 1.1, size: 34, color: '#ffe36e' });
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
    for (const h of hints) {
      h.life -= dt;
      if (h.follow) h.x = h.follow.x + h.offX;
      if (h.petal && h.petal.taken) h.life = Math.min(h.life, 0.3);
    }
    hints = hints.filter(h => h.life > 0);
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

    if (sky.night > 0.3) drawLanterns(sky.night);
    for (const f of floaters) drawPetal(f.x * W, f.y * H, f.s, f.a, 'rgba(255,183,206,0.75)');
  }

  // Paper lanterns drift by at night (decoration only)
  function drawLanterns(alpha) {
    const period = 170;
    const off = distance * 0.55;
    const start = Math.floor(off / period) - 1;
    for (let k = start; k < start + Math.ceil(W / period) + 2; k++) {
      const x = k * period - off + ((k * 37) % 60);
      const y = 150 + ((k * 53) % 170) + Math.sin(time * 1.5 + k) * 8;
      ctx.globalAlpha = alpha * 0.85;
      const g = ctx.createRadialGradient(x, y, 2, x, y, 26);
      g.addColorStop(0, 'rgba(255,200,120,0.7)'); g.addColorStop(1, 'rgba(255,160,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff7a4a';
      ctx.beginPath(); ctx.ellipse(x, y, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a2e2e';
      ctx.fillRect(x - 5, y - 12, 10, 2.5); ctx.fillRect(x - 5, y + 9.5, 10, 2.5);
    }
    ctx.globalAlpha = 1;
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
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // stem: plum outline under a green core
    ctx.strokeStyle = PLUM; ctx.lineWidth = 4.2;
    ctx.beginPath(); ctx.moveTo(0, 1); ctx.quadraticCurveTo(1.5, -5, 0, -10); ctx.stroke();
    ctx.strokeStyle = '#5fad0f'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(0, 1); ctx.quadraticCurveTo(1.5, -5, 0, -10); ctx.stroke();
    ctx.translate(0, -10);
    for (const s of [1, -1]) {
      const proj = s * c;                       // projected blade direction (fake 3D spin)
      const front = proj * s > 0;
      ctx.save();
      ctx.scale(proj, 1);
      ctx.rotate(-lift);
      // broad rounded leaf
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(3, -11, 15, -12, 19, -5);
      ctx.bezierCurveTo(15, 3, 5, 4, 0, 0);
      ctx.fillStyle = front ? '#6cc21d' : '#4f9410';
      ctx.fill();
      ctx.strokeStyle = PLUM; ctx.lineWidth = 1.4; ctx.stroke();
      // highlight + vein
      ctx.fillStyle = 'rgba(200,255,140,0.55)';
      ctx.beginPath(); ctx.ellipse(8, -6, 5, 2, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(46,11,32,0.35)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(1, -0.5); ctx.quadraticCurveTo(9, -4, 16, -4); ctx.stroke();
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
    if (!o.noShadow) {
      ctx.fillStyle = 'rgba(40,20,40,0.15)';
      ctx.beginPath(); ctx.ellipse(1.5, r * 0.95 * sy, r * 0.9 * sx, r * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    }

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
    ctx.strokeStyle = PLUM;
    ctx.lineWidth = 1.9;
    ctx.beginPath(); ctx.ellipse(0, 0.5, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.ellipse(-r * 0.5, -r * 0.48, r * 0.3, r * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-r * 0.18, -r * 0.66, r * 0.06, 0, Math.PI * 2); ctx.fill();

    if (skin.pattern) drawPattern(skin, r, rx, ry);
    drawAccessory(skin.acc, r, top);

    // cheeks
    ctx.fillStyle = skin.cheek;
    ctx.globalAlpha = 0.75;
    ctx.beginPath(); ctx.ellipse(-r * 0.62, r * 0.18, r * 0.22, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.62, r * 0.18, r * 0.22, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // eyes (pupils glance up when rising, down when falling)
    const eyeC = skin.eye || '#1a0510';
    const ex = r * 0.36, ey = -r * 0.06;
    const look = clamp((o.vy || 0) / 400, -1, 1) * 1.4;
    ctx.strokeStyle = eyeC;
    ctx.fillStyle = eyeC;
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
      // the logo's wink: left eye open and sparkly, right eye a cheeky "<"
      ctx.beginPath(); ctx.ellipse(-ex, ey, 3.6, 4.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = skin.eye ? '#1a0510' : '#fff';
      ctx.beginPath(); ctx.arc(-ex + 1.2, ey - 1.7, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-ex - 1.2, ey + 1.6, 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = eyeC;
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(ex + 3.6, ey - 3); ctx.lineTo(ex - 2.4, ey); ctx.lineTo(ex + 3.6, ey + 3); ctx.stroke();
    } else if (o.blink) {
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * ex - 3.5, ey); ctx.lineTo(s * ex + 3.5, ey); ctx.stroke();
      }
    } else {
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(s * ex, ey + look * 0.4, 3.6, 4.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = skin.eye ? '#1a0510' : '#fff';
        ctx.beginPath(); ctx.arc(s * ex + 1.2, ey - 1.7 + look * 0.4, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * ex - 1.2, ey + 1.6 + look * 0.4, 0.7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeC;
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
    } else {
      // open smile: little cat-lip on top, round open mouth below (wider mid-hop)
      const open = o.hopping ? 1.3 : (o.happy ? 1.12 : 1);
      const my = r * 0.2, mw = 5.4, md = 4.3 * open;
      ctx.beginPath();
      ctx.moveTo(-mw, my);
      ctx.quadraticCurveTo(0, my + 1.1, mw, my);           // gently smiling top edge
      ctx.bezierCurveTo(mw * 0.95, my + md, -mw * 0.95, my + md, -mw, my);
      ctx.closePath();
      ctx.fillStyle = '#5a0f2c';
      ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#ff7a9e';
      ctx.beginPath(); ctx.ellipse(0.5, my + md * 0.9, mw * 0.55, md * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = eyeC; ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    ctx.restore();
    ctx.restore();
  }

  function drawPattern(skin, r, rx, ry) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, -0.5, rx * 0.97, ry * 0.94, 0, 0, Math.PI * 2); ctx.clip();
    if (skin.pattern === 'dust') {
      ctx.fillStyle = 'rgba(160,110,50,0.45)';
      for (const [x, y] of [[-12, -9], [-4, -13], [7, -11], [13, -4], [-15, 2], [11, 9], [-8, 11], [2, 13], [15, 3]]) {
        ctx.beginPath(); ctx.arc(x * r / 18, y * r / 18, 0.9, 0, Math.PI * 2); ctx.fill();
      }
    } else if (skin.pattern === 'seeds') {
      ctx.fillStyle = '#f5ecd9';
      for (const [x, y, a] of [[-11, -10, 0.5], [-2, -14, -0.3], [9, -11, 0.8], [14, -2, 0.2], [-15, 3, -0.6], [12, 9, -0.4], [-6, 12, 0.9], [4, 13, 0.1]]) {
        ctx.save(); ctx.translate(x * r / 18, y * r / 18); ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(0, 0, 1.6, 0.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    } else if (skin.pattern === 'ribs') {
      ctx.strokeStyle = 'rgba(200,100,20,0.45)';
      ctx.lineWidth = 1.4;
      for (const k of [-0.55, 0.55]) {
        ctx.beginPath(); ctx.ellipse(0, 0, rx * Math.abs(k), ry * 0.95, 0, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (skin.pattern === 'bands') {
      // hanami dango colours
      ctx.fillStyle = 'rgba(255,170,200,0.75)';
      ctx.fillRect(-rx, -ry, rx * 2, ry * 0.62);
      ctx.fillStyle = 'rgba(180,220,140,0.8)';
      ctx.fillRect(-rx, ry * 0.42, rx * 2, ry);
    }
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
    } else if (kind === 'leaf') {
      ctx.translate(r * 0.6, top + 6);
      ctx.rotate(0.5);
      ctx.fillStyle = '#6cbf4a';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(6, -7, 12, -2); ctx.quadraticCurveTo(6, 3, 0, 0); ctx.fill();
    } else if (kind === 'cup') {
      // little matcha bowl
      ctx.translate(-r * 0.62, top + 6);
      ctx.rotate(-0.3);
      ctx.fillStyle = '#7a5a46';
      ctx.beginPath(); ctx.moveTo(-6, -3); ctx.lineTo(6, -3); ctx.quadraticCurveTo(5, 5, 0, 5); ctx.quadraticCurveTo(-5, 5, -6, -3); ctx.fill();
      ctx.fillStyle = '#8fcf5a';
      ctx.beginPath(); ctx.ellipse(0, -3, 6, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'strawberry') {
      ctx.translate(r * 0.55, top + 4);
      ctx.rotate(0.3);
      ctx.fillStyle = '#ff4060';
      ctx.beginPath(); ctx.moveTo(-5, -3); ctx.quadraticCurveTo(0, -6, 5, -3); ctx.quadraticCurveTo(4, 5, 0, 7); ctx.quadraticCurveTo(-4, 5, -5, -3); ctx.fill();
      ctx.fillStyle = '#ffe36e';
      for (const [x, y] of [[-2, -1], [2, 0], [0, 3], [-2, 3.5], [2.5, 3.5]]) ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
      ctx.fillStyle = '#4aa83c';
      ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(0, -2); ctx.lineTo(5, -4); ctx.lineTo(0, -6); ctx.fill();
    } else if (kind === 'cloud') {
      ctx.translate(-r * 0.6, top + 5);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(80,120,160,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(-4, 0, 3.5, 0, Math.PI * 2); ctx.arc(1, -2, 4.5, 0, Math.PI * 2); ctx.arc(6, 0, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (kind === 'stem') {
      ctx.translate(r * 0.45, top + 3);
      ctx.fillStyle = '#6b4a2b';
      roundRect(-2, -6, 4, 7, 1.5); ctx.fill();
      ctx.fillStyle = '#4aa83c';
      ctx.beginPath(); ctx.moveTo(1, -4); ctx.quadraticCurveTo(7, -9, 10, -3); ctx.quadraticCurveTo(5, -2, 1, -4); ctx.fill();
    } else if (kind === 'scarf') {
      ctx.translate(0, -top * 0.72);
      ctx.fillStyle = '#ff5f6f';
      roundRect(-r * 0.95, -2.5, r * 1.9, 5, 2.5); ctx.fill();
      ctx.fillRect(r * 0.35, 0, 4, 9);
      ctx.fillStyle = '#ffffff';
      for (let i = -3; i <= 3; i++) ctx.fillRect(i * 4.5 - 0.6, -2.5, 1.2, 5);
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
    ctx.fillStyle = 'rgba(46,11,32,0.9)';
    roundRect(cx - w / 2, cy - h / 2 + 5, w, h, 16); ctx.fill();
    ctx.fillStyle = enabled ? color : '#b9aebb';
    roundRect(cx - w / 2, cy - h / 2, w, h, 16); ctx.fill();
    ctx.strokeStyle = PLUM; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    roundRect(cx - w / 2 + 6, cy - h / 2 + 5, w - 12, h * 0.32, 10); ctx.fill();
    text(label, cx, cy + 1, h * 0.42, '#fff');
  }

  function arrowButton(id, cx, cy, dir) {
    ui[id] = { x: cx - 28, y: cy - 28, w: 56, h: 56 };
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PLUM; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = PLUM;
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
    ctx.strokeStyle = PLUM; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = PLUM;
    ctx.strokeStyle = PLUM;
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
    roundIcon('settings', hx, hy);
    // gear
    ctx.save();
    ctx.translate(hx, hy);
    for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-2.2, -11, 4.4, 5); }
    ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  const SETTING_ROWS = [
    { key: 'music', label: 'Music', kind: 'level' },
    { key: 'sfx', label: 'Sound effects', kind: 'level' },
    { key: 'haptics', label: 'Vibration', kind: 'toggle' },
    { key: 'reduced', label: 'Reduced motion', kind: 'toggle', note: 'No screen shake or flashes' },
    { key: 'lefty', label: 'Left-handed', kind: 'toggle', note: 'Pause button on the left' },
  ];
  function settingValue(r) { return r.key === 'haptics' ? save.haptics : save.settings[r.key]; }

  function drawSettings() {
    for (const k in ui) delete ui[k];
    ctx.fillStyle = 'rgba(29,27,47,0.75)';
    ctx.fillRect(0, 0, W, H);
    const pw = Math.min(300, W - 24), px = W / 2 - pw / 2, py = 120 + topInset * 0.6;
    const rowH = 50, ph = 70 + SETTING_ROWS.length * rowH + 70;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(px, py + 6, pw, ph, 20); ctx.fill();
    ctx.fillStyle = '#4a3550';
    roundRect(px, py, pw, ph, 20); ctx.fill();
    ctx.strokeStyle = '#ffd3e2'; ctx.lineWidth = 2; ctx.stroke();
    text('Settings', W / 2, py + 34, 26, '#fff');
    SETTING_ROWS.forEach((r, i) => {
      const ry = py + 72 + i * rowH + rowH / 2;
      ui['set_' + r.key] = { x: px, y: ry - rowH / 2, w: pw, h: rowH };
      text(r.label, px + 20, r.note ? ry - 6 : ry + 1, 16, '#fff', 'left', null);
      if (r.note) text(r.note, px + 20, ry + 12, 10, '#d9c3dd', 'left', null);
      const v = settingValue(r);
      const on = r.kind === 'level' ? v > 0 : v;
      const label = r.kind === 'level' ? LEVELS[v] : (v ? 'On' : 'Off');
      ctx.fillStyle = on ? '#ff7aa2' : 'rgba(255,255,255,0.18)';
      roundRect(px + pw - 98, ry - 15, 80, 30, 15); ctx.fill();
      text(label, px + pw - 58, ry + 1, 14, '#fff', 'center', null);
      if (r.kind === 'level') {
        for (let k = 1; k <= 3; k++) {
          ctx.fillStyle = k <= v ? '#ffe36e' : 'rgba(255,255,255,0.25)';
          ctx.fillRect(px + pw - 120 + k * 5, ry + 6 - k * 4, 3, k * 4);
        }
      }
    });
    button('settingsDone', W / 2, py + ph - 38, 140, 44, 'DONE', '#7ac7ff');
  }

  function tapSettings(x, y) {
    for (const r of SETTING_ROWS) {
      if (!hitTest('set_' + r.key, x, y)) continue;
      if (r.key === 'haptics') { save.haptics = !save.haptics; store.set('haptics', save.haptics); haptic('click'); }
      else if (r.kind === 'level') { save.settings[r.key] = (save.settings[r.key] + 1) % 4; }
      else save.settings[r.key] = !save.settings[r.key];
      store.set('settings', save.settings);
      initAudio(); applyVolumes();
      sfx.click();
      return;
    }
    // DONE or anywhere outside a row closes the panel
    settingsOpen = false;
    sfx.click();
  }

  const titleY = () => Math.max(0, topInset - 16);

  function drawMissions(x, y, w, compact, live = false, list = save.missions, title = 'MISSIONS', note = '') {
    const rowH = 26;
    const h = rowH * list.length + 34;
    ctx.fillStyle = 'rgba(46,11,32,0.55)';
    roundRect(x, y, w, h, 14); ctx.fill();
    text(title, x + 12, y + 14, 12, '#ffe3ee', 'left', null);
    if (note) text(note, x + w - 12, y + 14, 11, '#d9c3dd', 'right', null);
    list.forEach((m, i) => {
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

  // ---------------------------------------------------------------------------
  // Opening splash: the logo pops in, holds, then hands over to the menu
  // ---------------------------------------------------------------------------
  const SPLASH_HOLD = 1.95, SPLASH_OUT = 0.35;
  let titleIntroT = -10;

  function drawSplash() {
    const t = stateT;
    const pop = clamp(t / 0.55, 0, 1);
    const c1 = 1.70158, c3 = c1 + 1;
    let k = reducedMotion() ? 1 : 1 + c3 * Math.pow(pop - 1, 3) + c1 * Math.pow(pop - 1, 2);
    let a = Math.min(1, t / 0.15);
    if (t > SPLASH_HOLD) { const o = clamp((t - SPLASH_HOLD) / SPLASH_OUT, 0, 1); a = 1 - o; k *= 1 + o * 0.08; }
    // soft glow behind the logo
    const cy = H * 0.42;
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(W / 2, cy, 10, W / 2, cy, 230);
    g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const lw = Math.min(330, W - 24);
    ctx.save();
    ctx.translate(W / 2, cy);
    ctx.scale(k, k);
    if (!reducedMotion()) ctx.rotate(Math.sin(time * 2.2) * 0.012);
    drawLogo(0, -lw * LOGO_ASPECT / 2, lw);
    ctx.restore();
    if (t > 0.9) {
      ctx.globalAlpha = a * clamp((t - 0.9) / 0.3, 0, 1);
      text('Tap to start', W / 2, cy + lw * LOGO_ASPECT / 2 + 34, 16, '#fff', 'center', 'rgba(46,11,32,0.7)');
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Home screen: Mochi is the hero; missions and friends are illustrated cards
  // ---------------------------------------------------------------------------
  function drawCushion(cx, cy, w) {
    const h = w * 0.24;
    ctx.save();
    ctx.fillStyle = 'rgba(46,11,32,0.18)';
    ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.55, w * 0.52, h * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
    g.addColorStop(0, '#ff9cc4'); g.addColorStop(1, '#e94b8e');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = PLUM; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy - 1, w * 0.36, h * 0.28, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    // tassels
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = PLUM; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx + s * w * 0.49, cy + 2, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawRibbon(cx, cy, w, label, color = '#fd64a6', dark = '#c93a7c', size = 20) {
    const h = size * 1.6;
    ctx.save();
    // folded tails
    for (const s of [-1, 1]) {
      const x0 = cx + s * (w / 2 - 6);
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(x0, cy - h / 2 + 7); ctx.lineTo(x0 + s * 22, cy - h / 2 + 7); ctx.lineTo(x0 + s * 14, cy + 3);
      ctx.lineTo(x0 + s * 22, cy + h / 2 + 3); ctx.lineTo(x0, cy + h / 2 + 3); ctx.closePath();
      ctx.fill(); ctx.strokeStyle = PLUM; ctx.lineWidth = 2; ctx.stroke();
    }
    roundRect(cx - w / 2, cy - h / 2, w, h, 9);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = PLUM; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    roundRect(cx - w / 2 + 6, cy - h / 2 + 4, w - 12, h * 0.3, 6); ctx.fill();
    text(label, cx, cy + 1, size, '#feedde');
    ctx.restore();
  }

  function progressBar(x, y, w, h, frac, fill = '#fd64a6', track = '#f6dbe6') {
    roundRect(x, y, w, h, h / 2); ctx.fillStyle = track; ctx.fill();
    if (frac > 0) {
      roundRect(x, y, Math.max(h, w * clamp(frac, 0, 1)), h, h / 2); ctx.fillStyle = fill; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(x + 2, y + 1, Math.max(0, w * clamp(frac, 0, 1) - 4), h * 0.35, h * 0.2); ctx.fill();
    }
    roundRect(x, y, w, h, h / 2); ctx.strokeStyle = 'rgba(46,11,32,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  }

  function cream(x, y, w, h, r = 16) {
    ctx.fillStyle = 'rgba(46,11,32,0.3)';
    roundRect(x, y + 4, w, h, r); ctx.fill();
    ctx.fillStyle = '#fff6ea';
    roundRect(x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = PLUM; ctx.lineWidth = 2.5; ctx.stroke();
  }

  function scrollIcon(x, y, k = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.fillStyle = '#fff1d0'; ctx.strokeStyle = PLUM; ctx.lineWidth = 1.8;
    roundRect(-9, -11, 18, 22, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8b86a';
    roundRect(-11, -13, 22, 5, 2.5); ctx.fill(); ctx.stroke();
    roundRect(-11, 9, 22, 5, 2.5); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#d27aa0'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-5, -4 + i * 4.5); ctx.lineTo(5 - (i === 2 ? 3 : 0), -4 + i * 4.5); ctx.stroke(); }
    ctx.restore();
  }

  function homeCard(id, x, y, w, h, title, sub, frac, fillColor, drawIcon, badge) {
    ui[id] = { x, y, w, h };
    cream(x, y, w, h, 16);
    drawIcon(x + 26, y + h / 2 - 2);
    text(title, x + 50, y + 23, 15, PLUM, 'left', null);
    ctx.font = `600 11px ${FONT}`;
    const sw = ctx.measureText(sub).width;
    progressBar(x + 50, y + h - 25, w - 66 - sw, 9, frac, fillColor);
    text(sub, x + w - 10, y + h - 20, 11, '#b0466e', 'right', null);
    if (badge > 0) {
      ctx.fillStyle = '#ff4f7a';
      ctx.beginPath(); ctx.arc(x + w - 4, y + 4, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      text(String(badge), x + w - 4, y + 5, 11, '#fff', 'center', null);
    }
  }

  function drawTitle() {
    const cx = W / 2;
    const skin = SKINS[skinIndex];
    const unlocked = save.unlocked.includes(skin.id);
    const ty = titleY();
    // fade in after the splash
    const intro = clamp((time - titleIntroT) / 0.45, 0, 1);
    ctx.globalAlpha = intro;

    // hero: spotlight, cushion and Mochi
    const heroY = 236 + ty;
    const glow = ctx.createRadialGradient(cx, heroY - 6, 10, cx, heroY - 6, 130);
    glow.addColorStop(0, 'rgba(255,255,255,0.75)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(cx - 140, heroY - 150, 280, 280);
    if (!reducedMotion()) {
      ctx.save(); ctx.translate(cx, heroY - 6); ctx.rotate(time * 0.15);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 10; i++) { ctx.rotate(Math.PI / 5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-14, -125); ctx.lineTo(14, -125); ctx.fill(); }
      ctx.restore();
    }
    drawCushion(cx, heroY + 46, 120);
    const sh = uiShake > 0 ? Math.sin(uiShake * 40) * 6 * uiShake : 0;
    const drop = (1 - (1 - Math.pow(1 - intro, 3))) * -60;
    ctx.globalAlpha = intro * (unlocked ? 1 : 0.6);
    drawMochi(cx + sh, mochi.y + drop, 2.35, skin, mochiOpts({ rot: 0, vy: 0, dead: false, hopping: false, sx: 1, sy: 1 }));
    ctx.globalAlpha = intro;
    if (!unlocked) {
      const lx = cx + 42, ly = mochi.y + 26;
      ctx.fillStyle = '#fff6ea';
      ctx.beginPath(); ctx.arc(lx, ly, 17, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = PLUM; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = PLUM;
      roundRect(lx - 7.5, ly - 3, 15, 12, 3); ctx.fill();
      ctx.beginPath(); ctx.arc(lx, ly - 3, 4.5, Math.PI, 0); ctx.stroke();
    }
    const ax = Math.min(122, W / 2 - 30);
    arrowButton('left', cx - ax, heroY, -1);
    arrowButton('right', cx + ax, heroY, 1);

    // name ribbon
    ctx.font = `700 20px ${FONT}`;
    drawRibbon(cx, 320 + ty, Math.max(130, ctx.measureText(skin.name).width + 50), skin.name);
    const owned = SKINS.filter(k => save.unlocked.includes(k.id)).length;
    let sub = skin.season ? `Seasonal friend · ${skin.seasonName}` : `${owned} of ${SKINS.length} friends`;
    if (!unlocked && inSeason(skin) && save.petals < skin.cost) sub = `Collect ${skin.cost - save.petals} more petals`;
    text(sub, cx, 348 + ty, 12, skin.season ? '#ffe36e' : '#fff', 'center', 'rgba(46,11,32,0.6)');

    // main actions
    const pulse = reducedMotion() ? 1 : 1 + Math.sin(time * 4) * 0.025;
    ctx.save(); ctx.translate(cx, 392 + ty); ctx.scale(pulse, pulse);
    if (unlocked) button('play', 0, 0, 200, 54, 'PLAY', '#fd64a6');
    else if (!inSeason(skin)) button('play', 0, 0, 210, 54, `BACK ${skin.seasonName.toUpperCase()}`, '#ffb347', false);
    else button('play', 0, 0, 210, 54, `UNLOCK ${skin.cost}`, '#ffb347', save.petals >= skin.cost);
    ctx.restore();
    ui.play = { x: cx - 105, y: 392 + ty - 27, w: 210, h: 54 };
    // shine sweeping across PLAY now and then
    const sweep = (time % 3.2) / 0.6;
    if (unlocked && sweep < 1 && !reducedMotion()) {
      ctx.save(); roundRect(cx - 100, 392 + ty - 27, 200, 54, 16); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.translate(cx - 130 + sweep * 260, 392 + ty); ctx.rotate(0.4);
      ctx.fillRect(-8, -50, 16, 100); ctx.restore();
    }

    refreshDaily();
    const d = save.daily;
    if (challenge) {
      const cp = 1 + Math.sin(time * 5) * 0.03;
      ctx.save(); ctx.translate(cx, 452 + ty); ctx.scale(cp, cp);
      button('daily', 0, 0, 200, 44, `BEAT ${challenge.score}`, '#ffb000', unlocked);
      ctx.restore();
      ui.daily = { x: cx - 100, y: 452 + ty - 22, w: 200, h: 44 };
      text(challenge.date ? `A friend's score on Daily #${dailyNumber(challenge.date)}` : "A friend's score — can you beat it?", cx, 482 + ty, 12, '#fff', 'center', 'rgba(46,11,32,0.6)');
    } else {
      button('daily', cx, 452 + ty, 200, 44, 'DAILY', '#9b7bff', unlocked);
      // calendar chip with today's number
      const bx = cx - 74, by = 452 + ty;
      ctx.fillStyle = '#fff6ea'; ctx.strokeStyle = PLUM; ctx.lineWidth = 1.8;
      roundRect(bx - 11, by - 11, 22, 22, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff5f6f'; roundRect(bx - 11, by - 11, 22, 7, 3); ctx.fill();
      text(String(dailyNumber(d.date)), bx, by + 4, 11, PLUM, 'center', null);
      if (d.streak > 0) {
        // streak flame
        const fx = cx + 76, fy = by;
        ctx.fillStyle = '#ff9f43';
        ctx.beginPath(); ctx.moveTo(fx, fy - 13); ctx.quadraticCurveTo(fx + 11, fy - 2, fx + 6, fy + 9); ctx.quadraticCurveTo(fx, fy + 13, fx - 6, fy + 9); ctx.quadraticCurveTo(fx - 10, fy - 2, fx, fy - 13); ctx.fill();
        ctx.strokeStyle = PLUM; ctx.lineWidth = 1.6; ctx.stroke();
        text(String(d.streak), fx, fy + 3, 11, '#fff', 'center', PLUM);
      }
      text(d.runs > 0 ? `Today's best ${d.best} · same course for everyone` : 'New skewers today · same course for everyone', cx, 482 + ty, 11, '#fff', 'center', 'rgba(46,11,32,0.6)');
    }

    // missions and friends cards
    ensureMissions();
    refreshWeekly();
    const done = save.missions.filter(m => m.done).length + save.weekly.list.filter(m => m.done).length;
    const fresh = save.missions.filter(m => m.isNew && !m.done).length;
    const cw = Math.min(158, (W - 30) / 2), chh = 66, cyCard = 512 + ty;
    homeCard('missions', cx - cw - 5, cyCard, cw, chh, 'Missions', `${done}/6`,
      (save.missions.reduce((a, m) => a + m.progress / missionDef(m.id).n, 0) + save.weekly.list.reduce((a, m) => a + m.progress / missionDef(m.id).n, 0)) / 6,
      '#fd64a6', (x, y) => scrollIcon(x, y, 1.05), fresh);
    homeCard('book', cx + 5, cyCard, cw, chh, 'Friends', `${owned}/${SKINS.length}`, owned / SKINS.length, '#6cc21d', (x, y) => {
      // three overlapping faces of owned friends
      const mine = SKINS.filter(k => save.unlocked.includes(k.id)).slice(-3);
      const n = mine.length;
      mine.forEach((k, i) => drawMochi(x + (i - (n - 1) / 2) * 10, y + 6 - (i === n - 1 ? 0 : 3), i === n - 1 ? 0.6 : 0.48, k, { spin: 0, noShadow: true, happy: i === n - 1 }));
    }, 0);


    petalCounter(26, 36 + topInset, save.petals);
    text(`BEST ${save.best}`, W / 2, 37 + topInset, 17, '#fff');
    settingsButtons();
    ctx.globalAlpha = 1;

    if (missionsOpen) drawMissionsOverlay();
    if (bookOpen) drawBook();
    if (reveal) drawReveal();
  }

  function pillButton(id, cx, cy, w, label, icon, badge) {
    const h = 34;
    ui[id] = { x: cx - w / 2, y: cy - h / 2, w, h };
    ctx.fillStyle = 'rgba(46,11,32,0.6)';
    roundRect(cx - w / 2, cy - h / 2, w, h, 17); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
    text(label, cx, cy + 1, 13, '#fff', 'center', null);
  }

  function closeButton(id, x, y) {
    ui[id] = { x: x - 22, y: y - 22, w: 44, h: 44 };
    ctx.fillStyle = '#fd64a6';
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PLUM; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 5.5, y - 5.5); ctx.lineTo(x + 5.5, y + 5.5); ctx.moveTo(x + 5.5, y - 5.5); ctx.lineTo(x - 5.5, y + 5.5); ctx.stroke();
  }

  // ---------------------------------------------------------------------------
  // Friends album
  // ---------------------------------------------------------------------------
  function seasonBadge(x, y, sk) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#fff6ea'; ctx.strokeStyle = PLUM; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (sk.id === 'pumpkin') { ctx.fillStyle = '#ff9a2e'; ctx.beginPath(); ctx.ellipse(0, 1, 5.5, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#4aa83c'; ctx.fillRect(-1, -6, 2, 3); }
    else if (sk.id === 'snow') { ctx.strokeStyle = '#59a8e0'; ctx.lineWidth = 1.6; for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke(); } }
    else drawSakura(0, 0, 6, 0);
    ctx.restore();
  }

  function drawBook() {
    for (const k of ['play', 'daily', 'left', 'right', 'missions', 'book', 'mute', 'settings']) delete ui[k];
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#ffe7f0'); bg.addColorStop(1, '#ffc2da');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) drawSakura((i * 97 + 20) % W, (i * 151 + 40) % H, 6 + (i % 3), i, 0);
    ctx.fillStyle = 'rgba(255,231,240,0.55)'; ctx.fillRect(0, 0, W, H);   // soften the pattern

    const ty = topInset * 0.8;
    const owned = SKINS.filter(k => save.unlocked.includes(k.id)).length;
    drawRibbon(W / 2, 58 + ty, 150, 'Friends', '#fd64a6', '#c93a7c', 22);
    const bw = Math.min(220, W - 80);
    progressBar(W / 2 - bw / 2, 86 + ty, bw, 12, owned / SKINS.length, '#6cc21d');
    text(`${owned} of ${SKINS.length} collected`, W / 2, 112 + ty, 12, '#b0466e', 'center', null);
    closeButton('closeBook', W - 30, 34 + topInset);

    const cols = W >= 330 ? 4 : 3;
    const rowsN = Math.ceil(SKINS.length / cols);
    const gy = 128 + ty;
    const chh = Math.min(92, (H - gy - 34) / rowsN);
    const cw = Math.min(80, (W - 20) / cols);
    const gx = W / 2 - (cw * cols) / 2;
    SKINS.forEach((sk, i) => {
      const x = gx + (i % cols) * cw + 4, y = gy + Math.floor(i / cols) * chh + 4, w = cw - 8, h = chh - 8;
      const have = save.unlocked.includes(sk.id);
      const picked = i === skinIndex;
      ui['cell' + i] = { x, y, w, h };
      // card
      ctx.fillStyle = 'rgba(46,11,32,0.18)'; roundRect(x, y + 3, w, h, 14); ctx.fill();
      ctx.fillStyle = have ? '#ffffff' : '#fbe9f1';
      roundRect(x, y, w, h, 14); ctx.fill();
      if (!have) { ctx.setLineDash([4, 3]); }
      ctx.strokeStyle = picked ? '#fd64a6' : (have ? PLUM : 'rgba(46,11,32,0.4)');
      ctx.lineWidth = picked ? 3.5 : 2; ctx.stroke();
      ctx.setLineDash([]);
      // portrait circle in the friend's own colour
      const pcx = x + w / 2, pcy = y + h * 0.4;
      ctx.fillStyle = have ? sk.shade : '#f0d3e0';
      ctx.globalAlpha = have ? 0.55 : 1;
      ctx.beginPath(); ctx.arc(pcx, pcy + 2, Math.min(w, h) * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      const ms = Math.min(0.95, h / 100);
      if (have) drawMochi(pcx, pcy + 4, ms, sk, { spin: 0, happy: picked, noShadow: true });
      else {
        ctx.globalAlpha = 0.45;
        drawMochi(pcx, pcy + 4, ms, Object.assign({}, sk, { body: '#c9a3b8', shade: '#b48aa2', cheek: '#c9a3b8', pattern: null, eye: '#c9a3b8' }), { spin: 0, blink: true, noShadow: true });
        ctx.globalAlpha = 1;
      }
      text(have ? sk.name : '???', pcx, y + h - 24, 11, PLUM, 'center', null);
      // footer chip
      const chipY = y + h - 10;
      if (picked && have) {
        ctx.fillStyle = '#fd64a6'; roundRect(pcx - 24, chipY - 7, 48, 14, 7); ctx.fill();
        text('PICKED', pcx, chipY, 9, '#fff', 'center', null);
      } else if (!have) {
        const off = sk.season && !inSeason(sk);
        const can = !off && save.petals >= sk.cost;
        ctx.fillStyle = off ? '#d9c3dd' : (can ? '#ffd84a' : '#fff');
        roundRect(pcx - 26, chipY - 7, 52, 14, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(46,11,32,0.35)'; ctx.lineWidth = 1; ctx.stroke();
        if (off) text(sk.seasonName, pcx, chipY, 9, PLUM, 'center', null);
        else { drawSakura(pcx - 14, chipY, 4.5, 0); text(String(sk.cost), pcx + 5, chipY, 9, PLUM, 'center', null); }
      }
      if (sk.season) seasonBadge(x + w - 9, y + 9, sk);
    });
    text('Tap a friend to pick them', W / 2, gy + rowsN * chh + 12, 12, '#b0466e', 'center', null);
  }

  // Big "new friend" reveal after unlocking
  function drawReveal() {
    for (const k of ['play', 'daily', 'left', 'right', 'missions', 'book']) delete ui[k];
    const t = time - reveal.t;
    const cx = W / 2, cy = H * 0.42;
    ctx.fillStyle = 'rgba(29,27,47,0.8)';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * (reducedMotion() ? 0 : 0.4));
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.fillStyle = i % 2 ? 'rgba(255,227,110,0.18)' : 'rgba(255,143,179,0.18)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, -H); ctx.lineTo(30, -H); ctx.fill();
    }
    ctx.restore();
    const pop = Math.min(1, t / 0.35);
    const sc = 2.6 * (pop < 1 ? 0.4 + 0.6 * (1 - Math.pow(1 - pop, 3)) * 1.1 : 1 + Math.sin(t * 3) * 0.03);
    drawMochi(cx, cy, sc, reveal.skin, { happy: t > 0.4 && t < 1.2, spin: t * 8 });
    text('New friend!', cx, cy - 110, 34, '#ffe36e');
    text(reveal.skin.name, cx, cy + 82, 30, '#fff');
    if (t > 0.6) text('Tap to continue', cx, cy + 124, 15, '#ffe3ee', 'center', null);
    drawParticles();
  }

  // ---------------------------------------------------------------------------
  // Missions board
  // ---------------------------------------------------------------------------
  const MISSION_ICON_COLORS = {
    score_run: '#ffb000', score_total: '#ffb000', petals_run: '#fd64a6', petals_total: '#fd64a6',
    near_run: '#ffd84a', near_total: '#ffd84a', nopetal_run: '#9b7bff', splats_total: '#7ac7ff',
    runs_total: '#6cc21d', daily_play: '#9b7bff', daily_days: '#9b7bff', golden_total: '#ffcf33',
  };
  function missionIcon(type, x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = MISSION_ICON_COLORS[type] || '#fd64a6';
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PLUM; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (type.startsWith('score')) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 3 : 7, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
    } else if (type.startsWith('petals') || type === 'nopetal_run') {
      drawSakura(0, 0, 7.5, 0);
      if (type === 'nopetal_run') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.stroke(); }
    } else if (type.startsWith('near')) {
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(2.5, -2.5); ctx.lineTo(8, 0); ctx.lineTo(2.5, 2.5); ctx.lineTo(0, 8); ctx.lineTo(-2.5, 2.5); ctx.lineTo(-8, 0); ctx.lineTo(-2.5, -2.5); ctx.closePath(); ctx.fill();
    } else if (type === 'splats_total') {
      ctx.beginPath(); ctx.ellipse(0, 2, 8, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-7, -4, 1.8, 0, Math.PI * 2); ctx.arc(6, -5, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'runs_total') {
      ctx.beginPath(); ctx.moveTo(-3.5, -6); ctx.lineTo(6, 0); ctx.lineTo(-3.5, 6); ctx.closePath(); ctx.fill();
    } else if (type.startsWith('daily')) {
      roundRect(-6.5, -5.5, 13, 12, 2); ctx.fill();
      ctx.fillStyle = MISSION_ICON_COLORS[type]; ctx.fillRect(-4.5, -1.5, 9, 1.6); ctx.fillRect(-4.5, 2, 6, 1.6);
    } else if (type === 'golden_total') {
      ctx.fillStyle = '#fff6c2'; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
  }

  function missionRow(m, x, y, w) {
    const d = missionDef(m.id);
    const h = 46;
    ctx.fillStyle = m.done ? '#eafbe9' : '#ffffff';
    roundRect(x, y, w, h, 12); ctx.fill();
    ctx.strokeStyle = m.done ? '#8fd47a' : '#f3d0de'; ctx.lineWidth = 1.5; ctx.stroke();
    missionIcon(d.type, x + 22, y + h / 2);
    const tx = x + 42, chipW = 48;
    text(missionText(d), tx, y + 15, 13, PLUM, 'left', null);
    if (m.isNew && !m.done) {
      const tw = ctx.measureText(missionText(d)).width;
      if (tx + tw + 36 < x + w - chipW - 10) {
        ctx.fillStyle = '#ff4f7a'; roundRect(tx + tw + 6, y + 8, 30, 14, 7); ctx.fill();
        text('NEW', tx + tw + 21, y + 15, 9, '#fff', 'center', null);
      }
    }
    const bw = w - (tx - x) - chipW - 54;
    progressBar(tx, y + 27, bw, 8, m.progress / d.n, m.done ? '#6cc21d' : '#fd64a6');
    text(`${m.progress}/${d.n}`, tx + bw + 5, y + 31, 10, '#b0466e', 'left', null);
    // reward chip
    const chx = x + w - chipW - 8, chy = y + h / 2 - 11;
    ctx.fillStyle = m.done ? '#6cc21d' : '#ffe9a8';
    roundRect(chx, chy, chipW, 22, 11); ctx.fill();
    ctx.strokeStyle = PLUM; ctx.lineWidth = 1.5; ctx.stroke();
    if (m.done) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(chx + 16, chy + 11); ctx.lineTo(chx + 22, chy + 16); ctx.lineTo(chx + 32, chy + 6); ctx.stroke();
    } else {
      drawSakura(chx + 13, chy + 11, 6, 0);
      text(`+${d.reward}`, chx + 32, chy + 12, 11, PLUM, 'center', null);
    }
    return h;
  }

  function drawMissionsOverlay() {
    for (const k of ['play', 'daily', 'left', 'right', 'missions', 'book']) delete ui[k];
    refreshWeekly();
    ctx.fillStyle = 'rgba(46,11,32,0.55)';
    ctx.fillRect(0, 0, W, H);
    const pw = Math.min(330, W - 20), px = W / 2 - pw / 2, py = 66 + topInset * 0.8;
    const rows = save.missions.length + save.weekly.list.length;
    const ph = 46 + 22 + rows * 52 + 34 + 46 + 30;
    cream(px, py, pw, ph, 22);
    drawRibbon(W / 2, py, 150, 'Missions', '#fd64a6', '#c93a7c', 20);
    closeButton('closeMissions', px + pw - 8, py + 8);

    let y = py + 34;
    text("TODAY'S GOALS", px + 16, y + 6, 11, '#b0466e', 'left', null);
    y += 18;
    for (const m of save.missions) { missionRow(m, px + 10, y, pw - 20); y += 52; }

    y += 6;
    text('THIS WEEK', px + 16, y + 6, 11, '#7a52d1', 'left', null);
    ctx.font = `600 10px ${FONT}`;
    const rt = weeklyResetText(), rw = ctx.measureText(rt).width + 16;
    ctx.fillStyle = '#e7dcff'; roundRect(px + pw - 16 - rw, y - 2, rw, 16, 8); ctx.fill();
    text(rt, px + pw - 16 - rw / 2, y + 6, 10, '#7a52d1', 'center', null);
    y += 18;
    for (const m of save.weekly.list) { missionRow(m, px + 10, y, pw - 20); y += 52; }

    // weekly bonus: a gift box with three progress pips
    const doneW = save.weekly.list.filter(m => m.done).length;
    const by = y + 4;
    ctx.fillStyle = save.weekly.bonus ? '#eafbe9' : '#f3ecff';
    roundRect(px + 10, by, pw - 20, 38, 12); ctx.fill();
    ctx.strokeStyle = '#c9b6f2'; ctx.lineWidth = 1.5; ctx.stroke();
    const gx = px + 32, gy = by + 19;
    ctx.fillStyle = '#9b7bff'; ctx.strokeStyle = PLUM; ctx.lineWidth = 1.6;
    roundRect(gx - 10, gy - 6, 20, 15, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b79dff'; roundRect(gx - 12, gy - 11, 24, 6, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd84a'; ctx.fillRect(gx - 2, gy - 11, 4, 20);
    text(save.weekly.bonus ? `Weekly bonus collected! +${WEEKLY_BONUS}` : `Finish all 3 this week: +${WEEKLY_BONUS}`, px + 52, gy + 1, 12, PLUM, 'left', null);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < doneW ? '#6cc21d' : '#e2d6f5';
      ctx.beginPath(); ctx.arc(px + pw - 54 + i * 16, gy, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(46,11,32,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    }

    const t = save.totals;
    text(`All time: ${t.runs} runs · ${t.near} close calls · ${t.petals} petals`, W / 2, by + 56, 11, '#b0466e', 'center', null);
    ui.overlay = { x: 0, y: 0, w: W, h: H };
  }

  function drawReady() {
    const cx = W / 2;
    text('Get Ready!', cx, 150 + topInset * 0.5, 40, '#fff');
    const t = (Math.sin(time * 6) + 1) / 2;
    ctx.save();
    ctx.translate(mochi.x + 4, mochi.y + 70 + t * 6);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = PLUM;
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
    ctx.fillStyle = 'rgba(46,11,32,0.9)';
    roundRect(px, py + 6, pw, ph, 20); ctx.fill();
    ctx.fillStyle = '#fff6ea';
    roundRect(px, py, pw, ph, 20); ctx.fill();
    ctx.strokeStyle = PLUM; ctx.lineWidth = 3; ctx.stroke();

    const m = medalFor(score);
    const mx = px + 58, my = py + ph / 2 - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.arc(mx, my, 34, 0, Math.PI * 2); ctx.fill();
    if (m) {
      // medal award: pops in with a bounce, then a shine sweeps across
      const live = state === 'over';
      const t = live ? clamp((stateT - 0.15) / 0.45, 0, 1) : 1;
      if (live && t > 0 && !medalPlayed) { medalPlayed = true; sfx.medal(); haptic('click'); }
      const c1 = 1.70158, c3 = c1 + 1;
      const k = reducedMotion() ? 1 : (t <= 0 ? 0 : 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2));
      ctx.save();
      ctx.translate(mx, my);
      ctx.scale(k, k);
      const g = ctx.createRadialGradient(-8, -8, 3, 0, 0, 32);
      g.addColorStop(0, m.c1); g.addColorStop(1, m.c2);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = PLUM; ctx.lineWidth = 2.5; ctx.stroke();
      drawMochi(0, 4, 0.95, SKINS[skinIndex], { happy: true, spin: 0 });
      const sweep = live ? (stateT - 0.6) / 0.5 : 2;
      if (sweep > 0 && sweep < 1 && !reducedMotion()) {
        ctx.save();
        ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.rotate(-0.6);
        ctx.fillRect(-40 + sweep * 80, -40, 10, 80);
        ctx.restore();
      }
      ctx.restore();
      text(m.name, mx, py + ph - 14, 12, m.c2, 'center', null);
    } else {
      text('?', mx, my, 26, 'rgba(46,11,32,0.25)', 'center', null);
      text('10 for medal', mx, py + ph - 14, 10, 'rgba(46,11,32,0.5)', 'center', null);
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
    ctx.strokeStyle = PLUM; ctx.lineWidth = 2.5; ctx.stroke();
    text(m.name, x, y + 1, r * 0.42, '#fff', 'center', PLUM);
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
      drawLogo(cx, 6, 168);
      const pill = mode === 'daily' ? `DAILY #${dailyNumber(runDate)} · ${prettyDate(runDate).toUpperCase()}` : 'ENDLESS MODE';
      ctx.font = `600 12px ${FONT}`;
      const pw = ctx.measureText(pill).width + 26;
      ctx.fillStyle = mode === 'daily' ? '#9b7bff' : 'rgba(46,11,32,0.55)';
      roundRect(cx - pw / 2, 152, pw, 22, 11); ctx.fill();
      text(pill, cx, 164, 12, '#fff', 'center', null);

      // headline: the challenge
      text('BEAT MY', cx, 196, 24, '#feedde');
      text(String(score), cx, 246, 70, '#fff');
      const m = medalFor(score);
      if (m) drawMedal(cx + 98, 252, 24, m);

      // scene: a skewer with Mochi splatted on it, stats on the left
      const sx = 272, tipY = 286, ground = 388;
      ctx.fillStyle = '#5a8f4e'; ctx.fillRect(0, ground - 4, CW, 6);
      ctx.fillStyle = '#eadbb3'; ctx.fillRect(0, ground + 2, CW, CH - ground);
      drawStick(sx, tipY, ground + 10, false);
      for (let i = 2; i >= 0; i--) drawBall(i, sx, tipY + TIP + DANGO_R - 4 + i * DANGO_STEP);
      drawMochi(sx - DANGO_R - 16, 334, 1.75, SKINS[skinIndex], { dead: true, sx: 0.66, sy: 1.3, spin: 0 });

      const stats = [];
      stats.push(['petal', `${caught} petal${caught === 1 ? '' : 's'}`]);
      stats.push(['star', `${nearCount} close call${nearCount === 1 ? '' : 's'}`]);
      if (mode === 'daily' && save.daily.streak > 1) stats.push(['fire', `${save.daily.streak} day streak`]);
      stats.forEach(([icon, label], i) => {
        const y = 296 + i * 30;
        ctx.fillStyle = 'rgba(46,11,32,0.5)';
        roundRect(16, y - 12, 150, 25, 12.5); ctx.fill();
        if (icon === 'petal') drawSakura(31, y, 8, 0);
        else if (icon === 'star') { ctx.fillStyle = '#fff3a0'; ctx.save(); ctx.translate(31, y); ctx.rotate(0.6); ctx.fillRect(-5, -5, 10, 10); ctx.restore(); }
        else { ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.arc(31, y + 1, 6, 0, Math.PI * 2); ctx.fill(); }
        text(label, 46, y + 1, 13, '#fff', 'left', null);
      });

      // call to action
      ctx.fillStyle = 'rgba(46,11,32,0.9)';
      roundRect(cx - 130, 405, 260, 36, 18); ctx.fill();
      ctx.fillStyle = '#fd64a6';
      roundRect(cx - 130, 401, 260, 36, 18); ctx.fill();
      ctx.strokeStyle = PLUM; ctx.lineWidth = 2.5; ctx.stroke();
      text('Free on Google Play', cx, 420, 17, '#fff');
    } finally {
      ctx = prev;
    }
    return cv;
  }


  function shareText() {
    const m = medalFor(score);
    const medal = m ? { BRONZE: ' 🥉', SILVER: ' 🥈', GOLD: ' 🥇', JADE: ' 💚' }[m.name] : '';
    const stats = `🌸 ${caught}  ✨ ${nearCount} close call${nearCount === 1 ? '' : 's'}`;
    if (mode === 'daily') {
      const streak = save.daily.streak > 1 ? `  🔥 ${save.daily.streak}` : '';
      return `🍡 Mochi Hop Daily #${dailyNumber(runDate)}: ${score}${medal}\n${stats}${streak}\nEveryone gets the same course today. Get Mochi Hop free and beat me 👉 ${PLAY_STORE_URL}`;
    }
    return `🍡 I scored ${score}${medal} in Mochi Hop!\n${stats}\nGet it free and beat me 👉 ${PLAY_STORE_URL}`;
  }

  // Link-preview image (1200x630) for chat apps and social posts.
  function makePromoCanvas() {
    const CW = 600, CH = 315, k = 2;
    const cv = document.createElement('canvas');
    cv.width = CW * k; cv.height = CH * k;
    const prev = ctx;
    ctx = cv.getContext('2d');
    ctx.scale(k, k);
    try {
      const g = ctx.createLinearGradient(0, 0, 0, CH);
      g.addColorStop(0, '#8fd3ff'); g.addColorStop(1, '#fff1d6');
      ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
      for (let i = 0; i < 26; i++) drawPetal((i * 97 + 13) % CW, (i * 61) % 280 + 6, 4 + (i % 3), i, 'rgba(255,170,200,0.8)');
      ctx.fillStyle = '#5a8f4e'; ctx.fillRect(0, CH - 52, CW, 6);
      ctx.fillStyle = '#eadbb3'; ctx.fillRect(0, CH - 46, CW, 46);
      // logo on the left, a winking Mochi hopping between skewers on the right
      drawLogo(160, 4, 280);
      text('Can you beat my score?', 160, 268, 21, '#fff');
      const sx = 488, gapY = 150, gap = 150;
      drawStick(sx, -10, gapY - gap / 2, true);
      for (let i = 2; i >= 0; i--) drawBall(i, sx, gapY - gap / 2 - TIP - DANGO_R + 4 - i * DANGO_STEP);
      drawStick(sx, gapY + gap / 2, CH - 40, false);
      for (let i = 2; i >= 0; i--) drawBall(i, sx, gapY + gap / 2 + TIP + DANGO_R - 4 + i * DANGO_STEP);
      drawMochi(410, 150, 2.2, SKINS[0], { happy: true, spin: 0, perk: 0.15, hopping: true });
      ctx.fillStyle = 'rgba(46,11,32,0.9)';
      roundRect(400, 276, 150, 32, 16); ctx.fill();
      ctx.fillStyle = '#fd64a6';
      roundRect(400, 272, 150, 32, 16); ctx.fill();
      ctx.strokeStyle = PLUM; ctx.lineWidth = 2.5; ctx.stroke();
      text('Free on Google Play', 475, 289, 14, '#fff');
    } finally { ctx = prev; }
    return cv;
  }

  // ---------------------------------------------------------------------------
  // Brand artwork for icons and the store (rendered by tools/render-assets.js)
  // ---------------------------------------------------------------------------
  function iconBackground(size) {
    const g = ctx.createRadialGradient(size * 0.5, size * 0.38, size * 0.05, size * 0.5, size * 0.5, size * 0.75);
    g.addColorStop(0, '#ffd3e2'); g.addColorStop(0.55, '#ff9cc4'); g.addColorStop(1, '#f2669f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // soft sunburst + a few petals
    ctx.save();
    ctx.translate(size / 2, size * 0.46);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-size * 0.08, -size); ctx.lineTo(size * 0.08, -size); ctx.fill();
    }
    ctx.restore();
    const k = size / 100;
    for (const [x, y, sz, a] of [[14, 20, 4, 0.5], [86, 16, 3.5, 2], [10, 78, 3.5, 1.2], [90, 74, 4, 2.6], [78, 46, 2.6, 0.2], [22, 50, 2.6, 3]]) {
      drawPetal(x * k, y * k, sz * k, a, 'rgba(255,255,255,0.75)');
    }
  }

  // Mochi with the logo's wink, centred on (cx, cy), k = scale. Art is ~44 x 62 units.
  function iconMochi(cx, cy, k, plain = false) {
    if (!plain) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(cx, cy + 6 * k, 30 * k, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    drawMochi(cx, cy + 10.5 * k, k, SKINS[0], { happy: true, spin: 0, perk: 0.15, noShadow: plain });
  }

  // kind: 'web' (rounded), 'play' (full square), 'maskable' (full bleed, 80% safe zone),
  // 'fg' / 'bg' (Android adaptive layers, 66/108 safe zone), 'mono' (themed icon silhouette)
  function makeIconCanvas(size, kind = 'web') {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const prev = ctx;
    ctx = cv.getContext('2d');
    try {
      if (kind === 'web') { roundRect(0, 0, size, size, size * 0.22); ctx.clip(); }
      if (kind !== 'fg' && kind !== 'mono') iconBackground(size);
      if (kind === 'bg') return cv;
      // how much of the canvas the ~62-unit-tall art may fill
      const fill = { web: 0.78, play: 0.78, maskable: 0.62, fg: 0.52, mono: 0.52 }[kind];
      const k = size * fill / 62;
      iconMochi(size / 2, size / 2, k, kind === 'mono');
      if (kind === 'mono') {
        // single-colour silhouette with the face cut out, for Android themed icons
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = 'destination-out';
        const fx = size / 2, fy = size / 2 + 10.5 * k, r = 18 * k;
        ctx.beginPath(); ctx.ellipse(fx - r * 0.36, fy - r * 0.06, 3.6 * k, 4.4 * k, 0, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 2.4 * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(fx + r * 0.36 + 3.6 * k, fy - r * 0.06 - 3 * k); ctx.lineTo(fx + r * 0.36 - 2.4 * k, fy - r * 0.06); ctx.lineTo(fx + r * 0.36 + 3.6 * k, fy - r * 0.06 + 3 * k); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(fx - 4.6 * k, fy + r * 0.2); ctx.quadraticCurveTo(fx, fy + r * 0.2 + 1.1 * k, fx + 4.6 * k, fy + r * 0.2);
        ctx.bezierCurveTo(fx + 4.4 * k, fy + r * 0.2 + 5.8 * k, fx - 4.4 * k, fy + r * 0.2 + 5.8 * k, fx - 4.6 * k, fy + r * 0.2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    } finally { ctx = prev; }
    return cv;
  }

  // Google Play feature graphic, 1024 x 500. Logo centred, scene around it, nothing important near the edges.
  function makeFeatureCanvas() {
    const CW = 1024, CH = 500;
    const cv = document.createElement('canvas');
    cv.width = CW; cv.height = CH;
    const prev = ctx, prevW = W;
    ctx = cv.getContext('2d');
    W = CW;
    try {
      const g = ctx.createLinearGradient(0, 0, 0, CH);
      g.addColorStop(0, '#8fd3ff'); g.addColorStop(1, '#fff1d6');
      ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
      ctx.fillStyle = 'rgba(255,246,176,0.5)';
      ctx.beginPath(); ctx.arc(860, 110, 70, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff6b0';
      ctx.beginPath(); ctx.arc(860, 110, 48, 0, Math.PI * 2); ctx.fill();
      const gy = 430;
      ctx.save(); ctx.translate(0, gy - 548);   // reuse the game's scenery, which is drawn against a 548 ground line
      ridge(140, 548 - 150, 50, 1.3, '#a7c7e7', 10);
      drawToriiAndPagodas(80, 548 - 62, '#7fb59a');
      ridge(300, 548 - 40, 26, 4.1, '#7fb59a', 8);
      drawSakuraTrees(60, 546, 'rgba(90,60,70,0.55)', 'rgba(255,190,210,0.85)');
      ctx.restore();
      ctx.fillStyle = '#5a8f4e'; ctx.fillRect(0, gy - 4, CW, 10);
      ctx.fillStyle = '#eadbb3'; ctx.fillRect(0, gy + 6, CW, CH - gy);
      ctx.strokeStyle = 'rgba(160,130,85,0.45)'; ctx.lineWidth = 2;
      for (let row = 0; row < 4; row++) {
        ctx.beginPath();
        for (let x = 0; x <= CW; x += 8) { const y = gy + 22 + row * 15 + Math.sin(x * 0.05 + row) * 2; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      }
      for (let i = 0; i < 24; i++) drawPetal((i * 97 + 13) % CW, (i * 61) % 380 + 10, 5 + (i % 3), i, 'rgba(255,170,200,0.85)');
      // skewers framing the logo
      const skew = (x, tipY, up) => {
        if (up) { drawStick(x, tipY, gy + 12, false); for (let i = 2; i >= 0; i--) drawBall(i, x, tipY + TIP + DANGO_R - 4 + i * DANGO_STEP); }
        else { drawStick(x, -20, tipY, true); for (let i = 2; i >= 0; i--) drawBall(i, x, tipY - TIP - DANGO_R + 4 - i * DANGO_STEP); }
      };
      ctx.save(); ctx.translate(150, 0); ctx.scale(1.25, 1.25); skew(0, 120, false); skew(0, 250, true); ctx.restore();
      ctx.save(); ctx.translate(880, 0); ctx.scale(1.25, 1.25); skew(0, 210, true); ctx.restore();
      // friends hopping beside the logo
      drawMochi(250, 230, 1.7, SKINS.find(k => k.id === 'sakura'), { happy: true, spin: 0, perk: 0.3, hopping: true });
      drawMochi(790, 330, 1.7, SKINS.find(k => k.id === 'matcha'), { spin: 0.4, perk: 0.5 });
      drawLogo(CW / 2, 18, 470);
    } finally { ctx = prev; W = prevW; }
    return cv;
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

  function drawWind() {
    const active = gustT < GUST_TIME;
    const a = active ? Math.min(1, gustT / 0.3) : (GUST_WARN + GUST_TIME - gustT) / GUST_WARN;
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * a})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y = ((i * 73) % (groundY() - 40)) + 20;
      const x = W - ((time * 700 + i * 137) % (W + 120));
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 50, y + (active ? 10 : 2)); ctx.stroke();
    }
  }

  function drawHint(h) {
    const a = clamp(h.life / 0.4, 0, 1) * clamp((2.6 - h.life) / 0.2, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = `600 14px ${FONT}`;
    const w = ctx.measureText(h.msg).width + 22;
    const x = clamp(h.x, w / 2 + 6, W - w / 2 - 6);
    ctx.fillStyle = '#fff6ea';
    roundRect(x - w / 2, h.y - 15, w, 30, 15); ctx.fill();
    ctx.strokeStyle = PLUM; ctx.lineWidth = 2; ctx.stroke();
    if (h.follow) {
      ctx.fillStyle = '#fff6ea';
      ctx.beginPath(); ctx.moveTo(h.x - 7, h.y + 14); ctx.lineTo(h.x + 7, h.y + 14); ctx.lineTo(h.x, h.y + 22); ctx.fill();
    }
    text(h.msg, x, h.y + 1, 14, '#b0466e', 'center', null);
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    const pop = 1 + (reducedMotion() ? 0 : scorePop * 0.35);
    ctx.save();
    ctx.translate(W / 2, 70 + topInset);
    ctx.scale(pop, pop);
    text(String(score), 0, 0, 56, '#fff');
    ctx.restore();
    const lefty = save.settings.lefty;
    if (runPetals > 0) petalCounter(lefty ? W - 70 : 26, 36 + topInset, runPetals);
    if (target > 0) text(score > target ? `BEAT ${target}!` : `TARGET ${target}`, W / 2, 112 + topInset, 14, score > target ? '#8ff0b4' : '#ffe36e');
    else if (mode === 'daily') text(`DAILY #${dailyNumber(runDate)}`, W / 2, 112 + topInset, 13, '#e3d6ff');
    if (state === 'play' && !paused) {
      const bx = lefty ? 34 : W - 34, by = 36 + topInset;
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
    ctx.fillStyle = 'rgba(46,11,32,0.9)';
    roundRect(px, py + 5, pw, ch, 18); ctx.fill();
    ctx.fillStyle = '#fff6ea';
    roundRect(px, py, pw, ch, 18); ctx.fill();
    ctx.strokeStyle = PLUM; ctx.lineWidth = 3; ctx.stroke();
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
    if (shake > 0 && !reducedMotion()) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);

    drawBackground(skyAt(displaySky));
    const menu = state === 'title' || state === 'splash';
    if (!menu) drawObstacles();
    drawGround();

    if (!menu) drawMochi(mochi.x, mochi.y, 1, SKINS[skinIndex], mochiOpts());
    drawParticles();
    if (gustT > 0 && state === 'play') drawWind();
    for (const h of hints) drawHint(h);

    if (flash > 0 && !reducedMotion()) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.6})`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }

    if (state === 'splash') drawSplash();
    else if (state === 'title') drawTitle();
    else if (state === 'ready') drawReady();
    else if ((state === 'play' || state === 'dying') && !paused) drawHud();
    else if (state === 'over') drawOver();

    if (settingsOpen) drawSettings();
    if (paused) drawPause();
    else if (countdown > 0) {
      const n = Math.ceil(countdown / 0.5);
      const f = (countdown % 0.5) / 0.5;
      ctx.save();
      ctx.translate(W / 2, H * 0.42);
      if (!reducedMotion()) ctx.scale(1 + f * 0.4, 1 + f * 0.4);
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

    if (state === 'splash') { if (stateT < SPLASH_HOLD) stateT = SPLASH_HOLD; return; }
    if (settingsOpen) { tapSettings(x, y); return; }
    if (state === 'title' && reveal) { if (time - reveal.t > 0.6) { reveal = null; sfx.click(); } return; }
    if (state === 'title' && missionsOpen) { missionsOpen = false; sfx.click(); return; }
    if (state === 'title' && bookOpen) {
      for (let i = 0; i < SKINS.length; i++) {
        if (hitTest('cell' + i, x, y)) { skinIndex = i; changeSkin(0); break; }
      }
      bookOpen = false;
      sfx.click();
      return;
    }
    if (state === 'title' || state === 'over') {
      if (hitTest('mute', x, y)) {
        save.muted = !save.muted;
        store.set('muted', save.muted);
        sfx.click();
        return;
      }
      if (hitTest('settings', x, y)) { settingsOpen = true; sfx.click(); return; }
    }

    if (state === 'title') {
      if (hitTest('book', x, y)) { bookOpen = true; sfx.click(); return; }
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
          if (inSeason(skin) && save.petals >= skin.cost) {
            save.petals -= skin.cost;
            save.unlocked.push(skin.id);
            save.skin = skin.id;
            store.set('petals', save.petals);
            store.set('unlocked', save.unlocked);
            store.set('skin', skin.id);
            sfx.unlock();
            haptic('heavy');
            mochi.spinV = 40;
            reveal = { skin, t: time };
            for (let i = 0; i < 40; i++) spawnParticle(W / 2, H * 0.42, rand(-260, 260), rand(-380, 40), 1.4, rand(4, 7), i % 2 ? '#ffb3cc' : '#ffe36e', 'petal');
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
    get state() { return state; }, get score() { return score; }, set score(v) { score = v; displaySky = v; }, get W() { return W; },
    mochi, pipes: () => pipes, save, ballCenters, COL_W, DANGO_R,
    get ui() { return JSON.parse(JSON.stringify(ui)); }, get mode() { return mode; }, makePromoCanvas, makeIconCanvas, makeFeatureCanvas, get paused() { return paused; }, get countdown() { return countdown; }, get target() { return target; }, shareText, get near() { return nearCount; }, makeShareCanvas,
  };
})();
