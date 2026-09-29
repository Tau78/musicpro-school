"use client";

/** Inline styles: global-error replaces root layout (no CSS) and WKWebView is transparent. */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <main
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>
            Errore del server
          </h1>
          <p style={{ margin: "8px 0 0", color: "#525252" }}>
            Si è verificato un problema imprevisto.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 24,
              border: 0,
              borderRadius: 8,
              background: "#1e3a5f",
              color: "#fff",
              fontSize: 14,
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            Riprova
          </button>
        </main>
      </body>
    </html>
  );
}
