const MARKET_SOURCES = [
  ["IEA","iea.org"],["ACER","acer.europa.eu"],["Ember","ember-climate.org"],
  ["Agora Energiewende","agora-energiewende.de"],["IEEFA","ieefa.org"],
  ["Montel News","montelnews.com"],["ICIS","icis.com"],["Pexapark","pexapark.com"]
];

const CORS = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"Content-Type",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS"
};

function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status:status,
    headers:Object.assign({},CORS,{"Content-Type":"application/json"})
  });
}

function clean(s){
  return String(s||"")
    .replace(/<[^>]*>/g," ")
    .replace(/&amp;/g,"&")
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'")
    .replace(/\s+/g," ")
    .trim();
}

function rssItems(xml){
  return Array.from(xml.matchAll(/<item[\s\S]*?<\/item>/gi)).map(function(m){
    var b=m[0];
    var lm=b.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    return {
      title:clean(tag(b,"title")),
      url:lm?clean(lm[1]):"",
      date:clean(tag(b,"pubDate")),
      snippet:clean(tag(b,"description"))
    };
  }).filter(function(x){return x.title && x.url;});
}

function tag(block,name){
  var m=block.match(new RegExp("<"+name+"[^>]*>([\\\\s\\\\S]*?)</"+name+">","i"));
  return m?m[1]:"";
}

async function fetchNews(domains,days){
  var date=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
  var q="("+domains.map(function(d){return "site:"+d;}).join(" OR ")+") energy gas power carbon LNG renewables PPA grid procurement after:"+date;
  var url="https://news.google.com/rss/search?q="+encodeURIComponent(q)+"&hl=en-GB&gl=GB&ceid=GB:en";
  var r=await fetch(url,{"headers":{"User-Agent":"Energy-Advisory/1.0"}});
  if(!r.ok) return [];
  return rssItems(await r.text());
}

async function runAI(env,prompt){
  if(!env.AI) throw new Error("Cloudflare Workers AI is not configured. Please add the AI binding in the Worker settings.");
  var r=await env.AI.run("@cf/zai-org/glm-4.7-flash",{
    messages:[
      {role:"system",content:"You are a careful European energy-market adviser. Use only supplied current web evidence. Never invent facts, prices, dates or URLs. Separate evidence from inference."},
      {role:"user",content:prompt}
    ],
    max_tokens:5000
  });
  return r && (r.response || (r.result && r.result.response)) || "";
}

function parseJSON(text){
  var t=String(text||"").replace(/json/g,"").trim();
  var a=t.match(/\[[\s\S]*\]/);
  var o=t.match(/\{[\s\S]*\}/);
  try { return JSON.parse(a?a[0]:(o?o[0]:"null")); } catch(e){ return null; }
}

async function market(env){
  var raw=await fetchNews(MARKET_SOURCES.map(function(x){return x[1];}),7);
  var evidence=raw.slice(0,40).map(function(x,i){
    return (i+1)+". "+x.title+"\nDate: "+x.date+"\nURL: "+x.url+"\n"+x.snippet;
  }).join("\n\n");

  var prompt =
    "Using ONLY the current web evidence below, identify the most material European energy-market developments from the last 7 days. "+
    "Focus on gas, power, carbon/EUA, LNG, renewables/PPA, grids, supply/demand and procurement. "+
    "Return ONLY valid JSON, an array of up to 12 items. Do not fabricate.\n\n"+
    '[{"title":"","source":"","date":"","snippet":"","url":"","commodity":"","direction":"Bullish|Bearish|Neutral","importance":"High|Medium|Low"}]\n\n'+
    "CURRENT WEB EVIDENCE:\n"+evidence;

  var text=await runAI(env,prompt);
  return {items:parseJSON(text)||[]};
}

