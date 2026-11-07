package com.example.ytblocker

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.TextView

class BlockerService : AccessibilityService() {

    private fun norm(s: String) = s.lowercase()
        .replace(Regex("[\\u064B-\\u065F\\u0640]"), "")
        .replace(Regex("[أإآ]"), "ا")
        .replace("ى", "ي").replace("ة", "ه")
        .replace(Regex("[٠-٩]")) { (it.value[0] - '٠').toString() }
        .replace(Regex("\\s+"), " ").trim()

    // handles: فريدة، contains
    private val handles = listOf(
        "@d7oomy999", "@POWRibrahim", "@FRS9", "@FFearFFul", "@mjrmgames909",
        "@POWR_Rayan", "@iiGOATGamingg", "@POWR_ROB", "@xBear1", "@ABS11",
        "@Abo_treek1", "@Topz", "@Abunoo7", "@POWR_Rakan", "@Siiu-Team",
        "@POWR-Esports", "@SHoNgxxBoNg", "@xbear-plus", "@sxb3654",
        "@FRLplus", "@25KLOoODE", "@POWR.Kmstka", "@MSKplusss", "@Moskooo"
    ).map { norm(it) }

    // أسماء طويلة: contains
    private val names = listOf(
        "d7oomy_999", "Ibrahim | ابو خليل", "Faris | فارس", "FFearFFul",
        "MjrmGames", "POWR Rayan", "iiGOATGaming", "POWR ROB",
        "ابو عابد الشمري", "Turki | ابو تريك", "TOPZ توبز", "ابو نوح",
        "POWR Rakan", "POWR eSports", "SHoNgxBoNg", "خلودي 25",
        "كمستكا", "MOSKOO"
    ).map { norm(it) }

    // أسماء قصيرة: مطابقة تامة
    private val exact = listOf("ABS", "SXB", "F R S", "FRL+", "MSK+").map { norm(it) }.toSet()

    private val YT = "com.google.android.youtube"
    private val blockTouch = false // true = يمنع الضغط على المخفي، لكن يمنع السكرول لو بدأ عليه
    private val wm by lazy { getSystemService(WINDOW_SERVICE) as WindowManager }
    private val covers = mutableListOf<View>()
    private val handler = Handler(Looper.getMainLooper())
    private val refresh = Runnable { update() }
    private var lastBack = 0L

    private fun matches(raw: String): Boolean {
        val t = norm(raw)
        return t in exact || handles.any { t.contains(it) } || names.any { t.contains(it) }
    }

    override fun onAccessibilityEvent(e: AccessibilityEvent) {
        val pkg = e.packageName?.toString()
        if (pkg == packageName) return // أحداث الغطاء نفسه
        if (pkg != YT) { clearCovers(); return }
        handler.removeCallbacks(refresh)
        handler.postDelayed(refresh, 60)
    }

    private fun update() {
        val root = rootInActiveWindow ?: return
        if (root.packageName?.toString() != YT) { clearCovers(); return }

        val rects = mutableListOf<Rect>()
        var pageLevel = false
        val screenH = resources.displayMetrics.heightPixels

        fun collect(n: AccessibilityNodeInfo?) {
            if (n == null) return
            val t = n.text?.toString() ?: n.contentDescription?.toString()
            if (t != null && matches(t)) {
                var card: AccessibilityNodeInfo? = n
                while (card != null && !card.isClickable) card = card.parent
                if (card == null) { pageLevel = true; return }
                val r = Rect()
                card.getBoundsInScreen(r)
                if (r.height() > screenH * 0.7) pageLevel = true
                else if (!r.isEmpty) rects.add(r)
                return
            }
            for (i in 0 until n.childCount) collect(n.getChild(i))
        }
        collect(root)

        if (pageLevel) { // صفحة قناة محظورة كاملة: رجوع
            val now = System.currentTimeMillis()
            if (now - lastBack > 1000) {
                lastBack = now
                performGlobalAction(GLOBAL_ACTION_BACK)
            }
            clearCovers()
            return
        }
        showCovers(rects)
    }

    private fun showCovers(rects: List<Rect>) {
        while (covers.size > rects.size) {
            runCatching { wm.removeView(covers.removeAt(covers.lastIndex)) }
        }
        rects.forEachIndexed { i, r ->
            val lp = WindowManager.LayoutParams(
                r.width(), r.height(),
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                    (if (blockTouch) 0 else WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE),
                PixelFormat.OPAQUE
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                x = r.left
                y = r.top
            }
            if (i < covers.size) {
                wm.updateViewLayout(covers[i], lp)
            } else {
                val v = TextView(this).apply {
                    text = "محظور"
                    gravity = Gravity.CENTER
                    setTextColor(Color.GRAY)
                    setBackgroundColor(Color.rgb(30, 30, 30))
                }
                wm.addView(v, lp)
                covers.add(v)
            }
        }
    }

    private fun clearCovers() {
        handler.removeCallbacks(refresh)
        covers.forEach { runCatching { wm.removeView(it) } }
        covers.clear()
    }

    override fun onUnbind(intent: Intent?): Boolean {
        clearCovers()
        return super.onUnbind(intent)
    }

    override fun onInterrupt() {
        clearCovers()
    }
}
