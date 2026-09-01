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
  room: (teamId, password) => apiPost("/api/room", { teamId, password }),
  /* No UTR = "what's my status?"; a UTR = "here's my payment reference". */
  payment: (teamId, password, utr) =>
    apiPost("/api/payment", { teamId, password, utr }),
  updateLink: (whatsappLink, adminKey) =>
    apiPost("/api/config", { whatsappLink, adminKey }),
  setRegistrationOpen: (registrationOpen, adminKey) =>
    apiPost("/api/config", { registrationOpen, adminKey }),
  updateTournament: (tournament, adminKey) =>
    apiPost("/api/config", { tournament, adminKey }),
  postRoom: (room, adminKey) =>
    apiPost("/api/config", { room, adminKey }),
  setUpi: (upi, adminKey) =>
    apiPost("/api/config", { upi, adminKey }),
  listRegistrations: (adminKey) =>
    apiPost("/api/admin", { action: "list", adminKey }),
  resetSlots: (adminKey) =>
    apiPost("/api/admin", { action: "reset", adminKey }),
  verifyPayment: (slot, adminKey) =>
    apiPost("/api/admin", { action: "verify", slot, adminKey }),
  rejectPayment: (slot, adminKey) =>
    apiPost("/api/admin", { action: "reject", slot, adminKey }),
  cancelRegistration: (slot, adminKey) =>
    apiPost("/api/admin", { action: "cancel", slot, adminKey }),
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

/* ---------- Teamboard ---------- */
/* Every seat is drawn, taken or not, so the board reads as the match roster rather
   than a list that quietly grows. Slot numbers start at #06 — the first five belong
   to the hosts, not to registration. */
const FIRST_SLOT = 6;

function renderBoard(teams, total) {
  // An older deploy has no `teams` in its response; leave the last good board up
  // rather than blanking the section on a stale backend.
  if (!Array.isArray(teams)) return;

  const bySlot = new Map(teams.map((t) => [Number(t.slot), t]));
  const seats = Number(total) > 0 ? Number(total) : 16;
  const grid = el("boardGrid");
  grid.textContent = "";

  for (let i = 0; i < seats; i++) {
    const slot = FIRST_SLOT + i;
    const team = bySlot.get(slot);
    const card = document.createElement("div");
    card.className = "board__slot";

    const num = document.createElement("span");
    num.className = "board__num";
    num.textContent = "#" + String(slot).padStart(2, "0");

    const name = document.createElement("span");
    name.className = "board__name";

    if (team && team.confirmed) {
      card.classList.add("is-taken");
      // textContent, not innerHTML — a team name is user input and lands on a
      // page everyone sees.
      name.textContent = team.name;
    } else if (team) {
      card.classList.add("is-holding");
      name.textContent = "Payment pending…";
    } else {
      name.textContent = "Open";
    }

    card.append(num, name);
    grid.append(card);
  }

  const confirmed = teams.filter((t) => t.confirmed).length;
  el("boardSub").textContent = confirmed
    ? `${confirmed} team${confirmed === 1 ? "" : "s"} confirmed. A team's name appears here as soon as its entry fee is verified.`
    : "No teams confirmed yet. A team's name appears here as soon as its entry fee is verified.";
}

/* ---------- Render slots ---------- */
/* Mirrors the admin toggle so the panel can label its button without a second fetch. */
let registrationOpen = true;

async function renderSlots() {
  let taken, total, open, roomLive, teams;
  try {
    ({ taken, total, open, roomLive, teams } = await API.slots());
  } catch (err) {
    console.error("Slot fetch failed:", err);
    slotsLeftEl.textContent = "—";
    return;
  }

  // Older deploys don't send `open` — absent means the toggle isn't in play.
  registrationOpen = open !== false;
  applyRoom(Boolean(roomLive));
  renderBoard(teams, total);

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

/* ---------- Live room credentials ---------- */
/* The public slots endpoint only says whether a room is live. The credentials come from
   /api/room, which wants the Team ID and password issued at registration — so a random
   visitor sees a locked card and nothing else.

   The server sends seconds-remaining rather than an expiry timestamp, so a phone with a
   wrong clock can't keep the room ID on screen after it has expired. We count down
   locally between the 10-second polls and re-sync on every one of them. */
let roomSecondsLeft = 0;

/* Kept in sessionStorage, not localStorage: a shared or borrowed phone shouldn't stay
   unlocked once the tab is closed. */
const AUTH_KEY = "fragify:auth";

function savedAuth() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    const auth = raw ? JSON.parse(raw) : null;
    return auth && auth.teamId && auth.password ? auth : null;
  } catch {
    return null;
  }
}
function saveAuth(teamId, password) {
  try {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify({ teamId, password }));
  } catch {
    /* private mode — the team just re-enters the details, no harm done */
  }
}
function clearAuth() {
  try { sessionStorage.removeItem(AUTH_KEY); } catch { /* nothing to clear */ }
}

