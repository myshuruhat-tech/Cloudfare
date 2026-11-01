// TikTok feed for the "Clips & TikTok" row. TikTok has NO official public API for this, so this uses
// a free unofficial source (tikwm.com, with its second domain as a backup). It can change or block at any time.
//
//   GET /api/tiktok?action=feed&regions=SA,AE,US   -> { items: [...] }   (several regions merged, de-duplicated)
//   GET /api/tiktok?action=user&name=<unique_id>   -> { items: [...] }
//   GET /api/tiktok?action=search&q=<text>&cursor=0 -> { items, cursor, hasMore }   (one page per call)
//   GET /api/tiktok?action=searchusers&q=<text>    -> { users: [...] }

const HOSTS = ['https://www.tikwm.com', 'https://tikwm.com'];
const json = (status, body, cache) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': cache || 'no-store' },
  body: JSON.stringify(body),
});

function abs(u, base) { return !u ? '' : (u.startsWith('http') ? u : base + (u.startsWith('/') ? '' : '/') + u); }

function norm(v, base) {
  if (!v || !(v.video_id || v.id)) return null;
  const a = v.author || {};
  const play = abs(v.play || v.wmplay, base);
  if (!play) return null;
  return {
    id: String(v.video_id || v.id),
    title: v.title || '',
    cover: abs(v.cover || v.origin_cover, base),
    play,
    duration: v.duration || 0,
    views: v.play_count != null ? v.play_count : null,
    created: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
    author: a.unique_id || '',
    nick: a.nickname || a.unique_id || '',
    avatar: abs(a.avatar, base),
  };
}

// tikwm free API allows ~1 request/second: parallel calls get {code:-1,"Free Api Limit"} and no data.
// So every call goes through one queue (>=1.15s apart) and retries once when the limit message appears.
const GAP = 1150, BUDGET = 8800;
let T0 = Date.now(), BLOCKED = false;
let chain = Promise.resolve(), lastAt = 0, lastErr = '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function get(path) {
  const isSearch = path.indexOf('/api/feed/search') === 0 || path.indexOf('/api/user/search') === 0;
  const run = async () => {
    if (BLOCKED) throw new Error(lastErr);       // tikwm already refused this server in this request: fail at once
    let last;
    const HDR = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36', Accept: 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', Referer: 'https://www.tikwm.com/', Origin: 'https://www.tikwm.com' };
    const tries = [];
    for (const base of HOSTS) (isSearch ? ['POST', 'GET'] : ['GET']).forEach(m => tries.push([base, m]));
    let limited = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      limited = false;
      for (const [base, method] of tries) {
        if (Date.now() - T0 > BUDGET) throw new Error(lastErr || 'timeout');
        const wait = lastAt + GAP - Date.now(); if (wait > 0) await sleep(wait);
        lastAt = Date.now();
        const ctl = new AbortController();
        const tm = setTimeout(() => ctl.abort(), 5000);
        try {
          const qi = path.indexOf('?');
          const opt = { signal: ctl.signal, headers: Object.assign({}, HDR), method };
          let url = base + path;
          if (method === 'POST' && qi >= 0) { url = base + path.slice(0, qi); opt.body = path.slice(qi + 1); opt.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'; }
          const r = await fetch(url, opt);
          const txt = await r.text();
          let d = null; try { d = JSON.parse(txt); } catch (e) {}
          if (!d && (r.status === 403 || /Just a moment/i.test(txt))) { BLOCKED = true; lastErr = 'tikwm blocks this server (Cloudflare, HTTP ' + r.status + ')'; throw new Error(lastErr); }
          if (!d) { lastErr = 'tikwm ' + method + ' HTTP ' + r.status + ' not JSON: ' + txt.replace(/\s+/g, ' ').slice(0, 70); last = new Error(lastErr); continue; }
          if (d.data && !(Array.isArray(d.data) && !d.data.length && d.code)) return { d: d.data, base };
          lastErr = 'tikwm ' + method + ': ' + (d.msg || 'no data') + ' (HTTP ' + r.status + ')';
          last = new Error(lastErr);
          if (/limit/i.test(lastErr)) limited = true;
        } catch (e) { if (BLOCKED) throw e; lastErr = 'fetch ' + method + ': ' + ((e && e.message) || e); last = new Error(lastErr); } finally { clearTimeout(tm); }
      }
      if (!limited) break;
    }
    throw last || new Error('failed');
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

