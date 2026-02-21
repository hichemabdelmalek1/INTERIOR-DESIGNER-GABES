/**
 * Static HTML prototype (no server).
 * Data stored in localStorage.
 * NOTE: This does NOT include Google Login, DB, PDF generation, or secure tokens.
 */

const LS_KEY = "invoice_platform_static_v1";

function loadState(){
  try{ return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }catch{ return {}; }
}
function saveState(s){ localStorage.setItem(LS_KEY, JSON.stringify(s)); }

function initState(){
  const s = loadState();
  if(!s.clients) s.clients = [];
  if(!s.engineers) s.engineers = [{email:"engineer@example.com", name:"Ingénieur Démo", status:"APPROVED"}];
  if(!s.projects) s.projects = [];
  if(!s.invoices) s.invoices = [];
  if(!s.prices){
    s.prices = {
      PLAN2D_NEUF: {label:"Plan aménagé 2D (Neuf)", unit:"m²", price:7},
      PLAN2D_RENO: {label:"Plan aménagé 2D (Rénovation)", unit:"m²", price:5},
      INT3D: {label:"3D intérieur", unit:"m²", price:20},
      EXT: {label:"Extérieur couvert", unit:"m²", price:10},
      DOSSIER: {label:"Dossier technique (lot spéciaux + métrée)", unit:"m²", price:5},
      VISIT: {label:"Visite de chantier", unit:"visite", price:100},
      FORFAIT: {label:"Forfait supervision mensuel (6 visites)", unit:"mois", price:400},
    };
  }
  if(!s.counter){ s.counter = 1; s.year = new Date().getFullYear(); }
  saveState(s);
  return s;
}

function money(n){
  return new Intl.NumberFormat("fr-FR",{minimumFractionDigits:2, maximumFractionDigits:2}).format(n);
}

function invoiceNumber(state){
  const year = new Date().getFullYear();
  if(state.year !== year){ state.year = year; state.counter = 1; }
  const num = `INV-${year}-${String(state.counter).padStart(4,"0")}`;
  state.counter += 1;
  return num;
}

function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return [...document.querySelectorAll(sel)]; }

function toast(msg){
  const el = qs("#toast");
  if(!el) return alert(msg);
  el.textContent = msg;
  el.style.opacity = "1";
  setTimeout(()=> el.style.opacity="0", 2200);
}

function route(){
  const page = document.body.dataset.page;
  const state = initState();
  if(page === "admin") adminPage(state);
  if(page === "engineer") engineerPage(state);
  if(page === "client") clientPage(state);
  if(page === "home") homePage();
}

function homePage(){
  qs("#goAdmin")?.addEventListener("click", ()=> location.href="admin.html");
  qs("#goEngineer")?.addEventListener("click", ()=> location.href="engineer.html");
  qs("#goClient")?.addEventListener("click", ()=> location.href="client.html");
}

/* ---------------- ADMIN ---------------- */
function adminPage(state){
  renderClients(state);
  renderProjects(state);
  renderInvoices(state);

  qs("#clientForm")?.addEventListener("submit", (e)=>{
    e.preventDefault();
    const f = e.target;
    const c = {
      id: crypto.randomUUID(),
      name: f.name.value.trim(),
      email: f.email.value.trim().toLowerCase() || "",
      phone: f.phone.value.trim(),
      taxId: f.taxId.value.trim(),
      address: f.address.value.trim(),
      createdAt: Date.now()
    };
    if(!c.name) return toast("Nom client obligatoire");
    state.clients.unshift(c);
    saveState(state);
    f.reset();
    renderClients(state);
    toast("Client ajouté");
  });

  qs("#projectForm")?.addEventListener("submit", (e)=>{
    e.preventDefault();
    const f = e.target;
    const p = {
      id: crypto.randomUUID(),
      title: f.title.value.trim(),
      location: f.location.value.trim(),
      clientId: f.clientId.value,
      engineerEmail: f.engineerEmail.value,
      createdAt: Date.now()
    };
    if(!p.title) return toast("Titre projet obligatoire");
    if(!p.clientId) return toast("Choisir client");
    if(!p.engineerEmail) return toast("Choisir ingénieur");
    state.projects.unshift(p);
    saveState(state);
    f.reset();
    renderProjects(state);
    toast("Projet créé");
  });

  qs("#resetAll")?.addEventListener("click", ()=>{
    if(confirm("Réinitialiser toutes les données (clients, projets, factures) ?")){
      localStorage.removeItem(LS_KEY);
      initState();
      location.reload();
    }
  });
}

