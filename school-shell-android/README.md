# MusicPro School — guscio Android (Play, pubblico)

App **nativa** (Kotlin + WebView, niente Expo/EAS). Apre:

`https://school.musicproeventi.it/dashboard`

| Campo | Valore |
| --- | --- |
| applicationId | `it.musicproeventi.school` |
| versionName / versionCode | `1.1.0` / `1` |
| Service account Play | `musicpro-play-submit@rewavier-app.iam.gserviceaccount.com` |
| Upload keystore | `~/.config/musicpro-school/upload.p12` (+ `keystore.env`) — **backup** |
| Distribuzione | **Pubblica** su Play (prove + associazione) |

Listing: `store/android/it-IT/` · Playbook primo rilascio: `store/android/PLAY_FIRST_PUBLISH.md`

## Build AAB firmato

Serve Android SDK (`ANDROID_HOME`) + **JDK 17** (`openjdk@17`, non OpenJDK 27).

```bash
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$JAVA_HOME/bin:$PATH"
# keystore.properties viene generato da ~/.config/musicpro-school/keystore.env
npm run android:aab
```

AAB: `school-shell-android/app/build/outputs/bundle/release/app-release.aab`

### Nota Mac mini (DNS Java → Google)

Su questo Mac `java` non risolve `dl.google.com` (curl sì). Workaround già usato: mirror Maven in `/tmp/android-maven-local` (curl) + `settings.gradle.kts` che lo preferisce se presente. Build tools 34: zip `build-tools_r34-macosx.zip` in `$ANDROID_HOME/build-tools/34.0.0`.

## Upload Play

Dopo che l’app esiste in Play Console e il SA è invitato:

```bash
node scripts/play-submit.mjs                 # dry-run
PLAY_TRACK=internal node scripts/play-submit.mjs --yes
PLAY_TRACK=production PLAY_STATUS=draft node scripts/play-submit.mjs --yes
```

## Prima pubblicazione (manuale Console)

1. Crea app `it.musicproeventi.school` (pubblica, gratis, IT).
2. Invita il SA con permesso Release.
3. Privacy, Data safety, IARC, screenshot, feature graphic.
4. Carica AAB → Production → Invia per revisione.
