import type { Metadata, Viewport } from "next";
import Script from "next/script";

import { APP_NAME } from "@musicpro/shared";

import { PasswordChangePrompt } from "@/components/auth/password-change-prompt";
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

/**
 * CSS critico inline: pagina leggibile anche se /_next/static/css/*.css
 * non applica (Chrome Android / HTML stale).
 * Non includere .mps-tw-ok qui — è il probe del StyleLoadGuard.
 */
const CRITICAL_FALLBACK_CSS = `
:root{--background:#fafafa;--foreground:#171717;--brand:#1e3a5f;--brand-accent:#c9a227;--gradient-start:#faf8f5;--gradient-mid:#f5f0ea;--gradient-end:#ebe4dc;--glass-bg:rgba(255,255,255,.78);--glass-border:rgba(255,255,255,.92)}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;background:var(--background);color:var(--foreground);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5}
a{color:inherit;text-decoration:none}
/* Unlayered: batte @layer utilities di Tailwind (senza questo, a{color:inherit}
   vince su .text-white e i CTA blu restano illeggibili). */
.text-white{color:#fff}
.bg-\\[var\\(--brand\\)\\]{background-color:var(--brand);color:#fff}
a.bg-\\[var\\(--brand\\)\\],button.bg-\\[var\\(--brand\\)\\]{color:#fff}
img,svg{max-width:100%;height:auto;vertical-align:middle}
ul{list-style:none;margin:0;padding:0}
.flex{display:flex}
.inline-flex{display:inline-flex}
.flex-1{flex:1 1 0%}
.flex-col{flex-direction:column}
.flex-wrap{flex-wrap:wrap}
.items-center{align-items:center}
.items-start{align-items:flex-start}
.items-baseline{align-items:baseline}
.justify-between{justify-content:space-between}
.justify-center{justify-content:center}
.gap-1{gap:.25rem}
.gap-2{gap:.5rem}
.gap-3{gap:.75rem}
.gap-4{gap:1rem}
.gap-x-4{column-gap:1rem}
.gap-y-2{row-gap:.5rem}
.shrink-0{flex-shrink:0}
.min-w-0{min-width:0}
.w-full{width:100%}
.h-16{height:4rem}
.w-16{width:4rem}
.min-h-screen{min-height:100vh}
.mx-auto{margin-left:auto;margin-right:auto}
.max-w-3xl{max-width:48rem}
.mt-1{margin-top:.25rem}
.mt-2{margin-top:.5rem}
.mt-4{margin-top:1rem}
.mt-6{margin-top:1.5rem}
.mb-1\\.5{margin-bottom:.375rem}
.ml-1\\.5{margin-left:.375rem}
.space-y-1>:not([hidden])~:not([hidden]){margin-top:.25rem}
.space-y-3>:not([hidden])~:not([hidden]){margin-top:.75rem}
.space-y-5>:not([hidden])~:not([hidden]){margin-top:1.25rem}
.space-y-8>:not([hidden])~:not([hidden]){margin-top:2rem}
.p-4{padding:1rem}
.p-6{padding:1.5rem}
.px-3{padding-left:.75rem;padding-right:.75rem}
.px-5{padding-left:1.25rem;padding-right:1.25rem}
.py-0\\.5{padding-top:.125rem;padding-bottom:.125rem}
.py-1{padding-top:.25rem;padding-bottom:.25rem}
.py-2{padding-top:.5rem;padding-bottom:.5rem}
.py-3{padding-top:.75rem;padding-bottom:.75rem}
.py-4{padding-top:1rem;padding-bottom:1rem}
.pt-2{padding-top:.5rem}
.pb-12{padding-bottom:3rem}
.rounded-lg{border-radius:.5rem}
.rounded-xl{border-radius:.75rem}
.rounded-2xl{border-radius:1rem}
.rounded-full{border-radius:9999px}
.border{border-width:1px;border-style:solid}
.border-neutral-200{border-color:#e5e5e5}
.border-amber-200{border-color:#fde68a}
.bg-neutral-50{background-color:#fafafa}
.bg-green-100{background-color:#dcfce7}
.bg-amber-50{background-color:#fffbeb}
.bg-amber-100{background-color:#fef3c7}
.bg-emerald-50{background-color:#ecfdf5}
.font-display{font-family:ui-serif,Georgia,"Times New Roman",serif}
.font-semibold{font-weight:600}
.font-medium{font-weight:500}
.font-normal{font-weight:400}
.text-right{text-align:right}
.text-sm{font-size:.875rem;line-height:1.25rem}
.text-xs{font-size:.75rem;line-height:1rem}
.text-\\[11px\\]{font-size:11px;line-height:1rem}
.text-lg{font-size:1.125rem;line-height:1.75rem}
.text-2xl{font-size:1.5rem;line-height:2rem}
.text-3xl{font-size:1.875rem;line-height:2.25rem}
.leading-tight{line-height:1.25}
.uppercase{text-transform:uppercase}
.tracking-wide{letter-spacing:.025em}
.tracking-wider{letter-spacing:.05em}
.tabular-nums{font-variant-numeric:tabular-nums}
.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.text-neutral-500{color:#737373}
.text-neutral-600{color:#525252}
.text-neutral-800{color:#262626}
.text-neutral-900{color:#171717}
.text-green-700{color:#15803d}
.text-green-800{color:#166534}
.text-amber-800{color:#92400e}
.text-amber-900{color:#78350f}
.text-emerald-800{color:#065f46}
.text-\\[var\\(--brand\\)\\]{color:var(--brand)}
.text-\\[var\\(--brand-accent\\)\\]{color:var(--brand-accent)}
.bg-\\[var\\(--brand-accent\\)\\]{background-color:var(--brand-accent)}
.associate-gradient-page{position:relative;isolation:isolate;min-height:100vh;background:linear-gradient(165deg,var(--gradient-start) 0%,var(--gradient-mid) 45%,var(--gradient-end) 100%)}
.associate-glass-header{border-bottom:1px solid rgba(255,255,255,.65);background:rgba(255,255,255,.55)}
.glass-card{border-radius:1.25rem;border:1px solid var(--glass-border);background:var(--glass-bg)}
.relative{position:relative}
`;

