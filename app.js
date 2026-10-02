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

/* ---------- PWA: installable app shell ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.error("SW registration failed:", err));
  });
}

// Chrome/Edge/Android fire this instead of showing their own install UI the moment
// they decide the site qualifies — holding onto it is what lets our own button
// trigger the native install dialog on demand instead of never appearing at all.
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById("navInstallBtn");
  if (btn) btn.hidden = false;
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const btn = document.getElementById("navInstallBtn");
  if (btn) btn.hidden = true;
});

/* ---------- Language toggle (English / Hindi) ---------- */
/* Covers the main player-facing screens — nav, hero, cards, leaderboard, room,
   payment, details, teamboard, registration, connect and My Teams. Admin panel and
   dynamic server/alert messages stay in English for now; translating every status
   string too was out of scope for one pass. */
const TRANSLATIONS = {
  en: {
    "nav.register": "📝 Register", "nav.details": "📋 Details", "nav.leaderboard": "🏆 Leaderboard",
    "nav.connect": "📣 Connect", "nav.myTeams": "🗂️ My Teams", "nav.install": "📲 Install App",
    "auth.signOut": "Sign out",
    "hero.eyebrow": "// SEASON 01 ·  SQUAD SHOWDOWN",
    "hero.titleLine1": "REGISTER YOUR SQUAD.", "hero.titleLine2": "CLAIM YOUR SLOT.",
    "hero.subtitle": `Multiple matches, <strong>limited slots each</strong>. Pick your match time,
        lock in your squad, get your slot number, and join the WhatsApp community for
        your room ID &amp; password. <strong>Winner Winner Chicken Dinner</strong> awaits. 🍗`,
    "hero.ctaRegister": "Register Now →", "hero.ctaCommunity": "💬 Join Community",
    "cards.limited.title": "Limited Slots",
    "cards.limited.desc": "Every match has a hard cap. When the last squad registers, that lobby auto-locks. No exceptions.",
    "cards.instant.title": "Instant Slot",
    "cards.instant.desc": "Your slot number is assigned the second you register. Shown on screen instantly.",
    "cards.room.title": "Room ID &amp; Pass",
    "cards.room.desc": "Get the WhatsApp community invite with your room ID &amp; password after registering.",
    "leaderboard.eyebrow": "Match Results", "leaderboard.title": "Top 8 Leaderboard",
    "leaderboard.published": "Published Results", "leaderboard.pointSystem": "Point System",
    "leaderboard.placementPoints": "Placement: 1st 10 · 2nd 6 · 3rd 5 · 4th 4 · 5th 3 · 6th 2 · 7th-8th 1",
    "leaderboard.killPoints": "Kills: +1 each", "leaderboard.colRank": "Rank", "leaderboard.colSlot": "Slot",
    "leaderboard.colTeam": "Team", "leaderboard.colPlacement": "Placement", "leaderboard.colKills": "Kills",
    "leaderboard.colTotal": "Total",
    "room.open": "Room is Open", "room.unlockBtn": "Unlock Room Details",
    "room.screenshotNote": "⚡ Take a screenshot — these details disappear on their own when the timer runs out.",
    "room.checkInBtn": "Check In for Match", "room.lockAgain": "Lock again",
    "pay.badge": "💳 Entry Fee", "pay.checkStatusBtn": "Check My Payment Status",
    "field.teamId": "Team ID", "field.password": "Password", "field.roomId": "Room ID",
    "details.title": "Match Details", "details.subtitle": "Everything you need to know before the drop.",
    "details.prizeTitle": "🏆 Prize Breakdown", "details.rulesTitle": "⚠️ Mandatory Rules",
    "board.title": "Confirmed Teams",
    "register.title": "Team Registration",
    "register.subtitle": "Fill in your squad details. One entry per team. Signing in with Google is optional — it just unlocks the My Teams dashboard.",
    "register.chooseMatch": `Choose Your Match <span class="req">*</span>`,
    "register.teamName": `Team Name <span class="req">*</span>`,
    "register.leaderName": `Team Leader (IGN) <span class="req">*</span>`,
    "register.phone": `WhatsApp Number <span class="req">*</span>`,
    "register.squadLegend": `Squad Members <span class="squad__optional">Optional</span>`,
    "register.squadHint": "The leader is Player 1. Add the rest of your squad now, or share their IGNs in the community later.",
    "register.submit": "Lock My Slot →",
    "register.agree": "By registering you agree to the tournament rules &amp; fair-play policy.",
    "connect.title": "Squad Up With Us",
    "connect.subtitle": "Live streams, highlights and tournament updates — plus a direct line if you're stuck.",
    "connect.reportBtn": "🚩 Report a Player",
    "dashboard.eyebrow": "Signed in with Google", "dashboard.back": "← Back to site",
    "dashboard.hint": "Every team you've registered, in one place — points, community invite and room details all update here automatically.",
    "dashboard.empty": "You haven't registered a team yet — do that on the site and it'll show up here.",
    "modal.badge": "✅ You're In!", "modal.joinCommunity": "💬 Join WhatsApp Community", "modal.done": "Done",
  },
  hi: {
    "nav.register": "📝 रजिस्टर करें", "nav.details": "📋 जानकारी", "nav.leaderboard": "🏆 लीडरबोर्ड",
    "nav.connect": "📣 संपर्क", "nav.myTeams": "🗂️ मेरी टीमें", "nav.install": "📲 ऐप इंस्टॉल करें",
    "auth.signOut": "साइन आउट",
    "hero.eyebrow": "// सीज़न 01 · स्क्वाड शोडाउन",
    "hero.titleLine1": "अपनी स्क्वाड रजिस्टर करो.", "hero.titleLine2": "अपना स्लॉट पक्का करो.",
    "hero.subtitle": `कई मैच, <strong>हर एक में सीमित स्लॉट</strong>. अपना मैच टाइम चुनो, स्क्वाड लॉक करो,
        स्लॉट नंबर पाओ, और रूम आईडी व पासवर्ड के लिए व्हाट्सएप कम्युनिटी जॉइन करो.
        <strong>विनर विनर चिकन डिनर</strong> का इंतज़ार कर रहा है. 🍗`,
    "hero.ctaRegister": "अभी रजिस्टर करें →", "hero.ctaCommunity": "💬 कम्युनिटी जॉइन करें",
    "cards.limited.title": "सीमित स्लॉट",
    "cards.limited.desc": "हर मैच की एक तय सीमा है. आखिरी स्क्वाड रजिस्टर होते ही लॉबी लॉक हो जाती है. कोई छूट नहीं.",
    "cards.instant.title": "तुरंत स्लॉट",
    "cards.instant.desc": "रजिस्टर करते ही स्क्रीन पर आपका स्लॉट नंबर दिख जाता है.",
    "cards.room.title": "रूम आईडी व पास",
    "cards.room.desc": "रजिस्टर करने के बाद रूम आईडी व पासवर्ड के लिए व्हाट्सएप कम्युनिटी इनवाइट पाएं.",
    "leaderboard.eyebrow": "मैच रिजल्ट", "leaderboard.title": "टॉप 8 लीडरबोर्ड",
    "leaderboard.published": "रिजल्ट प्रकाशित", "leaderboard.pointSystem": "पॉइंट सिस्टम",
    "leaderboard.placementPoints": "प्लेसमेंट: पहला 10 · दूसरा 6 · तीसरा 5 · चौथा 4 · पांचवां 3 · छठा 2 · 7वां-8वां 1",
    "leaderboard.killPoints": "किल: +1 हर एक", "leaderboard.colRank": "रैंक", "leaderboard.colSlot": "स्लॉट",
    "leaderboard.colTeam": "टीम", "leaderboard.colPlacement": "प्लेसमेंट", "leaderboard.colKills": "किल",
    "leaderboard.colTotal": "कुल",
    "room.open": "रूम खुला है", "room.unlockBtn": "रूम डिटेल्स अनलॉक करें",
    "room.screenshotNote": "⚡ स्क्रीनशॉट ले लें — टाइमर खत्म होते ही ये डिटेल्स अपने आप गायब हो जाएंगी.",
    "room.checkInBtn": "मैच के लिए चेक-इन करें", "room.lockAgain": "फिर से लॉक करें",
    "pay.badge": "💳 एंट्री फीस", "pay.checkStatusBtn": "मेरा पेमेंट स्टेटस चेक करें",
    "field.teamId": "टीम आईडी", "field.password": "पासवर्ड", "field.roomId": "रूम आईडी",
    "details.title": "मैच की जानकारी", "details.subtitle": "ड्रॉप से पहले जो कुछ जानना ज़रूरी है.",
    "details.prizeTitle": "🏆 इनाम विवरण", "details.rulesTitle": "⚠️ ज़रूरी नियम",
    "board.title": "कन्फर्म टीमें",
    "register.title": "टीम रजिस्ट्रेशन",
    "register.subtitle": "अपनी स्क्वाड की जानकारी भरें. एक टीम, एक एंट्री. Google से साइन इन करना वैकल्पिक है — इससे सिर्फ My Teams डैशबोर्ड अनलॉक होता है.",
    "register.chooseMatch": `अपना मैच चुनें <span class="req">*</span>`,
    "register.teamName": `टीम का नाम <span class="req">*</span>`,
    "register.leaderName": `टीम लीडर (IGN) <span class="req">*</span>`,
    "register.phone": `व्हाट्सएप नंबर <span class="req">*</span>`,
    "register.squadLegend": `स्क्वाड मेंबर्स <span class="squad__optional">वैकल्पिक</span>`,
    "register.squadHint": "लीडर ही प्लेयर 1 है. बाकी स्क्वाड अभी जोड़ें, या बाद में कम्युनिटी में उनके IGN शेयर करें.",
    "register.submit": "मेरा स्लॉट लॉक करें →",
    "register.agree": "रजिस्टर करके आप टूर्नामेंट के नियमों व फेयर-प्ले पॉलिसी से सहमत होते हैं.",
    "connect.title": "हमसे जुड़ें",
    "connect.subtitle": "लाइव स्ट्रीम, हाइलाइट्स और टूर्नामेंट अपडेट — साथ ही अगर कोई दिक्कत हो तो सीधी लाइन.",
    "connect.reportBtn": "🚩 प्लेयर रिपोर्ट करें",
    "dashboard.eyebrow": "Google से साइन इन किया", "dashboard.back": "← साइट पर वापस जाएं",
    "dashboard.hint": "आपने जो भी टीमें रजिस्टर की हैं, सब यहां एक जगह — पॉइंट्स, कम्युनिटी इनवाइट और रूम डिटेल्स सब अपने आप अपडेट होते हैं.",
    "dashboard.empty": "अभी तक कोई टीम रजिस्टर नहीं की — साइट पर जाकर करें, यहां दिख जाएगी.",
    "modal.badge": "✅ आप इन हैं!", "modal.joinCommunity": "💬 व्हाट्सएप कम्युनिटी जॉइन करें", "modal.done": "हो गया",
  },
};
const LANG_KEY = "fragify:lang";

