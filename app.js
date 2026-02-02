/* =========================
   Miller Management System (Offline)
   - multi-item truck memo
   - edit/delete
   - report filters + pdf (bank statement)
   - backup import/export
========================= */

const DB_KEY = "MM_DB_v3";
const UI_KEY = "MM_UI_v3";

const $ = (id) => document.getElementById(id);
const q = (sel, root=document) => root.querySelector(sel);
const qa = (sel, root=document) => [...root.querySelectorAll(sel)];

function uid(prefix="ID"){ return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`; }
function todayISO(){
  const d = new Date();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function fmt3(n){ return Number(n||0).toFixed(3); }
function safeText(s){ return (s ?? "").toString().trim(); }

function escapeHtml(s){
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeAttr(s){ return escapeHtml(s).replaceAll("\n"," "); }

function loadDB(){
  const raw = localStorage.getItem(DB_KEY);
  if(raw){ try { return JSON.parse(raw); } catch(_){} }
  const seed = { millers:[], clients:[], products:[], truckMemos:[] };
  localStorage.setItem(DB_KEY, JSON.stringify(seed));
  return seed;
}
function saveDB(db){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }

function loadUI(){
  const raw = localStorage.getItem(UI_KEY);
  if(raw){ try { return JSON.parse(raw); } catch(_){} }
  const seed = { theme:"dark", accentIndex:0 };
  localStorage.setItem(UI_KEY, JSON.stringify(seed));
  return seed;
}
function saveUI(ui){ localStorage.setItem(UI_KEY, JSON.stringify(ui)); }

let DB = loadDB();
let UI = loadUI();

let lastPreviewMemoId = null;   // memo selected for preview/print
let editingMemoId = null;       // memo selected for editing

/* =========================
   Theme
========================= */
const ACCENTS = ["#6ee7ff","#a78bfa","#34d399","#fb7185","#fbbf24","#60a5fa"];
function applyTheme(){
  document.documentElement.setAttribute("data-theme", UI.theme === "light" ? "light":"dark");
  document.documentElement.style.setProperty("--accent", ACCENTS[UI.accentIndex % ACCENTS.length]);
}
applyTheme();

$("btnTheme").onclick = () => { UI.theme = (UI.theme === "light" ? "dark":"light"); saveUI(UI); applyTheme(); };
$("btnAccent").onclick = () => { UI.accentIndex = (UI.accentIndex+1) % ACCENTS.length; saveUI(UI); applyTheme(); };

/* =========================
   Navigation
========================= */
const routes = {
  dashboard: { title:"Dashboard", sub:"Quick totals & recent documents" },
  millers:   { title:"Master • Millers", sub:"Miller list with logo & seal" },
  clients:   { title:"Master • Clients", sub:"Client list with address" },
  products:  { title:"Master • Products", sub:"Commodity / product list" },
  truckmemo: { title:"Truck Memo", sub:"Create or edit memo + preview/print" },
  reports:   { title:"Reports", sub:"Filter • Edit/Delete • Export • Backup • PDF" },
};

function go(route){
  qa(".navBtn").forEach(b => b.classList.toggle("active", b.dataset.route === route));
  qa(".page").forEach(p => p.classList.add("hidden"));
  $(`page-${route}`).classList.remove("hidden");
  $("pageTitle").textContent = routes[route]?.title || "Page";
  $("pageSub").textContent = routes[route]?.sub || "";

  if(route === "dashboard") renderDashboard();
  if(route === "millers")  renderMillers();
  if(route === "clients")  renderClients();
  if(route === "products") renderProducts();
  if(route === "truckmemo") prepareTruckForm();
  if(route === "reports")  prepareReports();
}
qa(".navBtn").forEach(b => b.onclick = () => go(b.dataset.route));

/* =========================
   Modal
========================= */
function openModal(title, bodyHTML){
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = bodyHTML;
  $("modal").classList.remove("hidden");
}
function closeModal(){ $("modal").classList.add("hidden"); $("modalBody").innerHTML=""; }
$("modalClose").onclick = closeModal;
$("modal").onclick = (e) => { if(e.target.id === "modal") closeModal(); };

/* =========================
   File -> Base64
========================= */
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* =========================
   Helpers
========================= */
function fillSelect(sel, arr, placeholder){
  sel.innerHTML = "";
  if(placeholder){
    const opt = document.createElement("option");
    opt.value=""; opt.textContent=placeholder;
    sel.appendChild(opt);
  }
  arr.forEach(x=>{
    const opt = document.createElement("option");
    opt.value = x.id;
    opt.textContent = x.name;
    sel.appendChild(opt);
  });
}

function refreshDropdowns(){
  fillSelect($("tmClient"), DB.clients, "Select Client");
  fillSelect($("tmMiller"), DB.millers, "Select Miller");

  fillSelect($("rMiller"), [{id:"", name:"All Millers"}, ...DB.millers], "");
  fillSelect($("rClient"), [{id:"", name:"All Clients"}, ...DB.clients], "");
  fillSelect($("rProduct"), [{id:"", name:"All Products"}, ...DB.products], "");
}

/* =========================
   Migration (if old data exists)
========================= */
function normalizeMemos(){
  let changed = false;
  DB.truckMemos = (DB.truckMemos || []).map(m=>{
    if(Array.isArray(m.items)) return m;
    // old single product memo format -> items
    if(m.productId){
      changed = true;
      return {
        ...m,
        items: [{
          id: uid("IT"),
          productId: m.productId,
          bags: Number(m.bags||0),
          netMts: Number(m.netMts||0),
          rateMode: m.rateMode || "BAG",
          rate: Number(m.rate||0),
          amount: Number(m.amount||0),
        }]
      };
    }
    changed = true;
    return { ...m, items: [] };
  });
  if(changed) saveDB(DB);
}

/* =========================
   Masters CRUD
========================= */
$("btnAddMiller").onclick = () => openMillerModal(null);
$("btnAddClient").onclick = () => openClientModal(null);
$("btnAddProduct").onclick = () => openProductModal(null);

function renderMillers(){
  const tb = q("#tblMillers tbody"); tb.innerHTML = "";
  DB.millers.forEach(m=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${escapeHtml(m.name)}</b></td>
      <td>${escapeHtml(m.mobile||"")}</td>
      <td>${escapeHtml(m.address||"").replace(/\n/g,"<br>")}</td>
      <td>${m.logo ? "Yes":"No"}</td>
      <td>${m.seal ? "Yes":"No"}</td>
      <td>
        <div class="row gap8">
          <button class="btn" data-act="edit">Edit</button>
          <button class="btn danger" data-act="del">Delete</button>
        </div>
      </td>
    `;
    q('[data-act="edit"]', tr).onclick = ()=> openMillerModal(m);
    q('[data-act="del"]', tr).onclick = ()=> deleteMiller(m.id);
    tb.appendChild(tr);
  });
  refreshDropdowns();
}

