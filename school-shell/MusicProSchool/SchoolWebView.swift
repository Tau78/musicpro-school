import SwiftUI
import WebKit

struct SchoolWebView: UIViewRepresentable {
  let url: URL
  let reloadNonce: Int
  @Binding var isLoading: Bool
  @Binding var errorText: String?

  func makeCoordinator() -> Coordinator {
    Coordinator(isLoading: $isLoading, errorText: $errorText)
  }

  func makeUIView(context: Context) -> WKWebView {
    let config = WKWebViewConfiguration()
    config.allowsInlineMediaPlayback = true
    config.defaultWebpagePreferences.allowsContentJavaScript = true

    let webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = context.coordinator
    webView.uiDelegate = context.coordinator
    webView.allowsBackForwardNavigationGestures = true
    webView.scrollView.contentInsetAdjustmentBehavior = .automatic
    webView.isOpaque = false
    webView.backgroundColor = UIColor(red: 0.12, green: 0.23, blue: 0.37, alpha: 1)
    context.coordinator.webView = webView
    webView.load(URLRequest(url: url))
    return webView
  }

  func updateUIView(_ webView: WKWebView, context: Context) {
    if context.coordinator.lastReloadNonce != reloadNonce {
      context.coordinator.lastReloadNonce = reloadNonce
      webView.load(URLRequest(url: url))
    }
  }

  final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
    @Binding var isLoading: Bool
    @Binding var errorText: String?
    weak var webView: WKWebView?
    var isOpeningExternal = false
    var lastReloadNonce = -1

    init(isLoading: Binding<Bool>, errorText: Binding<String?>) {
      _isLoading = isLoading
      _errorText = errorText
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
      isLoading = true
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      isLoading = false
      errorText = nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
      isLoading = false
      errorText = "Non riesco ad aprire MusicPro School. Controlla la connessione e riprova."
    }

    func webView(
      _ webView: WKWebView,
      didFailProvisionalNavigation navigation: WKNavigation!,
      withError error: Error
    ) {
      isLoading = false
      let nsError = error as NSError
      if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
        return
      }
      errorText = "Non riesco ad aprire MusicPro School. Controlla la connessione e riprova."
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
      webView.reload()
    }

    func webView(
      _ webView: WKWebView,
      decidePolicyFor navigationAction: WKNavigationAction,
      decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
      guard let url = navigationAction.request.url else {
        decisionHandler(.allow)
        return
      }

      if shouldOpenOutside(url) {
        isOpeningExternal = true
        UIApplication.shared.open(url, options: [:]) { _ in
          self.isOpeningExternal = false
        }
        decisionHandler(.cancel)
        return
      }

      decisionHandler(.allow)
    }

    func webView(
      _ webView: WKWebView,
      createWebViewWith configuration: WKWebViewConfiguration,
      for navigationAction: WKNavigationAction,
      windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
      if let url = navigationAction.request.url {
        if shouldOpenOutside(url) {
          UIApplication.shared.open(url)
        } else {
          webView.load(URLRequest(url: url))
        }
      }
      return nil
    }

    private func shouldOpenOutside(_ url: URL) -> Bool {
      let scheme = (url.scheme ?? "").lowercased()
      if ["tel", "mailto", "sms", "whatsapp"].contains(scheme) {
        return true
      }
      guard let host = url.host?.lowercased() else { return false }
      if host.contains("whatsapp.com") || host == "wa.me" {
        return true
      }
      return !SchoolConfig.isAllowedHost(host)
    }
  }
}
