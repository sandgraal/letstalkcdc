/* ---------- THEME + UTILITIES ---------- */
if (localStorage.getItem("theme") === "modern") {
  document.body.classList.add("modern");
}
export function ensureValidJWT() {
  const stored = localStorage.getItem("jwt");
  return stored || null;
}

/* ---------- STATS + FILTERS ---------- */
let filterModes = ["all","ERROR","SYNC","CDC_AGENT","PLAYGROUND"];
let currentFilterIndex = 0;
function updateStatsCounter(){
  const counter=document.getElementById("statsCounter");if(!counter)return;
  const logs=JSON.parse(localStorage.getItem("cdcAgentLogs")||"[]");
  counter.textContent=logs.length;counter.classList.add("updated");
  setTimeout(()=>counter.classList.remove("updated"),300);
}
document.getElementById("statsCounter")?.addEventListener("click",()=>{
  currentFilterIndex=(currentFilterIndex+1)%filterModes.length;
  const nextFilter=filterModes[currentFilterIndex];
  const counter=document.getElementById("statsCounter");
  const tooltip=document.getElementById("filterTooltip");
  applyLogFilter(nextFilter);
  appendAgentLog(`Filter changed to ${nextFilter}`,"info","CDC_AGENT");
  tooltip.textContent=`FILTER: ${nextFilter}`;
  tooltip.classList.add("visible");
  counter.classList.add("updated");
  setTimeout(()=>{tooltip.classList.remove("visible");counter.classList.remove("updated");},1200);
});

/* ---------- CHARTS ---------- */
import { Chart } from "https://cdn.jsdelivr.net/npm/chart.js";
export async function renderProgressDashboard(canvasId,modules){
  const docs=JSON.parse(localStorage.getItem("lastProgressDocs")||"[]");
  const {accent,text,grid}=getThemeColors();
  Chart.helpers.each(Chart.instances,i=>i.destroy());
  const overallCtx=document.getElementById(`${canvasId}-overall`).getContext("2d");
  const modCtx=document.getElementById(`${canvasId}-modules`).getContext("2d");
  const avg=docs.length?Math.round((docs.filter(d=>d.status==="completed").length/modules.length)*100):0;
  const labels=modules.map(m=>m.title);
  const data=modules.map(m=>{const progress=docs.filter(d=>d.moduleId===m.id&&d.status==="completed").length;
    return Math.min((progress/m.totalSteps)*100,100);});
  new Chart(overallCtx,{type:"doughnut",data:{labels:["Completed","Remaining"],
  datasets:[{data:[avg,100-avg],backgroundColor:[accent,grid]}]},
  options:{plugins:{legend:{display:false},title:{display:true,text:`Overall ${avg}%`,color:text}},cutout:"70%"}});
  new Chart(modCtx,{type:"bar",data:{labels,datasets:[{data,backgroundColor:accent}]},
  options:{indexAxis:"y",plugins:{legend:{display:false},title:{display:true,text:"Module Progress",color:text}},
  scales:{x:{max:100,ticks:{color:text},grid:{color:grid}},y:{ticks:{color:text},grid:{color:grid}}}}});
  renderLegend();renderFooter(docs,modules);updateStatsCounter();
}

/* ---------- COLORS ---------- */
function getThemeColors(){const s=getComputedStyle(document.body);
  return{accent:s.getPropertyValue("--accent").trim(),text:s.getPropertyValue("--text").trim(),grid:s.getPropertyValue("--grid").trim()};
}

/* ---------- LEGEND + FOOTER ---------- */
function renderLegend(){const c=document.getElementById("progressLegend");
  const s=getComputedStyle(document.body);
  const accent=s.getPropertyValue("--accent").trim();const grid=s.getPropertyValue("--grid").trim();const text=s.getPropertyValue("--text").trim();
  c.innerHTML=`<div class="legend-item"><div class="legend-dot" style="background:${accent};box-shadow:0 0 6px ${accent};"></div><span style="color:${text}">Completed</span></div>
  <div class="legend-item"><div class="legend-dot" style="background:${grid}"></div><span style="color:${text}">Remaining</span></div>`;
}
function renderFooter(progressDocs,modules){const c=document.getElementById("progressFooter");if(!c)return;
  const total=modules.length;
  const completed=new Set(progressDocs.filter(p=>p.status==="completed").map(p=>p.moduleId)).size;
  const latest=progressDocs.map(p=>new Date(p.updatedAt)).sort((a,b)=>b-a)[0];
  const last=latest?latest.toLocaleString():"No progress yet";
  const prev=c.dataset.lastCompleted||"";c.dataset.lastCompleted=completed;
  const pulse=prev&&prev!=completed;
  c.innerHTML=`<div class="footer-pill ${pulse?"updated":""}">Modules Completed: ${completed}/${total}</div>
  <div class="footer-pill ${pulse?"updated":""}">Last Update: ${last}</div>`;
}

