---
name: store-release
description: >-
  Full App Store / Play release playbook for Mauro’s apps: secrets on this Mac,
  native Xcode → TestFlight (no Expo/EAS unless Mauro approves), ASC metadata +
  Submit for Review, Play, Age Rating Individual, demo login, Strong Password,
  export compliance, account deletion, Guideline 2.1 / 2.3.3 / 5.1.1 lessons.
  Use when the user says #release, Release, “aggiungi alla skill Release”,
  Submit for Review, store listing, ASC, Play Console, TestFlight,
  xcode-testflight, or after an Apple rejection.
---

# Store release (`#release`)

**Invocazione:** `#release` (o “Release”). **Manutenzione:** *aggiungi alla skill Release* → aggiorna **questa** cartella (`~/.cursor/skills/store-release/`) nello stesso task. Una sola skill; niente nested.

Casa: `~/.cursor/skills/store-release/`. Nei repo iOS: copia in `.cursor/skills/store-release/` (`INSTALL.md`). Segreti: `secrets.md`.

## Policy toolchain iOS (obbligatoria)

**Default: niente Expo, niente EAS.** Percorso ufficiale = **Xcode locale → archive → App Store Connect / TestFlight**.

| Consentito senza chiedere | Vietato senza OK esplicito di Mauro |
| --- | --- |
| `xcodebuild` archive / export | `eas build`, `eas submit`, `eas build --auto-submit` |
| `bash scripts/xcode-testflight.sh` se **non** richiama Expo/EAS | `npx expo …`, `expo prebuild`, Expo Go come gate di rilascio |
| VAI che chiama solo Xcode / script nativi | Reintrodurre workflow Expo “per comodità” |
| Fastlane / ASC API per metadati | — |

Se lo script del repo **ancora** contiene `expo prebuild` / EAS, **non** eseguirlo in silenzio: **AskQuestion** (skill `#askquestion`) con opzioni tipo “Xcode nativo (consigliato)” / “autorizzo Expo/EAS questa volta” / “Altro…”. Se AskQuestion non è nel toolset: non procedere e non elencare opzioni in chat — avvisa che manca il form tappable.

Nuove app / setup: progetto nativo Xcode (o RN **senza** Expo se possibile). Team `YSU7PL673A`. Non assumere `app.json` Expo.

Due rilasci. Confonderli costa giorni.

| Azione | Cosa arriva | Cosa non arriva |
| --- | --- | --- |
| **Xcode locale** → TestFlight | Binary su **TestFlight** | Scheda Store, note, video, credenziali, Age Rating |
| **`bash scripts/xcode-testflight.sh`** / **VAI** (se nativi) | Come sopra | Come sopra |
| **`npm run ios:ship-testflight`** / **`npm run testflight`** | Come sopra | Come sopra — verifica che non chiamino EAS/Expo; se sì → chiedi |
| **`eas build` / Expo** | Solo con **OK esplicito** | — |
| **`asc-metadata.sh` / `asc-submit.sh`** | Metadati / Submit via API | Video fisico, allegati |
| **Submit for Review** | Recensione Store | — |

VAI in altri repo ≠ recensione Store.

| Repo | Comando TestFlight (preferito) |
| --- | --- |
| **ReWavier** | `VAI_MESSAGE='…' bash scripts/vai.sh` o `xcode-testflight.sh` — se lo script fa ancora `expo prebuild`, **chiedi** prima |
| **MusicPro Eventi** | `npm run ios:ship-testflight` da `musicpro-eventi-app/` — stesso check Expo |
| **Love Roulette** | `bash scripts/xcode-testflight.sh` (guscio in `mobile/`) — check Expo |
| **MusicPro School** | `npm run testflight` → `scripts/testflight.sh` — check Expo |
| **Nuova app** | Xcode nativo + team `YSU7PL673A`; **non** scaffoldare Expo |

Apple: TestFlight ≠ scheda pronta. Manca App Review Information → **2.1**. Age Rating sbagliato su Individual → blocco pre-review. Template: `review-notes.template.txt`. Casi: `lessons.md`.

## Segreti (non chiedere)