function setUnlockAlert(msg) {
  const alert = el("unlockAlert");
  alert.textContent = msg || "";
  alert.hidden = !msg;
}

function paintRoomTimer() {
  const mins = Math.floor(roomSecondsLeft / 60);
  const secs = roomSecondsLeft % 60;
  const timer = el("roomTimer");
  timer.textContent = `${mins}:${String(secs).padStart(2, "0")}`;
  timer.classList.toggle("is-ending", roomSecondsLeft <= 60);
}

function showRoomGate(message) {
  roomSecondsLeft = 0;
  setUnlockAlert(message || "");
  el("roomTimer").hidden = true;
  el("roomUnlocked").hidden = true;
  el("roomGate").hidden = false;
}

function showRoomCreds(room, team) {
  roomSecondsLeft = room.secondsLeft;
  el("roomId").textContent = room.id;
  el("roomPass").textContent = room.password;
  el("roomTeam").textContent = team ? `Welcome, ${team}` : "";
  paintRoomTimer();
  el("roomTimer").hidden = false;
  el("roomGate").hidden = true;
  el("roomUnlocked").hidden = false;
}

async function applyRoom(roomLive) {
  const banner = el("roomBanner");

  if (!roomLive) {
    roomSecondsLeft = 0;
    banner.hidden = true;
    return;
  }
  banner.hidden = false;

  // Already unlocked in this tab — refresh the countdown from the server.
  const auth = savedAuth();
  if (!auth) return showRoomGate();

  try {
    const { room, team } = await API.room(auth.teamId, auth.password);
    if (room) showRoomCreds(room, team);
    else showRoomGate();
  } catch (err) {
    // Slots were reset, so these credentials will never work again — drop them
    // rather than retrying a doomed call every 10 seconds.
    clearAuth();
    showRoomGate(err.message);
  }
}

setInterval(() => {
  if (roomSecondsLeft <= 0) return;
  roomSecondsLeft--;
  if (roomSecondsLeft <= 0) {
    el("roomBanner").hidden = true;
    return;
  }
  paintRoomTimer();
}, 1000);

el("roomGate").addEventListener("submit", async (e) => {
  e.preventDefault();
  setUnlockAlert("");

  // Both values are issued uppercase, so accept whatever case the team types.
  const teamId = el("unlockId").value.trim().toUpperCase();
  const password = el("unlockPass").value.trim().toUpperCase();
  if (!teamId || !password) {
    return setUnlockAlert("Enter both your Team ID and password.");
  }

  const btn = el("unlockBtn");
  btn.disabled = true;
  btn.textContent = "Checking…";

  try {
    const { room, team } = await API.room(teamId, password);
    saveAuth(teamId, password);
    if (room) showRoomCreds(room, team);
    else setUnlockAlert("The room hasn't been posted yet. Try again in a little while.");
  } catch (err) {
    setUnlockAlert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Unlock Room Details";
  }
});

el("roomLockBtn").addEventListener("click", () => {
  clearAuth();
  el("unlockId").value = "";
  el("unlockPass").value = "";
  showRoomGate();
});

/* ---------- Entry fee ---------- */
/* The whole section only exists when an admin has configured a fee. A team unlocks it
   with the same Team ID + password as the room card, so a squad that just registered is
   already unlocked and lands straight on the Pay button. */
let entryFee = null;

function setPayGateAlert(msg) {
  const alert = el("payGateAlert");
  alert.textContent = msg || "";
  alert.hidden = !msg;
}

function setUtrAlert(msg) {
  const alert = el("utrAlert");
  alert.textContent = msg || "";
  alert.hidden = !msg;
}

/* What the admin field should hold: a bare VPA when that's all there is, and the whole
   signed link when the fee came from a merchant QR, so re-saving can't drop the
   signature. */
