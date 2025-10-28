package com.example.htmlapp

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
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
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.webkit.WebViewAssetLoader
import com.example.htmlapp.BuildConfig
import com.firebase.ui.auth.AuthUI
import com.firebase.ui.auth.IdpResponse
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.ktx.auth
import com.google.firebase.ktx.Firebase

private const val ASSET_URL = "https://appassets.androidplatform.net/assets/index.html"
private const val KEY_WEBVIEW_LOADED = "webview_loaded"

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var loginContainer: View
    private lateinit var signInButton: Button
    private lateinit var loginStatus: TextView
    private lateinit var backCallback: OnBackPressedCallback

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    private val assetHost: String? = Uri.parse(ASSET_URL).host

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var fileChooserLauncher: ActivityResultLauncher<Intent>
    private lateinit var signInLauncher: ActivityResultLauncher<Intent>

    private lateinit var auth: FirebaseAuth
    private lateinit var authStateListener: FirebaseAuth.AuthStateListener
    private var hasLoadedInitialUrl = false
    private var pendingWebViewState: Bundle? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        FirebaseApp.initializeApp(this)
        setContentView(R.layout.activity_main)

        progressBar = findViewById(R.id.progressBar)
        webView = findViewById(R.id.webView)
        loginContainer = findViewById(R.id.loginContainer)
        signInButton = findViewById(R.id.signInButton)
        loginStatus = findViewById(R.id.loginStatus)

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
        setupSignInLauncher()
        configureWebView()

        if (savedInstanceState != null) {
            hasLoadedInitialUrl = savedInstanceState.getBoolean(KEY_WEBVIEW_LOADED, false)
            pendingWebViewState = savedInstanceState
        }

        auth = Firebase.auth
        authStateListener = FirebaseAuth.AuthStateListener { firebaseAuth ->
            updateUiForUser(firebaseAuth.currentUser)
        }

        signInButton.setOnClickListener {
            launchSignIn()
        }

        updateUiForUser(auth.currentUser)

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (webView.isVisible) {
            webView.saveState(outState)
            outState.putBoolean(KEY_WEBVIEW_LOADED, true)
        }
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
        if (webView.isVisible) {
            webView.onPause()
            webView.pauseTimers()
        }
        super.onPause()
    }

    override fun onResume() {
        if (webView.isVisible) {
            webView.onResume()
            webView.resumeTimers()
        }
        super.onResume()
    }

    override fun onStart() {
        super.onStart()
        auth.addAuthStateListener(authStateListener)
    }

    override fun onStop() {
        auth.removeAuthStateListener(authStateListener)
        super.onStop()
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

    private fun setupSignInLauncher() {
        signInLauncher =
            registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
                if (result.resultCode == RESULT_OK) {
                    loginStatus.isVisible = false
                    signInButton.isEnabled = true
                    return@registerForActivityResult
                }

                val response = IdpResponse.fromResultIntent(result.data)
                val message = response?.error?.localizedMessage
                loginStatus.text = message ?: getString(R.string.login_failure)
                loginStatus.isVisible = true
                signInButton.isEnabled = true
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
                    backCallback.isEnabled = webView.canGoBack() && webView.isVisible
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

    private fun updateUiForUser(user: com.google.firebase.auth.FirebaseUser?) {
        if (user == null) {
            showLoginUi()
        } else {
            showWebContent()
        }
    }

    private fun showLoginUi() {
        loginContainer.isVisible = true
        signInButton.isEnabled = true
        progressBar.isVisible = false
        progressBar.progress = 0
        webView.isVisible = false
        backCallback.isEnabled = false
        pendingWebViewState = null
        if (hasLoadedInitialUrl) {
            webView.apply {
                stopLoading()
                loadUrl("about:blank")
                clearHistory()
            }
            hasLoadedInitialUrl = false
        }
    }

    private fun showWebContent() {
        loginContainer.isVisible = false
        webView.isVisible = true
        progressBar.progress = 0

        val state = pendingWebViewState
        if (state != null) {
            webView.restoreState(state)
            pendingWebViewState = null
            hasLoadedInitialUrl = true
        } else if (!hasLoadedInitialUrl) {
            webView.loadUrl(ASSET_URL)
            hasLoadedInitialUrl = true
        }
    }

    private fun launchSignIn() {
        signInButton.isEnabled = false
        loginStatus.isVisible = false

        val providers = listOf(
            AuthUI.IdpConfig.EmailBuilder().build()
        )

        val intent = AuthUI.getInstance()
            .createSignInIntentBuilder()
            .setAvailableProviders(providers)
            .setIsSmartLockEnabled(false)
            .build()

        signInLauncher.launch(intent)
    }
}