function renderClients(){
  const tb = q("#tblClients tbody"); tb.innerHTML = "";
  DB.clients.forEach(c=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${escapeHtml(c.name)}</b></td>
      <td>${escapeHtml(c.mobile||"")}</td>
      <td>${escapeHtml(c.address||"").replace(/\n/g,"<br>")}</td>
      <td>
        <div class="row gap8">
          <button class="btn" data-act="edit">Edit</button>
          <button class="btn danger" data-act="del">Delete</button>
        </div>
      </td>
    `;
    q('[data-act="edit"]', tr).onclick = ()=> openClientModal(c);
    q('[data-act="del"]', tr).onclick = ()=> deleteClient(c.id);
    tb.appendChild(tr);
  });
  refreshDropdowns();
}

function renderProducts(){
  const tb = q("#tblProducts tbody"); tb.innerHTML = "";
  DB.products.forEach(p=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${escapeHtml(p.name)}</b></td>
      <td>${escapeHtml(p.hsn||"")}</td>
      <td>
        <div class="row gap8">
          <button class="btn" data-act="edit">Edit</button>
          <button class="btn danger" data-act="del">Delete</button>
        </div>
      </td>
    `;
    q('[data-act="edit"]', tr).onclick = ()=> openProductModal(p);
    q('[data-act="del"]', tr).onclick = ()=> deleteProduct(p.id);
    tb.appendChild(tr);
  });
  refreshDropdowns();
}

/* Miller modal */
function openMillerModal(existing){
  const m = existing ? {...existing} : { id: uid("MIL"), name:"", mobile:"", address:"", logo:"", seal:"" };
  openModal(existing ? "Edit Miller" : "Add Miller", `
    <form id="fmMiller" class="form">
      <div class="grid2">
        <label class="field"><span>Miller Name</span><input id="mName" value="${escapeAttr(m.name)}" required></label>
        <label class="field"><span>Mobile</span><input id="mMobile" value="${escapeAttr(m.mobile||"")}"></label>
        <label class="field" style="grid-column:1/-1"><span>Address</span>
          <textarea id="mAddress" rows="3">${escapeHtml(m.address||"")}</textarea>
        </label>
        <label class="field"><span>Logo</span><input id="mLogo" type="file" accept="image/*"></label>
        <label class="field"><span>Seal</span><input id="mSeal" type="file" accept="image/*"></label>
        <div class="muted" style="grid-column:1/-1">Tip: If you don’t select a new file, old logo/seal stays.</div>
      </div>
      <div class="row gap8 mt12">
        <button class="btn primary" type="submit">Save</button>
        <button class="btn" type="button" id="mCancel">Cancel</button>
      </div>
    </form>
  `);
  $("mCancel").onclick = closeModal;

  q("#fmMiller").onsubmit = async (e)=>{
    e.preventDefault();
    m.name = safeText($("mName").value);
    if(!m.name){ alert("Miller name required"); return; }
    m.mobile = safeText($("mMobile").value);
    m.address = safeText($("mAddress").value);

    const lf = $("mLogo").files?.[0];
    const sf = $("mSeal").files?.[0];
    if(lf) m.logo = await fileToBase64(lf);
    if(sf) m.seal = await fileToBase64(sf);

    const idx = DB.millers.findIndex(x=>x.id===m.id);
    if(idx>=0) DB.millers[idx]=m; else DB.millers.unshift(m);

    saveDB(DB); closeModal(); renderMillers();
  };
}
function deleteMiller(id){
  if(!confirm("Delete this miller?")) return;
  DB.millers = DB.millers.filter(x=>x.id!==id);
  saveDB(DB); renderMillers();
}

