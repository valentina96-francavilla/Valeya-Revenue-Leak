const money=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0});
const integer=new Intl.NumberFormat('it-IT',{maximumFractionDigits:0});
const percent=n=>n.toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
const el=id=>document.getElementById(id);
const c={visitors:el('visitors'),conversion:el('conversion'),target:el('target'),order:el('order')};
function calc(){
 const v={visitors:+c.visitors.value,conversion:+c.conversion.value,target:+c.target.value,order:+c.order.value};
 const currentOrders=v.visitors*v.conversion/100;
 const revenue=currentOrders*v.order;
 const uplift=Math.max(0,v.visitors*(v.target-v.conversion)/100*v.order);
 return {v,revenue,uplift,currentOrders};
}
function render(){
 const d=calc();
 el('visitorsOut').textContent=integer.format(d.v.visitors);
 el('conversionOut').textContent=percent(d.v.conversion);
 el('targetOut').textContent=percent(d.v.target);
 el('orderOut').textContent=money.format(d.v.order);
 el('revenue').textContent=money.format(d.revenue);
 el('revenueExplain').textContent=integer.format(d.currentOrders)+' ordini stimati × '+money.format(d.v.order)+' di valore medio';
 el('cr').textContent=percent(d.v.conversion);
 el('crbar').style.width=Math.min(100,d.v.conversion/5*100)+'%';
 el('aov').textContent=money.format(d.v.order);
 el('potential').textContent=money.format(d.uplift);
 el('convvalue').innerHTML='+ '+money.format(d.uplift)+'<small>/ mese nello scenario</small>';
 el('aovvalue').innerHTML='Da misurare<small>con dati reali</small>';
 el('cartvalue').innerHTML='Da misurare<small>con dati reali</small>';
 el('simResult').textContent=(d.uplift>0?'+ ':'')+money.format(d.uplift);
 el('resultExplain').textContent=d.v.target>d.v.conversion?'Scenario ipotetico se raggiungi l’obiettivo, mantenendo stabili visite e valore medio ordine.':'L’obiettivo non supera il tasso attuale: il simulatore non stima ricavi aggiuntivi positivi.';
}
Object.values(c).forEach(input=>input.addEventListener('input',render));
el('update').addEventListener('click',()=>{
 render();el('opportunities').scrollIntoView({behavior:'smooth',block:'start'});
 el('update').textContent='Valori aggiornati ✓';
 setTimeout(()=>el('update').innerHTML='Aggiorna stima <span>→</span>',1500);
});
el('reset').addEventListener('click',()=>{
 c.visitors.value=36000;c.conversion.value=1.8;c.target.value=2.4;c.order.value=75;
 render();window.scrollTo({top:0,behavior:'smooth'});
});