function applyLanguage(lang) {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  for (const node of document.querySelectorAll("[data-i18n]")) {
    const value = dict[node.dataset.i18n];
    if (value !== undefined) node.textContent = value;
  }
  for (const node of document.querySelectorAll("[data-i18n-html]")) {
    const value = dict[node.dataset.i18nHtml];
    if (value !== undefined) node.innerHTML = value;
  }
  document.documentElement.lang = lang === "hi" ? "hi" : "en";
  const btn = document.getElementById("navLangBtn");
  if (btn) btn.textContent = lang === "hi" ? "🌐 English" : "🌐 हिंदी";
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* private tab — just won't persist */ }
}

function currentLanguage() {
  try { return localStorage.getItem(LANG_KEY) || "en"; } catch { return "en"; }
}

applyLanguage(currentLanguage());
document.getElementById("navLangBtn")?.addEventListener("click", () => {
  applyLanguage(currentLanguage() === "hi" ? "en" : "hi");
});

/* Must match the Client ID configured as GOOGLE_CLIENT_ID on the server (api/auth.js) —
   a Google ID token is only ever valid for the one app it was issued to. */
const GOOGLE_CLIENT_ID = "70511459208-delvaq16hpugufqofilhjp9ktnsgf9ns.apps.googleusercontent.com";
const GOOGLE_SESSION_KEY = "fragify:google";

