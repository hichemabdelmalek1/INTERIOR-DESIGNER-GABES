import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where,
  getDocs, orderBy, limit, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const app = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

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

async function ensureUserDoc(user){
  const uref = doc(db,"users",user.uid);
  const snap = await getDoc(uref);
  if(snap.exists()) return snap.data();

  const isAdmin = (user.email||"").toLowerCase() === (window.ADMIN_EMAIL||"").toLowerCase();
  const role = isAdmin ? "ADMIN" : "CLIENT";
  const data = {
    uid:user.uid,
    email:user.email||"",
    fullName:user.displayName||"",
    company:"",
    phone:"",
    city:"",
    officeAddress:"",
    instagram:"",
    facebook:"",
    linkedin:"",
    website:"",
    logoUrl:"",
    role,
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
  return {...data, uid:user.uid};
}

function setSessionInfo(role, email){
  $("#sessionInfo").textContent = role ? `Rôle: ${role} • ${email||""}` : "Non connecté";
  $("#btnAdmin").classList.toggle("hidden", role!=="ADMIN");
  $("#btnArchitect").classList.toggle("hidden", role!=="ARCHITECT");
  $("#btnClient").classList.toggle("hidden", role!=="CLIENT");
}

async function loadPricing(){
  const pref = doc(db,"pricing","default");
  const snap = await getDoc(pref);
  if(snap.exists()) return snap.data();
  const seed = {
    tva_default:0.19,
    plan2d_new:7, plan2d_renov:5,
    int3d_res:20, int3d_com:30,
    ext_res:10, ext_facade_com:100,
    dossier_res:5, dossier_com:10,
    visit_single:100, visit_monthly:400,
    visit_monthly_included:6,
    deposit_rate:0.25,
    updatedAt: serverTimestamp(),
  };
  await setDoc(pref, seed);
  return seed;
}

function computeLines({pricing, projectType, surfaceM2, facadeMl, isNewBuild, wantPlan2D, want3DInt, wantExt, wantDossier, visitsMode, visitsCount}){
  const s = Math.max(0, Number(surfaceM2||0));
  const f = Math.max(0, Number(facadeMl||0));
  const isCommercial = projectType === "COMMERCIAL";
  const lines = [];

  if(wantPlan2D){
    const pu = isNewBuild ? pricing.plan2d_new : pricing.plan2d_renov;
    lines.push({code:"PLAN_2D", label:"Plan aménagé 2D", qty:s, unit:"m²", unitPrice:pu, total:s*pu});
  }
  if(want3DInt){
    const pu = isCommercial ? pricing.int3d_com : pricing.int3d_res;
    lines.push({code:"3D_INT", label:"3D intérieur", qty:s, unit:"m²", unitPrice:pu, total:s*pu});
  }
  if(wantExt){
    if(isCommercial){
      lines.push({code:"EXT_FACADE", label:"Extérieur (façade)", qty:f, unit:"ml", unitPrice:pricing.ext_facade_com, total:f*pricing.ext_facade_com});
    }else{
      lines.push({code:"EXT_COUVERT", label:"Extérieur couvert", qty:s, unit:"m²", unitPrice:pricing.ext_res, total:s*pricing.ext_res});
    }
  }
  if(wantDossier){
    const pu = isCommercial ? pricing.dossier_com : pricing.dossier_res;
    lines.push({code:"DOSSIER_TECH", label:"Dossier technique (lots spéciaux + métré)", qty:s, unit:"m²", unitPrice:pu, total:s*pu});
  }
  if(visitsMode==="SINGLE"){
    const c = Math.max(1, Number(visitsCount||1));
    lines.push({code:"VISITE", label:"Visite chantier", qty:c, unit:"visite", unitPrice:pricing.visit_single, total:c*pricing.visit_single});
  }else if(visitsMode==="MONTHLY"){
    lines.push({code:"FORFAIT_MENSUEL", label:"Forfait mensuel (6 visites)", qty:1, unit:"mois", unitPrice:pricing.visit_monthly, total:pricing.visit_monthly});
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

async function createPdf({invoice, lines, profile, client, project}){
  const { jsPDF } = window.jspdf;
  const docp = new jsPDF();

  docp.setFontSize(18);
  docp.text("FACTURE", 14, 18);
  docp.setFontSize(11);
  docp.text(`Numéro: ${invoice.invoiceNo}`, 14, 28);
  docp.text(`Date: ${new Date(invoice.createdAtMs).toLocaleDateString("fr-FR")}`, 14, 35);

  docp.text(`Architecte d'intérieur: ${profile.fullName||"—"}`, 14, 48);
  if(profile.company) docp.text(`Société: ${profile.company}`, 14, 55);
  if(profile.phone) docp.text(`Tél: ${profile.phone}`, 14, 62);
  if(profile.email) docp.text(`Email: ${profile.email}`, 14, 69);

  docp.text(`Client: ${client.name||"—"}`, 120, 48);
  if(client.email) docp.text(`Email: ${client.email}`, 120, 55);
  if(client.phone) docp.text(`Tél: ${client.phone}`, 120, 62);

  docp.text(`Projet: ${project.title||"—"}`, 14, 82);
  docp.text(`Type: ${project.projectType||"—"}`, 14, 89);

  docp.autoTable({
    startY: 98,
    head: [["Désignation","Qté","Unité","PU (DT)","Total (DT)"]],
    body: lines.map(l=>[l.label, String(l.qty), l.unit, Number(l.unitPrice).toFixed(2), Number(l.total).toFixed(2)]),
  });

  const y = docp.lastAutoTable.finalY + 10;
  docp.text(`Sous-total: ${Number(invoice.subtotal).toFixed(2)} DT`, 120, y);
  docp.text(`TVA (${Math.round(Number(invoice.tvaRate)*100)}%): ${Number(invoice.tax).toFixed(2)} DT`, 120, y+7);
  docp.setFontSize(13);
  docp.text(`TOTAL: ${Number(invoice.total).toFixed(2)} DT`, 120, y+16);
  docp.setFontSize(11);
  docp.text(`Acompte (25%): ${Number(invoice.deposit).toFixed(2)} DT`, 120, y+23);

  const url = publicInvoiceUrl(invoice.id, invoice.publicToken);
  const qrDataUrl = await window.QRCode.toDataURL(url);
  docp.addImage(qrDataUrl, "PNG", 14, y, 30, 30);
  docp.text("QR: lien facture", 14, y+40);

  return docp;
}

/* ----------------- RENDERERS ----------------- */

async function renderDirectory(){
  const snap = await getDocs(query(collection(db,"users"), where("role","==","ARCHITECT")));
  const grid = $("#directoryGrid");
  grid.innerHTML = "";
  const list=[];
  snap.forEach(d=>list.push(d.data()));
  list.forEach(p=>{
    const el=document.createElement("div");
    el.className="card";
    el.innerHTML = `
      <div class="bd">
        <div style="font-weight:900">${p.fullName||"—"}</div>
        <div class="muted">${p.company||"—"} • ${p.city||"—"}</div>
        <div class="hr"></div>
        <button class="btn" data-open-profile="${p.uid}">Voir profil</button>
      </div>`;
    grid.appendChild(el);
  });
  grid.querySelectorAll("[data-open-profile]").forEach(b=>{
    b.onclick = ()=> location.hash = `#/profile?id=${encodeURIComponent(b.dataset.openProfile)}`;
  });

  const search = $("#searchDirectory");
  if(search){
    search.oninput = ()=>{
      const q = search.value.trim().toLowerCase();
      grid.querySelectorAll(".card").forEach(card=>{
        const txt = card.textContent.toLowerCase();
        card.style.display = txt.includes(q) ? "" : "none";
      });
    };
  }
}

async function renderPortfolio(architectUid){
  const grid = $("#portfolioGrid");
  if(!grid) return;
  const snap = await getDocs(query(collection(db,"portfolio"), where("architectUid","==",architectUid), orderBy("createdAtMs","desc")));
  grid.innerHTML="";
  snap.forEach(d=>{
    const it=d.data();
    const el=document.createElement("div");
    el.className="card";
    const imgs=(it.images||[]).slice(0,4).map(u=>`<img src="${u}" style="width:100%;border-radius:14px;margin-top:6px"/>`).join("");
    el.innerHTML = `<div class="bd">
      <div style="font-weight:900">${it.title||"—"}</div>
      <div class="muted">${it.category||""}</div>
      <div class="muted">${it.description||""}</div>
      ${imgs}
    </div>`;
    grid.appendChild(el);
  });
}

async function renderMyProfile(){
  const me = await getMe();
  if(!me) return toast("Connectez-vous.");
  const f=$("#formMyProfile");
  f.fullName.value=me.fullName||"";
  f.company.value=me.company||"";
  f.phone.value=me.phone||"";
  f.city.value=me.city||"";
  f.officeAddress.value=me.officeAddress||"";
  f.instagram.value=me.instagram||"";
  f.facebook.value=me.facebook||"";
  f.linkedin.value=me.linkedin||"";
  f.website.value=me.website||"";
  await renderPortfolio(me.uid);
}

async function renderComments(uid){
  const wrap=$("#commentsList");
  const snap = await getDocs(query(collection(db,"profileComments"), where("architectUid","==",uid), orderBy("createdAtMs","desc"), limit(30)));
  wrap.innerHTML="";
  snap.forEach(d=>{
    const c=d.data();
    const el=document.createElement("div");
    el.className="card";
    el.innerHTML = `<div class="bd">
      <div style="font-weight:900">${c.author||"—"}</div>
      <div class="muted">${new Date(c.createdAtMs).toLocaleString("fr-FR")}</div>
      <div style="margin-top:8px">${c.text}</div>
    </div>`;
    wrap.appendChild(el);
  });
  if(!wrap.children.length) wrap.innerHTML=`<div class="muted">Aucun commentaire.</div>`;
}

async function renderPublicProfile(uid){
  const usnap = await getDoc(doc(db,"users",uid));
  if(!usnap.exists()) return toast("Profil introuvable");
  const p=usnap.data();

  $("#pubName").textContent = p.fullName||"Profil";
  $("#pubCompany").textContent = p.company||"";
  $("#pubCity").textContent = p.city||"—";

  $("#pubContact").innerHTML = `
    <div class="muted">Tél: ${p.phone||"—"}</div>
    <div class="muted">Email: ${p.email||"—"}</div>
    <div class="muted">Adresse: ${p.officeAddress||"—"}</div>
  `;

  const links=$("#pubLinks");
  links.innerHTML="";
  [["Instagram",p.instagram],["Facebook",p.facebook],["LinkedIn",p.linkedin],["Website",p.website]].forEach(([n,u])=>{
    if(!u) return;
    const a=document.createElement("a");
    a.className="btn"; a.href=u; a.target="_blank"; a.textContent=n;
    links.appendChild(a);
  });
  if(!links.children.length) links.innerHTML=`<div class="muted">—</div>`;

  // portfolio public
  const psnap = await getDocs(query(collection(db,"portfolio"), where("architectUid","==",uid), orderBy("createdAtMs","desc"), limit(12)));
  const pg=$("#pubPortfolio");
  pg.innerHTML="";
  psnap.forEach(d=>{
    const it=d.data();
    const el=document.createElement("div");
    el.className="card";
    const cover=(it.images||[])[0] ? `<img src="${it.images[0]}" style="width:100%;border-radius:14px"/>` : "";
    el.innerHTML = `<div class="bd">${cover}<div style="font-weight:900;margin-top:8px">${it.title||"—"}</div><div class="muted">${it.category||""}</div></div>`;
    pg.appendChild(el);
  });

  // likes count
  const likesSnap = await getDocs(query(collection(db,"profileLikes"), where("architectUid","==",uid)));
  $("#likeCount").textContent = String(likesSnap.size);

  // avg rating
  const rsnap = await getDocs(query(collection(db,"profileRatings"), where("architectUid","==",uid)));
  let sum=0; rsnap.forEach(d=>sum += Number(d.data().value||0));
  const avg = rsnap.size ? (sum/rsnap.size) : 0;
  $("#pubRatingAvg").textContent = rsnap.size ? `${avg.toFixed(1)} / 5` : "—";

  // like button
  const me = await getMe();
  const btnLike=$("#btnLike");
  btnLike.disabled = !me;
  btnLike.onclick = async ()=>{
    if(!me) return toast("Connectez-vous.");
    const likeId = `${uid}_${me.uid}`;
    const lref = doc(db,"profileLikes",likeId);
    const ls = await getDoc(lref);
    if(ls.exists()){
      // delete via batch import to avoid another import: set a tombstone not ideal; use update with merge? We'll just overwrite with empty? better: show message
      toast("Déjà liké (suppression تحتاج deleteDoc).");
    }else{
      await setDoc(lref,{ architectUid:uid, userUid:me.uid, createdAtMs:Date.now() });
      toast("Merci ❤️");
      await renderPublicProfile(uid);
    }
  };

  // rating
  const stars=$("#ratingStars");
  stars.innerHTML="";
  for(let i=1;i<=5;i++){
    const s=document.createElement("span");
    s.className="star"; s.textContent="★";
    s.onclick = async ()=>{
      if(!me) return toast("Connectez-vous.");
      const rid = `${uid}_${me.uid}`;
      await setDoc(doc(db,"profileRatings",rid),{ architectUid:uid, userUid:me.uid, value:i, updatedAtMs:Date.now() }, {merge:true});
      toast("Merci pour votre note");
      await renderPublicProfile(uid);
    };
    stars.appendChild(s);
  }

  await renderComments(uid);

  $("#formComment").onsubmit = async (e)=>{
    e.preventDefault();
    if(!me) return toast("Connectez-vous.");
    const text = e.target.text.value.trim();
    if(!text) return;
    await addDoc(collection(db,"profileComments"),{
      architectUid: uid,
      userUid: me.uid,
      author: me.fullName || me.email,
      text,
      createdAtMs: Date.now()
    });
    e.target.reset();
    toast("Commentaire ajouté");
    await renderComments(uid);
  };
}

async function renderAdmin(){
  const me = await getMe();
  if(!me || me.role!=="ADMIN"){ toast("Admin فقط."); return showRoute("home"); }

  const pricing = await loadPricing();
  const fp=$("#formPricing");
  Object.keys(pricing).forEach(k=>{ if(fp[k]) fp[k].value = pricing[k]; });

  fp.onsubmit = async (e)=>{
    e.preventDefault();
    const next = {
      plan2d_new:Number(fp.plan2d_new.value), plan2d_renov:Number(fp.plan2d_renov.value),
      int3d_res:Number(fp.int3d_res.value), int3d_com:Number(fp.int3d_com.value),
      dossier_res:Number(fp.dossier_res.value), dossier_com:Number(fp.dossier_com.value),
      ext_res:Number(fp.ext_res.value), ext_facade_com:Number(fp.ext_facade_com.value),
      visit_single:Number(fp.visit_single.value), visit_monthly:Number(fp.visit_monthly.value),
      deposit_rate:Number(fp.deposit_rate.value), tva_default:Number(fp.tva_default.value),
      visit_monthly_included:6,
      updatedAt: serverTimestamp()
    };
    await setDoc(doc(db,"pricing","default"), next, {merge:true});
    toast("Pricing updated ✅");
  };

  const tbody=$("#adminRequests");
  const snap = await getDocs(query(collection(db,"architectRequests"), orderBy("createdAtMs","desc")));
  tbody.innerHTML="";
  snap.forEach(d=>{
    const r=d.data();
    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td>${r.fullName||"—"}</td>
      <td>${r.company||"—"}</td>
      <td><span class="pill">${r.status||"PENDING"}</span></td>
      <td style="display:flex;gap:8px">
        <button class="btn" data-approve="${d.id}">Approuver</button>
        <button class="btn" data-reject="${d.id}">Refuser</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-approve]").forEach(b=>{
    b.onclick = async ()=>{
      const id=b.dataset.approve;
      const rref=doc(db,"architectRequests",id);
      const rs=await getDoc(rref);
      if(!rs.exists()) return;
      const r=rs.data();
      await updateDoc(rref,{status:"APPROVED", decidedAtMs:Date.now()});
      await updateDoc(doc(db,"users", r.uid),{role:"ARCHITECT", updatedAt: serverTimestamp()});
      toast("Approuvé ✅");
      await renderAdmin();
    };
  });
  tbody.querySelectorAll("[data-reject]").forEach(b=>{
    b.onclick = async ()=>{
      const id=b.dataset.reject;
      await updateDoc(doc(db,"architectRequests",id),{status:"REJECTED", decidedAtMs:Date.now()});
      toast("Refusé");
      await renderAdmin();
    };
  });
}

async function refreshClientProjectLists(){
  const me = await getMe();
  const csnap = await getDocs(query(collection(db,"clients"), where("architectUid","==",me.uid), orderBy("createdAtMs","desc")));
  const clients=[];
  csnap.forEach(d=>clients.push({id:d.id, ...d.data()}));
  $("#clientsCount").textContent = `${clients.length} clients`;
  $("#projectClient").innerHTML = `<option value="">—</option>` + clients.map(c=>`<option value="${c.id}">${c.name}</option>`).join("");

  const psnap = await getDocs(query(collection(db,"projects"), where("architectUid","==",me.uid), orderBy("createdAtMs","desc")));
  const projects=[];
  psnap.forEach(d=>projects.push({id:d.id, ...d.data()}));
  $("#projectsCount").textContent = `${projects.length} projets`;
  $("#invoiceProject").innerHTML = `<option value="">—</option>` + projects.map(p=>`<option value="${p.id}">${p.title} (${p.projectType})</option>`).join("");
}

async function refreshInvoices(){
  const me = await getMe();
  const snap = await getDocs(query(collection(db,"invoices"), where("architectUid","==",me.uid), orderBy("createdAtMs","desc"), limit(50)));
  const tbody=$("#invoiceList");
  tbody.innerHTML="";
  snap.forEach(d=>{
    const inv={id:d.id, ...d.data()};
    const url=publicInvoiceUrl(inv.id, inv.publicToken);
    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td>${inv.invoiceNo}</td>
      <td>${new Date(inv.createdAtMs).toLocaleDateString("fr-FR")}</td>
      <td>${Number(inv.total).toFixed(2)} DT</td>
      <td><a class="btn" href="${url}" target="_blank">Lien</a></td>
      <td><button class="btn" data-pdf="${inv.id}">PDF</button></td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-pdf]").forEach(b=>{
    b.onclick = async ()=> downloadInvoicePdf(b.dataset.pdf);
  });
}

async function downloadInvoicePdf(invId){
  const invSnap = await getDoc(doc(db,"invoices",invId));
  if(!invSnap.exists()) return toast("Invoice introuvable");
  const invoice = {id:invId, ...invSnap.data()};

  const profileSnap = await getDoc(doc(db,"users", invoice.architectUid));
  const profile = profileSnap.exists()? profileSnap.data() : {fullName:"—", email:"—"};

  const clientSnap = await getDoc(doc(db,"clients", invoice.clientId));
  const client = clientSnap.exists()? clientSnap.data() : {name:"—"};

  const projSnap = await getDoc(doc(db,"projects", invoice.projectId));
  const project = projSnap.exists()? projSnap.data() : {title:"—", projectType:"—"};

  const linesSnap = await getDocs(query(collection(db,"invoiceLines"), where("invoiceId","==",invId)));
  const lines=[]; linesSnap.forEach(d=>lines.push(d.data()));

  const pdf = await createPdf({invoice, lines, profile, client, project});
  pdf.save(`${invoice.invoiceNo}.pdf`);
}

async function renderArchitect(){
  const me = await getMe();
  if(!me || me.role!=="ARCHITECT"){ toast("Architecte فقط."); return showRoute("home"); }

  await refreshClientProjectLists();

  $("#formClientCreate").onsubmit = async (e)=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    await addDoc(collection(db,"clients"),{
      architectUid: me.uid,
      ownerUid: null,
      name: fd.get("name"),
      email: fd.get("email")||"",
      phone: fd.get("phone")||"",
      createdAtMs: Date.now()
    });
    e.target.reset();
    toast("Client ajouté ✅");
    await refreshClientProjectLists();
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
    e.target.reset();
    toast("Projet ajouté ✅");
    await refreshClientProjectLists();
  };

  $("#formInvoiceCreate").onsubmit = async (e)=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const pricing = await loadPricing();

    const projectId = String(fd.get("projectId"));
    const psnap = await getDoc(doc(db,"projects",projectId));
    if(!psnap.exists()) return toast("Projet introuvable");
    const project = psnap.data();

    const { lines, subtotal } = computeLines({
      pricing,
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
    const deposit = total * Number(pricing.deposit_rate||0.25);

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
    await refreshInvoices();
  };

  await refreshInvoices();
}

async function renderClient(){
  const me = await getMe();
  if(!me) return toast("Connectez-vous.");
  const email = (me.email||"").toLowerCase();

  const cSnap = await getDocs(query(collection(db,"clients"), where("email","==",email)));
  const clientIds=[];
  cSnap.forEach(d=>clientIds.push(d.id));

  const tbody=$("#clientInvoiceList");
  tbody.innerHTML="";
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

  const tbody=$("#invLines");
  tbody.innerHTML="";
  lines.forEach(l=>{
    const tr=document.createElement("tr");
    tr.innerHTML = `<td>${l.label}</td><td>${l.qty}</td><td>${l.unit}</td><td>${Number(l.unitPrice).toFixed(2)}</td><td>${Number(l.total).toFixed(2)}</td>`;
    tbody.appendChild(tr);
  });

  $("#invTotals").textContent = `TOTAL: ${Number(invoice.total).toFixed(2)} DT`;
  $("#invDeposit").textContent = `Acompte (25%): ${Number(invoice.deposit).toFixed(2)} DT`;

  $("#btnPdfPublic").onclick = async ()=>{
    const profileSnap = await getDoc(doc(db,"users", invoice.architectUid));
    const profile = profileSnap.exists()? profileSnap.data() : {fullName:"—", email:"—"};

    const clientSnap = await getDoc(doc(db,"clients", invoice.clientId));
    const client = clientSnap.exists()? clientSnap.data() : {name:"—"};

    const projSnap = await getDoc(doc(db,"projects", invoice.projectId));
    const project = projSnap.exists()? projSnap.data() : {title:"—", projectType:"—"};

    const pdf = await createPdf({invoice, lines, profile, client, project});
    pdf.save(`${invoice.invoiceNo}.pdf`);
  };
}

/* ----------------- EVENTS ----------------- */

$$("[data-route]").forEach(b=>{
  b.addEventListener("click", ()=>{ location.hash = `#/${b.dataset.route}`; });
});

$("#btnLogout").addEventListener("click", async ()=>{
  await signOut(auth);
  toast("Déconnecté");
  location.hash="#/home";
});

$("#btnGoogle").addEventListener("click", async ()=>{
  try{
    await signInWithPopup(auth, new GoogleAuthProvider());
  }catch(e){ toast(e.message); }
});

$("#formLoginEmail").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const fd=new FormData(e.target);
  try{
    await signInWithEmailAndPassword(auth, String(fd.get("email")), String(fd.get("password")));
  }catch(err){ toast(err.message); }
});

