package com.livescreen.tv

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Background watcher: every minute it asks the site's kick-api function which of the
 * followed channels are live, and posts a real Android notification when one goes
 * from offline to live. Follows come from the page (MainActivity copies them out of
 * localStorage into SharedPreferences "watch").
 */
class LiveWatchService : Service() {

    companion object {
        const val PREFS = "watch"
        const val CH_SERVICE = "watch_service"
        const val CH_LIVE = "live_alerts"
        const val ACTION_STOP = "com.livescreen.tv.STOP_WATCH"
        private const val POLL_MS = 60_000L
        private const val SERVICE_ID = 1

        @Volatile var appVisible = false

        fun start(ctx: Context) {
            val i = Intent(ctx, LiveWatchService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
            } catch (e: Exception) { /* not allowed right now; next app open retries */ }
        }
    }

    @Volatile private var running = false
    private var worker: Thread? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("enabled", false).apply()
            running = false
            worker?.interrupt()
            stopForeground(true)
            stopSelf()
            return START_NOT_STICKY
        }
        createChannels()
        val n = serviceNotification()
        if (Build.VERSION.SDK_INT >= 29) startForeground(SERVICE_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else startForeground(SERVICE_ID, n)

        if (!running) {
            running = true
            worker = Thread {
                while (running) {
                    try { poll() } catch (e: Exception) { /* try again next round */ }
                    try { Thread.sleep(POLL_MS) } catch (e: InterruptedException) { }
                }
            }.also { it.isDaemon = true; it.start() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        worker?.interrupt()
        super.onDestroy()
    }

    private fun poll() {
        val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
        val arr = JSONArray(prefs.getString("follows", "[]") ?: "[]")
        val slugs = ArrayList<String>()
        for (i in 0 until arr.length()) {
            val s = arr.optString(i, "").trim().lowercase()
            if (s.isNotEmpty() && s !in slugs) slugs.add(s)
        }
        if (slugs.isEmpty()) return
        val cid = prefs.getString("cid", "") ?: ""
        val state = try { JSONObject(prefs.getString("live_state", "{}") ?: "{}") } catch (e: Exception) { JSONObject() }
        // bell level per channel (slug -> all / custom / none), copied from the page; "none" = no alerts for that channel
        val bell = try { JSONObject(prefs.getString("bell", "{}") ?: "{}") } catch (e: Exception) { JSONObject() }

        for (chunk in slugs.chunked(40)) {
            var url = "https://${MainActivity.HOST}/api/kick-api?p=channels&" +
                chunk.joinToString("&") { "slug=" + URLEncoder.encode(it, "UTF-8") }
            if (cid.isNotEmpty()) url += "&client_id=" + URLEncoder.encode(cid, "UTF-8")
            val c = URL(url).openConnection() as HttpURLConnection
            c.connectTimeout = 10_000
            c.readTimeout = 15_000
            val body = try {
                if (c.responseCode != 200) { continue }
                c.inputStream.bufferedReader().use { it.readText() }
            } finally { c.disconnect() }

            val data = JSONObject(body).optJSONArray("data") ?: continue
            for (i in 0 until data.length()) {
                val ch = data.optJSONObject(i) ?: continue
                val slug = ch.optString("slug", "").lowercase()
                if (slug.isEmpty()) continue
                val stream = ch.optJSONObject("stream")
                val isLive = stream != null && stream.optBoolean("is_live", false)
                val was = if (state.has(slug)) state.optBoolean(slug) else null
                state.put(slug, isLive)
                // only a real offline -> live change; the first sighting just records the state
                if (isLive && was == false && !appVisible && bell.optString(slug, "custom") != "none") {
                    notifyLive(slug, stream?.optString("stream_title", "") ?: "", stream?.optInt("viewer_count", 0) ?: 0)
                }
            }
        }
        prefs.edit().putString("live_state", state.toString()).apply()
    }

    private fun notifyLive(slug: String, title: String, viewers: Int) {
        val text = buildString {
            if (title.isNotEmpty()) append(title)
            if (viewers > 0) { if (isNotEmpty()) append("  •  "); append(viewers).append(" 👁") }
        }
        val n = builder(CH_LIVE)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("🔴 $slug بدأ بث مباشر")
            .setContentText(if (text.isEmpty()) "اضغط للمشاهدة" else text)
            .setAutoCancel(true)
            .setContentIntent(openApp())
            .apply { if (Build.VERSION.SDK_INT < 26) setPriority(Notification.PRIORITY_HIGH) }
            .build()
        try {
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .notify(slug.hashCode(), n)
        } catch (e: Exception) { }
    }

    private fun serviceNotification(): Notification {
        val stop = PendingIntent.getService(
            this, 2, Intent(this, LiveWatchService::class.java).setAction(ACTION_STOP), piFlags()
        )
        return builder(CH_SERVICE)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("5AL")
            .setContentText("يراقب القنوات اللي تتابعها ويرسل لك إشعار عند بدء البث")
            .setOngoing(true)
            .setContentIntent(openApp())
            .addAction(0, "إيقاف", stop)
            .build()
    }

    private fun builder(channel: String): Notification.Builder =
        if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, channel) else Notification.Builder(this)

    private fun openApp(): PendingIntent = PendingIntent.getActivity(
        this, 1,
        Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        piFlags()
    )

    private fun piFlags(): Int =
        if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        else PendingIntent.FLAG_UPDATE_CURRENT

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CH_SERVICE, "المراقبة في الخلفية", NotificationManager.IMPORTANCE_MIN)
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_LIVE, "بدء البث", NotificationManager.IMPORTANCE_HIGH)
        )
    }
}
