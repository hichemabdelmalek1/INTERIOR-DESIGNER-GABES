import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, getDocs, orderBy, limit, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const fbApp = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

function toast(msg){
  const t=$("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(()=>t.classList.add("hidden"), 2600);
}

function showRoute(name){
  $$("section[id^='route-']").forEach(s=>s.classList.add("hidden"));
  const el = $("#route-"+name);
  if(el) el.classList.remove("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
}

function parseHash(){
  const h = location.hash.replace("#","").trim();
  if(!h) return {route:"home", params:{}};
  const [path, qs] = h.split("?");
  const params = {};
  if(qs){
    qs.split("&").forEach(p=>{
      const [k,v]=p.split("=");
      params[decodeURIComponent(k)] = decodeURIComponent(v||"");
    });
  }
  return {route: path.replace("/","") || "home", params};
}

const PRICING = {
  plan2d_new:7, plan2d_renov:5,
  int3d_res:20, int3d_com:30,
  ext_res:10, ext_facade_com:100,
  dossier_res:5, dossier_com:10,
  visit_single:100, visit_monthly:400,
  deposit_rate:0.25
};

async function ensureUserDoc(user){
  const uref = doc(db,"users",user.uid);
  const snap = await getDoc(uref);
  if(snap.exists()) return snap.data();
  const data = {
    uid:user.uid,
    email:(user.email||"").toLowerCase(),
    fullName:user.displayName||"",
    role:"",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(uref, data);
  return data;
}

async function getMe(){
  const user = auth.currentUser;
  if(!user) return null;
  const data = await ensureUserDoc(user);
  return {...data, uid:user.uid, email:(user.email||"").toLowerCase()};
}

function setSessionInfo(role, email){
  $("#sessionInfo").textContent = role ? `Rôle: ${role} • ${email||""}` : "Non connecté";
  $("#btnArchitect").classList.toggle("hidden", role!=="ARCHITECT");
  $("#btnClient").classList.toggle("hidden", role!=="CLIENT");
}

function computeLines({projectType, surfaceM2, facadeMl, isNewBuild, wantPlan2D, want3DInt, wantExt, wantDossier, visitsMode, visitsCount}){
  const s = Math.max(0, Number(surfaceM2||0));
  const f = Math.max(0, Number(facadeMl||0));
  const isCommercial = projectType === "COMMERCIAL";
  const lines = [];
  if(wantPlan2D){
    const pu = isNewBuild ? PRICING.plan2d_new : PRICING.plan2d_renov;
    lines.push({code:"PLAN_2D", label:"Plan aménagé 2D", qty:s, unit:"m²", unitPrice:pu, total:s*pu});
  }
  if(want3DInt){
    const pu = isCommercial ? PRICING.int3d_com : PRICING.int3d_res;
    lines.push({code:"3D_INT", label:"3D intérieur", qty:s, unit:"m²", unitPrice:pu, total:s*pu});
  }
  if(wantExt){
    if(isCommercial){
      lines.push({code:"EXT_FACADE", label:"Extérieur (façade)", qty:f, unit:"ml", unitPrice:PRICING.ext_facade_com, total:f*PRICING.ext_facade_com});
    }else{
      lines.push({code:"EXT_COUVERT", label:"Extérieur couvert", qty:s, unit:"m²", unitPrice:PRICING.ext_res, total:s*PRICING.ext_res});
    }
  }
  if(wantDossier){
    const pu = isCommercial ? PRICING.dossier_com : PRICING.dossier_res;
    lines.push({code:"DOSSIER_TECH", label:"Dossier technique (lots spéciaux + métré)", qty:s, unit:"m²", unitPrice:pu, total:s*pu});
  }
  if(visitsMode==="SINGLE"){
    const c = Math.max(1, Number(visitsCount||1));
    lines.push({code:"VISITE", label:"Visite chantier", qty:c, unit:"visite", unitPrice:PRICING.visit_single, total:c*PRICING.visit_single});
  }else if(visitsMode==="MONTHLY"){
    lines.push({code:"FORFAIT_MENSUEL", label:"Forfait mensuel (6 visites)", qty:1, unit:"mois", unitPrice:PRICING.visit_monthly, total:PRICING.visit_monthly});
  }
  const subtotal = lines.reduce((a,l)=>a+l.total,0);
  return {lines, subtotal};
}

async function nextInvoiceNo(){
  const year = new Date().getFullYear();
  const qInv = query(collection(db,"invoices"),
    where("invoiceNo",">=",`INV-${year}-0000`),
    where("invoiceNo","<=",`INV-${year}-9999`)
  );
  const snap = await getDocs(qInv);
  let max = 0;
  snap.forEach(d=>{
    const no = d.data().invoiceNo || "";
    const n = Number(no.split("-").pop()||0);
    if(n>max) max=n;
  });
  const next = String(max+1).padStart(4,"0");
  return `INV-${year}-${next}`;
}

function publicInvoiceUrl(invoiceId, token){
  const base = location.origin + location.pathname;
  return `${base}#/invoice?id=${encodeURIComponent(invoiceId)}&t=${encodeURIComponent(token)}`;
}

async function createPdf({invoice, lines, architectEmail, client, project}){
  const { jsPDF } = window.jspdf;
  const docp = new jsPDF();
  docp.setFontSize(18); docp.text("FACTURE", 14, 18);
  docp.setFontSize(11);
  docp.text(`Numéro: ${invoice.invoiceNo}`, 14, 28);
  docp.text(`Date: ${new Date(invoice.createdAtMs).toLocaleDateString("fr-FR")}`, 14, 35);
  docp.text(`Architecte d'intérieur: ${architectEmail||"—"}`, 14, 45);
  docp.text(`Client: ${client.name||"—"}`, 120, 45);
  if(client.email) docp.text(`Email: ${client.email}`, 120, 52);
  docp.text(`Projet: ${project.title||"—"}`, 14, 66);
  docp.text(`Type: ${project.projectType||"—"}`, 14, 73);

  docp.autoTable({
    startY: 82,
    head: [["Désignation","Qté","Unité","PU (DT)","Total (DT)"]],
    body: lines.map(l=>[l.label, String(l.qty), l.unit, Number(l.unitPrice).toFixed(2), Number(l.total).toFixed(2)]),
  });

  const y = docp.lastAutoTable.finalY + 10;
  docp.text(`Sous-total: ${Number(invoice.subtotal).toFixed(2)} DT`, 120, y);
  docp.text(`TVA (${Math.round(Number(invoice.tvaRate)*100)}%): ${Number(invoice.tax).toFixed(2)} DT`, 120, y+7);
  docp.setFontSize(13); docp.text(`TOTAL: ${Number(invoice.total).toFixed(2)} DT`, 120, y+16);
  docp.setFontSize(11); docp.text(`Acompte (25%): ${Number(invoice.deposit).toFixed(2)} DT`, 120, y+23);

  const url = publicInvoiceUrl(invoice.id, invoice.publicToken);
  const qrDataUrl = await window.QRCode.toDataURL(url);
  docp.addImage(qrDataUrl, "PNG", 14, y, 30, 30);
  docp.text("QR: lien facture", 14, y+40);
  return docp;
}

async function refreshClientProjectLists(me){
  const csnap = await getDocs(query(collection(db,"clients"), where("architectUid","==",me.uid), orderBy("createdAtMs","desc")));
  const clients=[]; csnap.forEach(d=>clients.push({id:d.id, ...d.data()}));
  $("#clientsCount").textContent = `${clients.length} clients`;
  $("#projectClient").innerHTML = `<option value="">—</option>` + clients.map(c=>`<option value="${c.id}">${c.name}</option>`).join("");

  const psnap = await getDocs(query(collection(db,"projects"), where("architectUid","==",me.uid), orderBy("createdAtMs","desc")));
  const projects=[]; psnap.forEach(d=>projects.push({id:d.id, ...d.data()}));
  $("#projectsCount").textContent = `${projects.length} projets`;
  $("#invoiceProject").innerHTML = `<option value="">—</option>` + projects.map(p=>`<option value="${p.id}">${p.title} (${p.projectType})</option>`).join("");
}

async function refreshInvoices(me){
  const snap = await getDocs(query(collection(db,"invoices"), where("architectUid","==",me.uid), orderBy("createdAtMs","desc"), limit(50)));
  const tbody=$("#invoiceList"); tbody.innerHTML="";
  snap.forEach(d=>{
    const inv={id:d.id, ...d.data()};
    const url=publicInvoiceUrl(inv.id, inv.publicToken);
    const tr=document.createElement("tr");
    tr.innerHTML = `<td>${inv.invoiceNo}</td><td>${new Date(inv.createdAtMs).toLocaleDateString("fr-FR")}</td><td>${Number(inv.total).toFixed(2)} DT</td><td><a class="btn" href="${url}" target="_blank">Lien</a></td><td><button class="btn" data-pdf="${inv.id}">PDF</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("[data-pdf]").forEach(b=>{
    b.onclick = async ()=> downloadInvoicePdf(me, b.dataset.pdf);
  });
}

async function downloadInvoicePdf(me, invId){
  const invSnap = await getDoc(doc(db,"invoices",invId));
  if(!invSnap.exists()) return toast("Invoice introuvable");
  const invoice = {id:invId, ...invSnap.data()};
  const clientSnap = await getDoc(doc(db,"clients", invoice.clientId));
  const client = clientSnap.exists()? clientSnap.data() : {name:"—"};
  const projSnap = await getDoc(doc(db,"projects", invoice.projectId));
  const project = projSnap.exists()? projSnap.data() : {title:"—", projectType:"—"};
  const linesSnap = await getDocs(query(collection(db,"invoiceLines"), where("invoiceId","==",invId)));
  const lines=[]; linesSnap.forEach(d=>lines.push(d.data()));
  const pdf = await createPdf({invoice, lines, architectEmail: me.email, client, project});
  pdf.save(`${invoice.invoiceNo}.pdf`);
}

async function renderArchitect(){
  const me = await getMe();
  if(!me) return toast("Connectez-vous.");
  if(me.role!=="ARCHITECT"){ toast("اختار دور Architecte أولاً."); location.hash="#/chooseRole"; return; }
  await refreshClientProjectLists(me);

  $("#formClientCreate").onsubmit = async (e)=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    await addDoc(collection(db,"clients"),{
      architectUid: me.uid,
      name: fd.get("name"),
      email: (fd.get("email")||"").toString().toLowerCase(),
      phone: fd.get("phone")||"",
      createdAtMs: Date.now()
    });
    e.target.reset(); toast("Client ajouté ✅");
    await refreshClientProjectLists(me);
  };

  $("#formProjectCreate").onsubmit = async (e)=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    await addDoc(collection(db,"projects"),{
      architectUid: me.uid,
      clientId: fd.get("clientId"),
      title: fd.get("title"),
      projectType: fd.get("projectType"),
      location: fd.get("location")||"",
      surfaceM2: Number(fd.get("surfaceM2")||0),
      facadeMl: Number(fd.get("facadeMl")||0),
      createdAtMs: Date.now()
    });
    e.target.reset(); toast("Projet ajouté ✅");
    await refreshClientProjectLists(me);
  };

  $("#formInvoiceCreate").onsubmit = async (e)=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const projectId = String(fd.get("projectId"));
    const psnap = await getDoc(doc(db,"projects",projectId));
    if(!psnap.exists()) return toast("Projet introuvable");
    const project = psnap.data();

    const { lines, subtotal } = computeLines({
      projectType: project.projectType,
      surfaceM2: project.surfaceM2,
      facadeMl: project.facadeMl,
      isNewBuild: String(fd.get("isNewBuild"))==="1",
      wantPlan2D: fd.get("plan2d")!==null,
      want3DInt: fd.get("int3d")!==null,
      wantExt: fd.get("ext")!==null,
      wantDossier: fd.get("dossier")!==null,
      visitsMode: String(fd.get("visitsMode")),
      visitsCount: Number(fd.get("visitsCount")||1)
    });

    const tvaRate = Number(fd.get("tvaRate"));
    const tax = subtotal * tvaRate;
    const total = subtotal + tax;
    const deposit = total * Number(PRICING.deposit_rate||0.25);

    const invoiceNo = await nextInvoiceNo();
    const publicToken = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);

    const invRef = await addDoc(collection(db,"invoices"),{
      invoiceNo,
      architectUid: me.uid,
      clientId: project.clientId,
      projectId,
      projectType: project.projectType,
      tvaRate,
      subtotal, tax, total, deposit,
      publicToken,
      createdAtMs: Date.now()
    });

    const batch = writeBatch(db);
    lines.forEach(l=>{
      const lref = doc(collection(db,"invoiceLines"));
      batch.set(lref, { invoiceId: invRef.id, architectUid: me.uid, ...l, createdAtMs: Date.now() });
    });
    await batch.commit();

    toast("Facture créée ✅");
    await refreshInvoices(me);
  };

  await refreshInvoices(me);
}

async function renderClient(){
  const me = await getMe();
  if(!me) return toast("Connectez-vous.");
  if(me.role!=="CLIENT"){ toast("اختار دور Client أولاً."); location.hash="#/chooseRole"; return; }

  const email = (me.email||"").toLowerCase();
  const cSnap = await getDocs(query(collection(db,"clients"), where("email","==",email)));
  const clientIds=[]; cSnap.forEach(d=>clientIds.push(d.id));

  const tbody=$("#clientInvoiceList"); tbody.innerHTML="";
  if(!clientIds.length){
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Aucune facture liée à votre email.</td></tr>`;
    return;
  }

  const invSnap = await getDocs(query(collection(db,"invoices"), where("clientId","in", clientIds.slice(0,10)), orderBy("createdAtMs","desc")));
  invSnap.forEach(d=>{
    const inv={id:d.id, ...d.data()};
    const url=publicInvoiceUrl(inv.id, inv.publicToken);
    const tr=document.createElement("tr");
    tr.innerHTML = `<td>${inv.invoiceNo}</td><td>${new Date(inv.createdAtMs).toLocaleDateString("fr-FR")}</td><td>${Number(inv.total).toFixed(2)} DT</td><td><a class="btn" href="${url}" target="_blank">Voir</a></td>`;
    tbody.appendChild(tr);
  });
}

async function renderPublicInvoice(id, token){
  const invSnap = await getDoc(doc(db,"invoices",id));
  if(!invSnap.exists()) return toast("Facture introuvable");
  const invoice={id, ...invSnap.data()};
  if(token && token !== invoice.publicToken) return toast("Lien invalide");

  $("#invTitle").textContent = `Facture ${invoice.invoiceNo}`;
  $("#invMeta").textContent = `Date: ${new Date(invoice.createdAtMs).toLocaleString("fr-FR")} • Type: ${invoice.projectType}`;

  const linesSnap = await getDocs(query(collection(db,"invoiceLines"), where("invoiceId","==",id)));
  const lines=[]; linesSnap.forEach(d=>lines.push(d.data()));

  const tbody=$("#invLines"); tbody.innerHTML="";
  lines.forEach(l=>{
    const tr=document.createElement("tr");
    tr.innerHTML = `<td>${l.label}</td><td>${l.qty}</td><td>${l.unit}</td><td>${Number(l.unitPrice).toFixed(2)}</td><td>${Number(l.total).toFixed(2)}</td>`;
    tbody.appendChild(tr);
  });

  $("#invTotals").textContent = `TOTAL: ${Number(invoice.total).toFixed(2)} DT`;
  $("#invDeposit").textContent = `Acompte (25%): ${Number(invoice.deposit).toFixed(2)} DT`;

  $("#btnPdfPublic").onclick = async ()=>{
    const me = await getMe();
    const architectEmail = me?.email || "—";
    const clientSnap = await getDoc(doc(db,"clients", invoice.clientId));
    const client = clientSnap.exists()? clientSnap.data() : {name:"—"};
    const projSnap = await getDoc(doc(db,"projects", invoice.projectId));
    const project = projSnap.exists()? projSnap.data() : {title:"—", projectType:"—"};
    const pdf = await createPdf({invoice, lines, architectEmail, client, project});
    pdf.save(`${invoice.invoiceNo}.pdf`);
  };
}

/* Events */
$$("[data-route]").forEach(b=> b.addEventListener("click", ()=> location.hash = `#/${b.dataset.route}`));

$("#btnLogout").addEventListener("click", async ()=>{
  await signOut(auth);
  toast("Déconnecté");
  location.hash="#/home";
});

$("#btnGoogle").addEventListener("click", async ()=>{
  try{ await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch(e){ toast(e.message); }
});

$("#formEmailAuth").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const fd=new FormData(e.target);
  const email=String(fd.get("email")).toLowerCase();
  const pwd=String(fd.get("password"));
  const action=String(fd.get("action"));
  try{
    if(action==="signup") await createUserWithEmailAndPassword(auth, email, pwd);
    else await signInWithEmailAndPassword(auth, email, pwd);
  }catch(err){ toast(err.message); }
});

$("#setArchitect").addEventListener("click", async ()=>{
  const me = await getMe();
  if(!me) return toast("Connectez-vous.");
  await updateDoc(doc(db,"users",me.uid),{role:"ARCHITECT", updatedAt: serverTimestamp()});
  toast("Rôle: ARCHITECT ✅");
  location.hash="#/architect";
});

$("#setClient").addEventListener("click", async ()=>{
  const me = await getMe();
  if(!me) return toast("Connectez-vous.");
  await updateDoc(doc(db,"users",me.uid),{role:"CLIENT", updatedAt: serverTimestamp()});
  toast("Rôle: CLIENT ✅");
  location.hash="#/client";
});

/* Router */
async function handleRoute(){
  const {route, params} = parseHash();
  if(route==="invoice"){ showRoute("publicInvoice"); await renderPublicInvoice(params.id, params.t); return; }
  showRoute(route);
  if(route==="architect") await renderArchitect();
  if(route==="client") await renderClient();
}

window.addEventListener("hashchange", handleRoute);

onAuthStateChanged(auth, async (user)=>{
  if(!user){
    setSessionInfo("", "");
    return;
  }
  const u = await ensureUserDoc(user);
  setSessionInfo(u.role||"", (user.email||"").toLowerCase());
  await handleRoute();
  if(!u.role) location.hash="#/chooseRole";
});

(async ()=>{
  if(!location.hash) location.hash="#/home";
  await handleRoute();
})();