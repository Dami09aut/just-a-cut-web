/* =========================================================
   JUST A CUT · Techo hexagonal en 3D (canvas 2D, sin librerías)
   ========================================================= */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // bucle de animación que se duerme solo cuando no hay nada que mover
  const idleLoop = step => { let on = false; const f = now => { if (step(now)) requestAnimationFrame(f); else on = false; }; return () => { if (!on) { on = true; requestAnimationFrame(f); } }; };
  const LOW_END = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  if (LOW_END) document.documentElement.classList.add("low-end");
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
      const dpr = Math.min(window.devicePixelRatio || 1, LOW_END ? 1 : 1.35);
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


  // posición del logo en la capa (centro u, centro v, tamaño en alto) y su trazado dentro de la textura
  const LOGO_TEX = [10.24 * 1.2, -0.1 * 1024, -0.085 * 1024 + 40];
  const capeLogoRect = aspect => aspect > 1.1 ? [0.72, 0.5, 0.36] : [0.5, 0.26, 0.24];

  /* =========================================================
     LA CAPA: bandera gigante de fondo (WebGL, tela iluminada)
     ========================================================= */
  function mountFlag(canvas) {
    if (!canvas) return false;
    const gl = canvas.getContext("webgl", { antialias: true, alpha: false, premultipliedAlpha: false });
    if (!gl) return false;
    const section = canvas.closest("section");

    const VS = `
      precision highp float;
      attribute vec2 aUv;
      uniform mat4 uMvp;
      uniform float uT, uAspect;
      uniform vec4 uG0, uG1, uG2; // x, y, fuerza, edad
      varying vec3 vPos; varying vec3 vN; varying vec2 vUv; varying float vZ;
      float gust(vec4 g, vec2 uv) {
        vec2 d = (uv - g.xy) * vec2(uAspect, 1.0);
        float r = length(d);
        float k = g.z * exp(-g.w * 1.6);
        return k * exp(-r * 3.2) * sin(r * 16.0 - g.w * 7.0);
      }
      float disp(vec2 uv) {
        float t = uT * 0.62; // ondeo suave
        float a = 0.55 + 0.45 * smoothstep(-0.1, 1.0, uv.x);
        float z = 0.0;
        // pliegues grandes y lentos que atraviesan toda la tela (también el logo)
        z += 0.170 * sin(4.6 * uv.x - 1.25 * t + 1.9 * uv.y);
        z += 0.095 * sin(7.8 * (uv.x - 0.45 * uv.y) - 1.6 * t + 1.1);
        z += 0.060 * sin(11.5 * uv.x + 4.0 * uv.y - 2.1 * t + 2.4);
        z += 0.022 * sin(19.0 * uv.x - 2.9 * t - 3.0 * uv.y);
        z += 0.050 * sin(3.1 * uv.y - 0.7 * t + 3.0 * uv.x);
        z *= a * 1.7;
        z += gust(uG0, uv) + gust(uG1, uv) + gust(uG2, uv);
        return z;
      }
      vec3 surf(vec2 uv) {
        float h = 2.5, w = h * uAspect * 1.06;
        float z = disp(uv);
        // la tela se recoge un poco donde se pliega
        return vec3((uv.x - 0.5) * w - 0.05 * z, (uv.y - 0.5) * h + 0.03 * z, z);
      }
      void main() {
        vec3 p = surf(aUv);
        float e = 0.0025;
        vec3 px = surf(aUv + vec2(e, 0.0)) - surf(aUv - vec2(e, 0.0));
        vec3 py = surf(aUv + vec2(0.0, e)) - surf(aUv - vec2(0.0, e));
        vN = normalize(cross(px, py));
        vPos = p; vUv = aUv; vZ = p.z;
        gl_Position = uMvp * vec4(p, 1.0);
      }`;
    const FS = `
      #extension GL_OES_standard_derivatives : enable
      precision highp float;
      uniform sampler2D uLogo;
      uniform vec4 uLogoRect; // centro u, centro v, tamaño (en alto), aspecto
      uniform vec3 uCam;
      uniform vec2 uWeave;    // hilos a lo ancho y a lo alto
      varying vec3 vPos; varying vec3 vN; varying vec2 vUv; varying float vZ;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec3 N = normalize(vN);
        vec3 V = normalize(uCam - vPos);
        if (dot(N, V) < 0.0) N = -N;

        // tejido: urdimbre y trama entrelazadas (tafetán), con hilos irregulares
        vec2 w = vUv * uWeave;
        vec2 cell = floor(w), f = fract(w);
        float over = mod(cell.x + cell.y, 2.0);           // qué hilo pasa por encima
        float thx = sin(f.y * 3.14159), thy = sin(f.x * 3.14159);
        float thread = mix(thx, thy, over);               // perfil redondeado del hilo
        float slub = noise(cell * vec2(0.07, 1.0)) * 0.5 + noise(cell * vec2(1.0, 0.07)) * 0.5;
        // se desvanece si los hilos son más finos que un píxel (evita moiré)
        float aa = 1.0 - smoothstep(0.35, 0.7, max(fwidth(w.x), fwidth(w.y)));
        // el hilo inclina la normal (micro relieve)
        vec2 tilt = mix(vec2(0.0, cos(f.y * 3.14159)), vec2(cos(f.x * 3.14159), 0.0), over) * 0.55 * aa;
        vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N)), B = cross(N, T);
        vec3 Nw = normalize(N + T * tilt.x + B * tilt.y);

        // logo estampado (se deforma con la tela porque vive en sus coordenadas)
        vec2 lp = clamp((vUv - uLogoRect.xy) * vec2(uLogoRect.w, 1.0) / uLogoRect.z + 0.5, 0.0, 1.0);
        float logo = texture2D(uLogo, vec2(lp.x, 1.0 - lp.y)).r;
        // la tinta se mete entre los hilos: borde algo roto y textura visible
        logo *= mix(1.0, 0.82 + 0.18 * thread, aa);
        logo = smoothstep(0.08, 0.9, logo);

        float fabric = 0.010 * (0.75 + 0.35 * thread * aa + 0.25 * (slub - 0.5));
        vec3 base = vec3(mix(fabric, 0.62, logo));

        vec3 L1 = normalize(vec3(-0.6, 0.55, 0.58));   // clave rasante desde arriba a la izquierda
        vec3 L2 = normalize(vec3(0.9, -0.1, 0.42));    // contra suave
        float d1 = max(dot(Nw, L1), 0.0), d2 = max(dot(Nw, L2), 0.0);
        vec3 col = base * (0.035 + 1.55 * d1 + 0.4 * d2);
        // brillo apagado de la tela: ancho y tenue, mayor en la cresta de los hilos
        vec3 H1 = normalize(L1 + V), H2 = normalize(L2 + V);
        float s1 = pow(max(dot(Nw, H1), 0.0), 22.0), s2 = pow(max(dot(Nw, H2), 0.0), 34.0);
        float sheen = mix(1.0, 0.35, logo) * (0.7 + 0.6 * thread * aa);
        col += vec3(0.055 * s1 + 0.03 * s2) * sheen;
        // sombra en el fondo de los pliegues
        col *= mix(0.25, 1.0, smoothstep(-0.34, 0.25, vZ));
        col = 1.0 - exp(-col * 1.15);
        col = pow(col, vec3(1.0 / 2.2));
        gl_FragColor = vec4(vec3(dot(col, vec3(0.333))), 1.0);
      }`;
    function sh(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    const hasDeriv = !!gl.getExtension("OES_standard_derivatives");
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, hasDeriv ? FS : FS.replace("#extension GL_OES_standard_derivatives : enable", "").replace(/max\(fwidth\(w\.x\), fwidth\(w\.y\)\)/, "1.0"));
    if (!vs || !fs) return false;
    const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);

    // malla
    const NX = 220, NY = 130;
    const uv = new Float32Array((NX + 1) * (NY + 1) * 2);
    for (let j = 0, k = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { uv[k++] = i / NX; uv[k++] = j / NY; }
    const idx = new Uint32Array(NX * NY * 6);
    for (let j = 0, k = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
    const ext = gl.getExtension("OES_element_index_uint");
    const idxData = ext ? idx : new Uint16Array(idx);
    if (!ext && uv.length / 2 > 65535) return false;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    const aUv = gl.getAttribLocation(prog, "aUv"); gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxData, gl.STATIC_DRAW);

    // textura del logo
    const lc = document.createElement("canvas"); lc.width = lc.height = 1024;
    const lx = lc.getContext("2d");
    lx.fillStyle = "#000"; lx.fillRect(0, 0, 1024, 1024);
    lx.setTransform(LOGO_TEX[0], 0, 0, LOGO_TEX[0], LOGO_TEX[1], LOGO_TEX[2]);
    lx.strokeStyle = "#fff"; lx.lineWidth = 7.5; lx.lineJoin = "miter"; lx.miterLimit = 10;
    LOGO_PATHS.forEach(p => lx.stroke(new Path2D(p)));
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lc);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const U = n => gl.getUniformLocation(prog, n);
    const uMvp = U("uMvp"), uT = U("uT"), uAspect = U("uAspect"), uCam = U("uCam"), uLogoRect = U("uLogoRect"), uWeave = U("uWeave");
    const uG = [U("uG0"), U("uG1"), U("uG2")];
    gl.uniform1i(U("uLogo"), 0);
    gl.enable(gl.DEPTH_TEST);

    function persp(fov, asp, n, f) {
      const t = 1 / Math.tan(fov / 2);
      return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
    }
    function mul(a, b) {
      const r = new Array(16);
      for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) {
        let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + rr] * b[c * 4 + k]; r[c * 4 + rr] = s;
      }
      return r;
    }
    const CAMZ = 3.0;
    let W = 1, H = 1, aspect = 1;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, LOW_END ? 1 : 1.5);
      W = canvas.clientWidth; H = canvas.clientHeight; aspect = W / Math.max(1, H);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      const fov = 2 * Math.atan(1.12 / CAMZ);
      const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -CAMZ, 0 + 1];
      gl.uniformMatrix4fv(uMvp, false, new Float32Array(mul(persp(fov, aspect, 0.1, 20), view)));
      gl.uniform3f(uCam, 0, 0, CAMZ);
      gl.uniform1f(uAspect, aspect * 1.06);
      // hilos de ~4 px en pantalla
      gl.uniform2f(uWeave, W * 1.15 / 4.2, H * 1.12 / 4.2);
      // el logo va a la derecha en pantallas anchas; abajo en móvil
      const lr = capeLogoRect(aspect);
      gl.uniform4f(uLogoRect, lr[0], lr[1], lr[2], aspect * 1.06);
    }

    const gusts = [[0, 0, 0, 9], [0, 0, 0, 9], [0, 0, 0, 9]];
    let gi = 0, lastG = 0, lastPx = null;
    section.addEventListener("pointermove", e => {
      const r = canvas.getBoundingClientRect();
      const u = (e.clientX - r.left) / r.width, v = 1 - (e.clientY - r.top) / r.height;
      const now = performance.now();
      const sp = lastPx ? Math.hypot(e.clientX - lastPx[0], e.clientY - lastPx[1]) : 0;
      lastPx = [e.clientX, e.clientY];
      if (now - lastG > 140 && sp > 2) {
        lastG = now; gi = (gi + 1) % 3;
        gusts[gi] = [u, v, Math.min(0.09, 0.025 + sp * 0.0012), 0];
      }
    });

    let t = 0, wind = 1, last = performance.now(), running = false;
    window.addEventListener("scroll", () => { wind = Math.min(wind + 0.08, 2.2); }, { passive: true });
    function draw(dt) {
      wind = lerp(wind, 1, 1 - Math.pow(0.4, dt));
      t += dt * wind;
      gusts.forEach(g => { g[3] += dt; });
      gl.uniform1f(uT, t);
      gusts.forEach((g, i) => gl.uniform4f(uG[i], g[0], g[1], g[2], g[3]));
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, idx.length, ext ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    }
    function loop(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      draw(dt);
      requestAnimationFrame(loop);
    }
    resize(); t = 2.0; draw(0);
    window.addEventListener("resize", () => { resize(); draw(0); });
    if (reduceMotion) return true;
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting && !running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
      else if (!en.isIntersecting) running = false;
    }).observe(canvas);
    return true;
  }
  if (!mountFlag(document.getElementById("cape-canvas"))) document.querySelector(".cape-sec")?.classList.add("no-gl");

  /* =========================================================
     LA CAPA CON PELO: la máquina corta por donde pasa (el logo no se corta)
     ========================================================= */
  (function mountHair() {
    const sec = document.querySelector(".cape-sec");
    const hairCanvas = document.getElementById("hair-canvas");
    if (!sec || !hairCanvas) return;
    const fall = document.getElementById("hair-fall");
    const hctx = hairCanvas.getContext("2d"), fctx = fall.getContext("2d");
    const meter = sec.querySelector(".hair-meter-val"), meterBar = sec.querySelector(".hair-meter-bar i");
    const done = sec.querySelector(".hair-done");
    const clipper = document.querySelector(".clipper");
    let W = 0, H = 0, dpr = 1, strands = [], grid = new Map(), cutCount = 0, total = 1, finished = false;
    const CELL = 24;
    let R = 22; // radio de la cuchilla

    function logoMask() {
      // máscara del logo en coordenadas de pantalla, con margen para el ondeo de la tela
      const m = document.createElement("canvas"); m.width = W; m.height = H;
      const c = m.getContext("2d");
      const asp = W / H, [u, v, size] = capeLogoRect(asp);
      const side = size * 2.5 / 2.24 * H;
      const cx = (0.5 + (u - 0.5) * (2.5 * asp * 1.06) / (2.24 * asp)) * W;
      const cy = (0.5 - (v - 0.5) * 2.5 / 2.24) * H;
      const k = side / 1024;
      c.setTransform(k * LOGO_TEX[0], 0, 0, k * LOGO_TEX[0], cx - side / 2 + k * LOGO_TEX[1], cy - side / 2 + k * LOGO_TEX[2]);
      // halo amplio y difuminado: el pelo se va aclarando antes de llegar al logo y nunca lo pisa
      c.strokeStyle = "#fff"; c.lineJoin = "round"; c.lineCap = "round";
      c.filter = `blur(${Math.round(side * 0.035)}px)`;
      c.lineWidth = 7.5 + 70; LOGO_PATHS.forEach(p => c.stroke(new Path2D(p)));
      c.filter = "none";
      c.lineWidth = 7.5 + 40; LOGO_PATHS.forEach(p => c.stroke(new Path2D(p)));
      const data = c.getImageData(0, 0, W, H).data;
      return (x, y) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return 0; return data[(y * W + x) * 4 + 3] / 255; };
    }

    function flow(x, y) {
      // remolinos suaves, como pelo recién caído sobre la capa
      return Math.sin(x * 0.006 + Math.cos(y * 0.008) * 1.7) * 1.4 + Math.cos(y * 0.005 - x * 0.002) * 0.9 + 1.2;
    }

    function build() {
      dpr = Math.min(window.devicePixelRatio || 1, LOW_END ? 1 : 1.5);
      W = sec.clientWidth; H = sec.clientHeight;
      [hairCanvas, fall].forEach(c => { c.width = W * dpr; c.height = H * dpr; });
      hctx.setTransform(dpr, 0, 0, dpr, 0, 0); fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = W < 700 ? 26 : 22;
      const onLogo = logoMask();
      strands = []; grid = new Map(); cutCount = 0; finished = false;
      // mechones: grupos de pelos con la misma caída, como pelo recién cortado sobre la capa
      const add = (x, y, a, len, w, tone) => {
        const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
        const lim = Math.random() * 0.85;
        if (onLogo(x, y) > lim || onLogo(ex, ey) > lim || onLogo((x + ex) / 2, (y + ey) / 2) > lim) return;
        const bend = (Math.random() - 0.5) * len * 0.45;
        const st = { x, y, ex, ey, cx: (x + ex) / 2 - Math.sin(a) * bend, cy: (y + ey) / 2 + Math.cos(a) * bend, a, len,
          tone, col: TONE_COL[tone], w, cut: false };
        strands.push(st);
        const key = (((x + ex) / 2 / CELL) | 0) + "," + (((y + ey) / 2 / CELL) | 0);
        (grid.get(key) || grid.set(key, []).get(key)).push(st);
      };
      const pickTone = () => { const r = Math.random(); return r < 0.06 ? 4 : r < 0.26 ? 3 : r < 0.52 ? 2 : r < 0.78 ? 1 : 0; };
      // reparto en rejilla con desorden: cubre toda la capa sin huecos
      const STEP = W < 700 ? 16 : LOW_END ? 17 : 14;
      for (let gy = -STEP; gy < H + STEP; gy += STEP) for (let gx = -STEP; gx < W + STEP; gx += STEP) {
        const x0 = gx + Math.random() * STEP, y0 = gy + Math.random() * STEP;
        const base = flow(x0, y0) + (Math.random() - 0.5) * 0.7, tone = pickTone();
        const k = 2 + (Math.random() * 4 | 0), L = 20 + Math.random() * 22;
        for (let j = 0; j < k; j++) {
          const t = Math.min(4, Math.max(0, tone + (Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0)));
          // el pelo empieza detrás del punto para que el mechón quede centrado
          const len = L * (0.6 + Math.random() * 0.6), aa = base + (Math.random() - 0.5) * 0.3;
          add(x0 + (Math.random() - 0.5) * 8 - Math.cos(aa) * len / 2, y0 + (Math.random() - 0.5) * 8 - Math.sin(aa) * len / 2,
            aa, len, 0.45 + Math.random() * 0.55, t);
        }
        if (Math.random() < 0.35) add(x0 + Math.random() * STEP, y0 + Math.random() * STEP, Math.random() * 6.28, 4 + Math.random() * 7, 0.5, pickTone());
      }
      total = strands.length || 1;
      drawAll();
      updateMeter();
      sec.classList.remove("hair-finished");
    }

    function drawAll() {
      // todo el pelo en pocas pasadas: sombra, 5 tonos y un brillo fino
      hctx.clearRect(0, 0, W, H);
      hctx.lineCap = "round";
      const shadow = new Path2D(), shine = new Path2D(), tones = TONES.map(() => [new Path2D(), new Path2D()]);
      for (const s of strands) {
        shadow.moveTo(s.x + 0.9, s.y + 1.3); shadow.quadraticCurveTo(s.cx + 0.9, s.cy + 1.3, s.ex + 0.9, s.ey + 1.3);
        const t = tones[s.tone][s.w > 0.75 ? 1 : 0]; t.moveTo(s.x, s.y); t.quadraticCurveTo(s.cx, s.cy, s.ex, s.ey);
        if (s.tone >= 2 && s.len > 9) { // brillo en el tramo central del pelo
          const mx = (s.x + 2 * s.cx + s.ex) / 4, my = (s.y + 2 * s.cy + s.ey) / 4, h = s.len * 0.18;
          shine.moveTo(mx - Math.cos(s.a) * h - 0.3, my - Math.sin(s.a) * h - 0.3); shine.lineTo(mx + Math.cos(s.a) * h - 0.3, my + Math.sin(s.a) * h - 0.3);
        }
      }
      hctx.strokeStyle = "rgba(0,0,0,.6)"; hctx.lineWidth = 1.8; hctx.stroke(shadow);
      TONES.forEach((c, i) => { hctx.strokeStyle = c; hctx.lineWidth = 0.6; hctx.stroke(tones[i][0]); hctx.lineWidth = 0.95; hctx.stroke(tones[i][1]); });
      hctx.strokeStyle = "rgba(255,255,255,.35)"; hctx.lineWidth = 0.45; hctx.stroke(shine);
    }
    const TONES = ["rgba(70,70,70,.92)", "rgba(96,96,96,.92)", "rgba(124,124,124,.92)", "rgba(156,156,156,.9)", "rgba(210,210,210,.78)"];
    const TONE_COL = [70, 96, 124, 156, 210];

    const falling = [];
    function cutAt(x0, y0, x1, y1) {
      // la cuchilla barre el pelo entre la posición anterior y la actual
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
            s.cut = true; cutCount++; n++;
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
      const p = Math.min(100, Math.round(cutCount / total * 100 / 0.9));
      if (meter) meter.textContent = p + "%";
      if (meterBar) meterBar.style.transform = `scaleX(${p / 100})`;
      if (p >= 100 && !finished) { finished = true; sec.classList.add("hair-finished"); }
    }

    let fallRunning = false;
    function fallLoop() {
      fctx.clearRect(0, 0, W, H);
      fctx.lineCap = "round";
      for (let i = falling.length - 1; i >= 0; i--) {
        const f = falling[i];
        f.vy += 0.16; f.vx *= 0.985; f.x += f.vx; f.y += f.vy; f.a += f.va; f.life -= 0.012;
        if (f.life <= 0 || f.y > H + 20) { falling.splice(i, 1); continue; }
        const hx = Math.cos(f.a) * f.len / 2, hy = Math.sin(f.a) * f.len / 2;
        fctx.strokeStyle = `rgba(${f.col},${f.col},${f.col},${Math.min(1, f.life * 1.4)})`;
        fctx.lineWidth = f.w;
        fctx.beginPath(); fctx.moveTo(f.x - hx, f.y - hy); fctx.lineTo(f.x + hx, f.y + hy); fctx.stroke();
      }
      if (falling.length) requestAnimationFrame(fallLoop); else { fallRunning = false; fctx.clearRect(0, 0, W, H); }
    }

    // la máquina sigue al cursor (o al dedo) dentro de la sección
    let last = null, buzzT, clipOn = false;
    const setClip = on => { if (on === clipOn) return; clipOn = on; sec.classList.toggle("is-clipping", on); document.documentElement.classList.toggle("is-clipping-on", on); };
    sec.addEventListener("pointermove", e => {
      if (!built) return;
      if (e.target.closest("a, button")) { last = null; setClip(false); return; }
      const r = sec.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      setClip(true);
      if (clipper) {
        clipper.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
        clipper.classList.add("is-buzz"); clearTimeout(buzzT); buzzT = setTimeout(() => clipper.classList.remove("is-buzz"), 120);
      }
      if (last) cutAt(last[0], last[1], x, y); else cutAt(x, y, x, y);
      last = [x, y];
    });
    sec.addEventListener("pointerleave", () => { last = null; setClip(false); });
    sec.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse") last = null; });
    sec.querySelector(".hair-reset")?.addEventListener("click", e => { e.preventDefault(); build(); });

    let rT;
    let built = false;
    window.addEventListener("resize", () => { if (!built) return; clearTimeout(rT); rT = setTimeout(() => { if (Math.abs(sec.clientWidth - W) > 40 || Math.abs(sec.clientHeight - H) > 120) build(); }, 250); });
    // se prepara justo antes de llegar a la sección, no al cargar la página
    new IntersectionObserver((en, o) => { if (en[0].isIntersecting) { o.disconnect(); built = true; build(); } }, { rootMargin: "600px 0px" }).observe(sec);
  })();

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
    const kickSkew = idleLoop(() => {
      vel *= 0.86;
      skew = lerp(skew, clamp(vel * 0.05, -8, 8), 0.2);
      if (marquee) marquee.parentElement.style.setProperty("--skew", `${skew.toFixed(2)}deg`);
      return Math.abs(vel) > 0.05 || Math.abs(skew) > 0.01;
    });
    window.addEventListener("scroll", kickSkew, { passive: true });
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

  // scroll suave con easing entre secciones, compensando la cabecera fija
  {
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    let anim = 0;
    const stop = () => cancelAnimationFrame(anim);
    document.addEventListener("click", e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      const el = document.getElementById(id.slice(1));
      if (!el) return;
      e.preventDefault();
      const nav = document.getElementById("nav");
      const off = id === "#inicio" ? 0 : (nav ? nav.offsetHeight : 0);
      const start = window.scrollY;
      const end = Math.max(0, el.getBoundingClientRect().top + start - off);
      const dist = end - start;
      if (reduceMotion || Math.abs(dist) < 2) { window.scrollTo(0, end); return; }
      const dur = Math.min(1600, Math.max(700, Math.abs(dist) * .35));
      const root = document.documentElement;
      root.style.scrollBehavior = "auto";
      stop();
      const t0 = performance.now();
      const step = now => {
        const p = Math.min(1, (now - t0) / dur);
        window.scrollTo(0, start + dist * ease(p));
        if (p < 1) anim = requestAnimationFrame(step);
        else { root.style.scrollBehavior = ""; history.replaceState(null, "", id); }
      };
      anim = requestAnimationFrame(step);
    });
    ["wheel", "touchstart", "keydown"].forEach(ev => window.addEventListener(ev, () => { stop(); document.documentElement.style.scrollBehavior = ""; }, { passive: true }));
  }

  /* ---------- Interacción de escritorio ---------- */
  if (finePointer && !reduceMotion) {
    body.classList.add("has-cursor");

    // cursor de tijeras: cortan al hacer clic
    const cur = document.createElement("div");
    cur.className = "cursor";
    cur.innerHTML = `
      <svg class="scissors" viewBox="0 0 48 48" width="46" height="46" aria-hidden="true">
        <g class="blade blade-a">
          <path d="M19 19 L4.2 2.6 Q2.6 1.8 2.9 3.6 L16.6 20.4 Z" fill="#fff"/>
          <path d="M19 19 L31.5 26.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
          <circle cx="35.5" cy="29" r="4.8" fill="none" stroke="#fff" stroke-width="2.4"/>
        </g>
        <g class="blade blade-b">
          <path d="M19 19 L2.6 4.2 Q1.8 2.6 3.6 2.9 L20.4 16.6 Z" fill="#fff"/>
          <path d="M19 19 L26.5 31.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
          <circle cx="29" cy="35.5" r="4.8" fill="none" stroke="#fff" stroke-width="2.4"/>
        </g>
        <circle cx="19" cy="19" r="1.7" fill="#000" stroke="#fff" stroke-width="1"/>
      </svg>
      <span class="cursor-label"></span>`;
    document.body.appendChild(cur);
    const sc = cur.querySelector(".scissors");
    const label = cur.querySelector(".cursor-label");
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    const kickCur = idleLoop(() => {
      rx = lerp(rx, mx, 0.45); ry = lerp(ry, my, 0.45);
      // la punta de las tijeras es el punto exacto del ratón
      sc.style.transform = `translate3d(${rx - 3}px, ${ry - 3}px, 0)`;
      label.style.transform = `translate3d(${rx + 30}px, ${ry + 34}px, 0)`;
      return Math.abs(rx - mx) + Math.abs(ry - my) > 0.3;
    });
    window.addEventListener("pointermove", e => {
      mx = e.clientX; my = e.clientY;
      cur.classList.add("is-on");
      kickCur();
    }, { passive: true });
    document.addEventListener("pointerleave", () => cur.classList.remove("is-on"));

    window.addEventListener("pointerdown", e => {
      if (e.pointerType !== "mouse") return;
      cur.classList.remove("is-snip");
      void cur.offsetWidth;
      cur.classList.add("is-snip");
      // pelitos cortados que caen
      for (let i = 0; i < 5; i++) {
        const h = document.createElement("i");
        h.className = "snip-hair";
        h.style.left = `${e.clientX + (Math.random() * 14 - 7)}px`;
        h.style.top = `${e.clientY + (Math.random() * 8 - 2)}px`;
        h.style.setProperty("--dx", `${(Math.random() * 50 - 25).toFixed(0)}px`);
        h.style.setProperty("--r", `${(Math.random() * 300 - 150).toFixed(0)}deg`);
        h.style.setProperty("--len", `${(6 + Math.random() * 8).toFixed(0)}px`);
        h.style.animationDelay = `${(i * 30)}ms`;
        document.body.appendChild(h);
        setTimeout(() => h.remove(), 1300);
      }
    });
    cur.addEventListener("animationend", () => cur.classList.remove("is-snip"));
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
    const kickPrev = idleLoop(() => {
      const nx = lerp(px, tx, 0.14), ny = lerp(py, ty, 0.14);
      rot = lerp(rot, clamp((nx - px) * 0.6, -12, 12), 0.2);
      px = nx; py = ny;
      preview.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%) rotate(${rot.toFixed(2)}deg)`;
      return Math.abs(px - tx) + Math.abs(py - ty) + Math.abs(rot) > 0.2;
    });
    list.addEventListener("pointermove", e => { tx = e.clientX; ty = e.clientY; if (!pv) { px = tx; py = ty; } kickPrev(); });

    // logo neón: brilla más cuando el cursor se acerca
    const neon = document.querySelector(".hero-sign");
    if (neon) {
      const svg = neon.querySelector(".sign-mono");
      heroEl.addEventListener("pointermove", e => {
        const r = svg.getBoundingClientRect();
        const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        neon.style.setProperty("--glow", Math.max(0, 1 - d / 420).toFixed(2));
      });
      heroEl.addEventListener("pointerleave", () => neon.style.setProperty("--glow", "0"));
    }
  }

  // sillón: se dibuja al entrar en pantalla
  document.querySelectorAll(".chair").forEach(ch => {
    const io2 = new IntersectionObserver(([en]) => { if (en.isIntersecting) { ch.classList.add("is-drawn"); io2.disconnect(); } }, { threshold: 0.4 });
    io2.observe(ch);
  });

  /* ---------- Postes de barbero: giran más rápido al hacer scroll ---------- */
  const rail = document.querySelector(".pole-rail");
  if (rail) {
    const setP = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      rail.style.setProperty("--p", max > 0 ? (scrollY / max).toFixed(4) : "0");
    };
    setP(); window.addEventListener("scroll", setP, { passive: true }); window.addEventListener("resize", setP);
  }
  const poles = Array.from(document.querySelectorAll(".pole-stripes"));
  if (poles.length && !reduceMotion) {
    let py = 0, last = performance.now(), spin = 0;
    window.addEventListener("scroll", () => { spin = Math.min(spin + 6, 220); }, { passive: true });
    // solo se actualizan los postes que se ven, a ~30 fps
    const seen = new Set();
    const pio = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? seen.add(e.target) : seen.delete(e.target)));
    poles.forEach(p => pio.observe(p));
    let acc = 0;
    (function poleLoop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      spin *= Math.pow(0.08, dt);
      py += (26 + spin) * dt;
      acc += dt;
      if (acc > 0.033) { acc = 0; const v = `${py.toFixed(1)}px`; seen.forEach(p => p.style.setProperty("--pole-y", v)); }
      requestAnimationFrame(poleLoop);
    })(last);
  }

  /* ---------- Reserva: Yeasy no deja incrustarse, así que se abre en pestaña nueva ---------- */
  const toast = document.createElement("div");
  toast.className = "book-toast";
  toast.setAttribute("role", "status");
  toast.innerHTML = '<img src="assets/logo.svg" alt="" width="22" height="22"><span>Abriendo la reserva online…</span>';
  document.body.appendChild(toast);
  let toastT;
  document.querySelectorAll(".js-book").forEach(a => {
    a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener");
    a.addEventListener("click", () => {
      toast.classList.add("is-on"); clearTimeout(toastT);
      toastT = setTimeout(() => toast.classList.remove("is-on"), 2200);
    });
  });

  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------- Horario: abierto ahora / cerrado (hora de Canarias) ---------- */
  (function openStatus() {
    // 0 = domingo … 6 = sábado; tramos en minutos desde medianoche
    const H = {
      0: [],
      1: [[600, 840], [960, 1200]],
      2: [[600, 900]],
      3: [[600, 840], [960, 1200]],
      4: [[660, 1080]],
      5: [[600, 1080]],
      6: [[570, 840]],
    };
    const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const fmt = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    function now() {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Atlantic/Canary", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      const get = t => parts.find(p => p.type === t).value;
      const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
      return { day, min: +get("hour") * 60 + +get("minute") };
    }
    function update() {
      const { day, min } = now();
      const slot = H[day].find(([a, b]) => min >= a && min < b);
      let text, open = !!slot;
      if (slot) {
        text = `<strong>Abierto ahora</strong> · cierra a las ${fmt(slot[1])}`;
      } else {
        const later = H[day].find(([a]) => a > min);
        if (later) text = `<strong>Cerrado</strong> · abre hoy a las ${fmt(later[0])}`;
        else {
          for (let i = 1; i <= 7; i++) {
            const d = (day + i) % 7;
            if (H[d].length) { text = `<strong>Cerrado</strong> · abre ${i === 1 ? "mañana" : "el " + DAYS[d]} a las ${fmt(H[d][0][0])}`; break; }
          }
        }
      }
      document.querySelectorAll("[data-open-status]").forEach(el => {
        el.classList.toggle("is-open", open);
        el.classList.toggle("is-closed", !open);
        el.querySelector(".open-text").innerHTML = text;
      });
      document.querySelectorAll(".hours-row").forEach(r => r.classList.toggle("is-today", +r.dataset.day === day));
    }
    update();
    setInterval(update, 30000);
  })();

  /* ---------- Galería: foco de color ---------- */
  (function shots() {
    const wraps = document.querySelectorAll(".shots");
    wraps.forEach(wrap => {
    wrap.addEventListener("pointermove", e => {
      const el = e.target.closest(".shot"); if (!el || e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--x", `${e.clientX - r.left}px`);
      el.style.setProperty("--y", `${e.clientY - r.top}px`);
    });
    wrap.addEventListener("pointerover", e => { const el = e.target.closest(".shot"); if (el) el.setAttribute("data-cursor", "Ver"); });
    // en móvil la foto que está en el centro de la pantalla se ilumina a color
    if (window.matchMedia("(hover: none)").matches) {
      const io = new IntersectionObserver(es => es.forEach(en => en.target.classList.toggle("is-lit", en.isIntersecting)), { rootMargin: "-35% 0px -35% 0px" });
      wrap.querySelectorAll(".shot").forEach(el => io.observe(el));
    }
    });
    const more = document.querySelector(".shots-more");
    if (more) more.addEventListener("click", () => document.querySelector(".shots:not(.shots-row)").classList.add("show-all"));
  })();
})();
