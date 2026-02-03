/* =========================
   SUPABASE CONFIG
========================= */
const SUPABASE_URL = "https://fqvldojgmuwjaepnjziu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxdmxkb2pnbXV3amFlcG5qeml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMjM0MTYsImV4cCI6MjA4NTU5OTQxNn0.l9UL5l8y065oRWznBXYytZh3AR7PHR9Bfs6jibomELE";

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

/* =========================
   GLOBAL DB (IN MEMORY)
========================= */
let DB = {
  millers: [],
  clients: [],
  products: [],
  truckMemos: []
};

/* =========================
   DOM HELPERS
========================= */
const $ = (id) => document.getElementById(id);
const q = (sel) => document.querySelector(sel);
const qa = (sel) => Array.from(document.querySelectorAll(sel));

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function uid(prefix = "ID") {
  return (
    prefix +
    "_" +
    Date.now() +
    "_" +
    Math.random().toString(16).slice(2)
  );
}

/* =========================
   LOGIN OVERLAY UI
========================= */
function showLogin() {
  if ($("loginOverlay")) return;

  const div = document.createElement("div");
  div.id = "loginOverlay";
  div.style.cssText = `
    position:fixed; inset:0;
    background:rgba(0,0,0,.65);
    display:flex; align-items:center; justify-content:center;
    z-index:9999;
  `;

  div.innerHTML = `
    <div style="
      width:360px; max-width:92%;
      background:#111827; color:#fff;
      border-radius:14px; padding:20px;
      box-shadow:0 20px 50px rgba(0,0,0,.6)
    ">
      <h2 style="margin:0 0 8px">Miller Management</h2>
      <div style="font-size:12px; opacity:.8; margin-bottom:14px">
        Shared Office Login
      </div>

      <label>Email</label>
      <input id="loginEmail" type="email"
        style="width:100%; padding:10px; margin:6px 0 12px;
        border-radius:8px; border:1px solid #374151; background:#020617; color:#fff">

      <label>Password</label>
      <input id="loginPass" type="password"
        style="width:100%; padding:10px; margin:6px 0 14px;
        border-radius:8px; border:1px solid #374151; background:#020617; color:#fff">

      <button id="btnLogin" style="
        width:100%; padding:10px;
        border-radius:10px; border:0;
        font-weight:700; background:#2563eb; color:#fff;
        cursor:pointer
      ">LOGIN</button>

      <div id="loginMsg"
        style="margin-top:10px; font-size:12px; min-height:16px"></div>
    </div>
  `;

  document.body.appendChild(div);

  $("btnLogin").onclick = async () => {
    $("loginMsg").textContent = "Logging in...";
    try {
      const email = $("loginEmail").value.trim();
      const pass = $("loginPass").value;

      const { error } =
        await supabase.auth.signInWithPassword({
          email,
          password: pass
        });

      if (error) throw error;
    } catch (e) {
      $("loginMsg").textContent = e.message;
    }
  };
}

function hideLogin() {
  const el = $("loginOverlay");
  if (el) el.remove();
}

/* =========================
   AUTH STATE HANDLER
========================= */
async function waitForLogin() {
  showLogin();

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
      hideLogin();
      await loadAllFromSupabase();
      startApp();
    } else {
      showLogin();
    }
  });

  // immediate check
  const { data } = await supabase.auth.getUser();
  if (data?.user) {
    hideLogin();
    await loadAllFromSupabase();
    startApp();
  }
}

/* =========================
   SUPABASE LOADERS
========================= */
async function loadTable(name) {
  const { data, error } = await supabase
    .from(name)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function loadAllFromSupabase() {
  const [m, c, p, t] = await Promise.all([
    loadTable("millers"),
    loadTable("clients"),
    loadTable("products"),
    loadTable("truck_memos")
  ]);

  DB.millers = m;
  DB.clients = c;
  DB.products = p;
  DB.truckMemos = t;
}

/* =========================
   APP START
========================= */
function startApp() {
  console.log("✅ Logged in & data loaded");
  if ($("tmDate")) $("tmDate").value = todayISO();
}
/* =========================================================
   PART 2/4 – Masters CRUD (Miller / Client / Product)
   ========================================================= */

/* =========================
   SIMPLE TOAST / ALERT
========================= */
function toast(msg) {
  alert(msg);
}

/* =========================
   SUPABASE WRITE HELPERS
========================= */
async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

async function upsertRow(table, row) {
  const { error } = await supabase.from(table).upsert(row, { onConflict: "id" });
  if (error) throw error;
}

async function deleteRow(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

/* =========================
   RENDER MASTER TABLES
   (Requires your HTML tables to exist:
    #tblMillers, #tblClients, #tblProducts)
========================= */
function renderMillers() {
  const tbl = $("tblMillers");
  if (!tbl) return;

  const tbody = tbl.querySelector("tbody");
  tbody.innerHTML = "";

  DB.millers.forEach((m) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(m.name || "")}</td>
      <td>${escapeHtml(m.mobile || "")}</td>
      <td>${escapeHtml(m.address || "")}</td>
      <td style="text-align:center; white-space:nowrap;">
        <button data-edit="${m.id}">Edit</button>
        <button data-del="${m.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.onclick = () => openMillerEdit(btn.getAttribute("data-edit"));
  });
  tbody.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.onclick = () => removeMiller(btn.getAttribute("data-del"));
  });
}

function renderClients() {
  const tbl = $("tblClients");
  if (!tbl) return;

  const tbody = tbl.querySelector("tbody");
  tbody.innerHTML = "";

  DB.clients.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(c.name || "")}</td>
      <td>${escapeHtml(c.mobile || "")}</td>
      <td>${escapeHtml(c.address || "")}</td>
      <td style="text-align:center; white-space:nowrap;">
        <button data-edit="${c.id}">Edit</button>
        <button data-del="${c.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.onclick = () => openClientEdit(btn.getAttribute("data-edit"));
  });
  tbody.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.onclick = () => removeClient(btn.getAttribute("data-del"));
  });
}

function renderProducts() {
  const tbl = $("tblProducts");
  if (!tbl) return;

  const tbody = tbl.querySelector("tbody");
  tbody.innerHTML = "";

  DB.products.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.name || "")}</td>
      <td>${escapeHtml(p.hsn || "")}</td>
      <td style="text-align:center; white-space:nowrap;">
        <button data-edit="${p.id}">Edit</button>
        <button data-del="${p.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.onclick = () => openProductEdit(btn.getAttribute("data-edit"));
  });
  tbody.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.onclick = () => removeProduct(btn.getAttribute("data-del"));
  });
}

