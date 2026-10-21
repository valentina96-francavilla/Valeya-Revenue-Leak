(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const escapeHTML=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  function renderList(id,items,empty){
    const box=$(id);
    if(!items?.length){box.innerHTML='<div class="dash-empty">'+empty+'</div>';return;}
    box.innerHTML=items.map(item=>'<article class="dash-item"><strong>'+escapeHTML(item.title||"Problema senza titolo")+'</strong><small>'+escapeHTML(item.url||"URL non specificato")+(item.review_date?" · Verifica: "+escapeHTML(item.review_date):"")+'</small><a href="./revenue-leak.html?issue='+encodeURIComponent(item.id)+'">Apri scheda ↗</a></article>').join("");
  }
  async function load(){
    if(!window.ValeyaIntelligence?.getSession()?.access_token){$("dash-status").textContent="Accedi al workspace per vedere le attività reali. Non mostriamo dati demo come se fossero tuoi.";return;}
    $("dash-status").textContent="Aggiornamento delle attività…";
    try{
      const data=await window.ValeyaIntelligence.call("dashboard",{method:"GET"});
      $("due-count").textContent=data.counts?.dueReviews??0;
      $("critical-count").textContent=data.counts?.criticalOpen??0;
      $("waiting-count").textContent=data.counts?.awaitingMeasurement??0;
      renderList("due-list",data.dueReviews,"Nessuna verifica KPI in scadenza.");
      renderList("critical-list",data.criticalOpen,"Nessun problema critico aperto.");
      renderList("waiting-list",data.awaitingMeasurement,"Nessun intervento in attesa di misurazione.");
      $("dash-status").textContent="Dati aggiornati. Le priorità riflettono lo stato delle schede salvate nel workspace.";
    }catch(error){$("dash-status").textContent=error.message;["due-list","critical-list","waiting-list"].forEach(id=>$(id).innerHTML='<div class="dash-empty">Dati non disponibili.</div>');}
  }
  window.addEventListener("valeya-intelligence-auth",load);
  window.addEventListener("valeya-intelligence-ready",load);
  load();
})();