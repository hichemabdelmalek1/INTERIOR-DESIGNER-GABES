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
  if(!s.engineers) s.engineers = [{email:"engineer@example.com", name:"Architecte d\u2019intérieur Démo", status:"APPROVED"}];
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
      projectType: f.projectType?.value || "RESIDENTIEL",
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
          <div class="small muted">Client: <b>${escapeHtml(client?.name||"—")}</b> — Architecte d'intérieur: <b>${escapeHtml(p.engineerEmail)}</b> — Type: <b>${projectTypeLabel(p.projectType)}</b> — Lieu: ${escapeHtml(p.location||"—")}</div>
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

  
function isCommercialProject(projectId){
  const pr = state.projects.find(p=>p.id===projectId);
  return pr?.projectType === "COMMERCIAL";
}

function updateExtUi(){
  const pid = projectSel.value;
  const commercial = isCommercialProject(pid);
  const lbl = qs("#extLabel");
  const hint = qs("#extHint");
  if(lbl) lbl.textContent = commercial ? "Longueur façade (m linéaire)" : "Surface couverte (m²)";
  if(hint) hint.textContent = commercial
    ? "Commercial: 100 DT par m linéaire de façade."
    : "Résidentiel/Tertiaire/Public/Scéno: 10 DT/m² couvert.";
}

projectSel.addEventListener("change", updateExtUi);
setTimeout(updateExtUi, 0);