function getGoogleSession() {
  try {
    const raw = localStorage.getItem(GOOGLE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setGoogleSession(token, user) {
  try {
    localStorage.setItem(GOOGLE_SESSION_KEY, JSON.stringify({ token, user }));
  } catch {
    /* localStorage can be unavailable in private tabs — sign-in still works for the
       current page life, it just won't survive a refresh. */
  }
}

function clearGoogleSession() {
  try { localStorage.removeItem(GOOGLE_SESSION_KEY); } catch { /* nothing to clear */ }
}

/* ---------- API ---------- */
/* Every call rides the signed-in captain's session when one exists — this is what
   lets /api/register, /api/room, /api/payment and /api/checkin recognise "your own
   team" without a password, and it's what makes /api/dashboard possible at all. */
function authHeaders() {
  const session = getGoogleSession();
  return session?.token ? { Authorization: `Bearer ${session.token}` } : {};
}

async function apiGet(path) {
  const res = await fetch(path, { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

const API = {
  slots: () => apiGet("/api/register"),
  results: (matchId) => apiGet(matchId ? `/api/results?matchId=${encodeURIComponent(matchId)}` : "/api/results"),
  publishResults: (matchId, rows, adminKey) => apiPost("/api/results", { matchId, rows, adminKey }),
  config: () => apiGet("/api/config"),
  register: (data) => apiPost("/api/register", data),
  room: (teamId, password) => apiPost("/api/room", { teamId, password }),
  checkIn: (teamId, password) => apiPost("/api/checkin", { teamId, password }),
  payment: (teamId, password, utr, receipt) =>
    apiPost("/api/payment", { teamId, password, utr, receipt }),
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
  approveRegistration: (matchId, slot, adminKey) =>
    apiPost("/api/admin", { action: "approve", matchId, slot, adminKey }),
  rejectPayment: (matchId, slot, adminKey) =>
    apiPost("/api/admin", { action: "reject", matchId, slot, adminKey }),
  cancelRegistration: (matchId, slot, adminKey) =>
    apiPost("/api/admin", { action: "cancel", matchId, slot, adminKey }),
  addRegistration: (matchId, data, adminKey) =>
    apiPost("/api/admin", { action: "add", matchId, ...data, adminKey }),
  moveRegistration: (matchId, slot, toSlot, adminKey) =>
    apiPost("/api/admin", { action: "move", matchId, slot, toSlot, adminKey }),
  googleSignIn: (idToken) => apiPost("/api/auth", { idToken }),
  dashboard: () => apiGet("/api/dashboard"),
  renameTeam: (teamId, teamName) => apiPost("/api/dashboard", { teamId, teamName }),
  reportPlayer: (data) => apiPost("/api/report", data),
  listReports: (adminKey) => apiPost("/api/report", { action: "list", adminKey }),
  resolveReport: (id, adminKey) => apiPost("/api/report", { action: "resolve", id, adminKey }),
  deleteReport: (id, adminKey) => apiPost("/api/report", { action: "delete", id, adminKey }),
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
const dashboardSection = el("dashboardSection");

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

    const titleRow = document.createElement("div");
    titleRow.className = "board__match-head";

    const title = document.createElement("h3");
    title.className = "board__match-title";
    // textContent, not innerHTML — the match name is admin input, but no reason
    // to make it the one string on the page that could carry markup.
    title.textContent = m.name + (m.matchTime ? " · " + m.matchTime : "");

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "board__download";
    downloadBtn.textContent = "📥 Download Image";
    downloadBtn.addEventListener("click", () => downloadBoardImage(m, teams));

    titleRow.append(title, downloadBtn);

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

    block.append(titleRow, grid);
    wrap.append(block);
  }

  el("boardSub").textContent = confirmedTotal
    ? `${confirmedTotal} team${confirmedTotal === 1 ? "" : "s"} confirmed. A team's name appears here as soon as its entry fee is verified.`
    : "No teams confirmed yet. A team's name appears here as soon as its entry fee is verified.";
}

/* ---------- Teamboard image export ---------- */
/* Drawn by hand on a <canvas> rather than pulled in from a screenshot library —
   there's no npm registry access in this project's build environment, and this
   needs nothing fancier than rectangles and text anyway. Exists because a slot
   list pasted into WhatsApp as text reformats itself into a mess; an image never does. */
async function downloadBoardImage(match, teams) {
  const bySlot = new Map(teams.map((t) => [Number(t.slot), t]));
  const rowHeight = 46;
  const headerHeight = 112;
  const footerHeight = 40;
  const width = 720;
  const height = headerHeight + match.totalSlots * rowHeight + footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // The page's own webfonts are already loaded by this point in a real visit;
  // waiting here just covers the rare case a slow connection hasn't finished yet.
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* draw with fallback fonts */ }
  }

  ctx.fillStyle = "#0b0c08";
  ctx.fillRect(0, 0, width, height);

  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, "#ff9b21");
  grad.addColorStop(1, "#ffd54a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, 5);

  ctx.fillStyle = "#f0ead8";
  ctx.font = "800 26px Orbitron, sans-serif";
  ctx.fillText("FRAGIFY ESPORTS", 26, 46);

  ctx.fillStyle = "#ffd54a";
  ctx.font = "700 19px Rajdhani, sans-serif";
  ctx.fillText(match.name + (match.matchTime ? " · " + match.matchTime : ""), 26, 74);

  const confirmedCount = teams.filter((t) => t.confirmed).length;
  ctx.fillStyle = "#a8a48c";
  ctx.font = "500 14px Rajdhani, sans-serif";
  ctx.fillText(`${confirmedCount} / ${match.totalSlots} slots confirmed`, 26, 96);

  for (let i = 0; i < match.totalSlots; i++) {
    const slot = match.firstSlot + i;
    const team = bySlot.get(slot);
    const rowY = headerHeight + i * rowHeight;

    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.01)";
    ctx.fillRect(0, rowY, width, rowHeight);

    ctx.fillStyle = team?.confirmed ? "#ff9b21" : "#33351f";
    ctx.beginPath();
    ctx.arc(52, rowY + rowHeight / 2, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = team?.confirmed ? "#14150f" : "#a8a48c";
    ctx.font = "700 13px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("#" + String(slot).padStart(2, "0"), 52, rowY + rowHeight / 2 + 5);
    ctx.textAlign = "left";

    ctx.fillStyle = team?.confirmed ? "#f0ead8" : "#6b6b5a";
    ctx.font = team?.confirmed ? "700 18px Rajdhani, sans-serif" : "500 15px Rajdhani, sans-serif";
    const label = team?.confirmed ? team.name : team ? "Payment pending…" : "Open";
    ctx.fillText(label, 86, rowY + rowHeight / 2 + 6);
  }

  ctx.fillStyle = "#a8a48c";
  ctx.font = "500 12px Rajdhani, sans-serif";
  ctx.fillText(
    `Generated ${new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`,
    26,
    height - 16
  );

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fragify-${match.id}-slots.png`;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
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
  renderLeaderboard();

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

let publishedResults = null;
let leaderboardRequestId = null;

async function renderLeaderboard() {
  try {
    const { results } = await API.results(leaderboardRequestId);
    publishedResults = results;
  } catch {
    publishedResults = null;
  }
  const rows = publishedResults?.leaderboard || [];
  el("leaderboardSection").hidden = rows.length === 0;
  if (!rows.length) return;
  el("leaderboardMatch").textContent = `${publishedResults.matchName} · Erangel, Miramar, Rondo`;
  el("leaderboardUpdated").textContent = publishedResults.publishedAt
    ? `Updated ${new Date(publishedResults.publishedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
    : "";
  el("leaderboardRows").innerHTML = rows.map((row) => `
    <tr class="leaderboard__rank-${row.rank}"><td><span class="leaderboard__rank">${row.rank}</span></td><td>#${String(row.slot).padStart(2, "0")}</td><td class="leaderboard__team">${escapeHtml(row.team)}${row.rank <= 3 ? ` <button type="button" class="leaderboard__cert-btn" data-cert-rank="${row.rank}" data-cert-team="${escapeHtml(row.team)}" data-cert-points="${row.points}" title="Download certificate">🏅</button>` : ""}</td><td>${row.chickenDinners}</td><td>${row.placementPoints}</td><td>${row.kills}</td><td><strong class="leaderboard__total">${row.points}</strong></td></tr>`).join("");
}

el("leaderboardRows").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-cert-rank]");
  if (!btn || !publishedResults) return;
  downloadCertificateImage({
    matchName: publishedResults.matchName,
    team: btn.dataset.certTeam,
    rank: Number(btn.dataset.certRank),
    points: btn.dataset.certPoints,
  });
});

/* ---------- Winner certificate image export ---------- */
/* A canvas-drawn certificate, same reasoning as the teamboard image: no PDF library
   is reachable from this environment (no npm registry access), and a shareable PNG
   does the actual job — a team posting proof of their placement — just as well. */
function downloadCertificateImage({ matchName, team, rank, points }) {
  const width = 1000;
  const height = 700;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const medal = { 1: ["#ffd700", "1st Place"], 2: ["#d7e1e7", "2nd Place"], 3: ["#d67b3d", "3rd Place"] }[rank] || ["#ff9b21", `#${rank}`];
  const [accent, placeLabel] = medal;

  ctx.fillStyle = "#0b0c08";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, width - 48, height - 48);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.strokeRect(38, 38, width - 76, height - 76);

  ctx.textAlign = "center";
  ctx.fillStyle = "#a8a48c";
  ctx.font = "700 20px Orbitron, sans-serif";
  ctx.fillText("FRAGIFY ESPORTS", width / 2, 110);

  ctx.fillStyle = accent;
  ctx.font = "800 46px Orbitron, sans-serif";
  ctx.fillText("CERTIFICATE OF ACHIEVEMENT", width / 2, 180);

  ctx.fillStyle = "#f0ead8";
  ctx.font = "500 20px Rajdhani, sans-serif";
  ctx.fillText("This certifies that", width / 2, 260);

  ctx.fillStyle = "#f0ead8";
  ctx.font = "800 54px Rajdhani, sans-serif";
  ctx.fillText(team, width / 2, 340);

  ctx.fillStyle = accent;
  ctx.font = "800 34px Orbitron, sans-serif";
  ctx.fillText(`🏆 ${placeLabel.toUpperCase()}`, width / 2, 420);

  ctx.fillStyle = "#a8a48c";
  ctx.font = "500 22px Rajdhani, sans-serif";
  ctx.fillText(`${matchName} · ${points} points`, width / 2, 470);

  ctx.font = "500 16px Rajdhani, sans-serif";
  ctx.fillText(
    new Date().toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" }),
    width / 2,
    height - 70
  );

  ctx.textAlign = "left";

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fragify-certificate-${team.replace(/\s+/g, "-").toLowerCase()}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
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
    // A Google-registered team has no password — the Authorization header (added by
    // apiPost) is what proves ownership for them, so only the Team ID is required here.
    return auth && auth.teamId ? auth : null;
  } catch {
    return null;
  }
}
function saveAuth(teamId, password) {
  try {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify({ teamId, password: password || null }));
  } catch {
    /* private mode — the team just re-enters the details, no harm done */
  }
}
function clearAuth() {
  try { sessionStorage.removeItem(AUTH_KEY); } catch { /* nothing to clear */ }
}

