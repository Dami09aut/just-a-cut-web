/* =========================================================
   JUST A CUT · Techo hexagonal en 3D (canvas 2D, sin librerías)
   ========================================================= */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOutCubic = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const smooth = t => t * t * (3 - 2 * t);

  // Trazos del logo (viewBox 100x100), los mismos que assets/logo.svg
  const LOGO_PATHS = [
    "M27 58 L50 15 L73 58",
    "M30 82 L18 82 L18 70 L24 65 L50 78 L76 65 L82 70 L82 82 L70 82",
  ];

  /* ---------- Geometría: panal de tubos LED en el plano del techo ---------- */
  function buildHoneycomb({ R = 1.15, halfWidth = 8, depth = 70, zMin = -4 }) {
    const edges = [];
    const seen = new Set();
    const w = Math.sqrt(3) * R;
    const rowH = 1.5 * R;
    const r0 = Math.floor(zMin / rowH) - 1;
    const rows = Math.ceil(depth / rowH) + 2;
    const cols = Math.ceil(halfWidth / w) + 2;
    const key = (x, z) => `${Math.round(x * 100)}|${Math.round(z * 100)}`;
    for (let r = r0; r < rows; r++) {
      for (let c = -cols; c <= cols; c++) {
        const cx = w * (c + (r & 1 ? 0.5 : 0));
        const cz = rowH * r;
        const v = [];
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          v.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]);
        }
        for (let k = 0; k < 6; k++) {
          const [x1, z1] = v[k];
          const [x2, z2] = v[(k + 1) % 6];
          const id = key((x1 + x2) / 2, (z1 + z2) / 2);
          if (seen.has(id)) continue;
          seen.add(id);
          const s = 0.07; // hueco del conector entre tubos
          edges.push({
            x1: lerp(x1, x2, s), z1: lerp(z1, z2, s),
            x2: lerp(x2, x1, s), z2: lerp(z2, z1, s),
            on: -1, seed: Math.random(), heat: 0,
          });
        }
      }
    }
    return { edges, period: 3 * R };
  }

  /* ---------- Renderer ---------- */
  class HexCeiling {
    constructor(canvas, opts = {}) {
      this.c = canvas;
      this.ctx = canvas.getContext("2d");
      this.o = Object.assign({
        ceilingY: 1.55,
        floorY: -1.25,
        pitch: 0.3,
        speed: 0.7,
        fov: 0.9,
        reflect: true,
        maxZ: 58,
        intensity: 1,
        wrap: true,       // techo infinito (ambiente) o sala con pared al fondo (intro)
        wall: null,       // { z, lit } pared del fondo
        interactive: false,
        trail: 0,
      }, opts);
      const depth = this.o.wall ? this.o.wall.z + 2 : this.o.maxZ + 8;
      const geo = buildHoneycomb({ depth });
      this.edges = geo.edges;
      this.period = geo.period;
      this.camZ = 0;
      this.camX = 0;
      this.targetX = 0;
      this.pitchOffset = 0;
      this.roll = 0;
      this.targetPitchOffset = 0;
      this.boost = 0;               // velocidad extra (scroll)
      this.ptr = { x: -9999, y: -9999, tx: -9999, ty: -9999, on: 0, target: 0 };
      this.t0 = performance.now();
      this.time = 0;
      this.running = false;
      this.buckets = 14;
      this.resize = this.resize.bind(this);
      this.frame = this.frame.bind(this);
      this.resize();
      window.addEventListener("resize", this.resize);
    }
    lightsSequence(base, perMeter, jitter) {
      this.edges.forEach(e => {
        const z = (e.z1 + e.z2) / 2;
        e.on = base + Math.max(0, z) * perMeter + e.seed * jitter;
      });
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = this.c.getBoundingClientRect();
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      this.c.width = Math.round(this.w * dpr);
      this.c.height = Math.round(this.h * dpr);
      this.dpr = dpr;
      if (this.onResize) this.onResize();
      if (!this.running) this.draw(this.time);
    }
    focal() { return Math.max(this.w, this.h * 1.1) * 0.62 * this.o.fov; }
    start() { if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(this.frame); } }
    stop() { this.running = false; }
    frame(now) {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.time = (now - this.t0) / 1000;
      if (this.onTick) this.onTick(this.time, dt);
      if (this.o.wrap) this.camZ += (this.o.speed + this.boost) * dt;
      this.boost *= Math.pow(0.04, dt);
      this.camX = lerp(this.camX, this.targetX, 1 - Math.pow(0.08, dt));
      this.pitchOffset = lerp(this.pitchOffset, this.targetPitchOffset, 1 - Math.pow(0.08, dt));
      const p = this.ptr;
      p.x = lerp(p.x, p.tx, 1 - Math.pow(0.0005, dt));
      p.y = lerp(p.y, p.ty, 1 - Math.pow(0.0005, dt));
      p.on = lerp(p.on, p.target, 1 - Math.pow(0.02, dt));
      this.draw(this.time, dt);
      requestAnimationFrame(this.frame);
    }
    setPointer(x, y) {
      const r = this.c.getBoundingClientRect();
      const nx = x - r.left, ny = y - r.top;
      if (this.ptr.target === 0 && this.ptr.on < 0.05) { this.ptr.x = nx; this.ptr.y = ny; }
      this.ptr.tx = nx; this.ptr.ty = ny; this.ptr.target = 1;
    }
    clearPointer() { this.ptr.target = 0; }
    brightness(e, t) {
      if (e.on < 0) return 1;
      const d = t - e.on;
      if (d < 0) return 0;
      if (d > 0.34) return 1;
      // parpadeo de fluorescente al encender
      const f = Math.sin(d * 70 + e.seed * 20) > 0.1 ? 1 : 0.12;
      return d < 0.06 ? 0.5 * f : f;
    }
    // proyección de un punto (x, y, zMundo) a pantalla
    project(x, y, z) {
      const f = this.focal();
      const cp = Math.cos(this.o.pitch + this.pitchOffset), sp = Math.sin(this.o.pitch + this.pitchOffset);
      const zr = z - this.camZ, xr = x - this.camX;
      const py = y * cp - zr * sp, pz = y * sp + zr * cp;
      return { x: this.w / 2 + (xr / pz) * f, y: this.h / 2 - (py / pz) * f, z: pz };
    }
    drawWall(t) {
      const { ctx, o } = this;
      const W = o.wall;
      const lit = W.lit;
      if (lit <= 0.001) return;
      const dz = W.z - this.camZ;
      const fog = clamp(1.2 - dz / 42, 0.25, 1);
      const L = lit * fog;
      const top = o.ceilingY, bot = o.floorY, half = 14;
      const a = this.project(-half, top, W.z), b = this.project(half, top, W.z);
      const c = this.project(half, bot, W.z), d = this.project(-half, bot, W.z);

      // pared blanca iluminada desde el techo
      const g = ctx.createLinearGradient(0, a.y, 0, d.y);
      g.addColorStop(0, `rgba(236,236,236,${L})`);
      g.addColorStop(0.5, `rgba(190,190,190,${L})`);
      g.addColorStop(1, `rgba(70,70,70,${L})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();

      // reflejo de la pared en el suelo pulido
      const rg = ctx.createLinearGradient(0, d.y, 0, d.y + (d.y - a.y) * 0.5);
      rg.addColorStop(0, `rgba(120,120,120,${0.22 * L})`);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(Math.min(d.x, a.x), d.y, Math.abs(c.x - d.x), (d.y - a.y) * 0.5);

      // sistema de coordenadas de la pared: 1 unidad = 1 cm, origen a la altura de los ojos
      const p0 = this.project(0, 0, W.z);
      const px = this.project(0.01, 0, W.z);
      const py = this.project(0, -0.01, W.z);
      const dpr = this.dpr;
      ctx.save();
      ctx.setTransform(dpr * (px.x - p0.x), dpr * (px.y - p0.y), dpr * (py.x - p0.x), dpr * (py.y - p0.y), dpr * p0.x, dpr * p0.y);
      const ink = `rgba(8,8,8,${L})`;
      const scale = this.c.width / this.w; // sombras en píxeles de pantalla
      const unit = Math.hypot(px.x - p0.x, px.y - p0.y);
      ctx.shadowColor = `rgba(0,0,0,${0.35 * L})`;
      ctx.shadowBlur = 6 * unit * scale;
      ctx.shadowOffsetX = 3 * unit * scale;
      ctx.shadowOffsetY = 5 * unit * scale;

      // logo en el centro (110 cm), como letras corpóreas
      ctx.save();
      ctx.translate(-60, -128);
      ctx.scale(1.2, 1.2);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 7.5;
      ctx.lineJoin = "miter";
      ctx.miterLimit = 10;
      LOGO_PATHS.forEach(p => ctx.stroke(new Path2D(p)));
      ctx.restore();

      // frase debajo
      ctx.fillStyle = ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.font = '700 15px "Jost", "Futura", "Century Gothic", sans-serif';
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0.5px";
      ctx.fillText("IF YOU CAN DREAM IT", 0, 22);
      ctx.fillText("YOU CAN DO IT", 0, 41);
      ctx.restore();
    }
    draw(t) {
      const { ctx, w, h, o } = this;
      const dpr = this.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = o.trail > 0 ? `rgba(0,0,0,${1 - o.trail})` : "#000";
      ctx.fillRect(0, 0, w, h);
      if (o.wall) this.drawWall(t);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const f = this.focal();
      const cx = w / 2;
      const cy = h / 2;
      const pitch = o.pitch + this.pitchOffset;
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const off = o.wrap ? this.camZ % this.period : this.camZ;
      const wallZ = o.wall ? o.wall.z : Infinity;
      const near = 0.12;
      const B = this.buckets;
      const maxZ = o.maxZ;
      const layers = o.reflect ? [o.ceilingY, 2 * o.floorY - o.ceilingY] : [o.ceilingY];
      const ptr = this.ptr;
      const pr = Math.max(130, Math.min(w, h) * 0.22);
      const usePtr = o.interactive && ptr.on > 0.01;
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      for (let li = 0; li < layers.length; li++) {
        const Y = layers[li];
        const layerAlpha = li === 0 ? 1 : 0.07;
        // por profundidad y por nivel de calor (0 normal, 1 templado, 2 caliente) y parpadeo
        const paths = Array.from({ length: B * 4 }, () => []);

        for (let i = 0; i < this.edges.length; i++) {
          const e = this.edges[i];
          const b = this.brightness(e, t);
          if (b <= 0) continue;
          let wz1 = e.z1, wz2 = e.z2;
          let wx1 = e.x1, wx2 = e.x2;
          if (!o.wrap) {
            if (wz1 > wallZ && wz2 > wallZ) continue;
            if (wz1 > wallZ || wz2 > wallZ) {
              const k = (wallZ - wz1) / (wz2 - wz1);
              const nx = lerp(wx1, wx2, k);
              if (wz1 > wallZ) { wx1 = nx; wz1 = wallZ; } else { wx2 = nx; wz2 = wallZ; }
            }
          }
          let za = wz1 - off, zb = wz2 - off;
          let xa = wx1 - this.camX, xb = wx2 - this.camX;
          let pya = Y * cp - za * sp, pza = Y * sp + za * cp;
          let pyb = Y * cp - zb * sp, pzb = Y * sp + zb * cp;
          if (pza < near && pzb < near) continue;
          if (pza < near || pzb < near) {
            const k = (near - pza) / (pzb - pza);
            const nx = lerp(xa, xb, k), ny = lerp(pya, pyb, k);
            if (pza < near) { xa = nx; pya = ny; pza = near; } else { xb = nx; pyb = ny; pzb = near; }
          }
          const zm = (za + zb) / 2;
          if (zm > maxZ) continue;
          let sx1 = (xa / pza) * f, sy1 = -(pya / pza) * f;
          let sx2 = (xb / pzb) * f, sy2 = -(pyb / pzb) * f;
          if (this.roll) {
            const cr = Math.cos(this.roll), sr = Math.sin(this.roll);
            [sx1, sy1] = [sx1 * cr - sy1 * sr, sx1 * sr + sy1 * cr];
            [sx2, sy2] = [sx2 * cr - sy2 * sr, sx2 * sr + sy2 * cr];
          }
          sx1 += cx; sy1 += cy; sx2 += cx; sy2 += cy;
          if ((sx1 < -60 && sx2 < -60) || (sx1 > w + 60 && sx2 > w + 60) || (sy1 < -60 && sy2 < -60) || (sy1 > h + 60 && sy2 > h + 60)) continue;
          let level = 0;
          if (b < 1) level = 3;
          else if (usePtr && li === 0) {
            const mx = (sx1 + sx2) / 2 - ptr.x, my = (sy1 + sy2) / 2 - ptr.y;
            const heat = Math.exp(-(mx * mx + my * my) / (2 * pr * pr)) * ptr.on;
            e.heat = lerp(e.heat, heat, 0.18);
          } else {
            e.heat *= 0.9;
          }
          if (level === 0 && li === 0) level = e.heat > 0.55 ? 2 : e.heat > 0.18 ? 1 : 0;
          const bucket = clamp(Math.floor((Math.max(0, zm) / maxZ) * B), 0, B - 1);
          paths[bucket * 4 + level].push(sx1, sy1, sx2, sy2);
        }

        const levelGain = [1, 1.75, 2.8, 0.35];
        for (let bk = B - 1; bk >= 0; bk--) {
          const zMid = ((bk + 0.5) / B) * maxZ;
          const fog = Math.pow(1 - bk / B, 1.6);
          const tube = clamp((0.055 * f) / Math.max(zMid, 0.6), 0.5, 9);
          const passes = [
            [tube * 9, 0.012], [tube * 5, 0.03], [tube * 2.6, 0.08], [tube * 1.5, 0.22], [tube * 0.8, 0.95],
          ];
          for (let lv = 0; lv < 4; lv++) {
            const p = paths[bk * 4 + lv];
            if (!p.length) continue;
            const gain = levelGain[lv];
            for (const [lw, a] of passes) {
              ctx.lineWidth = lv === 2 ? lw * 1.15 : lw;
              ctx.beginPath();
              for (let j = 0; j < p.length; j += 4) {
                ctx.moveTo(p[j], p[j + 1]);
                ctx.lineTo(p[j + 2], p[j + 3]);
              }
              const alpha = Math.min(1, a * gain) * fog * layerAlpha * o.intensity;
              ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
              ctx.stroke();
            }
          }
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }

  /* =========================================================
     INTRO: entrar volando por los paneles del techo
     ========================================================= */
  const body = document.body;
  const intro = document.getElementById("intro");
  const introCanvas = document.getElementById("intro-canvas");
  const flash = intro.querySelector(".intro-flash");
  let introDone = false;
  let introScene = null;

  function finishIntro(fast) {
    if (introDone) return;
    introDone = true;
    body.classList.remove("is-intro");
    body.classList.add("is-ready");
    intro.classList.add("is-leaving");
    setTimeout(() => {
      intro.classList.add("is-gone");
      if (introScene) introScene.stop();
    }, fast ? 700 : 1150);
    revealHero();
  }

  const seen = (() => { try { return sessionStorage.getItem("jac-intro") === "1"; } catch (e) { return false; } })();

  if (reduceMotion || seen) {
    intro.classList.add("is-gone");
    body.classList.remove("is-intro");
    body.classList.add("is-ready");
    introDone = true;
  } else {
    try { sessionStorage.setItem("jac-intro", "1"); } catch (e) { /* sin almacenamiento */ }
    introScene = new HexCeiling(introCanvas, { speed: 0.6, pitch: 0.22, fov: 0.95, maxZ: 64 });
    introScene.lightsSequence(0.35, 0.026, 0.4);
    const T = { lightsEnd: 2.4, accelEnd: 4.5, flash: 4.3, logo: 4.55, leave: 6.6 };
    let logoShown = false;
    introScene.onTick = (t) => {
      const o = introScene.o;
      if (t < T.lightsEnd) {
        o.speed = 0.6; o.pitch = 0.22; o.trail = 0;
      } else if (t < T.accelEnd) {
        const k = (t - T.lightsEnd) / (T.accelEnd - T.lightsEnd);
        const e = k * k * k;
        o.speed = lerp(0.6, 36, e);
        o.pitch = lerp(0.22, 0.62, easeInOutCubic(k));
        o.fov = lerp(0.95, 0.55, e);
        o.trail = lerp(0, 0.5, e);
        introScene.roll = Math.sin(k * Math.PI) * 0.06;
      } else {
        // tras el destello: el techo sigue de fondo, muy tenue
        o.speed = lerp(o.speed, 1.2, 0.06);
        o.pitch = lerp(o.pitch, 0.34, 0.05);
        o.fov = lerp(o.fov, 0.9, 0.05);
        o.trail = 0;
        introScene.roll = 0;
        o.intensity = lerp(o.intensity, 0.2, 0.14);
      }
      // destello blanco al "atravesar" el fondo
      let fl = 0;
      if (t > T.flash - 0.35 && t < T.flash) fl = (t - (T.flash - 0.35)) / 0.35;
      else if (t >= T.flash) fl = Math.max(0, 1 - (t - T.flash) / 0.7);
      flash.style.opacity = (fl * fl).toFixed(3);
      if (!logoShown && t > T.logo) { logoShown = true; intro.classList.add("show-logo"); }
      if (t > T.leave) finishIntro(false);
    };
    introScene.start();
    intro.querySelector(".intro-skip").addEventListener("click", () => finishIntro(true));
  }

  /* =========================================================
     HERO + CTA: techo ambiental interactivo
     ========================================================= */
  function mountAmbient(canvas, opts, host) {
    if (!canvas) return null;
    const scene = new HexCeiling(canvas, Object.assign({ interactive: true }, opts));
    if (reduceMotion) { scene.draw(0); return scene; }
    const io = new IntersectionObserver(([en]) => {
      if (en.isIntersecting) scene.start(); else scene.stop();
    }, { threshold: 0 });
    io.observe(canvas);
    const area = host || canvas.parentElement;
    const move = (x, y) => {
      scene.setPointer(x, y);
      const r = area.getBoundingClientRect();
      scene.targetX = ((x - r.left) / r.width - 0.5) * 1.6;
      scene.targetPitchOffset = -((y - r.top) / r.height - 0.5) * 0.12;
    };
    area.addEventListener("pointermove", e => move(e.clientX, e.clientY), { passive: true });
    area.addEventListener("pointerdown", e => move(e.clientX, e.clientY), { passive: true });
    area.addEventListener("pointerleave", () => { scene.clearPointer(); scene.targetX = 0; scene.targetPitchOffset = 0; });
    area.addEventListener("touchend", () => { scene.clearPointer(); }, { passive: true });
    return scene;
  }
  const hero = mountAmbient(document.getElementById("hero-canvas"), {
    speed: 0.55, pitch: 0.36, fov: 0.9, intensity: 0.7,
  });
  const cta = mountAmbient(document.getElementById("cta-canvas"), {
    speed: 0.35, pitch: 1.3, fov: 0.75, reflect: false, intensity: 0.6, maxZ: 40,
  });


  /* =========================================================
     LA CAPA: tela simulada (Verlet) con el logo, ondeando al viento
     ========================================================= */
  function mountCape(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const COLS = 24, ROWS = 28;
    let W = 0, H = 0, dpr = 1, pts = [], cons = [], spacing = 10, originX = 0, originY = 0;
    const logoUV = [];
    // trazos del logo en coordenadas de la tela (u, v entre 0 y 1)
    const LOGO = [
      [[27, 58], [50, 15], [73, 58]],
      [[30, 82], [18, 82], [18, 70], [24, 65], [50, 78], [76, 65], [82, 70], [82, 82], [70, 82]],
    ];
    LOGO.forEach(poly => {
      const out = [];
      for (let i = 0; i < poly.length - 1; i++) {
        const [x1, y1] = poly[i], [x2, y2] = poly[i + 1];
        const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 4));
        for (let k = 0; k < n; k++) {
          const t = k / n;
          out.push([0.5 + ((lerp(x1, x2, t) - 50) / 100) * 0.42, 0.3 + ((lerp(y1, y2, t) - 50) / 100) * 0.42]);
        }
      }
      out.push([0.5 + ((poly[poly.length - 1][0] - 50) / 100) * 0.42, 0.3 + ((poly[poly.length - 1][1] - 50) / 100) * 0.42]);
      logoUV.push(out);
    });

    function build() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const capeW = Math.min(W * 0.78, H * 0.72);
      spacing = capeW / (COLS - 1);
      originX = (W - capeW) / 2;
      originY = H * 0.1;
      pts = []; cons = [];
      for (let j = 0; j < ROWS; j++) {
        for (let i = 0; i < COLS; i++) {
          // el cuello de la capa está fruncido: la fila superior es más estrecha
          const gather = j === 0 ? 0.55 + 0.45 * Math.abs(i / (COLS - 1) - 0.5) * 0 : 1;
          const x0 = originX + capeW / 2 + (i * spacing - capeW / 2) * (j === 0 ? 0.62 : 1);
          const y0 = originY + j * spacing * 0.98;
          pts.push({ x: x0, y: y0, z: 0, px: x0, py: y0, pz: 0, pin: j === 0, ox: x0, oy: y0, g: gather });
        }
      }
      const id = (i, j) => j * COLS + i;
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
        if (i < COLS - 1) cons.push([id(i, j), id(i + 1, j), j === 0 ? spacing * 0.62 : spacing]);
        if (i < COLS - 2 && j > 0) cons.push([id(i, j), id(i + 2, j), spacing * 2 * 0.98]);
        if (j < ROWS - 1) cons.push([id(i, j), id(i, j + 1), Math.hypot(j === 0 ? (i * spacing - (COLS - 1) * spacing / 2) * 0.38 : 0, spacing * 0.98)]);
      }
    }
    build();
    window.addEventListener("resize", build);

    const mouse = { x: -1e4, y: -1e4, vx: 0, vy: 0, on: false };
    const setM = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (mouse.on) {
        // empujón único: se suma a la velocidad de los puntos cercanos
        const mvx = clamp(x - mouse.x, -40, 40), mvy = clamp(y - mouse.y, -40, 40);
        const R = Math.max(70, W * 0.12);
        for (const p of pts) {
          if (p.pin) continue;
          const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
          if (d < R) {
            const k = (1 - d / R) * 0.22;
            p.px -= mvx * k; p.py -= mvy * k; p.pz += (Math.abs(mvx) + Math.abs(mvy)) * k * 0.4;
          }
        }
      }
      mouse.x = x; mouse.y = y; mouse.on = true;
    };
    canvas.addEventListener("pointermove", setM, { passive: true });
    canvas.addEventListener("pointerdown", setM, { passive: true });
    canvas.addEventListener("pointerleave", () => { mouse.on = false; });

    let running = false, t = 0, last = 0;
    function step(dt) {
      t += dt;
      const g = 900 * dt * dt;
      const gust = 0.6 + 0.4 * Math.sin(t * 0.7) + 0.25 * Math.sin(t * 1.9 + 1.3);
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k];
        if (p.pin) {
          // el cuello también se mueve un poco, como colgado de una percha
          p.x = p.ox + Math.sin(t * 1.1) * 3; p.y = p.oy; p.z = 0;
          continue;
        }
        const i = k % COLS, j = (k / COLS) | 0;
        const vx = (p.x - p.px) * 0.97, vy = (p.y - p.py) * 0.97, vz = (p.z - p.pz) * 0.97;
        p.px = p.x; p.py = p.y; p.pz = p.z;
        // viento: ondas que recorren la tela de un lado a otro
        const wave = Math.sin(t * 2.2 + i * 0.32 + j * 0.18) + 0.6 * Math.sin(t * 3.4 - j * 0.27 + i * 0.12);
        const fx = (gust * 70 + wave * 45) * dt * dt * (j / ROWS);
        const fz = (wave * 260) * dt * dt * (j / ROWS);
        p.x += vx + fx; p.y += vy + g; p.z += vz + fz;
      }
      for (let it = 0; it < 10; it++) {
        for (let c = 0; c < cons.length; c++) {
          const [a, b, L] = cons[c];
          const p = pts[a], q = pts[b];
          const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          const diff = (d - L) / d * 0.5;
          const ox = dx * diff, oy = dy * diff, oz = dz * diff;
          if (!p.pin) { p.x += ox; p.y += oy; p.z += oz; }
          if (!q.pin) { q.x -= ox; q.y -= oy; q.z -= oz; }
        }
      }
    }
    // punto de la tela para (u, v) por interpolación bilineal
    function at(u, v) {
      const fx = u * (COLS - 1), fy = v * (ROWS - 1);
      const i = Math.min(COLS - 2, Math.floor(fx)), j = Math.min(ROWS - 2, Math.floor(fy));
      const tx = fx - i, ty = fy - j;
      const a = pts[j * COLS + i], b = pts[j * COLS + i + 1], c = pts[(j + 1) * COLS + i], d = pts[(j + 1) * COLS + i + 1];
      return {
        x: lerp(lerp(a.x, b.x, tx), lerp(c.x, d.x, tx), ty),
        y: lerp(lerp(a.y, b.y, tx), lerp(c.y, d.y, tx), ty),
      };
    }
    function render() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // percha
      const l = pts[0], r = pts[COLS - 1];
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(l.x - 30, l.y - 4); ctx.lineTo(r.x + 30, r.y - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo((l.x + r.x) / 2, l.y - 4); ctx.lineTo((l.x + r.x) / 2, l.y - 40);
      ctx.arc((l.x + r.x) / 2 + 9, l.y - 40, 9, Math.PI, Math.PI * 1.9); ctx.stroke();
      // sombra en el suelo
      const bottom = pts[pts.length - 1].y;
      const sg = ctx.createRadialGradient(W / 2, bottom + 30, 4, W / 2, bottom + 30, W * 0.4);
      sg.addColorStop(0, "rgba(255,255,255,.06)"); sg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sg; ctx.fillRect(0, bottom - 40, W, 140);
      // tela: cada celda sombreada según su orientación
      const LX = -0.35, LY = -0.55, LZ = 0.76;
      for (let j = 0; j < ROWS - 1; j++) {
        for (let i = 0; i < COLS - 1; i++) {
          const a = pts[j * COLS + i], b = pts[j * COLS + i + 1], c = pts[(j + 1) * COLS + i], d = pts[(j + 1) * COLS + i + 1];
          const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
          const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
          if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
          const diff = Math.max(0, nx * LX + ny * LY + nz * LZ);
          const spec = Math.pow(diff, 18) * 70;
          const v = Math.round(8 + diff * 30 + spec);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.lineTo(c.x, c.y); ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
      }
      // borde inferior con un leve brillo
      ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < COLS; i++) { const p = pts[(ROWS - 1) * COLS + i]; i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
      ctx.stroke();
      // logo blanco estampado
      const capeW = spacing * (COLS - 1);
      ctx.strokeStyle = "rgba(245,245,245,.95)";
      ctx.lineWidth = capeW * 0.032;
      ctx.lineJoin = "miter"; ctx.lineCap = "butt"; ctx.miterLimit = 6;
      logoUV.forEach(poly => {
        ctx.beginPath();
        poly.forEach(([u, v], k) => { const p = at(u, v); k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
        ctx.stroke();
      });
    }
    function loop(now) {
      if (!running) return;
      const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
      last = now;
      step(dt);
      render();
      requestAnimationFrame(loop);
    }
    // estado inicial asentado
    for (let k = 0; k < 120; k++) step(1 / 60);
    render();
    if (reduceMotion) return;
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting && !running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
      else if (!en.isIntersecting) running = false;
    }).observe(canvas);
  }
  mountCape(document.getElementById("cape-canvas"));

  /* =========================================================
     UI
     ========================================================= */
  function revealHero() {
    document.querySelectorAll(".hero .reveal").forEach((el, i) => {
      setTimeout(() => el.classList.add("is-in"), 450 + i * 140);
    });
  }
  if (introDone) revealHero();

  // aparición al hacer scroll
  const ro = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add("is-in"); ro.unobserve(en.target); }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  document.querySelectorAll(".reveal").forEach(el => { if (!el.closest(".hero")) ro.observe(el); });

  // scroll: nav, botón flotante, frase, marquesina y velocidad del techo
  const nav = document.getElementById("nav");
  const fab = document.querySelector(".fab");
  const heroEl = document.querySelector(".hero");
  const quote = document.querySelector(".quote");
  const marquee = document.querySelector(".marquee-track");
  let lastY = window.scrollY, vel = 0, skew = 0;
  const onScroll = () => {
    const y = window.scrollY;
    const dy = y - lastY;
    lastY = y;
    vel = clamp(vel + dy, -400, 400);
    if (hero && !reduceMotion) hero.boost = clamp(hero.boost + Math.abs(dy) * 0.05, 0, 9);
    nav.classList.toggle("is-scrolled", y > 40);
    fab.classList.toggle("is-visible", y > heroEl.offsetHeight * 0.7);
    const r = quote.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight && !reduceMotion) {
      const p = (window.innerHeight - r.top) / (window.innerHeight + r.height) - 0.5;
      quote.querySelectorAll(".qline").forEach((l, i) => {
        l.style.setProperty("--qx", `${(i % 2 ? -1 : 1) * p * 6}vw`);
      });
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (!reduceMotion) {
    (function skewLoop() {
      vel *= 0.86;
      skew = lerp(skew, clamp(vel * 0.05, -8, 8), 0.2);
      if (marquee) marquee.parentElement.style.setProperty("--skew", `${skew.toFixed(2)}deg`);
      requestAnimationFrame(skewLoop);
    })();
  }

  // menú móvil
  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    links.classList.toggle("is-open", open);
    body.style.overflow = open ? "hidden" : "";
  });
  links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
    toggle.setAttribute("aria-expanded", "false");
    links.classList.remove("is-open");
    body.style.overflow = "";
  }));

  /* ---------- Interacción de escritorio ---------- */
  if (finePointer && !reduceMotion) {
    body.classList.add("has-cursor");

    // cursor hexagonal
    const cur = document.createElement("div");
    cur.className = "cursor";
    cur.innerHTML = '<span class="cursor-ring"></span><span class="cursor-dot"></span><span class="cursor-label"></span>';
    document.body.appendChild(cur);
    const ring = cur.querySelector(".cursor-ring");
    const dot = cur.querySelector(".cursor-dot");
    const label = cur.querySelector(".cursor-label");
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    window.addEventListener("pointermove", e => {
      mx = e.clientX; my = e.clientY;
      cur.classList.add("is-on");
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
    }, { passive: true });
    document.addEventListener("pointerleave", () => cur.classList.remove("is-on"));
    (function loop() {
      rx = lerp(rx, mx, 0.18); ry = lerp(ry, my, 0.18);
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      label.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      requestAnimationFrame(loop);
    })();
    document.querySelectorAll("a, button").forEach(el => {
      el.addEventListener("pointerenter", () => {
        cur.classList.add("is-link");
        const l = el.getAttribute("data-cursor");
        if (l) { label.textContent = l; cur.classList.add("has-label"); }
      });
      el.addEventListener("pointerleave", () => cur.classList.remove("is-link", "has-label"));
    });
    document.querySelectorAll(".quote").forEach(el => {
      el.addEventListener("pointerenter", () => cur.classList.add("is-invert"));
      el.addEventListener("pointerleave", () => cur.classList.remove("is-invert"));
    });

    // botones magnéticos
    document.querySelectorAll(".btn, .service-cta, .nav-brand").forEach(el => {
      const strength = el.classList.contains("btn-lg") ? 0.32 : 0.24;
      el.addEventListener("pointermove", e => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });

    // fotos con relieve 3D y reflejo de luz
    document.querySelectorAll("[data-tilt]").forEach(el => {
      el.addEventListener("pointermove", e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty("--rx", `${(-y * 9).toFixed(2)}deg`);
        el.style.setProperty("--ry", `${(x * 11).toFixed(2)}deg`);
        el.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(1)}%`);
        el.classList.add("is-tilting");
      });
      el.addEventListener("pointerleave", () => {
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--ry", "0deg");
        el.classList.remove("is-tilting");
      });
    });

    // servicios: vista previa de foto que sigue al cursor
    const list = document.querySelector(".service-list");
    const preview = document.createElement("div");
    preview.className = "service-preview";
    preview.innerHTML = "<img alt=''>";
    document.body.appendChild(preview);
    const pimg = preview.querySelector("img");
    let px = 0, py = 0, tx = 0, ty = 0, pv = false, rot = 0;
    list.querySelectorAll(".service").forEach(s => {
      s.addEventListener("pointerenter", () => {
        const src = s.getAttribute("data-img");
        if (src && pimg.getAttribute("src") !== src) pimg.setAttribute("src", src);
        pv = true; preview.classList.add("is-on");
      });
    });
    list.addEventListener("pointerleave", () => { pv = false; preview.classList.remove("is-on"); });
    list.addEventListener("pointermove", e => { tx = e.clientX; ty = e.clientY; if (!pv) { px = tx; py = ty; } });
    (function ploop() {
      const nx = lerp(px, tx, 0.14), ny = lerp(py, ty, 0.14);
      rot = lerp(rot, clamp((nx - px) * 0.6, -12, 12), 0.2);
      px = nx; py = ny;
      preview.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%) rotate(${rot.toFixed(2)}deg)`;
      requestAnimationFrame(ploop);
    })();

    // titular del hero: las letras reaccionan al cursor
    document.querySelectorAll(".hero-title .line > span").forEach(span => {
      const nodes = Array.from(span.childNodes);
      span.textContent = "";
      nodes.forEach(n => {
        if (n.nodeType === 3) {
          n.textContent.split("").forEach(ch => {
            const c = document.createElement("span");
            c.className = "ch";
            c.textContent = ch === " " ? " " : ch;
            span.appendChild(c);
          });
        } else span.appendChild(n);
      });
    });
    const chars = Array.from(document.querySelectorAll(".hero-title .ch"));
    heroEl.addEventListener("pointermove", e => {
      chars.forEach(c => {
        const r = c.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy);
        const k = Math.max(0, 1 - d / 260);
        c.style.transform = `translate(${(-dx * k * 0.12).toFixed(1)}px, ${(-dy * k * 0.12).toFixed(1)}px)`;
        c.style.color = k > 0.05 ? `rgba(255,255,255,${(1 - k * 0.85).toFixed(2)})` : "";
        c.style.webkitTextStroke = k > 0.05 ? `${(k * 2).toFixed(2)}px #fff` : "";
      });
    });
    heroEl.addEventListener("pointerleave", () => chars.forEach(c => { c.style.transform = ""; c.style.color = ""; c.style.webkitTextStroke = ""; }));
  }

  // sillón: se dibuja al entrar en pantalla
  document.querySelectorAll(".chair").forEach(ch => {
    const io2 = new IntersectionObserver(([en]) => { if (en.isIntersecting) { ch.classList.add("is-drawn"); io2.disconnect(); } }, { threshold: 0.4 });
    io2.observe(ch);
  });

  /* ---------- Postes de barbero: giran más rápido al hacer scroll ---------- */
  const poles = Array.from(document.querySelectorAll(".pole-stripes"));
  if (poles.length && !reduceMotion) {
    let py = 0, last = performance.now(), spin = 0;
    window.addEventListener("scroll", () => { spin = Math.min(spin + 6, 220); }, { passive: true });
    (function poleLoop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      spin *= Math.pow(0.08, dt);
      py += (26 + spin) * dt;
      poles.forEach(p => p.style.setProperty("--pole-y", `${py.toFixed(2)}px`));
      requestAnimationFrame(poleLoop);
    })(last);
  }

  /* ---------- Reserva integrada (Yeasy dentro de la web) ---------- */
  const book = document.getElementById("book");
  const frame = book.querySelector("iframe");
  const bookBody = book.querySelector(".book-body");
  let lastFocus = null;
  const openBook = () => {
    lastFocus = document.activeElement;
    if (!frame.getAttribute("src")) {
      frame.addEventListener("load", () => bookBody.classList.add("is-loaded"), { once: true });
      frame.setAttribute("src", frame.dataset.src);
    }
    book.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => book.classList.add("is-open")));
    body.style.overflow = "hidden";
    book.querySelector(".book-close").focus({ preventScroll: true });
  };
  const closeBook = () => {
    book.classList.remove("is-open");
    body.style.overflow = "";
    setTimeout(() => { book.hidden = true; }, 700);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  };
  document.querySelectorAll(".js-book").forEach(a => a.addEventListener("click", e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // dejar abrir en pestaña nueva
    e.preventDefault();
    openBook();
  }));
  book.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", closeBook));
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !book.hidden) closeBook(); });

  document.getElementById("year").textContent = new Date().getFullYear();
})();
