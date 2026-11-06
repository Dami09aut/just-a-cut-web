/* Traducciones: el HTML está en español y se traduce en el navegador con i18n/<idioma>.json. */
(function () {
  "use strict";
  const LANGS = [
    ["es", "Español"], ["en", "English"], ["de", "Deutsch"], ["fr", "Français"],
    ["it", "Italiano"], ["pt", "Português"], ["nl", "Nederlands"], ["ar", "العربية"],
  ];
  const CODES = LANGS.map(l => l[0]);
  const KEY = "jac-lang";
  const ATTRS = ["alt", "aria-label", "title", "placeholder", "data-cursor"];
  const root = document.documentElement;

  function pick() {
    try {
      const q = new URLSearchParams(location.search).get("lang");
      if (q && CODES.includes(q)) return q;
      const s = localStorage.getItem(KEY);
      if (s && CODES.includes(s)) return s;
    } catch (e) { /* almacenamiento bloqueado */ }
    for (const l of navigator.languages || [navigator.language || "es"]) {
      const c = String(l).slice(0, 2).toLowerCase();
      if (CODES.includes(c)) return c;
    }
    return "es";
  }

  let lang = pick();
  let dict = {};
  const cache = { es: {} };
  const subs = [];
  const norm = s => s.replace(/\s+/g, " ").trim();

  function t(src, vars) {
    let out = dict[src] || src;
    if (vars) for (const k in vars) out = out.split("{" + k + "}").join(vars[k]);
    return out;
  }

  function setDir(code) {
    root.lang = code;
    root.dir = code === "ar" ? "rtl" : "ltr";
  }
  setDir(lang);
  if (lang !== "es") root.classList.add("i18n-wait");

  // Recorre el documento y sustituye cada texto por su traducción (guarda el original).
  function apply() {
    const rtl = root.dir === "rtl";
    const skip = el => el.closest("script, style, [data-no-i18n]");
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const p = n.parentElement;
      if (!p || skip(p)) continue;
      if (n.__src === undefined) {
        if (!/\S/.test(n.nodeValue)) continue;
        n.__src = n.nodeValue;
      }
      const src = n.__src;
      const tr = dict[norm(src)];
      let val = src;
      if (tr) val = src.match(/^\s*/)[0] + tr + src.match(/\s*$/)[0];
      // en árabe, los textos latinos (teléfono, horas, @usuario, direcciones) se fijan de izquierda a derecha
      if (rtl && !/[\u0600-\u06FF]/.test(val) && /[A-Za-z0-9]/.test(val)) val = "\u200E" + val + "\u200E";
      if (n.nodeValue !== val) n.nodeValue = val;
    }
    document.querySelectorAll(ATTRS.map(a => "[" + a + "]").join(",")).forEach(el => {
      if (skip(el)) return;
      el.__srcA = el.__srcA || {};
      ATTRS.forEach(a => {
        if (!el.hasAttribute(a)) return;
        if (!(a in el.__srcA)) el.__srcA[a] = el.getAttribute(a);
        const src = el.__srcA[a];
        el.setAttribute(a, dict[norm(src)] || src);
      });
    });
    if (document.__srcTitle === undefined) document.__srcTitle = document.title;
    document.title = dict[norm(document.__srcTitle)] || document.__srcTitle;
    document.querySelectorAll('meta[name="description"], meta[property^="og:"]').forEach(m => {
      if (m.__src === undefined) m.__src = m.getAttribute("content");
      m.setAttribute("content", dict[norm(m.__src)] || m.__src);
    });
  }

  function arabicFont() {
    if (document.getElementById("font-ar")) return;
    const l = document.createElement("link");
    l.id = "font-ar"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@500;700;800&family=Noto+Sans+Arabic:wght@300;400;500;600&display=swap";
    document.head.appendChild(l);
  }

  function load(code) {
    if (cache[code]) return Promise.resolve(cache[code]);
    return fetch("/i18n/" + code + ".json").then(r => r.ok ? r.json() : {}).catch(() => ({}))
      .then(d => (cache[code] = d));
  }

  function set(code, save) {
    if (!CODES.includes(code)) code = "es";
    if (save) { try { localStorage.setItem(KEY, code); } catch (e) { /* nada */ } }
    if (code === "ar") arabicFont();
    return load(code).then(d => {
      lang = code; dict = d;
      setDir(code);
      apply();
      syncUI();
      subs.forEach(fn => { try { fn(code); } catch (e) { /* nada */ } });
      root.classList.remove("i18n-wait");
    });
  }

  // Selector de idioma
  function syncUI() {
    document.querySelectorAll(".lang").forEach(box => {
      const cur = box.querySelector(".lang-cur");
      if (cur) cur.textContent = lang.toUpperCase();
      box.querySelectorAll("[data-lang]").forEach(b => b.setAttribute("aria-current", String(b.dataset.lang === lang)));
      const btn = box.querySelector(".lang-btn");
      if (btn) btn.setAttribute("aria-label", t("Idioma") + ": " + LANGS.find(l => l[0] === lang)[1]);
    });
  }

  function buildUI() {
    document.querySelectorAll("[data-lang-slot]").forEach(slot => {
      const box = document.createElement("div");
      box.className = "lang";
      box.setAttribute("data-no-i18n", "");
      box.innerHTML =
        '<button type="button" class="lang-btn" aria-haspopup="true" aria-expanded="false">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.8 12h18.4M12 2.8c2.6 2.6 3.9 5.6 3.9 9.2s-1.3 6.6-3.9 9.2c-2.6-2.6-3.9-5.6-3.9-9.2s1.3-6.6 3.9-9.2z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>' +
        '<span class="lang-cur"></span></button>' +
        '<ul class="lang-menu" role="menu">' +
        LANGS.map(([c, name]) => '<li role="none"><button type="button" role="menuitem" data-lang="' + c + '" lang="' + c + '"><span class="lang-code">' + c.toUpperCase() + '</span><span class="lang-name">' + name + '</span></button></li>').join("") +
        "</ul>";
      slot.replaceWith(box);
      const btn = box.querySelector(".lang-btn");
      const open = on => { box.classList.toggle("is-open", on); btn.setAttribute("aria-expanded", String(on)); };
      btn.addEventListener("click", e => { e.stopPropagation(); open(!box.classList.contains("is-open")); });
      box.querySelectorAll("[data-lang]").forEach(b => b.addEventListener("click", () => { open(false); set(b.dataset.lang, true); }));
      document.addEventListener("click", e => { if (!box.contains(e.target)) open(false); });
      document.addEventListener("keydown", e => { if (e.key === "Escape") open(false); });
    });
    syncUI();
  }

  window.JAC_I18N = {
    get lang() { return lang; },
    t,
    onChange(fn) { subs.push(fn); },
    set: c => set(c, true),
  };

  function start() {
    buildUI();
    if (lang === "es") return;
    set(lang, false);
    setTimeout(() => root.classList.remove("i18n-wait"), 1500);
  }
  // Se ejecuta tras el resto de scripts (para traducir también el aviso de cookies).
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
