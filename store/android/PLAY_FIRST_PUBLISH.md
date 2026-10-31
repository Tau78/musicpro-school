# Google Play — primo rilascio pubblico (MusicPro School)

**Distribuzione:** pubblica (ricercabile su Play), non Unlisted/privata.  
L’app serve ad associarsi e prenotare le **sale prova** dal telefono.

| Campo | Valore |
| --- | --- |
| package / applicationId | `it.musicproeventi.school` |
| versionName / versionCode | `1.1.0` / `1` |
| Service account | `musicpro-play-submit@rewavier-app.iam.gserviceaccount.com` |
| Upload keystore | `~/.config/musicpro-school/upload.p12` (+ `keystore.env`) — **backup obbligatorio** |
| AAB firmato (stabile) | `~/.config/musicpro-school/dist/musicpro-school-1.1.0-1.aab` |
| Listing IT | `store/android/it-IT/` |
| Privacy | https://www.musicproeventi.it/privacy |
| Supporto | https://school.musicproeventi.it |

## Checklist stato

### DONE (repo / Mac — non ripetere)

- [x] Decisione prodotto: Play **pubblico** (prove + associazione); iOS resta Unlisted
- [x] Listing copy IT in `store/android/it-IT/`
- [x] Upload keystore locale `~/.config/musicpro-school/upload.p12` + `keystore.env` (fuori git)
- [x] Firma release Gradle (`school-shell-android` + `keystore.properties` generato, gitignored)
- [x] AAB firmato **1.1.0 (1)** generato 2026-10-24  
  Path: `~/.config/musicpro-school/dist/musicpro-school-1.1.0-1.aab`
- [x] Script upload API: `scripts/play-submit.mjs` + npm `play:submit` / `play:submit:yes`
- [x] Playbook: questo file; README guscio: `school-shell-android/README.md`
- [x] PR **#206** (`cursor/play-public-aab-aa07`) **merged** su `main` (2026-10-25)
- [x] Dry-run API eseguito → `Package not found` (atteso: app ancora assente in Console)

### MANUAL (solo Mauro — Play Console / Account Holder)

Impossibile via API. Fare in [Play Console](https://play.google.com/console) (Safari/Chrome):

1. **Crea app** `it.musicproeventi.school`  
   - Nome: MusicPro School  
   - Lingua predefinita: italiano  
   - App / Giochi: **App**  
   - Gratis / pubblica  
   - Dichiarazioni policy come richiesto
2. **Utenti e autorizzazioni** → invita  
   `musicpro-play-submit@rewavier-app.iam.gserviceaccount.com`  
   con permesso **Release alle attività di produzione, esclusione e test interni** (o Admin)
3. **Scheda Store** → testi da `store/android/it-IT/` + upload da `store/android/it-IT/images/`  
   - icona: `images/icon-512.png`  
   - feature graphic: `images/feature-graphic-1024x500.png`  
   - screenshot: `images/phoneScreenshots/` (Accedi / Prenotazioni / Prenota sala)  
   - Paesi: almeno **Italia**
4. **Data safety** (dati account/auth; niente location/mic) + Privacy policy URL
5. **Classificazione contenuti** (questionario **IARC**)
6. **App access** (login required) + account demo di review se chiesto  
   (stesso demo iOS: `appstore.review@musicproeventi.it` + password solo in Console)

Poi, da Mac (dopo step 1–2 almeno):

```bash
# dry-run: deve passare quando l’app esiste e il SA è invitato
npm run play:submit

# internal testing (consigliato prima volta)
PLAY_TRACK=internal npm run play:submit:yes

# produzione come bozza (poi "Invia per revisione" in Console)
PLAY_TRACK=production PLAY_STATUS=draft npm run play:submit:yes
```

AAB usato di default dallo script se presente:  
`~/.config/musicpro-school/dist/musicpro-school-1.1.0-1.aab`  
Override: `PLAY_AAB=/path/to.aab npm run play:submit:yes`

Infine in Console: completa checklist residua → track **Production** → **Invia per revisione** (paesi Italia).

## Rebuild AAB (solo se serve un nuovo binario)

```bash
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$JAVA_HOME/bin:$PATH"
npm run android:aab
```

Output build: `school-shell-android/app/build/outputs/bundle/release/app-release.aab`  
Copia stabile da tenere fuori git: `~/.config/musicpro-school/dist/musicpro-school-1.1.0-1.aab`

## Differenza da iOS

iOS School è **Unlisted** (link diretto).  
Android School è **pubblico** su richiesta prodotto (prove + associazione da store).
