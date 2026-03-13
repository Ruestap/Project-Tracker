import { useState, useEffect, useMemo } from "react";
import { db } from "./firebase";
import {
  collection, doc, onSnapshot,
  setDoc, deleteDoc, getDoc
} from "firebase/firestore";

/* ══════════════════════════════════════════
   CONSTANTES Y UTILIDADES
══════════════════════════════════════════ */
const TODAY = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
const fmtDate = d => d ? new Date(d+"T00:00:00").toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"}) : "—";
const parseDate = s => { if(!s) return new Date(); const d=new Date(s+"T00:00:00"); d.setHours(0,0,0,0); return d; };
const diffDays = (a,b) => Math.round((b-a)/86400000);
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DEFAULT_ADMIN = "admin1234";
const DEFAULT_VISIT = "visit5678";

function nextRecurrence(task) {
  if (task.tipo !== "recurrente") return null;
  const base = parseDate(task.fechaEntrega);
  const next = new Date(base);
  if (task.frecuencia === "semanal")   next.setDate(next.getDate()+7);
  if (task.frecuencia === "quincenal") next.setDate(next.getDate()+14);
  if (task.frecuencia === "mensual")   next.setMonth(next.getMonth()+1);
  return next.toISOString().slice(0,10);
}

function getProgreso(t) {
  const e = parseDate(t.fechaEntrega);
  if (t.estatus==="terminado")  return TODAY<e  ? "A TIEMPO"    : "FINALIZADO";
  if (t.estatus==="en proceso") return TODAY<e ? "EN PROGRESO" : "CON RETRASO";
  if (t.estatus==="pendiente")  return TODAY>e  ? "CON RETRASO" : "PENDIENTE";
  return "—";
}
function getTiempo(t) {
  if (t.estatus==="terminado") {
    const tot=Math.max(1,diffDays(parseDate(t.fechaInicio),parseDate(t.fechaEntrega)));
    return {label:`${tot}/${tot}`,pct:100};
  }
  const ini=parseDate(t.fechaInicio), end=parseDate(t.fechaEntrega);
  const total=Math.max(1,diffDays(ini,end));
  const el=Math.min(total,Math.max(0,diffDays(ini,TODAY)));
  return {label:`${el}/${total}`,pct:Math.round((el/total)*100)};
}
function diasRestantes(t) { return diffDays(TODAY,parseDate(t.fechaEntrega)); }
function ganttColor(t) {
  const p=getProgreso(t);
  if(p==="CON RETRASO")        return "#ef4444";
  if(t.estatus==="terminado")  return "#22c55e";
  if(t.estatus==="en proceso") return "#eab308";
  return "#475569";
}

const PROG_P = {
  "EN PROGRESO": {c:"#60a5fa",b:"rgba(59,130,246,.12)", br:"rgba(59,130,246,.35)"},
  "CON RETRASO": {c:"#f87171",b:"rgba(239,68,68,.12)",  br:"rgba(239,68,68,.35)"},
  "PENDIENTE":   {c:"#94a3b8",b:"rgba(100,116,139,.12)",br:"rgba(100,116,139,.35)"},
  "A TIEMPO":    {c:"#4ade80",b:"rgba(34,197,94,.12)",  br:"rgba(34,197,94,.35)"},
  "FINALIZADO":  {c:"#2dd4bf",b:"rgba(20,184,166,.12)", br:"rgba(20,184,166,.35)"},
  "—":           {c:"#94a3b8",b:"rgba(100,116,139,.12)",br:"rgba(100,116,139,.35)"},
};
const ESTAT_P = {
  "terminado":  {c:"#4ade80",b:"rgba(34,197,94,.12)",   br:"rgba(34,197,94,.3)"},
  "en proceso": {c:"#fbbf24",b:"rgba(251,191,36,.12)",  br:"rgba(251,191,36,.3)"},
  "pendiente":  {c:"#94a3b8",b:"rgba(100,116,139,.12)", br:"rgba(100,116,139,.3)"},
};
const TIPO_META = {
  "tarea":      {icon:"📋",label:"Tarea",     color:"#6366f1"},
  "recurrente": {icon:"🔄",label:"Recurrente",color:"#8b5cf6"},
  "entregable": {icon:"📊",label:"Entregable",color:"#f59e0b"},
};
const avBg  = n=>{const h=(n||"?").split("").reduce((a,c)=>a+c.charCodeAt(0),0);return["#6366f1","#8b5cf6","#ec4899","#14b8a6","#f97316","#0ea5e9"][h%6];};
const getIni= n=>(n||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();

const INIT_TASKS = [
  {id:"t1",tipo:"entregable",actividad:"PPT Gerencial — Estatus Semanal",area:"Dirección",responsable:"Ana García",fechaInicio:"2026-03-04",fechaEntrega:"2026-03-10",estatus:"terminado",frecuencia:"",creadoPor:"admin"},
  {id:"t2",tipo:"recurrente",actividad:"PPT Gerencial — Estatus Semanal",area:"Dirección",responsable:"Ana García",fechaInicio:"2026-03-11",fechaEntrega:"2026-03-17",estatus:"en proceso",frecuencia:"semanal",creadoPor:"admin"},
  {id:"t3",tipo:"tarea",actividad:"Diseño de arquitectura del sistema",area:"Tecnología",responsable:"Carlos López",fechaInicio:"2026-03-05",fechaEntrega:"2026-03-20",estatus:"en proceso",frecuencia:"",creadoPor:"admin"},
  {id:"t4",tipo:"tarea",actividad:"Desarrollo módulo de pagos",area:"Tecnología",responsable:"María Torres",fechaInicio:"2026-03-10",fechaEntrega:"2026-03-30",estatus:"en proceso",frecuencia:"",creadoPor:"admin"},
  {id:"t5",tipo:"entregable",actividad:"Reporte mensual de avance",area:"PMO",responsable:"Luis Méndez",fechaInicio:"2026-03-01",fechaEntrega:"2026-03-31",estatus:"pendiente",frecuencia:"",creadoPor:"admin"},
  {id:"t6",tipo:"recurrente",actividad:"Reunión de sincronización de equipo",area:"PMO",responsable:"Sofía Ruiz",fechaInicio:"2026-03-03",fechaEntrega:"2026-03-07",estatus:"terminado",frecuencia:"semanal",creadoPor:"admin"},
];
const INIT_AREAS = ["Dirección","PMO","Tecnología","RRHH","Finanzas","Operaciones","Calidad"];
const INIT_RESPS = ["Ana García","Carlos López","María Torres","Luis Méndez","Sofía Ruiz","Pedro Alvarado"];

/* ══ FIREBASE HELPERS ══ */
async function fbSaveTask(task) {
  await setDoc(doc(db,"tasks", String(task.id)), task);
}
async function fbDeleteTask(id) {
  await deleteDoc(doc(db,"tasks", String(id)));
}
async function fbSaveConfig(key, value) {
  await setDoc(doc(db,"config", key), { value: JSON.stringify(value) });
}

/* ══════════════════════════════════════════
   COMPONENTES PEQUEÑOS
══════════════════════════════════════════ */
const Badge = ({c,b,br,children,size=10})=>(
  <span style={{padding:"3px 9px",borderRadius:20,fontSize:size,fontWeight:700,color:c,backgroundColor:b,border:`1px solid ${br}`,whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:4}}>{children}</span>
);

function Pill({task}) {
  const m=TIPO_META[task.tipo]||TIPO_META.tarea;
  return <span style={{padding:"2px 8px",borderRadius:20,fontSize:9,fontWeight:700,color:m.color,background:m.color+"18",border:`1px solid ${m.color}33`,whiteSpace:"nowrap"}}>{m.icon} {m.label.toUpperCase()}</span>;
}

function SemaforoGlobal({tasks}) {
  const total=tasks.length;
  if(!total) return null;
  const ret=tasks.filter(t=>getProgreso(t)==="CON RETRASO").length;
  const ok=tasks.filter(t=>t.estatus==="terminado").length;
  const pct=Math.round((ok/total)*100);
  let color,label,desc;
  if(ret===0&&pct>=80){color="#22c55e";label="SALUDABLE";desc="Todo bajo control";}
  else if(ret<=1||pct>=50){color="#eab308";label="ATENCIÓN";desc=`${ret} tarea${ret!==1?"s":""} con retraso`;}
  else{color="#ef4444";label="EN RIESGO";desc=`${ret} tareas atrasadas`;}
  return (
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 18px",borderRadius:12,background:color+"10",border:`1.5px solid ${color}40`}}>
      <div style={{width:14,height:14,borderRadius:"50%",background:color,boxShadow:`0 0 10px ${color}88`,flexShrink:0}}/>
      <div>
        <div style={{fontSize:13,fontWeight:800,color,fontFamily:"'Syne',sans-serif",letterSpacing:".05em"}}>{label}</div>
        <div style={{fontSize:10,color:"#64748b"}}>{desc}</div>
      </div>
    </div>
  );
}

function CatalogRow({value,onSave,onDelete,accent}) {
  const [ed,setEd]=useState(false);const [v,setV]=useState(value);
  useEffect(()=>setV(value),[value]);
  const commit=()=>{if(v.trim()){onSave(v.trim());setEd(false);}};
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,background:"rgba(255,255,255,.03)",border:`1px solid ${accent}22`,marginBottom:6}}>
      {ed?<>
        <input autoFocus value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape"){setV(value);setEd(false);}}}
          style={{flex:1,background:"rgba(8,14,26,.9)",border:`1px solid ${accent}55`,borderRadius:6,padding:"5px 10px",color:"#e2e8f0",fontSize:12,outline:"none"}}/>
        <button onClick={commit} style={{padding:"4px 12px",borderRadius:6,border:"none",background:`linear-gradient(135deg,${accent},#14b8a6)`,color:"white",cursor:"pointer",fontSize:11,fontWeight:700}}>✓</button>
        <button onClick={()=>{setV(value);setEd(false);}} style={{padding:"4px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,.1)",background:"transparent",color:"#64748b",cursor:"pointer",fontSize:11}}>✕</button>
      </>:<>
        <span style={{flex:1,fontSize:13,color:"#cbd5e1"}}>{value}</span>
        <button onClick={()=>{setV(value);setEd(true);}} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${accent}44`,background:`${accent}11`,color:accent,cursor:"pointer",fontSize:11}}>✏️</button>
        <button onClick={onDelete} style={{padding:"4px 10px",borderRadius:6,border:"1px solid rgba(239,68,68,.3)",background:"rgba(239,68,68,.08)",color:"#fca5a5",cursor:"pointer",fontSize:11}}>🗑️</button>
      </>}
    </div>
  );
}
function AddRow({placeholder,onAdd,accent}){
  const [v,setV]=useState("");
  const go=()=>{if(v.trim()){onAdd(v.trim());setV("");}};
  return(
    <div style={{display:"flex",gap:8,marginTop:10}}>
      <input value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} placeholder={placeholder}
        style={{flex:1,background:"rgba(8,14,26,.9)",border:`1px dashed ${accent}44`,borderRadius:8,padding:"8px 12px",color:"#e2e8f0",fontSize:12,outline:"none"}}/>
      <button onClick={go} style={{padding:"8px 14px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${accent},#14b8a6)`,color:"white",cursor:"pointer",fontSize:12,fontWeight:700}}>＋</button>
    </div>
  );
}

