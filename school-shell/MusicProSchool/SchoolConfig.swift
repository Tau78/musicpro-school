import Foundation

enum SchoolConfig {
  /// Dashboard web in produzione — login e tutta la UI vivono sul sito.
  static let startURL = URL(string: "https://school.musicproeventi.it/dashboard")!
  static let panelHost = "school.musicproeventi.it"

  /// Host consentiti nel WebView (resto → Safari / app esterne).
  static let allowedHosts: Set<String> = [
    panelHost,
    "ecommerce.nexi.it",
    "int-ecommerce.nexi.it",
  ]

  static func isAllowedHost(_ host: String) -> Bool {
    let h = host.lowercased()
    if allowedHosts.contains(h) { return true }
    if h.hasSuffix(".\(panelHost)") { return true }
    if h.hasSuffix(".supabase.co") { return true }
    if h.hasSuffix(".nexi.it") { return true }
    return false
  }
}
