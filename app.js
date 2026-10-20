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
  try { site.textContent = new URL(report.url).hostname + " · " + (report.strategy === "mobile" ? "Mobile" : "Desktop") + " · " + new Date(report.generatedAt).toLocaleString("it-IT"); }
  catch { site.textContent = "Risultati Audit Valeya"; }
  const scores = document.getElementById("auditScores");
  report.scores.forEach(item => {
    const card = document.createElement("div");
    card.className = "audit-score";
    const label = document.createElement("span"); label.textContent = String(item.category || "Categoria");
    const value = document.createElement("strong"); value.textContent = item.score == null ? "N/D" : String(item.score) + "/100";
    card.append(label, value); scores.appendChild(card);
  });
  const issues = document.getElementById("auditIssues");
  const topIssues = Array.isArray(report.issues) ? report.issues.slice(0, 3) : [];
  if (!topIssues.length) {
    const li = document.createElement("li"); li.textContent = "Nessuna criticità prioritaria restituita dai controlli selezionati. Questo non equivale a una certificazione."; issues.appendChild(li);
  } else {
    topIssues.forEach(issue => {
      const li = document.createElement("li");
      const priority = issue.priority === "high" ? "Priorità alta" : issue.priority === "medium" ? "Da migliorare" : "Approfondimento";
      li.textContent = (issue.title || issue.id || "Controllo") + " · " + priority;
      issues.appendChild(li);
    });
  }
  panel.hidden = false;
  const clear = document.getElementById("clearAuditContext");
  clear.addEventListener("click", () => {
    try { sessionStorage.removeItem("valeyaAuditReport"); } catch {}
    panel.hidden = true;
  });
})();
