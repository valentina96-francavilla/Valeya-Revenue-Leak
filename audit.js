(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const form = $("auditForm");
  const urlInput = $("siteUrl");
  const strategyInput = $("strategy");
  const apiKeyInput = $("apiKey");
  const runButton = $("runAudit");
  const statusBox = $("status");
  const loading = $("loading");
  const results = $("results");
  const exportButton = $("exportReport");
  const printButton = $("printReport");
  let lastReport = null;

  const categories = [
    { key: "performance", label: "Performance", note: "Velocità e stabilità del caricamento" },
    { key: "accessibility", label: "Accessibilità", note: "Possibili barriere per le persone" },
    { key: "best-practices", label: "Best practice", note: "Qualità tecnica e sicurezza di base" },
    { key: "seo", label: "SEO", note: "Controlli SEO on-page essenziali" }
  ];
  const categoryLabels = {
    performance: "Performance", accessibility: "Accessibilità",
    "best-practices": "Best practice", seo: "SEO"
  };
  const priorityLabels = { high: "ALTA PRIORITÀ", medium: "DA MIGLIORARE", low: "APPROFONDIMENTO" };
  const moneyless = (n) => String(n);
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
  const scoreState = (score) => score >= 0.9 ? "good" : score >= 0.5 ? "mid" : "bad";
  const scoreText = (score) => Number.isFinite(score) ? Math.round(score * 100) : "N/D";

  function setStatus(message, type = "info") {
    statusBox.className = "status show " + type;
    statusBox.textContent = message;
  }
  function normalizeUrl(raw) {
    let parsed;
    try { parsed = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : "https://" + raw.trim()); }
    catch { throw new Error("Inserisci un indirizzo web valido, ad esempio https://esempio.it."); }
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Sono supportati solo gli indirizzi HTTP e HTTPS.");
    if (!parsed.hostname || !parsed.hostname.includes(".") || parsed.hostname === "localhost" || parsed.hostname.endsWith(".local")) {
      throw new Error("Inserisci il dominio pubblico di un sito, non un indirizzo locale.");
    }
    if (parsed.username || parsed.password) throw new Error("Per sicurezza, l'indirizzo non può contenere credenziali.");
    return parsed.href;
  }
  function requestUrl(target, strategy, apiKey) {
    const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    endpoint.searchParams.set("url", target);
    endpoint.searchParams.set("strategy", strategy);
    endpoint.searchParams.set("locale", "it");
    ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"].forEach(category => endpoint.searchParams.append("category", category));
    if (apiKey) endpoint.searchParams.set("key", apiKey);
    return endpoint;
  }
  function explainApiError(status, payload) {
    const apiMessage = payload?.error?.message || "";
    if (status === 400) return "Google non ha potuto analizzare questo indirizzo. Verifica che la pagina sia pubblica e raggiungibile. " + apiMessage;
    if (status === 403) return "Google ha rifiutato la richiesta. Se usi una chiave API, verifica che PageSpeed Insights API sia attiva e che la chiave sia valida. " + apiMessage;
    if (status === 429) return "Limite di richieste Google raggiunto. Attendi e riprova, oppure configura una chiave API con quota disponibile.";
    if (status === 500 || status === 502 || status === 503) return "Il servizio di analisi Google è temporaneamente indisponibile. Riprova più tardi.";
    return "Analisi non riuscita (HTTP " + status + "). " + apiMessage;
  }
  async function runPageSpeed(target, strategy, apiKey) {
    const endpoint = requestUrl(target, strategy, apiKey);
    let response;
    try {
      response = await fetch(endpoint.toString(), { method: "GET", headers: { "Accept": "application/json" } });
    } catch {
      throw new Error("Impossibile raggiungere il servizio Google PageSpeed. Controlla la connessione e riprova.");
    }
    let payload;
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok) throw new Error(explainApiError(response.status, payload));
    if (!payload?.lighthouseResult?.categories) throw new Error("Google ha restituito una risposta incompleta. Riprova tra qualche minuto.");
    return payload;
  }
  function getIssues(data) {
    const lighthouse = data.lighthouseResult;
    const audits = lighthouse.audits || {};
    const issues = Object.values(audits).filter(audit =>
      audit && typeof audit.score === "number" && audit.score < 0.9 &&
      !["notApplicable", "manual", "informative", "debugdata"].includes(audit.scoreDisplayMode) &&
      audit.id !== "screenshot-thumbnails" && audit.id !== "final-screenshot" &&
      audit.id !== "full-page-screenshot" && audit.id !== "largest-contentful-paint-element"
    ).map(audit => {
      const score = audit.score;
      const priority = score < 0.5 ? "high" : score < 0.9 ? "medium" : "low";
      const group = (audit.details && audit.details.type === "opportunity") ? "Opportunità" : "Controllo";
      return {
        id: audit.id,
        title: audit.title || audit.id,
        description: audit.description || "Controllo da approfondire.",
        displayValue: audit.displayValue || "",
        score,
        priority,
        group,
        helpUrl: audit.id ? "https://developer.chrome.com/docs/lighthouse/" : ""
      };
    });
    const order = { high: 0, medium: 1, low: 2 };
    return issues.sort((a,b) => order[a.priority] - order[b.priority] || a.score - b.score).slice(0, 18);
  }
  function renderScores(data) {
    const cats = data.lighthouseResult.categories || {};
    $("scoreCards").innerHTML = categories.map(category => {
      const score = cats[category.key]?.score;
      const state = Number.isFinite(score) ? scoreState(score) : "mid";
      const value = Number.isFinite(score) ? Math.round(score * 100) : "N/D";
      const width = Number.isFinite(score) ? Math.max(0, Math.min(100, score * 100)) : 0;
      const note = Number.isFinite(score) ? (score >= .9 ? "Buono" : score >= .5 ? "Da migliorare" : "Critico") : "Dato non disponibile";
      return '<article class="panel score-card score-' + state + '">' +
        '<div class="score-top"><span>' + category.label + '</span><span class="score-dot"></span></div>' +
        '<div class="score-number">' + value + (Number.isFinite(score) ? '<span style="font-size:14px;letter-spacing:0">/100</span>' : '') + '</div>' +
        '<div class="score-track"><span style="width:' + width + '%"></span></div>' +
        '<div class="score-note">' + note + ' · ' + category.note + '</div></article>';
    }).join("");
  }
  function renderIssues(data) {
    const issues = getIssues(data);
    $("issueCount").textContent = issues.length + (issues.length === 1 ? " criticità selezionata" : " criticità selezionate");
    if (!issues.length) {
      $("issueList").innerHTML = '<div class="empty">Nessun problema con punteggio inferiore a 90/100 rilevato nei controlli disponibili. Questo non equivale a una certificazione di qualità.</div>';
      return issues;
    }
    $("issueList").innerHTML = issues.map(issue => {
      const shortDescription = issue.description.replace(/\s*\[Learn more\]\([^)]*\)/gi, "").replace(/\s*\[.*?\]\([^)]*\)/g, "");
      const desc = shortDescription.length > 250 ? shortDescription.slice(0,247) + "…" : shortDescription;
      return '<article class="issue ' + issue.priority + '">' +
        '<div class="issue-icon">' + (issue.priority === "high" ? "!" : issue.priority === "medium" ? "↗" : "i") + '</div>' +
        '<div><strong>' + safe(issue.title) + '</strong>' +
        '<p>' + safe(desc) + '</p>' +
        '<div class="issue-meta"><span class="priority">' + priorityLabels[issue.priority] + '</span>' +
        '<span>' + safe(issue.displayValue || issue.group) + '</span></div></div></article>';
    }).join("");
    return issues;
  }
  function renderSummary(data, issues) {
    const cats = data.lighthouseResult.categories || {};
    const scored = categories.map(c => ({...c, score: cats[c.key]?.score})).filter(c => Number.isFinite(c.score));
    const weakest = [...scored].sort((a,b) => a.score - b.score)[0];
    const high = issues.filter(issue => issue.priority === "high").length;
    const medium = issues.filter(issue => issue.priority === "medium").length;
    const strategy = data.lighthouseResult.configSettings?.formFactor || "mobile";
    const date = data.analysisUTCTimestamp ? new Date(data.analysisUTCTimestamp) : new Date();
    $("reportSummary").innerHTML =
      '<div class="summary-item"><span class="summary-n">01</span><div><strong>Parti dall’area più debole</strong><p>' +
      (weakest ? safe(weakest.label) + " ha il punteggio più basso (" + Math.round(weakest.score * 100) + "/100). Analizza prima i controlli associati." : "I punteggi di categoria non sono disponibili.") +
      '</p></div></div>' +
      '<div class="summary-item"><span class="summary-n">02</span><div><strong>Valuta prima le criticità alte</strong><p>' + high + ' controlli con punteggio inferiore a 50/100 e ' + medium + ' da migliorare. Verifica ogni rilievo prima di pianificare un intervento.</p></div></div>' +
      '<div class="summary-item"><span class="summary-n">03</span><div><strong>Conferma sul sito reale</strong><p>I risultati Lighthouse sono test automatizzati di laboratorio. Non dimostrano da soli l’impatto su vendite, conversioni o posizionamento.</p></div></div>' +
      '<div class="summary-callout"><strong>Perimetro del report</strong>Analisi ' + (strategy === "desktop" ? "desktop" : "mobile") + ' · ' + safe(date.toLocaleString("it-IT")) + '. È stata esaminata la singola pagina indicata, non l’intero sito.</div>';
  }
  function renderReport(data, target, strategy) {
    const lighthouse = data.lighthouseResult;
    const issues = renderIssues(data);
    renderScores(data);
    renderSummary(data, issues);
    $("reportUrl").textContent = lighthouse.finalUrl || target;
    $("reportDate").textContent = "Analisi " + new Date(data.analysisUTCTimestamp || Date.now()).toLocaleString("it-IT") + " · " + (strategy === "mobile" ? "Mobile" : "Desktop");
    results.classList.add("show");
    lastReport = {
      product: "Audit Valeya",
      generatedAt: new Date().toISOString(),
      url: target,
      strategy,
      scores: categories.map(category => ({
        category: category.label,
        score: Number.isFinite(lighthouse.categories?.[category.key]?.score)
          ? Math.round(lighthouse.categories[category.key].score * 100) : null
      })),
      issues: issues.map(issue => ({
        id: issue.id, title: issue.title, priority: issue.priority,
        score: Math.round(issue.score * 100), description: issue.description,
        displayValue: issue.displayValue
      })),
      lighthouseVersion: lighthouse.lighthouseVersion,
      fetchTime: lighthouse.fetchTime,
      note: "Risultati di laboratorio per una singola pagina. Non sono una certificazione né una previsione commerciale."
    };
    try {
      sessionStorage.setItem("valeyaAuditReport", JSON.stringify(lastReport));
    } catch {
      setStatus("Analisi completata, ma il browser non consente di conservare temporaneamente i risultati per Revenue Leak.", "error");
    }
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    let target;
    try { target = normalizeUrl(urlInput.value); }
    catch (error) { setStatus(error.message, "error"); return; }
    try { sessionStorage.removeItem("valeyaAuditReport"); } catch {}
    const strategy = strategyInput.value;
    const apiKey = apiKeyInput.value.trim();
    runButton.disabled = true;
    runButton.textContent = "Analisi in corso…";
    loading.classList.add("show");
    results.classList.remove("show");
    setStatus("Google PageSpeed sta analizzando la pagina. L’operazione può richiedere fino a un minuto.", "info");
    try {
      const data = await runPageSpeed(target, strategy, apiKey);
      renderReport(data, target, strategy);
      setStatus("Analisi completata. I risultati sono stati generati da Google Lighthouse.", "success");
    } catch (error) {
      setStatus(error.message || "Si è verificato un errore imprevisto.", "error");
    } finally {
      runButton.disabled = false;
      runButton.innerHTML = "Analizza sito <span aria-hidden=\"true\">→</span>";
      loading.classList.remove("show");
    }
  });
  exportButton.addEventListener("click", () => {
    if (!lastReport) return;
    const blob = new Blob([JSON.stringify(lastReport, null, 2)], {type:"application/json;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit-valeya-" + new URL(lastReport.url).hostname.replace(/[^a-z0-9.-]/gi, "-") + ".json";
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  });
  printButton.addEventListener("click", () => window.print());
  $("clearKey").addEventListener("click", () => {
    apiKeyInput.value = "";
    setStatus("Chiave rimossa dal campo. Non viene salvata nel browser.", "info");
  });
})();