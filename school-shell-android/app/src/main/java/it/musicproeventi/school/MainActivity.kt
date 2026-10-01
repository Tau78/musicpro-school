package it.musicproeventi.school

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import it.musicproeventi.school.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {
  private lateinit var binding: ActivityMainBinding

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    binding = ActivityMainBinding.inflate(layoutInflater)
    setContentView(binding.root)

    binding.retryButton.setOnClickListener { loadStart() }

    val web = binding.webView
    web.settings.javaScriptEnabled = true
    web.settings.domStorageEnabled = true
    web.settings.mediaPlaybackRequiresUserGesture = false
    web.webChromeClient = object : WebChromeClient() {
      override fun onProgressChanged(view: WebView?, newProgress: Int) {
        binding.progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
      }
    }
    web.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val uri = request.url
        val scheme = uri.scheme?.lowercase()
        if (scheme == "tel" || scheme == "mailto" || scheme == "whatsapp" || scheme == "sms") {
          startActivity(Intent(Intent.ACTION_VIEW, uri))
          return true
        }
        val host = uri.host
        if (SchoolConfig.isAllowedHost(host)) return false
        startActivity(Intent(Intent.ACTION_VIEW, uri))
        return true
      }

      override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
        binding.errorBox.visibility = View.GONE
      }

      override fun onReceivedError(
        view: WebView,
        request: WebResourceRequest,
        error: WebResourceError,
      ) {
        if (request.isForMainFrame) {
          binding.errorBox.visibility = View.VISIBLE
        }
      }
    }

    if (savedInstanceState == null) loadStart() else web.restoreState(savedInstanceState)
  }

  private fun loadStart() {
    binding.errorBox.visibility = View.GONE
    binding.webView.loadUrl(SchoolConfig.START_URL)
  }

  override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    binding.webView.saveState(outState)
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    if (binding.webView.canGoBack()) binding.webView.goBack() else super.onBackPressed()
  }
}