/* Client modal */
function openClientModal(existing){
  const c = existing ? {...existing} : { id: uid("CLI"), name:"", mobile:"", address:"" };
  openModal(existing ? "Edit Client" : "Add Client", `
    <form id="fmClient" class="form">
      <div class="grid2">
        <label class="field"><span>Client Name</span><input id="cName" value="${escapeAttr(c.name)}" required></label>
        <label class="field"><span>Mobile</span><input id="cMobile" value="${escapeAttr(c.mobile||"")}"></label>
        <label class="field" style="grid-column:1/-1"><span>Address</span>
          <textarea id="cAddress" rows="3">${escapeHtml(c.address||"")}</textarea>
        </label>
      </div>
      <div class="row gap8 mt12">
        <button class="btn primary" type="submit">Save</button>
        <button class="btn" type="button" id="cCancel">Cancel</button>
      </div>
    </form>
  `);
  $("cCancel").onclick = closeModal;

  q("#fmClient").onsubmit = (e)=>{
    e.preventDefault();
    c.name = safeText($("cName").value);
    if(!c.name){ alert("Client name required"); return; }
    c.mobile = safeText($("cMobile").value);
    c.address = safeText($("cAddress").value);

    const idx = DB.clients.findIndex(x=>x.id===c.id);
    if(idx>=0) DB.clients[idx]=c; else DB.clients.unshift(c);

    saveDB(DB); closeModal(); renderClients();
  };
}
function deleteClient(id){
  if(!confirm("Delete this client?")) return;
  DB.clients = DB.clients.filter(x=>x.id!==id);
  saveDB(DB); renderClients();
}

/* Product modal */
function openProductModal(existing){
  const p = existing ? {...existing} : { id: uid("PRD"), name:"", hsn:"" };
  openModal(existing ? "Edit Product" : "Add Product", `
    <form id="fmProduct" class="form">
      <div class="grid2">
        <label class="field"><span>Commodity</span><input id="pName" value="${escapeAttr(p.name)}" required></label>
        <label class="field"><span>HSN (optional)</span><input id="pHSN" value="${escapeAttr(p.hsn||"")}"></label>
      </div>
      <div class="row gap8 mt12">
        <button class="btn primary" type="submit">Save</button>
        <button class="btn" type="button" id="pCancel">Cancel</button>
      </div>
    </form>
  `);
  $("pCancel").onclick = closeModal;

  q("#fmProduct").onsubmit = (e)=>{
    e.preventDefault();
    p.name = safeText($("pName").value);
    if(!p.name){ alert("Commodity required"); return; }
    p.hsn = safeText($("pHSN").value);

    const idx = DB.products.findIndex(x=>x.id===p.id);
    if(idx>=0) DB.products[idx]=p; else DB.products.unshift(p);

    saveDB(DB); closeModal(); renderProducts();
  };
}
function deleteProduct(id){
  if(!confirm("Delete this product?")) return;
  DB.products = DB.products.filter(x=>x.id!==id);
  saveDB(DB); renderProducts();
}

/* =========================
   Truck Memo Items Table (multi rows)
========================= */
$("btnAddItemRow").onclick = ()=> addItemRow();

function addItemRow(prefill=null){
  const tb = q("#tmItemsTable tbody");
  const tr = document.createElement("tr");
  tr.dataset.id = (prefill?.id || uid("IT"));

  tr.innerHTML = `
    <td class="rowNo"></td>
    <td><select class="itProduct"></select></td>
    <td><input class="itBags" type="number" min="0" step="1" value="${prefill?.bags ?? 0}"></td>
    <td><input class="itNet" type="number" min="0" step="0.001" value="${prefill?.netMts ?? 0}"></td>
    <td>
      <select class="itMode">
        <option value="BAG" ${prefill?.rateMode==="BAG" ? "selected":""}>BAG</option>
        <option value="MTS" ${prefill?.rateMode==="MTS" ? "selected":""}>MTS</option>
      </select>
    </td>
    <td><input class="itRate" type="number" min="0" step="0.01" value="${prefill?.rate ?? 0}"></td>
    <td><input class="itAmt" type="text" readonly value="${Number(prefill?.amount ?? 0).toFixed(2)}"></td>
    <td><button type="button" class="btn danger itRemove">X</button></td>
  `;

  const sel = q(".itProduct", tr);
  sel.innerHTML =
    `<option value="">Select</option>` +
    DB.products.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  sel.value = prefill?.productId || "";

  const recalc = ()=> recalcRow(tr);

  ["change","input"].forEach(ev=>{
    sel.addEventListener(ev, recalc);
    q(".itBags", tr).addEventListener(ev, recalc);
    q(".itNet", tr).addEventListener(ev, recalc);
    q(".itMode", tr).addEventListener(ev, recalc);
    q(".itRate", tr).addEventListener(ev, recalc);
  });

  q(".itRemove", tr).onclick = ()=>{
    tr.remove();
    renumberRows();
    recalcGrandTotal();
  };

  tb.appendChild(tr);
  renumberRows();
  recalcRow(tr);
}

function renumberRows(){
  qa("#tmItemsTable tbody tr").forEach((tr, idx)=>{
    q(".rowNo", tr).textContent = String(idx+1);
  });
}

function recalcRow(tr){
  const bags = Number(q(".itBags", tr).value || 0);
  const net  = Number(q(".itNet", tr).value || 0);
  const mode = q(".itMode", tr).value || "BAG";
  const rate = Number(q(".itRate", tr).value || 0);

  const amt = (mode==="BAG") ? (bags * rate) : (net * rate);
  q(".itAmt", tr).value = amt.toFixed(2);

  recalcGrandTotal();
}

function recalcGrandTotal(){
  const sum = qa("#tmItemsTable tbody tr").reduce((a,tr)=>{
    return a + Number(q(".itAmt", tr).value || 0);
  }, 0);
  $("tmGrandTotal").textContent = sum.toFixed(2);
}