$("#formArchitectRequest").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const fd=new FormData(e.target);
  try{
    const cred = await createUserWithEmailAndPassword(auth, String(fd.get("email")), String(fd.get("password")));
    const user = cred.user;
    await ensureUserDoc(user);
    await updateDoc(doc(db,"users",user.uid),{ fullName:String(fd.get("fullName")), company:String(fd.get("company")), updatedAt: serverTimestamp() });
    await addDoc(collection(db,"architectRequests"),{
      uid:user.uid, email:user.email, fullName:String(fd.get("fullName")), company:String(fd.get("company")),
      status:"PENDING", createdAtMs: Date.now()
    });
    toast("Demande envoyée ✅");
    location.hash="#/home";
  }catch(err){ toast(err.message); }
});

$("#formMyProfile").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const me = await getMe();
  if(!me) return toast("Connectez-vous.");
  const fd=new FormData(e.target);

  let logoUrl = me.logoUrl || "";
  const file = fd.get("logo");
  if(file && file.size){
    const r = ref(storage, `logos/${me.uid}/${Date.now()}_${file.name}`);
    await uploadBytes(r, file);
    logoUrl = await getDownloadURL(r);
  }

  await updateDoc(doc(db,"users",me.uid),{
    fullName: String(fd.get("fullName")||""),
    company: String(fd.get("company")||""),
    phone: String(fd.get("phone")||""),
    city: String(fd.get("city")||""),
    officeAddress: String(fd.get("officeAddress")||""),
    instagram: String(fd.get("instagram")||""),
    facebook: String(fd.get("facebook")||""),
    linkedin: String(fd.get("linkedin")||""),
    website: String(fd.get("website")||""),
    logoUrl,
    updatedAt: serverTimestamp()
  });
  toast("Profil enregistré ✅");
  await renderDirectory();
});