function renderClients(state){
  const list = qs("#clientsList");
  const sel = qs("#clientSelect");
  if(list){
    list.innerHTML = state.clients.length ? "" : `<div class="muted small">Aucun client.</div>`;
    state.clients.forEach(c=>{
      const div = document.createElement("div");
      div.className="item";
      div.innerHTML = `
        <div>
          <div style="font-weight:700">${escapeHtml(c.name)}</div>
          <div class="small muted">Email: <b>${escapeHtml(c.email || "—")}</b> — Tél: ${escapeHtml(c.phone||"—")} — MF: ${escapeHtml(c.taxId||"—")}</div>
          ${c.address ? `<div class="small muted" style="margin-top:4px">${escapeHtml(c.address)}</div>`:""}
        </div>
        <button class="btn ghost" data-del-client="${c.id}">Supprimer</button>
      `;
      list.appendChild(div);
    });
    qsa("[data-del-client]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-del-client");
        state.clients = state.clients.filter(c=>c.id!==id);
        // remove related projects/invoices
        const projIds = state.projects.filter(p=>p.clientId===id).map(p=>p.id);
        state.projects = state.projects.filter(p=>p.clientId!==id);
        state.invoices = state.invoices.filter(inv=>!projIds.includes(inv.projectId));
        saveState(state);
        renderClients(state); renderProjects(state); renderInvoices(state);
      });
    });
  }
  if(sel){
    sel.innerHTML = `<option value="">— Choisir —</option>` + state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  }
  const engSel = qs("#engineerSelect");
  if(engSel){
    engSel.innerHTML = state.engineers.filter(e=>e.status==="APPROVED")
      .map(e=>`<option value="${e.email}">${escapeHtml(e.name)} — ${escapeHtml(e.email)}</option>`).join("");
  }
}

function renderProjects(state){
  const list = qs("#projectsList");
  const sel = qs("#projectSelect");
  if(list){
    list.innerHTML = state.projects.length ? "" : `<div class="muted small">Aucun projet.</div>`;
    state.projects.forEach(p=>{
      const client = state.clients.find(c=>c.id===p.clientId);
      const div=document.createElement("div");
      div.className="item";
      div.innerHTML=`
        <div>
          <div style="font-weight:700">${escapeHtml(p.title)}</div>
          <div class="small muted">Client: <b>${escapeHtml(client?.name||"—")}</b> — Ingénieur: <b>${escapeHtml(p.engineerEmail)}</b> — Lieu: ${escapeHtml(p.location||"—")}</div>
        </div>
        <button class="btn ghost" data-del-project="${p.id}">Supprimer</button>
      `;
      list.appendChild(div);
    });
    qsa("[data-del-project]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-del-project");
        state.projects = state.projects.filter(p=>p.id!==id);
        state.invoices = state.invoices.filter(inv=>inv.projectId!==id);
        saveState(state);
        renderProjects(state); renderInvoices(state);
      });
    });
  }
  if(sel){
    sel.innerHTML = `<option value="">— Choisir —</option>` + state.projects.map(p=>`<option value="${p.id}">${escapeHtml(p.title)}</option>`).join("");
  }
}