exports.handler = async (event) => {
  T0 = Date.now(); lastErr = ''; BLOCKED = false;          // warm instances: new time budget per request
  const q = event.queryStringParameters || {};
  try {
    let items = [];
    if (q.action === 'searchusers' && q.q) {
      // v164: matching accounts (channels), separate call so the videos are never delayed
      const kw = encodeURIComponent(String(q.q).slice(0, 80));
      const u = await get('/api/user/search?keywords=' + kw + '&count=12&cursor=0');
      const a = Array.isArray(u.d) ? u.d : (u.d.user_list || u.d.users || u.d.list || []);
      const users = a.map(x => { const o = x.user || x; return { id: o.unique_id || o.uniqueId || '', nick: o.nickname || '', avatar: abs(o.avatar || o.avatar_thumb || '', u.base) }; }).filter(x => x.id).slice(0, 12);
      return json(200, { items: [], users }, 'public, max-age=300');
    }
    if (q.action === 'search' && q.q) {
      // v164: ONE page of video results per call (cursor = next offset); the app asks for several pages one after another
      const kw = encodeURIComponent(String(q.q).slice(0, 80));
      const cur = Math.max(0, parseInt(q.cursor, 10) || 0);
      const v = await get('/api/feed/search?keywords=' + kw + '&count=30&cursor=' + cur);
      const arr = v.d.videos || (Array.isArray(v.d) ? v.d : []);
      const seen1 = new Set(); const its = arr.map(x => norm(x, v.base)).filter(x => x && !seen1.has(x.id) && seen1.add(x.id));
      if (!its.length) return json(502, { items: [], error: lastErr || 'empty' });
      const next = (v.d && v.d.cursor != null) ? Number(v.d.cursor) : cur + arr.length;
      return json(200, { items: its, cursor: next, hasMore: !!(v.d && v.d.hasMore) }, 'public, max-age=300');
    }
    if (q.action === 'following' && q.name) {
      // accounts this (public) TikTok user follows -> their latest videos (unofficial, no login, no password)
      const fl = await get('/api/user/following?unique_id=' + encodeURIComponent(q.name) + '&count=40&cursor=0');
      const raw = Array.isArray(fl.d) ? fl.d : (fl.d.followings || fl.d.users || fl.d.list || []);
      const names = raw.map(u => u.unique_id || u.uniqueId || (u.user && u.user.unique_id)).filter(Boolean);
      for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
      const res = await Promise.allSettled(names.slice(0, 8).map(n => get('/api/user/posts?unique_id=' + encodeURIComponent(n) + '&count=6&cursor=0')));
      res.forEach(x => { if (x.status === 'fulfilled') { const a = x.value.d.videos || (Array.isArray(x.value.d) ? x.value.d : []); a.forEach(v => items.push(norm(v, x.value.base))); } });
    } else if (q.action === 'users' && q.names) {
      const names = String(q.names).split(',').map(n => n.replace(/^@/, '').replace(/[^A-Za-z0-9_.]/g, '')).filter(Boolean).slice(0, 5);
      const res = await Promise.allSettled(names.map(n => get('/api/user/posts?unique_id=' + encodeURIComponent(n) + '&count=8&cursor=0')));
      res.forEach(x => { if (x.status === 'fulfilled') { const a = x.value.d.videos || (Array.isArray(x.value.d) ? x.value.d : []); a.forEach(v => items.push(norm(v, x.value.base))); } });
    } else if (q.action === 'user' && q.name) {
      const { d, base } = await get('/api/user/posts?unique_id=' + encodeURIComponent(q.name) + '&count=30&cursor=0');
      items = (d.videos || (Array.isArray(d) ? d : [])).map(v => norm(v, base));
    } else {
      const regions = String(q.regions || q.region || 'SA').split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);
      const res = await Promise.allSettled(regions.map(r => get('/api/feed/list?region=' + encodeURIComponent(r) + '&count=30')));
      res.forEach(x => { if (x.status === 'fulfilled' && Array.isArray(x.value.d)) x.value.d.forEach(v => items.push(norm(v, x.value.base))); });
    }
    const seen = new Set();
    items = items.filter(v => v && !seen.has(v.id) && seen.add(v.id));
    if (!items.length) return json(502, { items: [], error: lastErr || 'empty' });
    return json(200, { items }, q.r ? 'no-store' : 'public, max-age=300');
  } catch (e) {
    return json(502, { items: [], error: String((e && e.message) || e) });
  }
};