function collectItemsFromUI(){
  const rows = qa("#tmItemsTable tbody tr");
  const items = rows.map(tr=>{
    return {
      id: tr.dataset.id,
      productId: q(".itProduct", tr).value,
      bags: Number(q(".itBags", tr).value || 0),
      netMts: Number(q(".itNet", tr).value || 0),
      rateMode: q(".itMode", tr).value || "BAG",
      rate: Number(q(".itRate", tr).value || 0),
      amount: Number(q(".itAmt", tr).value || 0)
    };
  }).filter(it => it.productId);
  return items;
}

function memoTotals(memo){
  const items = memo.items || [];
  const bags = items.reduce((a,it)=>a+Number(it.bags||0),0);
  const net  = items.reduce((a,it)=>a+Number(it.netMts||0),0);
  const amt  = items.reduce((a,it)=>a+Number(it.amount||0),0);
  return { bags, net, amt };
}

/* =========================
   Truck Memo Form
========================= */
function nextMemoNo(){
  const y = new Date().getFullYear();
  const list = DB.truckMemos.filter(x => (x.memoNo||"").startsWith(`TM-${y}-`));
  let max = 0;
  for(const x of list){
    const n = Number((x.memoNo||"").split("-")[2] || 0);
    if(n>max) max=n;
  }
  return `TM-${y}-${String(max+1).padStart(4,"0")}`;
}

function prepareTruckForm(){
  refreshDropdowns();
  if(!$("tmDate").value) $("tmDate").value = todayISO();

  // If coming from edit, do not wipe (edit loader handles)
  if(editingMemoId) return;

  // Reset items
  q("#tmItemsTable tbody").innerHTML = "";
  addItemRow();
  $("tmGrandTotal").textContent = "0.00";
  $("tmEditHint").textContent = "Creating new memo.";
  $("btnSaveMemo").textContent = "Save Truck Memo";
}

$("btnClearTruck").onclick = ()=>{
  editingMemoId = null;
  lastPreviewMemoId = null;
  q("#frmTruck").reset();
  $("tmDate").value = todayISO();
  q("#tmItemsTable tbody").innerHTML = "";
  addItemRow();
  $("tmGrandTotal").textContent = "0.00";
  $("tmEditHint").textContent = "Creating new memo.";
  $("btnSaveMemo").textContent = "Save Truck Memo";
  $("previewArea").innerHTML = `<div class="muted">Create or select a memo from Reports, then preview here.</div>`;
};

q("#frmTruck").onsubmit = (e)=>{
  e.preventDefault();

  if(DB.millers.length===0 || DB.clients.length===0 || DB.products.length===0){
    alert("Please create Master data first: Miller, Client, Product.");
    return;
  }

  const items = collectItemsFromUI();
  if(items.length === 0){
    alert("Add at least 1 product row.");
    return;
  }

  const memoBase = {
    date: $("tmDate").value,
    clientId: $("tmClient").value,
    millerId: $("tmMiller").value,
    vehicleNo: safeText($("tmVehicle").value),
    driverName: safeText($("tmDriver").value),
    mobile: safeText($("tmMobile").value),
    items,
    updatedAt: Date.now()
  };

  if(!memoBase.clientId || !memoBase.millerId){
    alert("Please select Client and Miller.");
    return;
  }

  if(editingMemoId){
    const idx = DB.truckMemos.findIndex(x=>x.id===editingMemoId);
    if(idx < 0){ alert("Memo not found."); return; }
    DB.truckMemos[idx] = { ...DB.truckMemos[idx], ...memoBase };
    saveDB(DB);
    alert("Truck Memo updated.");
    lastPreviewMemoId = editingMemoId;
  } else {
    const memo = {
      id: uid("TM"),
      memoNo: nextMemoNo(),
      createdAt: Date.now(),
      ...memoBase
    };
    DB.truckMemos.unshift(memo);
    saveDB(DB);
    alert(`Saved Truck Memo: ${memo.memoNo}`);
    lastPreviewMemoId = memo.id;
  }

  editingMemoId = null;
  $("tmEditHint").textContent = "Saved. You can preview/print now.";
  $("btnSaveMemo").textContent = "Save Truck Memo";

  renderDashboard();
  prepareReports();
};

/* =========================
   Preview / Print
========================= */
$("btnPreviewTruck").onclick = ()=>{
  const memo = getSelectedMemo();
  if(!memo){ alert("No memo found. Create one first."); return; }
  $("previewArea").innerHTML = renderTruckMemoHTML(memo);
  attachPrintButtons();
};

$("btnPreviewGate").onclick = ()=>{
  const memo = getSelectedMemo();
  if(!memo){ alert("No memo found. Create one first."); return; }
  $("previewArea").innerHTML = renderGatePassHTML(memo);
  attachPrintButtons();
};

function getSelectedMemo(){
  if(lastPreviewMemoId){
    const m = DB.truckMemos.find(x=>x.id===lastPreviewMemoId);
    if(m) return m;
  }
  return DB.truckMemos[0] || null;
}

function printDoc(type){
  const sheet = q(`.printSheet[data-doc="${type}"]`);
  if(!sheet){ alert("No preview to print."); return; }

  const w = window.open("", "_blank");
  if(!w){ alert("Popup blocked. Allow popups for printing."); return; }

  w.document.open();
  w.document.write(`
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Print</title>
      <link rel="stylesheet" href="./styles.css">
      <style>
        @page { margin: 0; }
        body{ margin:0; }
        .printSheet{ box-shadow:none !important; }
      </style>
    </head>
    <body>
      ${sheet.outerHTML}
      <script>window.onload=()=>window.print();<\/script>
    </body>
    </html>
  `);
  w.document.close();
}
function attachPrintButtons(){
  qa("[data-print]").forEach(btn=>{
    btn.onclick = ()=> printDoc(btn.dataset.print);
  });
}

