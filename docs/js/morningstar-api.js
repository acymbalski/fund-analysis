/**
 * morningstar-api.js — Morningstar data source via self-hosted mstar-backend.
 *
 * Exports the same interface as api.js (fetchChart, fetchSummary) so main.js
 * can swap sources transparently.
 *
 * Auth flow:
 *   1. User enters M* credentials → POST /auth → receive Bearer token
 *   2. Token stored in sessionStorage (cleared on tab close; credentials never stored)
 *   3. All requests include Authorization: Bearer <token>
 *   4. On 401 response → token expired, clear token + re-prompt credentials
 */

export const MSTAR_BACKEND = 'https://mstarapi.cymbal.ski';

const SESSION_KEY = 'funds_mstar_token';

export function getMstarToken() {
  return sessionStorage.getItem(SESSION_KEY);
}

export function setMstarToken(token) {
  sessionStorage.setItem(SESSION_KEY, token);
}

export function clearMstarToken() {
  sessionStorage.removeItem(SESSION_KEY);
}

function authHeaders() {
  const token = getMstarToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Authenticate with mstar-backend using M* credentials.
 * Returns the session token on success; throws on failure.
 * Credentials are sent over HTTPS and never stored client-side.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<string>} token
 */
export async function authenticate(email, password) {
  const res = await fetch(`${MSTAR_BACKEND}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Auth failed: HTTP ${res.status}`);
  }
  const { token } = await res.json();
  setMstarToken(token);
  return token;
}

async function mstarFetch(path) {
  const res = await fetch(`${MSTAR_BACKEND}${path}`, { headers: authHeaders() });
  if (res.status === 401) {
    clearMstarToken();
    throw new Error('Morningstar session expired — please re-authenticate');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Morningstar request failed: HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch NAV history from mstar-backend.
 * Returns same shape as api.js fetchChart: { timestamps: Date[], prices: number[] }
 *
 * @param {string} ticker
 * @param {string} range - "10y" | "2y" | "6m" etc.
 */
export async function fetchChart(ticker, range = '10y') {
  const data = await mstarFetch(`/fund/${encodeURIComponent(ticker)}/chart?range=${range}`);
  // Backend returns ISO date strings; convert to Date objects to match api.js contract
  return {
    timestamps: data.timestamps.map(s => new Date(s)),
    prices: data.prices,
  };
}

/**
 * Fetch normalized fund metadata from mstar-backend.
 * Returns the already-normalized object — no further parsing needed in calc.js.
 *
 * @param {string} ticker
 * @returns {object} normalized summary (see parseMorningstarSummary in calc.js)
 */
export async function fetchSummary(ticker) {
  return mstarFetch(`/fund/${encodeURIComponent(ticker)}/summary`);
}