function renderInvoices(state){
  const list = qs("#invoicesList");
  if(!list) return;
  list.innerHTML = state.invoices.length ? "" : `<div class="muted small">Aucune facture.</div>`;
  state.invoices.forEach(inv=>{
    const p = state.projects.find(x=>x.id===inv.projectId);
    const c = state.clients.find(x=>x.id===p?.clientId);
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML=`
      <div>
        <div style="font-weight:800">${inv.number} <span class="badge">${inv.status}</span></div>
        <div class="small muted">Client: <b>${escapeHtml(c?.name||"—")}</b> — Projet: ${escapeHtml(p?.title||"—")} — Total: <b>${money(inv.total)} DT</b></div>
      </div>
      <div class="row">
        <a class="btn" href="client.html#${encodeURIComponent(inv.number)}">Ouvrir</a>
        <select class="btn" data-status="${inv.number}">
          ${["ISSUED","PAID","CANCELED"].map(s=>`<option ${s===inv.status?"selected":""} value="${s}">${s}</option>`).join("")}
        </select>
      </div>
    `;
    list.appendChild(div);
  });
  qsa("[data-status]").forEach(sel=>{
    sel.addEventListener("change", ()=>{
      const num = sel.getAttribute("data-status");
      const inv = state.invoices.find(i=>i.number===num);
      if(inv){ inv.status = sel.value; saveState(state); toast("Statut mis à jour"); }
    });
  });
}

/* ---------------- ENGINEER ---------------- */
function engineerPage(state){
  // engineer identity (static)
  const meEmail = "engineer@example.com";
  const me = state.engineers.find(e=>e.email===meEmail);
  qs("#meEmail").textContent = meEmail;
  qs("#meStatus").textContent = me?.status || "APPROVED";

  const myProjects = state.projects.filter(p=>p.engineerEmail===meEmail);
  const projectSel = qs("#projectSelect");
  projectSel.innerHTML = myProjects.length
    ? myProjects.map(p=>`<option value="${p.id}">${escapeHtml(p.title)}</option>`).join("")
    : `<option value="">(Aucun projet assigné — admin doit créer)</option>`;

  qs("#invoiceForm")?.addEventListener("submit", (e)=>{
    e.preventDefault();
    if(!myProjects.length) return toast("Aucun projet assigné. Demande à l’admin.");

    const f = e.target;
    const projectId = f.projectId.value;

    const tvaRate = parseFloat(f.tvaRate.value);
    const paymentPlan = f.paymentPlan.value;
    const paymentMethod = f.paymentMethod.value;

    const lines = [];

    // Plan2D
    const plan2dOn = f.plan2dEnabled.checked;
    const plan2dType = f.plan2dType.value;
    const plan2dSurface = parseFloat(f.plan2dSurface.value||"0");
    if(plan2dOn && plan2dSurface>0){
      const code = plan2dType==="NEUF" ? "PLAN2D_NEUF" : "PLAN2D_RENO";
      const it = state.prices[code];
      lines.push(mkLine(code, it.label, plan2dSurface, it.unit, it.price));
    }
    // 3D
    const intOn = f.interior3dEnabled.checked;
    const intSurf = parseFloat(f.interior3dSurface.value||"0");
    if(intOn && intSurf>0){
      const it = state.prices.INT3D;
      lines.push(mkLine("INT3D", it.label, intSurf, it.unit, it.price));
    }
    // Ext
    const extOn = f.extEnabled.checked;
    const extSurf = parseFloat(f.extSurface.value||"0");
    if(extOn && extSurf>0){
      const it = state.prices.EXT;
      lines.push(mkLine("EXT", it.label, extSurf, it.unit, it.price));
    }
    // Dossier
    const dosOn = f.dossierEnabled.checked;
    const dosSurf = parseFloat(f.dossierSurface.value||"0");
    if(dosOn && dosSurf>0){
      const it = state.prices.DOSSIER;
      lines.push(mkLine("DOSSIER", it.label, dosSurf, it.unit, it.price));
    }

    // Supervision
    const mode = f.supervisionMode.value;
    const months = parseInt(f.months.value||"0",10);
    const visits = parseInt(f.visits.value||"0",10);
    const extraVisits = parseInt(f.extraVisits.value||"0",10);
    const ownerApproved = f.ownerApproved.checked;

    if(mode==="FORFAIT" && months>0){
      const it = state.prices.FORFAIT;
      lines.push(mkLine("FORFAIT", it.label, months, it.unit, it.price));
    }
    if(mode==="VISITS" && visits>0){
      const it = state.prices.VISIT;
      lines.push(mkLine("VISIT", it.label, visits, it.unit, it.price));
    }
    if(mode==="FORFAIT_PLUS_EXTRA"){
      if(!ownerApproved) return toast("Approbation du propriétaire requise pour les visites extra.");
      if(months>0){
        const it = state.prices.FORFAIT;
        lines.push(mkLine("FORFAIT", it.label, months, it.unit, it.price));
      }
      if(extraVisits>0){
        const it = state.prices.VISIT;
        lines.push(mkLine("VISIT_EXTRA", "Visites supplémentaires (sur demande propriétaire)", extraVisits, "visite", it.price));
      }
    }

    const subtotal = lines.reduce((a,b)=>a+b.total,0);
    const tax = subtotal * tvaRate;
    const total = subtotal + tax;

    const number = invoiceNumber(state);
    const inv = {
      number,
      projectId,
      status:"ISSUED",
      createdAt: Date.now(),
      tvaRate,
      paymentPlan,
      paymentMethod,
      depositRate: 0.25,
      lines,
      subtotal, tax, total,
    };
    state.invoices.unshift(inv);
    saveState(state);

    // preview + QR
    renderInvoicePreview(inv, state);
    toast("Facture créée (prototype)");
  });

  // initial preview last invoice
  const last = state.invoices.find(i=>{
    const p=state.projects.find(x=>x.id===i.projectId);
    return p?.engineerEmail===meEmail;
  });
  if(last) renderInvoicePreview(last, state);
}