/* Truck Memo A4 (NO rate/amount shown) */
function renderTruckMemoHTML(memo){
  const miller = DB.millers.find(x=>x.id===memo.millerId) || {};
  const client = DB.clients.find(x=>x.id===memo.clientId) || {};

  const logoHtml = miller.logo
    ? `<img class="tm-logo" src="${miller.logo}" alt="Logo">`
    : `<div class="tm-logo tm-logo-placeholder"></div>`;

  const millerName = escapeHtml((miller.name||"").toUpperCase());
  const millerAddr = escapeHtml(miller.address||"").replace(/\n/g,"<br>");

  const clientName = escapeHtml(client.name||"");
  const clientAddr = escapeHtml(client.address||"").replace(/\n/g,"<br>");

  const rows = (memo.items||[]).map((it, idx)=>{
    const prod = DB.products.find(p=>p.id===it.productId) || {};
    return `
      <tr>
        <td>${idx+1}</td>
        <td>${escapeHtml(prod.name||"")}</td>
        <td>${Number(it.bags||0)}</td>
        <td>${fmt3(it.netMts)}</td>
      </tr>
    `;
  }).join("");

  return `
  <div class="noPrint" style="display:flex;gap:8px;margin-bottom:10px">
    <button class="btn" data-print="tm">Print Truck Memo Only</button>
  </div>

  <div class="printSheet" data-doc="tm">
    <div class="tm-letterhead">
      <div class="tm-lh-left">${logoHtml}</div>
      <div class="tm-lh-center">
        <div class="tm-lh-name">${millerName}</div>
        <div class="tm-lh-addr">${millerAddr}</div>
      </div>
      <div class="tm-lh-right">
        <div class="tm-docTag">TRUCK MEMO</div>
        <div class="tm-sub">
          Memo No: <b>${escapeHtml(memo.memoNo)}</b><br>
          Date: <b>${escapeHtml(memo.date)}</b>
        </div>
      </div>
    </div>

    <div class="tm-parties">
      <div class="tm-box">
        <div class="tm-box-title">CLIENT DETAILS</div>
        <div><b>${clientName}</b></div>
        <div>${clientAddr}</div>
      </div>
      <div class="tm-box">
        <div class="tm-box-title">MILLER DETAILS</div>
        <div><b>${escapeHtml(miller.name||"")}</b></div>
        <div>${millerAddr}</div>
      </div>
    </div>

    <table class="tm-info-table">
      <tr>
        <td><b>Vehicle No</b></td><td>${escapeHtml(memo.vehicleNo)}</td>
        <td><b>Driver Name</b></td><td>${escapeHtml(memo.driverName)}</td>
      </tr>
      <tr>
        <td><b>Mobile No</b></td><td>${escapeHtml(memo.mobile)}</td>
        <td><b>Date</b></td><td>${escapeHtml(memo.date)}</td>
      </tr>
    </table>

    <table class="tm-item-table">
      <thead>
        <tr>
          <th>S.No</th>
          <th>Commodity</th>
          <th>No. of Bags</th>
          <th>Net MTS</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="4">No items</td></tr>`}
      </tbody>
    </table>

    <div class="tm-footer">
      <div class="tm-sign">Driver Signature</div>
      <div class="tm-seal">
        ${miller.seal ? `<img src="${miller.seal}" alt="Seal">` : ""}
        <div class="tm-auth">Authorized Signatory</div>
      </div>
    </div>
  </div>
  `;
}

/* Gate Pass A5 landscape (shows totals only, still no rate/amount) */
function renderGatePassHTML(memo){
  const miller = DB.millers.find(x=>x.id===memo.millerId) || {};
  const client = DB.clients.find(x=>x.id===memo.clientId) || {};
  const t = memoTotals(memo);

  const logoHtml = miller.logo
    ? `<img class="tm-logo" src="${miller.logo}" alt="Logo">`
    : `<div class="tm-logo tm-logo-placeholder"></div>`;

  const millerName = escapeHtml((miller.name||"").toUpperCase());
  const millerAddr = escapeHtml(miller.address||"").replace(/\n/g,"<br>");

  return `
  <div class="noPrint" style="display:flex;gap:8px;margin-bottom:10px">
    <button class="btn" data-print="gp">Print Gate Pass Only</button>
  </div>

  <div class="printSheet gpLandscape" data-doc="gp">
    <div class="tm-letterhead">
      <div class="tm-lh-left">${logoHtml}</div>
      <div class="tm-lh-center">
        <div class="tm-lh-name">${millerName}</div>
        <div class="tm-lh-addr">${millerAddr}</div>
      </div>
      <div class="tm-lh-right">
        <div class="tm-docTag">GATE PASS</div>
        <div class="tm-sub">
          Ref: <b>${escapeHtml(memo.memoNo)}</b><br>
          Date: <b>${escapeHtml(memo.date)}</b>
        </div>
      </div>
    </div>

    <table class="tm-info-table">
      <tr>
        <td><b>From (Miller)</b></td><td>${escapeHtml(miller.name||"")}</td>
        <td><b>To (Client)</b></td><td>${escapeHtml(client.name||"")}</td>
      </tr>
      <tr>
        <td><b>Vehicle</b></td><td>${escapeHtml(memo.vehicleNo)}</td>
        <td><b>Driver / Mobile</b></td><td>${escapeHtml(memo.driverName)} / ${escapeHtml(memo.mobile)}</td>
      </tr>
      <tr>
        <td><b>Total Bags</b></td><td>${t.bags}</td>
        <td><b>Total Net MTS</b></td><td>${fmt3(t.net)}</td>
      </tr>
    </table>

    <div class="tm-footer" style="margin-top:25mm">
      <div class="tm-sign">Security / Gate Incharge</div>
      <div class="tm-seal">
        ${miller.seal ? `<img src="${miller.seal}" alt="Seal">` : ""}
        <div class="tm-auth">Authorized Signatory</div>
      </div>
    </div>
  </div>
  `;
}

/* =========================
   Reports
========================= */
function prepareReports(){
  refreshDropdowns();
  renderReportsTable(filterDocs());
}

$("btnApplyFilter").onclick = ()=> renderReportsTable(filterDocs());
$("btnClearFilter").onclick = ()=>{
  $("rFrom").value=""; $("rTo").value="";
  $("rMiller").value=""; $("rClient").value="";
  $("rProduct").value=""; $("rRateMode").value="";
  $("rAmtMin").value=""; $("rAmtMax").value="";
  renderReportsTable(filterDocs());
};

function filterDocs(){
  const from = $("rFrom").value ? new Date($("rFrom").value).getTime() : null;
  const to   = $("rTo").value ? (new Date($("rTo").value).getTime() + 86400000 - 1) : null;

  const millerId = $("rMiller").value || "";
  const clientId = $("rClient").value || "";
  const productId = $("rProduct").value || "";
  const rateMode = $("rRateMode").value || "";

  const amtMin = $("rAmtMin").value ? Number($("rAmtMin").value) : null;
  const amtMax = $("rAmtMax").value ? Number($("rAmtMax").value) : null;

  return DB.truckMemos.filter(d=>{
    const t = new Date(d.date).getTime();
    if(from && t < from) return false;
    if(to && t > to) return false;
    if(millerId && d.millerId !== millerId) return false;
    if(clientId && d.clientId !== clientId) return false;

    const items = d.items || [];
    if(productId && !items.some(it => it.productId === productId)) return false;
    if(rateMode && !items.some(it => (it.rateMode||"") === rateMode)) return false;

    const totalAmt = items.reduce((a,it)=>a+Number(it.amount||0),0);
    if(amtMin !== null && totalAmt < amtMin) return false;
    if(amtMax !== null && totalAmt > amtMax) return false;

    return true;
  });
}

function renderReportsTable(list){
  const tb = q("#tblReports tbody");
  tb.innerHTML = "";

  list.forEach((m,i)=>{
    const miller = DB.millers.find(x=>x.id===m.millerId) || {};
    const client = DB.clients.find(x=>x.id===m.clientId) || {};
    const t = memoTotals(m);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i+1}</td>
      <td><b>${escapeHtml(m.memoNo)}</b></td>
      <td>${escapeHtml(m.date)}</td>
      <td>${escapeHtml(miller.name||"")}</td>
      <td>${escapeHtml(client.name||"")}</td>
      <td>${escapeHtml(m.vehicleNo||"")}</td>
      <td style="text-align:right">${t.bags}</td>
      <td style="text-align:right">${fmt3(t.net)}</td>
      <td style="text-align:right">${t.amt.toFixed(2)}</td>
      <td>
        <div class="row gap8">
          <button class="btn" data-act="tm">Truck</button>
          <button class="btn" data-act="gp">Gate</button>
          <button class="btn" data-act="edit">Edit</button>
          <button class="btn danger" data-act="del">Delete</button>
        </div>
      </td>
    `;

    q('[data-act="tm"]', tr).onclick = ()=>{
      lastPreviewMemoId = m.id;
      go("truckmemo");
      $("previewArea").innerHTML = renderTruckMemoHTML(m);
      attachPrintButtons();
    };

    q('[data-act="gp"]', tr).onclick = ()=>{
      lastPreviewMemoId = m.id;
      go("truckmemo");
      $("previewArea").innerHTML = renderGatePassHTML(m);
      attachPrintButtons();
    };

    q('[data-act="edit"]', tr).onclick = ()=> loadMemoForEdit(m.id);
    q('[data-act="del"]', tr).onclick = ()=> deleteTruckMemo(m.id);

    tb.appendChild(tr);
  });
}

