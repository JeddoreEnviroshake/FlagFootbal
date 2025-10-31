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
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.core.widget.doAfterTextChanged
import androidx.webkit.WebViewAssetLoader
import com.example.htmlapp.BuildConfig
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.android.material.button.MaterialButton
import com.google.android.material.progressindicator.CircularProgressIndicator
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.ktx.auth
import com.google.firebase.ktx.Firebase

private const val ASSET_URL = "https://appassets.androidplatform.net/assets/index.html"
private const val KEY_WEBVIEW_LOADED = "webview_loaded"
private const val TAG = "MainActivity"

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var loginContainer: View
    private lateinit var signInButton: MaterialButton
    private lateinit var continueButton: MaterialButton
    private lateinit var loginEmailLayout: TextInputLayout
    private lateinit var loginEmailInput: TextInputEditText
    private lateinit var loginProgress: CircularProgressIndicator
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
    private lateinit var googleSignInLauncher: ActivityResultLauncher<Intent>

    private var auth: FirebaseAuth? = null
    private var authStateListener: FirebaseAuth.AuthStateListener? = null
    private var hasLoadedInitialUrl = false
    private var pendingWebViewState: Bundle? = null
    private var googleSignInClient: GoogleSignInClient? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val firebaseApp = FirebaseApp.initializeApp(this)
        setContentView(R.layout.activity_main)

        progressBar = findViewById(R.id.progressBar)
        webView = findViewById(R.id.webView)
        loginContainer = findViewById(R.id.loginContainer)
        signInButton = findViewById(R.id.signInButton)
        continueButton = findViewById(R.id.continueButton)
        loginEmailLayout = findViewById(R.id.loginEmailLayout)
        loginEmailInput = findViewById(R.id.loginEmailInput)
        loginProgress = findViewById(R.id.loginProgress)
        loginStatus = findViewById(R.id.loginStatus)

        loginEmailInput.doAfterTextChanged {
            if (loginEmailLayout.isErrorEnabled) {
                loginEmailLayout.error = null
                loginEmailLayout.isErrorEnabled = false
            }
        }

        continueButton.setOnClickListener {
            val email = loginEmailInput.text?.toString()?.trim().orEmpty()
            if (email.isEmpty()) {
                loginEmailLayout.error = getString(R.string.login_email_error)
                loginEmailLayout.isErrorEnabled = true
            } else {
                loginEmailLayout.error = null
                loginEmailLayout.isErrorEnabled = false
                launchSignIn()
            }
        }

        signInButton.setOnClickListener {
            launchSignIn()
        }

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
        setupGoogleSignInLauncher()
        configureWebView()

        if (savedInstanceState != null) {
            hasLoadedInitialUrl = savedInstanceState.getBoolean(KEY_WEBVIEW_LOADED, false)
            pendingWebViewState = savedInstanceState
        }

        if (firebaseApp == null) {
            Log.w(TAG, "FirebaseApp.initializeApp returned null; running in offline mode")
            signInButton.isEnabled = false
            continueButton.isEnabled = false
            loginContainer.isVisible = false
            showToast(R.string.login_unavailable)
            showWebContent()
        } else {
            auth = Firebase.auth(firebaseApp)
            configureGoogleSignIn()
            authStateListener = FirebaseAuth.AuthStateListener { firebaseAuth ->
                updateUiForUser(firebaseAuth.currentUser)
            }
            updateUiForUser(auth?.currentUser)
        }

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
        val listener = authStateListener
        val firebaseAuth = auth
        if (firebaseAuth != null && listener != null) {
            firebaseAuth.addAuthStateListener(listener)
        }
    }

    override fun onStop() {
        val listener = authStateListener
        val firebaseAuth = auth
        if (firebaseAuth != null && listener != null) {
            firebaseAuth.removeAuthStateListener(listener)
        }
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

    private fun setupGoogleSignInLauncher() {
        googleSignInLauncher =
            registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
                val data = result.data
                if (result.resultCode != RESULT_OK) {
                    setLoginInProgress(false)
                    showLoginError(getString(R.string.login_failure))
                    return@registerForActivityResult
                }

                val task = GoogleSignIn.getSignedInAccountFromIntent(data)
                try {
                    val account = task.getResult(ApiException::class.java)
                    val idToken = account?.idToken
                    if (idToken.isNullOrEmpty()) {
                        setLoginInProgress(false)
                        showLoginError(getString(R.string.login_failure))
                        return@registerForActivityResult
                    }
                    val credential = GoogleAuthProvider.getCredential(idToken, null)
                    val firebaseAuth = auth
                    if (firebaseAuth == null) {
                        setLoginInProgress(false)
                        showLoginError(getString(R.string.login_unavailable))
                        return@registerForActivityResult
                    }

                    firebaseAuth.signInWithCredential(credential)
                        .addOnCompleteListener { signInTask ->
                            setLoginInProgress(false)
                            if (signInTask.isSuccessful) {
                                loginStatus.isVisible = false
                            } else {
                                val message = signInTask.exception?.localizedMessage
                                showLoginError(message ?: getString(R.string.login_failure))
                            }
                        }
                } catch (error: ApiException) {
                    Log.e(TAG, "Google sign-in failed", error)
                    setLoginInProgress(false)
                    val message = error.localizedMessage ?: getString(R.string.login_failure)
                    showLoginError(message)
                }
            }
    }

    private fun configureGoogleSignIn() {
        val webClientId = getString(R.string.default_web_client_id)
        if (webClientId.isBlank() || webClientId == "YOUR_WEB_CLIENT_ID") {
            Log.w(TAG, "default_web_client_id is missing or placeholder; Google Sign-In disabled")
            googleSignInClient = null
            return
        }

        googleSignInClient = GoogleSignIn.getClient(
            this,
            GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(webClientId)
                .requestEmail()
                .build()
        )
    }

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    private fun configureWebView() {
        webView.addJavascriptInterface(AppBridge(), "AndroidApp")
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
        progressBar.isVisible = false
        progressBar.progress = 0
        webView.isVisible = false
        backCallback.isEnabled = false
        pendingWebViewState = null
        loginStatus.isVisible = false
        loginEmailLayout.error = null
        loginEmailLayout.isErrorEnabled = false
        setLoginInProgress(false)
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

    private fun setLoginInProgress(inProgress: Boolean) {
        signInButton.isEnabled = !inProgress
        continueButton.isEnabled = !inProgress
        loginEmailInput.isEnabled = !inProgress
        loginProgress.isVisible = inProgress
    }

    private fun showLoginError(message: String) {
        loginStatus.text = message
        loginStatus.isVisible = true
    }

    private fun signOutUser(): Boolean {
        val firebaseAuth = auth ?: return false

        firebaseAuth.signOut()
        googleSignInClient?.signOut()

        try {
            webView.evaluateJavascript(
                "if (window.firebase && firebase.auth) { firebase.auth().signOut().catch(function(){}); }",
                null
            )
        } catch (error: Exception) {
            Log.w(TAG, "Unable to sign out web session", error)
        }

        loginStatus.isVisible = false
        loginEmailLayout.error = null
        loginEmailLayout.isErrorEnabled = false
        loginEmailInput.setText("")
        setLoginInProgress(false)
        showLoginUi()
        return true
    }

    private inner class AppBridge {
        @JavascriptInterface
        fun signOut() {
            runOnUiThread {
                val success = signOutUser()
                if (!success) {
                    showToast(R.string.login_sign_out_error)
                }
            }
        }
    }

    private fun launchSignIn() {
        val firebaseAuth = auth
        val client = googleSignInClient
        if (firebaseAuth == null) {
            Log.w(TAG, "Ignoring sign-in launch request because Firebase is unavailable")
            showToast(R.string.login_unavailable)
            return
        }
        if (client == null) {
            showLoginError(getString(R.string.login_missing_google_id))
            return
        }

        loginStatus.isVisible = false
        loginEmailLayout.error = null
        loginEmailLayout.isErrorEnabled = false
        setLoginInProgress(true)

        client.signOut().addOnCompleteListener {
            googleSignInLauncher.launch(client.signInIntent)
        }
    }
}