$("#formPortfolio").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const me = await getMe();
  if(!me || me.role!=="ARCHITECT") return toast("Architecte فقط.");
  const fd=new FormData(e.target);
  const files = fd.getAll("images");
  const urls=[];
  for(const file of files){
    if(!file || !file.size) continue;
    const r = ref(storage, `portfolio/${me.uid}/${Date.now()}_${file.name}`);
    await uploadBytes(r, file);
    urls.push(await getDownloadURL(r));
  }
  await addDoc(collection(db,"portfolio"),{
    architectUid: me.uid,
    title: String(fd.get("title")),
    category: String(fd.get("category")),
    description: String(fd.get("description")||""),
    images: urls,
    createdAtMs: Date.now()
  });
  e.target.reset();
  toast("Portfolio ajouté ✅");
  await renderPortfolio(me.uid);
});

/* ----------------- ROUTER ----------------- */

async function handleRoute(){
  const {route, params} = parseHash();

  if(route==="invoice"){ showRoute("publicInvoice"); await renderPublicInvoice(params.id, params.t); return; }
  if(route==="profile"){ showRoute("publicProfile"); await renderPublicProfile(params.id); return; }

  showRoute(route);

  if(route==="directory") await renderDirectory();
  if(route==="myProfile") await renderMyProfile();
  if(route==="admin") await renderAdmin();
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

  const isAdmin = (user.email||"").toLowerCase() === (window.ADMIN_EMAIL||"").toLowerCase();
  if(isAdmin && u.role!=="ADMIN"){
    await updateDoc(doc(db,"users",user.uid),{role:"ADMIN", updatedAt: serverTimestamp()});
    u.role="ADMIN";
  }

  setSessionInfo(u.role, user.email||"");
  if(parseHash().route==="login") location.hash="#/home";
  await handleRoute();
});

(async ()=>{
  if(!location.hash) location.hash="#/home";
  await handleRoute();
})();
