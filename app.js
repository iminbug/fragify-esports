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
  config: () => apiGet("/api/config"),
  register: (data) => apiPost("/api/register", data),
  updateLink: (whatsappLink, adminKey) =>
    apiPost("/api/config", { whatsappLink, adminKey }),
  setRegistrationOpen: (registrationOpen, adminKey) =>
    apiPost("/api/config", { registrationOpen, adminKey }),
  updateTournament: (tournament, adminKey) =>
    apiPost("/api/config", { tournament, adminKey }),
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
/* Mirrors the admin toggle so the panel can label its button without a second fetch. */
let registrationOpen = true;

async function renderSlots() {
  let taken, total, open;
  try {
    ({ taken, total, open } = await API.slots());
  } catch (err) {
    console.error("Slot fetch failed:", err);
    slotsLeftEl.textContent = "—";
    return;
  }

  // Older deploys don't send `open` — absent means the toggle isn't in play.
  registrationOpen = open !== false;

  const left = Math.max(0, total - taken);
  const pct = Math.min(100, (taken / total) * 100);

  slotsFill.style.width = pct + "%";
  slotsTaken.textContent = taken;
  el("slotsTotal").textContent = total;
  slotsLeftEl.textContent = left === 0 ? "FULL" : left + " left";
  slotsLeftEl.classList.toggle("is-low", left > 0 && left <= CONFIG.lowSlotThreshold);

  // Two ways to be shut: every slot gone, or an admin closed it early.
  const isFull = left === 0;
  const isClosed = isFull || !registrationOpen;

  form.hidden = isClosed;
  closedState.hidden = !isClosed;
  navStatus.classList.toggle("is-closed", isClosed);
  navStatusText.textContent = isClosed ? "Registration Closed" : "Registration Live";

  if (isClosed) {
    el("closedTitle").textContent = isFull ? "Registration Closed" : "Registration Paused";
    el("closedMsg").textContent = isFull
      ? `All ${total} slots are filled. Follow us for the next season drop.`
      : "Registration is closed right now. Follow us — we'll announce when it reopens.";
    heroCta.textContent = isFull ? "Slots Full" : "Registration Closed";
    heroCta.style.pointerEvents = "none";
    heroCta.style.opacity = "0.5";
  } else {
    heroCta.textContent = "Register Now →";
    heroCta.style.pointerEvents = "";
    heroCta.style.opacity = "";
  }

  updateAdminToggleLabel();
}

function updateAdminToggleLabel() {
  const btn = el("adminToggleBtn");
  if (!btn) return;
  btn.textContent = registrationOpen
    ? "🟢 Registration: LIVE — tap to close"
    : "🔴 Registration: CLOSED — tap to open";
}

/* ---------- Match details ---------- */
/* Field order here drives both the public tiles and the admin form. */
const DETAIL_TILES = [
  { key: "date", label: "Date", icon: "📅" },
  { key: "time", label: "Time", icon: "⏰" },
  { key: "maps", label: "Maps", icon: "🗺️" },
  { key: "slots", label: "Slots", icon: "👥" },
  { key: "entryFee", label: "Entry Fee", icon: "💵" },
  { key: "prizePool", label: "Prize Pool", icon: "💰" },
];
const PRIZE_TILES = [
  { key: "prize1", label: "1st Place", icon: "🥇" },
  { key: "prize2", label: "2nd Place", icon: "🥈" },
  { key: "prizeKills", label: "Highest Kills", icon: "🎯" },
];

let tournament = {};

function renderDetails() {
  const tiles = DETAIL_TILES.filter((t) => tournament[t.key]);
  const prizes = PRIZE_TILES.filter((t) => tournament[t.key]);
  const rules = Array.isArray(tournament.rules) ? tournament.rules : [];

  el("detailGrid").innerHTML = tiles
    .map(
      (t) => `
      <div class="detail">
        <span class="detail__icon">${t.icon}</span>
        <span>
          <span class="detail__label">${t.label}</span>
          <span class="detail__value">${escapeHtml(tournament[t.key])}</span>
        </span>
      </div>`
    )
    .join("");

  el("prizeList").innerHTML = prizes
    .map(
      (t) => `
      <div class="prize">
        <span class="prize__icon">${t.icon}</span>
        <span class="prize__label">${t.label}</span>
        <span class="prize__value">${escapeHtml(tournament[t.key])}</span>
      </div>`
    )
    .join("");

  el("rulesList").innerHTML = rules
    .map((r) => `<li>${escapeHtml(r)}</li>`)
    .join("");

  el("prizeBox").hidden = prizes.length === 0;
  el("rulesBox").hidden = rules.length === 0;
  // Nothing configured yet — keep the whole section out of the page.
  el("detailsSection").hidden =
    tiles.length === 0 && prizes.length === 0 && rules.length === 0;
}

