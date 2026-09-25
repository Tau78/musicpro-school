# MusicPro School — guscio iOS (TestFlight)

App **nativa** (SwiftUI + WKWebView, niente Expo/EAS). Apre la dashboard web:

`https://school.musicproeventi.it/dashboard`

Login e tutta la UI restano sul sito. Sul telefono compare solo l’icona MusicPro School.

## Bundle / ASC

| Campo | Valore |
| --- | --- |
| Bundle | `it.musicproeventi.school` |
| ASC | [6806407450](https://appstoreconnect.apple.com/apps/6806407450/testflight/ios) |
| Team | `YSU7PL673A` |
| Versione marketing | `1.1.0` (guscio WebView) |

## Rilascio TestFlight

Dalla root del repo:

```bash
npm run testflight
# oppure
bash school-shell/scripts/xcode-testflight.sh
```

Flusso: bump build → `xcodebuild archive` → export IPA → `altool` upload → assegna gruppo **Test** (`andreoni.mauro@gmail.com`).

Non è Submit for Review.

## Note

- Host consentiti nel WebView: `school.musicproeventi.it`, `*.supabase.co`, Stripe.
- `tel:` / `mailto:` / WhatsApp si aprono fuori dall’app.
- La vecchia app Expo in `musicpro/apps/mobile` non è più il path di ship; resta in repo per riferimento.