// Audit → Revenue Leak: keep the handoff explicit and evidence-led.
(() => {
  const byId = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
  const moneyText = value => new Intl.NumberFormat("it-IT", {style:"currency",currency:"EUR",maximumFractionDigits:0}).format(value);

  function recommendation(issue) {
    const id = String(issue.id || "").toLowerCase();
    const title = String(issue.title || "").toLowerCase();
    if (/largest-contentful-paint|speed-index|first-contentful-paint|interactive|render-blocking|unused-javascript|unused-css|image-delivery|offscreen-images|modern-image/.test(id)) {
      return {
        action: "Verifica e migliora il caricamento della pagina interessata.",
        data: "Dati di velocità della pagina e dispositivo; se disponibili, dati real-user (Core Web Vitals).",
        kpi: "LCP / INP / CLS pertinenti e tasso di contatto o completamento del percorso.",
        check: "Confronta la stessa pagina e lo stesso dispositivo prima e dopo la modifica."
      };
    }
    if (/contrast|tap-target|target-size|label-content|label|aria|accessibility|button-name|link-name/.test(id) || /accessib|contrasto|pulsante|etichetta/.test(title)) {
      return {
        action: "Controlla manualmente il componente segnalato e rendilo comprensibile e utilizzabile.",
        data: "Test manuale da tastiera e smartphone; feedback degli utenti e dati del percorso interessato, se disponibili.",
        kpi: "Completamento del modulo o del task; errori e abbandoni osservati.",
        check: "Ripeti lo stesso test dopo la correzione. Il punteggio automatico non sostituisce il test manuale."
      };
    }
    if (/document-title|meta-description|canonical|robots|crawlable|link-text|http-status-code|hreflang|structured-data/.test(id) || /seo|title|descrizione|indicizz/.test(title)) {
      return {
        action: "Verifica il problema SEO sulla pagina e correggilo solo se applicabile.",
        data: "Google Search Console: indicizzazione, query, impressioni e clic della pagina.",
        kpi: "Clic organici e impressioni pertinenti; richieste provenienti dal traffico organico.",
        check: "Annota la data della modifica e confronta periodi comparabili. Il ranking non è garantito."
      };
    }
    if (/server-response-time|redirects|uses-rel-preload|font-display|cache/.test(id)) {
      return {
        action: "Verifica la causa tecnica del rallentamento prima di intervenire.",
        data: "Tempi di risposta e caricamento; configurazione hosting/cache e dati real-user, se disponibili.",
        kpi: "Tempo di risposta / LCP e conversione del percorso interessato, se tracciata.",
        check: "Ripeti il test in condizioni comparabili e verifica che la modifica non rompa altre funzioni."
      };
    }
    return {
      action: "Apri il dettaglio del rilievo e conferma manualmente che sia un problema reale per questa pagina.",
      data: "La fonte dipende dal rilievo: test manuale, Analytics, Search Console, modulo contatti o gestionale.",
      kpi: "Scegli una sola metrica collegata al percorso interessato, ad esempio invii del modulo, chiamate tracciate o completamento del task.",
      check: "Registra il valore iniziale prima di intervenire e confrontalo dopo la modifica, usando periodi comparabili."
    };
  }

  function renderAuditContext() {
    const context = byId("auditContext");
    if (!context) return;
    let report = null;
    try { report = JSON.parse(sessionStorage.getItem("valeyaAuditReport") || "null"); } catch {}
    if (!report || report.product !== "Audit Valeya" || !Array.isArray(report.issues)) return;
    context.hidden = false;
    byId("auditSite").textContent = report.url || "URL non disponibile";
    const scores = byId("auditScores");
    if (scores) scores.innerHTML = (report.scores || []).map(item =>
      '<div class="audit-score"><span>'+escapeHTML(item.category)+'</span><strong>'+(Number.isFinite(item.score)?escapeHTML(item.score)+'/100':'N/D')+'</strong></div>'
    ).join("");
    const issuesList = byId("auditIssues");
    if (issuesList) issuesList.innerHTML = report.issues.slice(0,8).map(issue =>
      '<li><strong>'+escapeHTML(issue.title)+'</strong> · '+escapeHTML(issue.priority === "high" ? "Priorità tecnica alta" : issue.priority === "medium" ? "Da migliorare" : "Da approfondire")+'</li>'
    ).join("") || "<li>Nessun rilievo disponibile nel report trasferito.</li>";
    const plans = byId("auditActionPlan");
    if (plans) {
      const issues = report.issues.slice(0,5);
      plans.innerHTML = issues.length ? issues.map((issue,index) => {
        const rec = recommendation(issue);
        const priority = issue.priority === "high" ? "Alta" : issue.priority === "medium" ? "Media" : "Da verificare";
        return '<article class="audit-action-card"><div class="audit-action-card-top"><span class="audit-action-number">0'+(index+1)+'</span><span class="audit-action-priority '+escapeHTML(issue.priority || "low")+'">Priorità tecnica: '+priority+'</span></div><h4>'+escapeHTML(issue.title)+'</h4><p class="audit-action-evidence">'+escapeHTML(issue.description || "Verificare il dettaglio nel report Audit.")+'</p><div class="audit-action-field"><strong>Decisione da valutare</strong><p>'+escapeHTML(rec.action)+'</p></div><div class="audit-action-field"><strong>Dato da verificare</strong><p>'+escapeHTML(rec.data)+'</p></div><div class="audit-action-field"><strong>KPI da monitorare</strong><p>'+escapeHTML(rec.kpi)+'</p></div><div class="audit-action-check"><strong>Come verificare</strong><p>'+escapeHTML(rec.check)+'</p></div><label class="audit-action-status">Stato dell’intervento <select data-audit-issue="'+escapeHTML(issue.id)+'"><option value="da-verificare">Da verificare</option><option value="pianificato">Pianificato</option><option value="completato">Completato</option><option value="misurato">Risultato misurato</option></select></label></article>';
      }).join("") : '<p class="full-audit-empty">Il report non contiene rilievi da trasformare in azioni.</p>';
      plans.querySelectorAll("select[data-audit-issue]").forEach(select => {
        const key = "valeyaActionStatus:" + report.url + ":" + select.dataset.auditIssue;
        try { select.value = localStorage.getItem(key) || "da-verificare"; } catch {}
        select.addEventListener("change", () => {
          try { localStorage.setItem(key, select.value); } catch {}
        });
      });
    }
    const open = byId("openFullAudit");
    if (open) open.hidden = false;
    const fullReport = byId("fullAuditReport");
    if (fullReport) {
      byId("fullAuditMeta").textContent = "URL: " + (report.url || "N/D") + " · Generato: " + (report.generatedAt ? new Date(report.generatedAt).toLocaleString("it-IT") : "data non disponibile");
      byId("fullAuditScores").innerHTML = (report.scores || []).map(item => '<div class="full-audit-score"><span>'+escapeHTML(item.category)+'</span><strong>'+(Number.isFinite(item.score)?escapeHTML(item.score)+'/100':'N/D')+'</strong></div>').join("");
      byId("fullAuditIssues").innerHTML = report.issues.map(issue => '<article class="full-audit-issue"><div class="full-audit-issue-heading"><strong>'+escapeHTML(issue.title)+'</strong><span class="full-audit-priority '+escapeHTML(issue.priority || "low")+'">'+escapeHTML(issue.priority || "Da verificare")+'</span></div><p>'+escapeHTML(issue.description || "")+'</p><small>'+escapeHTML(issue.displayValue || "")+'</small></article>').join("") || '<p class="full-audit-empty">Nessun rilievo nel report.</p>';
    }
  }

  byId("openFullAudit")?.addEventListener("click", () => { byId("fullAuditReport").hidden = false; });
  byId("closeFullAudit")?.addEventListener("click", () => { byId("fullAuditReport").hidden = true; });
  byId("clearAuditContext")?.addEventListener("click", () => {
    try { sessionStorage.removeItem("valeyaAuditReport"); } catch {}
    byId("auditContext").hidden = true;
  });
  renderAuditContext();
})();