function mkLine(code,label,qty,unit,unitPrice){
  return {code,label,qty,unit,unitPrice,total:qty*unitPrice};
}

function renderInvoicePreview(inv, state){
  const p = state.projects.find(x=>x.id===inv.projectId);
  const c = state.clients.find(x=>x.id===p?.clientId);
  qs("#prevNum").textContent = inv.number;
  qs("#prevClient").textContent = c?.name || "—";
  qs("#prevProject").textContent = p?.title || "—";
  qs("#prevSubtotal").textContent = money(inv.subtotal)+" DT";
  qs("#prevTax").textContent = money(inv.tax)+" DT";
  qs("#prevTotal").textContent = money(inv.total)+" DT";

  const tbody = qs("#prevLines");
  tbody.innerHTML = inv.lines.map(l=>`
    <tr>
      <td>${escapeHtml(l.label)}</td>
      <td class="right">${l.qty}</td>
      <td>${escapeHtml(l.unit)}</td>
      <td class="right">${money(l.unitPrice)}</td>
      <td class="right">${money(l.total)}</td>
    </tr>
  `).join("");

  const pay = qs("#prevPay");
  if(inv.paymentPlan==="FOUR_INSTALLMENTS"){
    const tranche = inv.total/4;
    pay.innerHTML = `Paiement en <b>4 échéances</b> (25% chacune). Montant tranche: <b>${money(tranche)} DT</b>.<br/>
      Mode: <b>${payMethodLabel(inv.paymentMethod)}</b>`;
  }else{
    pay.innerHTML = `Paiement total (100%): <b>${money(inv.total)} DT</b><br/>Mode: <b>${payMethodLabel(inv.paymentMethod)}</b>`;
  }

  const url = `${location.origin.replace(/\/[^\/]*$/,'')}/client.html#${encodeURIComponent(inv.number)}`;
  // QR (online via CDN qrcodejs)
  const qrBox = qs("#qr");
  qrBox.innerHTML = "";
  if(window.QRCode){
    new QRCode(qrBox, { text: url, width: 140, height: 140 });
  } else {
    qrBox.innerHTML = `<div class="small muted">QR library not loaded.</div>`;
  }
  qs("#prevLink").href = `client.html#${encodeURIComponent(inv.number)}`;
}