function loadMemoForEdit(id){
  const memo = DB.truckMemos.find(x=>x.id===id);
  if(!memo){ alert("Memo not found"); return; }

  editingMemoId = id;
  lastPreviewMemoId = id;

  go("truckmemo");
  $("tmEditHint").textContent = `Editing: ${escapeHtml(memo.memoNo)} (Save will update)`;
  $("btnSaveMemo").textContent = "Update Truck Memo";

  $("tmDate").value = memo.date || todayISO();
  $("tmClient").value = memo.clientId || "";
  $("tmMiller").value = memo.millerId || "";
  $("tmVehicle").value = memo.vehicleNo || "";
  $("tmDriver").value = memo.driverName || "";
  $("tmMobile").value = memo.mobile || "";

  q("#tmItemsTable tbody").innerHTML = "";
  (memo.items || []).forEach(it => addItemRow(it));
  if((memo.items||[]).length === 0) addItemRow();
  recalcGrandTotal();

  $("previewArea").innerHTML = `<div class="muted">Editing memo. Click Preview to see printable format.</div>`;
}

function deleteTruckMemo(id){
  const memo = DB.truckMemos.find(x=>x.id===id);
  if(!memo) return;
  if(!confirm(`Delete Truck Memo ${memo.memoNo}?`)) return;

  DB.truckMemos = DB.truckMemos.filter(x=>x.id!==id);
  saveDB(DB);

  if(lastPreviewMemoId === id) lastPreviewMemoId = null;
  if(editingMemoId === id) editingMemoId = null;

  prepareReports();
  renderDashboard();
}

