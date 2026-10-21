(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const form = $("auditForm");
  const urlInput = $("siteUrl");
  const strategyInput = $("strategy");
  const runButton = $("runAudit");
  const statusBox = $("status");
  const loading = $("loading");
  const results = $("results");
  const exportButton = $("exportReport");
  const printButton = $("printReport");
  let lastReport = null;
  let allIssues = [];

  const categories = [
    { key:"performance", label:"Performance", note:"Velocità e stabilità del caricamento" },
    { key:"accessibility", label:"Accessibilità", note:"Possibili barriere per le persone" },
    { key:"best-practices", label:"Best practice", note:"Qualità tecnica e sicurezza di base" },
    { key:"seo", label:"SEO", note:"Controlli SEO on-page essenziali" }
  ];
  const categoryLabels = {performance:"Performance",accessibility:"Accessibilità","best-practices":"Best practice",seo:"SEO",other:"Altri controlli"};
  const priorityLabels = {high:"Alta",medium:"Media",low:"Bassa"};
  const safe = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const scoreState = score => score >= .9 ? "good" : score >= .5 ? "mid" : "bad";
  const scoreText = score => Number.isFinite(score) ? Math.round(score*100) : "N/D";
  const makeId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : "audit-"+Date.now()+"-"+Math.random().toString(36).slice(2,10));

  function setStatus(message,type="info"){statusBox.className="status show "+type;statusBox.textContent=message;}
  function normalizeUrl(raw){
    let parsed;
    try{parsed=new URL(/^https?:\/\//i.test(raw.trim())?raw.trim():"https://"+raw.trim());}
    catch{throw new Error("Inserisci un indirizzo web valido, ad esempio https://esempio.it.");}
    if(!["http:","https:"].includes(parsed.protocol))throw new Error("Sono supportati solo gli indirizzi HTTP e HTTPS.");
    if(!parsed.hostname||!parsed.hostname.includes(".")||parsed.hostname==="localhost"||parsed.hostname.endsWith(".local"))throw new Error("Inserisci il dominio pubblico di un sito, non un indirizzo locale.");
    if(parsed.username||parsed.password)throw new Error("Per sicurezza, l'indirizzo non può contenere credenziali.");
    return parsed.href;
  }
  async function runPageSpeed(target,strategy){
    const endpoint="https://valeya-audit-revenue-dashboard.vercel.app/api/audit";
    let response;
    try{response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({url:target,strategy})});}
    catch{throw new Error("Impossibile raggiungere il servizio Audit. Verifica la connessione e riprova.");}
    let payload={};try{payload=await response.json();}catch{}
    if(!response.ok)throw new Error(payload?.error?.message||("Analisi non riuscita (HTTP "+response.status+")."));
    if(!payload?.lighthouseResult?.categories||!payload?.lighthouseResult?.audits)throw new Error("Google ha restituito una risposta incompleta. Riprova.");
    return payload;
  }
  function categoryForAudit(auditId,lighthouse){
    for(const [key,cat] of Object.entries(lighthouse.categories||{})){
      if((cat.auditRefs||[]).some(ref=>ref.id===auditId))return key;
    }
    return "other";
  }
  function structuredEvidence(audit){
    const d=audit.details||{};
    const evidence={type:d.type||null};
    ["overallSavingsMs","overallSavingsBytes","overallSavingsWastedMs","overallSavingsWastedBytes","scale","summary","source","url","metricSavings","debugData","headings"].forEach(k=>{if(d[k]!==undefined)evidence[k]=d[k];});
    if(Array.isArray(d.items)){evidence.itemCount=d.items.length;evidence.items=d.items.slice(0,40);}
    if(Array.isArray(d.nodes)){evidence.nodeCount=d.nodes.length;evidence.nodes=d.nodes.slice(0,25);}
    if(Array.isArray(d.sortedBy))evidence.sortedBy=d.sortedBy;
    if(d.type==="opportunity"||d.type==="table"||d.type==="list"||d.type==="criticalrequestchain")evidence.detailType=d.type;
    return evidence;
  }
  function inferCategory(auditId,lighthouse){
    const key=categoryForAudit(auditId,lighthouse);
    return {key,label:categoryLabels[key]||categoryLabels.other};
  }
  function effortFor(id,audit){
    if(audit.details?.overallSavingsMs>1000||audit.details?.overallSavingsBytes>500000||/render-blocking|unused-javascript|unused-css|legacy-javascript|image-delivery|modern-image|server-response-time|third-party/.test(id))return {key:"high",label:"Alto"};
    if(/contrast|tap-target|target-size|document-title|meta-description|link-text|button-name|image-alt|label-content|robots|canonical|crawlable|http-status-code/.test(id))return {key:"low",label:"Basso"};
    return {key:"medium",label:"Medio"};
  }
  function verificationFor(id,category){
    if(category==="performance")return ["Ripeti l'analisi sulla stessa URL e sullo stesso dispositivo.","Confronta la metrica interessata e, se disponibile, i dati reali degli utenti.","Registra data, condizioni del test e differenza osservata."];
    if(category==="accessibility")return ["Controlla manualmente il componente segnalato con tastiera e tecnologie assistive pertinenti.","Verifica il caso concreto sulla pagina, non soltanto il punteggio automatico.","Ripeti lo stesso test dopo la correzione."];
    if(category==="seo")return ["Verifica il sorgente HTML e la risposta della pagina.","Controlla l'esito con Search Console quando pertinente e disponibile.","Dopo la modifica, registra la data e confronta dati di ricerca su periodi adeguati."];
    return ["Riproduci il rilievo sulla pagina interessata.","Conferma che sia applicabile al sito e all'obiettivo aziendale.","Ripeti il controllo dopo la modifica e conserva l'evidenza."];
  }
  function enrichIssue(audit,lighthouse){
    const category=inferCategory(audit.id,lighthouse),score=audit.score;
    const evidence=structuredEvidence(audit),effort=effortFor(audit.id,audit);
    const savings=Number(audit.details?.overallSavingsMs||0)+Number(audit.details?.overallSavingsBytes||0)/1000;
    const severe=score<.5, meaningful=savings>0||category.key==="accessibility"||category.key==="seo";
    const priorityScore=(severe?3:score<.75?2:1)+(savings>1000?2:savings>100?1:0)+(["accessibility","seo"].includes(category.key)&&severe?1:0);
    const priority=priorityScore>=5?"high":priorityScore>=3?"medium":"low";
    const confidence=audit.scoreDisplayMode==="numeric"||audit.scoreDisplayMode==="metricSavings"?((audit.details&&Object.keys(audit.details).length)?"high":"medium"):"medium";
    let rationale=priority==="high"?"Punteggio molto basso e/o risparmio tecnico potenziale rilevante; verifica prima di pianificare.":priority==="medium"?"Il controllo presenta margini di miglioramento; confrontalo con obiettivo e costo dell'intervento.":"Segnale da approfondire: il punteggio da solo non dimostra un impatto concreto.";
    if(savings>0)rationale+=" Lighthouse stima un'opportunità tecnica, non una perdita economica.";
    return {id:audit.id,title:audit.title||audit.id,description:audit.description||"Controllo da approfondire.",displayValue:audit.displayValue||"",score,scoreOutOf100:scoreText(score),scoreDisplayMode:audit.scoreDisplayMode||"unknown",category:category.key,categoryLabel:category.label,priority,priorityScore,priorityRationale:rationale,confidence,confidenceLabel:confidence==="high"?"Alta":"Media",effort:effort.key,effortLabel:effort.label,group:audit.details?.type==="opportunity"?"Opportunità":"Controllo",evidence,verificationSteps:verificationFor(audit.id,category.key),helpUrl:"https://developer.chrome.com/docs/lighthouse/"};
  }
  function getIssues(data){
    const lh=data.lighthouseResult;
    return Object.values(lh.audits||{}).filter(a=>a&&typeof a.score==="number"&&a.score<.9&&!["notApplicable","manual","informative","debugdata"].includes(a.scoreDisplayMode)&&!["screenshot-thumbnails","final-screenshot","full-page-screenshot","largest-contentful-paint-element"].includes(a.id)).map(a=>enrichIssue(a,lh)).sort((a,b)=>({high:0,medium:1,low:2}[a.priority]-({high:0,medium:1,low:2}[b.priority])||a.score-b.score));
  }
  function renderScores(data){
    const cats=data.lighthouseResult.categories||{};
    $("scoreCards").innerHTML=categories.map(c=>{const score=cats[c.key]?.score,state=Number.isFinite(score)?scoreState(score):"mid",value=Number.isFinite(score)?Math.round(score*100):"N/D",width=Number.isFinite(score)?Math.max(0,Math.min(100,score*100)):0,note=Number.isFinite(score)?(score>=.9?"Buono":score>=.5?"Da migliorare":"Critico"):"Dato non disponibile";
      return '<article class="panel score-card score-'+state+'"><div class="score-top"><span>'+c.label+'</span><span class="score-dot"></span></div><div class="score-number">'+value+(Number.isFinite(score)?'<span style="font-size:14px;letter-spacing:0">/100</span>':'')+'</div><div class="score-track"><span style="width:'+width+'%"></span></div><div class="score-note">'+note+' · '+c.note+'</div></article>';
    }).join("");
  }
  function filteredIssues(){
    const q=($("issueSearch")?.value||"").trim().toLocaleLowerCase("it");
    const cat=$("issueCategoryFilter")?.value||"",priority=$("issuePriorityFilter")?.value||"",sort=$("issueSort")?.value||"priority";
    let list=allIssues.filter(i=>(!q||[i.id,i.title,i.description,i.categoryLabel].join(" ").toLocaleLowerCase("it").includes(q))&&(!cat||i.category===cat)&&(!priority||i.priority===priority));
    if(sort==="score")list.sort((a,b)=>a.score-b.score);
    else if(sort==="effort")list.sort((a,b)=>({low:0,medium:1,high:2}[a.effort]-{low:0,medium:1,high:2}[b.effort]));
    else if(sort==="category")list.sort((a,b)=>a.categoryLabel.localeCompare(b.categoryLabel,"it")||a.score-b.score);
    else list.sort((a,b)=>({high:0,medium:1,low:2}[a.priority]-{high:0,medium:1,low:2}[b.priority]||a.score-b.score));
    return list;
  }
  function renderIssueList(){
    const list=filteredIssues();
    $("issueCount").textContent=list.length+" di "+allIssues.length+" rilievi · priorità indicativa basata su gravità, categoria e opportunità tecnica.";
    if(!list.length){$("issueList").innerHTML='<div class="empty">Nessun rilievo corrisponde ai filtri. Modifica la ricerca o seleziona altre categorie.</div>';return;}
    $("issueList").innerHTML=list.map(i=>{
      const desc=String(i.description).replace(/\s*\[Learn more\]\([^)]*\)/gi,"").replace(/\s*\[.*?\]\([^)]*\)/g,"");
      const evidence=i.evidence||{};
      const evidenceSummary=[evidence.overallSavingsMs?("Risparmio stimato: "+Math.round(evidence.overallSavingsMs)+" ms"):"",evidence.overallSavingsBytes?("Byte potenzialmente risparmiabili: "+Math.round(evidence.overallSavingsBytes)):"",i.displayValue].filter(Boolean).join(" · ");
      return '<article class="issue '+i.priority+'" data-category="'+safe(i.category)+'"><div class="issue-icon">'+(i.priority==="high"?"!":i.priority==="medium"?"↗":"i")+'</div><div class="issue-body"><div class="issue-title-row"><strong>'+safe(i.title)+'</strong><span class="issue-priority priority-'+i.priority+'">Priorità '+priorityLabels[i.priority].toLowerCase()+'</span></div><p>'+safe(desc)+'</p><div class="issue-meta"><span>'+safe(i.categoryLabel)+'</span><span>Confidenza '+safe(i.confidenceLabel.toLowerCase())+'</span><span>Sforzo '+safe(i.effortLabel.toLowerCase())+'</span>'+ (evidenceSummary?'<span>'+safe(evidenceSummary)+'</span>':'')+'</div><p class="priority-rationale"><strong>Perché questa priorità:</strong> '+safe(i.priorityRationale)+'</p><details class="issue-details"><summary>Dettagli ed evidenze</summary><p><strong>Come verificarlo</strong></p><ol>'+i.verificationSteps.map(s=>'<li>'+safe(s)+'</li>').join("")+'</ol>'+(evidenceSummary?'<p>'+safe(evidenceSummary)+'</p>':'')+((evidence.items?.length||evidence.nodes?.length)?'<p><strong>Evidenze strutturate restituite da Lighthouse</strong></p><pre class="evidence-json">'+safe(JSON.stringify({type:evidence.type,itemCount:evidence.itemCount,items:(evidence.items||[]).slice(0,5),nodeCount:evidence.nodeCount,nodes:(evidence.nodes||[]).slice(0,3),summary:evidence.summary,source:evidence.source},null,2).slice(0,4500))+'</pre>':'')+'<p><strong>ID Lighthouse:</strong> <code>'+safe(i.id)+'</code></p><p><a href="'+safe(i.helpUrl)+'" target="_blank" rel="noopener noreferrer">Documentazione Lighthouse ↗</a></p></details></div></article>';
    }).join("");
  }
  function renderSummary(data,issues){
    const cats=data.lighthouseResult.categories||{},scored=categories.map(c=>({...c,score:cats[c.key]?.score})).filter(c=>Number.isFinite(c.score)),weakest=[...scored].sort((a,b)=>a.score-b.score)[0],high=issues.filter(i=>i.priority==="high").length,medium=issues.filter(i=>i.priority==="medium").length,strategy=data.lighthouseResult.configSettings?.formFactor||"mobile",date=data.analysisUTCTimestamp?new Date(data.analysisUTCTimestamp):new Date();
    $("reportSummary").innerHTML='<div class="summary-item"><span class="summary-n">01</span><div><strong>Parti dall’area più debole</strong><p>'+(weakest?safe(weakest.label)+" ha il punteggio più basso ("+Math.round(weakest.score*100)+"/100). Analizza prima i controlli associati.":"I punteggi di categoria non sono disponibili.")+'</p></div></div><div class="summary-item"><span class="summary-n">02</span><div><strong>Valuta le priorità motivate</strong><p>'+high+' priorità alte e '+medium+' medie. La classificazione è indicativa: verifica ogni rilievo prima di pianificare.</p></div></div><div class="summary-item"><span class="summary-n">03</span><div><strong>Conferma sul sito reale</strong><p>I test automatici non dimostrano da soli l’impatto su vendite, conversioni o posizionamento.</p></div></div><div class="summary-callout"><strong>Perimetro del report</strong>Analisi '+(strategy==="desktop"?"desktop":"mobile")+' · '+safe(date.toLocaleString("it-IT"))+'. È stata esaminata la singola pagina indicata, non l’intero sito.</div>';
  }
  function persistReport(report){
    const key="valeyaAuditReport:"+report.reportId;
    try{
      localStorage.setItem(key,JSON.stringify(report));
      localStorage.setItem("valeyaAuditLatestReportId",report.reportId);
      const ids=JSON.parse(localStorage.getItem("valeyaAuditReportIds")||"[]").filter(id=>id!==report.reportId);
      ids.unshift(report.reportId);localStorage.setItem("valeyaAuditReportIds",JSON.stringify(ids.slice(0,20)));
    }catch{}
    try{sessionStorage.setItem("valeyaAuditReport",JSON.stringify(report));}catch{}
  }
  function renderReport(data,target,strategy){
    const lh=data.lighthouseResult;
    allIssues=getIssues(data);
    renderScores(data);renderIssueList();renderSummary(data,allIssues);
    $("reportUrl").textContent=lh.finalUrl||target;
    $("reportDate").textContent="Analisi "+new Date(data.analysisUTCTimestamp||Date.now()).toLocaleString("it-IT")+" · "+(strategy==="mobile"?"Mobile":"Desktop");
    results.classList.add("show");
    lastReport={schemaVersion:"1.0",product:"Audit Valeya",reportId:makeId(),generatedAt:new Date().toISOString(),analysisTimestamp:data.analysisUTCTimestamp||null,url:target,finalUrl:lh.finalUrl||target,strategy,scores:categories.map(c=>({category:c.label,key:c.key,score:Number.isFinite(lh.categories?.[c.key]?.score)?Math.round(lh.categories[c.key].score*100):null})),issues:allIssues,lighthouseVersion:lh.lighthouseVersion||null,fetchTime:lh.fetchTime||null,environment:{formFactor:lh.configSettings?.formFactor||strategy,requestedUrl:lh.requestedUrl||target,finalUrl:lh.finalUrl||target},note:"Risultati automatici per una singola pagina. Priorità, confidenza e sforzo sono indicazioni euristiche, non stime di perdita economica."};
    persistReport(lastReport);
    $("revenueLeakLink").href="revenue-leak.html?report="+encodeURIComponent(lastReport.reportId);
    results.scrollIntoView({behavior:"smooth",block:"start"});
  }
  function restoreLatestReport(){
    try{
      const id=localStorage.getItem("valeyaAuditLatestReportId");
      const raw=id&&localStorage.getItem("valeyaAuditReport:"+id);
      if(raw){lastReport=JSON.parse(raw);allIssues=lastReport.issues||[];renderStoredReport(lastReport);}
    }catch{}
  }
  function renderStoredReport(report){
    if(!report||!Array.isArray(report.issues))return;
    const scoreCards=$("scoreCards");
    scoreCards.innerHTML=(report.scores||[]).map(s=>'<article class="panel score-card score-'+scoreState((s.score??0)/100)+'"><div class="score-top"><span>'+safe(s.category)+'</span><span class="score-dot"></span></div><div class="score-number">'+(s.score??"N/D")+(s.score!==null?'<span style="font-size:14px">/100</span>':"")+'</div><div class="score-track"><span style="width:'+Math.max(0,Math.min(100,s.score||0))+'%"></span></div></article>').join("");
    $("reportUrl").textContent=report.finalUrl||report.url;
    $("reportDate").textContent="Report recuperato · "+new Date(report.generatedAt).toLocaleString("it-IT")+" · "+(report.strategy==="mobile"?"Mobile":"Desktop");
    $("reportSummary").innerHTML='<div class="summary-item"><span class="summary-n">01</span><div><strong>Report recuperato</strong><p>Puoi riaprire i rilievi salvati e trasferirli a Revenue Leak.</p></div></div>';
    renderIssueList();results.classList.add("show");$("revenueLeakLink").href="revenue-leak.html?report="+encodeURIComponent(report.reportId);
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();let target;
    try{target=normalizeUrl(urlInput.value);}catch(error){setStatus(error.message,"error");return;}
    try{sessionStorage.removeItem("valeyaAuditReport");}catch{}
    const strategy=strategyInput.value;runButton.disabled=true;runButton.textContent="Analisi in corso…";loading.classList.add("show");results.classList.remove("show");
    setStatus("Analisi Lighthouse in corso. Può richiedere fino a un minuto.","info");
    try{const data=await runPageSpeed(target,strategy);renderReport(data,target,strategy);setStatus("Analisi completata. I rilievi includono priorità motivate, evidenze disponibili e istruzioni di verifica.","success");}
    catch(error){setStatus(error.message||"Si è verificato un errore imprevisto.","error");}
    finally{runButton.disabled=false;runButton.innerHTML='Avvia analisi gratuita <span aria-hidden="true">→</span>';loading.classList.remove("show");}
  });
  [ "issueSearch","issueCategoryFilter","issuePriorityFilter","issueSort" ].forEach(id=>$(id)?.addEventListener(id==="issueSearch"?"input":"change",renderIssueList));
  exportButton.addEventListener("click",()=>{
    if(!lastReport)return;
    const blob=new Blob([JSON.stringify(lastReport,null,2)],{type:"application/json;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download="audit-valeya-"+new URL(lastReport.url).hostname.replace(/[^a-z0-9.-]/gi,"-")+".json";document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  });
  printButton.addEventListener("click",()=>window.print());
  restoreLatestReport();
})();