/* ---------- Google sign-in & centralized dashboard ---------- */
/* This is the fix for "the community link never reaches the team": once signed in,
   every team the captain owns \u2014 across every match \u2014 shows up here with its
   current status, including the WhatsApp invite the moment it unlocks. No admin has
   to remember to message anyone. */

function renderAuthUI() {
  const session = getGoogleSession();
  const signedIn = Boolean(session?.token);
  el("googleSignInBtn").hidden = signedIn;
  el("authSignedIn").hidden = !signedIn;
  el("navMyTeamsBtn").hidden = !signedIn;
  if (signedIn) {
    el("authUserName").textContent = session.user?.name || session.user?.email || "Signed in";
    const avatar = el("authUserAvatar");
    if (session.user?.picture) {
      avatar.src = session.user.picture;
      avatar.hidden = false;
    } else {
      avatar.hidden = true;
    }
  }
  // Signing out should never leave the dedicated My Teams screen on display —
  // there would be nothing left for it to show.
  if (!signedIn) dashboardSection.hidden = true;
}

/* ---------- Nav drawer (mobile) ---------- */
const navBurger = el("navBurger");
const navDrawer = el("navDrawer");
const navBackdrop = el("navBackdrop");

function setDrawerOpen(open) {
  navDrawer.classList.toggle("is-open", open);
  navBackdrop.hidden = !open;
  navBurger.setAttribute("aria-expanded", String(open));
  document.body.style.overflow = open ? "hidden" : "";
}
navBurger.addEventListener("click", () => setDrawerOpen(!navDrawer.classList.contains("is-open")));
navBackdrop.addEventListener("click", () => setDrawerOpen(false));
for (const link of navDrawer.querySelectorAll("[data-nav-close]")) {
  link.addEventListener("click", () => setDrawerOpen(false));
}

/* ---------- My Teams: dedicated view ---------- */
/* A separate screen rather than an inline section — swaps out <main> instead of
   just scrolling to it, so a signed-in captain lands somewhere that's clearly
   "their" space the moment they sign in. */
function showDashboardView() {
  document.querySelector("main").hidden = true;
  dashboardSection.hidden = false;
  window.scrollTo({ top: 0 });
}
function showPublicView() {
  dashboardSection.hidden = true;
  document.querySelector("main").hidden = false;
}
el("navMyTeamsBtn").addEventListener("click", () => {
  setDrawerOpen(false);
  showDashboardView();
});
el("dashboardBackBtn").addEventListener("click", showPublicView);

el("navInstallBtn").addEventListener("click", async () => {
  setDrawerOpen(false);
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
});

async function handleGoogleCredential(response) {
  try {
    const { token, user } = await API.googleSignIn(response.credential);
    setGoogleSession(token, user);
    renderAuthUI();
    await renderDashboard();
    await applyPayment();
    // The ask this solves: land the captain on their own screen the moment they
    // sign in, instead of leaving them to scroll around and find it.
    showDashboardView();
  } catch (err) {
    console.error("Google sign-in failed:", err);
    alert("Could not complete Google sign-in. Please try again.");
  }
}

function initGoogleSignIn(attempt = 0) {
  // The GSI script tag loads with `async defer`, so it can still be mid-flight
  // when this runs — retry briefly rather than silently never showing the button.
  if (!window.google?.accounts?.id) {
    if (attempt > 40) return; // ~6s — the script likely failed to load (blocked, offline)
    setTimeout(() => initGoogleSignIn(attempt + 1), 150);
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential,
  });
  google.accounts.id.renderButton(el("googleSignInBtn"), {
    theme: "filled_black",
    size: "large",
    shape: "pill",
    text: "signin_with",
  });
}

el("authSignOutBtn").addEventListener("click", () => {
  clearGoogleSession();
  clearAuth();
  window.google?.accounts?.id?.disableAutoSelect();
  renderAuthUI();
  showPublicView();
});

function dashboardStatusLabel(team) {
  if (team.checkedIn) return { text: "Checked In", tone: "ok" };
  if (!team.approved) return { text: "Awaiting Admin Approval", tone: "pending" };
  if (team.entryFeePending) return { text: "Entry Fee Pending", tone: "pending" };
  if (team.paymentStatus === "submitted") return { text: "Payment Under Review", tone: "pending" };
  return { text: "Confirmed", tone: "ok" };
}

