// Tiny replacement for @netlify/blobs on top of Upstash Redis (REST API, no dependency).
// Create a free Upstash Redis database and add its REST URL and REST token as the variables below.
const cfg = () => ({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});
async function cmd(args) {
  const { url, token } = cfg();
  const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || ('storage http ' + r.status));
  return d.result;
}
exports.getStore = function (name) {
  const { url, token } = cfg();
  if (!url || !token) throw new Error('Storage not configured: add Upstash Redis to this Cloudflare Worker');
  const ttl = /tvlink/.test(name) ? 3600 : 0;     // device-link codes expire on their own
  const k = (key) => name + ':' + key;
  return {
    async get(key) { const v = await cmd(['GET', k(key)]); if (v == null) return null; try { return JSON.parse(v); } catch (e) { return null; } },
    async setJSON(key, val) { const a = ['SET', k(key), JSON.stringify(val)]; if (ttl) a.push('EX', String(ttl)); await cmd(a); },
    async delete(key) { await cmd(['DEL', k(key)]); },
  };
};
exports.connectLambda = function () {};
