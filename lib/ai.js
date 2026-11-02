// AI helper for Live Screen: reco / recap / clipTitle via Google Gemini (REST).
// Env: GEMINI_API_KEY (required), GEMINI_MODEL (optional, e.g. a Flash-Lite model name).
// Only public data is sent (channel names, categories, titles, public chat lines). No tokens/account data.
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

const out = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify(body)
});

const s = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 200);
const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);

function buildPrompt(task, d) {
  if (task === 'reco') {
    const cands = arr(d.candidates, 30).map((c) => ({
      slug: s(c.slug, 40), title: s(c.title, 80), category: s(c.category, 40), viewers: Number(c.viewers) || 0, lang: s(c.lang, 5)
    })).filter((c) => c.slug);
    const input = {
      follows: arr(d.follows, 20).map((x) => s(x, 40)),
      recent: arr(d.recent, 20).map((x) => s(x, 40)),
      preferredLang: s(d.lang, 5),
      secondaryLang: s(d.lang2, 5),
      candidates: cands
    };
    return {
      cands,
      text:
        'أنت نظام توصية لبثوث مباشرة. رتّب المرشحين من الأنسب للأقل مناسبة للمشاهد، وأعطِ لكل واحد سبباً قصيراً بالعربي (٥ كلمات أو أقل).\n' +
        'القواعد: القنوات المتابَعة/المشاهَدة أولاً. لو المشاهد يشاهد عربي فأغلب الاقتراحات عربي وقليل أجنبي، ولو أجنبي فالعكس. ' +
        'الأسباب مثل: "لأنك تتابع abuswe7l" أو "تشاهد ألعاب كثير". لا تخترع معلومات غير موجودة بالمدخل. استخدم فقط slug موجود بالمرشحين.\n' +
        'أخرج JSON فقط بهذا الشكل: {"items":[{"slug":"...","reason":"..."}]} وبحد أقصى 12 عنصر.\n' +
        'المدخل: ' + JSON.stringify(input)
    };
  }
  if (task === 'recap') {
    const input = {
      title: s(d.title, 160), category: s(d.category, 60), durationMin: Number(d.durationMin) || 0,
      chat: arr(d.messages, 150).map((m) => s(m, 140)),
      clips: arr(d.clips, 12).map((c) => ({ atMin: Number(c.atMin) || 0, title: s(c.title, 90), views: Number(c.views) || 0 }))
    };
    return {
      text:
        'لخّص ما فات من بث مباشر في 3 نقاط قصيرة بالعربي (كل نقطة ≤ 12 كلمة)، مبنية فقط على عنوان البث والتصنيف وكليبات البث (clips: عنوان كل كليب ودقيقته atMin داخل البث، وهي أقوى دليل على ما حصل ومتى) ورسائل الشات المعطاة. رتّب النقاط زمنياً من بداية البث وأشر للدقيقة إن عرفتها. ' +
        'لا تخترع أحداثاً غير مذكورة. لو الرسائل ما تكفي لاستنتاج شي، لا تخمّن. ' +
        'أخرج JSON فقط: {"bullets":["...","...","..."]}\n' +
        'المدخل: ' + JSON.stringify(input)
    };
  }
  if (task === 'clipTitle') {
    const input = {
      channel: s(d.channel, 40), category: s(d.category, 60), description: s(d.description, 160), fromTitle: s(d.fromTitle, 160), badTitle: s(d.badTitle, 60)
    };
    return {
      text:
        'اقترح عنواناً قصيراً وواضحاً لكليب من بث على Kick (≤ 8 كلمات)، بلغة القناة/العنوان الأصلي إن وُجد وإلا بالعربي. ' +
        'اعتمد فقط على اسم القناة والتصنيف والوصف المعطى، لا تخترع أحداثاً. لو ما فيه معلومات كافية اكتب وصفاً عاماً مثل "لقطة من بث <القناة>" . ' +
        'أخرج JSON فقط: {"title":"..."}\n' +
        'المدخل: ' + JSON.stringify(input)
    };
  }
  if (task === 'searchExpand') {
    return {
      text:
        'You power the search box of a live-stream app (Kick). The user typed a short query (often Arabic Gulf dialect, or a game/streamer nickname). ' +
        'Return up to 8 short keywords (1-2 words each) that videos/clips about this would likely have in their TITLES: synonyms, the same thing in Arabic and English, the official game name if a game is meant. ' +
        'Do not repeat the typed text itself and never invent streamer names. ' +
        'Return JSON only: {"terms":["..."]}\nInput: ' + JSON.stringify({ q: s(d.q, 60), uiLanguage: s(d.lang, 8) })
    };
  }
  if (task === 'ttRank') {
    const cands = arr(d.candidates, 40).map((c) => ({ id: s(c.id, 30), title: s(c.title, 90), author: s(c.author, 30), views: Number(c.views) || 0 })).filter((c) => c.id);
    const input = { interests: { authors: arr(d.authors, 12).map((x) => s(x, 30)), words: arr(d.words, 24).map((x) => s(x, 24)), avoid: arr(d.avoid, 12).map((x) => s(x, 24)) }, candidates: cands };
    return {
      cands,
      text:
        'أنت نظام اقتراحات «لك» (For You) لتطبيق تيك توك. عندك اهتمامات المستخدم (حسابات وكلمات يحبها، وكلمات يتجنبها) وقائمة فيديوهات مرشحة من كل دول العالم.\n' +
        'رتّب أفضل 30 فيديو لهذا المستخدم: الأقرب لاهتماماته أولاً، مع تنويع الحسابات (لا تضع نفس الحساب مرتين متتاليتين)، وأدخل حوالي 20% فيديوهات مختلفة عن اهتماماته للاستكشاف. ' +
        'تجنّب الفيديوهات الفارغة أو المكررة. استخدم فقط الـ id الموجودة في القائمة.\n' +
        'أرجع JSON فقط بهذا الشكل: {"ids":["...","..."]}\n' +
        'البيانات: ' + JSON.stringify(input)
    };
  }
  if (task === 'ttSuggest') {
    const input = { typed: s(d.q, 60), uiLanguage: s(d.lang, 8), interests: { authors: arr(d.authors, 10).map((x) => s(x, 30)), words: arr(d.words, 16).map((x) => s(x, 24)), following: arr(d.following, 12).map((x) => s(x, 30)) } };
    return {
      text:
        'You power the TikTok search box of a TV app. The user types with a TV remote, so finish their search for them. ' +
        'Use the typed text (may be partial, Arabic or English) and the interests. If nothing was typed, suggest from the interests only. ' +
        'Return JSON only: {"users":[up to 6 TikTok usernames (unique_id, no @) that REALLY exist and fit what was typed or liked; fewer is fine, never invent],' +
        '"queries":[up to 6 short search phrases that complete or extend what was typed, same language as typed (or the uiLanguage if nothing typed)],' +
        '"english":"the typed text translated to short English TikTok search keywords (empty string if nothing typed)"}.\n' +
        'Input: ' + JSON.stringify(input)
    };
  }
  return null;
}