`secrets.md`: Apple ID in Xcode, team `YSU7PL673A`, ASC API `~/.app-store/asc-api/`, telefono `+393716752550`. No password/2FA in chat. No commit `.env` / `.p8`.

## TestFlight con Xcode locale

### Flusso (nativo)

```text
bump build number (Xcode / Info.plist / whatever the repo uses)
→ pod install se c’è Podfile
→ xcodebuild archive (team YSU7PL673A, signing automatic)
→ exportArchive upload → TestFlight (5–15 min)
```

`ios/` **committato** o comunque presente: non rigenerarlo con Expo. Dopo cambi nativi / permessi / version: archive di nuovo.

### Comandi

```bash
bash scripts/xcode-testflight.sh          # se esiste e non usa Expo/EAS
bash scripts/xcode-testflight.sh --no-upload
VAI_MESSAGE='Perché' bash scripts/vai.sh  # se il passo build è Xcode
```

Flag `vai.sh` tipici: `--skip-build`, `--skip-submit`, `--skip-ftp`.

### Nuova app iOS

1. Copia questa skill + `store-release.mdc` — `INSTALL.md`.
2. Script archive Xcode: `SCHEME`, `WORKSPACE`, team `YSU7PL673A`.
3. Bundle ID su ASC; `ITSAppUsesNonExemptEncryption = false` se solo HTTPS.
4. **Non** aggiungere Expo/EAS di default.

### Problemi comuni