function dashboardCard(team) {
  const status = dashboardStatusLabel(team);
  const hasRank = typeof team.rank === "number";
  const card = document.createElement("div");
  card.className = "dash-card";
  card.innerHTML = `
    <div class="dash-card__head">
      <div class="dash-card__identity">
        <div class="dash-card__name-row" data-name-view>
          <p class="dash-card__team">${escapeHtml(team.teamName)}</p>
          <button type="button" class="dash-card__edit" data-edit-name title="Edit team name">✏️</button>
        </div>
        <form class="dash-card__name-form" data-name-form hidden>
          <input type="text" data-name-input value="${escapeHtml(team.teamName)}" maxlength="50" autocomplete="off" />
          <button type="submit" class="dash-card__name-save">Save</button>
          <button type="button" class="dash-card__name-cancel" data-cancel-name>Cancel</button>
        </form>
        <p class="dash-card__match">${escapeHtml(team.matchName)}${team.matchTime ? " · " + escapeHtml(team.matchTime) : ""} · Slot #${String(team.slot).padStart(2, "0")}</p>
      </div>
      <span class="dash-card__status dash-card__status--${status.tone}">${status.text}</span>
    </div>
    ${hasRank ? `<div class="dash-card__stats">
      <span class="dash-card__stat dash-card__stat--rank">🏆 Rank #${team.rank}</span>
      <span class="dash-card__stat">⚡ ${team.points} pts</span>
    </div>` : ""}
    <p class="dash-card__id">${escapeHtml(team.teamId)}</p>
    <div class="dash-card__actions"></div>
    <p class="dash-card__error" data-name-error hidden></p>
  `;

  const nameView = card.querySelector("[data-name-view]");
  const nameForm = card.querySelector("[data-name-form]");
  const nameInput = card.querySelector("[data-name-input]");
  const nameError = card.querySelector("[data-name-error]");

  card.querySelector("[data-edit-name]").addEventListener("click", () => {
    nameError.hidden = true;
    nameView.hidden = true;
    nameForm.hidden = false;
    nameInput.focus();
    nameInput.select();
  });
  card.querySelector("[data-cancel-name]").addEventListener("click", () => {
    nameInput.value = team.teamName;
    nameError.hidden = true;
    nameForm.hidden = true;
    nameView.hidden = false;
  });
  nameForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = nameInput.value.trim();
    nameError.hidden = true;
    if (value.length < 2) {
      nameError.textContent = "Team name must be at least 2 characters.";
      nameError.hidden = false;
      return;
    }
    const saveBtn = nameForm.querySelector(".dash-card__name-save");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const res = await API.renameTeam(team.teamId, value);
      team.teamName = res.teamName;
      card.querySelector(".dash-card__team").textContent = res.teamName;
      nameForm.hidden = true;
      nameView.hidden = false;
    } catch (err) {
      nameError.textContent = err.message;
      nameError.hidden = false;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  });

  const actions = card.querySelector(".dash-card__actions");

  if (team.waLink) {
    const link = document.createElement("a");
    link.href = team.waLink;
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "btn btn--whatsapp dash-card__btn";
    link.textContent = "💬 Open Community Invite";
    actions.appendChild(link);
  } else if (!team.approved) {
    const note = document.createElement("p");
    note.className = "dash-card__note";
    note.textContent = "The community invite unlocks once an admin approves this team.";
    actions.appendChild(note);
  } else if (team.entryFeePending) {
    const note = document.createElement("p");
    note.className = "dash-card__note";
    note.textContent = "Pay the entry fee below to unlock the community invite.";
    actions.appendChild(note);
  }

  if (team.roomLive && !team.checkedIn) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--ghost dash-card__btn";
    btn.textContent = "Scroll to Room Details";
    // The room card lives on the public page, which is hidden while this view is
    // active — switch back first or the scroll would target an invisible element.
    btn.addEventListener("click", () => {
      showPublicView();
      el("roomBanner")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    actions.appendChild(btn);
  }

  return card;
}

async function renderDashboard() {
  const session = getGoogleSession();
  if (!session?.token) {
    dashboardSection.hidden = true;
    return;
  }
  // Content only — visibility of the view itself is owned by showDashboardView()/
  // showPublicView() now, so a background refresh never yanks the screen out from
  // under someone who navigated back to the public site.
  el("dashProfileName").textContent = session.user?.name || "Signed in";
  el("dashProfileEmail").textContent = session.user?.email || "";
  const profileAvatar = el("dashProfileAvatar");
  if (session.user?.picture) {
    profileAvatar.src = session.user.picture;
    profileAvatar.hidden = false;
  } else {
    profileAvatar.hidden = true;
  }

  const wrap = el("dashboardCards");
  try {
    const { teams } = await API.dashboard();
    wrap.textContent = "";
    if (!teams || teams.length === 0) {
      el("dashboardEmpty").hidden = false;
      return;
    }
    el("dashboardEmpty").hidden = true;
    for (const team of teams) wrap.appendChild(dashboardCard(team));
  } catch (err) {
    // An expired or invalid session shouldn't nag the team on every poll — sign them
    // out quietly and let them sign in again when they're ready.
    if (/sign in|session/i.test(err.message)) {
      clearGoogleSession();
      renderAuthUI();
    }
  }
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

el("checkInBtn").addEventListener("click", async () => {
  const auth = savedAuth();
  if (!auth) return showRoomGate("Your session has expired — unlock the room again.");
  const button = el("checkInBtn");
  const status = el("checkInStatus");
  button.disabled = true;
  button.textContent = "Checking in…";
  status.hidden = true;
  try {
    const result = await API.checkIn(auth.teamId, auth.password);
    status.textContent = `✅ ${result.team} checked in for ${result.match}.`;
    status.hidden = false;
    button.textContent = "Checked In";
  } catch (err) {
    status.textContent = "❌ " + err.message;
    status.hidden = false;
    button.disabled = false;
    button.textContent = "Check In for Match";
  }
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
    statusEl.textContent = info.approved
      ? "✅ Registration approved — your slot is confirmed."
      : "⏳ Payment is verified. Your registration is waiting for admin approval.";
    statusEl.classList.add("is-verified");
  } else if (status === "submitted") {
    statusEl.textContent = info.receiptSubmitted
      ? "⏳ Payment screenshot received. An admin is verifying it — your slot is safe until then."
      : `⏳ UTR ${info.utr || ""} received. An admin is verifying it — your slot is safe until then.`;
    statusEl.classList.add("is-submitted");
  } else {
    statusEl.textContent = "⚠️ Entry fee pending. Without payment your slot will be released.";
    statusEl.classList.add("is-pending");
  }

  /* The community invite is handed over only once the fee is verified, and the server
     is what decides that — an unverified team simply gets no link in the response, so
     there is nothing here to reveal early. */
  const waBtn = el("payWaLink");
  const waHref = status === "verified" && info.approved ? normalizeWaLink(info.waLink) : null;
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
    const qr = el("payQr");
    qr.src = fee.qrUrl || "qr.png";
    syncQrVisibility();
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
  const file = el("payReceipt").files[0];
  if (!utr && !file) return setUtrAlert("Enter a UTR or upload your payment screenshot.");
  if (file && (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 500 * 1024)) {
    return setUtrAlert("Upload a PNG, JPG or WEBP screenshot under 500 KB.");
  }

  const btn = el("utrBtn");
  btn.disabled = true;
  btn.textContent = "Submitting…";

  try {
    const receipt = file
      ? await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Could not read the screenshot"));
          reader.readAsDataURL(file);
        })
      : null;
    const info = await API.payment(auth.teamId, auth.password, utr, receipt);
    el("payUtr").value = "";
    el("payReceipt").value = "";
    el("payReceiptName").textContent = "No screenshot selected";
    el("payReceiptPreview").removeAttribute("src");
    el("payReceiptPreview").hidden = true;
    showPayPanel(info);
  } catch (err) {
    setUtrAlert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit Payment Reference";
  }
});

