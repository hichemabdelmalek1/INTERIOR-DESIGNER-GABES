(()=>{
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));

const STEPS=[
  {id:"s1", label:"Architecte"},
  {id:"s2", label:"Client"},
  {id:"s3", label:"Projet"},
  {id:"s4", label:"Facture"},
  {id:"s5", label:"Final"},
];

const PRICING={
  plan2d_new:7,
  plan2d_renov:5,
  int3d_res:20,
  int3d_com:30,
  ext_res:10,
  ext_facade_com:100,
  dossier_res:5,
  dossier_com:10,
  visit_single:100,
  visit_monthly:400,
  deposit_rate:0.25
};

const LS_KEY="pf_wizard_state_v1";
const LAST_INV_KEY="pf_last_inv_no_year";

function toast(msg){
  const t=$("#toast"); t.textContent=msg;
  t.classList.remove("hidden");
  setTimeout(()=>t.classList.add("hidden"), 2600);
}
const safeNum=v=>{const n=Number(v); return Number.isFinite(n)?n:0;};
const money=n=>(Math.round(n*100)/100).toFixed(2);

function randToken(len=12){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s=""; for(let i=0;i<len;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}

function encodeData(obj){
  const json=JSON.stringify(obj);
  const b64=btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return b64;
}
function decodeData(b64url){
  const b64=b64url.replace(/-/g,'+').replace(/_/g,'/');
  const pad=b64.length%4? '='.repeat(4-(b64.length%4)) : '';
  const json=decodeURIComponent(escape(atob(b64+pad)));
  return JSON.parse(json);
}

function defaultState(){
  const year=new Date().getFullYear();
  return {
    version:1,
    invoiceNo:`INV-${year}-0000`,
    createdAtMs: Date.now(),
    token: randToken(10),
    architect:{name:"",phone:"",email:"",address:"",social:"",note:"",logoDataUrl:""},
    client:{name:"",phone:"",email:"",address:"",note:""},
    project:{title:"",location:"",type:"RESIDENTIEL",isNewBuild:true,m2:0,facadeMl:0},
    invoice:{tvaRate:0.19, modules:{plan2d:true,int3d:true,ext:true,dossier:true}, visitsMode:"NONE", visitsCount:1},
    computed:{lines:[],subtotal:0,tax:0,total:0,deposit:0}
  };
}

let state = loadState() || defaultState();

function saveState(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function loadState(){ try{ const raw=localStorage.getItem(LS_KEY); return raw?JSON.parse(raw):null; }catch{return null;} }

function buildSteps(activeIdx){
  const wrap=$("#steps"); wrap.innerHTML="";
  STEPS.forEach((s,i)=>{
    const el=document.createElement("div");
    el.className="step"+(i===activeIdx?" active":"");
    el.innerHTML=`<div class="dot">${i+1}</div><div style="font-weight:800">${s.label}</div>`;
    wrap.appendChild(el);
  });
}
function showStep(n){
  STEPS.forEach((s,i)=>$("#"+s.id).classList.toggle("hidden", i!==n-1));
  $("#publicView").classList.add("hidden");
  buildSteps(n-1);
  window.scrollTo({top:0,behavior:"smooth"});
}

function compute(){
  const p=state.project;
  const i=state.invoice;
  const m=i.modules;
  const isCom=(p.type==="COMMERCIAL");
  const s=Math.max(0, safeNum(p.m2));
  const f=Math.max(0, safeNum(p.facadeMl));
  const lines=[];

  if(m.plan2d){
    const pu=p.isNewBuild?PRICING.plan2d_new:PRICING.plan2d_renov;
    lines.push({code:"PLAN_2D", label:"Plan aménagé 2D", qty:s, unit:"m²", pu, total:s*pu});
  }
  if(m.int3d){
    const pu=isCom?PRICING.int3d_com:PRICING.int3d_res;
    lines.push({code:"3D_INT", label:"3D intérieur", qty:s, unit:"m²", pu, total:s*pu});
  }
  if(m.ext){
    if(isCom){
      const pu=PRICING.ext_facade_com;
      lines.push({code:"EXT_FACADE", label:"Extérieur (façade)", qty:f, unit:"ml", pu, total:f*pu});
    }else{
      const pu=PRICING.ext_res;
      lines.push({code:"EXT_COUVERT", label:"Extérieur couvert", qty:s, unit:"m²", pu, total:s*pu});
    }
  }
  if(m.dossier){
    const pu=isCom?PRICING.dossier_com:PRICING.dossier_res;
    lines.push({code:"DOSSIER_TECH", label:"Dossier technique (lots spéciaux + métré)", qty:s, unit:"m²", pu, total:s*pu});
  }
  if(i.visitsMode==="SINGLE"){
    const c=Math.max(1, safeNum(i.visitsCount||1));
    const pu=PRICING.visit_single;
    lines.push({code:"VISITE", label:"Visite chantier", qty:c, unit:"visite", pu, total:c*pu});
  }else if(i.visitsMode==="MONTHLY"){
    const pu=PRICING.visit_monthly;
    lines.push({code:"FORFAIT_MENSUEL", label:"Forfait mensuel (6 visites)", qty:1, unit:"mois", pu, total:pu});
  }

  const subtotal=lines.reduce((a,l)=>a+l.total,0);
  const tax=subtotal*safeNum(i.tvaRate);
  const total=subtotal+tax;
  const deposit=total*PRICING.deposit_rate;
  state.computed={lines, subtotal, tax, total, deposit};
}

function renderLines(){
  compute();
  const tbody=$("#lines"); tbody.innerHTML="";
  state.computed.lines.forEach(l=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${l.label}</td><td>${money(l.qty)}</td><td>${l.unit}</td><td>${money(l.pu)} DT</td><td>${money(l.total)} DT</td>`;
    tbody.appendChild(tr);
  });
  $("#k_sub").textContent=`${money(state.computed.subtotal)} DT`;
  $("#k_tax").textContent=`${money(state.computed.tax)} DT`;
  $("#k_total").textContent=`${money(state.computed.total)} DT`;
  $("#k_dep").textContent=`${money(state.computed.deposit)} DT`;
}

function updatePreviews(){
  const a=state.architect, c=state.client, p=state.project;
  const typeLabel=$("#p_type").selectedOptions?.[0]?.textContent || p.type;

  $("#preview_arch").innerHTML=`
    <div style="display:flex;gap:12px;align-items:center">
      <div style="width:64px;height:64px;border-radius:18px;border:1px solid var(--line);background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden">
        ${a.logoDataUrl?`<img src="${a.logoDataUrl}" style="width:100%;height:100%;object-fit:cover"/>`:`<span class="muted">Logo</span>`}
      </div>
      <div>
        <div style="font-weight:900;font-size:18px">${a.name||"—"}</div>
        <div class="muted">${a.email||"—"} • ${a.phone||"—"}</div>
        <div class="muted">${a.address||""}</div>
      </div>
    </div>
    ${a.social?`<div class="hr"></div><div class="muted">Réseaux: ${a.social}</div>`:""}
  `;

  $("#preview_client").innerHTML=`
    <div style="font-weight:900;font-size:18px">${c.name||"—"}</div>
    <div class="muted">${c.email||"—"} • ${c.phone||"—"}</div>
    <div class="muted">${c.address||""}</div>
    ${c.note?`<div class="hr"></div><div class="muted">${c.note}</div>`:""}
  `;

  $("#preview_project").innerHTML=`
    <div style="font-weight:900;font-size:18px">${p.title||"—"}</div>
    <div class="muted">${typeLabel}</div>
    <div class="muted">Lieu: ${p.location||"—"}</div>
    <div class="hr"></div>
    <div class="muted">Surface: ${money(p.m2)} m²</div>
    <div class="muted">Façade (Commercial): ${money(p.facadeMl)} ml</div>
  `;
}

function fillUI(){
  const a=state.architect, c=state.client, p=state.project, i=state.invoice;

  $("#a_name").value=a.name||""; $("#a_phone").value=a.phone||""; $("#a_email").value=a.email||""; $("#a_address").value=a.address||"";
  $("#a_social").value=a.social||""; $("#a_note").value=a.note||"";
  $("#c_name").value=c.name||""; $("#c_phone").value=c.phone||""; $("#c_email").value=c.email||""; $("#c_address").value=c.address||"";
  $("#c_note").value=c.note||"";
  $("#p_title").value=p.title||""; $("#p_location").value=p.location||""; $("#p_type").value=p.type||"RESIDENTIEL";
  $("#p_isNew").value=p.isNewBuild?"1":"0"; $("#p_m2").value=p.m2??0; $("#p_facade").value=p.facadeMl??0;

  $("#i_tva").value=String(i.tvaRate??0.19);
  $("#m_plan2d").checked=!!i.modules.plan2d; $("#m_3dint").checked=!!i.modules.int3d;
  $("#m_ext").checked=!!i.modules.ext; $("#m_dossier").checked=!!i.modules.dossier;
  $("#i_visitsMode").value=i.visitsMode||"NONE"; $("#i_visitsCount").value=i.visitsCount??1;

  updatePreviews();
  renderLines();
}

function hookInputs(){
  const bind=(id, cb)=>$(id).addEventListener("input", cb);
  const bindC=(id, cb)=>$(id).addEventListener("change", cb);

  bind("#a_name", e=>{state.architect.name=e.target.value; saveState(); updatePreviews();});
  bind("#a_phone", e=>{state.architect.phone=e.target.value; saveState(); updatePreviews();});
  bind("#a_email", e=>{state.architect.email=e.target.value; saveState(); updatePreviews();});
  bind("#a_address", e=>{state.architect.address=e.target.value; saveState(); updatePreviews();});
  bind("#a_social", e=>{state.architect.social=e.target.value; saveState(); updatePreviews();});
  bind("#a_note", e=>{state.architect.note=e.target.value; saveState();});

  $("#a_logo").addEventListener("change", (e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{ state.architect.logoDataUrl=reader.result; saveState(); updatePreviews(); };
    reader.readAsDataURL(file);
  });

  bind("#c_name", e=>{state.client.name=e.target.value; saveState(); updatePreviews();});
  bind("#c_phone", e=>{state.client.phone=e.target.value; saveState(); updatePreviews();});
  bind("#c_email", e=>{state.client.email=e.target.value; saveState(); updatePreviews();});
  bind("#c_address", e=>{state.client.address=e.target.value; saveState(); updatePreviews();});
  bind("#c_note", e=>{state.client.note=e.target.value; saveState(); updatePreviews();});

  bind("#p_title", e=>{state.project.title=e.target.value; saveState(); updatePreviews(); renderLines();});
  bind("#p_location", e=>{state.project.location=e.target.value; saveState(); updatePreviews();});
  bindC("#p_type", e=>{state.project.type=e.target.value; saveState(); updatePreviews(); renderLines();});
  bindC("#p_isNew", e=>{state.project.isNewBuild=e.target.value==="1"; saveState(); renderLines();});
  bind("#p_m2", e=>{state.project.m2=safeNum(e.target.value); saveState(); updatePreviews(); renderLines();});
  bind("#p_facade", e=>{state.project.facadeMl=safeNum(e.target.value); saveState(); updatePreviews(); renderLines();});

  bindC("#i_tva", e=>{state.invoice.tvaRate=safeNum(e.target.value); saveState(); renderLines();});
  bindC("#m_plan2d", e=>{state.invoice.modules.plan2d=e.target.checked; saveState(); renderLines();});
  bindC("#m_3dint", e=>{state.invoice.modules.int3d=e.target.checked; saveState(); renderLines();});
  bindC("#m_ext", e=>{state.invoice.modules.ext=e.target.checked; saveState(); renderLines();});
  bindC("#m_dossier", e=>{state.invoice.modules.dossier=e.target.checked; saveState(); renderLines();});
  bindC("#i_visitsMode", e=>{state.invoice.visitsMode=e.target.value; saveState(); renderLines();});
  bind("#i_visitsCount", e=>{state.invoice.visitsCount=safeNum(e.target.value); saveState(); renderLines();});
}

function validateStep(n){
  if(n===1 && !state.architect.name.trim()) return "Nom / Société obligatoire";
  if(n===2 && !state.client.name.trim()) return "Nom client obligatoire";
  if(n===3){
    if(!state.project.title.trim()) return "Titre projet obligatoire";
    if(safeNum(state.project.m2)<=0) return "Surface (m²) يجب تكون > 0";
  }
  return "";
}

function nextTo(target){
  const current=target-1;
  const err=validateStep(current);
  if(err){ toast(err); showStep(current); return; }
  showStep(target);
}
function prevTo(target){ showStep(target); }

function ensureInvoiceNo(){
  const year=new Date().getFullYear();
  let seq=0;
  const raw=localStorage.getItem(LAST_INV_KEY);
  if(raw){
    try{ const o=JSON.parse(raw); if(o.year===year) seq=o.seq||0; }catch{}
  }
  seq+=1;
  localStorage.setItem(LAST_INV_KEY, JSON.stringify({year, seq}));
  state.invoiceNo=`INV-${year}-${String(seq).padStart(4,"0")}`;
}

function publicLinkFor(d){
  return `${location.origin}${location.pathname}#/invoice?d=${encodeURIComponent(d)}`;
}

async function createPdf(data, link){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const a=data.architect, c=data.client, p=data.project, comp=data.computed;

  doc.setFontSize(18); doc.text("FACTURE", 14, 18);
  doc.setFontSize(11);
  doc.text(`Numéro: ${data.invoiceNo}`, 14, 28);
  doc.text(`Date: ${new Date(data.createdAtMs).toLocaleDateString("fr-FR")}`, 14, 35);

  doc.text(`Architecte d'intérieur: ${a.name||"—"}`, 14, 45);
  doc.text(`Email: ${a.email||"—"}  •  Tél: ${a.phone||"—"}`, 14, 52);
  doc.text(`Adresse: ${a.address||"—"}`, 14, 59);

  doc.text(`Client: ${c.name||"—"}`, 120, 45);
  doc.text(`Email: ${c.email||"—"}  •  Tél: ${c.phone||"—"}`, 120, 52);
  doc.text(`Adresse: ${c.address||"—"}`, 120, 59);

  doc.text(`Projet: ${p.title||"—"}`, 14, 72);
  doc.text(`Type: ${p.type}`, 14, 79);
  doc.text(`Surface: ${money(p.m2)} m²`, 120, 79);

  doc.autoTable({
    startY: 88,
    head: [["Désignation","Qté","Unité","PU (DT)","Total (DT)"]],
    body: comp.lines.map(l=>[l.label, money(l.qty), l.unit, money(l.pu), money(l.total)]),
  });

  const y = doc.lastAutoTable.finalY + 10;
  doc.text(`Sous-total: ${money(comp.subtotal)} DT`, 120, y);
  doc.text(`TVA (${Math.round(data.invoice.tvaRate*100)}%): ${money(comp.tax)} DT`, 120, y+7);
  doc.setFontSize(13); doc.text(`TOTAL: ${money(comp.total)} DT`, 120, y+16);
  doc.setFontSize(11); doc.text(`Acompte (25%): ${money(comp.deposit)} DT`, 120, y+23);

  const qrDataUrl = await window.QRCode.toDataURL(link);
  doc.addImage(qrDataUrl, "PNG", 14, y, 30, 30);
  doc.text("QR: lien facture", 14, y+40);

  return doc;
}

function invoiceHtml(data, link){
  const a=data.architect, c=data.client, p=data.project, comp=data.computed;
  return `
  <div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap">
    <div style="min-width:260px">
      <div style="font-weight:900;font-size:18px">${a.name||"—"}</div>
      <div class="muted">${a.email||"—"} • ${a.phone||"—"}</div>
      <div class="muted">${a.address||"—"}</div>
      ${a.social?`<div class="muted">Réseaux: ${a.social}</div>`:""}
    </div>
    <div style="text-align:right;min-width:260px">
      <div style="font-weight:900;font-size:20px">${data.invoiceNo}</div>
      <div class="muted">${new Date(data.createdAtMs).toLocaleString("fr-FR")}</div>
      <div class="muted">TVA: ${Math.round(data.invoice.tvaRate*100)}%</div>
    </div>
  </div>

  <div class="hr"></div>

  <div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap">
    <div style="min-width:260px">
      <div class="muted" style="font-weight:800">CLIENT</div>
      <div style="font-weight:900">${c.name||"—"}</div>
      <div class="muted">${c.email||"—"} • ${c.phone||"—"}</div>
      <div class="muted">${c.address||"—"}</div>
    </div>
    <div style="min-width:260px">
      <div class="muted" style="font-weight:800">PROJET</div>
      <div style="font-weight:900">${p.title||"—"}</div>
      <div class="muted">${p.type} • ${p.location||"—"}</div>
      <div class="muted">Surface: ${money(p.m2)} m² ${p.type==="COMMERCIAL"?`• Façade: ${money(p.facadeMl)} ml`:""}</div>
    </div>
  </div>

  <div class="hr"></div>

  <table>
    <thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th><th>PU</th><th>Total</th></tr></thead>
    <tbody>
      ${comp.lines.map(l=>`<tr><td>${l.label}</td><td>${money(l.qty)}</td><td>${l.unit}</td><td>${money(l.pu)} DT</td><td>${money(l.total)} DT</td></tr>`).join("")}
    </tbody>
  </table>

  <div class="hr"></div>

  <div class="kpi">
    <div class="box"><div class="muted">Sous-total</div><div class="val">${money(comp.subtotal)} DT</div></div>
    <div class="box"><div class="muted">TVA</div><div class="val">${money(comp.tax)} DT</div></div>
    <div class="box"><div class="muted">TOTAL</div><div class="val">${money(comp.total)} DT</div></div>
    <div class="box"><div class="muted">Acompte (25%)</div><div class="val">${money(comp.deposit)} DT</div></div>
  </div>

  <div class="hr"></div>

  <div class="muted"><b>Modalités de paiement</b>: Acompte 25% • Paiement en 4 versements ou en totalité • Banque ou espèce.</div>
  ${a.note?`<div class="muted" style="margin-top:8px">${a.note}</div>`:""}
  <div class="muted" style="margin-top:8px">Lien: ${link}</div>
  `;
}

async function finish(){
  const e3=validateStep(3);
  if(e3){ toast(e3); showStep(3); return; }
  compute();
  ensureInvoiceNo();
  state.createdAtMs=Date.now();
  state.token=randToken(10);
  saveState();

  const payload={
    invoiceNo: state.invoiceNo,
    createdAtMs: state.createdAtMs,
    token: state.token,
    architect: state.architect,
    client: state.client,
    project: state.project,
    invoice: state.invoice,
    computed: state.computed
  };

  const d=encodeData(payload);
  const link=publicLinkFor(d);

  $("#publicLink").value=link;
  $("#final_meta").textContent=`Prête • ${payload.invoiceNo} • ${new Date(payload.createdAtMs).toLocaleString("fr-FR")}`;
  $("#final_preview").innerHTML=invoiceHtml(payload, link);

  await window.QRCode.toCanvas($("#qrCanvas"), link, {width:260, margin:1});

  $("#btnPrint").onclick=()=>window.print();
  $("#btnCopy").onclick=async ()=>{
    try{ await navigator.clipboard.writeText(link); toast("Lien copié ✅"); }
    catch{ toast("Copie impossible."); }
  };
  $("#btnPdf").onclick=async ()=>{
    const pdf=await createPdf(payload, link);
    pdf.save(`${payload.invoiceNo}.pdf`);
  };
  $("#btnNew2").onclick=()=>{
    const keepA=state.architect;
    state=defaultState();
    state.architect=keepA;
    saveState();
    fillUI();
    showStep(2);
  };

  showStep(5);
}

function showPublicFromUrl(){
  const hash=location.hash||"";
  if(!hash.startsWith("#/invoice")) return false;
  const q=hash.split("?")[1]||"";
  const params=new URLSearchParams(q);
  const d=params.get("d");
  if(!d) return false;

  let data;
  try{ data=decodeData(d); }
  catch{ toast("Lien invalide"); return true; }

  STEPS.forEach(s=>$("#"+s.id).classList.add("hidden"));
  $("#publicView").classList.remove("hidden");
  buildSteps(4);

  const link=publicLinkFor(d);
  $("#pubTitle").textContent=`Facture ${data.invoiceNo}`;
  $("#pubMeta").textContent=`Date: ${new Date(data.createdAtMs).toLocaleString("fr-FR")} • TVA: ${Math.round(data.invoice.tvaRate*100)}%`;
  $("#pubBody").innerHTML=invoiceHtml(data, link);

  $("#btnPubPrint").onclick=()=>window.print();
  $("#btnPubPdf").onclick=async ()=>{
    const pdf=await createPdf(data, link);
    pdf.save(`${data.invoiceNo}.pdf`);
  };

  return true;
}

function initNav(){
  $$("[data-next]").forEach(b=>b.onclick=()=>nextTo(Number(b.dataset.next)));
  $$("[data-prev]").forEach(b=>b.onclick=()=>prevTo(Number(b.dataset.prev)));

  $("#btnFinish").onclick=finish;

  $("#btnReset").onclick=()=>{ if(confirm("Réinitialiser جميع البيانات؟")) { state=defaultState(); saveState(); fillUI(); showStep(1); } };
  $("#btnNew").onclick=()=>{ const keepA=state.architect; state=defaultState(); state.architect=keepA; saveState(); fillUI(); showStep(2); };
  $("#btnLoad").onclick=()=>{ state=loadState()||defaultState(); fillUI(); showStep(1); toast("Données chargées ✅"); };
}

function start(){
  if(showPublicFromUrl()) return;
  fillUI();
  hookInputs();
  initNav();
  showStep(1);
}
window.addEventListener("hashchange", ()=>{ if(showPublicFromUrl()) return; });
start();
})();