const MODEL = "claude-sonnet-4-6";
const SEARCH_TOOL = { type: "web_search_20260318", name: "web_search" };

const SOURCES = [
  ["Ember","ember-climate.org","Electricity generation, emissions intensity"],
  ["Agora Energiewende","agora-energiewende.de","German energy transition, grid and policy"],
  ["E3G","e3g.org","EU climate policy and carbon markets"],
  ["IEEFA","ieefa.org","Energy finance and market risk"],
  ["IEA","iea.org","Global energy supply, demand and renewables"],
  ["Montel News","montelnews.com","European power, gas, carbon and grid markets"],
  ["ICIS","icis.com","Power, gas and LNG markets"],
  ["Pexapark","pexapark.com","European PPA market"],
  ["ACER","acer.europa.eu","European wholesale market monitoring"],
  ["BloombergNEF","bnef.com","Energy transition investment and market outlook"]
];

const REGIONS = [
  ["EU Bodies & Frameworks",["energy.ec.europa.eu","acer.europa.eu","efrag.org","eur-lex.europa.eu","ec.europa.eu/clima","eib.org","buildup.eu"]],
  ["Germany / Central Europe",["bundesnetzagentur.de","bmwk.de","kfw.de","agora-energiewende.de","bfe.admin.ch","bmk.gv.at"]],
  ["Spain",["miteco.gob.es","idae.es","ree.es","hacienda.gob.es"]],
  ["Poland",["gov.pl","nfosigw.gov.pl","pse.pl","czystepowietrze.gov.pl"]],
  ["Netherlands",["rvo.nl","rijksoverheid.nl","netbeheernederland.nl","abnamro.com"]],
  ["Mediterranean",["gse.it","terna.it","admie.gr","exoikonomo.gov.gr"]],
  ["Market & Certification",["breeam.com","usgbc.org","pexapark.com","iea.org"]]
];

function corsHeaders(extra={}) {
  return {
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"Content-Type",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    ...extra
  };
}

function json(data, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({"Content-Type":"application/json; charset=utf-8"})
  });
}

