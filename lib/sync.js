// Per-account cloud copy of favorites / watch history / list of downloads, so a reinstall or a new
// device does not lose them. Identity = the Kick account behind the OAuth token
// the app already holds; the token is verified with Kick on every (uncached) call.
//
//   GET  /api/sync                -> { keys: { name: { v, t } } }
//   PUT  /api/sync  { keys: {...} } -> merged doc (per-key, newest t wins)
//   GET  /api/sync?action=diag    -> { storage: true|false }  (no auth, reveals nothing)
//
// Storage: Upstash Redis through lib/blobs-shim.js.

const crypto = require('crypto');

const STORE = 'livescreen-sync';
const LIMITS = { favorites: 500, blocked: 500, library: 80, watch_history: 60, downloads: 100, playlists: 30 }; // list names -> max items
const OBJECTS = new Set(['account']);                                              // object-valued names
const MAX_BODY = 600 * 1024;

const tokenCache = new Map(); // sha256(token) -> { id, exp }   (warm instance only)

const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

function blobs() {
  return require('./blobs-shim');
}

// null = Kick rejected the token, undefined = could not verify (Kick down / unknown shape), string = user id
async function kickUserId(token) {
  const h = crypto.createHash('sha256').update(token).digest('hex');
  const hit = tokenCache.get(h);
  if (hit && hit.exp > Date.now()) return hit.id;
  const urls = ['https://api.kick.com/public/v1/users', 'https://api.kick.com/v1/users/me'];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { Authorization: 'Bearer ' + token } });
      if (r.status === 401) return null;
      if (!r.ok) continue;
      const d = await r.json();
      const x = d && Array.isArray(d.data) ? d.data[0] : (d && d.data) || d;
      const raw = x && (x.user_id || x.id);
      if (raw) {
        const id = String(raw).replace(/[^A-Za-z0-9_-]/g, '');
        if (id) {
          if (tokenCache.size > 200) tokenCache.clear();
          tokenCache.set(h, { id, exp: Date.now() + 5 * 60 * 1000 });
          return id;
        }
      }
    } catch (e) { /* try next endpoint */ }
  }
  return undefined;
}

function cleanEntry(name, e) {
  if (!e || typeof e !== 'object' || typeof e.t !== 'number' || !isFinite(e.t)) return null;
  if (Object.prototype.hasOwnProperty.call(LIMITS, name)) {
    if (!Array.isArray(e.v)) return null;
    return { v: e.v.slice(0, LIMITS[name]), t: e.t };
  }
  if (OBJECTS.has(name)) {
    if (!e.v || typeof e.v !== 'object' || Array.isArray(e.v)) return null;
    return { v: e.v, t: e.t };
  }
  return null; // unknown name
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const action = (event.queryStringParameters && event.queryStringParameters.action) || '';

  try {
    if (method === 'GET' && action === 'diag') {
      let ok = true;
      try { blobs().getStore(STORE); } catch (e) { ok = false; }
      let st = {}; try { st = blobs().cfgStatus(); } catch (e) {}
      return json(200, { storage: ok, ...st });
    }
    if (method !== 'GET' && method !== 'PUT') return json(405, { error: 'method_not_allowed' });

    const auth = event.headers.authorization || event.headers.Authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m) return json(401, { error: 'missing_token' });
    const uid = await kickUserId(m[1].trim());
    if (uid === null) return json(401, { error: 'invalid_token' });
    if (uid === undefined) return json(502, { error: 'cannot_verify_token' });

    let store;
    try {
      const b = blobs();
      if (typeof b.connectLambda === 'function') b.connectLambda(event);
      store = b.getStore(STORE);
    } catch (e) {
      return json(500, { error: 'storage_unavailable', message: String(e && e.message || e) });
    }
    const key = 'user-' + uid;
    const current = (await store.get(key, { type: 'json' })) || { keys: {} };
    if (!current.keys) current.keys = {};

    if (method === 'GET') return json(200, { keys: current.keys });

    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
    if (raw.length > MAX_BODY) return json(413, { error: 'too_large' });
    let body;
    try { body = JSON.parse(raw); } catch (e) { return json(400, { error: 'bad_json' }); }
    const incoming = body && body.keys;
    if (!incoming || typeof incoming !== 'object') return json(400, { error: 'missing_keys' });

    let changed = false;
    for (const name of Object.keys(incoming)) {
      const e = cleanEntry(name, incoming[name]);
      if (!e) continue;
      const old = current.keys[name];
      if (!old || e.t >= old.t) { current.keys[name] = e; changed = true; }
    }
    if (changed) await store.setJSON(key, current);
    return json(200, { keys: current.keys });
  } catch (err) {
    return json(500, { error: 'server_error', message: String(err && err.message || err) });
  }
};
