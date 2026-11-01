// Secure server-side proxy for Kick OAuth (PKCE).
// Kick's token endpoint requires client_secret even for PKCE public flows,
// so that exchange must happen here — never in the browser.
//
// Required Cloudflare Variables and Secrets (Site configuration -> Environment variables):
//   KICK_CLIENT_ID      (same value entered in the app's Settings screen)
//   KICK_CLIENT_SECRET  (from the Kick Developer dashboard — kept secret, server-only)

const TOKEN_URL = 'https://id.kick.com/oauth/token';
const API_BASE = 'https://api.kick.com/v1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  const CLIENT_ID = process.env.KICK_CLIENT_ID;
  const CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;
  const action = (event.queryStringParameters && event.queryStringParameters.action) || '';

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return json(500, { error: 'server_not_configured', message: 'KICK_CLIENT_ID / KICK_CLIENT_SECRET missing in Cloudflare Variables and Secrets.' });
  }

  try {
    if (action === 'config' && event.httpMethod === 'GET') {
      return json(200, { client_id: CLIENT_ID, redirect_uri: process.env.KICK_REDIRECT_URI || null }); // client id is public (it is in the authorize URL anyway)
    }

    if (action === 'token' && event.httpMethod === 'POST') {
      const { code, code_verifier, redirect_uri } = JSON.parse(event.body || '{}');
      if (!code || !code_verifier || !redirect_uri) return json(400, { error: 'missing_params' });

      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri,
        code_verifier,
        code,
      });
      const r = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const data = await r.json();
      return json(r.status, data);
    }

    if (action === 'refresh' && event.httpMethod === 'POST') {
      const { refresh_token } = JSON.parse(event.body || '{}');
      if (!refresh_token) return json(400, { error: 'missing_refresh_token' });

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token,
      });
      const r = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const data = await r.json();
      return json(r.status, data);
    }

    if (action === 'me' && event.httpMethod === 'GET') {
      const auth = event.headers.authorization || event.headers.Authorization;
      if (!auth) return json(401, { error: 'missing_token' });

      const r = await fetch('https://api.kick.com/public/v1/users', { headers: { Authorization: auth } });
      const data = await r.json();
      return json(r.status, data);
    }

    return json(404, { error: 'unknown_action' });
  } catch (err) {
    return json(500, { error: 'server_error', message: String(err) });
  }
};