function payeeField(fee) {
  const extra = Object.entries(fee.extra || {});
  if (!extra.length) return fee.vpa || "";
  const parts = ["pa=" + encodeURIComponent(fee.vpa)];
  for (const [key, value] of extra) parts.push(key + "=" + encodeURIComponent(value));
  return "upi://pay?" + parts.join("&");
}

function showPayGate(message) {
  setPayGateAlert(message || "");
  setUtrAlert("");
  el("payPanel").hidden = true;
  el("payGate").hidden = false;
}

/* `info` is the /api/payment response. */
function showPayPanel(info) {
  const status = info.status || "verified";
  el("payTeam").textContent = info.team ? `${info.team} · ${info.teamId}` : "";

  const statusEl = el("payStatus");
  statusEl.classList.remove("is-pending", "is-submitted", "is-verified");

  if (status === "verified") {
    statusEl.textContent = "✅ Payment verified — your slot is confirmed.";
    statusEl.classList.add("is-verified");
  } else if (status === "submitted") {
    statusEl.textContent = `⏳ UTR ${info.utr || ""} received. An admin is verifying it — your slot is safe until then.`;
    statusEl.classList.add("is-submitted");
  } else {
    statusEl.textContent = "⚠️ Entry fee pending. Without payment your slot will be released.";
    statusEl.classList.add("is-pending");
  }

  /* The community invite is handed over only once the fee is verified, and the server
     is what decides that — an unverified team simply gets no link in the response, so
     there is nothing here to reveal early. */
  const waBtn = el("payWaLink");
  const waHref = status === "verified" ? normalizeWaLink(info.waLink) : null;
  if (waHref) {
    waBtn.href = waHref;
    waBtn.hidden = false;
  } else {
    // A dead button is worse than none — drop the href along with the button.
    waBtn.removeAttribute("href");
    waBtn.hidden = true;
  }

  // Only a pending team is on a clock, and only it needs the pay controls.
  const due = status === "pending";
  el("payDue").hidden = !due;

  const holdEl = el("payHold");
  if (due && typeof info.holdSecondsLeft === "number") {
    const mins = Math.ceil(info.holdSecondsLeft / 60);
    holdEl.textContent = mins > 0
      ? `⏱ Your slot is reserved for ${mins} more minute${mins === 1 ? "" : "s"}.`
      : "⏱ The hold has expired — pay now, the slot could go to another team.";
    holdEl.hidden = false;
  } else {
    holdEl.hidden = true;
  }

  const fee = info.entryFee || entryFee;
  if (due && fee) {
    el("payVpa").textContent = fee.vpa;
    el("payAmt").textContent = String(fee.amount);
    el("payTn").textContent = info.teamId;
    // Paying a number instead of a VPA is the route the UPI apps themselves
    // suggest when they refuse a link, so surface it when one is configured.
    el("payPhone").textContent = fee.phone || "";
    el("payPhoneRow").hidden = !fee.phone;
  }

  el("payGate").hidden = true;
  el("payPanel").hidden = false;
}

/* Called on every slots poll. `fee` is null for a free tournament. */
async function applyPayment(fee) {
  entryFee = fee;
  const section = el("paymentSection");

  // The admin button names what is live right now. Without it a save looks like it
  // did nothing — the fee is only visible to a logged-in team, never to the admin.
  el("adminUpiBtn").textContent = fee
    ? `💳 Entry Fee: ₹${fee.amount} · ${fee.vpa}`
    : "💳 Entry Fee: OFF — tap to set";

  // Say the price on the form itself — nobody should find out there's a fee only
  // after they've filled the whole thing in.
  const feeNote = el("formFeeNote");
  if (fee) {
    feeNote.textContent = `💳 Entry fee ₹${fee.amount} — pay by UPI right after you lock your slot.`;
    feeNote.hidden = false;
  } else {
    feeNote.hidden = true;
  }

  if (!fee) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  el("payAmount").textContent = "₹" + fee.amount;

  const auth = savedAuth();
  if (!auth) return showPayGate();

  try {
    showPayPanel(await API.payment(auth.teamId, auth.password));
  } catch (err) {
    // Credentials that no longer work (slot cancelled, slots reset) shouldn't be
    // retried on every poll.
    if (/incorrect|Unauthorized/i.test(err.message)) clearAuth();
    showPayGate(err.message);
  }
}

