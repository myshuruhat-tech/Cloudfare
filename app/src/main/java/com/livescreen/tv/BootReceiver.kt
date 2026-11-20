package com.livescreen.tv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restart the watcher after the TV boots (only if the user hasn't stopped it). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        val p = context.getSharedPreferences(LiveWatchService.PREFS, Context.MODE_PRIVATE)
        if (p.getBoolean("enabled", true) && (p.getString("follows", "[]") ?: "[]") != "[]") {
            LiveWatchService.start(context)
        }
    }
}
