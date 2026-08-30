/* ============================================================
   Fragify Esports — Registration logic (LOCAL MOCK)
   ============================================================ */

const CONFIG = {
  totalSlots: 16,
  whatsappCommunityLink: "https://chat.whatsapp.com/XXXXXXXXXXXXX",
  lowSlotThreshold: 4,
  storageKey: "fragify_registrations_v1",
};

/* ---------- MOCK backend (localStorage) ---------- */
function readStore() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.storageKey)) || [];
  } catch {
    return [];
  }
}
function writeStore(list) {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(list));
}

async function fetchSlots() {
  const list = readStore();
  return { taken: list.length, total: CONFIG.totalSlots };
}

async function submitRegistration(data) {
  const list = readStore();
  if (list.length >= CONFIG.totalSlots) {
    return { ok: false, reason: "full" };
  }
  const slot = list.length + 1;
  const teamId = "FRG-" + String(slot).padStart(3, "0");
  const password = genPassword();
  const record = { ...data, slot, teamId, password, ts: Date.now() };
  list.push(record);
  writeStore(list);
  return {
    ok: true,
    slot,
    teamId,
    password,
    waLink: CONFIG.whatsappCommunityLink,
  };
}

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let p = "";
  for (let i = 0; i < 6; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

/* ---------- DOM refs ---------- */
const el = (id) => document.getElementById(id);
const slotsFill = el("slotsFill");
const slotsTaken = el("slotsTaken");
const slotsLeftEl = el("slotsLeft");
const navStatus = el("navStatus");
const navStatusText = el("navStatusText");
const form = el("regForm");
const closedState = el("closedState");
const submitBtn = el("submitBtn");
const heroCta = el("heroCta");
const modal = el("successModal");

/* ---------- Render slots ---------- */
async function renderSlots() {
  const { taken, total } = await fetchSlots();
  const left = Math.max(0, total - taken);
  const pct = Math.min(100, (taken / total) * 100);

  slotsFill.style.width = pct + "%";
  slotsTaken.textContent = taken;
  el("slotsTotal").textContent = total;
  slotsLeftEl.textContent = left === 0 ? "FULL" : left + " left";
  slotsLeftEl.classList.toggle("is-low", left > 0 && left <= CONFIG.lowSlotThreshold);

  const isFull = left === 0;
  form.hidden = isFull;
  closedState.hidden = !isFull;
  navStatus.classList.toggle("is-closed", isFull);
  navStatusText.textContent = isFull ? "Registration Closed" : "Registration Live";
  if (isFull) {
    heroCta.textContent = "Slots Full";
    heroCta.style.pointerEvents = "none";
    heroCta.style.opacity = "0.5";
  }
}

/* ---------- Validation ---------- */
function setError(name, msg) {
  const field = form.querySelector(`[name="${name}"]`).closest(".field");
  const errEl = form.querySelector(`.field__error[data-for="${name}"]`);
  field.classList.toggle("has-error", !!msg);
  errEl.textContent = msg || "";
}

function validate(data) {
  let ok = true;
  if (!data.teamName || data.teamName.length < 2) {
    setError("teamName", "Team name is required."); ok = false;
  } else setError("teamName", "");

  if (!data.leaderName || data.leaderName.length < 2) {
    setError("leaderName", "Leader IGN is required."); ok = false;
  } else setError("leaderName", "");

  const digits = (data.phone || "").replace(/\D/g, "");
  if (digits.length !== 10) {
    setError("phone", "Phone number must be exactly 10 digits."); ok = false;
  } else setError("phone", "");

  return ok;
}

/* ---------- Submit ---------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    teamName: form.teamName.value.trim(),
    leaderName: form.leaderName.value.trim(),
    phone: form.phone.value.trim(),
  };
  if (!validate(data)) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Locking...";

  const res = await submitRegistration(data);

  if (!res.ok) {
    await renderSlots();
    submitBtn.disabled = false;
    submitBtn.textContent = "Lock My Slot →";
    return;
  }

  showSuccess(data.teamName, res);
  form.reset();
  await renderSlots();
  submitBtn.disabled = false;
  submitBtn.textContent = "Lock My Slot →";
});

/* ---------- Success modal ---------- */
function showSuccess(teamName, res) {
  el("slotNumber").textContent = "#" + String(res.slot).padStart(2, "0");
  el("modalTeam").textContent = teamName;
  el("credId").textContent = res.teamId;
  el("credPass").textContent = res.password;
  el("waLink").href = res.waLink;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = "";
}
el("modalClose").addEventListener("click", closeModal);
modal.querySelector(".modal__backdrop").addEventListener("click", closeModal);

/* ---------- Admin Panel (localStorage version) ---------- */
const ADMIN_PASSWORD = "admin123";

if (new URLSearchParams(window.location.search).get("admin")) {
  const pwd = prompt("🔐 Admin Password:");
  if (pwd === ADMIN_PASSWORD) {
    setTimeout(() => showAdminPanel(), 100);
  } else {
    alert("❌ Wrong password");
  }
}

function showAdminPanel() {
  const adminPanel = el("adminPanel");
  adminPanel.hidden = false;

  el("adminCloseBtn").addEventListener("click", () => {
    adminPanel.hidden = true;
  });

  el("adminBackdrop").addEventListener("click", () => {
    adminPanel.hidden = true;
  });

  el("adminViewBtn").addEventListener("click", showRegistrations);
  el("adminLinkBtn").addEventListener("click", updateWALink);
  el("adminResetBtn").addEventListener("click", resetAllSlots);
}

function showRegistrations() {
  const list = readStore();
  const modal = el("regModal");
  const regList = el("regList");

  if (list.length === 0) {
    regList.innerHTML = "<p style='text-align:center; color: var(--muted);'>No registrations yet</p>";
  } else {
    regList.innerHTML = list.map((r, i) => `
      <div style="border-bottom: 1px solid var(--border); padding: 12px 0; margin: 12px 0;">
        <strong style="color: var(--accent);">Slot #${String(r.slot).padStart(2, '0')}</strong><br/>
        Team: ${r.teamName}<br/>
        Leader: ${r.leaderName}<br/>
        Phone: ${r.phone}<br/>
        ID: ${r.teamId} | Pass: ${r.password}
      </div>
    `).join("");
  }

  modal.hidden = false;
  modal.querySelector(".modal__close").addEventListener("click", () => {
    modal.hidden = true;
  });
  modal.querySelector(".modal__backdrop").addEventListener("click", () => {
    modal.hidden = true;
  });
}

function updateWALink() {
  const newLink = prompt("New WhatsApp Community Link:", CONFIG.whatsappCommunityLink);
  if (!newLink) return;

  CONFIG.whatsappCommunityLink = newLink;
  alert("✅ Link updated!\n\n" + newLink);
  el("adminPanel").hidden = true;
}

function resetAllSlots() {
  const confirm = prompt("🗑️ NUCLEAR OPTION - Type 'RESET' to confirm delete all registrations:");
  if (confirm !== "RESET") {
    alert("❌ Cancelled");
    return;
  }

  writeStore([]);
  alert("✅ All slots reset to 0/16");
  renderSlots();
  el("adminPanel").hidden = true;
}

/* ---------- Init ---------- */
el("year").textContent = new Date().getFullYear();
renderSlots();
