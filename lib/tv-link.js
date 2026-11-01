// TV <-> phone login link (device-code flow).
//   POST ?action=start                      -> { user_code, device_code, expires_in, interval }   (TV)
//   GET  ?action=poll&user_code=&device_code= -> { status:'pending'|'expired'|'ok', auth? }          (TV, every ~3s)
//   POST ?action=approve { user_code, auth, tt? } -> { ok:true }                                         (phone /activate page)
// Storage: Upstash Redis (lib/blobs-shim.js), entries live 10 minutes.

const crypto = require('crypto');
const STORE = 'livescreen-tvlink';
const TTL = 10 * 60 * 1000;
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (s, b) => ({ statusCode: s, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(b) });

function newUserCode() {
  const r = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHA[r[i] % ALPHA.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4}).*$/, '$1-$2');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  const q = event.queryStringParameters || {};
  const action = q.action || '';

  let store;
  try {
    const b = require('./blobs-shim');
    if (typeof b.connectLambda === 'function') b.connectLambda(event);
    store = b.getStore(STORE);
  } catch (e) {
    return json(500, { error: 'storage_unavailable', message: String((e && e.message) || e) });
  }

  try {
    if (action === 'start' && event.httpMethod === 'POST') {
      const user_code = newUserCode();
      const device_code = crypto.randomBytes(24).toString('hex');
      await store.setJSON('c-' + user_code, { device_code, exp: Date.now() + TTL, auth: null });
      return json(200, { user_code, device_code, expires_in: TTL / 1000, interval: 3 });
    }

    if (action === 'poll' && event.httpMethod === 'GET') {
      const user_code = normCode(q.user_code);
      const rec = await store.get('c-' + user_code, { type: 'json' });
      if (!rec || rec.device_code !== q.device_code || rec.exp < Date.now()) return json(200, { status: 'expired' });
      if (!rec.auth) return json(200, { status: 'pending' });
      await store.delete('c-' + user_code);
      return json(200, { status: 'ok', auth: rec.auth, tt: rec.tt || '' });
    }

    if (action === 'approve' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const user_code = normCode(body.user_code);
      const auth = body.auth;
      if (!auth || typeof auth.access_token !== 'string' || auth.access_token.length < 10) return json(400, { error: 'bad_auth' });
      const rec = await store.get('c-' + user_code, { type: 'json' });
      if (!rec || rec.exp < Date.now()) return json(404, { error: 'code_not_found' });
      rec.auth = auth;
      rec.tt = String(body.tt || '').replace(/^@/, '').replace(/[^A-Za-z0-9_.]/g, '').slice(0, 40);
      await store.setJSON('c-' + user_code, rec);
      return json(200, { ok: true });
    }

    return json(404, { error: 'unknown_action' });
  } catch (err) {
    return json(500, { error: 'server_error', message: String(err) });
  }
};
