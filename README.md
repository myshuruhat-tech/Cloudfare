# Live Screen (Cloudflare Worker)

تطبيق مشاهدة Kick بواجهة تلفاز. الموقع يعمل على Cloudflare Workers، ويُنشر تلقائيا عند كل push إلى GitHub. تطبيق الأندرويد (APK) يفتح هذا الدومين.

## الملفات
- `worker.mjs`: يوجّه `/api/*` إلى المعالجات في `lib/` ويقدّم باقي الملفات من `public/`.
- `public/app.html`: التطبيق نفسه. `public/sw.js`: غيّر اسم الكاش (`live-screen-vNNN`) مع كل نسخة.
- `public/well-known/assetlinks.json`: يُقدَّم على `/.well-known/assetlinks.json`، ويجب أن يطابق حزمة الـ APK وبصمة التوقيع.

## المتغيرات (Cloudflare > Settings > Variables and Secrets)
| الاسم | الاستخدام |
|---|---|
| `KICK_CLIENT_ID` / `KICK_CLIENT_SECRET` | تسجيل الدخول عبر Kick |
| `KICK_REDIRECT_URI` | يطابق حرفيا الـ Redirect URL في تطبيق Kick |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | التوصيات والملخصات (`/api/ai`) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | التخزين (المزامنة وربط الأجهزة) |
| `ALLOWED_ORIGINS` | اختياري: أصول إضافية مسموحة لـ `/api/ai` |

`/api/ai` يقبل الطلبات من نفس الدومين فقط.

## تشغيل محلي
انسخ `.dev.vars.example` إلى `.dev.vars` واملأه، ثم `npx wrangler dev`.
