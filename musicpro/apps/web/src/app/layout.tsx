import type { Metadata, Viewport } from "next";

import { APP_NAME } from "@musicpro/shared";

import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Pannello amministrativo MusicPro School",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
