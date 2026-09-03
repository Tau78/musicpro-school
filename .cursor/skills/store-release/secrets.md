# Segreti e account (Mac di Mauro — non chiedere)

Un agente **non deve** chiedere password Apple, 2FA, team ID o “come si carica”. Usa questi valori e lancia il comando. Mai stampare password. Mai commitare `.env`, `.p8`, `AuthKey_*.p8`, `EXPO_TOKEN`.

## Contatti pubblici (listing / App Review)

| Campo | Valore |
| --- | --- |
| Telefono | `+393716752550` |
| Email sviluppatore / review | `andreoni.mauro@gmail.com` |
| Team ASC | `YSU7PL673A` (Individual — Mauro Andreoni) |

**Vietato** usare numeri privati da anagrafica (`members.phone` o simili) su ASC, sito o listing.

## Firma e upload

| Cosa | Valore / dove |
| --- | --- |
| Apple ID | `andreoni.mauro@gmail.com` — già in **Xcode → Settings → Accounts** |
| Team | `YSU7PL673A` — default in ogni script |
| Firma | Automatica (`CODE_SIGN_STYLE=Automatic`, `-allowProvisioningUpdates`) |
| Override team | `EXPO_APPLE_TEAM_ID` in `.env.local` solo se un’altra app usa altro team |
| EAS / Expo | **Non usare** di default (`#release`). Solo con OK esplicito di Mauro. `EXPO_TOKEN` non inventarlo |

## App Store Connect API Key (globale Mac)

```text
~/.app-store/asc-api/key.env                 # ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH
~/.app-store/asc-api/AuthKey_5WS8U99P9G.p8   # nome ASC: «Mac TestFlight»
```

Key ID attivo: `5WS8U99P9G` · Accesso Amministrazione. Se `key.env` esiste, **usalo** senza chiedere.

`xcrun altool` cerca `.p8` in `~/.appstoreconnect/private_keys`, `~/.private_keys`, `~/private_keys`, `~/.app-store/asc-api/private_keys`. Su questo Mac ci sono **symlink** verso `AuthKey_5WS8U99P9G.p8`.

Nei `.env` di progetto (o source da `key.env`):

```bash
APPLE_API_KEY_ID=5WS8U99P9G
APPLE_API_ISSUER_ID=<da key.env>
APPLE_API_KEY_PATH=/Users/mauroandreoni/.app-store/asc-api/AuthKey_5WS8U99P9G.p8
```

Alias usati da alcuni script ReWavier: `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_KEY_PATH` (stessi file).

Solo se manca tutto: crea key su [Integrations → API](https://appstoreconnect.apple.com/access/integrations/api), salva `.p8` in `~/.app-store/asc-api/`, aggiorna `key.env` e i symlink.

## Se qualcosa manca sul Mac

| Manca | Cosa fare |
| --- | --- |
| `xcodebuild` | My Machines sul Mac mini; non insistire su EAS se quota finita |
| Apple ID in Xcode | Una riga in chat. Non chiedere la password |
| App assente su Connect | `fastlane produce` stesso Apple ID / team / bundle |
| Profilo App Store | `fastlane sigh --app_identifier <bundle> --team_id YSU7PL673A --force` |
| Upload *No Accounts* | Imposta `APPLE_API_KEY_*` da `key.env` |

## Riferimenti app (locale)

| App | Bundle / note |
| --- | --- |
| MusicPro School | `it.musicproeventi.school` · ASC id `6806407450` · `npm run testflight` |
| ReWavier | script in repo + `store/ios/` + Fastlane |
| MusicPro Eventi | `npm run ios:ship-testflight` |
| Love Roulette | `scripts/xcode-testflight.sh --prebuild` |

Dettaglio setup VAI su repo nuovi: anche `~/.cursor/skills/vai-setup/testflight.md` (punta a questa skill per Store).
