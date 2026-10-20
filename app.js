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
 el('cr').textContent=percent(d.v.conversion);
 el('crbar').style.width=Math.min(100,d.v.conversion/5*100)+'%';
 el('aov').textContent=money.format(d.v.order);
 el('potential').textContent=money.format(d.uplift);
 el('convvalue').innerHTML='+ '+money.format(d.uplift)+'<small>/ mese nello scenario</small>';
 el('aovvalue').innerHTML='Da misurare<small>con dati reali</small>';
 el('cartvalue').innerHTML='Da misurare<small>con dati reali</small>';
 el('simResult').textContent='+ '+money.format(d.uplift);
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
