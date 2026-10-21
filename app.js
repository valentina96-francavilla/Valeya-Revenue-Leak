(() => {
  const $ = id => document.getElementById(id);
  const state = {step:1, report:null, selectedIssue:null, saved:false};
  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const fmt = value => new Intl.NumberFormat("it-IT",{maximumFractionDigits:2}).format(value);
  const kpiLabels = {leads:"Numero di richieste valide",lead_rate:"Tasso di conversione visita → richiesta",calls:"Telefonate provenienti dal sito",bookings:"Prenotazioni completate",quotes:"Preventivi richiesti",organic:"Clic organici pertinenti",task:"Completamento del percorso / task",revenue:"Ricavi attribuibili al canale",technical:"Metrica tecnica pertinente (es. LCP)"};
  const goalLabels = {leads:"Ricevere più richieste di contatto",calls:"Ricevere più telefonate",booking:"Ottenere più prenotazioni",quotes:"Ricevere più richieste di preventivo",sales:"Aumentare gli acquisti online",seo:"Aumentare il traffico organico qualificato"};
  function recommendation(issue){
    const id=String(issue.id||"").toLowerCase(), title=String(issue.title||"").toLowerCase();
    if(/largest-contentful-paint|speed-index|first-contentful-paint|interactive|render-blocking|unused-javascript|unused-css|image-delivery|offscreen-images|modern-image|server-response-time|redirects|font-display|cache/.test(id))
      return {action:"Verifica la causa del rallentamento e correggi il problema solo dopo averlo riprodotto.",source:"analytics",kpi:"technical",detail:"Confronta la stessa pagina e lo stesso dispositivo; usa dati real-user se disponibili."};
    if(/contrast|tap-target|target-size|label-content|aria|accessibility|button-name|link-name/.test(id)||/accessib|contrasto|pulsante|etichetta/.test(title))
      return {action:"Testa manualmente il componente da smartphone e tastiera, poi correggi il problema osservato.",source:"manual",kpi:"task",detail:"Ripeti lo stesso task prima e dopo. Un punteggio automatico non sostituisce il test manuale."};
    if(/document-title|meta-description|canonical|robots|crawlable|link-text|http-status-code|hreflang|structured-data/.test(id)||/seo|title|descrizione|indicizz/.test(title))
      return {action:"Verifica che il rilievo sia applicabile e correggi la pagina se necessario.",source:"search",kpi:"organic",detail:"Annota la data della modifica e confronta clic e impressioni su periodi comparabili."};
    return {action:"Conferma manualmente che il rilievo sia un problema reale per il percorso del cliente.",source:"manual",kpi:"task",detail:"Prima di intervenire, scegli una metrica pertinente e registra il valore iniziale."};
  }
  function showStep(step){
    state.step=step;
    document.querySelectorAll(".rl-panel-step").forEach(panel=>{const active=Number(panel.dataset.panel)===step;panel.hidden=!active;panel.classList.toggle("active",active);});
    document.querySelectorAll(".rl-step").forEach(btn=>{const n=Number(btn.dataset.step);btn.classList.toggle("active",n===step);btn.classList.toggle("done",n<step);});
    window.scrollTo({top:0,behavior:"smooth"});
    if(step===3) renderMeasurement();
  }
  function chosenIssue(){
    if(state.selectedIssue!==null && state.report?.issues?.[state.selectedIssue]) return state.report.issues[state.selectedIssue];
    return null;
  }
  function currentProblem(){
    const issue=chosenIssue();
    return issue ? issue.title : ($("rl-manual-issue").value.trim()||"Problema commerciale da verificare");
  }
  function renderReport(){
    const box=$("rl-audit-source"), report=state.report;
    if(!report) return;
    box.hidden=false;
    $("rl-audit-title").textContent="Audit collegato";
    $("rl-audit-url").textContent=report.url||"URL non disponibile";
    $("rl-audit-scores").innerHTML=(report.scores||[]).map(s=>'<div class="rl-score"><span>'+escapeHTML(s.category)+'</span><strong>'+(Number.isFinite(s.score)?escapeHTML(s.score)+"/100":"N/D")+'</strong></div>').join("");
    const issues=(report.issues||[]).slice(0,8);
    $("rl-issue-count").textContent=issues.length+" rilievi importati";
    $("rl-issue-list").innerHTML=issues.length?issues.map((issue,index)=>'<button type="button" class="rl-issue '+(index===state.selectedIssue?"selected":"")+'" data-issue="'+index+'"><span class="rl-issue-radio">'+(index===state.selectedIssue?"✓":"")+'</span><span class="rl-issue-copy"><strong>'+escapeHTML(issue.title)+'</strong><small>'+escapeHTML(issue.description||"Rilievo tecnico da verificare")+'</small></span><span class="rl-priority '+escapeHTML(issue.priority||"low")+'">'+(issue.priority==="high"?"Alta":issue.priority==="medium"?"Media":"Da verificare")+'</span></button>').join(""):'<div class="rl-empty">Il report non contiene rilievi. Descrivi un problema commerciale osservato qui sotto.</div>';
    $("rl-issue-list").querySelectorAll("[data-issue]").forEach(btn=>btn.addEventListener("click",()=>{
      state.selectedIssue=Number(btn.dataset.issue);
      const rec=recommendation(state.report.issues[state.selectedIssue]);
      $("rl-issue-list").querySelectorAll(".rl-issue").forEach(x=>{const active=Number(x.dataset.issue)===state.selectedIssue;x.classList.toggle("selected",active);x.querySelector(".rl-issue-radio").textContent=active?"✓":"";});
      $("rl-action").value=rec.action;$("rl-source").value=rec.source;$("rl-kpi").value=rec.kpi;
    }));
  }
  function renderMeasurement(){
    const issue=chosenIssue(), problem=currentProblem();
    $("rl-selected-problem").innerHTML='<span class="rl-kicker">PROBLEMA SCELTO</span><strong>'+escapeHTML(problem)+'</strong><p>Obiettivo: '+escapeHTML(goalLabels[$("rl-goal").value]||"Migliorare il risultato commerciale")+'</p>';
    $("rl-measure-summary").innerHTML='<div><span>Intervento</span><strong>'+escapeHTML($("rl-action").value||"Da definire")+'</strong></div><div><span>KPI</span><strong>'+escapeHTML(kpiLabels[$("rl-kpi").value]||"Da definire")+'</strong></div><div><span>Fonte dati</span><strong>'+escapeHTML($("rl-source").selectedOptions[0]?.textContent||"Da definire")+'</strong></div>';
    updateResult();
  }
  function updateResult(){
    const before=$("rl-before").value, after=$("rl-after").value, box=$("rl-result");
    if(before===""||after===""||!Number.isFinite(Number(before))||!Number.isFinite(Number(after))){
      box.classList.remove("has-value","negative");
      box.innerHTML='<span class="rl-result-icon">↗</span><div><strong>Risultato non ancora disponibile</strong><p>Inserisci entrambi i valori per calcolare la variazione osservata.</p></div>';return;
    }
    const b=Number(before), a=Number(after), diff=a-b, pct=b===0?null:diff/b*100;
    box.classList.add("has-value");box.classList.toggle("negative",diff<0);
    const headline=diff>0?"Aumento osservato":diff<0?"Diminuzione osservata":"Nessuna variazione osservata";
    const change=(diff>0?"+":"")+fmt(diff)+(pct===null?" unità":" ("+(pct>0?"+":"")+fmt(pct)+"%)");
    box.innerHTML='<span class="rl-result-icon">'+(diff>0?"↗":diff<0?"↘":"=")+'</span><div><strong>'+headline+': '+escapeHTML(change)+'</strong><p>Confronto descrittivo fra i due valori inseriti. Non è una stima di ricavi né una prova di causalità.</p></div>';
  }
  function collect(){
    return {product:"Valeya Revenue Leak",version:"0.2",savedAt:new Date().toISOString(),businessType:$("rl-business").value,goal:$("rl-goal").value,site:state.report?.url||"",problem:currentProblem(),auditIssue:chosenIssue(),action:$("rl-action").value.trim(),source:$("rl-source").value,kpi:$("rl-kpi").value,window:$("rl-window").value,before:$("rl-before").value,after:$("rl-after").value,notes:$("rl-notes").value.trim()};
  }
  function save(){
    const data=collect();
    try{localStorage.setItem("valeyaRevenueLeakPlan:"+ (data.site||"manual"),JSON.stringify(data));state.saved=true;$("rl-saved").hidden=false;}catch{$("rl-saved").hidden=true;alert("Impossibile salvare in questo browser. Esporta la scheda come JSON.");}
  }
  function exportPlan(){
    const blob=new Blob([JSON.stringify(collect(),null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob), link=document.createElement("a");
    link.href=url;link.download="valeya-revenue-leak-scheda.json";link.click();URL.revokeObjectURL(url);
  }
  $("rl-to-plan").addEventListener("click",()=>{
    if(!chosenIssue()&&!$("rl-manual-issue").value.trim()){ $("rl-manual-issue").focus();$("rl-manual-issue").setCustomValidity("Seleziona un rilievo oppure descrivi il problema.");$("rl-manual-issue").reportValidity();return;}
    $("rl-manual-issue").setCustomValidity("");
    const issue=chosenIssue(),rec=issue?recommendation(issue):null;
    $("rl-selected-problem").innerHTML='<span class="rl-kicker">PROBLEMA SCELTO</span><strong>'+escapeHTML(currentProblem())+'</strong><p>Obiettivo: '+escapeHTML(goalLabels[$("rl-goal").value])+'</p>';
    if(!$("rl-action").value.trim()) $("rl-action").value=rec?.action||"Verifica il percorso attuale e individua il passaggio che ostacola il contatto.";
    if(rec){$("rl-source").value=rec.source;$("rl-kpi").value=rec.kpi;}
    showStep(2);
  });
  $("rl-to-measure").addEventListener("click",()=>{
    if(!$("rl-action").value.trim()){$("rl-action").focus();$("rl-action").setCustomValidity("Descrivi l'intervento prima di procedere.");$("rl-action").reportValidity();return;}
    $("rl-action").setCustomValidity("");
    showStep(3);
  });
  document.querySelectorAll("[data-back]").forEach(btn=>btn.addEventListener("click",()=>showStep(Number(btn.dataset.back))));
  document.querySelectorAll(".rl-step").forEach(btn=>btn.addEventListener("click",()=>{const target=Number(btn.dataset.step);if(target<=state.step)showStep(target);}));
  ["rl-before","rl-after"].forEach(id=>$(id).addEventListener("input",updateResult));
  $("rl-save").addEventListener("click",save);
  $("rl-export").addEventListener("click",exportPlan);
  $("rl-remove-audit").addEventListener("click",()=>{
    try{sessionStorage.removeItem("valeyaAuditReport");}catch{}
    state.report=null;state.selectedIssue=null;$("rl-audit-source").hidden=true;
    $("rl-issue-count").textContent="0 rilievi importati";
    $("rl-issue-list").innerHTML='<div class="rl-empty">Report rimosso. Puoi descrivere manualmente il problema.</div>';
  });
  try{
    const raw=sessionStorage.getItem("valeyaAuditReport");
    const report=raw?JSON.parse(raw):null;
    if(report?.product==="Audit Valeya"&&Array.isArray(report.issues)){
      state.report=report;
      if(report.issues.length)state.selectedIssue=0;
      renderReport();
      if(report.issues[0]){
        const rec=recommendation(report.issues[0]);
        $("rl-action").value=rec.action;$("rl-source").value=rec.source;$("rl-kpi").value=rec.kpi;
      }
    }
  }catch{}
  showStep(1);
})();