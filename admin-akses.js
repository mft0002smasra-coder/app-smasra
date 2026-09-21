/* ============================================================
   PANEL KAWALAN AKSES — hanya untuk Role3="Admin App".
   Baca senarai staf guna gviz terus; simpan (tulis) lalui Code.gs
   (updateStaffAccess), yang turut SAHKAN Role3 pemanggil di pelayan.
   ============================================================ */

const AA_SPREADSHEET_ID = "1EohV_hfuS6SDgiqDn--QQiM_y92_K4jvGyh87nA3HOo";
let aaCurrentUser = null;
let aaStaffList = [];
let aaEditingEmail = "";

function aaEscape(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

async function aaInit(user) {
  aaCurrentUser = user;
  const isAdminApp = String(user.role3 || "").trim().toLowerCase() === "admin app";
  if (!isAdminApp) {
    document.getElementById("aa-denied").classList.remove("hidden");
    return;
  }
  document.getElementById("aa-main").classList.remove("hidden");
  await aaFetchStaffList();
  aaRenderList(aaStaffList);
}

/* ================= Baca senarai staf (gviz terus) ================= */
async function aaFetchStaffList() {
  const box = document.getElementById("aa-staff-list");
  box.innerHTML = `<div class="empty-state">Memuatkan senarai staf...</div>`;
  try {
    const url = `https://docs.google.com/spreadsheets/d/${AA_SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent("DatabaseSTAFF")}&headers=1&_ts=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const table = JSON.parse(jsonStr).table;
    // Lajur (0-indeks): A=Gambar B=Nama C=Jawatan D=Telefon E=Emel1 F=Emel2 G=Role H=Role2 I=Role3
    aaStaffList = (table.rows || []).map((r) => {
      const c = r.c || [];
      const get = (i) => (c[i] && c[i].v != null ? String(c[i].v).trim() : "");
      return {
        nama: get(1), jawatan: get(2), telefon: get(3), emel1: get(4), emel2: get(5),
        role: get(6), role2: get(7), role3: get(8),
      };
    }).filter((s) => s.nama);
  } catch (e) {
    aaStaffList = [];
  }
}

function aaFilterList() {
  const q = document.getElementById("aa-search").value.trim().toLowerCase();
  const filtered = q ? aaStaffList.filter((s) => s.nama.toLowerCase().indexOf(q) !== -1) : aaStaffList;
  aaRenderList(filtered);
}

function aaRenderList(list) {
  const box = document.getElementById("aa-staff-list");
  box.innerHTML = list.length
    ? list.map((s) => `
      <div class="aa-staff-row" onclick="aaOpenEdit('${aaEscape(s.emel1)}')">
        <div>
          <div class="aa-staff-nama">${aaEscape(s.nama)}</div>
          <div class="aa-staff-jawatan">${aaEscape(s.jawatan || "-")}</div>
        </div>
        <div class="aa-staff-badges">
          ${s.role ? `<span class="aa-badge aa-tag-role">${aaEscape(s.role)}</span>` : ""}
          ${s.role2 ? `<span class="aa-badge aa-tag-role2">${aaEscape(s.role2)}</span>` : ""}
          ${s.role3 ? `<span class="aa-badge aa-tag-role3">${aaEscape(s.role3)}</span>` : ""}
        </div>
      </div>`).join("")
    : `<div class="empty-state">Tiada staf dijumpai.</div>`;
}

/* ================= Popup Edit ================= */
function aaOpenEdit(emel1) {
  const s = aaStaffList.find((x) => x.emel1 === emel1);
  if (!s) return;
  aaEditingEmail = emel1;
  document.getElementById("aa-edit-nama").textContent = s.nama;
  document.getElementById("aa-edit-emel").textContent = s.emel1;
  document.getElementById("aa-edit-jawatan").value = s.jawatan || "";
  document.getElementById("aa-edit-role").value = s.role || "";
  document.getElementById("aa-edit-role2").value = s.role2 || "";
  document.getElementById("aa-edit-role3").value = s.role3 || "";
  document.getElementById("aa-edit-error").classList.add("hidden");
  document.getElementById("aa-edit-overlay").classList.remove("hidden");
}
function aaCloseEdit() {
  document.getElementById("aa-edit-overlay").classList.add("hidden");
}

async function aaSaveEdit() {
  const jawatan = document.getElementById("aa-edit-jawatan").value.trim();
  const role = document.getElementById("aa-edit-role").value;
  const role2 = document.getElementById("aa-edit-role2").value;
  const role3 = document.getElementById("aa-edit-role3").value;
  const errEl = document.getElementById("aa-edit-error");
  errEl.classList.add("hidden");

  if (!apiConfigured()) { errEl.textContent = "API belum disambungkan."; errEl.classList.remove("hidden"); return; }

  const btn = document.getElementById("aa-edit-save-btn");
  btn.disabled = true; btn.textContent = "Menyimpan...";
  try {
    const data = await postToAppsScript(API_URL, {
      action: "updateStaffAccess",
      callerEmail: aaCurrentUser.email, targetEmail: aaEditingEmail,
      jawatan, role, role2, role3,
    });
    if (data.success) {
      // Kemaskini terus dalam senarai tempatan supaya tak perlu fetch semula
      const s = aaStaffList.find((x) => x.emel1 === aaEditingEmail);
      if (s) { s.jawatan = jawatan; s.role = role; s.role2 = role2; s.role3 = role3; }
      aaCloseEdit();
      aaFilterList();
    } else {
      errEl.textContent = data.message || "Gagal simpan.";
      errEl.classList.remove("hidden");
    }
  } catch (err) {
    errEl.textContent = "Ralat sambungan (" + err.message + ").";
    errEl.classList.remove("hidden");
  }
  btn.disabled = false; btn.textContent = "Simpan";
}