| Sintomo | Cosa fare |
| --- | --- |
| Warning dSYM React/Hermes | Di solito non blocca TestFlight |
| Auth / provisioning | Xcode Accounts; `secrets.md` |
| Build vecchia | bump build + re-archive |
| Splash bloccata | bug avvio, non pipeline |
| Script vuole `expo prebuild` | **Chiedi** a Mauro; non bypassare la policy |
| Path con spazi | build in `/tmp/...` |
| `NODE_BINARY` Cellar | `ios/.xcode.env.local` → `/opt/homebrew/bin/node` |
| Tutte le app in «Testate in precedenza» / «La build è stata rimossa» | Non è la scadenza a 90 giorni se `expirationDate` è **uguale** su più app. Vedi **Contratti Apple** sotto. Nuova build + Installa, non Aggiorna |
| Aggiorna → «questa build non è più disponibile» / «l’app non esiste» | Il tasto punta alla build **morta**. Chiudi TestFlight, tira giù, apri la scheda, **Installa** il numero nuovo |
| API `BETA_CONTRACT_MISSING` | Test esterno bloccato. Accettare [Agreements](https://appstoreconnect.apple.com/agreements). I gruppi **Test** interni tengono |

### Contratti Apple (obbligatorio — 2026-08-31)

TestFlight **non** è solo binary + gruppo tester. Se manca o scade un accordo account (Developer Program, Paid Apps, contratto beta), Apple può **invalidare in un colpo solo** tutte le build vive di **tutte** le app.

Sintomo vero: stesso `expirationDate` (stesso secondo) su Eventi, School, Admin, ReWavier, Gestore, Love Roulette. Un Expire a mano è per **una** build. VAI / `xcode-testflight.sh` **caricano**, non scadono.

**Prima di dire “è sparito il tester” o di riscrivere i gruppi:**

1. Contratti, **due pagine** (Account Holder, Safari sul Mac — su iPhone il banner giallo di Agreements **lampeggia e sparisce**):
   - [developer.apple.com/account](https://developer.apple.com/account) — License Agreement in cima. Accetta.
   - [appstoreconnect.apple.com/agreements](https://appstoreconnect.apple.com/agreements) — tab Agreements. **Non** inseguire il toast giallo. Nella riga **Paid Apps** / **Free Apps** apri **View and Agree to Terms** (o Renew) solo se Action ha un `!` o un Accetta. Su iPhone quella colonna è **fuori schermo a destra**. Date fino al 2027 = contratto **già valido**, non è quello. Controlla anche tab Tasse / Banca.
2. ASC API: `GET /v1/builds?filter[app]=…` e guarda `expired` + `expirationDate`. Stesso timestamp su più app → account, non repo.
3. Mail Apple «Agreement» / «Paid Applications» / «License Agreement» → accettare **subito**, non al prossimo TestFlight rotto.
4. Poi **bump + archive + upload** per ogni app che deve tornare in «In fase di test». Aggiungere `andreoni.mauro@gmail.com` al gruppo **Test** non resuscita una build scaduta.
5. Sul telefono: Apple ID TestFlight = `andreoni.mauro@gmail.com` (gruppi Test = interni). Dopo l’upload: chiudi l’app TestFlight, pull-to-refresh, **Installa** (non Aggiorna).

**Vietato**

- `PATCH /v1/builds/{id}` con `expired: true` (cleanup, “tengo solo l’ultima”, script “expire old”).
- Expire di massa da UI o API “per fare ordine”.
- Gruppo esterno come riparazione se l’API dice `BETA_CONTRACT_MISSING`: prima il contratto.

### Agente

- TestFlight = Xcode. Expo/EAS solo dopo OK.
- TestFlight ≠ Submit for Review.
- App sparite da TestFlight → Agreements + `expirationDate`, poi nuova build. Non expire. Non incolpare il tester a priori.

## Pacchetto obbligatorio (prima app / versione nuova)

Blocca Submit se manca anche una riga.

1. **Privacy** — URL `https` pubblico, allineato all’app.
2. **Screenshot** — app in uso, non splash/solo login (2.3.3). Niente TEST/REVIEW/SMOKE.
3. **Sign-In Required** — se c’è login: ON; user/pass nei **campi dedicati**.
4. **Notes** — inglese, < 4000, 7 punti del template; percorso tap esatto (Password vs magic link).
5. **Video** — iPhone **fisico**, ultimo iOS, dall’icona.
6. **Account demo** — stessa build; non scade; non cliente reale.
7. **Elimina account** — se si crea account (5.1.1); stessa build del video.
8. **Purpose string** — ogni permesso, parole piane.
9. **Device testati** — modelli/iOS veri; se non sai, chiedi.
10. **Contatto** — nome, `+393716752550`, email in App Review Information.
11. **Age Rating** — Individual: Simulated Gambling = **None**. Quiz/classifiche/punti = Contests Infrequent/Mild.
12. **App Privacy** — nutrition labels; non dichiarare dati non raccolti.
13. **Export compliance** — `ITSAppUsesNonExemptEncryption = false` **nel binary**.
14. **Login visibile** — Accedi sul primo schermo.
15. **Password iOS** — crea/conferma: `textContentType="none"`, `passwordRules=""`, autofill off.
16. **Listing ≠ Notes** — vetrina = ruolo utente; staff/demo solo in Review Information.

Niente IAP / social / Drive / AI: dillo. Email+password only → niente SIWA (4.8 se c’è Google/Facebook).

## Dove si compila (ASC UI)

App → versione iOS → **App Review Information**. **Submit** solo a pacchetto pieno.

## Metadati ASC + Submit via API

`secrets.md` + script repo:

```bash
bash scripts/asc-metadata.sh
bash scripts/asc-submit.sh
```

**Manuale:** video iPhone, allegati, selezione build.

### Flusso 1.0.x tipico

1. Release notes / review-notes in `store/ios/`
2. **VAI** → TestFlight (Xcode)
3. Seleziona build su ASC
4. `asc-metadata.sh` → `asc-submit.sh` a pacchetto completo

## Google Play

1. Service account → `.env.play`
2. Testi `store/android/…`
3. Build/submit: script del repo; se lo script è solo EAS Android, **chiedi** prima (stessa policy “niente Expo/EAS senza OK”)

## Video / Notes / Bocciature

Video fisico; template 7 punti; `lessons.md` se bocciano. Stessa build se solo metadati. Nuova build solo se manca nel binario.

## Cosa può / non può fare l’agente

- **Sì:** Notes, demo, delete, Age Rating, checklist, Xcode TestFlight, ASC script, Agreements se TestFlight è vuoto, aggiornare skill su “aggiungi alla skill Release”.
- **No:** inventare video; Submit incompleto; VAI = “è sullo Store”; Simulated Gambling Yes «per sicurezza»; **Expo/EAS senza OK esplicito**; **expire di build** (API o UI) come pulizia.

## Manutenzione

Una cartella: `~/.cursor/skills/store-release/`. Non ricreare `apple-release`.