el("payGate").addEventListener("submit", async (e) => {
  e.preventDefault();
  setPayGateAlert("");

  const teamId = el("payId").value.trim().toUpperCase();
  const password = el("payPass").value.trim().toUpperCase();
  if (!teamId || !password) {
    return setPayGateAlert("Enter both your Team ID and password.");
  }

  const btn = el("payGateBtn");
  btn.disabled = true;
  btn.textContent = "Checking…";

  try {
    const info = await API.payment(teamId, password);
    saveAuth(teamId, password);
    showPayPanel(info);
  } catch (err) {
    setPayGateAlert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Check My Payment Status";
  }
});

el("utrForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  setUtrAlert("");

  const auth = savedAuth();
  if (!auth) return showPayGate("Your session has expired — log in again.");

  const utr = el("payUtr").value.trim();
  if (!utr) return setUtrAlert("Enter the UTR / transaction ID from your UPI app.");

  const btn = el("utrBtn");
  btn.disabled = true;
  btn.textContent = "Submitting…";

  try {
    const info = await API.payment(auth.teamId, auth.password, utr);
    el("payUtr").value = "";
    showPayPanel(info);
  } catch (err) {
    setUtrAlert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit Payment Reference";
  }
});

/* The QR is optional: drop a qr.png next to index.html and it appears, leave it out
   and nothing shows. Driven by the image's own load result rather than a config flag,
   so the page can never promise a QR that isn't there.

   app.js runs at the end of the body, by which point a cached qr.png has usually
   finished loading and its `load` event has already been and gone — so check
   `complete` up front instead of waiting for an event that will never fire. */
function syncQrVisibility() {
  const img = el("payQr");
  el("payQrBox").hidden = !(img.complete && img.naturalWidth > 0);
}
el("payQr").addEventListener("load", syncQrVisibility);
el("payQr").addEventListener("error", syncQrVisibility);
syncQrVisibility();

/* Delegated so one handler covers the UPI ID, the mobile number and the note. */
el("payDue").addEventListener("click", async (e) => {
  const btn = e.target.closest(".pay__copy");
  if (!btn) return;

  const value = el(btn.dataset.copy).textContent;
  try {
    await navigator.clipboard.writeText(value);
    btn.textContent = "Copied ✓";
  } catch {
    // Clipboard access needs HTTPS and a permission — the value is on screen anyway.
    btn.textContent = "Copy failed";
  }
  setTimeout(() => { btn.textContent = "Copy"; }, 1500);
});

el("payLockBtn").addEventListener("click", () => {
  clearAuth();
  el("payId").value = "";
  el("payPass").value = "";
  showPayGate();
});

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
  let upi = null;
  try {
    const cfg = await API.config();
    tournament = cfg.tournament && typeof cfg.tournament === "object" ? cfg.tournament : {};
    upi = cfg.upi || null;
  } catch (err) {
    console.error("Details fetch failed:", err);
    tournament = {};
  }
  renderDetails();
  await applyPayment(upi);
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
    // The team is now logged in, so refresh the entry-fee panel — it should be
    // unlocked and showing their Pay button by the time they close the modal.
    await loadDetails();
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

  // The team just proved who they are — remember it so the room card unlocks
  // itself for them without a second login.
  saveAuth(res.teamId, res.password);

  const waBtn = el("waLink");
  const link = normalizeWaLink(res.waLink);
  if (link) {
    waBtn.href = link;
    waBtn.hidden = false;
    el("modalHint").textContent =
      "Save your Team ID & Password. You'll need them in the community for your room details.";
  } else {
    // Either no community link is configured yet, or the entry fee is still unpaid
    // and the server is holding the link back. A dead button is worse than none.
    waBtn.removeAttribute("href");
    waBtn.hidden = true;
    el("modalHint").textContent = res.paymentDue
      ? "Save your Team ID & Password — screenshot this. The WhatsApp community link appears once your entry fee is verified."
      : "Save your Team ID & Password — screenshot this. The WhatsApp community link will be shared with you shortly.";
  }

  const payNote = el("modalPayNote");
  if (res.paymentDue) {
    // The slot is reserved, not confirmed — say so plainly rather than letting the
    // team walk away thinking they're in. Only the trailing text node is swapped so
    // the slot-number span survives.
    el("modalTitle").lastChild.textContent = " reserved";
    payNote.textContent =
      `⚠️ Pay the ₹${res.paymentDue.amount} entry fee within ${res.paymentDue.holdMinutes} minutes or your slot will be released. The QR and UPI ID are below.`;
    payNote.hidden = false;
    el("modalClose").textContent = "Go to payment →";
    pendingPayment = true;
  } else {
    payNote.hidden = true;
    el("modalClose").textContent = "Done";
    pendingPayment = false;
  }

  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

