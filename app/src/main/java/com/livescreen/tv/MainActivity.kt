package com.livescreen.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import android.webkit.CookieManager
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.MimeTypeMap
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.Toast
import org.json.JSONObject
import org.json.JSONTokener
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Loads the live Cloudflare site when there is internet, and serves the bundled copy
 * of the site (assets/web) UNDER THE SAME ORIGIN when there is none. Same origin
 * means localStorage / IndexedDB (history, accounts, offline downloads) are shared
 * between online and offline, so saved videos are visible without internet.
 */
class MainActivity : Activity() {

    companion object {
        const val HOST = "live-screen.myshuruhat.workers.dev"
        const val START_URL = "https://$HOST/"
        private const val FORCE_OFFLINE_MS = 30_000L
    }

    private lateinit var web: WebView
    private lateinit var kickWeb: WebView
    private lateinit var kickClose: TextView
    private var kickChannel = ""
    private var kickLoginMode = false
    private val kickScanLoop = object : Runnable {
        override fun run() {
            if (kickChannel.isEmpty()) return
            scanKick()
            handler.postDelayed(this, 5_000L)
        }
    }
    private var lastBackAt = 0L
    private var forceOfflineUntil = 0L
    private val handler = Handler(Looper.getMainLooper())
    private val syncFollows = object : Runnable {
        override fun run() { pushFollowsToService(); handler.postDelayed(this, 20_000L) }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this)
        web.setBackgroundColor(0xFF000000.toInt())
        val root = FrameLayout(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        setupKickWeb(root)

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            userAgentString = userAgentString + " LiveScreenTV/2"
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, true)
        }

        web.webChromeClient = object : WebChromeClient() {
            // v176: the page uses prompt()/confirm() (playlist names, settings); show them as real dialogs
            override fun onJsPrompt(view: WebView?, url: String?, message: String?, defaultValue: String?, result: JsPromptResult): Boolean {
                val input = EditText(this@MainActivity).apply { setText(defaultValue ?: ""); setSingleLine(true); setSelectAllOnFocus(true) }
                AlertDialog.Builder(this@MainActivity).setMessage(message).setView(input)
                    .setPositiveButton(android.R.string.ok) { _, _ -> result.confirm(input.text.toString()) }
                    .setNegativeButton(android.R.string.cancel) { _, _ -> result.cancel() }
                    .setOnCancelListener { result.cancel() }
                    .show()
                return true
            }
            override fun onJsConfirm(view: WebView?, url: String?, message: String?, result: JsResult): Boolean {
                AlertDialog.Builder(this@MainActivity).setMessage(message)
                    .setPositiveButton(android.R.string.ok) { _, _ -> result.confirm() }
                    .setNegativeButton(android.R.string.cancel) { _, _ -> result.cancel() }
                    .setOnCancelListener { result.cancel() }
                    .show()
                return true
            }
        }
        web.webViewClient = object : WebViewClient() {

            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val uri = request.url
                if (request.method != "GET" || uri.host != HOST) return null
                if (!isOffline()) return null
                var path = uri.path ?: "/"
                if (path.startsWith("/api/") || path.startsWith("/.netlify/")) return null          // API functions need internet
                if (path.isEmpty() || path == "/") path = "/index.html"
                var name = path.removePrefix("/")
                val fresh = File(filesDir, "web/$name")
                var stream: java.io.InputStream? = if (fresh.isFile) fresh.inputStream() else try { assets.open("web/$name") } catch (e: Exception) { null }
                if (stream == null && request.isForMainFrame) {
                    name = "index.html"
                    val fi = File(filesDir, "web/index.html")
                    stream = if (fi.isFile) fi.inputStream() else try { assets.open("web/index.html") } catch (e: Exception) { null }
                }
                if (stream == null) return null
                val ext = MimeTypeMap.getFileExtensionFromUrl(name)
                val mime = when (ext) {
                    "html", "htm" -> "text/html"
                    "js" -> "application/javascript"
                    "json" -> "application/json"
                    "css" -> "text/css"
                    "woff" -> "font/woff"
                    else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
                }
                return WebResourceResponse(mime, "utf-8", stream)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                // Android says online, but the site could not be reached: retry from the bundled copy.
                if (request.isForMainFrame && request.url.host == HOST && SystemClock.uptimeMillis() >= forceOfflineUntil) {
                    forceOfflineUntil = SystemClock.uptimeMillis() + FORCE_OFFLINE_MS
                    view.loadUrl(START_URL)
                }
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = false

            // Kick points TEST build: adds a small "K" test panel on top of the page.
            override fun onPageFinished(view: WebView, url: String?) {
                if (url != null && url.startsWith("https://$HOST")) /* test panel disabled: counter is built into app.html */ Unit
            }
        }

        web.addJavascriptInterface(NativeBridge(), "LiveNative")
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(START_URL)
        refreshOfflineCopy()

        getSharedPreferences(LiveWatchService.PREFS, MODE_PRIVATE).edit().putBoolean("enabled", true).apply()
    }

    private fun readAsset(name: String): String? =
        try { assets.open(name).bufferedReader().use { it.readText() } } catch (e: Exception) { null }

    /** Second WebView that runs the official kick.com page in the background (tiny + transparent, muted). */
    @SuppressLint("SetJavaScriptEnabled")
    private fun setupKickWeb(root: FrameLayout) {
        kickWeb = WebView(this)
        with(kickWeb.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            userAgentString = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(kickWeb, true)
        kickWeb.webChromeClient = WebChromeClient()
        kickWeb.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                readAsset("kick/mute.js")?.let { view.evaluateJavascript(it, null) }
            }
        }
        kickWeb.isFocusable = false
        kickWeb.isFocusableInTouchMode = false
        root.addView(kickWeb, FrameLayout.LayoutParams(2, 2))
        kickWeb.alpha = 0.01f

        kickClose = TextView(this).apply {
            text = "✕  إغلاق"
            setTextColor(0xFF000000.toInt())
            setBackgroundColor(0xFF53FC18.toInt())
            textSize = 16f
            setPadding(32, 20, 32, 20)
            visibility = View.GONE
            setOnClickListener { closeKickLogin() }
        }
        root.addView(kickClose, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.END))
    }

    private fun startKick(ch: String) {
        val name = ch.removePrefix("popout:")
        if (!Regex("[A-Za-z0-9_-]{1,40}").matches(name)) return
        kickChannel = ch
        kickWeb.loadUrl(if (ch.startsWith("popout:")) "https://kick.com/popout/" + name + "/chat" else "https://kick.com/" + name)
        handler.removeCallbacks(kickScanLoop)
        handler.postDelayed(kickScanLoop, 6_000L)
    }

    private fun stopKick() {
        kickChannel = ""
        handler.removeCallbacks(kickScanLoop)
        if (kickLoginMode) closeKickLogin()
        kickWeb.loadUrl("about:blank")
    }

    private fun openKickLogin() {
        kickLoginMode = true
        kickWeb.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        kickWeb.alpha = 1f
        kickWeb.isFocusable = true
        kickWeb.isFocusableInTouchMode = true
        kickWeb.requestFocus()
        kickClose.visibility = View.VISIBLE
        kickClose.bringToFront()
        kickWeb.loadUrl("https://kick.com/")
    }

    private fun closeKickLogin() {
        kickLoginMode = false
        kickWeb.layoutParams = FrameLayout.LayoutParams(2, 2)
        kickWeb.alpha = 0.01f
        kickWeb.isFocusable = false
        kickWeb.isFocusableInTouchMode = false
        kickClose.visibility = View.GONE
        CookieManager.getInstance().flush()
        val kickUrl = if (kickChannel.startsWith("popout:")) "https://kick.com/popout/" + kickChannel.removePrefix("popout:") + "/chat" else "https://kick.com/" + kickChannel
        if (kickChannel.isNotEmpty()) kickWeb.loadUrl(kickUrl) else kickWeb.loadUrl("about:blank")
        web.requestFocus()
    }

    /** TEMP: taps the points, opens the latest prediction/poll row inside the rewards panel, then reports what it finds. */
    private fun peekKick() {
        val click = readAsset("kick/peekclick.js") ?: return
        val click2 = readAsset("kick/peekclick2.js") ?: return
        val dump = readAsset("kick/peekdump.js") ?: return
        fun send(label: String, raw: String?) {
            try {
                val s = JSONTokener(raw ?: return).nextValue() as? String ?: return
                web.evaluateJavascript("window.__peekDump&&window.__peekDump(" + JSONObject.quote(label) + "," + JSONObject.quote(s) + ")", null)
            } catch (e: Exception) { }
        }
        kickWeb.evaluateJavascript(click) { r1 ->
            handler.postDelayed({
                kickWeb.evaluateJavascript(click2) { r2raw ->
                    val r2 = (r2raw ?: "").trim('"')
                    if (r2.startsWith("no ")) {
                        kickWeb.evaluateJavascript(dump) { raw ->
                            send((r1 ?: "") + " | " + r2, raw)
                            kickWeb.evaluateJavascript(click, null)
                        }
                    } else {
                        handler.postDelayed({
                            kickWeb.evaluateJavascript(dump) { raw ->
                                send("STEP2 " + r2, raw)
                                kickWeb.evaluateJavascript(click, null)
                            }
                        }, 1500L)
                    }
                }
            }, 1500L)
        }
    }

    /** Reads the numbers visible on the background Kick page and sends them to the test panel. */
    private fun scanKick() {
        val js = readAsset("kick/scan.js") ?: return
        kickWeb.evaluateJavascript(js) { raw ->
            try {
                val str = JSONTokener(raw ?: return@evaluateJavascript).nextValue() as? String ?: return@evaluateJavascript
                web.evaluateJavascript("window.__kickDump&&window.__kickDump(" + JSONObject.quote(str) + ")", null)
                web.evaluateJavascript("window.__kickPoints&&window.__kickPoints(" + JSONObject.quote(str) + ")", null)
                readAsset("kick/state.js")?.let { sjs ->
                    kickWeb.evaluateJavascript(sjs) { sraw ->
                        try {
                            val ss = JSONTokener(sraw ?: return@evaluateJavascript).nextValue() as? String ?: return@evaluateJavascript
                            web.evaluateJavascript("window.__kickState&&window.__kickState(" + JSONObject.quote(ss) + ")", null)
                        } catch (e: Exception) { }
                    }
                }
                readAsset("kick/votescan.js")?.let { vjs ->
                    kickWeb.evaluateJavascript(vjs) { vraw ->
                        try {
                            val vs = JSONTokener(vraw ?: return@evaluateJavascript).nextValue() as? String ?: return@evaluateJavascript
                            web.evaluateJavascript("window.__voteDump&&window.__voteDump(" + JSONObject.quote(vs) + ")", null)
                        } catch (e: Exception) { }
                    }
                }
            } catch (e: Exception) { /* page not ready */ }
        }
    }

    /** Lets the page (welcome screen) ask for the notification permission instead of popping it at launch. */
    inner class NativeBridge {
        @android.webkit.JavascriptInterface
        fun kickStart(channel: String) { runOnUiThread { startKick(channel.trim()) } }

        @android.webkit.JavascriptInterface
        fun kickStop() { runOnUiThread { stopKick() } }

        @android.webkit.JavascriptInterface
        fun kickLogin() { runOnUiThread { openKickLogin() } }

        @android.webkit.JavascriptInterface
        fun kickScanNow() { runOnUiThread { scanKick() } }

        /** Clicks the poll option with this exact name on the background Kick page. */
        @android.webkit.JavascriptInterface
        fun kickVote(option: String) {
            runOnUiThread {
                val js = readAsset("kick/vote.js")?.replace("__OPTION__", JSONObject.quote(option)) ?: return@runOnUiThread
                kickWeb.evaluateJavascript(js) { r ->
                    web.evaluateJavascript("window.__kickVoteResult&&window.__kickVoteResult(" + JSONObject.quote((r ?: "").trim('"')) + ")", null)
                }
            }
        }

        @android.webkit.JavascriptInterface
        fun kickPeek() { runOnUiThread { peekKick() } }

        @android.webkit.JavascriptInterface
        fun notificationsEnabled(): Boolean = areNotificationsOn()

        /** Asks for the permission. The outcome is read with notificationsResult(). */
        @android.webkit.JavascriptInterface
        fun requestNotifications() {
            notifAskResult = 0
            runOnUiThread {
                if (Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED
                ) {
                    notifAskAt = SystemClock.uptimeMillis()
                    requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 7)
                } else if (!areNotificationsOn()) {
                    notifAskResult = -2        // nothing to ask: notifications are switched off in system settings
                }
            }
        }

        /**
         * v2.6: HTTP GET made by the app itself (the phone's own connection) for tikwm only, because Cloudflare
         * blocks the server's IP. The answer goes back to the page through window.__nativeHttp(id, status, body).
         */
        @android.webkit.JavascriptInterface
        fun httpGet(id: String, url: String) {
            val u = try { URL(url) } catch (e: Exception) { return }
            if (u.protocol != "https" || (u.host != "www.tikwm.com" && u.host != "tikwm.com")) return
            Thread {
                var status = -1
                var body = ""
                try {
                    val c = u.openConnection() as HttpURLConnection
                    c.connectTimeout = 8000
                    c.readTimeout = 12000
                    c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36")
                    c.setRequestProperty("Accept", "application/json, text/plain, */*")
                    c.setRequestProperty("Accept-Language", "en-US,en;q=0.9")
                    c.setRequestProperty("Referer", "https://www.tikwm.com/")
                    status = c.responseCode
                    val st = if (status in 200..399) c.inputStream else c.errorStream
                    body = st?.bufferedReader()?.use { it.readText() } ?: ""
                    c.disconnect()
                } catch (e: Exception) {
                    body = ""
                }
                if (body.length > 3_000_000) body = ""
                val js = "(function(){var f=document.getElementById('sq-frame');var w=(f&&f.contentWindow)||window;" +
                    "if(w.__nativeHttp)w.__nativeHttp(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(body) + ")})()"
                runOnUiThread { web.evaluateJavascript(js, null) }
            }.start()
        }

        /** 0 = waiting / nothing asked, 1 = granted, -1 = user refused, -2 = Android showed no dialog (open settings instead). */
        @android.webkit.JavascriptInterface
        fun notificationsResult(): Int = notifAskResult

        /** Opens this app's notification settings page. Returns false if it could not be opened. */
        @android.webkit.JavascriptInterface
        fun openNotificationSettings(): Boolean {
            return try {
                val i = if (Build.VERSION.SDK_INT >= 26) {
                    android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, packageName)
                } else {
                    android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                        .setData(android.net.Uri.parse("package:$packageName"))
                }
                i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(i)
                true
            } catch (e: Exception) {
                false
            }
        }
    }

    @Volatile private var notifAskResult = 0
    @Volatile private var notifAskAt = 0L

    private fun areNotificationsOn(): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) return false
        if (Build.VERSION.SDK_INT >= 24) {
            return try {
                (getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).areNotificationsEnabled()
            } catch (e: Exception) { true }
        }
        return true
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 7) {
            val granted = grantResults.isNotEmpty() && grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED
            // an answer within ~0.6 s means Android never showed its dialog (user already refused it twice)
            notifAskResult = if (granted) 1 else if (SystemClock.uptimeMillis() - notifAskAt < 600) -2 else -1
        }
    }

    /** Copy the followed channels (and client id) out of the page's localStorage so the background service can use them. */
    private fun pushFollowsToService() {
        web.evaluateJavascript(
            "(function(){try{var b={};try{b=JSON.parse(localStorage.getItem('livescreen_bell')||'{}')||{}}catch(x){}return JSON.stringify({f:JSON.parse(localStorage.getItem('livescreen_favorites')||'[]'),c:localStorage.getItem('livescreen_client_id')||'',b:b})}catch(e){return ''}})()"
        ) { raw ->
            try {
                val str = JSONTokener(raw ?: return@evaluateJavascript).nextValue() as? String ?: return@evaluateJavascript
                if (str.isEmpty()) return@evaluateJavascript
                val o = JSONObject(str)
                getSharedPreferences(LiveWatchService.PREFS, MODE_PRIVATE).edit()
                    .putString("follows", o.getJSONArray("f").toString())
                    .putString("cid", o.optString("c", ""))
                    .putString("bell", (o.optJSONObject("b") ?: JSONObject()).toString())
                    .apply()
            } catch (e: Exception) { /* page not ready yet */ }
        }
    }

    /** Whenever the app opens with internet, save the latest site files so offline always uses the newest deploy. */
    private fun refreshOfflineCopy() {
        if (isOffline()) return
        Thread {
            for ((n, minSize) in listOf("index.html" to 500L, "app.html" to 100_000L, "sw.js" to 10L, "manifest.json" to 10L, "cairo.woff" to 10_000L)) {
                try {
                    val c = URL("https://$HOST/$n?t=" + System.currentTimeMillis()).openConnection() as HttpURLConnection
                    c.connectTimeout = 8000
                    c.readTimeout = 20000
                    c.setRequestProperty("Cache-Control", "no-cache")
                    if (c.responseCode == 200) {
                        val dir = File(filesDir, "web"); dir.mkdirs()
                        val tmp = File(dir, "$n.tmp")
                        c.inputStream.use { i -> tmp.outputStream().use { o -> i.copyTo(o) } }
                        val ok = tmp.length() > minSize
                        if (ok) { File(dir, n).delete(); tmp.renameTo(File(dir, n)) } else tmp.delete()
                    }
                    c.disconnect()
                } catch (e: Exception) { /* keep the previous copy */ }
            }
        }.start()
    }

    private fun isOffline(): Boolean {
        if (SystemClock.uptimeMillis() < forceOfflineUntil) return true
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        return if (Build.VERSION.SDK_INT >= 23) {
            val caps = cm.getNetworkCapabilities(cm.activeNetwork)
            caps == null || !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } else {
            @Suppress("DEPRECATION")
            cm.activeNetworkInfo?.isConnected != true
        }
    }

    /** Back goes to the page first (closes menus / player / returns to Home); a double press on Home exits. */
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (kickLoginMode) { if (event.repeatCount == 0) closeKickLogin(); return true }
            if (event.repeatCount == 0) handleBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun handleBack() {
        web.evaluateJavascript(
            "(function(){try{var f=document.getElementById('sq-frame');var w=(f&&f.contentWindow)||window;return String(w.eval('(typeof state!==\\'undefined\\'&&state.screen)||\\'\\''))}catch(e){return ''}})()"
        ) { raw ->
            val screen = raw?.trim('"') ?: ""
            val now = SystemClock.uptimeMillis()
            if (screen == "discover") {
                if (now - lastBackAt < 2000) { finish(); return@evaluateJavascript }
                lastBackAt = now
                Toast.makeText(this, R.string.press_back_again, Toast.LENGTH_SHORT).show()
            }
            web.evaluateJavascript(
                "(function(){var f=document.getElementById('sq-frame');var w=(f&&f.contentWindow)||window;w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'GoBack',bubbles:true,cancelable:true}))})()", null
            )
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onPause() {
        super.onPause(); web.onPause(); CookieManager.getInstance().flush()
        LiveWatchService.appVisible = false
        pushFollowsToService()
        handler.removeCallbacks(syncFollows)
    }
    override fun onResume() {
        super.onResume(); web.onResume()
        LiveWatchService.appVisible = true
        getSharedPreferences(LiveWatchService.PREFS, MODE_PRIVATE).edit().putBoolean("enabled", true).apply()
        LiveWatchService.start(this)
        handler.postDelayed(syncFollows, 5_000L)
    }

    override fun onDestroy() {
        handler.removeCallbacks(syncFollows)
        handler.removeCallbacks(kickScanLoop)
        kickWeb.destroy()
        web.destroy()
        super.onDestroy()
    }
}
