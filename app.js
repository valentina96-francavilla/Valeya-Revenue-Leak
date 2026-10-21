(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const state={step:1,report:null,selectedIssue:null,saved:false,planId:null,measurements:[]};
  const REPORT_KEY="valeyaAuditReport";
  const REPORT_LATEST="valeyaAuditLatestReportId";
  const PLANS_KEY="valeyaRevenueLeakPlans";
  const escapeHTML=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const fmt=value=>new Intl.NumberFormat("it-IT",{maximumFractionDigits:2}).format(value);
  const makeId=()=>globalThis.crypto?.randomUUID?crypto.randomUUID():"vl-"+Date.now()+"-"+Math.random().toString(36).slice(2,10);
  const kpiLabels={leads:"Numero di richieste valide",lead_rate:"Tasso di conversione visita → richiesta",calls:"Telefonate provenienti dal sito",bookings:"Prenotazioni completate",quotes:"Preventivi richiesti",organic:"Clic organici pertinenti",task:"Completamento del percorso / task",revenue:"Ricavi attribuibili al canale",technical:"Metrica tecnica pertinente (es. LCP)"};
  const goalLabels={leads:"Ricevere più richieste di contatto",calls:"Ricevere più telefonate",booking:"Ottenere più prenotazioni",quotes:"Ricevere più richieste di preventivo",sales:"Aumentare gli acquisti online",seo:"Aumentare il traffico organico qualificato"};
  function recommendation(issue){
    const id=String(issue.id||"").toLowerCase(),title=String(issue.title||"").toLowerCase();
    if(/largest-contentful-paint|speed-index|first-contentful-paint|interactive|render-blocking|unused-javascript|unused-css|image-delivery|offscreen-images|modern-image|server-response-time|redirects|font-display|cache/.test(id))return {action:"Verifica la causa del rallentamento e correggi il problema solo dopo averlo riprodotto.",source:"analytics",kpi:"technical"};
    if(/contrast|tap-target|target-size|label-content|aria|accessibility|button-name|link-name/.test(id)||/accessib|contrasto|pulsante|etichetta/.test(title))return {action:"Testa manualmente il componente da smartphone e tastiera, poi correggi il problema osservato.",source:"manual",kpi:"task"};
    if(/document-title|meta-description|canonical|robots|crawlable|link-text|http-status-code|hreflang|structured-data/.test(id)||/seo|title|descrizione|indicizz/.test(title))return {action:"Verifica che il rilievo sia applicabile e correggi la pagina se necessario.",source:"search",kpi:"organic"};
    return {action:"Conferma manualmente che il rilievo sia un problema reale per il percorso del cliente.",source:"manual",kpi:"task"};
  }
  function safeGet(storage,key){try{return storage.getItem(key);}catch{return null;}}
  function readPlans(){try{const parsed=JSON.parse(localStorage.getItem(PLANS_KEY)||"[]");return Array.isArray(parsed)?parsed:[];}catch{return [];}}
  function writePlans(plans){localStorage.setItem(PLANS_KEY,JSON.stringify(plans));}
  function showStep(step){
    state.step=step;
    document.querySelectorAll(".rl-panel-step").forEach(panel=>{const active=Number(panel.dataset.panel)===step;panel.hidden=!active;panel.classList.toggle("active",active);});
    document.querySelectorAll(".rl-step").forEach(btn=>{const n=Number(btn.dataset.step);btn.classList.toggle("active",n===step);btn.classList.toggle("done",n<step);});
    if(step===4){renderMeasurement();renderMeasurementHistory();}
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function chosenIssue(){
    if($("rl-manual-issue").value.trim())return null;
    if(state.selectedIssue!==null&&state.report?.issues?.[state.selectedIssue])return state.report.issues[state.selectedIssue];
    return null;
  }
  function currentProblem(){return $("rl-manual-issue").value.trim()||(chosenIssue()?.title)||"Problema commerciale da verificare";}
  function renderReport(){
    const box=$("rl-audit-source"),report=state.report;if(!report)return;
    box.hidden=false;$("rl-audit-title").textContent="Audit collegato · "+(report.reportId||"report precedente");
    $("rl-audit-url").textContent=(report.url||"URL non disponibile")+" · "+(report.generatedAt?new Date(report.generatedAt).toLocaleString("it-IT"):"data non disponibile");
    $("rl-audit-scores").innerHTML=(report.scores||[]).map(s=>'<div class="rl-score"><span>'+escapeHTML(s.category)+'</span><strong>'+(Number.isFinite(s.score)?escapeHTML(s.score)+"/100":"N/D")+'</strong></div>').join("");
    const issues=report.issues||[];
    $("rl-issue-count").textContent=issues.length+" rilievi importati";
    $("rl-issue-list").innerHTML=issues.length?issues.map((issue,index)=>'<button type="button" class="rl-issue '+(index===state.selectedIssue?"selected":"")+'" data-issue="'+index+'"><span class="rl-issue-radio">'+(index===state.selectedIssue?"✓":"")+'</span><span class="rl-issue-copy"><strong>'+escapeHTML(issue.title)+'</strong><small>'+escapeHTML(issue.description||"Rilievo tecnico da verificare")+'</small><small>'+escapeHTML(issue.categoryLabel||issue.category||"Categoria non specificata")+' · Priorità '+escapeHTML(issue.priority||"da verificare")+' · Confidenza '+escapeHTML(issue.confidenceLabel||"non indicata")+'</small></span></button>').join(""):'<div class="rl-empty">Il report non contiene rilievi. Descrivi un problema commerciale osservato qui sotto.</div>';
    $("rl-issue-list").querySelectorAll("[data-issue]").forEach(btn=>btn.addEventListener("click",()=>{
      state.selectedIssue=Number(btn.dataset.issue);$("rl-manual-issue").value="";
      const rec=recommendation(state.report.issues[state.selectedIssue]);
      $("rl-issue-list").querySelectorAll(".rl-issue").forEach(x=>{const active=Number(x.dataset.issue)===state.selectedIssue;x.classList.toggle("selected",active);x.querySelector(".rl-issue-radio").textContent=active?"✓":"";});
      $("rl-action").value=rec.action;$("rl-source").value=rec.source;$("rl-kpi").value=rec.kpi;
    }));
  }
  function renderMeasurement(){
    const problem=currentProblem(),kpi=kpiLabels[$("rl-kpi").value]||"Metrica da definire";
    $("rl-selected-problem").innerHTML='<span class="rl-kicker">PROBLEMA SCELTO</span><strong>'+escapeHTML(problem)+'</strong><p>Obiettivo: '+escapeHTML(goalLabels[$("rl-goal").value]||"Migliorare il risultato commerciale")+'</p>';
    $("rl-measure-summary").innerHTML='<div><span>Problema</span><strong>'+escapeHTML(problem)+'</strong></div><div><span>Metrica da misurare</span><strong>'+escapeHTML(kpi)+'</strong></div><div><span>Fonte dati</span><strong>'+escapeHTML($("rl-source").selectedOptions[0]?.textContent||"Da definire")+'</strong></div><div><span>Obiettivo</span><strong>'+($("rl-target").value.trim()?escapeHTML($("rl-target").value):"Non definito")+'</strong></div>';
    $("rl-before-help").textContent="Valore di "+kpi.toLocaleLowerCase("it")+" nel periodo iniziale.";
    $("rl-after-help").textContent="Valore osservato della stessa metrica nel periodo successivo.";
    $("rl-kpi-direction").value=state.kpiDirection||$("rl-kpi-direction").value||"increase";
    $("rl-kpi-unit").value=state.kpiUnit||$("rl-kpi-unit").value||"";
    renderMeasurementHistory();
    updateResult();
  }
  function renderMeasurementHistory(){
    const box=$("rl-measurements-history");if(!box)return;
    const items=state.measurements||[];
    if(!items.length){box.innerHTML='<div class="rl-empty">Nessuna misurazione registrata. Le nuove verifiche verranno aggiunte quando salvi un risultato osservato.</div>';return;}
    box.innerHTML=items.slice().reverse().map(m=>'<article class="rl-saved-plan"><div><strong>'+escapeHTML(m.value)+(m.unit?' '+escapeHTML(m.unit):'')+'</strong><p>'+escapeHTML(m.period||"Periodo non specificato")+' · '+escapeHTML(m.source||"Fonte non specificata")+'</p><small>Registrata '+escapeHTML(m.recordedAt?new Date(m.recordedAt).toLocaleString("it-IT"):"data non disponibile")+(m.notes?' · '+escapeHTML(m.notes):'')+'</small></div></article>').join("");
  }
  function updateResult(){
    const before=$("rl-before").value,after=$("rl-after").value,box=$("rl-result");
    if(before===""||after===""||!Number.isFinite(Number(before))||!Number.isFinite(Number(after))){box.classList.remove("has-value","negative");box.innerHTML='<span class="rl-result-icon">↗</span><div><strong>Risultato non ancora disponibile</strong><p>Inserisci valore iniziale e valore osservato per calcolare la variazione. Il nome della metrica e i periodi sono salvati insieme ai numeri.</p></div>';return;}
    const b=Number(before),a=Number(after),diff=a-b,pct=b>0?diff/b*100:null;
    const direction=$("rl-kpi-direction")?.value||"increase";
    const better=diff===0?null:(direction==="increase"?diff>0:diff<0);
    box.classList.toggle("has-value",better===true);box.classList.toggle("negative",better===false);
    const headline=diff===0?"Nessuna variazione osservata":better?"Variazione nella direzione desiderata":"Variazione nella direzione opposta";
    const unit=$("rl-kpi-unit")?.value.trim()||"unità";
    const change=(diff>0?"+":"")+fmt(diff)+" "+unit+(pct===null?" (variazione percentuale non calcolabile)":" ("+(pct>0?"+":"")+fmt(pct)+"%)");
    const target=$("rl-target").value.trim();let goal="";
    if(target!==""&&Number.isFinite(Number(target))){const t=Number(target),reached=direction==="increase"?a>=t:a<=t;goal=" Obiettivo "+fmt(t)+" "+unit+": "+(reached?"raggiunto":"non ancora raggiunto")+".";}
    box.innerHTML='<span class="rl-result-icon">'+(better===true?"↗":better===false?"↘":"=")+'</span><div><strong>'+headline+': '+escapeHTML(change)+'</strong><p>Confronto descrittivo fra '+escapeHTML($("rl-before-period").value||"periodo iniziale non specificato")+' e '+escapeHTML($("rl-after-period").value||"periodo successivo non specificato")+'.'+escapeHTML(goal)+' Non dimostra da solo causalità.</p></div>';
  }
  function collect(){
    return {schemaVersion:"2.0",product:"Valeya Revenue Leak",planId:state.planId||makeId(),reportId:state.report?.reportId||null,reportUrl:state.report?.url||"",reportGeneratedAt:state.report?.generatedAt||null,site:state.report?.url||"",businessType:$("rl-business").value,goal:$("rl-goal").value,problem:currentProblem(),auditIssue:chosenIssue(),auditIssueId:chosenIssue()?.id||null,action:$("rl-action").value.trim(),interventionStatus:$("rl-intervention-status").value,owner:$("rl-owner").value.trim(),plannedDate:$("rl-planned-date").value,implementedDate:$("rl-implemented-date").value,workNotes:$("rl-work-notes").value.trim(),source:$("rl-source").value,kpi:$("rl-kpi").value,kpiLabel:kpiLabels[$("rl-kpi").value]||"Metrica da definire",kpiDirection:$("rl-kpi-direction").value,kpiUnit:$("rl-kpi-unit").value.trim(),window:$("rl-window").value,beforePeriod:$("rl-before-period").value.trim(),before:$("rl-before").value,target:$("rl-target").value,afterPeriod:$("rl-after-period").value.trim(),after:$("rl-after").value,reviewDate:$("rl-review-date").value,notes:$("rl-notes").value.trim(),measurements:state.measurements||[],status:$("rl-intervention-status").value,updatedAt:new Date().toISOString(),auditReportSnapshot:state.report?{reportId:state.report.reportId||null,url:state.report.url||"",generatedAt:state.report.generatedAt||null,strategy:state.report.strategy||null}:null};
  }
  function save(){
    const draft=collect();
    try{
      if(draft.after!==""&&Number.isFinite(Number(draft.after))){
        const signature=[draft.afterPeriod,draft.after,draft.notes].join("|");
        if(!(state.measurements||[]).some(m=>m.signature===signature))state.measurements.push({measurementId:makeId(),signature,period:draft.afterPeriod||"",value:Number(draft.after),unit:draft.kpiUnit||"",source:draft.source,notes:draft.notes||"",recordedAt:new Date().toISOString()});
      }
      const data=collect();data.measurements=state.measurements;
      const plans=readPlans(),index=plans.findIndex(p=>p.planId===data.planId);
      if(index>=0)plans[index]=data;else plans.unshift(data);
      writePlans(plans.slice(0,100));state.planId=data.planId;state.saved=true;$("rl-saved").hidden=false;renderSavedPlans();renderMeasurementHistory();
    }catch{$("rl-saved").hidden=true;alert("Impossibile salvare in questo browser. Esporta la scheda come JSON.");}
  }
  function exportPlan(){
    const blob=new Blob([JSON.stringify(collect(),null,2)],{type:"application/json;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download="valeya-revenue-leak-scheda.json";document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  }
  function restorePlan(plan){
    state.planId=plan.planId||null;state.report=null;state.selectedIssue=null;state.measurements=Array.isArray(plan.measurements)?plan.measurements:[];state.kpiDirection=plan.kpiDirection||"increase";state.kpiUnit=plan.kpiUnit||"";
    if(plan.reportId){
      try{const raw=localStorage.getItem("valeyaAuditReport:"+plan.reportId);if(raw)state.report=JSON.parse(raw);}catch{}
    }
    if(!state.report&&plan.auditIssue)state.report={product:"Audit Valeya",reportId:plan.reportId||null,url:plan.reportUrl||plan.site||"",generatedAt:plan.reportGeneratedAt||null,scores:[],issues:[plan.auditIssue]};
    if(state.report&&plan.auditIssueId)state.selectedIssue=(state.report.issues||[]).findIndex(i=>i.id===plan.auditIssueId);
    if(state.selectedIssue<0)state.selectedIssue=null;
    $("rl-business").value=plan.businessType||"local";$("rl-goal").value=plan.goal||"leads";$("rl-manual-issue").value=plan.auditIssue?"":(plan.problem||"");
    $("rl-action").value=plan.action||"";$("rl-intervention-status").value=plan.interventionStatus||plan.status||"da-pianificare";$("rl-owner").value=plan.owner||"";$("rl-planned-date").value=plan.plannedDate||"";$("rl-implemented-date").value=plan.implementedDate||"";$("rl-work-notes").value=plan.workNotes||"";$("rl-source").value=plan.source||"manual";$("rl-kpi").value=plan.kpi||"leads";$("rl-kpi-direction").value=plan.kpiDirection||"increase";$("rl-kpi-unit").value=plan.kpiUnit||"";$("rl-window").value=plan.window||"14";
    $("rl-before-period").value=plan.beforePeriod||"";$("rl-before").value=plan.before??"";$("rl-target").value=plan.target??"";$("rl-after-period").value=plan.afterPeriod||"";$("rl-after").value=plan.after??"";$("rl-review-date").value=plan.reviewDate||"";$("rl-notes").value=plan.notes||"";
    if(state.report)renderReport();else{$("rl-audit-source").hidden=true;$("rl-issue-list").innerHTML='<div class="rl-empty">Scheda manuale: nessun report Audit collegato.</div>';}
    renderMeasurement();showStep(1);$("rl-saved").hidden=true;
  }
  function renderSavedPlans(){
    const plans=readPlans(),box=$("rl-saved-plans-list");
    if(!plans.length){box.innerHTML='<div class="rl-empty">Nessuna scheda salvata. Completa una scheda e premi “Salva scheda”.</div>';return;}
    box.innerHTML=plans.map(p=>'<article class="rl-saved-plan"><div><strong>'+escapeHTML(p.problem||"Problema senza titolo")+'</strong><p>'+escapeHTML(p.kpiLabel||kpiLabels[p.kpi]||"Metrica non definita")+' · '+escapeHTML(({ "da-pianificare":"Da pianificare","pianificato":"Pianificato","in-corso":"In corso","implementato":"Implementato","in-attesa-verifica":"In attesa della verifica","verificato":"Verificato","da-rivedere":"Da rivedere","archiviato":"Archiviato"})[p.interventionStatus||p.status]||"Da pianificare")+'</p><small>Aggiornata '+escapeHTML(p.updatedAt?new Date(p.updatedAt).toLocaleString("it-IT"):"data non disponibile")+'</small></div><div class="rl-saved-plan-actions"><button type="button" class="rl-secondary" data-open-plan="'+escapeHTML(p.planId)+'">Apri</button><button type="button" class="rl-secondary" data-delete-plan="'+escapeHTML(p.planId)+'">Elimina</button></div></article>').join("");
    box.querySelectorAll("[data-open-plan]").forEach(btn=>btn.addEventListener("click",()=>{const p=readPlans().find(x=>x.planId===btn.dataset.openPlan);if(p)restorePlan(p);}));
    box.querySelectorAll("[data-delete-plan]").forEach(btn=>btn.addEventListener("click",()=>{if(!confirm("Eliminare questa scheda salvata da questo browser?"))return;writePlans(readPlans().filter(p=>p.planId!==btn.dataset.deletePlan));renderSavedPlans();}));
  }
  function loadReport(){
    const params=new URLSearchParams(location.search),requested=params.get("report");
    let report=null;
    try{
      if(requested){const raw=localStorage.getItem("valeyaAuditReport:"+requested);if(raw)report=JSON.parse(raw);}
      if(!report){const latest=localStorage.getItem("valeyaAuditLatestReportId"),raw=latest&&localStorage.getItem("valeyaAuditReport:"+latest);if(raw)report=JSON.parse(raw);}
      if(!report){const raw=sessionStorage.getItem(REPORT_KEY);if(raw)report=JSON.parse(raw);}
    }catch{}
    if(report?.product==="Audit Valeya"&&Array.isArray(report.issues)){
      state.report=report;if(report.issues.length)state.selectedIssue=0;renderReport();
      const first=report.issues[0];if(first){const rec=recommendation(first);$("rl-action").value=rec.action;$("rl-source").value=rec.source;$("rl-kpi").value=rec.kpi;}
    }
  }
  $("rl-to-plan").addEventListener("click",()=>{
    if(!currentProblem()||currentProblem()==="Problema commerciale da verificare"){$("rl-manual-issue").focus();$("rl-manual-issue").setCustomValidity("Seleziona un rilievo oppure descrivi il problema.");$("rl-manual-issue").reportValidity();return;}
    $("rl-manual-issue").setCustomValidity("");
    const issue=chosenIssue(),rec=issue?recommendation(issue):null;
    $("rl-selected-problem").innerHTML='<span class="rl-kicker">PROBLEMA SCELTO</span><strong>'+escapeHTML(currentProblem())+'</strong><p>Obiettivo: '+escapeHTML(goalLabels[$("rl-goal").value]||"Migliorare il risultato commerciale")+'</p>';
    if(! $("rl-action").value.trim())$("rl-action").value=rec?.action||"Verifica il percorso attuale e individua il passaggio che ostacola il contatto.";
    if(rec){$("rl-source").value=rec.source;$("rl-kpi").value=rec.kpi;}
    showStep(2);
  });
  $("rl-to-measure").addEventListener("click",()=>{
    if(!$("rl-action").value.trim()){$("rl-action").focus();$("rl-action").setCustomValidity("Descrivi l'intervento prima di procedere.");$("rl-action").reportValidity();return;}
    $("rl-action").setCustomValidity("");showStep(3);
  });
  $("rl-to-measurement").addEventListener("click",()=>{
    if($("rl-intervention-status").value==="implementato"&&!$("rl-implemented-date").value){
      $("rl-implemented-date").focus();$("rl-implemented-date").setCustomValidity("Inserisci la data effettiva di implementazione.");$("rl-implemented-date").reportValidity();return;
    }
    $("rl-implemented-date").setCustomValidity("");showStep(4);
  });
  document.querySelectorAll("[data-back]").forEach(btn=>btn.addEventListener("click",()=>showStep(Number(btn.dataset.back))));
  document.querySelectorAll(".rl-step").forEach(btn=>btn.addEventListener("click",()=>{const target=Number(btn.dataset.step);if(target<=state.step)showStep(target);}));
  $("rl-manual-issue").addEventListener("input",()=>{
    if($("rl-manual-issue").value.trim()){state.selectedIssue=null;$("rl-issue-list").querySelectorAll(".rl-issue").forEach(x=>{x.classList.remove("selected");x.querySelector(".rl-issue-radio").textContent="";});}
  });
  ["rl-before","rl-after","rl-target","rl-before-period","rl-after-period","rl-kpi-unit"].forEach(id=>$(id).addEventListener("input",updateResult));
  ["rl-kpi","rl-kpi-direction"].forEach(id=>$(id).addEventListener("change",()=>{if(state.step===4)renderMeasurement();else updateResult();}));
  $("rl-save").addEventListener("click",save);$("rl-export").addEventListener("click",exportPlan);$("rl-refresh-plans").addEventListener("click",renderSavedPlans);
  $("rl-remove-audit").addEventListener("click",()=>{state.report=null;state.selectedIssue=null;$("rl-audit-source").hidden=true;$("rl-issue-count").textContent="0 rilievi importati";$("rl-issue-list").innerHTML='<div class="rl-empty">Report rimosso. Puoi descrivere manualmente il problema.</div>';});
  loadReport();renderSavedPlans();showStep(1);
})();