el("payReceipt").addEventListener("change", () => {
  const file = el("payReceipt").files[0];
  const preview = el("payReceiptPreview");
  if (!file) {
    el("payReceiptName").textContent = "No screenshot selected";
    preview.removeAttribute("src");
    preview.hidden = true;
    return;
  }
  el("payReceiptName").textContent = `${file.name} (${Math.ceil(file.size / 1024)} KB)`;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 500 * 1024) {
    preview.removeAttribute("src");
    preview.hidden = true;
    return;
  }
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
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
  el("announcementText").textContent = tournament.announcement || "";
  el("announcementBar").hidden = !tournament.announcement;
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
    await renderDashboard();
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

  // A signed-in captain finds this team again through My Teams, no password
  // needed — everyone else gets one back here and it's the only way in later.
  const credPassRow = el("credPassRow");
  if (res.password) {
    el("credPass").textContent = res.password;
    credPassRow.hidden = false;
  } else {
    credPassRow.hidden = true;
  }
  saveAuth(res.teamId, res.password || null);

  const waBtn = el("waLink");
  const link = normalizeWaLink(res.waLink);
  if (link) {
    waBtn.href = link;
    waBtn.hidden = false;
    el("modalHint").textContent = res.password
      ? "Save your Team ID & Password — you'll need them to check your status and room details later."
      : "Your Google account is how you'll find this team again — check the My Teams screen any time.";
  } else {
    // Either no community link is configured yet, or the entry fee is still unpaid
    // and the server is holding the link back. A dead button is worse than none.
    waBtn.removeAttribute("href");
    waBtn.hidden = true;
    el("modalHint").textContent = res.password
      ? "Save your Team ID & Password — screenshot this. The community link unlocks after payment verification and admin approval."
      : "Check the My Teams screen for updates — the community link unlocks after payment verification and admin approval.";
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
    el("modalTitle").lastChild.textContent = " reserved";
    payNote.textContent = "⏳ Your registration is waiting for admin approval. The slot and community link are confirmed after approval.";
    payNote.hidden = false;
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

/* ---------- Report a player ---------- */
/* Open to anyone, no sign-in required — a fair-play concern shouldn't wait on an
   account. The match dropdown is filled from whatever's currently live so a report
   can be pinned to the right lobby without typing an id. */
const reportModal = el("reportModal");
const reportForm = el("reportForm");

function setReportAlert(msg) {
  const alert = el("reportAlert");
  alert.textContent = msg || "";
  alert.hidden = !msg;
}

function openReportModal() {
  setReportAlert("");
  const select = el("reportMatch");
  select.innerHTML =
    `<option value="">Not sure / general</option>` +
    matches.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join("");
  reportForm.reset();
  reportModal.hidden = false;
}

el("openReportBtn").addEventListener("click", openReportModal);
reportModal.querySelector(".modal__close").addEventListener("click", () => {
  reportModal.hidden = true;
});
reportModal.querySelector(".modal__backdrop").addEventListener("click", () => {
  reportModal.hidden = true;
});

reportForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setReportAlert("");

  const matchId = el("reportMatch").value;
  const match = matches.find((m) => m.id === matchId);
  const saveBtn = el("reportSaveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Submitting…";

  try {
    await API.reportPlayer({
      matchId: matchId || null,
      matchName: match ? match.name : null,
      reporterTeam: el("reportYourTeam").value.trim(),
      reportedPlayer: el("reportPlayer").value.trim(),
      reason: el("reportReason").value.trim(),
    });
    reportModal.hidden = true;
    alert("✅ Report submitted — thanks for flagging it. Admins have been notified.");
  } catch (err) {
    setReportAlert(err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Submit Report";
  }
});

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
  accResults: () => renderResultsEditor(),
  accReports: () => renderReportsList(),
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
  el("mQrUrl").value = m?.entryFee?.qrUrl || "";
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

  const qrFile = el("mQrFile").files[0];
  let qrUrl = el("mQrUrl").value.trim();
  if (qrFile) {
    if (!/^image\/(png|jpeg|webp)$/.test(qrFile.type) || qrFile.size > 500 * 1024) {
      return setMatchEditAlert("Upload a PNG, JPG or WEBP QR image under 500 KB.");
    }
    qrUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read the QR image"));
      reader.readAsDataURL(qrFile);
    }).catch((err) => {
      setMatchEditAlert(err.message);
      return null;
    });
    if (!qrUrl) return;
  }

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
      qrUrl,
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
const receiptStore = new Map();

