package com.example.mobile

import android.app.Activity
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Bundle

class ClipboardImportActivity : Activity() {
    private var consumed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setDimAmount(0f)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && !consumed) {
            consumed = true
            forwardClipboardText()
        }
    }

    private fun forwardClipboardText() {
        val text = readClipboardText()
        val intent = Intent(this, MainActivity::class.java).apply {
            action = ACTION_READ_CLIPBOARD
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_SOURCE, getIntent().getStringExtra(EXTRA_SOURCE) ?: "foreground-gateway")
            if (!text.isNullOrEmpty()) {
                putExtra(EXTRA_CLIPBOARD_TEXT, text)
            }
        }
        startActivity(intent)
        finish()
        overridePendingTransition(0, 0)
    }

    private fun readClipboardText(): String? {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val item = clipboard.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0) ?: return null
        return item.coerceToText(this)?.toString()
    }

    companion object {
        const val ACTION_READ_CLIPBOARD = "com.example.mobile.action.READ_CLIPBOARD"
        const val EXTRA_CLIPBOARD_TEXT = "guyantools.extra.CLIPBOARD_TEXT"
        const val EXTRA_SOURCE = "guyantools.extra.CLIPBOARD_SOURCE"
        const val SHORTCUT_ID_READ = "guyantools_read_clipboard"
    }
}