/* ---------- LOGGING SYSTEM ---------- */
function appendAgentLog(message,type="info",source="CDC_AGENT"){const el=document.querySelector("#agentConsole .agent-scroll");if(!el)return;
  const entry={message,type,source,time:Date.now()};let logs=JSON.parse(localStorage.getItem("cdcAgentLogs")||"[]");
  logs.push(entry);if(logs.length>10)logs.shift();localStorage.setItem("cdcAgentLogs",JSON.stringify(logs));
  const div=document.createElement("div");div.className=`agent-line ${type}`;
  div.innerHTML=`<span class="tag ${source.toLowerCase().slice(0,4)}">[${source}]</span> ${message}`;
  el.appendChild(div);el.scrollTop=el.scrollHeight;updateStatsCounter();}
function applyLogFilter(filter){const lines=document.querySelectorAll(".agent-line");
  lines.forEach(l=>{const src=l.querySelector(".tag")?.textContent.replace(/[\[\]]/g,"").trim().toUpperCase();
    l.style.display=(filter==="all"||(filter==="ERROR"&&l.classList.contains("error"))||src===filter)?"block":"none";});}

/* ---------- MODAL + EXPORT ---------- */
function showSessionModal(){const modal=document.getElementById("sessionModal");
  const d=document.getElementById("sessionDetails");
  const logs=JSON.parse(localStorage.getItem("cdcAgentLogs")||"[]");
  const sources=[...new Set(logs.map(l=>l.source))];
  const lastClear=localStorage.getItem("cdcLastClearTime")||"Never";
  const autoClear=localStorage.getItem("autoClearLogs")==="true";
  const grouped=sources.map(s=>`<li><strong>${s}</strong>: ${logs.filter(l=>l.source===s).length}</li>`).join("");
  const recent=logs.slice(-5).reverse().map(l=>`<div class="agent-line ${l.type}">
  <span class="tag ${l.source.toLowerCase().slice(0,4)}">[${l.source}]</span> ${l.message}</div>`).join("");
  d.innerHTML=`<p><b>Total Logs:</b> ${logs.length}</p><ul>${grouped}</ul>
  <p><b>Auto-Clear:</b> ${autoClear?"Enabled":"Disabled"}</p><p><b>Last Cleared:</b> ${lastClear}</p><hr><h4>Recent Events</h4>${recent}`;
  modal.classList.remove("hidden");}
document.getElementById("closeModal")?.addEventListener("click",()=>document.getElementById("sessionModal").classList.add("hidden"));
document.getElementById("statsButton")?.addEventListener("click",showSessionModal);
document.getElementById("exportTxt")?.addEventListener("click",()=>exportLogs("txt"));
document.getElementById("exportJson")?.addEventListener("click",()=>exportLogs("json"));
function exportLogs(fmt="txt"){const logs=JSON.parse(localStorage.getItem("cdcAgentLogs")||"[]");
  if(!logs.length)return alert("No logs to export.");const info={autoClear:localStorage.getItem("autoClearLogs"),lastClear:localStorage.getItem("cdcLastClearTime")};
  let content=fmt==="json"?JSON.stringify({info,logs},null,2):logs.map(l=>`[${new Date(l.time).toLocaleTimeString()}] [${l.source}] (${l.type}) ${l.message}`).join("\n");
  const blob=new Blob([content],{type:fmt==="json"?"application/json":"text/plain"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download=`CDC_Session_${new Date().toISOString().replace(/[:.]/g,"-")}.${fmt}`;a.click();URL.revokeObjectURL(a.href);}

/* ---------- INIT ---------- */
window.addEventListener("load",()=>updateStatsCounter());
export { appendAgentLog, applyLogFilter, showSessionModal, updateStatsCounter };
