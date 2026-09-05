/* ============================================================
   Fragify Esports — Registration (Vercel + KV backend)

   Multiple matches can be open at once. Every match carries its
   own slot pool, entry fee, room and WhatsApp invite — the page
   draws one board and one form option per match, and a Team ID
   like FRG-M2-007 names both the match and the seat.
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
  testNotify: (adminKey) =>
    apiPost("/api/config", { testNotify: true, adminKey }),
  updateTournament: (tournament, adminKey) =>
    apiPost("/api/config", { tournament, adminKey }),
  createMatch: (match, adminKey) =>
    apiPost("/api/config", { createMatch: match, adminKey }),
  updateMatch: (match, adminKey) =>
    apiPost("/api/config", { updateMatch: match, adminKey }),
  deleteMatch: (matchId, adminKey) =>
    apiPost("/api/config", { deleteMatch: matchId, adminKey }),
  postRoom: (room, adminKey) =>
    apiPost("/api/config", { room, adminKey }),
  listRegistrations: (adminKey) =>
    apiPost("/api/admin", { action: "list", adminKey }),
  resetMatch: (matchId, adminKey) =>
    apiPost("/api/admin", { action: "reset", matchId, adminKey }),
  verifyPayment: (matchId, slot, adminKey) =>
    apiPost("/api/admin", { action: "verify", matchId, slot, adminKey }),
  rejectPayment: (matchId, slot, adminKey) =>
    apiPost("/api/admin", { action: "reject", matchId, slot, adminKey }),
  cancelRegistration: (matchId, slot, adminKey) =>
    apiPost("/api/admin", { action: "cancel", matchId, slot, adminKey }),
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

/* ---------- Match state ---------- */
/* The public shape of every match, straight from /api/register:
   { id, name, matchTime, totalSlots, firstSlot, taken, open, roomLive,
     feeAmount, teams }. Refreshed on every poll. */
let matches = [];

/* Which match the registration form will enter. Survives re-renders of the choice
   cards, dies when that match closes or fills. */
let selectedMatchId = null;

function joinableMatches() {
  return matches.filter((m) => m.open && m.taken < m.totalSlots);
}

/* ---------- Teamboards ---------- */
/* One roster per match. Every seat is drawn, taken or not, so each board reads as
   that match's roster rather than a list that quietly grows. */
