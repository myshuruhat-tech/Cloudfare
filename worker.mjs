// Cloudflare Worker: serves /api/* with the original Netlify-style handlers; everything else comes from ./public.
import kickApi from './lib/kick-api.js';
import kickAuth from './lib/kick-auth.js';
import pusherConfig from './lib/pusher-config.js';
import ai from './lib/ai.js';
import tiktok from './lib/tiktok.js';
import tvLink from './lib/tv-link.js';
import sync from './lib/sync.js';

const pick = (m) => (m && (m.handler || (m.default && m.default.handler))) || null;
const ROUTES = {
  'kick-api': pick(kickApi), 'kick-auth': pick(kickAuth), 'pusher-config': pick(pusherConfig),
  'ai': pick(ai), 'tiktok': pick(tiktok), 'tv-link': pick(tvLink), 'sync': pick(sync),
};

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

async function runHandler(handler, request) {
  const url = new URL(request.url);
  const headers = {};
  request.headers.forEach((v, k) => { headers[k] = v; });
  const qs = {}, mqs = {};
  url.searchParams.forEach((v, k) => { if (!(k in qs)) qs[k] = v; (mqs[k] = mqs[k] || []).push(v); });
  const body = (request.method === 'GET' || request.method === 'HEAD') ? '' : await request.text();
  const event = { httpMethod: request.method, headers, path: url.pathname, rawUrl: request.url, queryStringParameters: qs, multiValueQueryStringParameters: mqs, body, isBase64Encoded: false };
  try {
    const r = (await handler(event, {})) || {};
    const h = new Headers();
    Object.entries(r.headers || {}).forEach(([k, v]) => h.set(k, String(v)));
    Object.entries(r.multiValueHeaders || {}).forEach(([k, arr]) => (arr || []).forEach((v) => h.append(k, String(v))));
    const status = r.statusCode || 200;
    let out = r.body == null ? '' : r.body;
    if (r.isBase64Encoded) out = Uint8Array.from(atob(out), (c) => c.charCodeAt(0));
    return new Response(status === 204 || status === 304 ? null : out, { status, headers: h });
  } catch (e) {
    return json(500, { error: 'server_error', message: String((e && e.message) || e) });
  }
}

export default {
  async fetch(request, env) {
    // the handlers read process.env: copy the Worker's variables and secrets into it
    try { if (typeof process !== 'undefined' && process.env) for (const k of Object.keys(env)) if (typeof env[k] === 'string') process.env[k] = env[k]; } catch (e) {}
    const url = new URL(request.url);
    const p = url.pathname;
        if (p === '/') return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    if (p === '/activate') return env.ASSETS.fetch(new Request(new URL('/activate.html', url), request));
    if (p === '/.well-known/assetlinks.json') {
      const r = await env.ASSETS.fetch(new Request(new URL('/well-known/assetlinks.json', url), request));
      const h = new Headers(r.headers); h.set('Content-Type', 'application/json'); h.set('Cache-Control', 'public, max-age=0');
      return new Response(r.body, { status: r.status, headers: h });
    }
    if (p.startsWith('/api/')) {
      const handler = ROUTES[p.slice(5).replace(/\/+$/, '')];
      if (!handler) return json(404, { error: 'not_found' });
      return runHandler(handler, request);
    }
    return env.ASSETS.fetch(request);
  },
};