/* ---------------- CLIENT ---------------- */
function clientPage(state){
  const list = qs("#myInvoices");
  list.innerHTML = state.invoices.length ? "" : `<div class="muted small">Aucune facture.</div>`;
  state.invoices.forEach(inv=>{
    const p = state.projects.find(x=>x.id===inv.projectId);
    const c = state.clients.find(x=>x.id===p?.clientId);
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML=`
      <div>
        <div style="font-weight:800">${inv.number} <span class="badge">${inv.status}</span></div>
        <div class="small muted">${escapeHtml(c?.name||"—")} — ${escapeHtml(p?.title||"—")} — Total: <b>${money(inv.total)} DT</b></div>
      </div>
      <button class="btn" data-open="${inv.number}">Ouvrir</button>
    `;
    list.appendChild(div);
  });
  qsa("[data-open]").forEach(b=>{
    b.addEventListener("click", ()=> openInvoice(state, b.getAttribute("data-open")));
  });

  // open by hash
  const num = decodeURIComponent((location.hash||"").slice(1));
  if(num) openInvoice(state, num);

  qs("#clearHash")?.addEventListener("click", ()=>{
    history.replaceState(null,"",location.pathname);
    qs("#viewer").innerHTML = "";
  });
}

function openInvoice(state, number){
  const inv = state.invoices.find(i=>i.number===number);
  if(!inv){ return toast("Facture introuvable"); }
  const p = state.projects.find(x=>x.id===inv.projectId);
  const c = state.clients.find(x=>x.id===p?.clientId);

  const viewer = qs("#viewer");
  viewer.innerHTML = `
    <div class="card">
      <div class="hd">
        <h2>Facture ${escapeHtml(inv.number)}</h2>
        <p>${escapeHtml(c?.name||"—")} — ${escapeHtml(p?.title||"—")}</p>
      </div>
      <div class="bd">
        <div class="grid three">
          <div class="card"><div class="bd"><div class="muted small">Sous-total</div><div style="font-weight:800;font-size:20px">${money(inv.subtotal)} DT</div></div></div>
          <div class="card"><div class="bd"><div class="muted small">TVA</div><div style="font-weight:800;font-size:20px">${money(inv.tax)} DT</div></div></div>
          <div class="card"><div class="bd"><div class="muted small">Total</div><div style="font-weight:800;font-size:20px">${money(inv.total)} DT</div></div></div>
        </div>

        <div class="hr"></div>

        <table>
          <thead><tr><th>Désignation</th><th class="right">Qté</th><th>Unité</th><th class="right">PU</th><th class="right">Total</th></tr></thead>
          <tbody>
            ${inv.lines.map(l=>`
              <tr>
                <td>${escapeHtml(l.label)}</td>
                <td class="right">${l.qty}</td>
                <td>${escapeHtml(l.unit)}</td>
                <td class="right">${money(l.unitPrice)}</td>
                <td class="right">${money(l.total)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div class="hr"></div>

        <div class="card"><div class="bd">
          <div style="font-weight:800">Modalités de paiement</div>
          <div class="small muted" style="margin-top:6px">${paymentText(inv)}</div>
        </div></div>
      </div>
    </div>
  `;

  history.replaceState(null,"",`#${encodeURIComponent(number)}`);
}

function paymentText(inv){
  if(inv.paymentPlan==="FOUR_INSTALLMENTS"){
    const tranche = inv.total/4;
    return `Paiement en 4 échéances: 25% + 25% + 25% + 25% — Tranche: <b>${money(tranche)} DT</b> — Mode: <b>${payMethodLabel(inv.paymentMethod)}</b>`;
  }
  return `Paiement total (100%): <b>${money(inv.total)} DT</b> — Mode: <b>${payMethodLabel(inv.paymentMethod)}</b>`;
}

function payMethodLabel(v){
  if(v==="BANK_TRANSFER") return "Virement bancaire";
  if(v==="CASH") return "Espèces";
  return "Virement bancaire ou espèces";
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

document.addEventListener("DOMContentLoaded", route);
