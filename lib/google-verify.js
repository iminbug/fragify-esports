import { createPublicKey, verify as cryptoVerify } from "crypto";

/* Verifies a Google Sign-In ID token with zero third-party libraries — this
   workspace has no npm registry access, so the same RS256/JWKS check that
   google-auth-library performs is done here with Node's built-in crypto. */

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const CACHE_MS = 60 * 60 * 1000; // Google rotates keys every few hours at most.

let cachedKeys = null;
let cachedAt = 0;

function fromB64url(input) {
  return Buffer.from(String(input).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function jsonFromB64url(input) {
  return JSON.parse(fromB64url(input).toString("utf8"));
}

async function fetchGoogleKeys() {
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error("Could not fetch Google signing keys");
  const data = await res.json();
  return Array.isArray(data.keys) ? data.keys : [];
}

async function getGoogleKeys({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cachedKeys && now - cachedAt < CACHE_MS) return cachedKeys;
  cachedKeys = await fetchGoogleKeys();
  cachedAt = now;
  return cachedKeys;
}

/* Returns { sub, email, name, picture } once the token checks out, or throws.
   Checked, in order: signature (against Google's published JWKS), issuer,
   audience (our Client ID), expiry, and that the email is verified. */
export async function verifyGoogleIdToken(idToken, clientId) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("Malformed Google credential");
  const [headerB64, payloadB64, sigB64] = parts;

  const header = jsonFromB64url(headerB64);
  const payload = jsonFromB64url(payloadB64);
  if (header.alg !== "RS256") throw new Error("Unexpected signing algorithm");

  let keys = await getGoogleKeys();
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // Keys rotate on Google's side; one forced refresh covers that window.
    keys = await getGoogleKeys({ forceRefresh: true });
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new Error("Unknown signing key");

  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const signedData = Buffer.from(`${headerB64}.${payloadB64}`);
  const signature = fromB64url(sigB64);
  const validSignature = cryptoVerify("RSA-SHA256", signedData, publicKey, signature);
  if (!validSignature) throw new Error("Invalid token signature");

  if (!ISSUERS.has(payload.iss)) throw new Error("Invalid token issuer");
  if (!clientId || payload.aud !== clientId) throw new Error("Token was not issued for this app");
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
    throw new Error("Token has expired");
  }
  if (!payload.email || payload.email_verified !== true) {
    throw new Error("Google account email is not verified");
  }

  return {
    sub: String(payload.sub),
    email: String(payload.email).toLowerCase(),
    name: String(payload.name || "").trim(),
    picture: String(payload.picture || ""),
  };
}