/* Set while a just-registered team still owes money, so closing the confirmation can
   drop them straight onto the entry-fee card instead of making them hunt for it. */
let pendingPayment = false;

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = "";

  if (!pendingPayment) return;
  pendingPayment = false;

  const section = el("paymentSection");
  if (section.hidden) return;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  // A flash on arrival — the page scrolled on its own, so point at what changed.
  // No autofocus on the UTR field: the mobile keyboard would open mid-scroll and
  // land them in the wrong place.
  section.classList.remove("pay--flash");
  void section.offsetWidth; // restart the animation if it's still running
  section.classList.add("pay--flash");
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

/* ---------- Admin: registrations ---------- */
/* Registrations from before entry fees existed carry no status; they were never asked
   to pay, so show them as settled. */
const PAY_BADGES = {
  pending: { label: "UNPAID", cls: "is-pending" },
  submitted: { label: "UTR SUBMITTED", cls: "is-submitted" },
  verified: { label: "PAID", cls: "is-verified" },
};

function registrationRow(r) {
  const members = Array.isArray(r.members) ? r.members : [];
  const squad = members.length
    ? `Squad: ${members.map(escapeHtml).join(", ")}<br/>`
    : "";
  const status = r.payment_status || "verified";
  const badge = PAY_BADGES[status] || PAY_BADGES.verified;
  const utr = r.utr ? `UTR: <strong>${escapeHtml(r.utr)}</strong><br/>` : "";

  // A team that has paid needs no verify button; one that hasn't can't be rejected.
  const actions = [
    status !== "verified"
      ? `<button class="reg-act reg-act--ok" data-act="verify" data-slot="${r.slot_number}">✅ Verify</button>`
      : "",
    status === "submitted"
      ? `<button class="reg-act" data-act="reject" data-slot="${r.slot_number}">↩️ Reject UTR</button>`
      : "",
    `<button class="reg-act reg-act--danger" data-act="cancel" data-slot="${r.slot_number}">🗑️ Cancel Slot</button>`,
  ].join("");

  return `
  <div style="border-bottom:1px solid var(--border);padding:12px 0">
    <strong style="color:var(--accent)">Slot #${String(r.slot_number).padStart(2, "0")}</strong>
    <span class="reg-badge ${badge.cls}">${badge.label}</span><br/>
    Team: ${escapeHtml(r.team_name)}<br/>
    Leader: ${escapeHtml(r.leader_name)}<br/>
    ${squad}Phone: ${escapeHtml(r.phone)}<br/>
    ${utr}ID: ${escapeHtml(r.team_id)} · Pass: ${escapeHtml(r.password)}
    <div class="reg-acts">${actions}</div>
  </div>`;
}

async function renderRegistrations() {
  const regList = el("regList");
  regList.innerHTML = "<p style='text-align:center;color:var(--muted)'>Loading…</p>";

  try {
    const { registrations } = await API.listRegistrations(adminKey);
    regList.innerHTML = registrations.length
      ? registrations.map(registrationRow).join("")
      : "<p style='text-align:center;color:var(--muted)'>No registrations yet</p>";
  } catch (err) {
    regList.innerHTML = `<p style="text-align:center;color:var(--danger)">${escapeHtml(err.message)}</p>`;
  }
}

el("adminViewBtn").addEventListener("click", async () => {
  el("regModal").hidden = false;
  await renderRegistrations();
});

/* Delegated: the rows are rebuilt after every action, so per-button listeners would
   be re-bound each time. */