/* ══ EXPORTS ══ */
function exportCSV(tasks){
  const rows=tasks.map(t=>({"Tipo":TIPO_META[t.tipo]?.label||"","Actividad":t.actividad,"Área":t.area||"","Responsable":t.responsable||"","F.Inicio":t.fechaInicio,"F.Entrega":t.fechaEntrega,"Frecuencia":t.frecuencia||"Única vez","Estatus":t.estatus,"Progreso":getProgreso(t),"Tiempo":getTiempo(t).label,"% Avance":getTiempo(t).pct+"%","Días Restantes":diasRestantes(t)}));
  const H=Object.keys(rows[0]);
  const csv="\uFEFF"+[H,...rows.map(r=>H.map(h=>`"${(r[h]??"")}"`))].map(r=>r.join(",")).join("\n");
  const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"})),download:`reporte-${new Date().toISOString().slice(0,10)}.csv`});
  document.body.appendChild(a);a.click();document.body.removeChild(a);
}

function exportPDF(tasks){
  const pc=p=>({"EN PROGRESO":"#3b82f6","CON RETRASO":"#ef4444","PENDIENTE":"#64748b","A TIEMPO":"#22c55e","FINALIZADO":"#14b8a6"}[p]||"#64748b");
  const ec=e=>({terminado:"#22c55e","en proceso":"#eab308",pendiente:"#64748b"}[e]||"#64748b");
  const tot=tasks.length,term=tasks.filter(t=>t.estatus==="terminado").length,proc=tasks.filter(t=>t.estatus==="en proceso").length,ret=tasks.filter(t=>getProgreso(t)==="CON RETRASO").length,pend=tasks.filter(t=>t.estatus==="pendiente").length;
  const pct=tot?Math.round((term/tot)*100):0;
  const hRows=tasks.map(t=>{const pr=getProgreso(t),ti=getTiempo(t),dr=diasRestantes(t);const m=TIPO_META[t.tipo]||TIPO_META.tarea;
    return `<tr><td><span style="font-size:9px;padding:2px 6px;border-radius:10px;background:${m.color}18;color:${m.color};font-weight:700">${m.icon} ${m.label}</span></td><td style="font-weight:600">${t.actividad}</td><td>${t.area||"—"}</td><td>${t.responsable||"—"}</td><td>${fmtDate(t.fechaEntrega)}</td><td style="color:${ec(t.estatus)};font-weight:700">${t.estatus.toUpperCase()}</td><td style="color:${pc(pr)};font-weight:700">${pr}</td><td style="text-align:center;font-weight:600;color:${dr<0?"#ef4444":dr<=3?"#eab308":"#22c55e"}">${dr<0?`+${Math.abs(dr)}d`:dr===0?"Hoy":`${dr}d`}</td></tr>`;}).join("");
  const w=window.open("","_blank","width=1100,height=750");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte Ejecutivo</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;background:#fff;color:#1e293b;padding:32px}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #4f46e5}
.title{font-size:22px;font-weight:800;color:#4f46e5}.sub{font-size:10px;color:#94a3b8;margin-top:4px}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px}
.kpi{padding:14px;border-radius:10px;border:1px solid #e2e8f0;text-align:center}
.kpi-n{font-size:28px;font-weight:800;line-height:1}.kpi-l{font-size:10px;color:#94a3b8;margin-top:3px;font-weight:600;letter-spacing:.04em}
.prog-bar{height:10px;background:#f1f5f9;border-radius:5px;overflow:hidden;margin-bottom:6px}
.prog-fill{height:100%;background:linear-gradient(90deg,#4f46e5,#14b8a6);border-radius:5px}
table{width:100%;border-collapse:collapse;font-size:10px}
th{background:#4f46e5;color:white;padding:9px 10px;text-align:left;font-size:9px;letter-spacing:.04em}
td{padding:8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
tr:nth-child(even) td{background:#f8fafc}
.footer{margin-top:20px;font-size:9px;color:#94a3b8;text-align:right;border-top:1px solid #e2e8f0;padding-top:10px}
.semaforo{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;font-weight:700;font-size:11px}
@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
<div class="header"><div><div class="title">📊 Reporte Ejecutivo de Proyecto</div><div class="sub">Generado el ${new Date().toLocaleDateString("es-ES",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})} | ${tot} actividades</div></div>
<div class="semaforo" style="background:${ret===0&&pct>=80?"#dcfce7":ret<=1||pct>=50?"#fef9c3":"#fee2e2"};color:${ret===0&&pct>=80?"#16a34a":ret<=1||pct>=50?"#ca8a04":"#dc2626"}">● ${ret===0&&pct>=80?"SALUDABLE":ret<=1||pct>=50?"ATENCIÓN":"EN RIESGO"}</div></div>
<div class="kpis">
<div class="kpi"><div class="kpi-n" style="color:#4f46e5">${tot}</div><div class="kpi-l">TOTAL</div></div>
<div class="kpi"><div class="kpi-n" style="color:#22c55e">${term}</div><div class="kpi-l">TERMINADAS</div></div>
<div class="kpi"><div class="kpi-n" style="color:#eab308">${proc}</div><div class="kpi-l">EN PROCESO</div></div>
<div class="kpi"><div class="kpi-n" style="color:#94a3b8">${pend}</div><div class="kpi-l">PENDIENTES</div></div>
<div class="kpi"><div class="kpi-n" style="color:#ef4444">${ret}</div><div class="kpi-l">CON RETRASO</div></div>
</div>
<div style="margin-bottom:20px"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:11px;font-weight:700">AVANCE GLOBAL</span><span style="font-size:13px;font-weight:800;color:#4f46e5">${pct}%</span></div>
<div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div></div>
<table><thead><tr><th>TIPO</th><th>ACTIVIDAD</th><th>ÁREA</th><th>RESPONSABLE</th><th>F. ENTREGA</th><th>ESTATUS</th><th>PROGRESO</th><th>DÍAS</th></tr></thead><tbody>${hRows}</tbody></table>
<div class="footer">Project Tracker Corp © ${new Date().getFullYear()}</div>
<script>window.onload=()=>window.print();</script></body></html>`);
  w.document.close();
}

/* ══ LOGIN ══ */
function LoginScreen({adminPin,visitorPin,onLogin}){
  const [pin,setPin]=useState(""),[name,setName]=useState(""),[step,setStep]=useState("pin");
  const [err,setErr]=useState(false),[shake,setShake]=useState(false);
  const tryPin=()=>{
    if(pin===adminPin){onLogin("admin","Administrador");return;}
    if(pin===visitorPin){setStep("name");return;}
    setErr(true);setShake(true);setTimeout(()=>{setErr(false);setShake(false);setPin("");},1400);
  };
  return(
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#060d18",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&family=Syne:wght@700;800&display=swap" rel="stylesheet"/>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
      <div style={{width:380,background:"#0f1923",borderRadius:20,padding:40,border:"1px solid rgba(99,102,241,.2)",boxShadow:"0 40px 100px rgba(0,0,0,.8)",textAlign:"center"}}>
        <div style={{width:70,height:70,borderRadius:20,background:"linear-gradient(135deg,#4f46e5,#0d9488)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:34,margin:"0 auto 24px",boxShadow:"0 8px 30px rgba(79,70,229,.5)"}}>📊</div>
        <h1 style={{fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:800,margin:"0 0 8px",color:"#f1f5f9",letterSpacing:"-.01em"}}>PROJECT TRACKER</h1>
        {step==="pin"?<>
          <p style={{margin:"0 0 28px",fontSize:12,color:"#475569",lineHeight:1.7}}>Ingresa tu código de acceso</p>
          <div style={{animation:shake?"shake .4s ease":"none",marginBottom:16}}>
            <input autoFocus type="password" value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&tryPin()} placeholder="••••••••"
              style={{width:"100%",padding:"14px",borderRadius:12,border:`2px solid ${err?"#ef4444":"rgba(99,102,241,.3)"}`,background:"rgba(0,0,0,.4)",color:"#f1f5f9",fontSize:18,outline:"none",textAlign:"center",letterSpacing:8,boxSizing:"border-box",marginBottom:12}}/>
            <button onClick={tryPin} style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#4f46e5,#0d9488)",color:"white",cursor:"pointer",fontSize:14,fontWeight:700}}>
              {err?"❌  Código incorrecto":"Ingresar →"}
            </button>
          </div>
          <div style={{padding:"12px 16px",borderRadius:10,background:"rgba(99,102,241,.06)",border:"1px solid rgba(99,102,241,.15)",fontSize:10,color:"#475569",lineHeight:1.9}}>
            🔐 Admin — control total &nbsp;|&nbsp; 👁️ Visitante — agregar y visualizar
          </div>
        </>:<>
          <p style={{margin:"0 0 24px",fontSize:12,color:"#2dd4bf",lineHeight:1.7}}>✅ Acceso verificado<br/><span style={{color:"#475569"}}>¿Cómo aparecerás en el tablero?</span></p>
          <input autoFocus value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&name.trim()&&onLogin("visitor",name.trim())} placeholder="Tu nombre completo"
            style={{width:"100%",padding:"13px",borderRadius:12,border:"2px solid rgba(20,184,166,.4)",background:"rgba(0,0,0,.4)",color:"#f1f5f9",fontSize:14,outline:"none",textAlign:"center",boxSizing:"border-box",marginBottom:12}}/>
          <button onClick={()=>name.trim()&&onLogin("visitor",name.trim())} disabled={!name.trim()}
            style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:name.trim()?"linear-gradient(135deg,#0d9488,#059669)":"rgba(255,255,255,.05)",color:name.trim()?"white":"#334155",cursor:name.trim()?"pointer":"not-allowed",fontSize:14,fontWeight:700}}>
            Entrar al tablero →
          </button>
        </>}
      </div>
    </div>
  );
}

/* ══ MODAL TAREA ══ */
function TaskModal({task,isAdmin,areas,resps,userName,onSave,onClose}){
  const editing=!!task.id&&!task._new;
  const [f,setF]=useState(task);
  const [err,setErr]=useState("");
  const inpS={width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid rgba(99,102,241,.25)",background:"rgba(0,0,0,.4)",color:"#e2e8f0",fontSize:12,outline:"none",boxSizing:"border-box"};
  const disS={...inpS,border:"1px solid rgba(255,255,255,.06)",background:"rgba(255,255,255,.02)",color:"#475569",cursor:"not-allowed"};
  const lbl={fontSize:10,color:"#6366f1",fontWeight:700,letterSpacing:".06em",display:"block",marginBottom:4};
  const save=()=>{
    if(!f.actividad.trim()){setErr("La actividad es requerida");return;}
    if(!f.fechaInicio||!f.fechaEntrega){setErr("Las fechas son requeridas");return;}
    if(f.tipo==="recurrente"&&!f.frecuencia){setErr("Selecciona la frecuencia");return;}
    onSave(f);
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,backdropFilter:"blur(8px)"}}>
      <div style={{background:"#0f1923",borderRadius:16,padding:28,width:"92%",maxWidth:560,border:"1px solid rgba(99,102,241,.3)",boxShadow:"0 30px 80px rgba(0,0,0,.8)",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
          <div style={{width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,#4f46e5,#0d9488)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>{editing?"✏️":"➕"}</div>
          <div>
            <h3 style={{fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:800,margin:0,color:"#a5b4fc"}}>{editing?"Editar Actividad":"Nueva Actividad"}</h3>
            {!isAdmin&&<p style={{margin:0,fontSize:10,color:"#475569"}}>Las fechas solo pueden ser modificadas por el administrador</p>}
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <label style={lbl}>TIPO DE ACTIVIDAD</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {Object.entries(TIPO_META).map(([k,m])=>(
              <button key={k} onClick={()=>setF(p=>({...p,tipo:k}))}
                style={{padding:"10px 8px",borderRadius:10,border:`2px solid ${f.tipo===k?m.color:m.color+"30"}`,background:f.tipo===k?m.color+"18":"rgba(255,255,255,.02)",cursor:"pointer",transition:"all .15s",textAlign:"center"}}>
                <div style={{fontSize:18,marginBottom:2}}>{m.icon}</div>
                <div style={{fontSize:10,fontWeight:700,color:f.tipo===k?m.color:"#64748b"}}>{m.label}</div>
              </button>
            ))}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          <div style={{gridColumn:"1/-1"}}>
            <label style={lbl}>ACTIVIDAD *</label>
            <input style={inpS} value={f.actividad} onChange={e=>setF(p=>({...p,actividad:e.target.value}))} placeholder="Descripción de la actividad"/>
          </div>
          <div><label style={lbl}>ÁREA</label>
            <select style={inpS} value={f.area} onChange={e=>setF(p=>({...p,area:e.target.value}))}>
              <option value="">— Seleccionar —</option>{areas.map(a=><option key={a} value={a}>{a}</option>)}
            </select></div>
          <div><label style={lbl}>RESPONSABLE</label>
            {isAdmin
              ?<select style={inpS} value={f.responsable} onChange={e=>setF(p=>({...p,responsable:e.target.value}))}>
                <option value="">— Seleccionar —</option>{resps.map(r=><option key={r} value={r}>{r}</option>)}
               </select>
              :<input style={disS} value={f.responsable} readOnly/>}
          </div>
          <div><label style={lbl}>FECHA INICIO *</label>
            <input style={inpS} type="date" value={f.fechaInicio} onChange={e=>setF(p=>({...p,fechaInicio:e.target.value}))}/>
          </div>
          <div>
            <label style={{...lbl,color:isAdmin?"#6366f1":"#475569"}}>FECHA ENTREGA *{!isAdmin&&editing?" 🔒":""}</label>
            {(isAdmin||!editing)
              ?<input style={inpS} type="date" value={f.fechaEntrega} onChange={e=>setF(p=>({...p,fechaEntrega:e.target.value}))}/>
              :<input style={disS} type="date" value={f.fechaEntrega} readOnly/>}
          </div>
          {f.tipo==="recurrente"&&<div style={{gridColumn:"1/-1"}}>
            <label style={lbl}>FRECUENCIA</label>
            <div style={{display:"flex",gap:8}}>
              {["semanal","quincenal","mensual"].map(fr=>(
                <button key={fr} onClick={()=>setF(p=>({...p,frecuencia:fr}))}
                  style={{flex:1,padding:"8px 4px",borderRadius:8,border:`2px solid ${f.frecuencia===fr?"#8b5cf6":"rgba(139,92,246,.25)"}`,background:f.frecuencia===fr?"rgba(139,92,246,.15)":"rgba(255,255,255,.02)",cursor:"pointer",color:f.frecuencia===fr?"#c4b5fd":"#64748b",fontSize:11,fontWeight:700,textTransform:"capitalize"}}>
                  {fr}
                </button>
              ))}
            </div>
          </div>}
          {f.tipo==="recurrente"&&editing&&isAdmin&&<div style={{gridColumn:"1/-1",padding:"10px 14px",borderRadius:10,background:"rgba(234,179,8,.06)",border:"1px solid rgba(234,179,8,.2)"}}>
            <p style={{fontSize:10,color:"#fbbf24",margin:0}}>⚡ Puedes cambiar la fecha de esta instancia sin afectar el patrón de recurrencia.</p>
          </div>}
          <div style={{gridColumn:"1/-1"}}>
            <label style={lbl}>ESTATUS</label>
            <select style={inpS} value={f.estatus} onChange={e=>setF(p=>({...p,estatus:e.target.value}))}>
              <option value="pendiente">Pendiente</option>
              <option value="en proceso">En Proceso</option>
              <option value="terminado">Terminado</option>
            </select>
          </div>
        </div>
        {err&&<div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",fontSize:11,color:"#fca5a5"}}>{err}</div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{padding:"8px 20px",borderRadius:8,border:"1px solid rgba(255,255,255,.1)",background:"transparent",color:"#64748b",cursor:"pointer",fontWeight:600,fontSize:12}}>Cancelar</button>
          <button onClick={save} style={{padding:"8px 22px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#4f46e5,#0d9488)",color:"white",cursor:"pointer",fontWeight:700,fontSize:12}}>{editing?"Guardar Cambios":"Agregar"}</button>
        </div>
      </div>
    </div>
  );
}

/* ══ MODAL PINs ══ */
function PinModal({adminPin,visitorPin,onSave,onClose}){
  const [ap,setAp]=useState(adminPin),[vp,setVp]=useState(visitorPin),[show,setShow]=useState(false),[err,setErr]=useState("");
  const save=()=>{if(ap.length<4){setErr("Mínimo 4 caracteres");return;}if(vp.length<4){setErr("Mínimo 4 caracteres");return;}if(ap===vp){setErr("Los códigos no pueden ser iguales");return;}onSave(ap,vp);};
  const inp={width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid rgba(99,102,241,.25)",background:"rgba(0,0,0,.4)",color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box",letterSpacing:4,fontFamily:"monospace"};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:60,backdropFilter:"blur(8px)"}}>
      <div style={{background:"#0f1923",borderRadius:16,padding:28,width:"90%",maxWidth:400,border:"1px solid rgba(99,102,241,.3)"}}>
        <h3 style={{fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:800,margin:"0 0 18px",color:"#a5b4fc"}}>🔑 Gestionar Códigos de Acceso</h3>
        <div style={{marginBottom:12}}><label style={{fontSize:10,color:"#6366f1",fontWeight:700,letterSpacing:".06em",display:"block",marginBottom:4}}>🔐 CÓDIGO ADMINISTRADOR</label><input type={show?"text":"password"} value={ap} onChange={e=>setAp(e.target.value)} style={inp}/></div>
        <div style={{marginBottom:12}}><label style={{fontSize:10,color:"#14b8a6",fontWeight:700,letterSpacing:".06em",display:"block",marginBottom:4}}>👁️ CÓDIGO VISITANTE</label><input type={show?"text":"password"} value={vp} onChange={e=>setVp(e.target.value)} style={inp}/></div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:err?10:16}} onClick={()=>setShow(s=>!s)}><input type="checkbox" checked={show} readOnly style={{cursor:"pointer"}}/><span style={{fontSize:11,color:"#64748b",cursor:"pointer"}}>Mostrar códigos</span></div>
        {err&&<div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",fontSize:11,color:"#fca5a5"}}>{err}</div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{padding:"8px 18px",borderRadius:8,border:"1px solid rgba(255,255,255,.1)",background:"transparent",color:"#64748b",cursor:"pointer",fontSize:12}}>Cancelar</button>
          <button onClick={save} style={{padding:"8px 20px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#4f46e5,#0d9488)",color:"white",cursor:"pointer",fontWeight:700,fontSize:12}}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

/* ══ VISTA EJECUTIVA ══ */
function VistaEjecutiva({tasks}){
  const tot=tasks.length,term=tasks.filter(t=>t.estatus==="terminado").length,proc=tasks.filter(t=>t.estatus==="en proceso").length,pend=tasks.filter(t=>t.estatus==="pendiente").length,ret=tasks.filter(t=>getProgreso(t)==="CON RETRASO").length;
  const pct=tot?Math.round((term/tot)*100):0;
  const proximos=tasks.filter(t=>t.estatus!=="terminado"&&diasRestantes(t)>=0&&diasRestantes(t)<=7).sort((a,b)=>diasRestantes(a)-diasRestantes(b));
  const atRisk=tasks.filter(t=>getProgreso(t)==="CON RETRASO");
  const recurrentes=tasks.filter(t=>t.tipo==="recurrente"&&t.estatus!=="terminado");
  const entregables=tasks.filter(t=>t.tipo==="entregable"&&t.estatus!=="terminado").sort((a,b)=>diasRestantes(a)-diasRestantes(b));
  const cardS={background:"#0f1923",borderRadius:12,padding:"18px 20px",border:"1px solid rgba(255,255,255,.06)"};
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:12,marginBottom:16}}>
        {[[tot,"TOTAL","#a5b4fc","rgba(99,102,241,.3)"],[term,"TERMINADAS","#4ade80","rgba(34,197,94,.3)"],[proc,"EN PROCESO","#fbbf24","rgba(251,191,36,.3)"],[pend,"PENDIENTES","#94a3b8","rgba(100,116,139,.3)"],[ret,"CON RETRASO","#f87171","rgba(239,68,68,.3)"]].map(([n,l,c,bg])=>(
          <div key={l} style={{...cardS,textAlign:"center",border:`1px solid ${bg}`,background:bg.replace(".3",".06")}}>
            <div style={{fontSize:36,fontWeight:800,color:c,lineHeight:1,fontFamily:"'Syne',sans-serif"}}>{n}</div>
            <div style={{fontSize:9,color:"#475569",marginTop:4,letterSpacing:".08em",fontWeight:700}}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{...cardS,marginBottom:16,display:"flex",alignItems:"center",gap:20}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:".06em"}}>AVANCE GLOBAL DEL PROYECTO</span>
            <span style={{fontSize:22,fontWeight:800,color:"#a5b4fc",fontFamily:"'Syne',sans-serif"}}>{pct}%</span>
          </div>
          <div style={{height:12,background:"rgba(255,255,255,.06)",borderRadius:6,overflow:"hidden"}}>
            <div style={{width:`${pct}%`,height:"100%",background:"linear-gradient(90deg,#4f46e5,#0d9488)",borderRadius:6,transition:"width .5s"}}/>
          </div>
          <div style={{display:"flex",gap:16,marginTop:10}}>
            {[[term,"Terminadas","#4ade80"],[proc,"En Proceso","#fbbf24"],[pend,"Pendientes","#64748b"],[ret,"Con Retraso","#ef4444"]].map(([n,l,c])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"#64748b"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0}}/><span>{n} {l}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{width:1,height:60,background:"rgba(255,255,255,.06)",flexShrink:0}}/>
        <SemaforoGlobal tasks={tasks}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div style={cardS}>
          <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:".06em",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
            ⏰ VENCEN EN LOS PRÓXIMOS 7 DÍAS
            <span style={{marginLeft:"auto",padding:"2px 8px",borderRadius:10,background:"rgba(251,191,36,.15)",color:"#fbbf24",fontSize:10,fontWeight:700}}>{proximos.length}</span>
          </div>
          {proximos.length===0?<p style={{fontSize:11,color:"#334155",textAlign:"center",padding:"12px 0"}}>Sin vencimientos próximos ✓</p>:
          proximos.map(t=>{const dr=diasRestantes(t);return(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,background:"rgba(255,255,255,.02)",marginBottom:6,border:"1px solid rgba(255,255,255,.04)"}}>
              <Pill task={t}/>
              <span style={{flex:1,fontSize:11,fontWeight:600,color:"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t.actividad}>{t.actividad}</span>
              <span style={{fontSize:11,fontWeight:700,color:dr===0?"#ef4444":dr<=2?"#f97316":"#fbbf24",flexShrink:0,fontFamily:"monospace"}}>{dr===0?"Hoy":dr===1?"Mañana":`${dr}d`}</span>
            </div>
          );})}
        </div>
        <div style={cardS}>
          <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:".06em",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
            🔴 TAREAS CON RETRASO
            <span style={{marginLeft:"auto",padding:"2px 8px",borderRadius:10,background:"rgba(239,68,68,.15)",color:"#f87171",fontSize:10,fontWeight:700}}>{atRisk.length}</span>
          </div>
          {atRisk.length===0?<p style={{fontSize:11,color:"#334155",textAlign:"center",padding:"12px 0"}}>Sin tareas atrasadas ✓</p>:
          atRisk.map(t=>{const dr=Math.abs(diasRestantes(t));return(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,background:"rgba(239,68,68,.05)",marginBottom:6,border:"1px solid rgba(239,68,68,.15)"}}>
              <Pill task={t}/>
              <span style={{flex:1,fontSize:11,fontWeight:600,color:"#fca5a5",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t.actividad}>{t.actividad}</span>
              <span style={{fontSize:10,color:"#ef4444",fontWeight:700,flexShrink:0,fontFamily:"monospace"}}>+{dr}d</span>
            </div>
          );})}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={cardS}>
          <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:".06em",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
            🔄 COMPROMISOS RECURRENTES ACTIVOS
            <span style={{marginLeft:"auto",padding:"2px 8px",borderRadius:10,background:"rgba(139,92,246,.15)",color:"#c4b5fd",fontSize:10,fontWeight:700}}>{recurrentes.length}</span>
          </div>
          {recurrentes.length===0?<p style={{fontSize:11,color:"#334155",textAlign:"center",padding:"12px 0"}}>Sin recurrentes activos</p>:
          recurrentes.map(t=>(<div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,background:"rgba(139,92,246,.04)",marginBottom:6,border:"1px solid rgba(139,92,246,.12)"}}>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:"#e2e8f0",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t.actividad}>{t.actividad}</div>
              <div style={{fontSize:10,color:"#8b5cf6",marginTop:2,textTransform:"capitalize"}}>{t.frecuencia} · vence {fmtDate(t.fechaEntrega)}</div>
            </div>
            <span style={{marginLeft:"auto",flexShrink:0}}><Badge c={ESTAT_P[t.estatus].c} b={ESTAT_P[t.estatus].b} br={ESTAT_P[t.estatus].br}>{t.estatus.toUpperCase()}</Badge></span>
          </div>))}
        </div>
        <div style={cardS}>
          <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:".06em",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
            📊 ENTREGABLES PENDIENTES
            <span style={{marginLeft:"auto",padding:"2px 8px",borderRadius:10,background:"rgba(245,158,11,.15)",color:"#fbbf24",fontSize:10,fontWeight:700}}>{entregables.length}</span>
          </div>
          {entregables.length===0?<p style={{fontSize:11,color:"#334155",textAlign:"center",padding:"12px 0"}}>Sin entregables pendientes ✓</p>:
          entregables.map(t=>{const dr=diasRestantes(t);return(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,background:"rgba(245,158,11,.04)",marginBottom:6,border:"1px solid rgba(245,158,11,.15)"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:600,color:"#fcd34d",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t.actividad}>{t.actividad}</div>
                <div style={{fontSize:10,color:"#78716c",marginTop:2}}>{t.responsable} · {fmtDate(t.fechaEntrega)}</div>
              </div>
              <span style={{fontSize:11,fontWeight:700,color:dr<0?"#ef4444":dr<=3?"#f97316":"#fbbf24",fontFamily:"monospace",flexShrink:0}}>{dr<0?`+${Math.abs(dr)}d`:dr===0?"Hoy":`${dr}d`}</span>
            </div>
          );})}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   APP PRINCIPAL
══════════════════════════════════════════ */
const EMPTY_TASK = {tipo:"tarea",actividad:"",area:"",responsable:"",fechaInicio:"",fechaEntrega:"",estatus:"pendiente",frecuencia:"",creadoPor:"admin"};

export default function App(){
  const [role,     setRole]     = useState(null);
  const [userName, setUserName] = useState("");
  const [adminPin, setAdminPin] = useState(DEFAULT_ADMIN);
  const [visitPin, setVisitPin] = useState(DEFAULT_VISIT);
  const [tasks,    setTasks]    = useState([]);
  const [areas,    setAreas]    = useState(INIT_AREAS);
  const [resps,    setResps]    = useState(INIT_RESPS);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState(0);
  const [modal,    setModal]    = useState(null);
  const [ganttM,   setGanttM]   = useState(TODAY.getMonth());
  const [ganttY,   setGanttY]   = useState(TODAY.getFullYear());
  const [delCfm,   setDelCfm]   = useState(null);
  const [pinModal, setPinModal] = useState(false);
  const [filterTipo, setFilterTipo] = useState("todos");
  const [filterArea, setFilterArea] = useState("todas");
  const isAdmin = role==="admin";

  /* ── Firebase listeners en tiempo real ── */
  useEffect(()=>{
    // Tasks
    const unsubTasks = onSnapshot(collection(db,"tasks"), snap=>{
      if(snap.empty){
        // Primera vez: cargar datos iniciales
        INIT_TASKS.forEach(t=>fbSaveTask(t));
        setTasks(INIT_TASKS);
      } else {
        setTasks(snap.docs.map(d=>d.data()));
      }
      setLoading(false);
    });
    // Config (areas, resps, pins)
    const unsubConfig = onSnapshot(collection(db,"config"), snap=>{
      snap.docs.forEach(d=>{
        const key=d.id, val=JSON.parse(d.data().value);
        if(key==="areas")    setAreas(val);
        if(key==="resps")    setResps(val);
        if(key==="pins")     { setAdminPin(val.ap); setVisitPin(val.vp); }
      });
    });
    return ()=>{ unsubTasks(); unsubConfig(); };
  },[]);

  const saveTask = async newTask => {
    const isNew = !newTask.id || newTask._new;
    const task = {...newTask};
    delete task._new;
    if(isNew) task.id = "t"+Date.now();
    // Recurrente marcado terminado: avanzar fechas de la misma tarea
if(task.tipo==="recurrente" && task.estatus==="terminado"){
  const nextDate=nextRecurrence(task);
  if(nextDate){
    const advanced={...task, estatus:"pendiente", fechaInicio:task.fechaEntrega, fechaEntrega:nextDate};
    await fbSaveTask(advanced);
    setModal(null);
    return;
  }
}
await fbSaveTask(task);
setModal(null);
};

const markDone = async taskId => {
const task=tasks.find(t=>t.id===taskId);
if(!task) return;
if(task.tipo==="recurrente"){
  // Avanzar la misma tarea al siguiente período
  const nextDate=nextRecurrence(task);
  if(nextDate){
    const advanced={...task, estatus:"pendiente", fechaInicio:task.fechaEntrega, fechaEntrega:nextDate};
    await fbSaveTask(advanced);
    return;
  }
}
// Tarea normal: marcar terminado
await fbSaveTask({...task, estatus:"terminado"});
};

  const doDelete=async()=>{ await fbDeleteTask(delCfm); setDelCfm(null); };

  const saveAreas=async v=>{ setAreas(v); await fbSaveConfig("areas",v); };
  const saveResps=async v=>{ setResps(v); await fbSaveConfig("resps",v); };
  const savePins=async(ap,vp)=>{ setAdminPin(ap); setVisitPin(vp); setPinModal(false); await fbSaveConfig("pins",{ap,vp}); };

  const addArea   =v=>saveAreas([...areas,v]);
  const updateArea=(i,v)=>{const o=areas[i];const n=[...areas];n[i]=v;saveAreas(n);tasks.forEach(t=>{if(t.area===o)fbSaveTask({...t,area:v});});};
  const deleteArea=i=>{const r=areas[i];saveAreas(areas.filter((_,j)=>j!==i));tasks.forEach(t=>{if(t.area===r)fbSaveTask({...t,area:""});});};
  const addResp   =v=>saveResps([...resps,v]);
  const updateResp=(i,v)=>{const o=resps[i];const n=[...resps];n[i]=v;saveResps(n);tasks.forEach(t=>{if(t.responsable===o)fbSaveTask({...t,responsable:v});});};
  const deleteResp=i=>{const r=resps[i];saveResps(resps.filter((_,j)=>j!==i));tasks.forEach(t=>{if(t.responsable===r)fbSaveTask({...t,responsable:""});});};

  const filteredTasks=useMemo(()=>tasks.filter(t=>{
    if(filterTipo!=="todos"&&t.tipo!==filterTipo)return false;
    if(filterArea!=="todas"&&t.area!==filterArea)return false;
    return true;
  }),[tasks,filterTipo,filterArea]);

  const daysInMonth=new Date(ganttY,ganttM+1,0).getDate();
  const monthDays=Array.from({length:daysInMonth},(_,i)=>i+1);
  const inRange=(t,d)=>{const dt=new Date(ganttY,ganttM,d);dt.setHours(0,0,0,0);return dt>=parseDate(t.fechaInicio)&&dt<=parseDate(t.fechaEntrega);};
  const navM=dir=>{let m=ganttM+dir,y=ganttY;if(m<0){m=11;y--;}if(m>11){m=0;y++;}setGanttM(m);setGanttY(y);};

  const S={
    wrap:{fontFamily:"'DM Sans',sans-serif",background:"#060d18",minHeight:"100vh",color:"#e2e8f0"},
    hdr: {background:"linear-gradient(180deg,#0b1220 0%,#060d18 100%)",borderBottom:"1px solid rgba(255,255,255,.06)",padding:"16px 24px 0"},
    th:  {padding:"10px 12px",textAlign:"left",color:"#4f6080",fontWeight:700,fontSize:10,letterSpacing:".07em",whiteSpace:"nowrap",borderBottom:"1px solid rgba(255,255,255,.05)",background:"rgba(255,255,255,.02)"},
    td:  {padding:"10px 12px",borderBottom:"1px solid rgba(255,255,255,.03)",fontSize:11,verticalAlign:"middle"},
    tabB:a=>({padding:"8px 18px",borderRadius:"8px 8px 0 0",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,letterSpacing:".03em",transition:"all .15s",background:a?"linear-gradient(135deg,#4f46e5,#0d9488)":"transparent",color:a?"white":"#4f6080"}),
    inp: {width:"100%",padding:"8px 11px",borderRadius:8,border:"1px solid rgba(99,102,241,.2)",background:"rgba(0,0,0,.3)",color:"#e2e8f0",fontSize:12,outline:"none",boxSizing:"border-box"},
  };

  if(!role) return <LoginScreen adminPin={adminPin} visitorPin={visitPin} onLogin={(r,n)=>{setRole(r);setUserName(n);}}/>;

  if(loading) return(
    <div style={{...S.wrap,display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap" rel="stylesheet"/>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:16}}>📊</div>
        <div style={{fontFamily:"'Syne',sans-serif",fontSize:16,color:"#6366f1",fontWeight:800}}>Cargando tablero...</div>
        <div style={{fontSize:11,color:"#334155",marginTop:8}}>Conectando con Firebase</div>
      </div>
    </div>
  );

  const tabs=[["🏠 Ejecutivo",0],["📋 Actividades",1],["📅 Gantt",2],...(isAdmin?[["⚙️ Config",3]]:[])];

  return(
    <div style={S.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&family=Syne:wght@700;800&display=swap" rel="stylesheet"/>

      <div style={S.hdr}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14,flexWrap:"wrap"}}>
          <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#4f46e5,#0d9488)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>📊</div>
          <div>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:800,color:"#f1f5f9",letterSpacing:"-.01em"}}>PROJECT TRACKER</div>
            <div style={{fontSize:10,color:"#334155",letterSpacing:".05em"}}>{TODAY.toLocaleDateString("es-ES",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}).toUpperCase()} · <span style={{color:isAdmin?"#818cf8":"#2dd4bf",fontWeight:700}}>{isAdmin?"🔐 "+userName:"👁️ "+userName}</span></div>
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <button onClick={()=>exportCSV(tasks)} style={{padding:"6px 12px",borderRadius:7,border:"none",background:"linear-gradient(135deg,#15803d,#166534)",color:"white",cursor:"pointer",fontWeight:600,fontSize:10}}>📊 Excel</button>
            <button onClick={()=>exportPDF(tasks)} style={{padding:"6px 12px",borderRadius:7,border:"none",background:"linear-gradient(135deg,#b91c1c,#991b1b)",color:"white",cursor:"pointer",fontWeight:600,fontSize:10}}>📄 PDF Ejecutivo</button>
            {isAdmin&&<button onClick={()=>setPinModal(true)} style={{padding:"6px 12px",borderRadius:7,border:"1px solid rgba(99,102,241,.3)",background:"rgba(99,102,241,.08)",color:"#818cf8",cursor:"pointer",fontWeight:600,fontSize:10}}>🔑 Códigos</button>}
            <button onClick={()=>{setRole(null);setUserName("");}} style={{padding:"6px 12px",borderRadius:7,border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.02)",color:"#475569",cursor:"pointer",fontSize:10}}>↩ Salir</button>
          </div>
        </div>
        <div style={{display:"flex",gap:2}}>{tabs.map(([l,i])=><button key={i} style={S.tabB(tab===i)} onClick={()=>setTab(i)}>{l}</button>)}</div>
      </div>

      <div style={{padding:20}}>

        {tab===0&&<VistaEjecutiva tasks={tasks}/>}

        {tab===1&&<div>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{display:"flex",gap:4}}>
              {[["todos","Todos"],["tarea","📋 Tareas"],["recurrente","🔄 Recurrentes"],["entregable","📊 Entregables"]].map(([v,l])=>(
                <button key={v} onClick={()=>setFilterTipo(v)}
                  style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${filterTipo===v?"rgba(99,102,241,.5)":"rgba(255,255,255,.06)"}`,background:filterTipo===v?"rgba(99,102,241,.15)":"rgba(255,255,255,.02)",color:filterTipo===v?"#a5b4fc":"#475569",cursor:"pointer",fontSize:10,fontWeight:600}}>
                  {l}
                </button>
              ))}
            </div>
            <select value={filterArea} onChange={e=>setFilterArea(e.target.value)}
              style={{padding:"5px 10px",borderRadius:8,border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.02)",color:"#475569",cursor:"pointer",fontSize:10,outline:"none"}}>
              <option value="todas">Todas las áreas</option>
              {areas.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
            <span style={{fontSize:10,color:"#334155",marginLeft:4}}>{filteredTasks.length} actividades</span>
            <button onClick={()=>setModal({...EMPTY_TASK,_new:true,responsable:!isAdmin?userName:"",creadoPor:role})}
              style={{marginLeft:"auto",padding:"7px 14px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#4f46e5,#0d9488)",color:"white",cursor:"pointer",fontWeight:700,fontSize:11}}>＋ Nueva Actividad</button>
          </div>
          <div style={{background:"#0f1923",borderRadius:12,border:"1px solid rgba(255,255,255,.05)",overflow:"hidden"}}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr>
                  {["TIPO","ACTIVIDAD","ÁREA","RESPONSABLE","F. ENTREGA","ESTATUS","PROGRESO","TIEMPO","DÍAS",...(isAdmin?[""]:[])].map((h,i)=><th key={i} style={S.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {filteredTasks.length===0&&<tr><td colSpan={10} style={{textAlign:"center",padding:50,color:"#1e2d3d",fontSize:12}}>Sin actividades</td></tr>}
                  {filteredTasks.map(t=>{
                    const prog=getProgreso(t),tiem=getTiempo(t),dr=diasRestantes(t);
                    const barC=t.estatus==="terminado"?"#22c55e":tiem.pct>=100?"#ef4444":tiem.pct>70?"#eab308":"#4ade80";
                    const drColor=t.estatus==="terminado"?"#22c55e":dr<0?"#ef4444":dr<=3?"#f97316":"#4ade80";
                    return(
                      <tr key={t.id} onMouseEnter={e=>e.currentTarget.style.background="rgba(99,102,241,.03)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"} style={{transition:"background .1s"}}>
                        <td style={S.td}><Pill task={t}/></td>
                        <td style={{...S.td,fontWeight:600,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#f1f5f9"}} title={t.actividad}>{t.actividad}</td>
                        <td style={{...S.td,color:"#64748b"}}>{t.area||"—"}</td>
                        <td style={S.td}><div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:24,height:24,borderRadius:"50%",background:avBg(t.responsable),display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"white",flexShrink:0}}>{getIni(t.responsable)}</div>
                          <span style={{color:"#94a3b8",whiteSpace:"nowrap"}}>{t.responsable||"—"}</span>
                        </div></td>
                        <td style={{...S.td,fontFamily:"monospace",color:"#64748b",whiteSpace:"nowrap"}}>{fmtDate(t.fechaEntrega)}</td>
                        <td style={S.td}><Badge c={ESTAT_P[t.estatus].c} b={ESTAT_P[t.estatus].b} br={ESTAT_P[t.estatus].br}>{t.estatus.toUpperCase()}</Badge></td>
                        <td style={S.td}><Badge c={PROG_P[prog].c} b={PROG_P[prog].b} br={PROG_P[prog].br}>{prog}</Badge></td>
                        <td style={S.td}><div style={{display:"flex",flexDirection:"column",gap:3}}>
                          <div style={{display:"flex",justifyContent:"space-between",gap:6}}>
                            <span style={{color:"#475569",fontFamily:"monospace",fontSize:10}}>{tiem.label}</span>
                            <span style={{color:barC,fontWeight:700,fontSize:10}}>{tiem.pct}%</span>
                          </div>
                          <div style={{width:80,height:4,background:"rgba(255,255,255,.06)",borderRadius:2}}><div style={{width:`${Math.min(100,tiem.pct)}%`,height:"100%",borderRadius:2,background:barC}}/></div>
                        </div></td>
                        <td style={{...S.td,fontFamily:"monospace",fontWeight:700,color:drColor,whiteSpace:"nowrap",fontSize:10}}>
                          {t.estatus==="terminado"?"✓":dr<0?`+${Math.abs(dr)}d`:dr===0?"Hoy":dr===1?"Mañana":`${dr}d`}
                        </td>
                        {isAdmin&&<td style={S.td}><div style={{display:"flex",gap:4}}>
                          <button onClick={()=>setModal({...t})} style={{padding:"4px 8px",borderRadius:5,border:"1px solid rgba(99,102,241,.3)",background:"rgba(99,102,241,.08)",color:"#818cf8",cursor:"pointer",fontSize:10}}>✏️</button>
                          {t.tipo==="recurrente"&&t.estatus!=="terminado"&&
                            <button onClick={()=>markDone(t.id)} title="Marcar terminado y generar siguiente" style={{padding:"4px 8px",borderRadius:5,border:"1px solid rgba(34,197,94,.3)",background:"rgba(34,197,94,.08)",color:"#4ade80",cursor:"pointer",fontSize:10}}>✓🔄</button>}
                          <button onClick={()=>setDelCfm(t.id)} style={{padding:"4px 8px",borderRadius:5,border:"1px solid rgba(239,68,68,.3)",background:"rgba(239,68,68,.08)",color:"#f87171",cursor:"pointer",fontSize:10}}>🗑️</button>
                        </div></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>}

        {tab===2&&<div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <button onClick={()=>navM(-1)} style={{padding:"6px 14px",borderRadius:7,border:"1px solid rgba(99,102,241,.25)",background:"rgba(99,102,241,.07)",color:"#818cf8",cursor:"pointer",fontWeight:600,fontSize:11}}>← Anterior</button>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15,color:"#a5b4fc",minWidth:170,textAlign:"center"}}>{MONTHS[ganttM].toUpperCase()} {ganttY}</div>
            <button onClick={()=>navM(1)} style={{padding:"6px 14px",borderRadius:7,border:"1px solid rgba(99,102,241,.25)",background:"rgba(99,102,241,.07)",color:"#818cf8",cursor:"pointer",fontWeight:600,fontSize:11}}>Siguiente →</button>
          </div>
          <div style={{background:"#0f1923",borderRadius:12,border:"1px solid rgba(255,255,255,.05)",overflow:"hidden"}}>
            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",fontSize:10,minWidth:"max-content"}}>
                <thead><tr>
                  {[["TIPO",60],["ACTIVIDAD",180],["RESPONSABLE",120],["ESTATUS",90],["PROGRESO",100],["F.ENTREGA",85]].map(([h,w])=>(
                    <th key={h} style={{...S.th,minWidth:w,maxWidth:w,borderRight:"1px solid rgba(255,255,255,.03)"}}>{h}</th>
                  ))}
                  {monthDays.map(d=>{const isT=d===TODAY.getDate()&&ganttM===TODAY.getMonth()&&ganttY===TODAY.getFullYear(),wd=new Date(ganttY,ganttM,d).getDay(),wk=wd===0||wd===6;
                    return <th key={d} style={{...S.th,width:24,minWidth:24,textAlign:"center",padding:"10px 1px",color:isT?"#fbbf24":wk?"#1e2d3d":"#2d4060",background:isT?"rgba(251,191,36,.07)":wk?"rgba(0,0,0,.25)":"rgba(255,255,255,.015)",borderRight:"1px solid rgba(255,255,255,.02)"}}>
                      <div style={{fontWeight:isT?900:600}}>{d}</div></th>;})}
                </tr></thead>
                <tbody>
                  {filteredTasks.map(t=>{const prog=getProgreso(t),gc=ganttColor(t),m=TIPO_META[t.tipo]||TIPO_META.tarea;
                    const barColor=t.tipo==="recurrente"?"#8b5cf6":t.tipo==="entregable"?"#f59e0b":gc;
                    return <tr key={t.id} onMouseEnter={e=>e.currentTarget.style.background="rgba(99,102,241,.03)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{...S.td,borderRight:"1px solid rgba(255,255,255,.03)",textAlign:"center"}}><span style={{fontSize:14}}>{m.icon}</span></td>
                      <td style={{...S.td,fontWeight:600,color:"#e2e8f0",borderRight:"1px solid rgba(255,255,255,.03)",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t.actividad}>{t.actividad}</td>
                      <td style={{...S.td,color:"#64748b",borderRight:"1px solid rgba(255,255,255,.03)",whiteSpace:"nowrap"}}><div style={{display:"flex",alignItems:"center",gap:5}}>
                        <div style={{width:18,height:18,borderRadius:"50%",background:avBg(t.responsable),display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:700,color:"white",flexShrink:0}}>{getIni(t.responsable)}</div>
                        {(t.responsable||"—").split(" ")[0]}
                      </div></td>
                      <td style={{...S.td,borderRight:"1px solid rgba(255,255,255,.03)"}}><Badge c={ESTAT_P[t.estatus].c} b={ESTAT_P[t.estatus].b} br={ESTAT_P[t.estatus].br} size={9}>{t.estatus.toUpperCase()}</Badge></td>
                      <td style={{...S.td,borderRight:"1px solid rgba(255,255,255,.03)"}}><Badge c={PROG_P[prog].c} b={PROG_P[prog].b} br={PROG_P[prog].br} size={9}>{prog}</Badge></td>
                      <td style={{...S.td,color:"#475569",fontFamily:"monospace",whiteSpace:"nowrap",borderRight:"1px solid rgba(255,255,255,.03)",fontSize:10}}>{fmtDate(t.fechaEntrega)}</td>
                      {monthDays.map(d=>{const ir=inRange(t,d),wd=new Date(ganttY,ganttM,d).getDay(),wk=wd===0||wd===6,isT=d===TODAY.getDate()&&ganttM===TODAY.getMonth()&&ganttY===TODAY.getFullYear();
                        return <td key={d} style={{padding:"8px 1px",textAlign:"center",borderRight:"1px solid rgba(255,255,255,.02)",background:isT?"rgba(251,191,36,.04)":wk?"rgba(0,0,0,.18)":undefined}}>
                          {ir&&barColor&&<div style={{width:18,height:12,borderRadius:2,margin:"auto",background:barColor,opacity:.85}}/>}
                        </td>;})}
                    </tr>;})}
                  {filteredTasks.length===0&&<tr><td colSpan={6+daysInMonth} style={{textAlign:"center",padding:40,color:"#1e2d3d"}}>Sin actividades</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{padding:"10px 18px",borderTop:"1px solid rgba(255,255,255,.04)",display:"flex",gap:18,flexWrap:"wrap"}}>
              {[["#22c55e","Terminado"],["#eab308","En Proceso"],["#ef4444","Con Retraso"],["#8b5cf6","Recurrente"],["#f59e0b","Entregable"]].map(([c,l])=>(
                <div key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"#475569"}}><div style={{width:12,height:8,borderRadius:2,background:c}}/>{l}</div>
              ))}
            </div>
          </div>
        </div>}

        {tab===3&&isAdmin&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div style={{background:"#0f1923",borderRadius:12,padding:22,border:"1px solid rgba(99,102,241,.15)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <div style={{width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,#4f46e5,#3730a3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>🏢</div>
              <div><h3 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:"#a5b4fc",margin:0}}>ÁREAS</h3><p style={{margin:0,fontSize:10,color:"#334155"}}>{areas.length} registradas</p></div>
            </div>
            <div style={{maxHeight:280,overflowY:"auto",paddingRight:4}}>
              {areas.map((a,i)=><CatalogRow key={`${i}-${a}`} value={a} accent="#6366f1" onSave={v=>updateArea(i,v)} onDelete={()=>deleteArea(i)}/>)}
            </div>
            <AddRow placeholder="Nueva área…" onAdd={addArea} accent="#6366f1"/>
          </div>
          <div style={{background:"#0f1923",borderRadius:12,padding:22,border:"1px solid rgba(20,184,166,.15)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <div style={{width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,#0d9488,#0f766e)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>👥</div>
              <div><h3 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:"#2dd4bf",margin:0}}>RESPONSABLES</h3><p style={{margin:0,fontSize:10,color:"#334155"}}>{resps.length} registradas</p></div>
            </div>
            <div style={{maxHeight:280,overflowY:"auto",paddingRight:4}}>
              {resps.map((r,i)=>(
                <div key={`${i}-${r}`} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,background:"rgba(255,255,255,.02)",border:"1px solid rgba(20,184,166,.1)",marginBottom:6}}>
                  <div style={{width:26,height:26,borderRadius:"50%",background:avBg(r),display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"white",flexShrink:0}}>{getIni(r)}</div>
                  <CatalogRow value={r} accent="#14b8a6" onSave={v=>updateResp(i,v)} onDelete={()=>deleteResp(i)}/>
                </div>
              ))}
            </div>
            <AddRow placeholder="Nuevo responsable…" onAdd={addResp} accent="#14b8a6"/>
          </div>
        </div>}
      </div>

      {modal&&<TaskModal task={modal} isAdmin={isAdmin} areas={areas} resps={resps} userName={userName} onSave={saveTask} onClose={()=>setModal(null)}/>}
      {delCfm!==null&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,backdropFilter:"blur(8px)"}}>
        <div style={{background:"#0f1923",borderRadius:14,padding:28,maxWidth:340,width:"90%",border:"1px solid rgba(239,68,68,.3)",textAlign:"center"}}>
          <div style={{fontSize:32,marginBottom:10}}>⚠️</div>
          <h3 style={{fontFamily:"'Syne',sans-serif",color:"#f87171",fontWeight:800,margin:"0 0 8px"}}>¿Eliminar actividad?</h3>
          <p style={{color:"#475569",fontSize:12,margin:"0 0 20px"}}>Esta acción no se puede deshacer.</p>
          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            <button onClick={()=>setDelCfm(null)} style={{padding:"8px 18px",borderRadius:8,border:"1px solid rgba(255,255,255,.08)",background:"transparent",color:"#475569",cursor:"pointer",fontSize:12}}>Cancelar</button>
            <button onClick={doDelete} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#ef4444,#dc2626)",color:"white",cursor:"pointer",fontWeight:700,fontSize:12}}>Eliminar</button>
          </div>
        </div>
      </div>}
      {pinModal&&<PinModal adminPin={adminPin} visitorPin={visitPin} onSave={savePins} onClose={()=>setPinModal(false)}/>}
    </div>
  );
}