/* =========================
   ESCAPE HTML (security)
========================= */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   MILLER CRUD
   (HTML inputs expected:
    #millerName #millerMobile #millerAddress
    buttons: #btnSaveMiller #btnClearMiller
========================= */
let editMillerId = null;

function bindMillerEvents() {
  if ($("btnSaveMiller")) $("btnSaveMiller").onclick = saveMiller;
  if ($("btnClearMiller")) $("btnClearMiller").onclick = clearMillerForm;
}

function clearMillerForm() {
  editMillerId = null;
  if ($("millerName")) $("millerName").value = "";
  if ($("millerMobile")) $("millerMobile").value = "";
  if ($("millerAddress")) $("millerAddress").value = "";
}

function openMillerEdit(id) {
  const m = DB.millers.find((x) => x.id === id);
  if (!m) return;

  editMillerId = id;
  if ($("millerName")) $("millerName").value = m.name || "";
  if ($("millerMobile")) $("millerMobile").value = m.mobile || "";
  if ($("millerAddress")) $("millerAddress").value = m.address || "";
}

async function saveMiller() {
  try {
    const user = await currentUser();
    if (!user) return toast("Login required");

    const name = ($("millerName")?.value || "").trim();
    const mobile = ($("millerMobile")?.value || "").trim();
    const address = ($("millerAddress")?.value || "").trim();

    if (!name) return toast("Enter Miller Name");

    const row = {
      id: editMillerId || uid("MIL"),
      user_id: user.id,
      name,
      mobile: mobile || null,
      address: address || null,
      updated_at: new Date().toISOString()
    };

    await upsertRow("millers", row);

    // update local cache
    const ix = DB.millers.findIndex((x) => x.id === row.id);
    if (ix >= 0) DB.millers[ix] = { ...DB.millers[ix], ...row };
    else DB.millers.unshift(row);

    renderMillers();
    refreshDropdowns();
    clearMillerForm();
    toast("Miller saved");
  } catch (e) {
    toast(e.message || String(e));
  }
}

async function removeMiller(id) {
  if (!confirm("Delete this Miller?")) return;
  try {
    await deleteRow("millers", id);
    DB.millers = DB.millers.filter((x) => x.id !== id);
    renderMillers();
    refreshDropdowns();
    toast("Miller deleted");
  } catch (e) {
    toast(e.message || String(e));
  }
}

/* =========================
   CLIENT CRUD
   (HTML inputs expected:
    #clientName #clientMobile #clientAddress
    buttons: #btnSaveClient #btnClearClient
========================= */
let editClientId = null;

function bindClientEvents() {
  if ($("btnSaveClient")) $("btnSaveClient").onclick = saveClient;
  if ($("btnClearClient")) $("btnClearClient").onclick = clearClientForm;
}

function clearClientForm() {
  editClientId = null;
  if ($("clientName")) $("clientName").value = "";
  if ($("clientMobile")) $("clientMobile").value = "";
  if ($("clientAddress")) $("clientAddress").value = "";
}

function openClientEdit(id) {
  const c = DB.clients.find((x) => x.id === id);
  if (!c) return;

  editClientId = id;
  if ($("clientName")) $("clientName").value = c.name || "";
  if ($("clientMobile")) $("clientMobile").value = c.mobile || "";
  if ($("clientAddress")) $("clientAddress").value = c.address || "";
}

async function saveClient() {
  try {
    const user = await currentUser();
    if (!user) return toast("Login required");

    const name = ($("clientName")?.value || "").trim();
    const mobile = ($("clientMobile")?.value || "").trim();
    const address = ($("clientAddress")?.value || "").trim();

    if (!name) return toast("Enter Client Name");

    const row = {
      id: editClientId || uid("CLI"),
      user_id: user.id,
      name,
      mobile: mobile || null,
      address: address || null,
      updated_at: new Date().toISOString()
    };

    await upsertRow("clients", row);

    const ix = DB.clients.findIndex((x) => x.id === row.id);
    if (ix >= 0) DB.clients[ix] = { ...DB.clients[ix], ...row };
    else DB.clients.unshift(row);

    renderClients();
    refreshDropdowns();
    clearClientForm();
    toast("Client saved");
  } catch (e) {
    toast(e.message || String(e));
  }
}

async function removeClient(id) {
  if (!confirm("Delete this Client?")) return;
  try {
    await deleteRow("clients", id);
    DB.clients = DB.clients.filter((x) => x.id !== id);
    renderClients();
    refreshDropdowns();
    toast("Client deleted");
  } catch (e) {
    toast(e.message || String(e));
  }
}

/* =========================
   PRODUCT CRUD
   (HTML inputs expected:
    #prodName #prodHSN
    buttons: #btnSaveProduct #btnClearProduct
========================= */
let editProductId = null;

function bindProductEvents() {
  if ($("btnSaveProduct")) $("btnSaveProduct").onclick = saveProduct;
  if ($("btnClearProduct")) $("btnClearProduct").onclick = clearProductForm;
}

function clearProductForm() {
  editProductId = null;
  if ($("prodName")) $("prodName").value = "";
  if ($("prodHSN")) $("prodHSN").value = "";
}

function openProductEdit(id) {
  const p = DB.products.find((x) => x.id === id);
  if (!p) return;

  editProductId = id;
  if ($("prodName")) $("prodName").value = p.name || "";
  if ($("prodHSN")) $("prodHSN").value = p.hsn || "";
}

async function saveProduct() {
  try {
    const user = await currentUser();
    if (!user) return toast("Login required");

    const name = ($("prodName")?.value || "").trim();
    const hsn = ($("prodHSN")?.value || "").trim();

    if (!name) return toast("Enter Product/Commodity Name");

    const row = {
      id: editProductId || uid("PRD"),
      user_id: user.id,
      name,
      hsn: hsn || null,
      updated_at: new Date().toISOString()
    };

    await upsertRow("products", row);

    const ix = DB.products.findIndex((x) => x.id === row.id);
    if (ix >= 0) DB.products[ix] = { ...DB.products[ix], ...row };
    else DB.products.unshift(row);

    renderProducts();
    refreshDropdowns();
    clearProductForm();
    toast("Product saved");
  } catch (e) {
    toast(e.message || String(e));
  }
}

async function removeProduct(id) {
  if (!confirm("Delete this Product?")) return;
  try {
    await deleteRow("products", id);
    DB.products = DB.products.filter((x) => x.id !== id);
    renderProducts();
    refreshDropdowns();
    toast("Product deleted");
  } catch (e) {
    toast(e.message || String(e));
  }
}

/* =========================
   DROPDOWN REFRESH
   (Used by Truck Memo page)
   Expected selects:
   #tmMiller, #tmClient
========================= */
function refreshDropdowns() {
  const millerSel = $("tmMiller");
  if (millerSel) {
    millerSel.innerHTML = `<option value="">Select Miller</option>`;
    DB.millers
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.name;
        millerSel.appendChild(opt);
      });
  }

  const clientSel = $("tmClient");
  if (clientSel) {
    clientSel.innerHTML = `<option value="">Select Client</option>`;
    DB.clients
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name;
        clientSel.appendChild(opt);
      });
  }
}