/* =========================
   CSV Export (Product-wise rows)
========================= */
function csvCell(v){
  const s = (v ?? "").toString();
  if(/[,"\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}

$("btnExportCSV").onclick = ()=>{
  const memos = filterDocs();
  const header = [
    "MemoNo","Date","Commodity","ClientName","MillerName",
    "VehicleNo","DriverName","Mobile",
    "Bags","NetMTS","RateMode","Rate","Amount"
  ];
  const lines = [header.join(",")];

  memos.forEach(m=>{
    const miller = DB.millers.find(x=>x.id===m.millerId) || {};
    const client = DB.clients.find(x=>x.id===m.clientId) || {};
    (m.items||[]).forEach(it=>{
      const prod = DB.products.find(x=>x.id===it.productId) || {};
      const row = [
        m.memoNo, m.date, prod.name||"",
        client.name||"", miller.name||"",
        m.vehicleNo, m.driverName, m.mobile,
        it.bags, it.netMts,
        it.rateMode, it.rate, it.amount
      ].map(csvCell);
      lines.push(row.join(","));
    });
  });

  const blob = new Blob([lines.join("\n")], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `TruckMemo_Report_${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
};

/* =========================
   Backup Export/Import
========================= */
function exportBackup(){
  const payload = { version: 1, exportedAt: new Date().toISOString(), db: DB };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `MillerManagement_Backup_${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
}

async function importBackupFile(file){
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    if(!data || !data.db) throw new Error("Invalid backup file");
    const newDB = data.db;
    if(!newDB.millers || !newDB.clients || !newDB.products || !newDB.truckMemos){
      throw new Error("Backup missing required fields");
    }
    DB = newDB;
    saveDB(DB);

    normalizeMemos();
    refreshDropdowns();
    renderDashboard();
    renderMillers();
    renderClients();
    renderProducts();
    prepareReports();

    alert("Backup imported successfully.");
  }catch(err){
    alert("Import failed: " + err.message);
  }
}

$("btnExportBackup").onclick = exportBackup;
$("btnImportBackup").onclick = ()=> $("inpImportBackup").click();
$("inpImportBackup").addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  await importBackupFile(file);
  e.target.value = "";
});

/* =========================
   Report PDF (Bank statement style)
   - Option: With or without rate/amount
========================= */
function buildReportStatementHTML(memos, includeRateAmt){
  const from = $("rFrom").value || "—";
  const to = $("rTo").value || "—";
  const millerId = $("rMiller").value || "";
  const clientId = $("rClient").value || "";
  const productId = $("rProduct").value || "";
  const rateMode = $("rRateMode").value || "";

  const millerName = millerId ? (DB.millers.find(x=>x.id===millerId)?.name || "") : "All";
  const clientName = clientId ? (DB.clients.find(x=>x.id===clientId)?.name || "") : "All";
  const productName = productId ? (DB.products.find(x=>x.id===productId)?.name || "") : "All";

  let rows = [];
  memos.forEach(m=>{
    const miller = DB.millers.find(x=>x.id===m.millerId) || {};
    const client = DB.clients.find(x=>x.id===m.clientId) || {};
    (m.items||[]).forEach(it=>{
      const prod = DB.products.find(x=>x.id===it.productId) || {};
      rows.push({
        memoNo: m.memoNo,
        date: m.date,
        commodity: prod.name || "",
        client: client.name || "",
        miller: miller.name || "",
        vehicle: m.vehicleNo || "",
        bags: Number(it.bags || 0),
        netMts: Number(it.netMts || 0),
        rateMode: it.rateMode || "",
        rate: Number(it.rate || 0),
        amount: Number(it.amount || 0),
      });
    });
  });

  const totalBags = rows.reduce((a,r)=>a+r.bags,0);
  const totalNet = rows.reduce((a,r)=>a+r.netMts,0);
  const totalAmt = rows.reduce((a,r)=>a+r.amount,0);

  const badge = includeRateAmt ? "WITH RATE & AMOUNT" : "WITHOUT RATE & AMOUNT";
  const headCols = includeRateAmt
    ? `<th>#</th><th>Date</th><th>Memo No</th><th>Commodity</th><th>Bags</th><th>Net MTS</th><th>Rate Mode</th><th>Rate</th><th>Amount</th><th>Vehicle</th><th>Client</th><th>Miller</th>`
    : `<th>#</th><th>Date</th><th>Memo No</th><th>Commodity</th><th>Bags</th><th>Net MTS</th><th>Vehicle</th><th>Client</th><th>Miller</th>`;

  const bodyRows = rows.map((r,i)=>{
    if(includeRateAmt){
      return `
        <tr>
          <td>${i+1}</td>
          <td>${escapeHtml(r.date)}</td>
          <td>${escapeHtml(r.memoNo)}</td>
          <td>${escapeHtml(r.commodity)}</td>
          <td style="text-align:right">${r.bags}</td>
          <td style="text-align:right">${fmt3(r.netMts)}</td>
          <td style="text-align:center">${escapeHtml(r.rateMode)}</td>
          <td style="text-align:right">${r.rate.toFixed(2)}</td>
          <td style="text-align:right">${r.amount.toFixed(2)}</td>
          <td>${escapeHtml(r.vehicle)}</td>
          <td>${escapeHtml(r.client)}</td>
          <td>${escapeHtml(r.miller)}</td>
        </tr>
      `;
    }
    return `
      <tr>
        <td>${i+1}</td>
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.memoNo)}</td>
        <td>${escapeHtml(r.commodity)}</td>
        <td style="text-align:right">${r.bags}</td>
        <td style="text-align:right">${fmt3(r.netMts)}</td>
        <td>${escapeHtml(r.vehicle)}</td>
        <td>${escapeHtml(r.client)}</td>
        <td>${escapeHtml(r.miller)}</td>
      </tr>
    `;
  }).join("");

  return `
  <div class="statementSheet">
    <div class="st-header">
      <div>
        <div class="st-title">REPORT STATEMENT</div>
        <div class="st-sub">
          Date Range: <b>${escapeHtml(from)}</b> to <b>${escapeHtml(to)}</b><br>
          Miller: <b>${escapeHtml(millerName)}</b> • Client: <b>${escapeHtml(clientName)}</b><br>
          Product: <b>${escapeHtml(productName)}</b> • Rate Mode: <b>${escapeHtml(rateMode || "All")}</b>
        </div>
      </div>
      <div class="st-meta">
        <span class="st-badge">${badge}</span><br>
        Generated: <b>${new Date().toLocaleString()}</b><br>
        Rows: <b>${rows.length}</b>
      </div>
    </div>

    <table class="st-table">
      <thead><tr>${headCols}</tr></thead>
      <tbody>
        ${bodyRows || `<tr><td colspan="12">No records found</td></tr>`}
      </tbody>
    </table>

    <div class="st-footer">
      <div class="st-summary">
        <h3>SUMMARY</h3>
        <div class="rowline"><span>Total Bags</span><b>${totalBags}</b></div>
        <div class="rowline"><span>Total Net MTS</span><b>${fmt3(totalNet)}</b></div>
        ${includeRateAmt ? `<div class="rowline"><span>Total Amount</span><b>${totalAmt.toFixed(2)}</b></div>` : ``}
      </div>

      <div style="width:40%;border:1px solid #111;padding:6mm">
        <div style="font-weight:900;letter-spacing:.6px;font-size:12px;margin-bottom:6mm">AUTHORIZATION</div>
        <div style="border-top:1px solid #111;padding-top:6mm;text-align:center;font-size:11px">Authorized Signatory</div>
      </div>
    </div>
  </div>
  `;
}

function printStatementAsPDF(html){
  const w = window.open("", "_blank");
  if(!w){ alert("Popup blocked. Allow popups for PDF."); return; }

  w.document.open();
  w.document.write(`
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Report PDF</title>
      <link rel="stylesheet" href="./styles.css">
      <style>
        @page { size: A4; margin: 8mm; }
        body{ margin:0; background:#fff; }
      </style>
    </head>
    <body>
      ${html}
      <script>window.onload=()=>window.print();<\/script>
    </body>
    </html>
  `);
  w.document.close();
}

$("btnReportPDF").onclick = ()=>{
  const includeRateAmt = $("rIncludeRateAmt").checked;
  const memos = filterDocs();
  const html = buildReportStatementHTML(memos, includeRateAmt);
  printStatementAsPDF(html);
};

/* =========================
   Dashboard
========================= */
function renderDashboard(){
  $("dashTruckCount").textContent = DB.truckMemos.length;
  $("dashGateCount").textContent = DB.truckMemos.length;

  let sumNet = 0;
  DB.truckMemos.forEach(m=>{
    sumNet += memoTotals(m).net;
  });
  $("dashNetMts").textContent = fmt3(sumNet);

  const tb = q("#dashRecentTable tbody");
  tb.innerHTML = "";
  DB.truckMemos.slice(0,8).forEach((m,i)=>{
    const miller = DB.millers.find(x=>x.id===m.millerId) || {};
    const client = DB.clients.find(x=>x.id===m.clientId) || {};
    const t = memoTotals(m);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i+1}</td>
      <td><b>${escapeHtml(m.memoNo)}</b></td>
      <td>${escapeHtml(m.date)}</td>
      <td>${escapeHtml(miller.name||"")}</td>
      <td>${escapeHtml(client.name||"")}</td>
      <td>${escapeHtml(m.vehicleNo||"")}</td>
      <td style="text-align:right">${t.bags}</td>
      <td style="text-align:right">${fmt3(t.net)}</td>
    `;
    tb.appendChild(tr);
  });
}

/* =========================
   Reset
========================= */
$("btnReset").onclick = ()=>{
  if(!confirm("Reset ALL data? This will delete Masters and Documents.")) return;
  localStorage.removeItem(DB_KEY);
  DB = loadDB();
  normalizeMemos();
  editingMemoId = null;
  lastPreviewMemoId = null;

  refreshDropdowns();
  renderDashboard();
  renderMillers();
  renderClients();
  renderProducts();
  prepareReports();

  $("previewArea").innerHTML = `<div class="muted">Create or select a memo from Reports, then preview here.</div>`;
  alert("Reset done.");
};

/* =========================
   Init
========================= */
function init(){
  normalizeMemos();
  refreshDropdowns();

  $("tmDate").value = todayISO();
  q("#tmItemsTable tbody").innerHTML = "";
  addItemRow();

  renderDashboard();
  go("dashboard");
}
init();