async function advisory(env,item){
  var verification="";
  if(item.url){
    try{
      var r=await fetch(item.url,{"headers":{"User-Agent":"Energy-Advisory/1.0"}});
      if(r.ok) verification=clean((await r.text()).slice(0,10000));
    }catch(e){}
  }

  var prompt =
    "Assess this current energy-market development for an energy procurement/advisory team. "+
    "Use the supplied item and verification text. Return ONLY valid JSON.\n"+
    '{"whatHappened":"","whyItMatters":"","marketImpact":"Bullish|Bearish|Neutral","timeHorizon":"Days|Weeks|Months|Years","confidence":"High|Medium|Low","fundamentalDrivers":[],"risksToView":[],"procurementActions":[],"clientRelevance":[],"advisorySummary":"","evidence":[{"source":"","url":"","point":""}]}\n\n'+
    "Title: "+(item.title||"")+"\nSource: "+(item.source||"")+"\nDate: "+(item.date||"")+
    "\nSnippet: "+(item.snippet||"")+"\nURL: "+(item.url||"")+
    "\nVerification: "+verification;

  var text=await runAI(env,prompt);
  return {result:parseJSON(text)||{advisorySummary:text}};
}

function page(){
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Energy Advisory</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#0b1220;color:#f8fafc;font:14px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.top{background:#111c2e;border-bottom:1px solid #334155;padding:20px 24px}
.title{font-size:24px;font-weight:800}.sub{color:#cbd5e1;margin-top:5px}
.wrap{max-width:1050px;margin:auto;padding:22px}
.card{background:#162338;border:1px solid #334155;border-radius:12px;padding:18px;margin-bottom:16px}
.label{color:#cbd5e1;font-size:11px;text-transform:uppercase;letter-spacing:.12em;font-weight:800;margin-bottom:10px}
.chip{background:#111c2e;border:1px solid #475569;color:#e2e8f0;border-radius:20px;padding:7px 11px;margin:3px;cursor:pointer}
.chip.on{background:#1e3a5f;border-color:#60a5fa;color:#fff}
.btn{background:#60a5fa;color:#07111f;border:0;border-radius:8px;padding:10px 15px;font-weight:800;cursor:pointer}
.btn:disabled{opacity:.5}.item{border-top:1px solid #334155;padding:16px 0}
.item h3{margin:5px 0;color:#fff}.item p{color:#dbe4ee;line-height:1.55}
.meta{color:#a8b5c7;font-size:11px}.link{color:#93c5fd}.err{background:#3a141b;border:1px solid #991b1b;color:#fecaca;padding:12px;border-radius:8px}
.advisory{border-left:3px solid #60a5fa;padding-left:14px;line-height:1.6;color:#e2e8f0}
.home{max-width:800px;margin:60px auto;padding:20px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}
@media(max-width:700px){.grid{grid-template-columns:1fr}.wrap{padding:14px}}
</style>
</head>
<body>
<div class="top"><div class="title">Energy Advisory</div><div class="sub">Live European energy-market intelligence and advisory analysis</div></div>
<div class="wrap">
<div class="card">
<div class="label">Market intelligence</div>
<p>Fetch recent market developments, then analyse individual movements for procurement and advisory implications.</p>
<div id="sources"></div>
<button id="fetch" class="btn">Fetch Latest Intelligence</button>
<span id="status"></span>
</div>
<div id="error"></div>
<div id="advisory"></div>
<div id="results"></div>
</div>
<script>
var SOURCES = ${JSON.stringify(MARKET_SOURCES)};
var selected = {};
var results = [];

function esc(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g,function(m){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m];
  });
}

SOURCES.forEach(function(x){
  var b=document.createElement("button");
  b.className="chip";
  b.textContent=x[0];
  b.onclick=function(){
    selected[x[0]]=!selected[x[0]];
    b.classList.toggle("on");
  };
  document.getElementById("sources").appendChild(b);
});

async function call(path,body){
  var r=await fetch(path,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body || {})
  });
  var d=await r.json();
  if(!r.ok) throw new Error(d.error || "Request failed");
  return d;
}

document.getElementById("fetch").onclick=async function(){
  var btn=this;
  btn.disabled=true;
  document.getElementById("error").innerHTML="";
  document.getElementById("advisory").innerHTML="";
  document.getElementById("results").innerHTML="";
  document.getElementById("status").textContent=" Searching current online sources...";
  try{
    var names=Object.keys(selected).filter(function(k){return selected[k];});
    var d=await call("/api/market",{sources:names});
    results=d.items || [];
    document.getElementById("status").textContent=" "+results.length+" current signals found.";
    renderResults();
  }catch(e){
    document.getElementById("error").innerHTML='<div class="err">'+esc(e.message)+'</div>';
  }finally{
    btn.disabled=false;
  }
};

function renderResults(){
  var box=document.getElementById("results");
  var html='<div class="card"><div class="label">Live intelligence</div>';
  results.forEach(function(x,i){
    html+='<div class="item">';
    html+='<div class="meta">'+esc(x.source||"")+' · '+esc(x.date||"recent")+'</div>';
    html+='<h3>'+esc(x.title||"")+'</h3>';
    html+='<p>'+esc(x.snippet||"")+'</p>';
    if(x.url) html+='<a class="link" target="_blank" href="'+esc(x.url)+'">Open source →</a> ';
    html+='<button class="btn" style="margin-left:8px" data-index="'+i+'">Analyse for Advisory</button>';
    html+='</div>';
  });
  html+='</div>';
  box.innerHTML=html;
  box.querySelectorAll("button[data-index]").forEach(function(b){
    b.onclick=function(){analyse(Number(b.getAttribute("data-index")));};
  });
}

async function analyse(i){
  var box=document.getElementById("advisory");
  box.innerHTML='<div class="card">Analysing current evidence...</div>';
  try{
    var d=await call("/api/advisory",results[i]);
    var a=d.result || {};
    var html='<div class="card"><div class="label">Advisory assessment</div><div class="advisory">';
    html+='<h2>'+esc(a.advisorySummary||"Advisory assessment")+'</h2>';
    html+='<p><b>What happened:</b> '+esc(a.whatHappened||"")+'</p>';
    html+='<p><b>Why it matters:</b> '+esc(a.whyItMatters||"")+'</p>';
    html+='<p><b>Market impact:</b> '+esc(a.marketImpact||"")+'</p>';
    html+='<p><b>Time horizon:</b> '+esc(a.timeHorizon||"")+'</p>';
    html+='<p><b>Confidence:</b> '+esc(a.confidence||"")+'</p>';
    html+='<h3>Fundamental drivers</h3><ul>';
    (a.fundamentalDrivers||[]).forEach(function(x){html+='<li>'+esc(x)+'</li>';});
    html+='</ul><h3>Risks to the view</h3><ul>';
    (a.risksToView||[]).forEach(function(x){html+='<li>'+esc(x)+'</li>';});
    html+='</ul><h3>Procurement actions</h3><ul>';
    (a.procurementActions||[]).forEach(function(x){html+='<li>'+esc(x)+'</li>';});
    html+='</ul></div></div>';
    box.innerHTML=html;
  }catch(e){
    box.innerHTML='<div class="err">'+esc(e.message)+'</div>';
  }
}
</script>
</body>
</html>`;
}

export default {
  async fetch(request,env){
    if(request.method==="OPTIONS") return new Response(null,{headers:CORS});
    var u=new URL(request.url);
    try{
      if(u.pathname==="/" && request.method==="GET")
        return new Response(page(),{headers:{"Content-Type":"text/html;charset=UTF-8"}});
      if(u.pathname==="/api/market" && request.method==="POST")
        return json(await market(env));
      if(u.pathname==="/api/advisory" && request.method==="POST")
        return json(await advisory(env,await request.json()));
      return new Response("Not found",{status:404,headers:CORS});
    }catch(e){
      return json({error:e.message||"Server error"},500);
    }
  }
};
