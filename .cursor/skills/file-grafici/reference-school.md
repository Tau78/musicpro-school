# MusicPro School — grafica

Repo: `/Users/mauroandreoni/Cursor/MusicPro School`.

Ruolo: **tu sei il grafico di questo repo.** Ogni richiesta grafica usa `file-grafici` e **sempre ONDA**.

L’app School ha poca grafica in git (~35 raster). Dashboard, lezioni, shop crediti sono **vetro + gradiente**, non banner JPG. Non inventare card 1200×520 “Giochi” qui.

## Palette app (obbligatoria)

| Token | Hex | Uso |
|---|---|---|
| Brand navy | `#1e3a5f` | `--brand`, CTA pieni, wordmark, splash iOS |
| Brand gold | `#c9a227` | `--brand-accent`, eyebrow, traccia logo |
| Fondo | `#fafafa` | `--background` |
| Ink | `#171717` | `--foreground` |
| Gradiente associato | `#faf8f5` → `#f5f0ea` → `#ebe4dc` | `.associate-gradient-page` |
| Glass | bianco ~78% | `.glass-card`, raggio `1.25rem` |

Definiti in `musicpro/apps/web/src/app/globals.css` (duplicati critical in `layout.tsx`).

Sale (semantico, non brand): Verde `#38764B`, Rossa `#B23B3E`, Arancio `#D2762A`.  
Viola Tailwind = solo stato «lezione online», mai logo.

**CTA navy pieno → testo bianco** (`text-white` / `btn-brand`). Mai navy su navy. Secondari: bordo navy + testo navy su fondo chiaro.

## Due canali, due identità

| Canale | Look | Non usare per |
|---|---|---|
| **App** (dashboard, shell, email) | Navy + gold, system-ui, titoli `.font-display` (Georgia / ui-serif) | Locandine Eventi, Enigma |
| **Iscrizione FTP** (`iscrizione.html`) | Dark `#070707` / `#111`, CTA rosso `#e10600`, Bricolage Grotesque + Manrope | Materiale che deve sembrare l’app |

Wordmark app: **MusicPro School**. Sottotitolo istituzionale: **Associazione MusicPro**.  
Mark: quadrato navy `rx=12` + «M» stroke gold — vedi `musicpro/apps/web/src/components/brand/brand-logo.tsx`. Non reinterpretare con cubi, viole, Cinzel.

## Sorgenti ufficiali (in-repo)

| File | Ruolo |
|---|---|
| `assets/music-pro-logo.png` | Logo orizzontale **1027×322**; deploy FTP iscrizione |
| `musicpro/apps/mobile/assets/icon.png` | Icona **1024×1024**, no alpha store; navy flatten |
| `school-shell/.../AppIcon.appiconset/AppIcon.png` | Guscio iOS nativo (allineare a `icon.png`) |
| `musicpro/apps/web/public/images/receipt-assoc-logo.png` | Logo ricevute PDF |
| `musicpro/apps/web/src/lib/reimbursements/assets/firma-presidente.png` | Firma; rigenerare anche `firma-presidente-base64.ts` |
| `musicpro/apps/web/public/rooms/verde.jpg` | Foto sala in-repo **828×644** (~4:3) |
| `store/ios/screenshots.md` | Naming e size screenshot ASC |
| `musicpro/packages/database/src/website-content.ts` | Path `img/…` del sito live (file su hosting, non git) |
| `scripts/generate-ios-appicon.sh` | Pipeline resize/flatten icona |
| `assets/mockups/musicpro-school-mockup-final.png` | Riferimento marketing, non usato in UI |

Sorgenti pulite di compose: `docs/assets/school/` (creala al primo asset; non leggere il jpg di output).

**Fuori repo:** `https://www.musicproeventi.it/img/logo.png`, `sale.jpg`, `vintage.jpg`, `propedeutica.png`, `cervellone.jpg`, `Social-1024-trasp.png` (OG). Prima di un PUT FTP: skill/regola **ftp-live-guard** (il live può essere avanti).

## Formati

| Output | Size / note |
|---|---|
| Logo orizzontale | 1027×322 PNG |
| App icon | 1024×1024 PNG, RGB navy, **senza alpha** (poi `generate-ios-appicon.sh`) |
| Foto sala web | ~4:3 JPG, modello 828×644; `object-cover` in `aspect-[4/3]` |
| Screenshot iPhone | 1242×2688, 1284×2778, 1290×2796, 1320×2868 — UI **in uso**, no splash |
| Screenshot iPad 13″ | 2064×2752 |
| Play (quando servono) | icona 512×512, feature **1024×500** — oggi `store/android/` è vuoto |
| og:image landing | logo social WP 1024; `layout.tsx` Next **non** ha ancora `openGraph.images` |

## Card già in School

1. **Sale web** (`room-picker-grid.tsx`): unico overlay su foto. Angolo **basso-destra** libero per chip «Ingrandisci». Nome, capacità, €/h **solo in JSX sotto** la foto — mai nel JPG.
2. **Mobile sale:** niente foto, solo emoji + colore. Non produrre card sala per RN.
3. **Dashboard / lezioni / shop:** vetro + gradiente; saldi, date, «Acquista» restano nel componente.
4. **Mercatino / cespiti:** foto fascia superiore (`object-cover`); titolo e prezzo sotto; soggetto centrato con margine.
5. **Iscrizione:** logo CDN + CSS, niente banner JPG da comporre salvo richiesta esplicita.
6. **Screenshot store:** app vera in uso; no TEST/password; shot `02-area-personale` è documentato ma manca.

## Compose / sync

- Icona: `scripts/generate-ios-appicon.sh` da `mobile/assets/icon.png` → AppIcon set (PIL o sips). `testflight.sh` può pad-dare dal logo se manca l’icona — non è il percorso grafico voluto.
- Iscrizione: `deploy-iscrizione.js` copia `assets/music-pro-logo.png` (non compone raster).
- Firma presidente: aggiorna PNG **e** `firma-presidente-base64.ts`.
- Foto sale Rossa/Arancio: oggi solo CDN; un nuovo JPG locale va in `musicpro/apps/web/public/rooms/` **e** va aggiornato il picker se il path cambia.

## Vietato (School)

- Estetica Eventi/Enigma (cubo viola, smeraldo, Cinzel oro Giochi, 1200×520).
- Dark/rosso iscrizione su materiale dashboard.
- Testo italiano uscito dal generatore di immagini.
- Stirare il logo 1027×322 a icona 1024 senza `generate-ios-appicon.sh` (letterbox/pad, non squash).
- Commit di `.env` o PUT FTP senza confronto live.
