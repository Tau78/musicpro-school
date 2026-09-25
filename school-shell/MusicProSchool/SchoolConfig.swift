import Foundation

enum SchoolConfig {
  /// Dashboard web in produzione — login e tutta la UI vivono sul sito.
  static let startURL = URL(string: "https://school.musicproeventi.it/dashboard")!
  static let panelHost = "school.musicproeventi.it"

  /// Host consentiti nel WebView (resto → Safari / app esterne).
  static let allowedHosts: Set<String> = [
    panelHost,
    "checkout.stripe.com",
    "js.stripe.com",
    "hooks.stripe.com",
    "m.stripe.com",
    "m.stripe.network",
    "api.stripe.com",
  ]

  static func isAllowedHost(_ host: String) -> Bool {
    let h = host.lowercased()
    if allowedHosts.contains(h) { return true }
    if h.hasSuffix(".\(panelHost)") { return true }
    if h.hasSuffix(".supabase.co") { return true }
    if h.hasSuffix(".stripe.com") { return true }
    return false
  }
}
