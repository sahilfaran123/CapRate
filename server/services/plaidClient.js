import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

// Plaid's "Development" trial plan uses sandbox infrastructure.
// Only switch to production URL when PLAID_ENV is explicitly 'production'.
const basePath = process.env.PLAID_ENV === 'production'
  ? PlaidEnvironments.production
  : PlaidEnvironments.sandbox;

const configuration = new Configuration({
  basePath,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET':    process.env.PLAID_SECRET,
    },
  },
});

const rawClient = new PlaidApi(configuration);

/**
 * ─── Plaid request layer: coalescing, caching, and 429 resilience ───────────
 *
 * A single page load fans out into many Plaid calls — the dashboard fetches
 * accounts, investments fetches balances AND holdings, each linked property
 * fetches transactions and balances, and the snapshot job fetches balances
 * again. Many are the SAME request for the same token, issued milliseconds
 * apart, which is what trips Plaid's per-item rate limit.
 *
 * Four mechanisms, in order of importance:
 *
 *  1. In-flight coalescing — identical concurrent requests share one HTTP call.
 *  2. Short-TTL cache — repeats within a render pass are served from memory.
 *  3. Stale-on-error — when Plaid returns 429, the last good response is
 *     returned instead of an error. This is what stops the death spiral: the
 *     UI keeps rendering, so the user stops refreshing, so the rate limit
 *     window actually gets a chance to clear.
 *  4. Cooldown + backoff — after a 429, further calls for that token are served
 *     from cache for a cooldown period instead of hitting Plaid at all.
 */

const TTL = {
  accountsBalanceGet:     60_000,   // 60s
  accountsGet:            60_000,
  investmentsHoldingsGet: 120_000,  // 2m
  transactionsGet:        300_000,  // 5m — transaction history moves slowly
};

// How long to stop calling Plaid for a token after it returns 429.
const RATE_LIMIT_COOLDOWN_MS = 60_000;

const cache     = new Map();   // key -> { value, expiresAt }
const lastGood  = new Map();   // key -> value (never expires; disaster fallback)
const inFlight  = new Map();   // key -> Promise
const cooldowns = new Map();   // tokenHash -> timestamp when cooldown ends

// Access tokens must never appear in a cache key in readable form.
function hashToken(token = '') {
  let h = 0;
  for (let i = 0; i < token.length; i++) {
    h = ((h << 5) - h + token.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function cacheKey(method, params = {}) {
  const { access_token, ...rest } = params;
  return `${method}:${hashToken(access_token)}:${JSON.stringify(rest)}`;
}

function sweep() {
  const now = Date.now();
  for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
}

function isRateLimited(err) {
  return err?.response?.status === 429;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function wrap(method) {
  const ttl = TTL[method];

  return async (params) => {
    if (!ttl) return rawClient[method](params);

    const key       = cacheKey(method, params);
    const tokenHash = hashToken(params?.access_token);
    const now       = Date.now();

    // 1. Fresh cache hit
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) return hit.value;

    // 2. Token is in cooldown after a 429 — do not call Plaid at all.
    //    Serve whatever we last had rather than generating more 429s.
    const cooldownUntil = cooldowns.get(tokenHash);
    if (cooldownUntil && cooldownUntil > now) {
      const stale = hit?.value || lastGood.get(key);
      if (stale) return stale;
      const err = new Error('Plaid rate limit cooldown active');
      err.response = { status: 429, data: { error_code: 'RATE_LIMIT_COOLDOWN' } };
      throw err;
    }

    // 3. An identical request is already open — share its result
    const pending = inFlight.get(key);
    if (pending) return pending;

    const promise = (async () => {
      let lastErr;
      // One retry with jittered backoff; beyond that we fall back to stale data.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await rawClient[method](params);
          cache.set(key, { value: res, expiresAt: Date.now() + ttl });
          lastGood.set(key, res);
          cooldowns.delete(tokenHash);
          if (cache.size > 500) sweep();
          return res;
        } catch (err) {
          lastErr = err;
          if (!isRateLimited(err)) throw err;

          if (attempt === 0) {
            await sleep(750 + Math.random() * 500);
            continue;
          }
          cooldowns.set(tokenHash, Date.now() + RATE_LIMIT_COOLDOWN_MS);
        }
      }

      // Rate limited and out of retries: serve stale data if we have any.
      const stale = lastGood.get(key);
      if (stale) return stale;
      throw lastErr;
    })().finally(() => inFlight.delete(key));

    inFlight.set(key, promise);
    return promise;
  };
}

const wrapped = new Map();

/**
 * Proxy that transparently applies the request layer to read methods.
 * Write methods (linkTokenCreate, itemPublicTokenExchange, itemRemove, ...)
 * pass through untouched — they must never be cached, shared, or retried.
 */
export const plaidClient = new Proxy(rawClient, {
  get(target, prop) {
    const value = target[prop];
    if (typeof value !== 'function') return value;
    if (!(prop in TTL)) return value.bind(target);
    if (!wrapped.has(prop)) wrapped.set(prop, wrap(prop));
    return wrapped.get(prop);
  },
});

/**
 * Drop cached Plaid responses for one access token — call after any mutation
 * that changes what Plaid would return. Omit the token to clear everything.
 */
export function invalidatePlaidCache(accessToken = null) {
  if (!accessToken) {
    cache.clear();
    lastGood.clear();
    cooldowns.clear();
    return;
  }
  const tokenHash = hashToken(accessToken);
  for (const key of cache.keys())    if (key.split(':')[1] === tokenHash) cache.delete(key);
  for (const key of lastGood.keys()) if (key.split(':')[1] === tokenHash) lastGood.delete(key);
  cooldowns.delete(tokenHash);
}

export default plaidClient;
