/* ============================================================
   Fragify Esports — Registration (Vercel + Supabase backend)
   ============================================================ */

const CONFIG = {
  lowSlotThreshold: 4,
};

/* ---------- API ---------- */
async function apiGet(path) {
  const res = await fetch(path);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

const API = {
  slots: () => apiGet("/api/register"),
  register: (data) => apiPost("/api/register", data),
  updateLink: (whatsappLink, adminKey) =>
    apiPost("/api/config", { whatsappLink, adminKey }),
  listRegistrations: (adminKey) =>
    apiPost("/api/admin", { action: "list", adminKey }),
  resetSlots: (adminKey) =>
    apiPost("/api/admin", { action: "reset", adminKey }),
};

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
  let taken, total;
  try {
    ({ taken, total } = await API.slots());
  } catch (err) {
    console.error("Slot fetch failed:", err);
    slotsLeftEl.textContent = "—";
    return;
  }

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
  } else {
    heroCta.textContent = "Register Now →";
    heroCta.style.pointerEvents = "";
    heroCta.style.opacity = "";
  }
}

/* ---------- Validation ---------- */
const MEMBER_FIELDS = ["member2", "member3", "member4", "member5"];

function setError(name, msg) {
  const field = form.querySelector(`[name="${name}"]`).closest(".field");
  const errEl = form.querySelector(`.field__error[data-for="${name}"]`);
  field.classList.toggle("has-error", !!msg);
  errEl.textContent = msg || "";
}

function setFormAlert(msg) {
  const alert = el("formAlert");
  alert.textContent = msg || "";
  alert.hidden = !msg;
}

/* Route a server error to the field it belongs to, so the user sees it in context. */
function showServerError(msg) {
  const m = msg.toLowerCase();
  if (m.includes("number") || m.includes("phone")) setError("phone", msg);
  else if (m.includes("team name")) setError("teamName", msg);
  else if (m.includes("leader")) setError("leaderName", msg);
  else setFormAlert(msg);
}

/* Filled-in member IGNs, in order. Blanks are skipped — members are optional. */
function collectMembers() {
  return MEMBER_FIELDS
    .map((name) => form[name].value.trim())
    .filter(Boolean);
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

  // Members are optional — only the ones actually filled in get validated.
  const seen = [(data.leaderName || "").toLowerCase()];
  for (const name of MEMBER_FIELDS) {
    const value = form[name].value.trim();
    if (!value) { setError(name, ""); continue; }

    if (value.length < 2) {
      setError(name, "IGN must be at least 2 characters."); ok = false; continue;
    }
    if (seen.includes(value.toLowerCase())) {
      setError(name, "This IGN is already in your squad."); ok = false; continue;
    }
    setError(name, "");
    seen.push(value.toLowerCase());
  }

  return ok;
}

/* ---------- Submit ---------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setFormAlert("");

  const data = {
    teamName: form.teamName.value.trim(),
    leaderName: form.leaderName.value.trim(),
    phone: form.phone.value.trim(),
  };
  if (!validate(data)) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Locking...";

  try {
    const res = await API.register(data);
    showSuccess(data.teamName, res);
    form.reset();
  } catch (err) {
    showServerError(err.message);
  } finally {
    await renderSlots();
    submitBtn.disabled = false;
    submitBtn.textContent = "Lock My Slot →";
  }
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

/* ---------- Admin panel (?admin=true) ---------- */
let adminKey = null;

if (new URLSearchParams(window.location.search).get("admin")) {
  const key = prompt("🔐 Admin Key:");
  if (key) {
    // Verify against the server before showing the panel
    API.listRegistrations(key)
      .then(() => {
        adminKey = key;
        el("adminPanel").hidden = false;
      })
      .catch((err) => alert("❌ " + err.message));
  }
}

el("adminCloseBtn").addEventListener("click", () => {
  el("adminPanel").hidden = true;
});
el("adminBackdrop").addEventListener("click", () => {
  el("adminPanel").hidden = true;
});

el("adminViewBtn").addEventListener("click", async () => {
  const regModal = el("regModal");
  const regList = el("regList");
  regList.innerHTML = "<p style='text-align:center;color:var(--muted)'>Loading…</p>";
  regModal.hidden = false;

  try {
    const { registrations } = await API.listRegistrations(adminKey);
    regList.innerHTML = registrations.length
      ? registrations.map((r) => {
          const members = Array.isArray(r.members) ? r.members : [];
          const squad = members.length
            ? `Squad: ${members.map(escapeHtml).join(", ")}<br/>`
            : "";
          return `
          <div style="border-bottom:1px solid var(--border);padding:12px 0">
            <strong style="color:var(--accent)">Slot #${String(r.slot_number).padStart(2, "0")}</strong><br/>
            Team: ${escapeHtml(r.team_name)}<br/>
            Leader: ${escapeHtml(r.leader_name)}<br/>
            ${squad}Phone: ${escapeHtml(r.phone)}<br/>
            ID: ${escapeHtml(r.team_id)} · Pass: ${escapeHtml(r.password)}
          </div>`;
        }).join("")
      : "<p style='text-align:center;color:var(--muted)'>No registrations yet</p>";
  } catch (err) {
    regList.innerHTML = `<p style="text-align:center;color:var(--danger)">${escapeHtml(err.message)}</p>`;
  }
});

el("regModal").querySelector(".modal__close").addEventListener("click", () => {
  el("regModal").hidden = true;
});
el("regModal").querySelector(".modal__backdrop").addEventListener("click", () => {
  el("regModal").hidden = true;
});

el("adminLinkBtn").addEventListener("click", async () => {
  const newLink = prompt("New WhatsApp Community Link:");
  if (!newLink) return;

  try {
    await API.updateLink(newLink, adminKey);
    alert("✅ Link updated for everyone:\n\n" + newLink);
  } catch (err) {
    alert("❌ " + err.message);
  }
});

el("adminResetBtn").addEventListener("click", async () => {
  const confirmText = prompt("🗑️ This deletes ALL registrations.\nType RESET to confirm:");
  if (confirmText !== "RESET") return;

  try {
    await API.resetSlots(adminKey);
    await renderSlots();
    alert("✅ All slots reset to 0/16");
    el("adminPanel").hidden = true;
  } catch (err) {
    alert("❌ " + err.message);
  }
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ---------- Init ---------- */
el("year").textContent = new Date().getFullYear();
renderSlots();
setInterval(renderSlots, 10000); // keep the counter fresh
