# Mobile — distribuzione TestFlight (niente Expo Go / EAS)

## Crash all’apertura (TestFlight)

1. Build `1.0.0 (202608282351)` crashava subito (“si è bloccato”) con New Architecture attiva ma **senza** i peer di Expo Router (`react-native-gesture-handler`, `react-native-reanimated`). Fix: dipendenze + import in `app/_layout.tsx` + plugin Reanimated in `babel.config.js`.
2. Build `1.0.0 (202608301239)` (VALID su ASC) aveva già i peer nativi linkati (`RNGestureHandler`, `RNReanimated`, `RNScreens`, safe-area) ma **New Architecture / Fabric restava ON** (`newArchEnabled: true`, compile flag `RCT_NEW_ARCH_ENABLED=1`). Crash immediato invariato → disabilitare New Arch (`newArchEnabled: false` in `app.json`) e **sempre** `./scripts/testflight.sh --prebuild` così `ios/Podfile.properties.json` e i Pods non restano con Fabric.

Diagnosi IPA: non mancano altri peer obbligatori di `expo-router` rispetto a `package.json`. Auth/env: `EXPO_PUBLIC_SUPABASE_*` risultano inline nel `main.jsbundle` (URL progetto presente); non è un throw di `createMobileClient` al boot.

## Path di produzione

```bash
# dalla root del repo
npm run testflight
# oppure
./scripts/testflight.sh
./scripts/testflight.sh --prebuild   # forza regenerazione ios/ con expo prebuild
```

Flusso: **expo prebuild locale** (solo toolchain) → **xcodebuild archive** → **IPA** → **App Store Connect / TestFlight**. Niente EAS Build, niente Expo cloud.

Dettagli script, env (`APPLE_*`, bundle id) e troubleshooting: header di `scripts/testflight.sh`.

## Cosa è deprecato / non usato

| Tool | Stato |
|------|--------|
| **Expo Go** | Deprecato per sviluppo e QA. Non distribuire né testare così. |
| **EAS Build / EAS Submit** | Non usati. Build e upload solo locali via Xcode tools. |
| **Expo come runtime di distribuzione** | No. Expo resta solo per generare il progetto nativo (`prebuild`) e per Metro in debug. |

## Sviluppo locale

L’app usa ancora **expo-router** (non riscritta in full native in questo passaggio).

```bash
cd musicpro/apps/mobile
npm run dev:metro    # Metro bundler; warning se il flusso suggerisce Expo Go
npm run ios          # expo run:ios → build nativo locale + Metro
npm run android      # idem Android
```

- Preferisci un **build nativo** (`ios` / `android` o TestFlight) + Metro, non Expo Go.
- `npx expo start --dev-client` è il target preferito **quando** è installato `expo-dev-client`; oggi non c’è nel package — fino ad allora usa `dev:metro` / `run:ios`.
- Script `dev` / `web` legacy: vedi warning in `musicpro/apps/mobile/package.json` (web Expo non è path di ship).

## Cosa resta dipendente da Expo

- `expo-router` (entry + navigazione)
- SDK Expo (`expo`, moduli `expo-*`)
- `expo prebuild` in `scripts/testflight.sh` per generare/aggiornare `ios/` (gitignored; non committare binari generati)

Una rewrite off expo-router è fuori scope finché non si decide esplicitamente.