qs("#invoiceForm")?.addEventListener("submit", (e)=>{
    e.preventDefault();
    if(!myProjects.length) return toast("Aucun projet assigné. Demande à l’admin.");

    const f = e.target;
    const projectId = f.projectId.value;
    const override = (qs("#billingProjectType")?.value || "AUTO");
    const effectiveType = getEffectiveBillingType(state, projectId, override);
    const commercial = (effectiveType === "COMMERCIAL");

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
      const pu = commercial ? 30 : it.price;
      lines.push(mkLine("INT3D", it.label + (commercial ? " (Commercial)" : ""), intSurf, it.unit, pu));
    }
    // Ext
    const extOn = f.extEnabled.checked;
    const extSurf = parseFloat(f.extSurface.value||"0");
    if(extOn && extSurf>0){
      if(commercial){
        lines.push(mkLine("EXT_FACADE", "Façade (m linéaire)", extSurf, "m.l", 100));
      } else {
        const it = state.prices.EXT;
        lines.push(mkLine("EXT", it.label, extSurf, it.unit, it.price));
      }
    }
    // Dossier
    const dosOn = f.dossierEnabled.checked;
    const dosSurf = parseFloat(f.dossierSurface.value||"0");
    if(dosOn && dosSurf>0){
      const it = state.prices.DOSSIER;
      const pu = commercial ? 10 : it.price;
      lines.push(mkLine("DOSSIER", it.label + (commercial ? " (Commercial)" : ""), dosSurf, it.unit, pu));
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
      projectType: effectiveType,
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
  const tEl = qs("#prevType");
  if(tEl) tEl.textContent = projectTypeLabel(inv.projectType || p?.projectType || "RESIDENTIEL");
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
  const pdfBtn = qs("#btnPdf");
  if(pdfBtn){ pdfBtn.onclick = () => downloadInvoicePDF(state, inv.number); }
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
        <div class="row" style="justify-content:space-between">
          <div>
            <h2>Facture ${escapeHtml(inv.number)}</h2>
        <p>${escapeHtml(c?.name||"—")} — ${escapeHtml(p?.title||"—")} — <b>${projectTypeLabel(inv.projectType || p?.projectType)}</b></p>
          </div>
          <button class="btn primary" type="button" data-pdf="${escapeHtml(inv.number)}">Télécharger PDF</button>
        </div>
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
  const b = qs(`[data-pdf="${inv.number}"]`);
  if(b){ b.onclick = ()=> downloadInvoicePDF(state, inv.number); }
}

function paymentText(inv){
  if(inv.paymentPlan==="FOUR_INSTALLMENTS"){
    const tranche = inv.total/4;
    return `Paiement en 4 échéances: 25% + 25% + 25% + 25% — Tranche: <b>${money(tranche)} DT</b> — Mode: <b>${payMethodLabel(inv.paymentMethod)}</b>`;
  }
  return `Paiement total (100%): <b>${money(inv.total)} DT</b> — Mode: <b>${payMethodLabel(inv.paymentMethod)}</b>`;
}

function projectTypeLabel(v){
  const map = {
    RESIDENTIEL: "Résidentiel",
    TERTIAIRE: "Tertiaire",
    COMMERCIAL: "Commercial",
    PUBLIC_CULTUREL: "Public et Culturel",
    SCENOGRAPHIE: "Scénographie et Éphémère",
  };
  return map[v] || v || "—";
}

function getTariffsForProjectType(projectType){
  const commercial = projectType === "COMMERCIAL";
  return {
    plan2d_neuf: { label: "Plan aménagé 2D (Neuf)", unit: "m²", price: 7 },
    plan2d_reno: { label: "Plan aménagé 2D (Rénovation)", unit: "m²", price: 5 },
    int3d: { label: "3D intérieur", unit: "m²", price: commercial ? 30 : 20 },
    dossier: { label: "Dossier technique", unit: "m²", price: commercial ? 10 : 5 },
    ext: commercial
      ? { label: "Façade", unit: "m linéaire", price: 100 }
      : { label: "Extérieur couvert", unit: "m²", price: 10 },
    visit: { label: "Visite de chantier", unit: "visite", price: 100 },
    forfait: { label: "Forfait supervision mensuel (6 visites)", unit: "mois", price: 400 },
  };
}

function renderPricingUI(state, projectId, overrideType){
  const type = getEffectiveBillingType(state, projectId, overrideType || "AUTO");
  const tariffs = getTariffsForProjectType(type);

  const badge = qs("#pricingBadge");
  const ctx = qs("#pricingContext");
  if(badge) badge.textContent = projectTypeLabel(type);
  if(ctx) ctx.textContent = type === "COMMERCIAL"
    ? "PROJET = Commercial → tarifs commercial appliqués."
    : "Tarifs standard appliqués.";

  const tbody = qs("#pricingTable");
  if(tbody){
    const rows = [
      tariffs.plan2d_neuf, tariffs.plan2d_reno, tariffs.int3d, tariffs.dossier, tariffs.ext, tariffs.visit, tariffs.forfait
    ];
    tbody.innerHTML = rows.map(r=>`
      <tr>
        <td>${escapeHtml(r.label)}</td>
        <td>${escapeHtml(r.unit)}</td>
        <td class="right"><b>${money(r.price)} DT</b></td>
      </tr>
    `).join("");
  }

  // Inline badges
  const bPlan = qs("#pricePlan2D");
  const b3d = qs("#price3D");
  const bDos = qs("#priceDossier");
  const bExt = qs("#priceExt");
  const bSup = qs("#priceSup");
  if(bPlan) bPlan.textContent = `Neuf: 7 DT/m² • Rénov: 5 DT/m²`;
  if(b3d) b3d.textContent = `${money(tariffs.int3d.price)} DT/${tariffs.int3d.unit}`;
  if(bDos) bDos.textContent = `${money(tariffs.dossier.price)} DT/${tariffs.dossier.unit}`;
  if(bExt) bExt.textContent = `${money(tariffs.ext.price)} DT/${tariffs.ext.unit}`;
  if(bSup) bSup.textContent = `Visite: 100 DT • Forfait: 400 DT/mois`;
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







function pdfEscape(s){
  return String(s ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function buildSimplePdf(lines){
  // Minimal single-page PDF (A4) with Helvetica. Offline, no external libs.
  const pageW = 595.28, pageH = 841.89;
  let y = 800;
  const fontSize = 11;
  const leading = 14;

  // Build content stream: text lines
  let content = "BT\n/F1 " + fontSize + " Tf\n";
  for(const line of lines){
    const safe = pdfEscape(line);
    content += "40 " + y.toFixed(2) + " Td (" + safe + ") Tj\n";
    content += "0 -" + leading + " Td\n";
    y -= leading;
    if(y < 60) break; // avoid overflow
  }
  content += "ET\n";

  const enc = (str)=> new TextEncoder().encode(str);

  const objects = [];
  const addObj = (n, body)=> { objects.push({n, body}); };

  // 1: Catalog
  addObj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  // 2: Pages
  addObj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  // 3: Page
  addObj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`);
  // 4: Font
  addObj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  // 5: Content stream
  const contentBytes = enc(content);
  addObj(5, "<< /Length " + contentBytes.length + " >>\nstream\n" + content + "endstream");

  // Build PDF with xref
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for(const obj of objects){
    offsets.push(pdf.length);
    pdf += `${obj.n} 0 obj\n${obj.body}\nendobj\n`;
  }

  const xrefPos = pdf.length;
  pdf += "xref\n0 " + (objects.length + 1) + "\n";
  pdf += "0000000000 65535 f \n";
  for(let i=1;i<offsets.length;i++){
    pdf += String(offsets[i]).padStart(10,"0") + " 00000 n \n";
  }
  pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\n";
  pdf += "startxref\n" + xrefPos + "\n%%EOF";

  return new Blob([enc(pdf)], {type:"application/pdf"});
}

function downloadInvoicePDF(state, invNumber){
  const inv = state.invoices.find(i=>i.number===invNumber);
  if(!inv) return toast("Facture introuvable");

  const pr = state.projects.find(p=>p.id===inv.projectId);
  const cl = state.clients.find(c=>c.id===pr?.clientId);

  const lines = [];
  lines.push("FACTURE");
  lines.push("Numéro: " + inv.number);
  lines.push("Date: " + new Date(inv.createdAt).toLocaleDateString("fr-FR"));
  lines.push("");
  lines.push("Client: " + (cl?.name || "—"));
  if(cl?.email) lines.push("Email: " + cl.email);
  if(cl?.phone) lines.push("Tél: " + cl.phone);
  lines.push("");
  lines.push("Projet: " + (pr?.title || "—"));
  lines.push("Type: " + projectTypeLabel(inv.projectType || pr?.projectType));
  if(pr?.location) lines.push("Lieu: " + pr.location);
  lines.push("");
  lines.push("Détails:");
  lines.push("------------------------------------------------------------");
  for(const l of (inv.lines||[])){
    lines.push(`${l.label} | ${l.qty} ${l.unit} | PU ${money(l.unitPrice)} DT | ${money(l.total)} DT`);
  }
  lines.push("------------------------------------------------------------");
  lines.push("Sous-total: " + money(inv.subtotal) + " DT");
  lines.push("TVA (" + Math.round(inv.tvaRate*100) + "%): " + money(inv.tax) + " DT");
  lines.push("TOTAL: " + money(inv.total) + " DT");
  lines.push("");
  lines.push("Modalités de paiement:");
  lines.push(paymentText(inv).replace(/<[^>]*>/g,""));
  lines.push("");
  lines.push("Généré par la Plateforme Facturation (Offline HTML).");

  const blob = buildSimplePdf(lines);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${inv.number}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 2000);
}




async function loadImageAsJpegBytes(src, maxW){
  // Load image (png/jpg) and convert to JPEG bytes (Uint8Array) for PDF embedding
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const scale = maxW ? Math.min(1, maxW/img.width) : 1;
      const w = Math.max(1, Math.round(img.width*scale));
      const h = Math.max(1, Math.round(img.height*scale));
      const canvas=document.createElement("canvas");
      canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext("2d");
      ctx.fillStyle="#fff";
      ctx.fillRect(0,0,w,h);
      ctx.drawImage(img,0,0,w,h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const b64 = dataUrl.split(",")[1];
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      resolve({bytes, w, h});
    };
    img.onerror=()=>reject(new Error("Image load failed: "+src));
    img.src=src;
  });
}

function jpegDims(bytes){
  // Parse JPEG SOF0/SOF2 for dimensions
  for(let i=0;i<bytes.length-9;i++){
    if(bytes[i]===0xFF){
      const marker = bytes[i+1];
      if(marker===0xC0 || marker===0xC2){
        const h = (bytes[i+5]<<8) + bytes[i+6];
        const w = (bytes[i+7]<<8) + bytes[i+8];
        return {w,h};
      }
      if(marker!==0xD8 && marker!==0xD9 && marker!==0x01 && (marker<0xD0 || marker>0xD7)){
        const len = (bytes[i+2]<<8) + bytes[i+3];
        i += 1 + len;
      }
    }
  }
  return {w:200,h:200};
}

function pdfEsc(s){
  return String(s ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function wrapText(text, maxChars){
  const words = String(text||"").split(/\s+/).filter(Boolean);
  const lines=[];
  let line="";
  for(const w of words){
    const test = (line ? (line+" "+w) : w);
    if(test.length <= maxChars){
      line = test;
    } else {
      if(line) lines.push(line);
      line = w;
    }
  }
  if(line) lines.push(line);
  return lines;
}

function concatBytes(chunks){
  let total=0;
  for(const c of chunks) total += c.length;
  const out=new Uint8Array(total);
  let off=0;
  for(const c of chunks){ out.set(c, off); off += c.length; }
  return out;
}
function strBytes(s){ return new TextEncoder().encode(s); }

function buildPdfPro(payload){
  const W=595.28, H=841.89; // A4 in points

  const objects=[]; // each is Uint8Array
  const offsets=[0]; // xref offsets, obj 0
  let pdfChunks=[strBytes("%PDF-1.4\n")];

  function addObject(bodyBytes){
    // bodyBytes is Uint8Array (already includes "obj...endobj"? we add wrapper here)
    objects.push(bodyBytes);
  }

  // Reserve object numbers
  const catalogN=1, pagesN=2, pageN=3, fontN=4, logoN=5, qrN=6, contentN=7;

  // Images objects
  function imageObject(objN, name, bytes){
    const dim = jpegDims(bytes);
    const head = strBytes(`${objN} 0 obj\n<< /Type /XObject /Subtype /Image /Name /${name} /Width ${dim.w} /Height ${dim.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
    const tail = strBytes("\nendstream\nendobj\n");
    return concatBytes([head, bytes, tail]);
  }

  const logoObj = imageObject(logoN, "ImLogo", payload.logoBytes);
  const qrObj = imageObject(qrN, "ImQR", payload.qrBytes);

  // Content stream construction (PDF operators)
  let c="";
  const text=(x,y,str,size=11)=>{ c += `BT /F1 ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfEsc(str)}) Tj ET\n`; };
  const line=(x1,y1,x2,y2,w=1)=>{ c += `${w} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`; };
  const rectStroke=(x,y,w,h,sw=1)=>{ c += `${sw} w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S\n`; };
  const rectFillGray=(x,y,w,h,g)=>{ c += `${g} g ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g\n`; };
  const img=(name,x,y,w,h)=>{ c += `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${name} Do Q\n`; };

  // Header
  rectFillGray(0, H-105, W, 105, 0.97);
  img("ImLogo", 40, H-95, 115, 60);
  text(170, H-55, "FACTURE", 22);
  line(40, H-110, W-40, H-110, 1);

  // Meta
  let metaY = H-55;
  for(const t of payload.titleLines){
    text(W-220, metaY, t, 10);
    metaY -= 14;
  }

  // Client/Projet boxes
  const boxY = H-250;
  const boxW = (W-100)/2;
  rectStroke(40, boxY, boxW, 110, 1);
  rectStroke(60+boxW, boxY, boxW, 110, 1);
  text(50, boxY+92, "Client", 12);
  text(70+boxW, boxY+92, "Projet", 12);

  let y1=boxY+72;
  for(const l of payload.clientLines){ text(50, y1, l, 10); y1-=14; }
  let y2=boxY+72;
  for(const l of payload.projectLines){ text(70+boxW, y2, l, 10); y2-=14; }

  // Table header
  let tableTop = boxY-25;
  rectFillGray(40, tableTop, W-80, 24, 0.92);
  rectStroke(40, tableTop, W-80, 24, 1);

  const cols = [
    {k:"Désignation", x:46},
    {k:"Qté", x:330},
    {k:"Unité", x:382},
    {k:"PU", x:442},
    {k:"Total", x:507},
  ];
  for(const col of cols) text(col.x, tableTop+8, col.k, 10);
  line(325, tableTop, 325, tableTop+24);
  line(375, tableTop, 375, tableTop+24);
  line(435, tableTop, 435, tableTop+24);
  line(500, tableTop, 500, tableTop+24);

  // Rows
  let rowY = tableTop-18;
  const rowH = 18;
  const maxRows = 18;
  const items = payload.items.slice(0, maxRows);
  for(const it of items){
    rectStroke(40, rowY-4, W-80, rowH, 0.5);
    const descLines = wrapText(it.desc, 48);
    text(46, rowY, (descLines[0]||""), 9);
    text(330, rowY, it.qty, 9);
    text(382, rowY, it.unit, 9);
    text(442, rowY, it.pu, 9);
    text(507, rowY, it.total, 9);
    rowY -= rowH;
  }

  // Totals
  const totalsY = rowY - 40;
  rectStroke(W-260, totalsY, 220, 70, 1);
  let ty = totalsY+50;
  for(const l of payload.totalsLines){
    text(W-250, ty, l, 10); ty -= 16;
  }

  // Payment + QR
  const payY = totalsY - 120;
  rectStroke(40, payY, W-80-170, 110, 1);
  text(50, payY+92, "Modalités de paiement", 12);
  let py = payY+72;
  for(const l of payload.paymentLines.slice(0,5)){
    text(50, py, l, 10); py -= 14;
  }
  rectStroke(W-170, payY, 130, 130, 1);
  img("ImQR", W-165, payY+5, 120, 120);
  text(W-170, payY-12, "QR (lien)", 9);

  // Footer
  text(40, 30, payload.footer || "—", 9);

  const contentStr = c;
  const contentBytes = strBytes(contentStr);
  const contentObj = concatBytes([
    strBytes(`${contentN} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`),
    contentBytes,
    strBytes("\nendstream\nendobj\n")
  ]);

  // Core objects
  const catalogObj = strBytes(`${catalogN} 0 obj\n<< /Type /Catalog /Pages ${pagesN} 0 R >>\nendobj\n`);
  const pagesObj = strBytes(`${pagesN} 0 obj\n<< /Type /Pages /Kids [${pageN} 0 R] /Count 1 >>\nendobj\n`);
  const pageObj = strBytes(`${pageN} 0 obj\n<< /Type /Page /Parent ${pagesN} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${fontN} 0 R >> /XObject << /ImLogo ${logoN} 0 R /ImQR ${qrN} 0 R >> >> /Contents ${contentN} 0 R >>\nendobj\n`);
  const fontObj = strBytes(`${fontN} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

  // Add in order 1..7
  const ordered = [catalogObj, pagesObj, pageObj, fontObj, logoObj, qrObj, contentObj];

  // Assemble with offsets
  let currentLen = pdfChunks.reduce((a,b)=>a+b.length,0);
  offsets.push(0); // placeholder for obj0 already
  const xrefOffsets=[0]; // index 0
  for(let i=0;i<ordered.length;i++){
    xrefOffsets.push(currentLen);
    pdfChunks.push(ordered[i]);
    currentLen += ordered[i].length;
  }

  const xrefPos = currentLen;
  let xref = `xref\n0 ${ordered.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<xrefOffsets.length;i++){
    xref += String(xrefOffsets[i]).padStart(10,"0") + " 00000 n \n";
  }
  xref += `trailer\n<< /Size ${ordered.length+1} /Root ${catalogN} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  pdfChunks.push(strBytes(xref));

  return new Blob([concatBytes(pdfChunks)], {type:"application/pdf"});
}

async function downloadInvoicePDF(state, invNumber){
  const inv = state.invoices.find(i=>i.number===invNumber);
  if(!inv) return toast("Facture introuvable");

  const pr = state.projects.find(p=>p.id===inv.projectId);
  const cl = state.clients.find(c=>c.id===pr?.clientId);

  // Build QR data (Lien + données)
  const link = `client.html#${encodeURIComponent(inv.number)}`;
  const data = JSON.stringify({number: inv.number, total: inv.total, tva: inv.tvaRate, projectType: inv.projectType || pr?.projectType});
  const qrText = link + "\n" + data;

  // Render QR to canvas (offline)
  if(!window.TinyQR) return toast("QR offline non chargé.");
  const canv = document.createElement("canvas");
  TinyQR.renderToCanvas(qrText, canv, 5, 3);
  const qrDataUrl = canv.toDataURL("image/jpeg", 0.92);
  const qrB64 = qrDataUrl.split(",")[1];
  const qrBin = atob(qrB64);
  const qrBytes = new Uint8Array(qrBin.length);
  for(let i=0;i<qrBin.length;i++) qrBytes[i]=qrBin.charCodeAt(i);

  // Logo bytes (local)
  let logo;
  try{
    logo = await loadImageAsJpegBytes("assets/logo_small.png", 260);
  }catch(e){
    // fallback to full logo
    logo = await loadImageAsJpegBytes("assets/logo.png", 260);
  }

  const titleLines = [
    `Numéro: ${inv.number}`,
    `Date: ${new Date(inv.createdAt).toLocaleDateString("fr-FR")}`,
    `TVA: ${Math.round(inv.tvaRate*100)}%`,
  ];

  const clientLines = [
    cl?.name || "—",
    cl?.email ? `Email: ${cl.email}` : "",
    cl?.phone ? `Tél: ${cl.phone}` : "",
  ].filter(Boolean);

  const projectLines = [
    pr?.title || "—",
    `Type: ${projectTypeLabel(inv.projectType || pr?.projectType)}`,
    pr?.location ? `Lieu: ${pr.location}` : "",
  ].filter(Boolean);

  const items = (inv.lines||[]).map(l=>({
    desc: l.label,
    qty: String(l.qty),
    unit: l.unit,
    pu: `${money(l.unitPrice)} DT`,
    total: `${money(l.total)} DT`,
  }));

  const totalsLines = [
    `Sous-total: ${money(inv.subtotal)} DT`,
    `TVA: ${money(inv.tax)} DT`,
    `TOTAL: ${money(inv.total)} DT`,
  ];

  const pay = paymentText(inv).replace(/<[^>]*>/g,"");
  const paymentLines = wrapText(pay, 70);

  const blob = buildPdfPro({
    titleLines,
    clientLines,
    projectLines,
    items,
    totalsLines,
    paymentLines,
    logoBytes: logo.bytes,
    qrBytes,
    footer: "THE TUNISIAN COUNCIL OF INTERIOR ARCHITECTS — GABES",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${inv.number}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 2000);
}





App.getCurrentEngineerId = function(){
  const email = (localStorage.getItem("engineerEmail") || "engineer@example.com").toLowerCase();
  return email;
};

App.ensureProfile = function(id){
  state.profiles = state.profiles || {};
  if(!state.profiles[id]){
    state.profiles[id] = {
      id,
      fullName: "Architecte d'intérieur",
      company: "Mon Studio",
      email: id,
      phone: "",
      office: "",
      city: "Gabès",
      socials: { instagram:"", facebook:"", linkedin:"", website:"" },
      logoDataUrl: "",
      portfolio: [],
      likes: 0,
      ratings: [],
      comments: [],
    };
    save('profiles', state.profiles);
  }
  return state.profiles[id];
};

App.profilePublicId = function(){
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  return id ? id.toLowerCase() : null;
};

App.calcAvg = function(arr){
  if(!arr || arr.length===0) return {avg:0,count:0};
  const sum = arr.reduce((s,r)=>s+Number(r.v||0),0);
  return {avg: sum/arr.length, count: arr.length};
};

App.profilePage = function(){
  const viewingId = App.profilePublicId();
  const myId = App.getCurrentEngineerId();
  const id = viewingId || myId;

  const prof = App.ensureProfile(id);

  const role = localStorage.getItem("role");
  const editCard = qs("#editCard");
  if(editCard){
    editCard.style.display = (!viewingId && role==="ENGINEER") ? "block" : "none";
  }

  qs("#pName").textContent = prof.fullName || "—";
  qs("#pCompany").textContent = prof.company || "—";
  const logo = qs("#pLogo");
  if(logo){
    logo.src = prof.logoDataUrl || "assets/logo_small.png";
  }

  const contact = [];
  if(prof.email) contact.push(prof.email);
  if(prof.phone) contact.push(prof.phone);
  qs("#pContact").textContent = contact.join(" • ") || "—";
  qs("#pLocation").textContent = [prof.office, prof.city].filter(Boolean).join(" — ") || "—";

  const soc = [];
  const addSoc = (label, url)=>{
    if(!url) return;
    soc.push(`<a class="btn" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`);
  };
  addSoc("Instagram", prof.socials?.instagram);
  addSoc("Facebook", prof.socials?.facebook);
  addSoc("LinkedIn", prof.socials?.linkedin);
  addSoc("Site", prof.socials?.website);
  qs("#pSocial").innerHTML = soc.length ? soc.join("") : `<span class="small muted">—</span>`;

  qs("#pLikes").textContent = String(prof.likes||0);
  const {avg,count} = App.calcAvg(prof.ratings);
  qs("#pAvg").textContent = avg ? avg.toFixed(1) + "/5" : "—";
  qs("#pCount").textContent = String(count);
  qs("#pStars").textContent = avg ? ("★★★★★".slice(0,Math.round(avg)) + "☆☆☆☆☆".slice(0,5-Math.round(avg))) : "☆☆☆☆☆";

  const btnLike = qs("#btnLike");
  if(btnLike){
    btnLike.onclick = ()=>{
      prof.likes = (prof.likes||0) + 1;
      save('profiles', state.profiles);
      qs("#pLikes").textContent = String(prof.likes);
      toast("Merci 👍");
    };
  }

  const btnRate = qs("#btnRate");
  if(btnRate){
    btnRate.onclick = ()=>{
      const v = Number(qs("#rateSel").value||5);
      const name = (qs("#visitorName").value||"").trim();
      prof.ratings = prof.ratings || [];
      prof.ratings.push({v, name, at: Date.now()});
      save('profiles', state.profiles);
      const res = App.calcAvg(prof.ratings);
      qs("#pAvg").textContent = res.avg.toFixed(1)+"/5";
      qs("#pCount").textContent = String(res.count);
      qs("#pStars").textContent = "★★★★★".slice(0,Math.round(res.avg)) + "☆☆☆☆☆".slice(0,5-Math.round(res.avg));
      toast("Note envoyée ✅");
    };
  }

  function renderComments(){
    const box = qs("#comments");
    const list = (prof.comments||[]).slice().reverse();
    box.innerHTML = list.length ? list.map(c=>`
      <div class="card" style="margin-top:10px"><div class="bd">
        <div class="row" style="justify-content:space-between;align-items:center">
          <div style="font-weight:800">${escapeHtml(c.name||"Anonyme")}</div>
          <div class="small muted">${new Date(c.at).toLocaleString("fr-FR")}</div>
        </div>
        <div style="margin-top:6px">${escapeHtml(c.text)}</div>
      </div></div>
    `).join("") : `<div class="small muted">Aucun commentaire.</div>`;
  }
  renderComments();

  const btnComment = qs("#btnComment");
  if(btnComment){
    btnComment.onclick = ()=>{
      const text = (qs("#cText").value||"").trim();
      if(!text) return toast("Écrire un commentaire.");
      const name = (qs("#cName").value||"").trim();
      prof.comments = prof.comments || [];
      prof.comments.push({text, name, at: Date.now()});
      save('profiles', state.profiles);
      qs("#cText").value="";
      qs("#cName").value="";
      renderComments();
      toast("Publié ✅");
    };
  }

  function renderPortfolio(){
    const box = qs("#portfolio");
    const items = (prof.portfolio||[]).slice().reverse();
    box.innerHTML = items.length ? items.map(it=>{
      const img = (it.images && it.images[0]) ? it.images[0] : "";
      return `
        <div class="pfcard">
          ${img ? `<img class="pfimg" src="${img}" alt="">` : `<div class="pfimg"></div>`}
          <div class="pfbd">
            <div class="pftitle">${escapeHtml(it.title)}</div>
            <div class="small muted pfmeta">${escapeHtml(it.cat||"")} • ${new Date(it.at).toLocaleDateString("fr-FR")}</div>
            <div style="margin-top:6px">${escapeHtml(it.desc||"")}</div>
            <div class="pfactions">
              ${viewingId ? "" : `<button class="btn" data-del="${escapeHtml(it.id)}" type="button">Supprimer</button>`}
            </div>
          </div>
        </div>
      `;
    }).join("") : `<div class="small muted">Aucune réalisation pour le moment.</div>`;

    if(!viewingId){
      box.querySelectorAll("[data-del]").forEach(b=>{
        b.addEventListener("click", ()=>{
          const pid = b.getAttribute("data-del");
          prof.portfolio = (prof.portfolio||[]).filter(x=>x.id!==pid);
          save('profiles', state.profiles);
          renderPortfolio();
          toast("Supprimé");
        });
      });
    }
  }
  renderPortfolio();

  if(!viewingId && role==="ENGINEER"){
    const f = qs("#profileForm");
    if(f){
      f.fullName.value = prof.fullName||"";
      f.company.value = prof.company||"";
      f.email.value = prof.email||"";
      f.phone.value = prof.phone||"";
      f.office.value = prof.office||"";
      f.city.value = prof.city||"";
      f.instagram.value = prof.socials?.instagram||"";
      f.facebook.value = prof.socials?.facebook||"";
      f.linkedin.value = prof.socials?.linkedin||"";
      f.website.value = prof.socials?.website||"";

      qs("#btnCancel").onclick = ()=> location.reload();

      f.addEventListener("submit", (e)=>{
        e.preventDefault();
        prof.fullName = f.fullName.value.trim();
        prof.company = f.company.value.trim();
        prof.email = f.email.value.trim();
        prof.phone = f.phone.value.trim();
        prof.office = f.office.value.trim();
        prof.city = f.city.value.trim();
        prof.socials = {
          instagram: f.instagram.value.trim(),
          facebook: f.facebook.value.trim(),
          linkedin: f.linkedin.value.trim(),
          website: f.website.value.trim(),
        };

        const newId = (prof.email||myId).toLowerCase();
        if(newId !== id){
          state.profiles[newId] = {...prof, id:newId};
          delete state.profiles[id];
          save('profiles', state.profiles);
          localStorage.setItem("engineerEmail", newId);
          location.href = "profile.html";
          return;
        }
        save('profiles', state.profiles);
        toast("Profil enregistré ✅");
        location.reload();
      });

      const logoFile = qs("#logoFile");
      if(logoFile){
        logoFile.onchange = ()=>{
          const file = logoFile.files && logoFile.files[0];
          if(!file) return;
          const reader = new FileReader();
          reader.onload = ()=>{
            prof.logoDataUrl = String(reader.result);
            save('profiles', state.profiles);
            toast("Logo mis à jour ✅");
            location.reload();
          };
          reader.readAsDataURL(file);
        };
      }
    }

    const pf = qs("#pfForm");
    if(pf){
      pf.addEventListener("submit", (e)=>{
        e.preventDefault();
        const title = pf.title.value.trim();
        if(!title) return toast("Titre requis");
        const cat = pf.cat.value;
        const desc = pf.desc.value.trim();
        const files = qs("#pfFiles").files;

        const readFile = (file)=> new Promise((res)=>{
          const r=new FileReader();
          r.onload=()=>res(String(r.result));
          r.readAsDataURL(file);
        });

        (async ()=>{
          const imgs=[];
          if(files && files.length){
            const max = Math.min(3, files.length);
            for(let i=0;i<max;i++) imgs.push(await readFile(files[i]));
          }
          prof.portfolio = prof.portfolio || [];
          const idd = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random());
          prof.portfolio.push({ id: idd, title, cat, desc, images: imgs, at: Date.now() });
          save('profiles', state.profiles);
          toast("Ajouté ✅");
          location.reload();
        })();
      });
    }
  }
};


document.addEventListener("DOMContentLoaded", route);


function getEffectiveBillingType(state, projectId, override){
  const pr = state.projects.find(p=>p.id===projectId);
  const base = pr?.projectType || 'RESIDENTIEL';
  if(!override || override==='AUTO') return base;
  return override;
}


const App = {};
