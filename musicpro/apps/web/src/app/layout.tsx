import type { Metadata, Viewport } from "next";

import { APP_NAME } from "@musicpro/shared";

import { StyleLoadGuard } from "@/components/style-load-guard";

import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Pannello amministrativo MusicPro School",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

/** CSS critico inline: resta leggibile anche se /_next/static/css/*.css non carica. */
const CRITICAL_FALLBACK_CSS = `
:root{--background:#fafafa;--foreground:#171717;--brand:#1e3a5f;--brand-accent:#c9a227;--gradient-start:#faf8f5;--gradient-mid:#f5f0ea;--gradient-end:#ebe4dc;--glass-bg:rgba(255,255,255,.78);--glass-border:rgba(255,255,255,.92)}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;background:var(--background);color:var(--foreground);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5}
a{color:inherit}
img,svg{max-width:100%;height:auto;vertical-align:middle}
.flex{display:flex}
.inline-flex{display:inline-flex}
.flex-col{flex-direction:column}
.flex-wrap{flex-wrap:wrap}
.items-center{align-items:center}
.items-start{align-items:flex-start}
.justify-between{justify-content:space-between}
.justify-center{justify-content:center}
.gap-2{gap:.5rem}
.gap-3{gap:.75rem}
.gap-4{gap:1rem}
.shrink-0{flex-shrink:0}
.min-w-0{min-width:0}
.w-full{width:100%}
.min-h-screen{min-height:100vh}
.rounded-lg{border-radius:.5rem}
.rounded-xl{border-radius:.75rem}
.rounded-2xl{border-radius:1rem}
.rounded-full{border-radius:9999px}
.font-display{font-family:ui-serif,Georgia,"Times New Roman",serif}
.font-semibold{font-weight:600}
.font-medium{font-weight:500}
.text-sm{font-size:.875rem}
.text-xs{font-size:.75rem}
.text-2xl{font-size:1.5rem}
.text-3xl{font-size:1.875rem}
.leading-tight{line-height:1.25}
.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.associate-gradient-page{position:relative;isolation:isolate;min-height:100vh;background:linear-gradient(165deg,var(--gradient-start) 0%,var(--gradient-mid) 45%,var(--gradient-end) 100%)}
.associate-glass-header{border-bottom:1px solid rgba(255,255,255,.65);background:rgba(255,255,255,.55)}
.glass-card{border-radius:1.25rem;border:1px solid var(--glass-border);background:var(--glass-bg)}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className="min-h-screen antialiased">
        <style dangerouslySetInnerHTML={{ __html: CRITICAL_FALLBACK_CSS }} />
        <StyleLoadGuard />
        {children}
      </body>
    </html>
  );
}
