/* Aviso de cookies (LSSI-CE / RGPD): Google Maps solo se carga si se acepta. */
(function () {
  "use strict";
  const KEY = "jac-cookies";
  const YEAR = 365 * 24 * 3600 * 1000;

  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "null");
      if (v && v.t && Date.now() - v.t < YEAR) return v.c;
    } catch (e) { /* almacenamiento bloqueado */ }
    return null;
  }
  function save(choice) {
    try { localStorage.setItem(KEY, JSON.stringify({ c: choice, t: Date.now() })); } catch (e) { /* nada */ }
  }

  function apply(choice) {
    const on = choice === "all";
    document.documentElement.classList.toggle("maps-on", on);
    document.querySelectorAll("iframe[data-consent-src]").forEach(f => {
      if (on && !f.getAttribute("src")) f.setAttribute("src", f.getAttribute("data-consent-src"));
      if (!on && f.getAttribute("src")) f.removeAttribute("src");
    });
  }

  const box = document.createElement("div");
  box.className = "cookie-box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Aviso de cookies");
  box.innerHTML = `
    <p class="cookie-title">Cookies, <em>solo las justas.</em></p>
    <p class="cookie-text">Usamos almacenamiento propio necesario para que la web funcione. Si aceptas, también cargamos el mapa de Google Maps, que usa cookies de Google. <a href="cookies.html">Más información</a></p>
    <div class="cookie-actions">
      <button type="button" class="btn btn-solid" data-c="all">Aceptar</button>
      <button type="button" class="btn btn-ghost" data-c="necessary">Solo necesarias</button>
    </div>`;
  document.body.appendChild(box);

  const show = () => { box.classList.add("is-on"); };
  const hide = () => { box.classList.remove("is-on"); };
  box.addEventListener("click", e => {
    const b = e.target.closest("[data-c]");
    if (!b) return;
    const c = b.getAttribute("data-c");
    save(c); apply(c); hide();
  });
  document.addEventListener("click", e => {
    if (e.target.closest(".js-cookie-settings")) { e.preventDefault(); show(); }
  });

  const current = read();
  apply(current);
  if (!current) setTimeout(show, 900);

  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();
