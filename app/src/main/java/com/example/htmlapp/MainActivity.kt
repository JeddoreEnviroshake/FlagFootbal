package com.example.htmlapp

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.webkit.WebViewAssetLoader
import com.example.htmlapp.BuildConfig

private const val ASSET_URL = "https://appassets.androidplatform.net/assets/index.html"

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var backCallback: OnBackPressedCallback

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    private val assetHost: String? = Uri.parse(ASSET_URL).host

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var fileChooserLauncher: ActivityResultLauncher<Intent>

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        progressBar = findViewById(R.id.progressBar)
        webView = findViewById(R.id.webView)

        // FIX: create an OnBackPressedCallback object and register it
        backCallback = object : OnBackPressedCallback(false) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    // disable this callback so the dispatcher can propagate the back event
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                    // optionally re-enable for future use:
                    isEnabled = true
                }
            }
        }
        onBackPressedDispatcher.addCallback(this, backCallback)

        setupFileChooser()
        configureWebView()

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(ASSET_URL)
        }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        webView.apply {
            loadUrl("about:blank")
            stopLoading()
            clearHistory()
            removeAllViews()
            destroy()
        }
        super.onDestroy()
    }

    override fun onPause() {
        webView.apply {
            onPause()
            pauseTimers()
        }
        super.onPause()
    }

    override fun onResume() {
        webView.apply {
            onResume()
            resumeTimers()
        }
        super.onResume()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_VOLUME_UP -> {
                // Volume Up → Guy Play
                webView.evaluateJavascript(
                    "window.triggerGuyPlay && window.triggerGuyPlay();",
                    null
                )
                true // consume the event so system volume doesn’t change
            }
            KeyEvent.KEYCODE_VOLUME_DOWN -> {
                // Volume Down → Girl Play
                webView.evaluateJavascript(
                    "window.triggerGirlPlay && window.triggerGirlPlay();",
                    null
                )
                true // consume the event
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_VOLUME_UP, KeyEvent.KEYCODE_VOLUME_DOWN -> true
            else -> super.onKeyUp(keyCode, event)
        }
    }


    private fun setupFileChooser() {
        fileChooserLauncher =
            registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
                val callback = filePathCallback
                val data = result.data
                if (callback == null) return@registerForActivityResult

                val uris: Array<Uri>? = if (result.resultCode == RESULT_OK) {
                    when {
                        data == null -> null
                        data.clipData != null -> {
                            val clip = data.clipData
                            if (clip != null) Array(clip.itemCount) { i -> clip.getItemAt(i).uri } else null
                        }
                        data.data != null -> arrayOf(data.data!!)
                        else -> null
                    }
                } else {
                    null
                }

                callback.onReceiveValue(uris)
                filePathCallback = null
            }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = false
            displayZoomControls = false
        }

        CookieManager.getInstance().setAcceptCookie(true)
        webView.scrollBarStyle = View.SCROLLBARS_INSIDE_OVERLAY

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val uri = request?.url ?: return false
                if (uri.host?.equals(assetHost, ignoreCase = true) == true) return false
                return handleExternalUri(uri)
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return url?.let {
                    val uri = Uri.parse(it)
                    if (uri.host?.equals(assetHost, ignoreCase = true) == true) {
                        false
                    } else {
                        handleExternalUri(uri)
                    }
                } ?: false
            }

            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                // FIX: pass a non-null Uri to assetLoader
                val url = request?.url ?: return null
                return assetLoader.shouldInterceptRequest(url)
            }

            @Deprecated("Deprecated in Java")
            override fun shouldInterceptRequest(
                view: WebView?,
                url: String?
            ): WebResourceResponse? {
                // FIX: ensure non-null Uri
                val parsed = url?.let(Uri::parse) ?: return null
                return assetLoader.shouldInterceptRequest(parsed)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (::backCallback.isInitialized) {
                    backCallback.isEnabled = webView.canGoBack()
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.isVisible = newProgress < 100
                progressBar.progress = newProgress
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                val intent = try {
                    fileChooserParams.createIntent()
                } catch (e: Exception) {
                    Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    }
                }

                return if (intent.resolveActivity(packageManager) != null) {
                    try {
                        fileChooserLauncher.launch(intent)
                        true
                    } catch (_: ActivityNotFoundException) {
                        showToast(R.string.webview_no_file_picker)
                        this@MainActivity.filePathCallback?.onReceiveValue(null)
                        this@MainActivity.filePathCallback = null
                        false
                    }
                } else {
                    showToast(R.string.webview_no_file_picker)
                    this@MainActivity.filePathCallback?.onReceiveValue(null)
                    this@MainActivity.filePathCallback = null
                    false
                }
            }
        }
    }

    private fun handleExternalUri(uri: Uri): Boolean {
        val scheme = uri.scheme ?: return false
        return when (scheme.lowercase()) {
            "http", "https", "mailto", "tel" -> {
                openExternalLink(uri)
                true
            }
            else -> false
        }
    }

    private fun openExternalLink(uri: Uri) {
        val intent = Intent(Intent.ACTION_VIEW, uri)
        try {
            startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            showToast(R.string.webview_unable_to_open_link)
        }
    }

    private fun showToast(messageRes: Int) {
        Toast.makeText(this, messageRes, Toast.LENGTH_SHORT).show()
    }
}
