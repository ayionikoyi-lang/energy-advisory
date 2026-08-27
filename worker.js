const SOURCES=[
["Ember","ember-climate.org"],["Agora Energiewende","agora-energiewende.de"],["E3G","e3g.org"],
["IEEFA","ieefa.org"],["IEA","iea.org"],["Montel News","montelnews.com"],["ICIS","icis.com"],
["Pexapark","pexapark.com"],["ACER","acer.europa.eu"],["BloombergNEF","bnef.com"]
];
const REGIONS=[
["EU Bodies & Frameworks",["energy.ec.europa.eu","acer.europa.eu","efrag.org","eur-lex.europa.eu"]],
["Germany / Central Europe",["bundesnetzagentur.de","bmwk.de","kfw.de","agora-energiewende.de"]],
["Spain",["miteco.gob.es","idae.es","ree.es","hacienda.gob.es"]],
["Poland",["gov.pl","nfosigw.gov.pl","pse.pl","czystepowietrze.gov.pl"]],
["Netherlands",["rvo.nl","rijksoverheid.nl","netbeheernederland.nl"]],
["Mediterranean",["gse.it","terna.it","admie.gr","exoikonomo.gov.gr"]],
["Market & Certification",["breeam.com","usgbc.org","pexapark.com","iea.org"]]
];
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...CORS,"Content-Type":"application/json"}});
const clean=s=>(s||"").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();
function tag(b,t){const m=b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`,"i"));return m?clean(m[1]):""}
function rss(xml){return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map(m=>{let b=m[0],lm=b.match(/<link[^>]*>([\s\S]*?)<\/link>/i);return{title:tag(b,"title"),url:lm?clean(lm[1]):"",date:tag(b,"pubDate"),snippet:tag(b,"description")}}).filter(x=>x.title&&x.url)}
async function news(domains,days){const q=`(${domains.map(d=>`site:${d}`).join(" OR ")}) energy gas power carbon LNG renewables PPA grid procurement after:${new Date(Date.now()-days*86400000).toISOString().slice(0,10)}`;const u="https://news.google.com/rss/search?q="+encodeURIComponent(q)+"&hl=en-GB&gl=GB&ceid=GB:en";const r=await fetch(u,{headers:{"User-Agent":"Energy-Advisory/1.0"}});return r.ok?rss(await r.text()):[]}
async function ai(env,prompt){
 if(!env.AI)throw Error("Cloudflare Workers AI is not configured.");
 const r=await env.AI.run("@cf/zai-org/glm-4.7-flash",{messages:[
 {role:"system",content:"You are a careful European energy-market adviser. Use only supplied current web evidence. Never invent facts, dates, prices or URLs. Separate evidence from inference."},
 {role:"user",content:prompt}],max_tokens:6000});
 return r?.response||"";
}
function parse(t){t=t.replace(/```json|```/gi,"").trim();let a=t.match(/\[[\s\S]*\]/),o=t.match(/\{[\s\S]*\}/);try{return JSON.parse(a?a[0]:o?o[0]:"null")}catch{return null}}
async function market(env,body){
 const chosen=body.sources?.length?SOURCES.filter(x=>body.sources.includes(x[0])):SOURCES;
 const raw=await news(chosen.map(x=>x[1]),7);const ev=raw.slice(0,45).map((x,i)=>`${i+1}. ${x.title}\n${x.date}\n${x.url}\n${x.snippet}`).join("\n\n");
 const t=await ai(env,`From this current web evidence, return ONLY JSON array, max 12 items. Focus on European gas, power, carbon/EUA, LNG, renewables/PPA, grids, supply/demand and procurement. Do not fabricate.
Format: [{"title":"","source":"","date":"","snippet":"","url":"","commodity":"","direction":"Bullish|Bearish|Neutral","importance":"High|Medium|Low"}]
EVIDENCE:\n${ev}`);return{items:parse(t)||[]};
}
async function regulatory(env,body){
 const chosen=body.regions?.length?REGIONS.filter(x=>body.regions.includes(x[0])):REGIONS;
 const raw=await news(chosen.flatMap(x=>x[1]),14);const ev=raw.slice(0,50).map((x,i)=>`${i+1}. ${x.title}\n${x.date}\n${x.url}\n${x.snippet}`).join("\n\n");
 const t=await ai(env,`From this current web evidence, return ONLY JSON array, max 15 items. Focus on EPBD/EED, EPC, retrofit, grid policy, capacity mechanisms, ETS2, CSRD/ESRS, energy policy and funding. Prioritise official sources. Do not fabricate.
Format: [{"title":"","source":"","region":"","type":"Regulatory|Funding|Framework|Market|Policy|Research","date":"","snippet":"","url":"","impact":"High|Medium|Low"}]
EVIDENCE:\n${ev}`);return{items:parse(t)||[]};
}
async function advisory(env,b){
 let verify="";if(b.url)try{let r=await fetch(b.url,{headers:{"User-Agent":"Energy-Advisory/1.0"}});if(r.ok)verify=clean((await r.text()).slice(0,12000))}catch{}
 const t=await ai(env,`Assess this current energy item for an advisory/procurement team. Use the item and verification text only. Return ONLY JSON:
{"whatHappened":"","whyItMatters":"","marketImpact":"Bullish|Bearish|Neutral","timeHorizon":"Days|Weeks|Months|Years","confidence":"High|Medium|Low","fundamentalDrivers":[],"risksToView":[],"procurementActions":[],"clientRelevance":[],"advisorySummary":"","evidence":[{"source":"","url":"","point":""}]}
Title:${b.title||""}\nSource:${b.source||""}\nDate:${b.date||""}\nSnippet:${b.snippet||""}\nURL:${b.url||""}\nVerification:${verify}`);
 return{result:parse(t)||{advisorySummary:t}};
}
function page(){
return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Energy Advisory</title>
<style>*{box-sizing:border-box}body{margin:0;background:#0b1220;color:#f8fafc;font:14px system-ui}.top{background:#0f1b2d;border-bottom:1px solid #2a3a52;padding:24px}.wrap{max-width:1100px;margin:auto;padding:22px}.card{background:#111c2e;border:1px solid #2a3a52;border-radius:12px;padding:18px;margin-bottom:14px}.eyebrow,.label{color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.12em;font-weight:700}.title{font-size:24px;font-weight:800;margin:5px 0}.sub{color:#94a3b8}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.chip{background:#111c2e;border:1px solid #2a3a52;color:#cbd5e1;border-radius:20px;padding:7px 11px;margin:3px;cursor:pointer}.chip.on{background:#1e3a5f;border-color:#60a5fa;color:#e0f2fe}.btn{background:#60a5fa;color:#07111f;border:0;border-radius:8px;padding:10px 15px;font-weight:800;cursor:pointer}.btn:disabled{opacity:.5}.news{border-top:1px solid #2a3a52;padding:15px 0}.news h3{margin:4px 0;color:#fff}.news p{color:#cbd5e1;line-height:1.5}.err{background:#2a0f14;border:1px solid #7f1d1d;color:#f87171;padding:12px;border-radius:8px}.link{color:#93c5fd}.advisory{border-left:3px solid #60a5fa;padding-left:14px;line-height:1.55}@media(max-width:700px){.grid{grid-template-columns:1fr}}</style>
<div class=top><div class=eyebrow>Tool 1</div><div class=title>Energy Market Intelligence</div><div class=sub>Gas · Power · Carbon · LNG · PPA · live online research</div></div>
<div class=wrap><div class=card><div class=label>Prioritised sources</div><div id=sources></div><button id=go class=btn>Fetch Latest Intelligence</button><span id=status class=sub></span></div><div id=error></div><div id=advisory></div><div id=results></div></div>
<script>
const S=${JSON.stringify(SOURCES)},src=document.getElementById("sources"),sel=new Set();
S.forEach(x=>{let b=document.createElement("button");b.className="chip";b.textContent=x[0];b.onclick=()=>{sel.has(x[0])?sel.delete(x[0]):sel.add(x[0]);b.classList.toggle("on")};src.appendChild(b)});
async function call(path,body){let r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error||"Request failed");return d}
go.onclick=async()=>{go.disabled=true;error.innerHTML="";advisory.innerHTML="";results.innerHTML="";status.textContent=" Fetching current online sources…";try{let d=await call("/api/market",{sources:[...sel]});status.textContent=" "+d.items.length+" current signals found";results.innerHTML='<div class=card><div class=label>Live intelligence</div>'+d.items.map((x,i)=>\`<div class=news><b>\${esc(x.source||"")}</b> · \${esc(x.date||"recent")}<h3>\${esc(x.title||"")}</h3><p>\${esc(x.snippet||"")}</p>\${x.url?\`<a class=link target=_blank href="\${esc(x.url)}">Open source →</a>\`:""} <button class=btn onclick='analyse(\${JSON.stringify(x).replace(/'/g,"&#39;")})'>Analyse</button></div>\`).join("")+'</div>'}catch(e){error.innerHTML='<div class=err>'+esc(e.message)+'</div>'}finally{go.disabled=false}};
async function analyse(x){advisory.innerHTML='<div class=card>Analysing…</div>';try{let d=await call("/api/advisory",x),a=d.result;advisory.innerHTML=\`<div class=card><div class=label>Advisory assessment</div><div class=advisory><h2>\${esc(a.advisorySummary||"Assessment")}</h2><p><b>What happened:</b> \${esc(a.whatHappened||"")}</p><p><b>Why it matters:</b> \${esc(a.whyItMatters||"")}</p><p><b>Market impact:</b> \${esc(a.marketImpact||"")}</p><p><b>Time horizon:</b> \${esc(a.timeHorizon||"")}</p><p><b>Confidence:</b> \${esc(a.confidence||"")}</p><b>Fundamental drivers</b><ul>\${(a.fundamentalDrivers||[]).map(esc).map(x=>"<li>"+x+"</li>").join("")}</ul><b>Risks to the view</b><ul>\${(a.risksToView||[]).map(esc).map(x=>"<li>"+x+"</li>").join("")}</ul><b>Procurement actions</b><ul>\${(a.procurementActions||[]).map(esc).map(x=>"<li>"+x+"</li>").join("")}</ul></div></div>\`}catch(e){advisory.innerHTML='<div class=err>'+esc(e.message)+'</div>'}}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
</script>`;
}
export default{async fetch(request,env){if(request.method==="OPTIONS")return new Response(null,{headers:CORS});let u=new URL(request.url);try{if(u.pathname==="/"&&request.method==="GET")return new Response(page(),{headers:{"content-type":"text/html;charset=utf-8"}});if(u.pathname==="/api/market"&&request.method==="POST")return json(await market(env,await request.json()));if(u.pathname==="/api/regulatory"&&request.method==="POST")return json(await regulatory(env,await request.json()));if(u.pathname==="/api/advisory"&&request.method==="POST")return json(await advisory(env,await request.json()));return new Response("Not found",{status:404,headers:CORS})}catch(e){return json({error:e.message||"Server error"},500)}}};
