import SwiftUI

struct RootView: View {
  @State private var isLoading = true
  @State private var webError: String?
  @State private var reloadNonce = 0

  private let brand = Color(red: 0.12, green: 0.23, blue: 0.37)

  var body: some View {
    ZStack {
      brand.ignoresSafeArea()

      SchoolWebView(
        url: SchoolConfig.startURL,
        reloadNonce: reloadNonce,
        isLoading: $isLoading,
        errorText: $webError
      )
      .ignoresSafeArea(edges: .bottom)

      if let errorMessage = webError {
        VStack(spacing: 14) {
          Text(errorMessage)
            .multilineTextAlignment(.center)
            .foregroundStyle(.white)
            .padding(.horizontal, 24)
          Button("Riprova") {
            webError = nil
            isLoading = true
            reloadNonce += 1
          }
          .buttonStyle(.plain)
          .padding(.horizontal, 20)
          .padding(.vertical, 12)
          .background(Color.white)
          .foregroundStyle(brand)
          .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(brand.opacity(0.96))
      } else if isLoading {
        VStack(spacing: 12) {
          ProgressView()
            .tint(.white)
          Text("Apro MusicPro School…")
            .foregroundStyle(Color(white: 0.85))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(brand.opacity(0.92))
        .allowsHitTesting(false)
      }
    }
  }
}