function registrationRow(matchId, r) {
  const members = Array.isArray(r.members) ? r.members : [];
  const squad = members.length
    ? `Squad: ${members.map(escapeHtml).join(", ")}<br/>`
    : "";
  const status = r.payment_status || "verified";
  const badge = PAY_BADGES[status] || PAY_BADGES.verified;
  const utr = r.utr ? `UTR: <strong>${escapeHtml(r.utr)}</strong><br/>` : "";
  const receipt = r.receipt_data
    ? (() => {
        const key = `${matchId}:${r.slot_number}`;
        receiptStore.set(key, r.receipt_data);
        return `<button type="button" class="receipt-link" data-receipt-key="${escapeHtml(key)}">🧾 View payment screenshot</button><br/>`;
      })()
    : "";
  const checkIn = r.checked_in_at
    ? '<span class="reg-badge is-verified">CHECKED IN</span><br/>'
    : "";

  // A team that has paid needs no verify button; one that hasn't can't be rejected.
  const actions = [
    status === "verified" && r.approval_status === "pending"
      ? `<button class="reg-act reg-act--ok" data-act="approve" data-match="${matchId}" data-slot="${r.slot_number}">✅ Approve Team</button>`
      : "",
    `<button class="reg-act" data-act="move" data-match="${matchId}" data-slot="${r.slot_number}">↔️ Move Slot</button>`,
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
    ${checkIn}${utr}${receipt}ID: ${escapeHtml(r.team_id)} · Pass: ${escapeHtml(r.password)}
    <div class="reg-acts">${actions}</div>
  </div>`;
}

async function renderRegistrations() {
  const regList = el("regList");
  regList.innerHTML = "<p style='text-align:center;color:var(--muted)'>Loading…</p>";

  try {
    await loadAdminMatches();
    renderRegistrationList();
  } catch (err) {
    regList.innerHTML = `<p style="text-align:center;color:var(--danger)">${escapeHtml(err.message)}</p>`;
  }
}

function renderRegistrationList() {
  const query = el("regSearch").value.trim().toLowerCase();
  const allRegistrations = adminMatches.flatMap((match) => match.registrations);
  const verified = allRegistrations.filter((registration) => (registration.payment_status || "verified") === "verified").length;
  const submitted = allRegistrations.filter((registration) => registration.payment_status === "submitted").length;
  const checkedIn = allRegistrations.filter((registration) => registration.checked_in_at).length;
  const available = adminMatches.reduce((total, match) => total + Math.max(0, match.totalSlots - match.registrations.length), 0);
  el("regSummary").innerHTML = [
    `<span><strong>${allRegistrations.length}</strong> teams</span>`,
    `<span class="is-good"><strong>${verified}</strong> verified</span>`,
    `<span class="is-warn"><strong>${submitted}</strong> proofs waiting</span>`,
    `<span class="is-good"><strong>${checkedIn}</strong> checked in</span>`,
    `<span><strong>${available}</strong> slots open</span>`,
  ].join("");
  el("regList").innerHTML = adminMatches.length
    ? adminMatches.map((match) => {
        const registrations = match.registrations.filter((registration) => {
          if (!query) return true;
          return [match.name, match.id, registration.team_name, registration.leader_name,
            registration.phone, registration.team_id, registration.payment_status || "verified"]
            .join(" ").toLowerCase().includes(query);
        });
        const rows = registrations.length
          ? registrations.map((registration) => registrationRow(match.id, registration)).join("")
          : "<p style='color:var(--muted);padding:8px 0'>No matching registrations</p>";
        return `
          <h3 style="margin:16px 0 2px;color:var(--accent-2)">
            ${escapeHtml(match.name)}
            <span style="color:var(--muted);font-size:0.78em;font-weight:400">
              ${match.id}${match.matchTime ? " · " + escapeHtml(match.matchTime) : ""} · ${registrations.length}/${match.totalSlots} shown
            </span>
          </h3>${rows}`;
      }).join("")
    : "<p style='text-align:center;color:var(--muted)'>No matches yet — create one in Manage Matches</p>";
}

/* ---------- Admin: 3-map leaderboard ---------- */
const RESULT_MAPS = ["Erangel", "Miramar", "Rondo"];

function setResultsAlert(message) {
  const alert = el("resultsAlert");
  alert.textContent = message || "";
  alert.hidden = !message;
}

function resultInput(slot, map, field, max) {
  return `<input type="number" min="${field === "placement" ? 1 : 0}" max="${max}" data-result-slot="${slot}" data-result-map="${map}" data-result-field="${field}" inputmode="numeric" required />`;
}

async function renderResultsEditor() {
  const editor = el("resultsEditor");
  editor.innerHTML = "<p style='color:var(--muted)'>Loading teams…</p>";
  try {
    await loadAdminMatches();
    const select = el("resultsMatch");
    const previous = select.value;
    select.innerHTML = adminMatches.map((match) =>
      `<option value="${escapeHtml(match.id)}">${escapeHtml(match.name)} (${match.id})</option>`
    ).join("");
    if (adminMatches.some((match) => match.id === previous)) select.value = previous;
    renderResultsRows();
  } catch (err) {
    editor.innerHTML = `<p style='color:var(--danger)'>${escapeHtml(err.message)}</p>`;
  }
}

function renderResultsRows() {
  const match = adminMatches.find((entry) => entry.id === el("resultsMatch").value);
  const editor = el("resultsEditor");
  if (!match) return (editor.innerHTML = "<p style='color:var(--muted)'>Create a match first.</p>");
  const teams = match.registrations;
  if (!teams.length) return (editor.innerHTML = "<p style='color:var(--muted)'>No booked slots for this match yet.</p>");
  editor.innerHTML = `<table class="results-editor"><thead><tr><th>Team</th>${RESULT_MAPS.map((map) => `<th>${map}<br/><small>Place / Kills</small></th>`).join("")}</tr></thead><tbody>${teams.map((team) =>
    `<tr><td><strong>#${String(team.slot_number).padStart(2, "0")}</strong> ${escapeHtml(team.team_name)}</td>${RESULT_MAPS.map((map) =>
      `<td><span class="results-editor__inputs">${resultInput(team.slot_number, map, "placement", match.totalSlots)}${resultInput(team.slot_number, map, "kills", 100)}</span></td>`
    ).join("")}</tr>`
  ).join("")}</tbody></table>`;
  updateResultsPreview();
}

const RESULT_POINTS = { 1: 10, 2: 6, 3: 5, 4: 4, 5: 3, 6: 2, 7: 1, 8: 1 };

function updateResultsPreview() {
  const match = adminMatches.find((entry) => entry.id === el("resultsMatch").value);
  if (!match) return;
  const totals = new Map();
  for (const team of match.registrations) {
    totals.set(Number(team.slot_number), { slot: Number(team.slot_number), team: team.team_name, points: 0, kills: 0, wwcd: 0, bestPlacement: 99 });
  }
  for (const input of el("resultsEditor").querySelectorAll("[data-result-slot]")) {
    const row = totals.get(Number(input.dataset.resultSlot));
    const value = Number(input.value);
    if (!row || !Number.isFinite(value)) continue;
    if (input.dataset.resultField === "kills") {
      row.kills += value;
      row.points += value;
    } else {
      row.points += RESULT_POINTS[value] || 0;
      row.wwcd += value === 1 ? 1 : 0;
      row.bestPlacement = Math.min(row.bestPlacement, value || 99);
    }
  }
  const ranked = [...totals.values()].sort((a, b) => b.points - a.points || b.wwcd - a.wwcd || b.kills - a.kills || a.bestPlacement - b.bestPlacement);
  el("resultsPreview").innerHTML = ranked.map((row, index) =>
    `<span><strong>${index + 1}.</strong> #${String(row.slot).padStart(2, "0")} ${escapeHtml(row.team)} <b>${row.points}</b></span>`
  ).join("");
}

el("resultsEditor").addEventListener("input", updateResultsPreview);

el("resultsMatch").addEventListener("change", () => {
  setResultsAlert("");
  renderResultsRows();
});

el("publishResultsBtn").addEventListener("click", async () => {
  const match = adminMatches.find((entry) => entry.id === el("resultsMatch").value);
  if (!match) return setResultsAlert("Choose a match first.");
  const rowsBySlot = new Map();
  for (const input of el("resultsEditor").querySelectorAll("[data-result-slot]")) {
    const slot = Number(input.dataset.resultSlot);
    const row = rowsBySlot.get(slot) || { slot, maps: {} };
    const map = input.dataset.resultMap;
    row.maps[map] = row.maps[map] || {};
    row.maps[map][input.dataset.resultField] = input.value;
    rowsBySlot.set(slot, row);
  }
  const rows = [...rowsBySlot.values()];
  if (!rows.length || rows.some((row) => RESULT_MAPS.some((map) => !row.maps[map]?.placement || row.maps[map]?.kills === ""))) {
    return setResultsAlert("Enter placement and kills for every approved team across all 3 maps.");
  }
  const button = el("publishResultsBtn");
  button.disabled = true;
  button.textContent = "Publishing…";
  setResultsAlert("");
  try {
    await API.publishResults(match.id, rows, adminKey);
    leaderboardRequestId = match.id;
    await renderLeaderboard();
    setResultsAlert("✅ Top 8 published on the public dashboard.");
  } catch (err) {
    setResultsAlert(err.message);
  } finally {
    button.disabled = false;
    button.textContent = "Publish Top 8";
  }
});

el("regSearch").addEventListener("input", renderRegistrationList);
el("refreshRegistrationsBtn").addEventListener("click", async () => {
  const button = el("refreshRegistrationsBtn");
  button.disabled = true;
  button.textContent = "Refreshing…";
  try {
    await renderRegistrations();
  } finally {
    button.disabled = false;
    button.textContent = "Refresh";
  }
});

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