function renderBoards() {
  const wrap = el("boardsWrap");
  el("boardSection").hidden = matches.length === 0;
  wrap.textContent = "";

  let confirmedTotal = 0;

  for (const m of matches) {
    const teams = Array.isArray(m.teams) ? m.teams : [];
    const bySlot = new Map(teams.map((t) => [Number(t.slot), t]));
    confirmedTotal += teams.filter((t) => t.confirmed).length;

    const block = document.createElement("div");
    block.className = "board__match";

    const title = document.createElement("h3");
    title.className = "board__match-title";
    // textContent, not innerHTML — the match name is admin input, but no reason
    // to make it the one string on the page that could carry markup.
    title.textContent = m.name + (m.matchTime ? " · " + m.matchTime : "");

    const grid = document.createElement("div");
    grid.className = "board__grid";

    for (let i = 0; i < m.totalSlots; i++) {
      const slot = m.firstSlot + i;
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

    block.append(title, grid);
    wrap.append(block);
  }

  el("boardSub").textContent = confirmedTotal
    ? `${confirmedTotal} team${confirmedTotal === 1 ? "" : "s"} confirmed. A team's name appears here as soon as its entry fee is verified.`
    : "No teams confirmed yet. A team's name appears here as soon as its entry fee is verified.";
}

/* ---------- Match picker on the form ---------- */
function renderMatchChoice() {
  const wrap = el("matchChoice");
  const joinable = joinableMatches();

  // Keep the player's pick across polls; auto-pick when there is no choice to make.
  if (!joinable.some((m) => m.id === selectedMatchId)) {
    selectedMatchId = joinable.length === 1 ? joinable[0].id : null;
  }

  wrap.textContent = "";
  for (const m of joinable) {
    const left = m.totalSlots - m.taken;

    const label = document.createElement("label");
    label.className = "match-opt";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "matchChoice";
    input.value = m.id;
    input.checked = m.id === selectedMatchId;

    const body = document.createElement("span");
    body.className = "match-opt__body";

    const name = document.createElement("span");
    name.className = "match-opt__name";
    name.textContent = m.name;

    const meta = document.createElement("span");
    meta.className = "match-opt__meta";
    meta.textContent = [
      m.matchTime ? "⏰ " + m.matchTime : null,
      m.feeAmount ? "💳 ₹" + m.feeAmount : "🆓 Free entry",
      left + " slot" + (left === 1 ? "" : "s") + " left",
    ]
      .filter(Boolean)
      .join(" · ");

    body.append(name, meta);
    label.append(input, body);
    wrap.append(label);
  }

  updateFeeNote();
}

el("matchChoice").addEventListener("change", (e) => {
  if (e.target.name !== "matchChoice") return;
  selectedMatchId = e.target.value;
  el("matchChoiceError").textContent = "";
  el("matchField").classList.remove("has-error");
  updateFeeNote();
});

/* Say the price of the *chosen* match on the form itself — nobody should find out
   there's a fee only after they've filled the whole thing in. */
function updateFeeNote() {
  const feeNote = el("formFeeNote");
  const m = matches.find((x) => x.id === selectedMatchId);
  if (m && m.feeAmount) {
    feeNote.textContent = `💳 Entry fee ₹${m.feeAmount} — pay by UPI right after you lock your slot.`;
    feeNote.hidden = false;
  } else {
    feeNote.hidden = true;
  }
}

/* ---------- Render slots ---------- */
async function renderSlots() {
  let data;
  try {
    data = await API.slots();
  } catch (err) {
    console.error("Slot fetch failed:", err);
    slotsLeftEl.textContent = "—";
    return;
  }
  matches = Array.isArray(data.matches) ? data.matches : [];

  applyRoom(matches.some((m) => m.roomLive));
  renderBoards();
  renderMatchChoice();
  syncPaymentSection();

  // The hero meter aggregates every match — it answers "how busy is match day",
  // while the per-match numbers live on the choice cards and the boards.
  const total = matches.reduce((n, m) => n + m.totalSlots, 0);
  const taken = matches.reduce((n, m) => n + m.taken, 0);
  const left = Math.max(0, total - taken);
  const pct = total > 0 ? Math.min(100, (taken / total) * 100) : 0;

  slotsFill.style.width = pct + "%";
  slotsTaken.textContent = taken;
  el("slotsTotal").textContent = total;
  slotsLeftEl.textContent = total === 0 ? "—" : left === 0 ? "FULL" : left + " left";
  slotsLeftEl.classList.toggle("is-low", left > 0 && left <= CONFIG.lowSlotThreshold);

  // The form only disappears when there is nothing left to join: every match either
  // full or closed (or none announced yet). One open lobby keeps it on the page.
  const joinable = joinableMatches();
  const isClosed = joinable.length === 0;
  const noMatches = matches.length === 0;
  const isFull = !noMatches && matches.every((m) => m.taken >= m.totalSlots);

  form.hidden = isClosed;
  closedState.hidden = !isClosed;
  navStatus.classList.toggle("is-closed", isClosed);
  navStatusText.textContent = isClosed ? "Registration Closed" : "Registration Live";

  if (isClosed) {
    el("closedTitle").textContent = noMatches
      ? "No Matches Announced Yet"
      : isFull
        ? "Registration Closed"
        : "Registration Paused";
    el("closedMsg").textContent = noMatches
      ? "Match times drop soon. Follow us — the forms open here the moment they do."
      : isFull
        ? "Every match is full. Follow us for the next drop."
        : "Registration is closed right now. Follow us — we'll announce when it reopens.";
    heroCta.textContent = noMatches ? "Coming Soon" : isFull ? "Slots Full" : "Registration Closed";
    heroCta.style.pointerEvents = "none";
    heroCta.style.opacity = "0.5";
  } else {
    heroCta.textContent = "Register Now →";
    heroCta.style.pointerEvents = "";
    heroCta.style.opacity = "";
  }
}

/* ---------- Live room credentials ---------- */
/* The public slots endpoint only says whether a room is live somewhere. The credentials
   come from /api/room, which wants the Team ID and password issued at registration —
   and only ever answers with the room of that team's own match.

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

function showRoomCreds(room, team, matchName) {
  roomSecondsLeft = room.secondsLeft;
  el("roomId").textContent = room.id;
  el("roomPass").textContent = room.password;
  el("roomTeam").textContent = team
    ? `Welcome, ${team}` + (matchName ? ` · ${matchName}` : "")
    : "";
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
    const { room, team, match } = await API.room(auth.teamId, auth.password);
    if (room) showRoomCreds(room, team, match);
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
    const { room, team, match } = await API.room(teamId, password);
    saveAuth(teamId, password);
    if (room) showRoomCreds(room, team, match);
    else setUnlockAlert("The room for your match hasn't been posted yet. Try again in a little while.");
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
/* The whole section only exists when at least one match has a fee. A team unlocks it
   with the same Team ID + password as the room card — the server answers with *their
   match's* fee, hold and status. */

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
  el("payTeam").textContent = [info.team, info.match?.name, info.teamId]
    .filter(Boolean)
    .join(" · ");

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

  const fee = info.entryFee;
  if (fee) el("payAmount").textContent = "₹" + fee.amount;
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

/* Section visibility on every slots poll: hidden only when no match charges a fee.
   The headline amount is per match, so before a team logs in it shows the one fee
   when all paid matches agree, and the range floor when they don't. */
function syncPaymentSection() {
  const amounts = [...new Set(matches.filter((m) => m.feeAmount > 0).map((m) => m.feeAmount))];
  el("paymentSection").hidden = amounts.length === 0;
  if (amounts.length && el("payPanel").hidden) {
    el("payAmount").textContent =
      amounts.length === 1 ? "₹" + amounts[0] : "₹" + Math.min(...amounts) + "+";
  }
}

/* Called on the slower poll and after a registration: refreshes the logged-in team's
   own payment status from the server. */
async function applyPayment() {
  syncPaymentSection();
  if (!matches.some((m) => m.feeAmount > 0)) return;

  const auth = savedAuth();
  if (!auth) return showPayGate();

  try {
    showPayPanel(await API.payment(auth.teamId, auth.password));
  } catch (err) {
    // Credentials that no longer work (slot cancelled, match reset) shouldn't be
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

/* ---------- Site details ---------- */
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
  { key: "prize3", label: "3rd Place", icon: "🥉" },
  { key: "prize4", label: "4th Place", icon: "🏅" },
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
    const cfg = await API.config();
    tournament = cfg.tournament && typeof cfg.tournament === "object" ? cfg.tournament : {};
  } catch (err) {
    console.error("Details fetch failed:", err);
    tournament = {};
  }
  renderDetails();
  await applyPayment();
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

  if (!data.matchId) {
    el("matchChoiceError").textContent = "Pick which match you want to enter.";
    el("matchField").classList.add("has-error");
    ok = false;
  } else {
    el("matchChoiceError").textContent = "";
    el("matchField").classList.remove("has-error");
  }

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
    matchId: selectedMatchId,
    teamName: form.teamName.value.trim(),
    leaderName: form.leaderName.value.trim(),
    phone: form.phone.value.trim(),
    members: collectMembers(),
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
    await applyPayment();
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
  el("modalMatch").textContent = res.match
    ? res.match.name + (res.match.matchTime ? " · " + res.match.matchTime : "")
    : "";
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
    el("modalTitle").lastChild.textContent = " is yours";
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

/* The admin's view of every match: full config (fee included, so the editor can
   prefill it) plus the live roster. Refreshed before every render that uses it. */
let adminMatches = [];

async function loadAdminMatches() {
  const { matches: list } = await API.listRegistrations(adminKey);
  adminMatches = Array.isArray(list) ? list : [];
  return adminMatches;
}

if (new URLSearchParams(window.location.search).get("admin")) {
  const key = prompt("🔐 Admin Key:");
  if (key) {
    // Verify against the server before showing the panel
    API.listRegistrations(key)
      .then(() => {
        adminKey = key;
        el("adminPanel").hidden = false;
        // Matches are what an admin is almost always here for — land on them open.
        openAccSection("accMatches");
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

/* ---------- Admin: accordion ---------- */
/* One section open at a time, and a section fetches its content the moment it opens —
   an accordion that expands onto stale rows would invite acting on a team that
   already cancelled. */
const ACC_LOADERS = {
  accMatches: () => renderMatchList(),
  accRegs: () => renderRegistrations(),
  accDetails: () => prefillDetailsForm(),
};

async function openAccSection(id) {
  for (const body of document.querySelectorAll(".admin-acc__body")) {
    body.hidden = body.id !== id;
  }
  for (const head of document.querySelectorAll(".admin-acc__head")) {
    head.classList.toggle("is-open", head.dataset.acc === id);
  }
  if (id && ACC_LOADERS[id]) await ACC_LOADERS[id]();
}

el("adminAcc").addEventListener("click", (e) => {
  const head = e.target.closest(".admin-acc__head");
  if (!head) return;
  const isOpen = head.classList.contains("is-open");
  // Clicking the open section's header just collapses it.
  openAccSection(isOpen ? null : head.dataset.acc);
});

/* ---------- Admin: match manager ---------- */

function matchAdminRow(m) {
  const lastSlot = m.firstSlot + m.totalSlots - 1;
  const fee = m.entryFee ? `₹${m.entryFee.amount}` : "Free";
  const badge = m.registrationOpen
    ? '<span class="reg-badge is-verified">OPEN</span>'
    : '<span class="reg-badge is-pending">CLOSED</span>';

  return `
  <div style="border-bottom:1px solid var(--border);padding:12px 0">
    <strong style="color:var(--accent)">${escapeHtml(m.name)}</strong>
    <span style="color:var(--muted)">(${m.id})</span> ${badge}<br/>
    ${m.matchTime ? "⏰ " + escapeHtml(m.matchTime) + " · " : ""}💳 ${fee} ·
    👥 ${m.registrations.length}/${m.totalSlots} filled
    (slots #${String(m.firstSlot).padStart(2, "0")}–#${String(lastSlot).padStart(2, "0")})
    <div class="reg-acts">
      <button class="reg-act ${m.registrationOpen ? "" : "reg-act--ok"}" data-act="toggle" data-id="${m.id}">
        ${m.registrationOpen ? "🔒 Close Form" : "🟢 Open Form"}
      </button>
      <button class="reg-act" data-act="room" data-id="${m.id}">🎮 Room</button>
      <button class="reg-act" data-act="edit" data-id="${m.id}">✏️ Edit</button>
      <button class="reg-act reg-act--danger" data-act="reset" data-id="${m.id}">♻️ Reset Slots</button>
      <button class="reg-act reg-act--danger" data-act="delete" data-id="${m.id}">🗑️ Delete</button>
    </div>
  </div>`;
}

async function renderMatchList() {
  const box = el("matchList");
  box.innerHTML = "<p style='text-align:center;color:var(--muted)'>Loading…</p>";

  try {
    await loadAdminMatches();
    box.innerHTML = adminMatches.length
      ? adminMatches.map(matchAdminRow).join("")
      : "<p style='text-align:center;color:var(--muted)'>No matches yet — create the first one below.</p>";
  } catch (err) {
    box.innerHTML = `<p style="text-align:center;color:var(--danger)">${escapeHtml(err.message)}</p>`;
  }
}

/* Delegated: the rows are rebuilt after every action, so per-button listeners would
   be re-bound each time. */
el("matchList").addEventListener("click", async (e) => {
  const btn = e.target.closest(".reg-act");
  if (!btn) return;

  const act = btn.dataset.act;
  const m = adminMatches.find((x) => x.id === btn.dataset.id);
  if (!m) return;

  try {
    if (act === "toggle") {
      if (
        m.registrationOpen &&
        !confirm(`Close registration for "${m.name}"? Its form option disappears for everyone; other matches stay open.`)
      ) return;
      btn.disabled = true;
      await API.updateMatch({ id: m.id, registrationOpen: !m.registrationOpen }, adminKey);
    } else if (act === "room") {
      openRoomModal(m);
      return;
    } else if (act === "edit") {
      openMatchEditor(m);
      return;
    } else if (act === "reset") {
      const confirmText = prompt(`♻️ This deletes ALL registrations of "${m.name}" (${m.id}).\nType RESET to confirm:`);
      if (confirmText !== "RESET") return;
      btn.disabled = true;
      await API.resetMatch(m.id, adminKey);
    } else if (act === "delete") {
      const confirmText = prompt(`🗑️ This deletes the match "${m.name}" (${m.id}) AND its registrations.\nType DELETE to confirm:`);
      if (confirmText !== "DELETE") return;
      btn.disabled = true;
      await API.deleteMatch(m.id, adminKey);
    } else {
      return;
    }

    await renderMatchList();
    await renderSlots();
  } catch (err) {
    alert("❌ " + err.message);
    btn.disabled = false;
  }
});

/* ---------- Admin: match editor (create + edit, fee included) ---------- */
const matchEditModal = el("matchEditModal");
const matchEditForm = el("matchEditForm");

function setMatchEditAlert(msg) {
  const alert = el("matchEditAlert");
  alert.textContent = msg || "";
  alert.hidden = !msg;
}

function openMatchEditor(m) {
  setMatchEditAlert("");
  matchEditForm.dataset.matchId = m ? m.id : "";
  el("matchEditTitle").textContent = m ? `✏️ Edit ${m.name}` : "🆕 Create Match";
  el("mName").value = m?.name || "";
  el("mTime").value = m?.matchTime || "";
  el("mTotalSlots").value = m ? m.totalSlots : "";
  el("mFirstSlot").value = m ? m.firstSlot : "";
  el("mWaLink").value = m?.whatsappLink || "";
  // A merchant QR goes back in as the full link — prefilling the bare VPA would
  // silently drop the signature on the next save.
  el("mVpa").value = m?.entryFee ? payeeField(m.entryFee) : "";
  el("mAmount").value = m?.entryFee?.amount || "";
  el("mUpiPhone").value = m?.entryFee?.phone || "";
  el("mPayee").value = m?.entryFee?.name || "";
  el("matchSaveBtn").textContent = m ? "Save Changes" : "Create Match";
  matchEditModal.hidden = false;
}

el("matchCreateBtn").addEventListener("click", () => openMatchEditor(null));

matchEditModal.querySelector(".modal__close").addEventListener("click", () => {
  matchEditModal.hidden = true;
});
matchEditModal.querySelector(".modal__backdrop").addEventListener("click", () => {
  matchEditModal.hidden = true;
});

matchEditForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMatchEditAlert("");

  const payload = {
    name: el("mName").value.trim(),
    matchTime: el("mTime").value.trim(),
    whatsappLink: el("mWaLink").value.trim(),
    // Blank VPA and amount together mean "free match" — the server clears the fee.
    upi: {
      vpa: el("mVpa").value.trim(),
      amount: el("mAmount").value.trim(),
      name: el("mPayee").value.trim(),
      phone: el("mUpiPhone").value.trim(),
    },
  };
  // Left blank, the slot numbers keep their current (or default) values.
  const totalSlots = el("mTotalSlots").value.trim();
  if (totalSlots) payload.totalSlots = Number(totalSlots);
  const firstSlot = el("mFirstSlot").value.trim();
  if (firstSlot) payload.firstSlot = Number(firstSlot);

  const saveBtn = el("matchSaveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    const id = matchEditForm.dataset.matchId;
    if (id) await API.updateMatch({ id, ...payload }, adminKey);
    else await API.createMatch(payload, adminKey);

    matchEditModal.hidden = true;
    await renderMatchList();
    await renderSlots();
    alert(id ? "✅ Match updated" : "✅ Match created — its form is live");
  } catch (err) {
    setMatchEditAlert(err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = matchEditForm.dataset.matchId ? "Save Changes" : "Create Match";
  }
});

/* ---------- Admin: registrations ---------- */
/* Registrations from before entry fees existed carry no status; they were never asked
   to pay, so show them as settled. */
const PAY_BADGES = {
  pending: { label: "UNPAID", cls: "is-pending" },
  submitted: { label: "UTR SUBMITTED", cls: "is-submitted" },
  verified: { label: "PAID", cls: "is-verified" },
};

function registrationRow(matchId, r) {
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
      ? `<button class="reg-act reg-act--ok" data-act="verify" data-match="${matchId}" data-slot="${r.slot_number}">✅ Verify</button>`
      : "",
    status === "submitted"
      ? `<button class="reg-act" data-act="reject" data-match="${matchId}" data-slot="${r.slot_number}">↩️ Reject UTR</button>`
      : "",
    `<button class="reg-act reg-act--danger" data-act="cancel" data-match="${matchId}" data-slot="${r.slot_number}">🗑️ Cancel Slot</button>`,
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
    await loadAdminMatches();
    regList.innerHTML = adminMatches.length
      ? adminMatches
          .map((m) => {
            const rows = m.registrations.length
              ? m.registrations.map((r) => registrationRow(m.id, r)).join("")
              : "<p style='color:var(--muted);padding:8px 0'>No registrations yet</p>";
            return `
              <h3 style="margin:16px 0 2px;color:var(--accent-2)">
                ${escapeHtml(m.name)}
                <span style="color:var(--muted);font-size:0.78em;font-weight:400">
                  ${m.id}${m.matchTime ? " · " + escapeHtml(m.matchTime) : ""} · ${m.registrations.length}/${m.totalSlots}
                </span>
              </h3>${rows}`;
          })
          .join("")
      : "<p style='text-align:center;color:var(--muted)'>No matches yet — create one in Manage Matches</p>";
  } catch (err) {
    regList.innerHTML = `<p style="text-align:center;color:var(--danger)">${escapeHtml(err.message)}</p>`;
  }
}

/* Delegated: the rows are rebuilt after every action, so per-button listeners would
   be re-bound each time. */
el("regList").addEventListener("click", async (e) => {
  const btn = e.target.closest(".reg-act");
  if (!btn) return;

  const act = btn.dataset.act;
  const matchId = btn.dataset.match;
  const slot = Number(btn.dataset.slot);
  const label = `${matchId} · #${String(slot).padStart(2, "0")}`;

  const confirms = {
    verify: `Mark the payment for slot ${label} as verified?`,
    reject: `Reject the UTR for slot ${label}? The team will get another chance to pay.`,
    cancel: `Cancel slot ${label}? The team is removed and the slot goes to the next registration.`,
  };
  if (!confirm(confirms[act])) return;

  btn.disabled = true;
  try {
    if (act === "verify") await API.verifyPayment(matchId, slot, adminKey);
    else if (act === "reject") await API.rejectPayment(matchId, slot, adminKey);
    else await API.cancelRegistration(matchId, slot, adminKey);
    await renderRegistrations();
    await renderSlots();
  } catch (err) {
    alert("❌ " + err.message);
    btn.disabled = false;
  }
});

/* ---------- Admin: room ID & password (per match) ---------- */
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

function openRoomModal(m) {
  setRoomAlert("");
  // Always start blank — a room ID is posted fresh each match, never edited.
  el("rId").value = "";
  el("rPass").value = "";
  roomForm.dataset.matchId = m.id;
  el("roomMatchName").textContent =
    `${m.name}${m.matchTime ? " · " + m.matchTime : ""} (${m.id})`;
  roomModal.hidden = false;
}

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
      {
        matchId: roomForm.dataset.matchId,
        id: el("rId").value.trim(),
        password: el("rPass").value.trim(),
      },
      adminKey
    );
    await renderSlots();
    closeRoomModal();
    alert("✅ Room details live for 10 minutes — visible only to this match's verified teams");
  } catch (err) {
    setRoomAlert(err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Post for 10 Minutes";
  }
});

el("roomClearBtn").addEventListener("click", async () => {
  if (!confirm("Remove this match's room details from the website right now?")) return;

  try {
    // An explicit remove tells the server to drop the key instead of writing one.
    await API.postRoom({ matchId: roomForm.dataset.matchId, remove: true }, adminKey);
    await renderSlots();
    closeRoomModal();
    alert("✅ Room details removed");
  } catch (err) {
    setRoomAlert(err.message);
  }
});

/* ---------- Admin: site details editor (inline accordion section) ---------- */
const detailsForm = el("detailsForm");

function setDetailsAlert(msg) {
  const alert = el("detailsAlert");
  alert.textContent = msg || "";
  alert.hidden = !msg;
}

function setDetailsStatus(msg) {
  const status = el("detailsStatus");
  status.textContent = msg || "";
  status.hidden = !msg;
}

/* Runs every time the section opens. Prefill from whatever is live so an edit never
   silently wipes other fields. */
function prefillDetailsForm() {
  setDetailsAlert("");
  setDetailsStatus("");
  for (const { key } of [...DETAIL_TILES, ...PRIZE_TILES]) {
    detailsForm[key].value = tournament[key] || "";
  }
  detailsForm.rules.value = Array.isArray(tournament.rules)
    ? tournament.rules.join("\n")
    : "";
}

detailsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setDetailsAlert("");
  setDetailsStatus("");

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
    // The form stays open in its section, so say "saved" right here rather than
    // with a popup that covers the very fields just edited.
    setDetailsStatus("✅ Saved — live on the site now.");
  } catch (err) {
    setDetailsAlert(err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Details";
  }
});