/* =========================
   START APP - EXTEND
========================= */
const _startAppOld = startApp;
startApp = function () {
  _startAppOld();

  // bind master buttons
  bindMillerEvents();
  bindClientEvents();
  bindProductEvents();

  // render master lists
  renderMillers();
  renderClients();
  renderProducts();

  refreshDropdowns();
};
/* =========================================================
   PART 3/4 – Truck Memo + Gate Pass + Save/Edit/Delete
   ========================================================= */

/* =========================
   TRUCK MEMO UI EXPECTED IDs
   Inputs:
   #tmDate #tmMemoNo #tmMiller #tmClient #tmVehicle #tmDriver #tmMobile
   Table:
   #tmItemsTable (tbody) with columns:
     Product(select) | Bags | NetMTS | RateMode(select) | Rate | Amount | Action
   Buttons:
   #btnAddItemRow #btnSaveTruckMemo #btnClearTruckMemo
   Memo list table:
   #tblTruckMemos (tbody)
========================= */

let editMemoId = null;

function bindTruckMemoEvents() {
  if ($("btnAddItemRow")) $("btnAddItemRow").onclick = addItemRow;
  if ($("btnSaveTruckMemo")) $("btnSaveTruckMemo").onclick = saveTruckMemo;
  if ($("btnClearTruckMemo")) $("btnClearTruckMemo").onclick = clearTruckMemoForm;

  // If you have a memo list render button, ignore.
}

function getProductOptionsHTML(selectedId = "") {
  const opts = DB.products
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .map((p) => {
      const sel = p.id === selectedId ? "selected" : "";
      return `<option value="${p.id}" ${sel}>${escapeHtml(p.name)}</option>`;
    })
    .join("");
  return `<option value="">Select</option>${opts}`;
}

function addItemRow(prefill = null) {
  const table = $("tmItemsTable");
  if (!table) return;

  const tbody = table.querySelector("tbody") || table;
  const rowId = uid("ROW");

  const productId = prefill?.productId || "";
  const bags = prefill?.bags ?? "";
  const netMts = prefill?.netMts ?? "";
  const rateMode = prefill?.rateMode || "BAG"; // BAG or MTS
  const rate = prefill?.rate ?? "";
  const amount = prefill?.amount ?? "";

  const tr = document.createElement("tr");
  tr.setAttribute("data-rowid", rowId);

  tr.innerHTML = `
    <td>
      <select class="itmProduct" style="width:100%">${getProductOptionsHTML(productId)}</select>
    </td>
    <td><input class="itmBags" type="number" min="0" step="1" value="${bags}" style="width:100%"></td>
    <td><input class="itmMts" type="number" min="0" step="0.001" value="${netMts}" style="width:100%"></td>
    <td>
      <select class="itmMode" style="width:100%">
        <option value="BAG" ${rateMode === "BAG" ? "selected" : ""}>Per Bag</option>
        <option value="MTS" ${rateMode === "MTS" ? "selected" : ""}>Per MTS</option>
      </select>
    </td>
    <td><input class="itmRate" type="number" min="0" step="0.01" value="${rate}" style="width:100%"></td>
    <td><input class="itmAmt" type="number" min="0" step="0.01" value="${amount}" style="width:100%" readonly></td>
    <td style="text-align:center">
      <button class="itmDel">X</button>
    </td>
  `;

  tbody.appendChild(tr);

  // bind calc events
  const recalc = () => recalcRow(tr);
  tr.querySelector(".itmBags").addEventListener("input", recalc);
  tr.querySelector(".itmMts").addEventListener("input", recalc);
  tr.querySelector(".itmMode").addEventListener("change", recalc);
  tr.querySelector(".itmRate").addEventListener("input", recalc);

  tr.querySelector(".itmDel").onclick = () => {
    tr.remove();
    recalcTotals();
  };

  recalcRow(tr);
}

function recalcRow(tr) {
  const bags = parseFloat(tr.querySelector(".itmBags").value || "0") || 0;
  const mts = parseFloat(tr.querySelector(".itmMts").value || "0") || 0;
  const mode = tr.querySelector(".itmMode").value;
  const rate = parseFloat(tr.querySelector(".itmRate").value || "0") || 0;

  const qty = mode === "BAG" ? bags : mts;
  const amt = qty * rate;

  tr.querySelector(".itmAmt").value = amt ? amt.toFixed(2) : "0.00";
  recalcTotals();
}

function recalcTotals() {
  let totalBags = 0;
  let totalMts = 0;
  let totalAmt = 0;

  const table = $("tmItemsTable");
  if (!table) return;

  const tbody = table.querySelector("tbody") || table;
  const rows = Array.from(tbody.querySelectorAll("tr"));

  rows.forEach((tr) => {
    totalBags += parseFloat(tr.querySelector(".itmBags").value || "0") || 0;
    totalMts += parseFloat(tr.querySelector(".itmMts").value || "0") || 0;
    totalAmt += parseFloat(tr.querySelector(".itmAmt").value || "0") || 0;
  });

  if ($("tmTotalBags")) $("tmTotalBags").textContent = totalBags.toFixed(0);
  if ($("tmTotalMts")) $("tmTotalMts").textContent = totalMts.toFixed(3);
  if ($("tmTotalAmt")) $("tmTotalAmt").textContent = totalAmt.toFixed(2);
}

function getItemsFromUI() {
  const table = $("tmItemsTable");
  const tbody = table.querySelector("tbody") || table;
  const rows = Array.from(tbody.querySelectorAll("tr"));

  const items = rows
    .map((tr) => {
      const productId = tr.querySelector(".itmProduct").value;
      const bags = parseFloat(tr.querySelector(".itmBags").value || "0") || 0;
      const netMts = parseFloat(tr.querySelector(".itmMts").value || "0") || 0;
      const rateMode = tr.querySelector(".itmMode").value;
      const rate = parseFloat(tr.querySelector(".itmRate").value || "0") || 0;
      const amount = parseFloat(tr.querySelector(".itmAmt").value || "0") || 0;

      if (!productId) return null;
      return { productId, bags, netMts, rateMode, rate, amount };
    })
    .filter(Boolean);

  return items;
}

function clearTruckMemoForm() {
  editMemoId = null;
  if ($("tmDate")) $("tmDate").value = todayISO();
  if ($("tmMemoNo")) $("tmMemoNo").value = "";
  if ($("tmMiller")) $("tmMiller").value = "";
  if ($("tmClient")) $("tmClient").value = "";
  if ($("tmVehicle")) $("tmVehicle").value = "";
  if ($("tmDriver")) $("tmDriver").value = "";
  if ($("tmMobile")) $("tmMobile").value = "";

  // clear table rows
  const table = $("tmItemsTable");
  if (table) {
    const tbody = table.querySelector("tbody") || table;
    tbody.innerHTML = "";
  }
  addItemRow();
  recalcTotals();
}