el("exportRegistrationsBtn").addEventListener("click", () => {
  const query = el("regSearch").value.trim().toLowerCase();
  const rows = [["Match", "Slot", "Status", "Team", "Leader", "Phone", "Members", "Team ID", "Password", "UTR", "Receipt"]];
  for (const match of adminMatches) {
    for (const registration of match.registrations) {
      const searchable = [match.name, match.id, registration.team_name, registration.leader_name,
        registration.phone, registration.team_id, registration.payment_status || "verified"]
        .join(" ").toLowerCase();
      if (query && !searchable.includes(query)) continue;
      rows.push([
        match.name, registration.slot_number, registration.payment_status || "verified",
        registration.team_name, registration.leader_name, registration.phone,
        (registration.members || []).join(" | "), registration.team_id, registration.password,
        registration.utr || "", registration.receipt_data ? "Yes" : "No",
      ]);
    }
  }
  const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fragify-registrations-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

/* ---------- Admin: manual verified team ---------- */
const manualTeamModal = el("manualTeamModal");
const manualTeamForm = el("manualTeamForm");

function setManualTeamAlert(msg) {
  const alert = el("manualTeamAlert");
  alert.textContent = msg || "";
  alert.hidden = !msg;
}

function openManualTeamModal() {
  setManualTeamAlert("");
  const select = el("manualMatch");
  select.innerHTML = adminMatches.map((m) =>
    `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)} (${m.registrations.length}/${m.totalSlots})</option>`
  ).join("");
  manualTeamForm.reset();
  if (adminMatches.length) select.value = adminMatches[0].id;
  manualTeamModal.hidden = false;
}

el("manualTeamBtn").addEventListener("click", openManualTeamModal);
manualTeamModal.querySelector(".modal__close").addEventListener("click", () => {
  manualTeamModal.hidden = true;
});
manualTeamModal.querySelector(".modal__backdrop").addEventListener("click", () => {
  manualTeamModal.hidden = true;
});

manualTeamForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setManualTeamAlert("");
  const saveBtn = el("manualTeamSaveBtn");
  const data = {
    teamName: el("manualTeamName").value.trim(),
    leaderName: el("manualLeaderName").value.trim(),
    phone: el("manualPhone").value.trim(),
    members: el("manualMembers").value.split("\n").map((value) => value.trim()).filter(Boolean),
    slot: el("manualSlot").value.trim(),
  };
  saveBtn.disabled = true;
  saveBtn.textContent = "Adding…";
  try {
    const result = await API.addRegistration(el("manualMatch").value, data, adminKey);
    manualTeamModal.hidden = true;
    await renderRegistrations();
    await renderMatchList();
    await renderSlots();
    alert(`✅ Team added\n\nSlot: #${String(result.registration.slot_number).padStart(2, "0")}\nTeam ID: ${result.registration.team_id}\nPassword: ${result.registration.password}`);
  } catch (err) {
    setManualTeamAlert(err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Add Verified Team";
  }
});

/* Delegated: the rows are rebuilt after every action, so per-button listeners would
   be re-bound each time. */
el("regList").addEventListener("click", async (e) => {
  const receiptButton = e.target.closest(".receipt-link");
  if (receiptButton) {
    const receipt = receiptStore.get(receiptButton.dataset.receiptKey);
    if (!receipt) return alert("Receipt is no longer available. Refresh the list.");
    const preview = window.open("", "_blank");
    if (!preview) return alert("Allow pop-ups to view the payment screenshot.");
    preview.document.title = "Payment Screenshot";
    preview.document.body.textContent = "Loading screenshot…";
    try {
      const blob = await fetch(receipt).then((response) => response.blob());
      preview.location.href = URL.createObjectURL(blob);
    } catch {
      preview.close();
      alert("Could not open this payment screenshot.");
    }
    return;
  }
  const btn = e.target.closest(".reg-act");
  if (!btn) return;

  const act = btn.dataset.act;
  const matchId = btn.dataset.match;
  const slot = Number(btn.dataset.slot);
  const label = `${matchId} · #${String(slot).padStart(2, "0")}`;

  const confirms = {
      approve: `Approve registration for slot ${label}? The community link will unlock for this team.`,
    move: "Move this team to the selected destination slot?",
    verify: `Mark the payment for slot ${label} as verified?`,
    reject: `Reject the UTR for slot ${label}? The team will get another chance to pay.`,
    cancel: `Cancel slot ${label}? The team is removed and the slot goes to the next registration.`,
  };
  if (act === "move") {
    const destination = prompt(`Destination slot for ${label}:`);
    if (destination === null || !destination.trim()) return;
    const toSlot = Number(destination.trim());
    if (!Number.isInteger(toSlot)) return alert("Enter a valid slot number.");
    btn.disabled = true;
    try {
      await API.moveRegistration(matchId, slot, toSlot, adminKey);
      await renderRegistrations();
      await renderSlots();
    } catch (err) {
      alert("❌ " + err.message);
      btn.disabled = false;
    }
    return;
  }
  if (!confirm(confirms[act])) return;

  btn.disabled = true;
  try {
    if (act === "verify") await API.verifyPayment(matchId, slot, adminKey);
    else if (act === "approve") await API.approveRegistration(matchId, slot, adminKey);
    else if (act === "reject") await API.rejectPayment(matchId, slot, adminKey);
    else await API.cancelRegistration(matchId, slot, adminKey);
    await renderRegistrations();
    await renderSlots();
  } catch (err) {
    alert("❌ " + err.message);
    btn.disabled = false;
  }
});

/* ---------- Admin: player reports ---------- */
async function renderReportsList() {
  const box = el("reportsList");
  box.innerHTML = "<p style='text-align:center;color:var(--muted)'>Loading…</p>";
  try {
    const { reports } = await API.listReports(adminKey);
    box.innerHTML = reports.length
      ? reports.map((r) => `
        <div style="border-bottom:1px solid var(--border);padding:12px 0" data-report-id="${escapeHtml(r.id)}">
          <strong style="color:var(--accent)">${escapeHtml(r.reportedPlayer)}</strong>
          <span class="reg-badge ${r.status === "resolved" ? "is-verified" : "is-pending"}">${r.status === "resolved" ? "RESOLVED" : "OPEN"}</span><br/>
          Match: ${escapeHtml(r.matchName || r.matchId || "—")} · Reported by: ${escapeHtml(r.reporterTeam)}<br/>
          ${escapeHtml(r.reason)}<br/>
          <small style="color:var(--muted)">${new Date(r.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</small>
          <div class="reg-acts">
            ${r.status !== "resolved" ? `<button class="reg-act reg-act--ok" data-report-act="resolve">✅ Mark Resolved</button>` : ""}
            <button class="reg-act reg-act--danger" data-report-act="delete">🗑️ Delete</button>
          </div>
        </div>`).join("")
      : "<p style='text-align:center;color:var(--muted)'>No reports filed yet.</p>";
  } catch (err) {
    box.innerHTML = `<p style="text-align:center;color:var(--danger)">${escapeHtml(err.message)}</p>`;
  }
}

el("reportsList").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-report-act]");
  if (!btn) return;
  const id = btn.closest("[data-report-id]")?.dataset.reportId;
  if (!id) return;
  btn.disabled = true;
  try {
    if (btn.dataset.reportAct === "resolve") await API.resolveReport(id, adminKey);
    else await API.deleteReport(id, adminKey);
    await renderReportsList();
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
  detailsForm.announcement.value = tournament.announcement || "";
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
  payload.announcement = detailsForm.announcement.value.trim();

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
  renderAuthUI();
  initGoogleSignIn();
  await renderSlots();
  await loadDetails();
  await renderDashboard();
})();
setInterval(renderSlots, 10000); // keep the counters and boards fresh
// Slower than the slot poll: this also re-checks the team's payment status, and an
// admin verifying a payment isn't something that needs second-by-second freshness.
setInterval(loadDetails, 30000);
setInterval(renderDashboard, 15000);