async function loadDetails() {
  try {
    const { tournament: t } = await API.config();
    tournament = t && typeof t === "object" ? t : {};
  } catch (err) {
    console.error("Details fetch failed:", err);
    tournament = {};
  }
  renderDetails();
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
/* A blank or relative href would make target="_blank" reopen this very page — on an
   ?admin=true URL that looks like the admin panel hijacking the button. Only ever
   hand the anchor a real absolute http(s) link. */
function normalizeWaLink(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : "https://" + value;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function showSuccess(teamName, res) {
  el("slotNumber").textContent = "#" + String(res.slot).padStart(2, "0");
  el("modalTeam").textContent = teamName;
  el("credId").textContent = res.teamId;
  el("credPass").textContent = res.password;

  const waBtn = el("waLink");
  const link = normalizeWaLink(res.waLink);
  if (link) {
    waBtn.href = link;
    waBtn.hidden = false;
    el("modalHint").textContent =
      "Save your Team ID & Password. You'll need them in the community for your room details.";
  } else {
    // No community link configured yet — a dead button is worse than none.
    waBtn.removeAttribute("href");
    waBtn.hidden = true;
    el("modalHint").textContent =
      "Save your Team ID & Password — screenshot this. The WhatsApp community link will be shared with you shortly.";
  }

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
        updateAdminToggleLabel();
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

el("adminToggleBtn").addEventListener("click", async () => {
  const next = !registrationOpen;
  const btn = el("adminToggleBtn");

  if (!next && !confirm("Close registration now? The form will disappear for everyone.")) {
    return;
  }

  btn.disabled = true;
  btn.textContent = "⏳ Saving…";
  try {
    await API.setRegistrationOpen(next, adminKey);
    await renderSlots();
    alert(next ? "✅ Registration is LIVE" : "🔒 Registration is CLOSED");
  } catch (err) {
    alert("❌ " + err.message);
    updateAdminToggleLabel();
  } finally {
    btn.disabled = false;
  }
});

/* ---------- Admin: match details editor ---------- */
const detailsModal = el("detailsModal");
const detailsForm = el("detailsForm");

function setDetailsAlert(msg) {
  const alert = el("detailsAlert");
  alert.textContent = msg || "";
  alert.hidden = !msg;
}

function closeDetailsModal() {
  detailsModal.hidden = true;
}

el("adminDetailsBtn").addEventListener("click", () => {
  setDetailsAlert("");
  // Prefill from whatever is live so an edit never silently wipes other fields.
  for (const { key } of [...DETAIL_TILES, ...PRIZE_TILES]) {
    detailsForm[key].value = tournament[key] || "";
  }
  detailsForm.rules.value = Array.isArray(tournament.rules)
    ? tournament.rules.join("\n")
    : "";
  detailsModal.hidden = false;
});

detailsModal.querySelector(".modal__close").addEventListener("click", closeDetailsModal);
detailsModal.querySelector(".modal__backdrop").addEventListener("click", closeDetailsModal);

detailsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setDetailsAlert("");

  const payload = {};
  for (const { key } of [...DETAIL_TILES, ...PRIZE_TILES]) {
    payload[key] = detailsForm[key].value.trim();
  }
  payload.rules = detailsForm.rules.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const saveBtn = el("detailsSaveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    const res = await API.updateTournament(payload, adminKey);
    tournament = res.tournament || {};
    renderDetails();
    closeDetailsModal();
    alert("✅ Match details updated");
  } catch (err) {
    setDetailsAlert(err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Details";
  }
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
loadDetails();
setInterval(renderSlots, 10000); // keep the counter fresh
