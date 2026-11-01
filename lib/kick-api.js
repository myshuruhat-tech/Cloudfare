// Proxies read-only Kick public API calls so the client secret never reaches
// the browser. Uses an app access token (client_credentials) obtained
// server-side with KICK_CLIENT_SECRET from Cloudflare Variables and Secrets.
//
// Usage from the page:
//   /api/kick-api?p=livestreams&sort=viewer_count&limit=24
//   /api/kick-api?p=channels&slug=a&slug=b
//   /api/kick-api?diag=1     (checks the secret, reveals nothing)

const ALLOWED = new Set(['livestreams', 'channels']);
const DEFAULT_CLIENT_ID = process.env.KICK_CLIENT_ID || '';

let cached = null; // { value, exp } - lives only while the function instance is warm

const json = (status, body, extra = {}) => ({
  statusCode: status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...extra,
  },
  body: JSON.stringify(body),
});

async function getAppToken(clientId) {
  if (cached && cached.exp > Date.now() && cached.cid === clientId) return { token: cached.value };
  const secret = process.env.KICK_CLIENT_SECRET;
  if (!secret) return { error: 'KICK_CLIENT_SECRET is not set in Cloudflare', status: 500 };
  if (!clientId) return { error: 'No client id (set KICK_CLIENT_ID or pass client_id)', status: 400 };

  const res = await fetch('https://id.kick.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: secret,
    }).toString(),
  });
  const text = await res.text();
  if (!res.ok) return { error: 'Token request failed', status: res.status, detail: text.slice(0, 200) };
  let data;
  try { data = JSON.parse(text); } catch (e) { return { error: 'Bad token response', status: 502 }; }
  cached = {
    value: data.access_token,
    exp: Date.now() + Math.max(60, (data.expires_in || 3600) - 60) * 1000,
    cid: clientId,
  };
  return { token: cached.value };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'GET only' });

  const params = event.multiValueQueryStringParameters || {};
  const first = (k) => (params[k] && params[k][0]) || '';
  const clientId = DEFAULT_CLIENT_ID || first('client_id');

  // Diagnostic: tells which secret Cloudflare holds and whether Kick accepts it.
  if (first('diag')) {
    const secret = process.env.KICK_CLIENT_SECRET || '';
    cached = null;
    const r = await getAppToken(clientId);
    return json(200, {
      secretSet: !!secret,
      secretEndsWith: secret ? secret.slice(-4) : null,
      clientIdUsed: clientId ? clientId.slice(0, 4) + '...' + clientId.slice(-4) : null,
      kickAccepts: !!r.token,
      kickStatus: r.status || 200,
      detail: r.detail || null,
      geminiKeySet: !!process.env.GEMINI_API_KEY,
    });
  }

  const p = first('p');
  if (!ALLOWED.has(p)) return json(400, { error: 'Unsupported path' });

  const auth = await getAppToken(clientId);
  if (!auth.token) return json(auth.status || 502, { error: auth.error, detail: auth.detail || null });

  const qs = new URLSearchParams();
  for (const [k, vals] of Object.entries(params)) {
    if (k === 'p' || k === 'client_id' || k === 'diag') continue;
    for (const v of vals) qs.append(k, v);
  }

  const res = await fetch(`https://api.kick.com/public/v1/${p}?${qs.toString()}`, {
    headers: { Authorization: 'Bearer ' + auth.token },
  });

  // Token revoked/expired early: drop the cache so the next call refreshes.
  if (res.status === 401) cached = null;

  const body = await res.text();
  return {
    statusCode: res.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15' },
    body,
  };
};