function parseJson(t) {
  try { return JSON.parse(t); } catch (e) {}
  const m = String(t || '').match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return out(204, {});
  if (event.httpMethod !== 'POST') return out(405, { error: 'method' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return out(200, { error: 'nokey' });
  const model = (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'json' }); }
  const task = body.task, data = body.data || {};
  const p = buildPrompt(task, data);
  if (!p) return out(400, { error: 'task' });

  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: p.text }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 800 }
      })
    });
    if (r.status === 429) return out(200, { error: 'rate' });
    if (!r.ok) return out(200, { error: 'upstream', status: r.status });
    const j = await r.json();
    const txt = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts
      ? j.candidates[0].content.parts.map((x) => x.text || '').join('') : '';
    const parsed = parseJson(txt);
    if (!parsed) return out(200, { error: 'parse' });

    if (task === 'reco') {
      const ok = new Set((p.cands || []).map((c) => c.slug.toLowerCase()));
      const items = arr(parsed.items, 12)
        .map((it) => ({ slug: s(it && it.slug, 40), reason: s(it && it.reason, 60) }))
        .filter((it) => it.slug && ok.has(it.slug.toLowerCase()));
      return out(200, { items });
    }
    if (task === 'searchExpand') {
      return out(200, { terms: arr(parsed.terms, 8).map((x) => s(x, 30)).filter(Boolean) });
    }
    if (task === 'ttRank') {
      const ok = new Set((p.cands || []).map((c) => c.id));
      const ids = arr(parsed.ids, 40).map((x) => s(x, 30)).filter((x) => ok.has(x));
      return out(200, { ids });
    }
    if (task === 'ttSuggest') {
      const users = arr(parsed.users, 6).map((x) => s(x, 30).replace(/^@/, '').replace(/[^A-Za-z0-9_.]/g, '')).filter(Boolean);
      const queries = arr(parsed.queries, 6).map((x) => s(x, 60)).filter(Boolean);
      return out(200, { users, queries, en: s(parsed.english, 60) });
    }
    if (task === 'recap') {
      const bullets = arr(parsed.bullets, 3).map((x) => s(x, 160)).filter(Boolean);
      return out(200, { bullets });
    }
    const title = s(parsed.title, 90);
    return out(200, title ? { title } : { error: 'empty' });
  } catch (e) {
    return out(200, { error: 'fail' });
  }
};
