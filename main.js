/* =========================================================
   JUST A CUT · Techo hexagonal en 3D (canvas 2D, sin librerías)
   ========================================================= */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInCubic = t => t * t * t;
  const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* ---------- Geometría: panal de tubos LED en el plano del techo ---------- */
  function buildHoneycomb({ R = 1.15, halfWidth = 8, depth = 70 }) {
    const edges = [];
    const seen = new Set();
    const w = Math.sqrt(3) * R;
    const rowH = 1.5 * R;
    const rows = Math.ceil(depth / rowH) + 4;
    const cols = Math.ceil(halfWidth / w) + 2;
    const key = (x, z) => `${Math.round(x * 100)}|${Math.round(z * 100)}`;
    for (let r = -2; r < rows; r++) {
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
          // los tubos no llegan a tocarse: hueco del conector
          const s = 0.07;
          edges.push({
            x1: lerp(x1, x2, s), z1: lerp(z1, z2, s),
            x2: lerp(x2, x1, s), z2: lerp(z2, z1, s),
            on: 0, seed: Math.random(),
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
        fov: 0.9,          // multiplicador de focal
        reflect: true,
        maxZ: 58,
        intensity: 1,
        trail: 0,
        lightsOn: true,
      }, opts);
      const geo = buildHoneycomb({ depth: this.o.maxZ + 8 });
      this.edges = geo.edges;
      this.period = geo.period;
      this.camZ = 0;
      this.camX = 0;
      this.targetX = 0;
      this.roll = 0;
      this.t0 = performance.now();
      this.running = false;
      this.buckets = 14;
      this.resize = this.resize.bind(this);
      this.frame = this.frame.bind(this);
      this.resize();
      window.addEventListener("resize", this.resize);
      // momento de encendido de cada tubo (de cerca a lejos)
      this.edges.forEach(e => {
        const z = (e.z1 + e.z2) / 2;
        e.on = this.o.lightsOn ? -1 : 0.35 + z * 0.026 + e.seed * 0.4;
      });
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = this.c.getBoundingClientRect();
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      this.c.width = Math.round(this.w * dpr);
      this.c.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.dpr = dpr;
    }
    start() { if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(this.frame); } }
    stop() { this.running = false; }
    frame(now) {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (this.onTick) this.onTick((now - this.t0) / 1000, dt);
      this.camZ += this.o.speed * dt;
      this.camX = lerp(this.camX, this.targetX, 0.04);
      this.draw((now - this.t0) / 1000);
      requestAnimationFrame(this.frame);
    }
    brightness(e, t) {
      if (e.on < 0) return 1;
      const d = t - e.on;
      if (d < 0) return 0;
      if (d > 0.32) return 1;
      // parpadeo de fluorescente al encender
      const f = Math.sin((d * 70 + e.seed * 20)) > 0.1 ? 1 : 0.12;
      return d < 0.06 ? 0.5 * f : f;
    }
    draw(t) {
      const { ctx, w, h, o } = this;
      ctx.globalCompositeOperation = "source-over";
      if (o.trail > 0) {
        ctx.fillStyle = `rgba(0,0,0,${1 - o.trail})`;
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
      }
      const f = Math.max(w, h * 1.1) * 0.62 * o.fov;
      const cx = w / 2;
      const cy = h / 2;
      const cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
      const cr = Math.cos(this.roll), sr = Math.sin(this.roll);
      const off = this.camZ % this.period;
      const near = 0.12;
      const B = this.buckets;
      const maxZ = o.maxZ;
      const layers = o.reflect ? [o.ceilingY, 2 * o.floorY - o.ceilingY] : [o.ceilingY];
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      for (let li = 0; li < layers.length; li++) {
        const Y = layers[li];
        const layerAlpha = li === 0 ? 1 : 0.07;
        const paths = Array.from({ length: B }, () => []);

        for (let i = 0; i < this.edges.length; i++) {
          const e = this.edges[i];
          const b = this.brightness(e, t);
          if (b <= 0) continue;
          // coordenadas relativas a la cámara
          let za = e.z1 - off, zb = e.z2 - off;
          let xa = e.x1 - this.camX, xb = e.x2 - this.camX;
          const ya = Y, yb = Y;
          // rotación por pitch
          let pya = ya * cp - za * sp, pza = ya * sp + za * cp;
          let pyb = yb * cp - zb * sp, pzb = yb * sp + zb * cp;
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
            [sx1, sy1] = [sx1 * cr - sy1 * sr, sx1 * sr + sy1 * cr];
            [sx2, sy2] = [sx2 * cr - sy2 * sr, sx2 * sr + sy2 * cr];
          }
          sx1 += cx; sy1 += cy; sx2 += cx; sy2 += cy;
          if ((sx1 < -50 && sx2 < -50) || (sx1 > w + 50 && sx2 > w + 50) || (sy1 < -50 && sy2 < -50) || (sy1 > h + 50 && sy2 > h + 50)) continue;
          const bucket = clamp(Math.floor((Math.max(0, zm) / maxZ) * B), 0, B - 1);
          paths[bucket].push(sx1, sy1, sx2, sy2, b);
        }

        for (let bk = B - 1; bk >= 0; bk--) {
          const p = paths[bk];
          if (!p.length) continue;
          const zMid = ((bk + 0.5) / B) * maxZ;
          const fog = Math.pow(1 - bk / B, 1.6);
          const tube = clamp((0.055 * f) / Math.max(zMid, 0.6), 0.5, 9);
          // 3 pasadas: halo, brillo, núcleo
          const passes = [
            [tube * 9, 0.012], [tube * 5, 0.03], [tube * 2.6, 0.08], [tube * 1.5, 0.22], [tube * 0.8, 0.95],
          ];
          for (const [lw, a] of passes) {
            ctx.lineWidth = lw;
            // agrupar por brillo (encendidos completos vs parpadeando)
            for (const full of [true, false]) {
              ctx.beginPath();
              let any = false;
              for (let j = 0; j < p.length; j += 5) {
                const isFull = p[j + 4] >= 1;
                if (isFull !== full) continue;
                ctx.moveTo(p[j], p[j + 1]);
                ctx.lineTo(p[j + 2], p[j + 3]);
                any = true;
              }
              if (!any) continue;
              const alpha = a * fog * layerAlpha * o.intensity * (full ? 1 : 0.35);
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

  let introScene = null;
  const seen = (() => { try { return sessionStorage.getItem("jac-intro") === "1"; } catch (e) { return false; } })();

  if (reduceMotion || seen) {
    intro.classList.add("is-gone");
    body.classList.remove("is-intro");
    body.classList.add("is-ready");
    introDone = true;
  } else {
    try { sessionStorage.setItem("jac-intro", "1"); } catch (e) { /* sin almacenamiento */ }
    introScene = new HexCeiling(introCanvas, {
      lightsOn: false, speed: 0.6, pitch: 0.22, fov: 0.95, maxZ: 64,
    });
    const T = {
      lightsEnd: 2.4,   // se encienden los tubos
      accelEnd: 4.5,    // vuelo hacia el fondo
      flash: 4.3,
      logo: 4.55,
      leave: 6.6,
    };
    let logoShown = false;
    introScene.onTick = (t) => {
      window.__introT = t;
      const o = introScene.o;
      if (t < T.lightsEnd) {
        o.speed = 0.6;
        o.pitch = 0.22;
        o.trail = 0;
      } else if (t < T.accelEnd) {
        const k = (t - T.lightsEnd) / (T.accelEnd - T.lightsEnd);
        const e = easeInCubic(k);
        o.speed = lerp(0.6, 36, e);
        o.pitch = lerp(0.22, 0.62, easeInOut(k));
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
     HERO + CTA: techo ambiental
     ========================================================= */
  function mountAmbient(canvas, opts) {
    if (!canvas) return null;
    const scene = new HexCeiling(canvas, opts);
    if (reduceMotion) { scene.draw(0); return scene; }
    const io = new IntersectionObserver(([en]) => {
      if (en.isIntersecting) scene.start(); else scene.stop();
    }, { threshold: 0 });
    io.observe(canvas);
    return scene;
  }
  const hero = mountAmbient(document.getElementById("hero-canvas"), {
    speed: 0.55, pitch: 0.36, fov: 0.9, intensity: 0.95,
  });
  const cta = mountAmbient(document.getElementById("cta-canvas"), {
    speed: 0.35, pitch: 1.3, fov: 0.75, reflect: false, intensity: 0.8, maxZ: 40,
  });
  if (hero && !reduceMotion) {
    window.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse") return;
      hero.targetX = (e.clientX / window.innerWidth - 0.5) * 1.4;
    }, { passive: true });
  }
  if (cta && !reduceMotion) {
    cta.onTick = (t) => { cta.roll = t * 0.03; };
  }

  /* =========================================================
     UI
     ========================================================= */
  function revealHero() {
    document.querySelectorAll(".hero .reveal").forEach((el, i) => {
      setTimeout(() => el.classList.add("is-in"), 450 + i * 140);
    });
  }
  if (introDone) revealHero();

  // reveal al hacer scroll
  const ro = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add("is-in"); ro.unobserve(en.target); }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  document.querySelectorAll(".reveal").forEach(el => { if (!el.closest(".hero")) ro.observe(el); });

  // nav
  const nav = document.getElementById("nav");
  const fab = document.querySelector(".fab");
  const heroEl = document.querySelector(".hero");
  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.toggle("is-scrolled", y > 40);
    fab.classList.toggle("is-visible", y > heroEl.offsetHeight * 0.7);
    // frase con desplazamiento lateral
    const q = document.querySelector(".quote");
    const r = q.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight && !reduceMotion) {
      const p = (window.innerHeight - r.top) / (window.innerHeight + r.height) - 0.5;
      q.querySelectorAll(".qline").forEach((l, i) => {
        l.style.setProperty("--qx", `${(i % 2 ? -1 : 1) * p * 6}vw`);
      });
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

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

  document.getElementById("year").textContent = new Date().getFullYear();
})();
