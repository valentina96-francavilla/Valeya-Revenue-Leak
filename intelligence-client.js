(() => {
  "use strict";
  const API = "https://valeya-audit-revenue-dashboard.vercel.app/api/intelligence";
  const SESSION_KEY = "valeyaIntelligenceAuthSession";
  let config = null;
  let session = null;
  let readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch {}
  function setSession(next) {
    session = next || null;
    try { if (session?.access_token) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); else sessionStorage.removeItem(SESSION_KEY); } catch {}
    renderAuth();
    window.dispatchEvent(new CustomEvent("valeya-intelligence-auth", { detail: { user: session?.user || null } }));
  }
  async function loadConfig() {
    const response = await fetch(API + "?action=config", { headers: { Accept: "application/json" }, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Configurazione del backend non disponibile.");
    config = data;
  }
  async function authRequest(path, body) {
    await ready;
    if (!config) throw new Error("Supabase non è configurato sul server.");
    const response = await fetch(config.url + path, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: config.publishableKey },
      body: JSON.stringify(body), cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || "Autenticazione non riuscita.");
    return data;
  }
  async function signIn(email, password) {
    const next = await authRequest("/auth/v1/token?grant_type=password", { email, password });
    setSession(next); return next;
  }
  async function signUp(email, password) {
    const next = await authRequest("/auth/v1/signup", { email, password });
    if (next.access_token) setSession(next);
    return next;
  }
  async function refresh() {
    if (!session?.refresh_token || !config) return false;
    try {
      const next = await authRequest("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token });
      setSession(next); return true;
    } catch { setSession(null); return false; }
  }
  async function signOut() {
    const old = session;
    try {
      if (old?.access_token && config) {
        await fetch(config.url + "/auth/v1/logout", {
          method: "POST",
          headers: { apikey: config.publishableKey, Authorization: "Bearer " + old.access_token },
          cache: "no-store"
        });
      }
    } catch {}
    setSession(null);
  }
  async function call(action, options = {}) {
    await ready;
    if (!session?.access_token) throw new Error("Accedi per salvare e consultare i dati del workspace.");
    const method = options.method || "POST";
    const url = API + (method === "GET" ? "?action=" + encodeURIComponent(action) + (options.query ? "&" + new URLSearchParams(options.query).toString() : "") : "");
    const run = () => fetch(url, {
      method, headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + session.access_token },
      body: method === "GET" ? undefined : JSON.stringify({ action, ...(options.body || {}) }), cache: "no-store"
    });
    let response = await run();
    if (response.status === 401 && await refresh()) response = await run();
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Richiesta non riuscita (" + response.status + ").");
    return data;
  }
  function note(message) { const el = document.getElementById("vi-auth-note"); if (el) el.textContent = message; }
  function renderAuth() {
    let panel = document.getElementById("vi-auth-panel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "vi-auth-panel";
      panel.setAttribute("aria-label", "Accesso al workspace");
      panel.innerHTML = '<div class="vi-auth-copy"><strong>Workspace sincronizzato</strong><small id="vi-auth-note" aria-live="polite">Accedi per salvare scansioni, interventi e misurazioni in modo persistente.</small></div><div class="vi-auth-controls" id="vi-auth-controls"><input id="vi-auth-email" type="email" autocomplete="email" placeholder="Email" aria-label="Email"><input id="vi-auth-password" type="password" autocomplete="current-password" placeholder="Password (minimo 8 caratteri)" aria-label="Password"><button type="button" id="vi-auth-login">Accedi</button><button type="button" id="vi-auth-signup">Crea account</button></div>';
      const anchor = document.querySelector(".topbar") || document.querySelector("header") || document.body.firstElementChild;
      if (anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling); else document.body.prepend(panel);
      document.getElementById("vi-auth-login").addEventListener("click", async () => {
        const email = document.getElementById("vi-auth-email").value.trim(), password = document.getElementById("vi-auth-password").value;
        note("Accesso in corso…");
        try { await signIn(email, password); note("Accesso effettuato. Workspace pronto."); }
        catch (e) { note(e.message); }
      });
      document.getElementById("vi-auth-signup").addEventListener("click", async () => {
        const email = document.getElementById("vi-auth-email").value.trim(), password = document.getElementById("vi-auth-password").value;
        if (password.length < 8) { note("Usa una password di almeno 8 caratteri."); return; }
        note("Creazione account in corso…");
        try {
          const result = await signUp(email, password);
          note(result.access_token ? "Account creato e accesso effettuato." : "Account creato. Se è richiesta la conferma email, conferma l'indirizzo e poi accedi.");
        } catch (e) { note(e.message); }
      });
    }
    const controls = document.getElementById("vi-auth-controls"), noteEl = document.getElementById("vi-auth-note");
    if (!controls || !noteEl) return;
    if (session?.access_token) {
      controls.innerHTML = '<span class="vi-auth-user">' + safe(session.user?.email || "Account connesso") + '</span><button type="button" id="vi-auth-logout">Esci</button>';
      noteEl.textContent = "Dati salvati nel workspace, non nel browser.";
      document.getElementById("vi-auth-logout").addEventListener("click", () => signOut());
    }
  }
  const style = document.createElement("style");
  style.textContent = '#vi-auth-panel{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 20px;padding:13px 16px;border:1px solid #343541;border-radius:10px;background:#191a22;color:#eeeaf8;font:12px/1.5 system-ui,sans-serif}#vi-auth-panel .vi-auth-copy{min-width:180px;display:grid;gap:3px}#vi-auth-panel small{color:#aaa9b8}#vi-auth-panel .vi-auth-controls{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:7px}#vi-auth-panel input{width:180px;max-width:100%;padding:9px 10px;background:#20212b;border:1px solid #3a3b49;border-radius:7px;color:#f0eef8;font:12px system-ui,sans-serif}#vi-auth-panel button{padding:9px 11px;border:1px solid #6753cb;border-radius:7px;background:#6c55d9;color:#fff;font:700 11px system-ui,sans-serif;cursor:pointer}#vi-auth-panel button:last-child{background:#20212b;border-color:#3a3b49}#vi-auth-panel .vi-auth-user{font-size:11px;color:#c5bbff;overflow-wrap:anywhere}@media(max-width:760px){#vi-auth-panel{align-items:stretch;flex-direction:column}#vi-auth-panel .vi-auth-controls{justify-content:flex-start}#vi-auth-panel input{flex:1;width:100%}}';
  document.head.appendChild(style);
  renderAuth();
  loadConfig().then(() => { readyResolve(); renderAuth(); window.dispatchEvent(new CustomEvent("valeya-intelligence-ready")); }).catch(error => { readyResolve(); note(error.message + " I dati non possono ancora essere sincronizzati."); window.dispatchEvent(new CustomEvent("valeya-intelligence-ready")); });
  window.ValeyaIntelligence = { ready, signIn, signUp, signOut, getSession: () => session, call };
})();