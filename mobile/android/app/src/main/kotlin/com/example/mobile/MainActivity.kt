package com.example.mobile

import android.content.ClipData
import android.content.ClipboardManager
import android.content.ClipDescription
import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.net.Uri
import android.os.Build
import android.os.PersistableBundle
import android.graphics.drawable.Icon
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity : FlutterActivity() {
    private val clipboardChannel = "guyantools/clipboard"
    private var methodChannel: MethodChannel? = null
    private var pendingClipboardText: String? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        cachePendingClipboardText(intent)
        methodChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, clipboardChannel)
        methodChannel?.setMethodCallHandler { call, result ->
            when (call.method) {
                "readText" -> result.success(readClipboardText())
                "takePendingReadText" -> {
                    val text = pendingClipboardText
                    pendingClipboardText = null
                    result.success(text)
                }
                "installReadShortcut" -> {
                    runCatching { installReadShortcut() }
                        .onSuccess { result.success(null) }
                        .onFailure { result.error("INSTALL_SHORTCUT_FAILED", it.message, null) }
                }
                "writeText" -> {
                    writeClipboardText(call.argument<String>("text").orEmpty())
                    result.success(null)
                }
                "writeFile" -> {
                    val path = call.argument<String>("path")
                    val mimeType = call.argument<String>("mimeType") ?: "application/octet-stream"
                    if (path.isNullOrBlank()) {
                        result.error("INVALID_PATH", "path is required", null)
                    } else {
                        runCatching { writeClipboardFile(path, mimeType) }
                            .onSuccess { result.success(null) }
                            .onFailure { result.error("WRITE_FILE_FAILED", it.message, null) }
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (cachePendingClipboardText(intent)) {
            methodChannel?.invokeMethod("clipboardReadTextReady", null)
        }
    }

    private fun cachePendingClipboardText(intent: Intent?): Boolean {
        val text = intent?.getStringExtra(ClipboardImportActivity.EXTRA_CLIPBOARD_TEXT)
        if (!text.isNullOrEmpty()) {
            pendingClipboardText = text
            return true
        }
        return false
    }

    private fun readClipboardText(): String? {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val item = clipboard.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0) ?: return null
        return item.coerceToText(this)?.toString()
    }

    private fun writeClipboardText(text: String) {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("GuYanTools", text))
    }

    private fun writeClipboardFile(path: String, mimeType: String) {
        val file = File(path)
        require(file.exists()) { "file does not exist: $path" }
        val uri: Uri = FileProvider.getUriForFile(
            this,
            "${applicationContext.packageName}.clipboard_file_provider",
            file,
        )
        grantUriPermission(packageName, uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
        val clip = ClipData(ClipDescription(file.name, arrayOf(mimeType)), ClipData.Item(uri))
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(clip)
    }

    private fun installReadShortcut() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val shortcutManager = getSystemService(ShortcutManager::class.java)
        val shortcut = ShortcutInfo.Builder(this, ClipboardImportActivity.SHORTCUT_ID_READ)
            .setShortLabel("读取剪贴板")
            .setLongLabel("读取系统剪贴板到 GuYanTools")
            .setIcon(Icon.createWithResource(this, applicationInfo.icon))
            .setIntent(
                Intent(this, ClipboardImportActivity::class.java).apply {
                    action = ClipboardImportActivity.ACTION_READ_CLIPBOARD
                    putExtra(ClipboardImportActivity.EXTRA_SOURCE, "pinned-shortcut")
                },
            )
            .setExtras(
                PersistableBundle().apply {
                    putString(ClipboardImportActivity.EXTRA_SOURCE, "pinned-shortcut")
                },
            )
            .build()
        if (shortcutManager.isRequestPinShortcutSupported) {
            shortcutManager.requestPinShortcut(shortcut, null)
        }
        shortcutManager.dynamicShortcuts = listOf(shortcut)
    }
}
