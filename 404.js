/* Página 404 de Just A Cut: un montón de pelo tapa el letrero y se recorta con la máquina (o con el dedo). */
(function () {
  "use strict";
  const page = document.getElementById("e404");
  const stage = document.getElementById("e404-stage");
  const hairCanvas = document.getElementById("e404-hair");
  const fall = document.getElementById("e404-fall");
  if (!page || !stage || !hairCanvas || !hairCanvas.getContext) return;

  const sign = document.getElementById("e404-sign");
  const game = document.getElementById("e404-game");
  const val = document.getElementById("e404-val");
  const bar = document.getElementById("e404-bar");
  const again = document.getElementById("e404-again");
  const clipper = document.getElementById("e404-clipper");
  const hctx = hairCanvas.getContext("2d"), fctx = fall.getContext("2d");
  const LOW_END = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  const CELL = 24;
  const TONES = ["rgba(70,70,70,.92)", "rgba(96,96,96,.92)", "rgba(124,124,124,.92)", "rgba(156,156,156,.9)", "rgba(210,210,210,.78)"];
  const TONE_COL = [70, 96, 124, 156, 210];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let W = 0, H = 0, dpr = 1, R = 24, strands = [], grid = new Map(), cutCount = 0, total = 1, fixed = false;
  const falling = [];
  let fallRunning = false;

  // el pelo queda dentro de una elipse (igual que la máscara CSS); solo cuenta el que se ve
  const inPile = (x, y) => {
    const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
    return dx * dx + dy * dy;
  };

  function flow(x, y) {
    return Math.sin(x * 0.006 + Math.cos(y * 0.008) * 1.7) * 1.4 + Math.cos(y * 0.005 - x * 0.002) * 0.9 + 1.2;
  }

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, LOW_END ? 1 : 1.5);
    W = stage.clientWidth; H = stage.clientHeight;
    [hairCanvas, fall].forEach(c => { c.width = W * dpr; c.height = H * dpr; });
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0); fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = W < 700 ? 28 : 24;
    strands = []; grid = new Map(); cutCount = 0; total = 0;
    setFixed(false);

    const add = (x, y, a, len, w, tone) => {
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      const bend = (Math.random() - 0.5) * len * 0.45;
      const mx = (x + ex) / 2, my = (y + ey) / 2;
      const st = { x, y, ex, ey, cx: mx - Math.sin(a) * bend, cy: my + Math.cos(a) * bend, a, len, tone, col: TONE_COL[tone], w,
        cut: false, counts: inPile(mx, my) < 0.62 };
      strands.push(st);
      if (st.counts) total++;
      const key = ((mx / CELL) | 0) + "," + ((my / CELL) | 0);
      (grid.get(key) || grid.set(key, []).get(key)).push(st);
    };
    const pickTone = () => { const r = Math.random(); return r < 0.06 ? 4 : r < 0.26 ? 3 : r < 0.52 ? 2 : r < 0.78 ? 1 : 0; };
    const STEP = W < 700 ? 13 : LOW_END ? 15 : 12;
    for (let gy = -STEP; gy < H + STEP; gy += STEP) for (let gx = -STEP; gx < W + STEP; gx += STEP) {
      const x0 = gx + Math.random() * STEP, y0 = gy + Math.random() * STEP;
      if (inPile(x0, y0) > 1.15) continue;
      const base = flow(x0, y0) + (Math.random() - 0.5) * 0.7, tone = pickTone();
      const k = 2 + (Math.random() * 4 | 0), L = 18 + Math.random() * 22;
      for (let j = 0; j < k; j++) {
        const t = clamp(tone + (Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0), 0, 4);
        const len = L * (0.6 + Math.random() * 0.6), aa = base + (Math.random() - 0.5) * 0.3;
        add(x0 + (Math.random() - 0.5) * 8 - Math.cos(aa) * len / 2, y0 + (Math.random() - 0.5) * 8 - Math.sin(aa) * len / 2, aa, len, 0.45 + Math.random() * 0.55, t);
      }
      if (Math.random() < 0.35) add(x0 + Math.random() * STEP, y0 + Math.random() * STEP, Math.random() * 6.28, 4 + Math.random() * 7, 0.5, pickTone());
    }
    total = total || 1;
    drawAll();
    updateMeter();
  }

  function drawAll() {
    hctx.clearRect(0, 0, W, H);
    // base oscura del montón: deja intuir el letrero por debajo
    const g = hctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) / 2);
    g.addColorStop(0, "rgba(10,10,10,.9)"); g.addColorStop(1, "rgba(6,6,6,.82)");
    hctx.fillStyle = g; hctx.fillRect(0, 0, W, H);
    hctx.lineCap = "round";
    const shadow = new Path2D(), shine = new Path2D(), tones = TONES.map(() => [new Path2D(), new Path2D()]);
    for (const s of strands) {
      shadow.moveTo(s.x + 0.9, s.y + 1.3); shadow.quadraticCurveTo(s.cx + 0.9, s.cy + 1.3, s.ex + 0.9, s.ey + 1.3);
      const t = tones[s.tone][s.w > 0.75 ? 1 : 0]; t.moveTo(s.x, s.y); t.quadraticCurveTo(s.cx, s.cy, s.ex, s.ey);
      if (s.tone >= 2 && s.len > 9) {
        const mx = (s.x + 2 * s.cx + s.ex) / 4, my = (s.y + 2 * s.cy + s.ey) / 4, h = s.len * 0.18;
        shine.moveTo(mx - Math.cos(s.a) * h - 0.3, my - Math.sin(s.a) * h - 0.3); shine.lineTo(mx + Math.cos(s.a) * h - 0.3, my + Math.sin(s.a) * h - 0.3);
      }
    }
    hctx.strokeStyle = "rgba(0,0,0,.6)"; hctx.lineWidth = 1.8; hctx.stroke(shadow);
    TONES.forEach((c, i) => { hctx.strokeStyle = c; hctx.lineWidth = 0.6; hctx.stroke(tones[i][0]); hctx.lineWidth = 0.95; hctx.stroke(tones[i][1]); });
    hctx.strokeStyle = "rgba(255,255,255,.35)"; hctx.lineWidth = 0.45; hctx.stroke(shine);
  }

  function cutAt(x0, y0, x1, y1) {
    hctx.save();
    hctx.globalCompositeOperation = "destination-out";
    hctx.lineCap = "round"; hctx.lineWidth = R * 2;
    hctx.beginPath(); hctx.moveTo(x0, y0); hctx.lineTo(x1, y1); hctx.stroke();
    hctx.restore();
    const minX = Math.min(x0, x1) - R - 30, maxX = Math.max(x0, x1) + R + 30;
    const minY = Math.min(y0, y1) - R - 30, maxY = Math.max(y0, y1) + R + 30;
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
    let n = 0;
    for (let gx = (minX / CELL) | 0; gx <= (maxX / CELL) | 0; gx++) for (let gy = (minY / CELL) | 0; gy <= (maxY / CELL) | 0; gy++) {
      const list = grid.get(gx + "," + gy); if (!list) continue;
      for (const s of list) {
        if (s.cut) continue;
        const mx = (s.x + s.ex) / 2, my = (s.y + s.ey) / 2;
        const t = clamp(((mx - x0) * dx + (my - y0) * dy) / L2, 0, 1);
        if (Math.hypot(mx - (x0 + dx * t), my - (y0 + dy * t)) < R) {
          s.cut = true; n++; if (s.counts) cutCount++;
          if (falling.length < 520 && Math.random() < 0.7) falling.push({
            x: mx, y: my, a: s.a, len: s.len, col: s.col, w: s.w,
            vx: (Math.random() - 0.5) * 1.6 + dx * 0.02, vy: -Math.random() * 1.4, va: (Math.random() - 0.5) * 0.18, life: 1,
          });
        }
      }
    }
    if (n) { updateMeter(); if (!fallRunning) { fallRunning = true; requestAnimationFrame(fallLoop); } }
  }

  function updateMeter() {
    const p = Math.min(100, Math.round(cutCount / total * 100 / 0.88));
    val.textContent = p + "%";
    bar.style.transform = "scaleX(" + p / 100 + ")";
    if (p >= 100 && !fixed) finish();
  }

  function setFixed(on) {
    fixed = on;
    page.classList.toggle("is-fixed", on);
  }

  function finish() {
    setFixed(true);
    // el pelo que queda cae de golpe y el letrero se enciende del todo
    for (const s of strands) if (!s.cut) {
      s.cut = true;
      if (falling.length < 700 && Math.random() < 0.5) falling.push({
        x: (s.x + s.ex) / 2, y: (s.y + s.ey) / 2, a: s.a, len: s.len, col: s.col, w: s.w,
        vx: (Math.random() - 0.5) * 1.2, vy: -Math.random() * 1.2, va: (Math.random() - 0.5) * 0.18, life: 1,
      });
    }
    hctx.clearRect(0, 0, W, H);
    if (!fallRunning) { fallRunning = true; requestAnimationFrame(fallLoop); }
    jolt();
  }

  function jolt() {
    sign.classList.remove("is-jolt"); void sign.offsetWidth; sign.classList.add("is-jolt");
  }

  function fallLoop() {
    fctx.clearRect(0, 0, W, H);
    fctx.lineCap = "round";
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.vy += 0.16; f.vx *= 0.985; f.x += f.vx; f.y += f.vy; f.a += f.va; f.life -= 0.012;
      if (f.life <= 0 || f.y > H + 20) { falling.splice(i, 1); continue; }
      const hx = Math.cos(f.a) * f.len / 2, hy = Math.sin(f.a) * f.len / 2;
      fctx.strokeStyle = "rgba(" + f.col + "," + f.col + "," + f.col + "," + Math.min(1, f.life * 1.4) + ")";
      fctx.lineWidth = f.w;
      fctx.beginPath(); fctx.moveTo(f.x - hx, f.y - hy); fctx.lineTo(f.x + hx, f.y + hy); fctx.stroke();
    }
    if (falling.length) requestAnimationFrame(fallLoop); else { fallRunning = false; fctx.clearRect(0, 0, W, H); }
  }

  // la máquina sigue al cursor o al dedo dentro del escenario
  let last = null, buzzT, down = false;
  const pos = e => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const showClip = on => { stage.classList.toggle("is-clipping", on); if (clipper) clipper.classList.toggle("is-on", on); };

  stage.addEventListener("pointermove", e => {
    // con el dedo solo corta mientras está apoyado; con el ratón, al pasar por encima
    if (e.pointerType !== "mouse" && !down) return;
    const [x, y] = pos(e);
    if (e.pointerType === "mouse") {
      showClip(true);
      clipper.style.transform = "translate3d(" + e.clientX + "px," + e.clientY + "px,0)";
      clipper.classList.add("is-buzz"); clearTimeout(buzzT); buzzT = setTimeout(() => clipper.classList.remove("is-buzz"), 120);
    }
    if (!fixed) { if (last) cutAt(last[0], last[1], x, y); else cutAt(x, y, x, y); }
    last = [x, y];
  });
  stage.addEventListener("pointerdown", e => {
    down = true; last = null;
    const [x, y] = pos(e);
    if (!fixed) cutAt(x, y, x, y); else jolt();
    last = [x, y];
  });
  const up = () => { down = false; last = null; };
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
  stage.addEventListener("pointerleave", () => { up(); showClip(false); });

  again.addEventListener("click", () => build());

  let rT;
  window.addEventListener("resize", () => {
    clearTimeout(rT);
    rT = setTimeout(() => { if (Math.abs(stage.clientWidth - W) > 40 || Math.abs(stage.clientHeight - H) > 60) build(); }, 250);
  });

  game.hidden = false;
  // esperar a las fuentes para que el tamaño del escenario sea el definitivo
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(build);
})();
