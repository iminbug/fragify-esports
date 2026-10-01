import { createHmac, timingSafeEqual } from "crypto";

/* App-issued session tokens, handed out once after a Google ID token is verified
   (see api/auth.js). No JWT library needed — this is one HMAC check, the same
   shape a hand-rolled JWT would use: base64url(payload).base64url(signature). */

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(str) {
  return Buffer.from(String(str).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

function sign(body) {
  return b64url(createHmac("sha256", sessionSecret()).update(body).digest());
}

export function createSession(user) {
  const payload = {
    sub: user.sub,
    email: user.email,
    name: user.name || "",
    picture: user.picture || "",
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${sign(body)}`;
}

/* Returns the decoded payload for a valid, unexpired token — or null. Never
   throws, so callers can treat "no session" and "bad session" the same way. */
export function verifySession(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  let expectedSig;
  try {
    expectedSig = sign(body);
  } catch {
    return null;
  }
  const given = Buffer.from(sig);
  const expected = Buffer.from(expectedSig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* Reads the bearer token from the Authorization header, falling back to a
   sessionToken field in the JSON body for simple POST callers. */
export function sessionFromRequest(req) {
  const header = req.headers?.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match ? match[1] : req.body?.sessionToken;
  return verifySession(token);
}
