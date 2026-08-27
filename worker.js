const SOURCES = [
  ["IEA", "iea.org"],
  ["ACER", "acer.europa.eu"],
  ["Ember", "ember-energy.org"],
  ["Agora Energiewende", "agora-energiewende.de"],
  ["IEEFA", "ieefa.org"],
  ["ICIS", "icis.com"],
  ["Montel News", "montelnews.com"],
  ["Pexapark", "pexapark.com"],
  ["E3G", "e3g.org"],
  ["BloombergNEF", "about.bnef.com"]
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

const enc = s => encodeURIComponent(s);

function xmlText(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  return m[1].replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/\\s+/g, " ").trim();
}

function parseRSS(xml, source) {
  const items = [...xml.matchAll(/<item(?:\\s[^>]*)?>([\\s\\S]*?)<\\/item>/gi)];
  return items.map(m => {
    const x = m[1];
    const title = xmlText(x, "title");
    const link = xmlText(x, "link") || xmlText(x, "guid");
    const description = xmlText(x, "description");
    const pubDate = xmlText(x, "pubDate") || xmlText(x, "published") || xmlText(x, "updated");
    return { source, title, link, description, pubDate };
  }).filter(x => x.title && x.link);
}

async function fetchWithTimeout(url, ms = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Energy-Advisory/1.0 (+https://workers.dev)",
        "Accept": "application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8"
      }
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text };
  } finally {
    clearTimeout(timer);
  }
}

function googleNewsURL(domain) {
  const q = `site:${domain} (energy OR gas OR power OR electricity OR LNG OR carbon OR renewable OR PPA OR grid OR market)`;
  return `https://news.google.com/rss/search?q=${enc(q)}&hl=en-GB&gl=GB&ceid=GB:en`;
}

async function fetchSource([name, domain]) {
  const url = googleNewsURL(domain);
  try {
    const r = await fetchWithTimeout(url);
    if (!r.ok) return { source: name, domain, count: 0, error: `HTTP ${r.status}`, url };
    const items = parseRSS(r.text, name).slice(0, 8);
    return { source: name, domain, count: items.length, items, url };
  } catch (e) {
    return { source: name, domain, count: 0, error: e?.name === "AbortError" ? "timeout" : String(e), url };
  }
}

function recent(items) {
  const cutoff = Date.now() - 14 * 86400000;
  return items.filter(x => {
    const t = Date.parse(x.pubDate || "");
    return !Number.isNaN(t) ? t >= cutoff : true;
  });
}

async function collect() {
  const results = await Promise.all(SOURCES.map(fetchSource));
  const items = recent(results.flatMap(x => x.items || []));
  const unique = [];
  const seen = new Set();
  for (const x of items) {
    const key = (x.link || x.title).toLowerCase();
    if (!seen.has(key)) { seen.add(key); unique.push(x); }
  }
  unique.sort((a,b) => (Date.parse(b.pubDate || "") || 0) - (Date.parse(a.pubDate || "") || 0));
  return { results, items: unique.slice(0, 45) };
}