/* Sends a real alert with sample values down the same path a genuine UTR takes, so
   the token, template name and language code all get exercised. Worth having: none of
   those three are visible from here, and the alternative way to discover a broken one
   is a payment nobody was told about. */
el("adminTestNotifyBtn").addEventListener("click", async () => {
  const btn = el("adminTestNotifyBtn");
  const label = btn.textContent;
  const status = el("testNotifyStatus");
  btn.disabled = true;
  btn.textContent = "Sending…";
  status.hidden = true;
  status.classList.remove("is-error");

  try {
    const res = await API.testNotify(adminKey);
    status.textContent = "✅ " + (res.message || "Test alert sent");
  } catch (err) {
    // The provider's own wording comes through here — it names the actual problem
    // (expired token, wrong chat id, wrong template name) better than we could.
    status.textContent = "❌ " + err.message;
    status.classList.add("is-error");
  } finally {
    status.hidden = false;
    btn.disabled = false;
    btn.textContent = label;
  }
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ---------- Init ---------- */
el("year").textContent = new Date().getFullYear();
// Matches first, then details: applyPayment inside loadDetails needs the match list
// to know whether any match charges a fee at all.
(async () => {
  await renderSlots();
  await loadDetails();
})();
setInterval(renderSlots, 10000); // keep the counters and boards fresh
// Slower than the slot poll: this also re-checks the team's payment status, and an
// admin verifying a payment isn't something that needs second-by-second freshness.
setInterval(loadDetails, 30000);
