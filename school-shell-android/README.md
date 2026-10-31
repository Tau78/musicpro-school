# MusicPro School — guscio Android (Play, pubblico)

App **nativa** (Kotlin + WebView, niente Expo/EAS). Apre:

`https://school.musicproeventi.it/dashboard`

| Campo | Valore |
| --- | --- |
| applicationId | `it.musicproeventi.school` |
| versionName / versionCode | `1.1.0` / `1` |
| Service account Play | `musicpro-play-submit@rewavier-app.iam.gserviceaccount.com` |
| Upload keystore | `~/.config/musicpro-school/upload.p12` (+ `keystore.env`) — **backup** |
| AAB firmato (stabile) | `~/.config/musicpro-school/dist/musicpro-school-1.1.0-1.aab` |
| Distribuzione | **Pubblica** su Play (prove + associazione) |

Listing: `store/android/it-IT/` · Checklist primo rilascio (DONE vs MANUAL): `store/android/PLAY_FIRST_PUBLISH.md`

## Build AAB firmato

Serve Android SDK (`ANDROID_HOME`) + **JDK 17** (`openjdk@17`, non OpenJDK 27).

```bash
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$JAVA_HOME/bin:$PATH"
# keystore.properties viene generato da ~/.config/musicpro-school/keystore.env
npm run android:aab
```

Output build: `school-shell-android/app/build/outputs/bundle/release/app-release.aab`  
Copia stabile (già generata): `~/.config/musicpro-school/dist/musicpro-school-1.1.0-1.aab`

### Nota Mac mini (DNS Java → Google)

Su questo Mac `java` non risolve `dl.google.com` (curl sì). Workaround già usato: mirror Maven in `/tmp/android-maven-local` (curl) + `settings.gradle.kts` che lo preferisce se presente. Build tools 34: zip `build-tools_r34-macosx.zip` in `$ANDROID_HOME/build-tools/34.0.0`.

## Upload Play

Dopo che Mauro ha creato l’app in Play Console e invitato il SA (vedi checklist MANUAL in `PLAY_FIRST_PUBLISH.md`):

```bash
npm run play:submit                                    # dry-run
PLAY_TRACK=internal npm run play:submit:yes
PLAY_TRACK=production PLAY_STATUS=draft npm run play:submit:yes
```

Lo script preferisce l’AAB stabile sotto `~/.config/…` se esiste; override con `PLAY_AAB=…`.

## Prima pubblicazione — solo Console (Mauro)

1. Crea app `it.musicproeventi.school` (pubblica, gratis, IT).
2. Invita il SA con permesso Release.
3. Screenshot / feature graphic / icona, Data safety, IARC, privacy.
4. Poi `npm run play:submit:yes` → Production draft → **Invia per revisione**.