async function analyse(env, items, selectedSources) {
  if (!items.length) {
    return {
      executive: "No current articles were returned by the source search. Check the source diagnostics below; this is a data-collection problem, not an AI-analysis result.",
      signals: []
    };
  }

  const evidence = items.map((x, i) =>
    `[${i+1}] ${x.source} | ${x.title} | ${x.pubDate || "date unknown"} | ${x.link}\n${x.description || ""}`
  ).join("\n\n");

  const prompt = `You are an energy-market advisory analyst.
Use ONLY the supplied current-source evidence. Do not invent prices, events, companies, dates, or conclusions.
Focus on European gas, power, carbon, LNG, renewables/PPA and grid markets.

Produce JSON with exactly:
{
 "executive": "3-5 sentence market view",
 "signals": [
   {
     "market": "Gas|Power|Carbon|LNG|Renewables/PPA|Grid|Cross-market",
     "direction": "Bullish|Bearish|Mixed|Watch",
     "signal": "short statement of what is changing",
     "why": "evidence-based driver",
     "advisory": "what an energy buyer/procurement/advisory team should consider",
     "horizon": "Now|1-4 weeks|1-3 months|3-12 months",
     "confidence": "High|Medium|Low",
     "sources": [1,2]
   }
 ]
}
Return valid JSON only.

Selected sources: ${selectedSources?.join(", ") || "all"}.

Evidence:
${evidence}`;

  const out = await env.AI.run("@cf/zai-org/glm-4.7-flash", {
    messages: [
      { role: "system", content: "You are a precise energy-market advisory analyst. Output valid JSON only." },
      { role: "user", content: prompt }
    ],
    temperature: 0.1,
    max_tokens: 3500
  });

  let raw = out?.response || out?.result?.response || "";
  raw = String(raw).replace(/^```json\\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    return {
      executive: raw || "AI returned no analysis.",
      signals: []
    };
  }
}

function page() {
return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Energy Market Intelligence</title>
<style>
:root{color-scheme:dark;--bg:#07111f;--panel:#101d31;--panel2:#15253c;--text:#f5f8ff;--muted:#aebdd1;--line:#2a405e;--blue:#62a8ff;--blue2:#8fc4ff;--green:#69d39b;--red:#ff7777;--yellow:#f3c969}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 Segoe UI,Arial,sans-serif}
header{padding:30px 34px;border-bottom:1px solid var(--line);background:#0d1a2c}h1{margin:0;font-size:32px}h2{margin:0 0 12px}.eyebrow{color:var(--blue2);font-weight:700;letter-spacing:2px;font-size:13px}.sub{color:var(--muted);font-size:17px;margin-top:4px}
main{max-width:1250px;margin:30px auto;padding:0 22px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px;margin-bottom:20px}
.sources{display:flex;flex-wrap:wrap;gap:9px}.chip{border:1px solid var(--line);background:#0c192b;color:var(--text);padding:8px 13px;border-radius:999px;cursor:pointer}.chip.on{border-color:var(--blue);background:#173b64}.actions{display:flex;gap:14px;align-items:center;margin-top:18px;flex-wrap:wrap}
button.primary{border:0;background:var(--blue);color:#06111f;font-weight:800;font-size:16px;padding:12px 19px;border-radius:9px;cursor:pointer}.status{color:var(--muted)}.error{color:var(--red)}
.exec{font-size:18px;color:#e9f2ff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:15px}.card{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:17px}.tag{display:inline-block;padding:4px 8px;border-radius:6px;background:#203754;color:var(--blue2);font-size:12px;font-weight:700;margin:0 5px 8px 0}.bull{color:var(--green)}.bear{color:var(--red)}.watch{color:var(--yellow)}.meta{color:var(--muted);font-size:13px}.links a{color:var(--blue2);text-decoration:none}.links a:hover{text-decoration:underline}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px;border-bottom:1px solid var(--line)}th{color:var(--blue2)}.ok{color:var(--green)}.bad{color:var(--red)}
.small{font-size:13px;color:var(--muted)}
</style></head>
<body><header><div class="eyebrow">TOOL 1</div><h1>Energy Market Intelligence</h1><div class="sub">Gas · Power · Carbon · LNG · PPA · live online research</div></header>
<main>
<section class="panel"><h2>Prioritised sources</h2><div class="sources" id="sources"></div>
<div class="actions"><button class="primary" onclick="run()">Fetch Latest Intelligence</button><span class="status" id="status">Ready — searches current online sources when you click fetch.</span></div></section>
<section class="panel" id="view" style="display:none"></section>
<section class="panel" id="diag" style="display:none"></section>
</main>
<script>
const SOURCES=${JSON.stringify(SOURCES.map(x=>x[0]))};let selected=new Set(SOURCES);
const s=document.getElementById('sources');SOURCES.forEach(x=>{const b=document.createElement('button');b.className='chip on';b.textContent=x;b.onclick=()=>{if(selected.has(x)){selected.delete(x);b.classList.remove('on')}else{selected.add(x);b.classList.add('on')}};s.appendChild(b)});
function esc(x){return String(x??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
async function run(){const st=document.getElementById('status');st.textContent='Fetching live source feeds…';document.getElementById('view').style.display='none';try{const r=await fetch('/api/intelligence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sources:[...selected]})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed');st.textContent=`Found ${d.items.length} current articles; analysing…`;renderDiag(d.results);render(d.analysis,d.items);st.textContent=`Done — ${d.items.length} articles collected from ${d.results.filter(x=>x.count).length}/${d.results.length} sources.`}catch(e){st.innerHTML='<span class="error">'+esc(e.message)+'</span>'}}
function renderDiag(rs){const el=document.getElementById('diag');el.style.display='block';el.innerHTML='<h2>Source diagnostics</h2><table><tr><th>Source</th><th>Articles</th><th>Status</th></tr>'+rs.map(x=>`<tr><td>${esc(x.source)}</td><td>${x.count}</td><td class="${x.count?'ok':'bad'}">${x.count?'OK':esc(x.error||'No articles')}</td></tr>`).join('')+'</table><p class="small">This diagnostic is intentional: if a source returns zero, you can see whether the issue is the source feed rather than the AI.</p>'}
function render(a,items){const el=document.getElementById('view');el.style.display='block';let html='<h2>Advisory market view</h2><p class="exec">'+esc(a.executive)+'</p><div class="grid">';for(const x of (a.signals||[])){const cls=x.direction==='Bullish'?'bull':x.direction==='Bearish'?'bear':'watch';html+=`<article class="card"><span class="tag">${esc(x.market)}</span><span class="${cls}"><b>${esc(x.direction)}</b></span><h3>${esc(x.signal)}</h3><p><b>Why:</b> ${esc(x.why)}</p><p><b>Advisory:</b> ${esc(x.advisory)}</p><p class="meta">${esc(x.horizon)} · ${esc(x.confidence)} confidence</p></article>`}html+='</div><h2 style="margin-top:24px">Evidence</h2><div class="links">';for(const x of items){html+=`<p><b>${esc(x.source)}</b> — ${esc(x.title)}<br><span class="meta">${esc(x.pubDate||'')}</span><br><a href="${esc(x.link)}" target="_blank" rel="noopener">Open source article →</a></p>`}html+='</div>';el.innerHTML=html}
</script></body></html>`;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response("", {status:204, headers:CORS});
    const url = new URL(request.url);
    if (url.pathname === "/api/intelligence" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const selected = new Set(body.sources || SOURCES.map(x=>x[0]));
        const chosen = SOURCES.filter(x => selected.has(x[0]));
        const data = await collect();
        const items = data.items.filter(x => selected.has(x.source));
        const analysis = await analyse(env, items, [...selected]);
        return new Response(JSON.stringify({
          items, results: data.results.filter(x => selected.has(x.source)), analysis
        }), {headers:{...CORS,"Content-Type":"application/json"}});
      } catch (e) {
        return new Response(JSON.stringify({error:String(e?.message || e)}), {status:500,headers:{...CORS,"Content-Type":"application/json"}});
      }
    }
    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ok:true, aiBinding:!!env.AI}), {headers:{...CORS,"Content-Type":"application/json"}});
    }
    return new Response(page(), {headers:{...CORS,"Content-Type":"text/html;charset=UTF-8"}});
  }
};
