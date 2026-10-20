const money=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0});const integer=new Intl.NumberFormat('it-IT',{maximumFractionDigits:0});const percent=n=>n.toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';const el=id=>document.getElementById(id);const c={visitors:el('visitors'),conversion:el('conversion'),target:el('target'),order:el('order')};function calc(){const v={visitors:+c.visitors.value,conversion:+c.conversion.value,target:+c.target.value,order:+c.order.value};const revenue=v.visitors*v.conversion/100*v.order;const uplift=Math.max(0,v.visitors*(v.target-v.conversion)/100*v.order);return {v,revenue,uplift,aov:revenue*.0333,cart:revenue*.0222,total:uplift+revenue*.0555}}function render(){const d=calc();el('visitorsOut').textContent=integer.format(d.v.visitors);el('conversionOut').textContent=percent(d.v.conversion);el('targetOut').textContent=percent(d.v.target);el('orderOut').textContent=money.format(d.v.order);el('revenue').textContent=money.format(d.revenue);el('cr').textContent=percent(d.v.conversion);el('crbar').style.width=Math.min(100,d.v.conversion/5*100)+'%';el('aov').textContent=money.format(d.v.order);el('potential').textContent=money.format(d.total);el('convvalue').innerHTML='+ '+money.format(d.uplift)+'<small>/ mese</small>';el('aovvalue').innerHTML='+ '+money.format(d.aov)+'<small>/ mese</small>';el('cartvalue').innerHTML='+ '+money.format(d.cart)+'<small>/ mese</small>';el('simResult').textContent='+ '+money.format(d.uplift)}Object.values(c).forEach(input=>input.addEventListener('input',render));el('update').addEventListener('click',()=>{render();el('opportunities').scrollIntoView({behavior:'smooth',block:'start'});el('update').textContent='Analisi aggiornata ✓';setTimeout(()=>el('update').innerHTML='Aggiorna analisi <span>→</span>',1500)});el('reset').addEventListener('click',()=>{c.visitors.value=36000;c.conversion.value=1.8;c.target.value=2.4;c.order.value=75;render();window.scrollTo({top:0,behavior:'smooth'})});render();

// Collegamento MVP: riceve i risultati temporanei da Audit Valeya, senza trasferire chiavi API.
(function showAuditContext() {
  const panel = document.getElementById("auditContext");
  if (!panel) return;
  let report;
  try {
    const raw = sessionStorage.getItem("valeyaAuditReport");
    if (!raw) return;
    report = JSON.parse(raw);
  } catch { return; }
  if (!report || report.product !== "Audit Valeya" || !Array.isArray(report.scores)) return;
  const site = document.getElementById("auditSite");
  const strategyLabel = report.strategy === "mobile" ? "Mobile" : "Desktop";
  try { site.textContent = new URL(report.url).hostname + " · " + strategyLabel + " · " + new Date(report.generatedAt).toLocaleString("it-IT"); }
  catch { site.textContent = "Risultati Audit Valeya"; }
  const renderScores = (container, compact) => {
    container.replaceChildren();
    report.scores.forEach(item => {
      const card = document.createElement("div");
      card.className = compact ? "audit-score" : "full-audit-score";
      const label = document.createElement("span");
      label.textContent = String(item.category || "Categoria");
      const value = document.createElement("strong");
      value.textContent = item.score == null ? "N/D" : String(item.score) + "/100";
      card.append(label, value);
      container.appendChild(card);
    });
  };
  renderScores(document.getElementById("auditScores"), true);
  const issues = Array.isArray(report.issues) ? report.issues : [];
  const priorityLabel = issue => issue.priority === "high" ? "Priorità alta" : issue.priority === "medium" ? "Da migliorare" : "Approfondimento";
  const compactIssues = document.getElementById("auditIssues");
  compactIssues.replaceChildren();
  if (!issues.length) {
    const li = document.createElement("li");
    li.textContent = "Nessuna criticità prioritaria restituita dai controlli selezionati. Questo non equivale a una certificazione.";
    compactIssues.appendChild(li);
  } else {
    issues.slice(0, 3).forEach(issue => {
      const li = document.createElement("li");
      li.textContent = (issue.title || issue.id || "Controllo") + " · " + priorityLabel(issue);
      compactIssues.appendChild(li);
    });
  }
  const openButton = document.getElementById("openFullAudit");
  const fullReport = document.getElementById("fullAuditReport");
  openButton.hidden = false;
  const closeFullReport = () => {
    fullReport.hidden = true;
    openButton.textContent = "Apri report completo Audit ↗";
    openButton.setAttribute("aria-expanded", "false");
  };
  openButton.setAttribute("aria-expanded", "false");
  openButton.addEventListener("click", () => {
    const opening = fullReport.hidden;
    fullReport.hidden = !opening;
    openButton.textContent = opening ? "Nascondi report completo ↑" : "Apri report completo Audit ↗";
    openButton.setAttribute("aria-expanded", String(opening));
    if (opening) fullReport.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  document.getElementById("closeFullAudit").addEventListener("click", closeFullReport);
  document.getElementById("fullAuditMeta").textContent =
    (report.url || "URL non disponibile") + " · " + strategyLabel +
    (report.generatedAt ? " · Analisi del " + new Date(report.generatedAt).toLocaleString("it-IT") : "") +
    (report.lighthouseVersion ? " · Lighthouse " + report.lighthouseVersion : "");
  renderScores(document.getElementById("fullAuditScores"), false);
  const fullIssues = document.getElementById("fullAuditIssues");
  fullIssues.replaceChildren();
  if (!issues.length) {
    const empty = document.createElement("p");
    empty.className = "full-audit-empty";
    empty.textContent = "Il report salvato non contiene criticità selezionate.";
    fullIssues.appendChild(empty);
  } else {
    issues.forEach((issue, index) => {
      const item = document.createElement("article");
      item.className = "full-audit-issue";
      const heading = document.createElement("div");
      heading.className = "full-audit-issue-heading";
      const title = document.createElement("strong");
      title.textContent = (index + 1) + ". " + (issue.title || issue.id || "Controllo");
      const priority = document.createElement("span");
      priority.className = "full-audit-priority " + (issue.priority || "low");
      priority.textContent = priorityLabel(issue);
      heading.append(title, priority);
      item.appendChild(heading);
      if (issue.description) {
        const description = document.createElement("p");
        description.textContent = issue.description;
        item.appendChild(description);
      }
      if (issue.displayValue) {
        const metric = document.createElement("small");
        metric.textContent = issue.displayValue;
        item.appendChild(metric);
      }
      fullIssues.appendChild(item);
    });
  }
  panel.hidden = false;
  document.getElementById("clearAuditContext").addEventListener("click", () => {
    try { sessionStorage.removeItem("valeyaAuditReport"); } catch {}
    panel.hidden = true;
    fullReport.hidden = true;
    openButton.hidden = true;
  });
})();