async function claude(env, prompt, system, search=true, max_tokens=5000) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const body = {
    model: MODEL,
    max_tokens,
    system,
    messages:[{role:"user",content:prompt}],
    ...(search ? {tools:[SEARCH_TOOL]} : {})
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{
      "content-type":"application/json",
      "x-api-key":env.ANTHROPIC_API_KEY,
      "anthropic-version":"2023-06-01"
    },
    body:JSON.stringify(body)
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Anthropic API ${r.status}`);
  const text = (data.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n");
  return {text, raw:data};
}

function extractJson(text) {
  const fenced = text.replace(/```json|```/gi,"").trim();
  const arr = fenced.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch {} }
  const obj = fenced.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch {} }
  return null;
}

const t1System = `You are a European energy-market intelligence analyst.
Use current web information. Prioritise primary/credible specialist sources.
Do not invent prices, dates, events or URLs. Distinguish observed facts from inference.
Return concise, decision-useful market intelligence.`;

const t2System = `You are a European energy regulation and building-policy analyst.
Use current web information and prioritise official EU/national sources.
Do not invent legal requirements, dates or funding amounts. Distinguish facts from interpretation.
Return concise, decision-useful regulatory intelligence.`;

async function researchT1(env, body) {
  const chosen = body.sources?.length ? SOURCES.filter(x=>body.sources.includes(x[0])) : SOURCES;
  const sourceText = chosen.map(x=>`${x[0]} (${x[1]}): ${x[2]}`).join("\n");
  const prompt = `Search the web for the most material energy-market developments from the last 7 days, using these sources/domains as priorities:
${sourceText}

Focus on developments that can move or change expectations for European gas, power, carbon/EUA, LNG, renewables/PPA, grids, supply/demand or energy procurement.

Return ONLY a JSON array with up to 12 items:
[{"title":"","source":"","date":"","snippet":"","url":"","commodity":"","direction":"Bullish|Bearish|Neutral","importance":"High|Medium|Low"}]

Prefer genuinely recent developments. If a source has no material recent development, do not fabricate one.`;
  const {text} = await claude(env,prompt,t1System,true,6000);
  return {items:extractJson(text)||[], raw:text};
}

async function researchT2(env, body) {
  const chosen = body.regions?.length ? REGIONS.filter(x=>body.regions.includes(x[0])) : REGIONS;
  const domains = chosen.flatMap(x=>x[1]);
  const prompt = `Search the web for material energy, building and sustainability regulatory developments from the last 14 days in these regional groups:
${chosen.map(x=>`${x[0]}: ${x[1].join(", ")}`).join("\n")}

Focus on EPBD/EED, building standards, EPC, retrofit subsidies, grid policy, capacity mechanisms, carbon/ETS2, CSRD/ESRS, energy policy and funding.

Return ONLY a JSON array with up to 15 items:
[{"title":"","source":"","region":"","type":"Regulatory|Funding|Framework|Market|Policy|Research","date":"","snippet":"","url":"","impact":"High|Medium|Low"}]

Prioritise official sources. Do not fabricate updates.`;
  const {text} = await claude(env,prompt,t2System,true,6500);
  return {items:extractJson(text)||[], raw:text};
}

async function advisory(env, body) {
  const kind = body.kind || "market";
  const system = kind==="regulatory" ? t2System : t1System;
  const prompt = `Perform a fresh advisory assessment using the following current item:

Title: ${body.title||""}
Source: ${body.source||""}
Region: ${body.region||""}
Snippet: ${body.snippet||""}

Search the web to verify and enrich the item before deciding.

Return ONLY valid JSON:
{
 "whatHappened":"",
 "whyItMatters":"",
 "marketImpact":"Bullish|Bearish|Neutral",
 "timeHorizon":"Days|Weeks|Months|Years",
 "confidence":"High|Medium|Low",
 "fundamentalDrivers":[],
 "risksToView":[],
 "procurementActions":[],
 "clientRelevance":[],
 "advisorySummary":"",
 "evidence":[{"source":"","url":"","point":""}]
}

The advisorySummary should be practical for an energy procurement/advisory team. Never present speculation as fact.`;
  const {text} = await claude(env,prompt,system,true,5000);
  return {result:extractJson(text)||{advisorySummary:text}, raw:text};
}

function html() {
return `<!doctype html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Energy Advisory — Market Intelligence</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#0b1220;color:#f8fafc;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
button,input{font:inherit}.app{min-height:100vh}.top{background:#0f1b2d;border-bottom:1px solid #2a3a52;padding:14px 20px;display:flex;justify-content:space-between;gap:18px;align-items:center;position:sticky;top:0;z-index:5}.eyebrow{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#94a3b8}.title{font-size:18px;font-weight:750;margin-top:2px}.sub{font-size:11px;color:#94a3b8;margin-top:2px}.tabs{display:flex;gap:5px;flex-wrap:wrap}.tab{border:1px solid #2a3a52;background:#111c2e;color:#cbd5e1;padding:7px 11px;border-radius:7px;cursor:pointer}.tab.active{background:#60a5fa;color:#07111f;border-color:#60a5fa;font-weight:700}.wrap{max-width:1100px;margin:0 auto;padding:20px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{background:#111c2e;border:1px solid #2a3a52;border-radius:10px;padding:15px}.section{margin-bottom:14px}.label{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#cbd5e1;font-weight:700;margin-bottom:8px}.muted{color:#94a3b8}.btn{background:#60a5fa;color:#07111f;border:0;border-radius:7px;padding:9px 14px;font-weight:750;cursor:pointer}.btn:disabled{opacity:.45;cursor:not-allowed}.btn.secondary{background:#162338;color:#cbd5e1;border:1px solid #2a3a52}.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{background:#111c2e;border:1px solid #2a3a52;color:#cbd5e1;border-radius:20px;padding:5px 9px;font-size:12px;cursor:pointer}.chip.on{background:#1e3a5f;border-color:#60a5fa;color:#e0f2fe}.status{margin-top:9px;color:#94a3b8;font-size:12px}.news{display:flex;justify-content:space-between;gap:15px;padding:13px 0;border-bottom:1px solid #2a3a52}.news h3{font-size:14px;line-height:1.4;margin:0 0 5px;color:#f8fafc}.news p{font-size:12px;line-height:1.5;color:#cbd5e1;margin:0}.meta{font-size:10px;color:#94a3b8;margin-bottom:5px}.badge{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;margin-right:5px}.green{background:#14532d;color:#4ade80}.red{background:#7f1d1d;color:#fca5a5}.amber{background:#713f12;color:#fbbf24}.blue{background:#1e3a5f;color:#93c5fd}.purple{background:#2e1065;color:#c4b5fd}.input{width:100%;background:#0b1220;border:1px solid #2a3a52;color:#f8fafc;border-radius:7px;padding:9px 10px}.input::placeholder{color:#64748b}.advisory{border-left:3px solid #60a5fa;padding-left:12px;margin-top:12px}.metric{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.metric .card{text-align:center}.big{font-size:24px;font-weight:800}.source{font-size:11px;color:#60a5fa;text-decoration:none}.empty{padding:45px 10px;text-align:center;color:#94a3b8}.error{background:#2a0f14;border:1px solid #7f1d1d;color:#f87171;padding:10px;border-radius:7px;margin-bottom:12px}.evidence{margin-top:10px;padding-top:10px;border-top:1px solid #2a3a52}.evidence a{color:#93c5fd;font-size:11px}.small{font-size:11px}.home{max-width:760px;margin:0 auto;padding-top:70px}.home h1{font-size:34px;margin:0 0 8px}.home p{color:#94a3b8;line-height:1.6}.home .card{cursor:pointer;transition:.15s}.home .card:hover{border-color:#60a5fa}.back{color:#cbd5e1;background:none;border:0;cursor:pointer;margin-bottom:14px}@media(max-width:760px){.top{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:1fr}.metric{grid-template-columns:1fr 1fr}.wrap{padding:14px}}
</style></head>
<body><div id="root"></div>
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script type="text/babel">
const {useState}=React;
const sources=${JSON.stringify(SOURCES)};
const regions=${JSON.stringify(REGIONS)};
async function api(path,body){const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body||{})});const d=await r.json();if(!r.ok)throw Error(d.error||"Request failed");return d}
function Badge({children,tone="blue"}){return <span className={"badge "+tone}>{children}</span>}
function Home({go}){return <div className="home"><div className="eyebrow">Energy Advisory · Market Intelligence</div><h1>Energy Advisory</h1><p>Live European energy-market intelligence and regulatory analysis, powered by current web research.</p><div className="grid"><div className="card" onClick={()=>go("market")}><div className="eyebrow">Tool 1</div><h2>Energy Market Intelligence</h2><p>Gas · Power · Carbon · LNG · Renewables · PPA · Grid · Geopolitics</p></div><div className="card" onClick={()=>go("reg")}><div className="eyebrow">Tool 2</div><h2>Building & Energy Regulations</h2><p>EPBD · EED · CSRD · ETS2 · National Policy · Funding</p></div></div></div>}
function Tool({kind,back}){const market=kind==="market";const [selected,setSelected]=useState([]);const [items,setItems]=useState([]);const [loading,setLoading]=useState(false);const [status,setStatus]=useState("");const [err,setErr]=useState("");const [adv,setAdv]=useState(null);const [advLoading,setAdvLoading]=useState(false);
 const list=market?sources:regions;
 async function fetchNow(){setLoading(true);setErr("");setStatus("Searching current online sources…");setItems([]);setAdv(null);try{const d=await api(market?"/api/market":"/api/regulatory",market?{sources:selected}:{regions:selected});setItems(d.items||[]);setStatus((d.items||[]).length+" current signals found.");}catch(e){setErr(e.message)}finally{setLoading(false)}}
 async function analyze(x){setAdvLoading(true);setErr("");try{const d=await api("/api/advisory",{kind:market?"market":"regulatory",...x});setAdv(d.result)}catch(e){setErr(e.message)}finally{setAdvLoading(false)}}
 return <><div className="top"><div><button className="back" onClick={back}>← Back</button><div className="eyebrow">{market?"Tool 1":"Tool 2"}</div><div className="title">{market?"Energy Market Intelligence":"Building & Energy Regulations"}</div><div className="sub">{market?"Gas · Power · Carbon · LNG · PPA":"EPBD · CSRD · EED · ETS2 · National Policy"}</div></div></div>
 <div className="wrap"><div className="card section"><div className="label">{market?"Prioritised sources":"Regional groups"}</div><div className="chips">{list.map(x=>{const name=x[0],on=selected.includes(name);return <button key={name} className={"chip "+(on?"on":"")} onClick={()=>setSelected(a=>on?a.filter(v=>v!==name):[...a,name])}>{name}</button>})}</div><div style={{marginTop:12,display:"flex",gap:8,alignItems:"center"}}><button className="btn" disabled={loading} onClick={fetchNow}>{loading?"Researching…":"Fetch Latest Intelligence"}</button><span className="status">{status}</span></div></div>
 {err&&<div className="error">{err}</div>}
 {adv&&<div className="card section"><div className="label">Advisory assessment</div><div className="advisory"><h2 style={{margin:"0 0 8px"}}>{adv.advisorySummary||"Assessment"}</h2><div className="chips"><Badge tone={adv.marketImpact==="Bullish"?"green":adv.marketImpact==="Bearish"?"red":"amber"}>{adv.marketImpact||"Neutral"}</Badge><Badge tone="purple">{adv.timeHorizon||"Months"}</Badge><Badge tone="blue">{adv.confidence||"Medium"} confidence</Badge></div><p><b>What happened:</b> {adv.whatHappened}</p><p><b>Why it matters:</b> {adv.whyItMatters}</p>{adv.fundamentalDrivers?.length>0&&<><div className="label">Fundamental drivers</div><ul>{adv.fundamentalDrivers.map((x,i)=><li key={i}>{x}</li>)}</ul></>}{adv.risksToView?.length>0&&<><div className="label">Risks to the view</div><ul>{adv.risksToView.map((x,i)=><li key={i}>{x}</li>)}</ul></>}{adv.procurementActions?.length>0&&<><div className="label">Procurement signal</div><div className="chips">{adv.procurementActions.map(x=><Badge key={x} tone="green">{x}</Badge>)}</div></>}{adv.evidence?.length>0&&<div className="evidence"><div className="label">Evidence</div>{adv.evidence.map((e,i)=><div key={i} className="small">• {e.point} — <a href={e.url} target="_blank">{e.source}</a></div>)}</div>}</div></div>}
 {items.length===0&&!loading?<div className="empty">Select sources or regions and fetch the latest online intelligence.</div>:<div className="card"><div className="label">Live intelligence</div>{items.map((x,i)=><div className="news" key={i}><div style={{minWidth:0}}><div className="meta">{x.source} · {x.date||"recent"} {x.commodity&&<Badge tone="blue">{x.commodity}</Badge>}</div><h3>{x.title}</h3><p>{x.snippet}</p>{x.url&&<a className="source" href={x.url} target="_blank">Open source →</a>}</div><button className="btn secondary" disabled={advLoading} onClick={()=>analyze(x)}>{advLoading?"…":"Analyse"}</button></div>)}</div>}
 </div></>}
function App(){const [page,setPage]=useState(null);if(!page)return <Home go={setPage}/>;return <Tool kind={page} back={()=>setPage(null)}/>}
ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
</script></body></html>`;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null,{headers:corsHeaders()});
    const url = new URL(request.url);
    try {
      if (url.pathname === "/" && request.method === "GET") return new Response(html(),{headers:{"content-type":"text/html;charset=UTF-8"}});
      if (url.pathname === "/api/market" && request.method === "POST") return json(await researchT1(env, await request.json()));
      if (url.pathname === "/api/regulatory" && request.method === "POST") return json(await researchT2(env, await request.json()));
      if (url.pathname === "/api/advisory" && request.method === "POST") return json(await advisory(env, await request.json()));
      return new Response("Not found",{status:404,headers:corsHeaders()});
    } catch(e) {
      return json({error:e.message||"Server error"},500);
    }
  }
};