el("regList").addEventListener("click", async (e) => {
  const btn = e.target.closest(".reg-act");
  if (!btn) return;

  const act = btn.dataset.act;
  const slot = Number(btn.dataset.slot);
  const label = "#" + String(slot).padStart(2, "0");

  const confirms = {
    verify: `Mark the payment for slot ${label} as verified?`,
    reject: `Reject the UTR for slot ${label}? The team will get another chance to pay.`,
    cancel: `Cancel slot ${label}? The team is removed and the slot goes to the next registration.`,
  };
  if (!confirm(confirms[act])) return;

  btn.disabled = true;
  try {
    if (act === "verify") await API.verifyPayment(slot, adminKey);
    else if (act === "reject") await API.rejectPayment(slot, adminKey);
    else await API.cancelRegistration(slot, adminKey);
    await renderRegistrations();
    await renderSlots();
  } catch (err) {
    alert("❌ " + err.message);
    btn.disabled = false;
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

/* ---------- Admin: room ID & password ---------- */
const roomModal = el("roomModal");
const roomForm = el("roomForm");

function setRoomAlert(msg) {
  const alert = el("roomAlert");
  alert.textContent = msg || "";
  alert.hidden = !msg;
}

function closeRoomModal() {
  roomModal.hidden = true;
}

el("adminRoomBtn").addEventListener("click", () => {
  setRoomAlert("");
  // Always start blank — a room ID is posted fresh each match, never edited.
  el("rId").value = "";
  el("rPass").value = "";
  roomModal.hidden = false;
});

roomModal.querySelector(".modal__close").addEventListener("click", closeRoomModal);
roomModal.querySelector(".modal__backdrop").addEventListener("click", closeRoomModal);

roomForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setRoomAlert("");

  const saveBtn = el("roomSaveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Posting…";

  try {
    await API.postRoom(
      { id: el("rId").value.trim(), password: el("rPass").value.trim() },
      adminKey
    );
    await renderSlots();
    closeRoomModal();
    alert("✅ Room details live for 10 minutes");
  } catch (err) {
    setRoomAlert(err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Post for 10 Minutes";
  }
});

el("roomClearBtn").addEventListener("click", async () => {
  if (!confirm("Remove the room details from the website right now?")) return;

  try {
    // An explicit null tells the server to drop the key instead of writing one.
    await API.postRoom(null, adminKey);
    await renderSlots();
    closeRoomModal();
    alert("✅ Room details removed");
  } catch (err) {
    setRoomAlert(err.message);
  }
});

/* ---------- Admin: entry fee ---------- */
const upiModal = el("upiModal");
const upiForm = el("upiForm");

function setUpiAlert(msg) {
  const alert = el("upiAlert");
  alert.textContent = msg || "";
  alert.hidden = !msg;
}

function closeUpiModal() {
  upiModal.hidden = true;
}

el("adminUpiBtn").addEventListener("click", () => {
  setUpiAlert("");
  // Prefill from what's live so a small edit doesn't mean retyping the UPI ID.
  // A merchant QR goes back in as the full link — prefilling the bare VPA would
  // silently drop the signature on the next save.
  el("uVpa").value = entryFee ? payeeField(entryFee) : "";
  el("uName").value = entryFee?.name || "";
  el("uAmount").value = entryFee?.amount || "";
  el("uPhone").value = entryFee?.phone || "";
  upiModal.hidden = false;
});

upiModal.querySelector(".modal__close").addEventListener("click", closeUpiModal);
upiModal.querySelector(".modal__backdrop").addEventListener("click", closeUpiModal);

upiForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setUpiAlert("");

  const saveBtn = el("upiSaveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    await API.setUpi(
      {
        vpa: el("uVpa").value.trim(),
        name: el("uName").value.trim(),
        amount: Number(el("uAmount").value.trim()),
        phone: el("uPhone").value.trim(),
      },
      adminKey
    );
    await loadDetails();
    closeUpiModal();
    alert("✅ Entry fee is live. New registrations are confirmed only after payment.");
  } catch (err) {
    setUpiAlert(err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Entry Fee";
  }
});

el("upiClearBtn").addEventListener("click", async () => {
  if (!confirm("Remove the entry fee? All slots become free after this.")) return;

  try {
    // An explicit null drops the key — that's how the tournament goes back to free.
    await API.setUpi(null, adminKey);
    await loadDetails();
    closeUpiModal();
    alert("✅ The tournament is now free");
  } catch (err) {
    setUpiAlert(err.message);
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
// Slower than the slot poll: this also re-checks the team's payment status, and an
// admin verifying a payment isn't something that needs second-by-second freshness.
setInterval(loadDetails, 30000);