async function saveTruckMemo() {
  try {
    const user = await currentUser();
    if (!user) return toast("Login required");

    const memoNo = ($("tmMemoNo")?.value || "").trim();
    const memoDate = ($("tmDate")?.value || "").trim();
    const millerId = ($("tmMiller")?.value || "").trim();
    const clientId = ($("tmClient")?.value || "").trim();

    if (!memoDate) return toast("Select date");
    if (!millerId) return toast("Select miller");
    if (!clientId) return toast("Select client");
    if (!memoNo) return toast("Enter Truck Memo No");

    const vehicleNo = ($("tmVehicle")?.value || "").trim();
    const driverName = ($("tmDriver")?.value || "").trim();
    const mobile = ($("tmMobile")?.value || "").trim();

    const items = getItemsFromUI();
    if (items.length === 0) return toast("Add at least one product row");

    const row = {
      id: editMemoId || uid("TM"),
      user_id: user.id,
      memo_no: memoNo,
      memo_date: memoDate,
      miller_id: millerId,
      client_id: clientId,
      vehicle_no: vehicleNo || null,
      driver_name: driverName || null,
      mobile: mobile || null,
      items: items,
      updated_at: new Date().toISOString()
    };

    await upsertRow("truck_memos", row);

    const ix = DB.truckMemos.findIndex((x) => x.id === row.id);
    if (ix >= 0) DB.truckMemos[ix] = { ...DB.truckMemos[ix], ...row };
    else DB.truckMemos.unshift(row);

    renderTruckMemos();
    clearTruckMemoForm();
    toast("Truck Memo saved");
  } catch (e) {
    toast(e.message || String(e));
  }
}

async function deleteTruckMemo(id) {
  if (!confirm("Delete this Truck Memo?")) return;
  try {
    await deleteRow("truck_memos", id);
    DB.truckMemos = DB.truckMemos.filter((x) => x.id !== id);
    renderTruckMemos();
    toast("Truck Memo deleted");
  } catch (e) {
    toast(e.message || String(e));
  }
}

function openTruckMemoEdit(id) {
  const m = DB.truckMemos.find((x) => x.id === id);
  if (!m) return;

  editMemoId = id;
  if ($("tmMemoNo")) $("tmMemoNo").value = m.memo_no || "";
  if ($("tmDate")) $("tmDate").value = m.memo_date || todayISO();
  if ($("tmMiller")) $("tmMiller").value = m.miller_id || "";
  if ($("tmClient")) $("tmClient").value = m.client_id || "";
  if ($("tmVehicle")) $("tmVehicle").value = m.vehicle_no || "";
  if ($("tmDriver")) $("tmDriver").value = m.driver_name || "";
  if ($("tmMobile")) $("tmMobile").value = m.mobile || "";

  // fill items
  const table = $("tmItemsTable");
  if (table) {
    const tbody = table.querySelector("tbody") || table;
    tbody.innerHTML = "";
    (m.items || []).forEach((it) => addItemRow(it));
  }
  recalcTotals();
}

function renderTruckMemos() {
  const tbl = $("tblTruckMemos");
  if (!tbl) return;

  const tbody = tbl.querySelector("tbody");
  tbody.innerHTML = "";

  DB.truckMemos.forEach((m) => {
    const miller = DB.millers.find((x) => x.id === m.miller_id);
    const client = DB.clients.find((x) => x.id === m.client_id);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(m.memo_no || "")}</td>
      <td>${escapeHtml(m.memo_date || "")}</td>
      <td>${escapeHtml(miller?.name || "")}</td>
      <td>${escapeHtml(client?.name || "")}</td>
      <td style="text-align:center; white-space:nowrap;">
        <button data-edit="${m.id}">Edit</button>
        <button data-print="${m.id}">Print</button>
        <button data-gate="${m.id}">Gate Pass</button>
        <button data-del="${m.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button[data-edit]").forEach((b) => {
    b.onclick = () => openTruckMemoEdit(b.getAttribute("data-edit"));
  });
  tbody.querySelectorAll("button[data-del]").forEach((b) => {
    b.onclick = () => deleteTruckMemo(b.getAttribute("data-del"));
  });
  tbody.querySelectorAll("button[data-print]").forEach((b) => {
    b.onclick = () => printTruckMemoOnly(b.getAttribute("data-print"));
  });
  tbody.querySelectorAll("button[data-gate]").forEach((b) => {
    b.onclick = () => printGatePassOnly(b.getAttribute("data-gate"));
  });
}