/** Boot early: non dipende da React hydration (utile su Android). */
const CSS_BOOT_SCRIPT = `(function(){try{var K="mps-css-force-v2";function ok(){var d=document.createElement("div");d.className="mps-tw-ok";d.style.cssText="position:absolute;left:-9999px;width:1px;height:1px";(document.documentElement||document.body).appendChild(d);var v=getComputedStyle(d).getPropertyValue("--mps-tw").trim();d.remove();return v==="1"}function inject(){var links=[].slice.call(document.querySelectorAll('link[rel="stylesheet"]'));if(!links.length)return Promise.resolve(0);return Promise.all(links.map(function(link){var href=link.href;if(!href||link.getAttribute("data-mps-forced")==="1")return Promise.resolve(0);var u=href+(href.indexOf("?")>=0?"&":"?")+"mpscb="+Date.now();return fetch(u,{cache:"no-store",credentials:"same-origin"}).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(css){if(!css||css.length<200)return 0;var s=document.createElement("style");s.setAttribute("data-mps-forced","1");s.textContent=css;document.head.appendChild(s);link.setAttribute("data-mps-forced","1");return 1}).catch(function(){return 0})})).then(function(a){return a.reduce(function(x,y){return x+y},0)})}function run(){if(ok())return;inject().then(function(){if(ok())return;try{if(sessionStorage.getItem(K))return;sessionStorage.setItem(K,"1")}catch(e){return}setTimeout(function(){if(!ok())location.reload()},800)})}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){setTimeout(run,50)});else setTimeout(run,50)}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <head>
        <style dangerouslySetInnerHTML={{ __html: CRITICAL_FALLBACK_CSS }} />
        <Script
          id="mps-css-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: CSS_BOOT_SCRIPT }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <StyleLoadGuard />
        <PasswordChangePrompt />
        {children}
      </body>
    </html>
  );
}
