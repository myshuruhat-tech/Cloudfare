// Finds Kick's current public Pusher key/cluster by reading kick.com's own JS bundles
// server-side (no CORS, real browser headers). Usage: /api/pusher-config?channel=xxx
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const H = { 'User-Agent': UA, 'Accept': 'text/html,application/javascript,*/*', 'Accept-Language': 'en-US,en;q=0.9' };
let cached = null;

function scan(t) {
  let m = t.match(/ws-([a-z0-9]+)\.pusher\.com\/app\/([a-f0-9]{20})/i);
  if (m) return { cluster: m[1], key: m[2] };
  m = t.match(/["'`]([a-f0-9]{20})["'`]\s*,\s*\{[^{}]{0,300}?cluster\s*:\s*["'`]([a-z0-9]+)["'`]/i);
  if (m) return { key: m[1], cluster: m[2] };
  m = t.match(/cluster\s*:\s*["'`]([a-z0-9]+)["'`][^{}]{0,300}?["'`]([a-f0-9]{20})["'`]/i);
  if (m) return { cluster: m[1], key: m[2] };
  m = t.match(/PUSHER[A-Z_]*KEY["'`]?\s*[:=]\s*["'`]([a-f0-9]{20})["'`]/i);
  if (m) {
    const c = t.match(/PUSHER[A-Z_]*CLUSTER["'`]?\s*[:=]\s*["'`]([a-z0-9]+)["'`]/i);
    return { key: m[1], cluster: c ? c[1] : null };
  }
  return null;
}
const get = async (u) => {
  const r = await fetch(u, { headers: H, redirect: 'follow' });
  if (!r.ok) throw new Error(u + ' -> HTTP ' + r.status);
  return r.text();
};
const out = (status, body) => ({ statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (cached && cached.exp > Date.now()) return out(200, cached.v);
  const channel = (event.queryStringParameters && event.queryStringParameters.channel) || 'kick';
  try {
    const html = await get('https://kick.com/' + encodeURIComponent(channel));
    let found = scan(html);
    if (!found) {
      const srcs = new Set();
      html.replace(/(?:src|href)=["']([^"']+\.js[^"']*)["']/gi, (_, u) => { try { srcs.add(new URL(u, 'https://kick.com/').href); } catch (e) {} return ''; });
      const list = Array.from(srcs).slice(0, 60);
      for (let i = 0; i < list.length && !found; i += 6) {
        const texts = await Promise.all(list.slice(i, i + 6).map((u) => get(u).catch(() => '')));
        for (const t of texts) { found = t && scan(t); if (found) break; }
      }
    }
    if (!found || !found.key) return out(404, { error: 'key not found in kick.com pages' });
    cached = { exp: Date.now() + 6 * 3600 * 1000, v: found };
    return out(200, found);
  } catch (e) {
    return out(502, { error: String(e.message || e).slice(0, 200) });
  }
};
