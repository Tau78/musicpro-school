# MusicPro School — guscio Android (Play)

App **nativa** (Kotlin + WebView, niente Expo/EAS). Apre la dashboard web:

`https://school.musicproeventi.it/dashboard`

| Campo | Valore |
| --- | --- |
| applicationId | `it.musicproeventi.school` |
| versionName | `1.1.0` |
| Service account Play | `musicpro-play-submit@rewavier-app.iam.gserviceaccount.com` |

## Build AAB

Serve Android SDK (`ANDROID_HOME`) + JDK 17+.

```bash
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
# una tantum (serve rete a dl.google.com):
# sdkmanager --sdk_root="$ANDROID_HOME" "platforms;android-35" "build-tools;35.0.0" "platform-tools"
bash scripts/build-aab.sh
# oppure: npm run android:aab
```

Su questo Mac mini (2026-10-01) `sdkmanager` non raggiunge `dl.google.com` → pacchetti SDK non scaricabili finché non c’è egress. Il codice del guscio è pronto; l’AAB si genera quando la rete Google è ok.

Listing: `store/android/it-IT/`.

Prima pubblicazione: crea l’app in Play Console (`it.musicproeventi.school`), invita `musicpro-play-submit@rewavier-app.iam.gserviceaccount.com` con permesso Release, genera upload keystore, upload AAB (internal → production).