/* =========================
   PRINT ONLY A SECTION (NOT FULL PAGE)
========================= */
function openPrintWindow(html, title = "Print") {
  const w = window.open("", "_blank", "width=980,height=720");
  w.document.open();
  w.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body{font-family:Arial, sans-serif; margin:0; padding:0;}
          @page{ margin:12mm; }
          .a4{ width:210mm; min-height:297mm; padding:12mm; box-sizing:border-box; }
          .land45{ width:297mm; min-height:210mm; padding:10mm; box-sizing:border-box; }
          table{ width:100%; border-collapse:collapse; }
          th,td{ border:1px solid #111; padding:6px; font-size:12px; }
          th{ background:#f3f4f6; }
          .row{display:flex; gap:10px;}
          .col{flex:1;}
          .right{text-align:right;}
          .center{text-align:center;}
          .muted{color:#444;}
          .no-border, .no-border td, .no-border th { border:0 !important; }
          .head{display:flex; align-items:center; justify-content:space-between; gap:10px;}
          .sealbox{height:90px; width:130px; border:2px solid #111; display:flex; align-items:center; justify-content:center;}
          .signbox{height:70px; border-top:1px solid #111; padding-top:8px;}
        </style>
      </head>
      <body>
        ${html}
        <script>
          window.onload = () => { window.print(); };
        </script>
      </body>
    </html>
  `);
  w.document.close();
}

/* =========================
   TRUCK MEMO PRINT (A4)
   Requirements:
   - Client left, Miller right
   - Products table shows commodity + bags + mts (no rate/amount)
   - Seal at bottom
========================= */
async function printTruckMemoOnly(memoId) {
  const m = DB.truckMemos.find((x) => x.id === memoId);
  if (!m) return;

  const miller = DB.millers.find((x) => x.id === m.miller_id);
  const client = DB.clients.find((x) => x.id === m.client_id);

  const items = (m.items || []).map((it, i) => {
    const prod = DB.products.find((p) => p.id === it.productId);
    return `
      <tr>
        <td class="center">${i + 1}</td>
        <td>${escapeHtml(prod?.name || "")}</td>
        <td class="center">${(it.bags || 0).toFixed(0)}</td>
        <td class="center">${(it.netMts || 0).toFixed(3)}</td>
      </tr>
    `;
  }).join("");

  const totalBags = (m.items || []).reduce((s, x) => s + (x.bags || 0), 0);
  const totalMts  = (m.items || []).reduce((s, x) => s + (x.netMts || 0), 0);

  // Logo & seal (optional - if later you save paths)
  // For now keep empty placeholders; Part 4 will add Storage signed urls.
  const logoImg = "";
  const sealImg = "";

  const html = `
    <div class="a4">
      <div class="head">
        <div>
          <div style="font-size:18px; font-weight:800;">${escapeHtml(miller?.name || "MILLER")}</div>
          <div class="muted" style="font-size:12px;">${escapeHtml(miller?.address || "")}</div>
        </div>
        <div>${logoImg}</div>
      </div>

      <div style="margin-top:10px; text-align:center; font-size:16px; font-weight:800; letter-spacing:.6px;">
        TRUCK MEMO
      </div>

      <div class="row" style="margin-top:10px;">
        <div class="col">
          <div style="font-weight:700;">Client</div>
          <div>${escapeHtml(client?.name || "")}</div>
          <div class="muted">${escapeHtml(client?.address || "")}</div>
        </div>
        <div class="col right">
          <div><b>Date:</b> ${escapeHtml(m.memo_date || "")}</div>
          <div><b>Memo No:</b> ${escapeHtml(m.memo_no || "")}</div>
          <div><b>Vehicle:</b> ${escapeHtml(m.vehicle_no || "")}</div>
          <div><b>Driver:</b> ${escapeHtml(m.driver_name || "")}</div>
          <div><b>Mobile:</b> ${escapeHtml(m.mobile || "")}</div>
        </div>
      </div>

      <div style="margin-top:12px;">
        <table>
          <thead>
            <tr>
              <th style="width:45px;" class="center">S.No</th>
              <th class="center">Commodity</th>
              <th style="width:90px;" class="center">Bags</th>
              <th style="width:110px;" class="center">Net MTS</th>
            </tr>
          </thead>
          <tbody>
            ${items}
            <tr>
              <th colspan="2" class="right">Total</th>
              <th class="center">${totalBags.toFixed(0)}</th>
              <th class="center">${totalMts.toFixed(3)}</th>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="margin-top:18px; display:flex; justify-content:space-between; align-items:flex-end;">
        <div style="width:55%;">
          <div class="signbox"><b>Driver Signature</b></div>
        </div>
        <div style="width:40%; text-align:right;">
          <div class="sealbox">${sealImg || "SEAL"}</div>
          <div style="margin-top:6px; font-weight:700;">Authorized Signatory</div>
        </div>
      </div>
    </div>
  `;

  openPrintWindow(html, "Truck Memo");
}

/* =========================
   GATE PASS PRINT (LANDSCAPE)
   45 format: fixed landscape style
========================= */
function printGatePassOnly(memoId) {
  const m = DB.truckMemos.find((x) => x.id === memoId);
  if (!m) return;

  const miller = DB.millers.find((x) => x.id === m.miller_id);
  const client = DB.clients.find((x) => x.id === m.client_id);

  const totalBags = (m.items || []).reduce((s, x) => s + (x.bags || 0), 0);
  const totalMts  = (m.items || []).reduce((s, x) => s + (x.netMts || 0), 0);

  const html = `
    <div class="land45">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-size:18px; font-weight:900;">${escapeHtml(miller?.name || "MILLER")}</div>
          <div class="muted" style="font-size:12px;">${escapeHtml(miller?.address || "")}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:16px; font-weight:900;">GATE PASS</div>
          <div><b>Date:</b> ${escapeHtml(m.memo_date || "")}</div>
          <div><b>Memo No:</b> ${escapeHtml(m.memo_no || "")}</div>
        </div>
      </div>

      <div class="row" style="margin-top:10px;">
        <div class="col">
          <div style="font-weight:700;">To (Client)</div>
          <div>${escapeHtml(client?.name || "")}</div>
          <div class="muted">${escapeHtml(client?.address || "")}</div>
        </div>
        <div class="col">
          <div><b>Vehicle:</b> ${escapeHtml(m.vehicle_no || "")}</div>
          <div><b>Driver:</b> ${escapeHtml(m.driver_name || "")}</div>
          <div><b>Mobile:</b> ${escapeHtml(m.mobile || "")}</div>
        </div>
        <div class="col right">
          <div><b>Total Bags:</b> ${totalBags.toFixed(0)}</div>
          <div><b>Total Net MTS:</b> ${totalMts.toFixed(3)}</div>
        </div>
      </div>

      <div style="margin-top:14px; display:flex; justify-content:space-between; gap:12px;">
        <div style="flex:1;">
          <div class="signbox"><b>Driver Signature</b></div>
        </div>
        <div style="flex:1; text-align:right;">
          <div class="signbox"><b>Authorized Signatory</b></div>
        </div>
      </div>
    </div>
  `;

  openPrintWindow(html, "Gate Pass");
}

/* =========================
   EXTEND startApp AGAIN
========================= */
const _startAppOld2 = startApp;
startApp = function () {
  _startAppOld2();

  bindTruckMemoEvents();
  renderTruckMemos();

  // initialize items table with one row if empty
  const table = $("tmItemsTable");
  if (table) {
    const tbody = table.querySelector("tbody") || table;
    if (tbody.querySelectorAll("tr").length === 0) addItemRow();
  }
  recalcTotals();
};
/* =========================================================
   PART 4/4 – Storage (Logo/Seal) + Reports + Export + Backup
   ========================================================= */

/* =========================
   STORAGE: Upload + Signed URL
   Bucket: assets (private)
========================= */
const _signedCache = new Map(); // path -> {url, exp}

async function signedUrl(path) {
  if (!path) return "";
  const hit = _signedCache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;

  const { data, error } = await supabase.storage
    .from("assets")
    .createSignedUrl(path, 60 * 60); // 1 hour

  if (error) {
    console.warn("Signed URL error:", error.message);
    return "";
  }

  _signedCache.set(path, { url: data.signedUrl, exp: Date.now() + 55 * 60 * 1000 });
  return data.signedUrl;
}

async function uploadToAssets(file, folder, millerId) {
  const user = await currentUser();
  if (!user) throw new Error("Login required");

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${folder}/${user.id}/${millerId}.${ext}`;

  const { error } = await supabase.storage
    .from("assets")
    .upload(path, file, { upsert: true });

  if (error) throw error;

  _signedCache.delete(path);
  return path;
}

/* =========================
   MILLER LOGO/SEAL UPLOAD
   Expected HTML:
   - file inputs: #millerLogoFile #millerSealFile
   - buttons: #btnUploadMillerLogo #btnUploadMillerSeal
   - optional preview imgs: #millerLogoPreview #millerSealPreview
========================= */
function bindMillerImageEvents() {
  if ($("btnUploadMillerLogo")) $("btnUploadMillerLogo").onclick = uploadMillerLogo;
  if ($("btnUploadMillerSeal")) $("btnUploadMillerSeal").onclick = uploadMillerSeal;
}

async function uploadMillerLogo() {
  try {
    if (!editMillerId) return toast("First select Miller (Edit) then upload Logo");
    const file = $("millerLogoFile")?.files?.[0];
    if (!file) return toast("Choose a logo file");

    const path = await uploadToAssets(file, "logos", editMillerId);

    // update DB row
    const ix = DB.millers.findIndex((x) => x.id === editMillerId);
    if (ix < 0) return toast("Miller not found");

    DB.millers[ix].logo_path = path;
    await upsertRow("millers", {
      ...DB.millers[ix],
      updated_at: new Date().toISOString()
    });

    // preview
    const url = await signedUrl(path);
    if ($("millerLogoPreview")) $("millerLogoPreview").src = url;

    toast("Logo uploaded");
  } catch (e) {
    toast(e.message || String(e));
  }
}

async function uploadMillerSeal() {
  try {
    if (!editMillerId) return toast("First select Miller (Edit) then upload Seal");
    const file = $("millerSealFile")?.files?.[0];
    if (!file) return toast("Choose a seal file");

    const path = await uploadToAssets(file, "seals", editMillerId);

    const ix = DB.millers.findIndex((x) => x.id === editMillerId);
    if (ix < 0) return toast("Miller not found");

    DB.millers[ix].seal_path = path;
    await upsertRow("millers", {
      ...DB.millers[ix],
      updated_at: new Date().toISOString()
    });

    const url = await signedUrl(path);
    if ($("millerSealPreview")) $("millerSealPreview").src = url;

    toast("Seal uploaded");
  } catch (e) {
    toast(e.message || String(e));
  }
}

/* =========================
   PATCH: When opening a miller edit, show previews if present
========================= */
const _openMillerEditOld = openMillerEdit;
openMillerEdit = async function (id) {
  _openMillerEditOld(id);

  const m = DB.millers.find((x) => x.id === id);
  if (!m) return;

  if ($("millerLogoPreview")) {
    $("millerLogoPreview").src = m.logo_path ? await signedUrl(m.logo_path) : "";
  }
  if ($("millerSealPreview")) {
    $("millerSealPreview").src = m.seal_path ? await signedUrl(m.seal_path) : "";
  }
};

/* =========================
   PRINT TRUCK MEMO WITH LOGO + SEAL
   (Override the previous version to inject signed URLs)
========================= */
const _printTruckMemoOnlyOld = printTruckMemoOnly;
printTruckMemoOnly = async function (memoId) {
  const m = DB.truckMemos.find((x) => x.id === memoId);
  if (!m) return;

  const miller = DB.millers.find((x) => x.id === m.miller_id);
  const client = DB.clients.find((x) => x.id === m.client_id);

  const items = (m.items || [])
    .map((it, i) => {
      const prod = DB.products.find((p) => p.id === it.productId);
      return `
        <tr>
          <td class="center">${i + 1}</td>
          <td>${escapeHtml(prod?.name || "")}</td>
          <td class="center">${(it.bags || 0).toFixed(0)}</td>
          <td class="center">${(it.netMts || 0).toFixed(3)}</td>
        </tr>
      `;
    })
    .join("");

  const totalBags = (m.items || []).reduce((s, x) => s + (x.bags || 0), 0);
  const totalMts = (m.items || []).reduce((s, x) => s + (x.netMts || 0), 0);

  const logoUrl = miller?.logo_path ? await signedUrl(miller.logo_path) : "";
  const sealUrl = miller?.seal_path ? await signedUrl(miller.seal_path) : "";

  const logoImg = logoUrl
    ? `<img src="${logoUrl}" style="height:70px; object-fit:contain;">`
    : "";

  const sealImg = sealUrl
    ? `<img src="${sealUrl}" style="max-height:84px; max-width:120px; object-fit:contain;">`
    : "SEAL";

  const html = `
    <div class="a4">
      <div class="head">
        <div>
          <div style="font-size:20px; font-weight:900;">${escapeHtml(miller?.name || "MILLER")}</div>
          <div class="muted" style="font-size:12px;">${escapeHtml(miller?.address || "")}</div>
        </div>
        <div>${logoImg}</div>
      </div>

      <div style="margin-top:10px; text-align:center; font-size:16px; font-weight:900; letter-spacing:.6px;">
        TRUCK MEMO
      </div>

      <div class="row" style="margin-top:10px;">
        <div class="col">
          <div style="font-weight:800;">Client</div>
          <div>${escapeHtml(client?.name || "")}</div>
          <div class="muted">${escapeHtml(client?.address || "")}</div>
        </div>
        <div class="col right">
          <div><b>Date:</b> ${escapeHtml(m.memo_date || "")}</div>
          <div><b>Memo No:</b> ${escapeHtml(m.memo_no || "")}</div>
          <div><b>Vehicle:</b> ${escapeHtml(m.vehicle_no || "")}</div>
          <div><b>Driver:</b> ${escapeHtml(m.driver_name || "")}</div>
          <div><b>Mobile:</b> ${escapeHtml(m.mobile || "")}</div>
        </div>
      </div>

      <div style="margin-top:12px;">
        <table>
          <thead>
            <tr>
              <th style="width:45px;" class="center">S.No</th>
              <th class="center">Commodity</th>
              <th style="width:90px;" class="center">Bags</th>
              <th style="width:110px;" class="center">Net MTS</th>
            </tr>
          </thead>
          <tbody>
            ${items}
            <tr>
              <th colspan="2" class="right">Total</th>
              <th class="center">${totalBags.toFixed(0)}</th>
              <th class="center">${totalMts.toFixed(3)}</th>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="margin-top:18px; display:flex; justify-content:space-between; align-items:flex-end;">
        <div style="width:55%;">
          <div class="signbox"><b>Driver Signature</b></div>
        </div>
        <div style="width:40%; text-align:right;">
          <div class="sealbox">${sealImg}</div>
          <div style="margin-top:6px; font-weight:800;">Authorized Signatory</div>
        </div>
      </div>
    </div>
  `;

  openPrintWindow(html, "Truck Memo");
};

/* =========================
   REPORTS (FILTERS + PDF + EXPORT)
   Expected HTML input IDs (if missing, features will just not run):
   Filters:
   #rptFrom #rptTo #rptMiller #rptClient #rptProduct #rptMode
   #rptAmtMin #rptAmtMax
   options:
   #rptShowRate (checkbox) -> include rate & amount columns
   buttons:
   #btnRunReport #btnReportPDF #btnExportCSV #btnExportExcel
   table:
   #tblReport (tbody)
========================= */
function bindReportEvents() {
  if ($("btnRunReport")) $("btnRunReport").onclick = runReport;
  if ($("btnReportPDF")) $("btnReportPDF").onclick = reportPDF;
  if ($("btnExportCSV")) $("btnExportCSV").onclick = exportReportCSV;
  if ($("btnExportExcel")) $("btnExportExcel").onclick = exportReportExcel;

  // Fill report dropdowns if exist
  refreshReportDropdowns();
}

function refreshReportDropdowns() {
  // miller
  if ($("rptMiller")) {
    $("rptMiller").innerHTML = `<option value="">All Millers</option>` +
      DB.millers
        .slice()
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        .map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`)
        .join("");
  }
  // client
  if ($("rptClient")) {
    $("rptClient").innerHTML = `<option value="">All Clients</option>` +
      DB.clients
        .slice()
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
        .join("");
  }
  // product
  if ($("rptProduct")) {
    $("rptProduct").innerHTML = `<option value="">All Products</option>` +
      DB.products
        .slice()
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
        .join("");
  }
  // mode
  if ($("rptMode")) {
    $("rptMode").innerHTML = `
      <option value="">All Modes</option>
      <option value="BAG">Per Bag</option>
      <option value="MTS">Per MTS</option>
    `;
  }
}

function parseDateISO(s) {
  // expects YYYY-MM-DD
  if (!s) return null;
  const t = Date.parse(s + "T00:00:00");
  return isNaN(t) ? null : t;
}

function memoTotalAmount(m) {
  return (m.items || []).reduce((s, it) => s + (it.amount || 0), 0);
}

function memoHasProduct(m, productId) {
  return (m.items || []).some((it) => it.productId === productId);
}

function memoHasMode(m, mode) {
  return (m.items || []).some((it) => it.rateMode === mode);
}

function getFilteredMemos() {
  const from = parseDateISO($("rptFrom")?.value || "");
  const to = parseDateISO($("rptTo")?.value || "");
  const millerId = $("rptMiller")?.value || "";
  const clientId = $("rptClient")?.value || "";
  const productId = $("rptProduct")?.value || "";
  const mode = $("rptMode")?.value || "";

  const amtMin = parseFloat($("rptAmtMin")?.value || "") || null;
  const amtMax = parseFloat($("rptAmtMax")?.value || "") || null;

  return DB.truckMemos.filter((m) => {
    const d = parseDateISO(m.memo_date);
    if (from && d && d < from) return false;
    if (to && d && d > to) return false;
    if (millerId && m.miller_id !== millerId) return false;
    if (clientId && m.client_id !== clientId) return false;
    if (productId && !memoHasProduct(m, productId)) return false;
    if (mode && !memoHasMode(m, mode)) return false;

    const tot = memoTotalAmount(m);
    if (amtMin !== null && tot < amtMin) return false;
    if (amtMax !== null && tot > amtMax) return false;

    return true;
  });
}

function runReport() {
  const list = getFilteredMemos();
  renderReport(list);
  toast(`Report: ${list.length} memo(s)`);
}

function renderReport(list) {
  const tbl = $("tblReport");
  if (!tbl) return;
  const tbody = tbl.querySelector("tbody") || tbl;
  tbody.innerHTML = "";

  const showRate = !!$("rptShowRate")?.checked;

  list.forEach((m) => {
    const miller = DB.millers.find((x) => x.id === m.miller_id);
    const client = DB.clients.find((x) => x.id === m.client_id);

    // Each memo expands to multiple rows (items) like bank statement
    (m.items || []).forEach((it, idx) => {
      const prod = DB.products.find((p) => p.id === it.productId);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(m.memo_date || "")}</td>
        <td>${escapeHtml(m.memo_no || "")}</td>
        <td>${escapeHtml(miller?.name || "")}</td>
        <td>${escapeHtml(client?.name || "")}</td>
        <td>${escapeHtml(prod?.name || "")}</td>
        <td style="text-align:right">${(it.bags || 0).toFixed(0)}</td>
        <td style="text-align:right">${(it.netMts || 0).toFixed(3)}</td>
        ${showRate ? `<td class="center">${it.rateMode === "BAG" ? "Per Bag" : "Per MTS"}</td>` : ""}
        ${showRate ? `<td style="text-align:right">${(it.rate || 0).toFixed(2)}</td>` : ""}
        ${showRate ? `<td style="text-align:right">${(it.amount || 0).toFixed(2)}</td>` : ""}
      `;
      tbody.appendChild(tr);
    });
  });
}

/* =========================
   REPORT PDF (BANK STATEMENT STYLE)
========================= */
function reportPDF() {
  const list = getFilteredMemos();
  const showRate = !!$("rptShowRate")?.checked;

  const rows = [];
  list.forEach((m) => {
    const miller = DB.millers.find((x) => x.id === m.miller_id);
    const client = DB.clients.find((x) => x.id === m.client_id);

    (m.items || []).forEach((it) => {
      const prod = DB.products.find((p) => p.id === it.productId);
      rows.push({
        date: m.memo_date || "",
        memo: m.memo_no || "",
        miller: miller?.name || "",
        client: client?.name || "",
        product: prod?.name || "",
        bags: (it.bags || 0).toFixed(0),
        mts: (it.netMts || 0).toFixed(3),
        mode: it.rateMode === "BAG" ? "Per Bag" : "Per MTS",
        rate: (it.rate || 0).toFixed(2),
        amt: (it.amount || 0).toFixed(2)
      });
    });
  });

  const headCols = showRate
    ? `<th>Date</th><th>Memo No</th><th>Miller</th><th>Client</th><th>Product</th><th class="right">Bags</th><th class="right">Net MTS</th><th class="center">Mode</th><th class="right">Rate</th><th class="right">Amount</th>`
    : `<th>Date</th><th>Memo No</th><th>Miller</th><th>Client</th><th>Product</th><th class="right">Bags</th><th class="right">Net MTS</th>`;

  const body = rows
    .map((r) => {
      return showRate
        ? `<tr>
            <td>${escapeHtml(r.date)}</td>
            <td>${escapeHtml(r.memo)}</td>
            <td>${escapeHtml(r.miller)}</td>
            <td>${escapeHtml(r.client)}</td>
            <td>${escapeHtml(r.product)}</td>
            <td class="right">${r.bags}</td>
            <td class="right">${r.mts}</td>
            <td class="center">${escapeHtml(r.mode)}</td>
            <td class="right">${r.rate}</td>
            <td class="right">${r.amt}</td>
          </tr>`
        : `<tr>
            <td>${escapeHtml(r.date)}</td>
            <td>${escapeHtml(r.memo)}</td>
            <td>${escapeHtml(r.miller)}</td>
            <td>${escapeHtml(r.client)}</td>
            <td>${escapeHtml(r.product)}</td>
            <td class="right">${r.bags}</td>
            <td class="right">${r.mts}</td>
          </tr>`;
    })
    .join("");

  const html = `
    <div class="a4">
      <div style="display:flex; justify-content:space-between; align-items:flex-end;">
        <div>
          <div style="font-size:18px; font-weight:900;">REPORT</div>
          <div class="muted" style="font-size:12px;">Bank Statement Style</div>
        </div>
        <div class="muted" style="font-size:12px;">Generated: ${new Date().toLocaleString()}</div>
      </div>

      <div style="margin-top:10px;">
        <table>
          <thead>
            <tr>${headCols}</tr>
          </thead>
          <tbody>
            ${body || `<tr><td colspan="${showRate ? 10 : 7}" class="center">No records</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  openPrintWindow(html, "Report PDF");
}

/* =========================
   EXPORT CSV (Report rows)
========================= */
function exportReportCSV() {
  const list = getFilteredMemos();
  const showRate = !!$("rptShowRate")?.checked;

  const lines = [];
  const header = showRate
    ? ["Date", "MemoNo", "Miller", "Client", "Product", "Bags", "NetMTS", "Mode", "Rate", "Amount"]
    : ["Date", "MemoNo", "Miller", "Client", "Product", "Bags", "NetMTS"];
  lines.push(header.join(","));

  list.forEach((m) => {
    const miller = DB.millers.find((x) => x.id === m.miller_id);
    const client = DB.clients.find((x) => x.id === m.client_id);

    (m.items || []).forEach((it) => {
      const prod = DB.products.find((p) => p.id === it.productId);
      const row = showRate
        ? [
            m.memo_date || "",
            m.memo_no || "",
            (miller?.name || ""),
            (client?.name || ""),
            (prod?.name || ""),
            (it.bags || 0),
            (it.netMts || 0),
            (it.rateMode === "BAG" ? "Per Bag" : "Per MTS"),
            (it.rate || 0),
            (it.amount || 0)
          ]
        : [
            m.memo_date || "",
            m.memo_no || "",
            (miller?.name || ""),
            (client?.name || ""),
            (prod?.name || ""),
            (it.bags || 0),
            (it.netMts || 0)
          ];
      lines.push(row.map(csvCell).join(","));
    });
  });

  downloadTextFile(lines.join("\n"), "report.csv", "text/csv");
}

function csvCell(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

/* =========================
   EXPORT EXCEL (HTML Excel)
   Works without external libs
========================= */
function exportReportExcel() {
  const list = getFilteredMemos();
  const showRate = !!$("rptShowRate")?.checked;

  const head = showRate
    ? `<tr><th>Date</th><th>Memo No</th><th>Miller</th><th>Client</th><th>Product</th><th>Bags</th><th>Net MTS</th><th>Mode</th><th>Rate</th><th>Amount</th></tr>`
    : `<tr><th>Date</th><th>Memo No</th><th>Miller</th><th>Client</th><th>Product</th><th>Bags</th><th>Net MTS</th></tr>`;

  let body = "";
  list.forEach((m) => {
    const miller = DB.millers.find((x) => x.id === m.miller_id);
    const client = DB.clients.find((x) => x.id === m.client_id);
    (m.items || []).forEach((it) => {
      const prod = DB.products.find((p) => p.id === it.productId);
      body += showRate
        ? `<tr>
            <td>${escapeHtml(m.memo_date || "")}</td>
            <td>${escapeHtml(m.memo_no || "")}</td>
            <td>${escapeHtml(miller?.name || "")}</td>
            <td>${escapeHtml(client?.name || "")}</td>
            <td>${escapeHtml(prod?.name || "")}</td>
            <td style="text-align:right">${(it.bags || 0).toFixed(0)}</td>
            <td style="text-align:right">${(it.netMts || 0).toFixed(3)}</td>
            <td>${escapeHtml(it.rateMode === "BAG" ? "Per Bag" : "Per MTS")}</td>
            <td style="text-align:right">${(it.rate || 0).toFixed(2)}</td>
            <td style="text-align:right">${(it.amount || 0).toFixed(2)}</td>
          </tr>`
        : `<tr>
            <td>${escapeHtml(m.memo_date || "")}</td>
            <td>${escapeHtml(m.memo_no || "")}</td>
            <td>${escapeHtml(miller?.name || "")}</td>
            <td>${escapeHtml(client?.name || "")}</td>
            <td>${escapeHtml(prod?.name || "")}</td>
            <td style="text-align:right">${(it.bags || 0).toFixed(0)}</td>
            <td style="text-align:right">${(it.netMts || 0).toFixed(3)}</td>
          </tr>`;
    });
  });

  const html = `
    <html><head><meta charset="utf-8"></head>
    <body>
      <table border="1">
        ${head}
        ${body || `<tr><td colspan="${showRate ? 10 : 7}">No records</td></tr>`}
      </table>
    </body></html>
  `;

  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, "report.xls");
}

/* =========================
   BACKUP EXPORT / IMPORT (JSON)
   Expected HTML:
   - button #btnBackupExport
   - file input #backupFile
   - button #btnBackupImport
========================= */
function bindBackupEvents() {
  if ($("btnBackupExport")) $("btnBackupExport").onclick = backupExport;
  if ($("btnBackupImport")) $("btnBackupImport").onclick = backupImport;
}

function backupExport() {
  const payload = {
    exportedAt: new Date().toISOString(),
    db: DB
  };
  downloadTextFile(JSON.stringify(payload, null, 2), "miller_backup.json", "application/json");
}

async function backupImport() {
  try {
    const file = $("backupFile")?.files?.[0];
    if (!file) return toast("Choose backup JSON file");

    const text = await file.text();
    const payload = JSON.parse(text);
    const db = payload?.db;

    if (!db || !db.millers || !db.clients || !db.products || !db.truckMemos) {
      return toast("Invalid backup format");
    }

    if (!confirm("Import will overwrite ONLINE database for this account. Continue?")) return;

    // Overwrite: delete existing then insert all.
    // We do it table-by-table.
    await overwriteTable("truck_memos", db.truckMemos);
    await overwriteTable("millers", db.millers);
    await overwriteTable("clients", db.clients);
    await overwriteTable("products", db.products);

    // reload from supabase (source of truth)
    await loadAllFromSupabase();

    // refresh UI
    renderMillers();
    renderClients();
    renderProducts();
    refreshDropdowns();
    refreshReportDropdowns();
    renderTruckMemos();
    toast("Backup imported successfully");
  } catch (e) {
    toast(e.message || String(e));
  }
}

async function overwriteTable(table, rows) {
  // Delete all rows for this user
  const user = await currentUser();
  if (!user) throw new Error("Login required");

  // Fetch ids (safe approach)
  const existing = await loadTable(table);
  for (const r of existing) {
    await deleteRow(table, r.id);
  }

  // Insert all (ensure user_id exists)
  for (const r of rows) {
    const row = { ...r };
    row.user_id = user.id;
    if (!row.id) row.id = uid("IMP");

    // Truck memo fields naming check
    if (table === "truck_memos") {
      // normalize if backup uses different keys (defensive)
      row.memo_no = row.memo_no ?? row.memoNo ?? row.memo_no ?? "";
      row.memo_date = row.memo_date ?? row.date ?? row.memo_date ?? todayISO();
      row.miller_id = row.miller_id ?? row.millerId ?? "";
      row.client_id = row.client_id ?? row.clientId ?? "";
      row.items = row.items ?? [];
    }

    row.updated_at = new Date().toISOString();
    await upsertRow(table, row);
  }
}

/* =========================
   DOWNLOAD HELPERS
========================= */
function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadTextFile(text, filename, mime) {
  const blob = new Blob([text], { type: mime || "text/plain" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
}

/* =========================
   EXTEND startApp FINAL
========================= */
const _startAppOld3 = startApp;
startApp = function () {
  _startAppOld3();

  // images (logo/seal)
  bindMillerImageEvents();

  // reports/export/backup
  bindReportEvents();
  bindBackupEvents();
  refreshReportDropdowns();
};
// ===== BOOT APP =====
window.addEventListener("DOMContentLoaded", () => {
  waitForLogin();
}); 




