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
