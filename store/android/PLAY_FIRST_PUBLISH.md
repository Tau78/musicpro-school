# Google Play — primo rilascio pubblico (MusicPro School)

**Distribuzione:** pubblica (ricercabile su Play), non Unlisted/privata.  
L’app serve ad associarsi e prenotare le **sale prova** dal telefono.

| Campo | Valore |
| --- | --- |
| package / applicationId | `it.musicproeventi.school` |
| versionName / versionCode | `1.1.0` / `1` |
| Service account | `musicpro-play-submit@rewavier-app.iam.gserviceaccount.com` |
| Upload keystore | `~/.config/musicpro-school/upload.p12` (+ `keystore.env`) — **backup obbligatorio** |
| Listing IT | `store/android/it-IT/` |
| Privacy | https://www.musicproeventi.it/privacy |
| Supporto | https://school.musicproeventi.it |

## Una tantum in Play Console (Account Holder, Safari/Chrome)

1. [Play Console](https://play.google.com/console) → **Crea app**  
   - Nome: MusicPro School  
   - Lingua predefinita: italiano  
   - App / Giochi: **App**  
   - Gratis  
   - Dichiarazioni policy come richiesto
2. **Utenti e autorizzazioni** → invita  
   `musicpro-play-submit@rewavier-app.iam.gserviceaccount.com`  
   con permesso **Release alle attività di produzione, esclusione e test interni** (o Admin).
3. **Impostazioni app** → Privacy policy URL + Data safety (dati account/auth, niente location/mic).
4. **Classificazione contenuti** (IARC questionnaire).
5. **Scheda Store** → testi da `store/android/it-IT/` +  
   - icona 512×512  
   - feature graphic 1024×500  
   - almeno 2 screenshot telefono (app in uso: Accedi / Prenotazioni / Area personale)  
   - Paesi: almeno **Italia**
6. Completa **App access** (login required) + account demo di review se chiesto  
   (stesso demo iOS: `appstore.review@musicproeventi.it` + password solo in Console).

## Build AAB firmato (Mac)

```bash
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$JAVA_HOME/bin:$PATH"
npm run android:aab
```

AAB (build): `school-shell-android/app/build/outputs/bundle/release/app-release.aab`  
Copia stabile: `~/.config/musicpro-school/dist/musicpro-school-1.1.0-1.aab` (già generata 2026-10-24).

## Upload via API

Dopo che l’app esiste e il SA è invitato:

```bash
# verifica accesso
node scripts/play-submit.mjs

# internal testing (consigliato prima volta)
PLAY_TRACK=internal node scripts/play-submit.mjs --yes

# produzione come bozza (poi "Invia per revisione" in Console)
PLAY_TRACK=production PLAY_STATUS=draft node scripts/play-submit.mjs --yes
```

Per il primo go-live pubblico: dopo upload production/draft, in Console completa checklist e **Invia per revisione** (track Production, paesi Italia).

## Differenza da iOS

iOS School è **Unlisted** (link diretto).  
Android School è **pubblico** su richiesta prodotto (prove + associazione da store).
