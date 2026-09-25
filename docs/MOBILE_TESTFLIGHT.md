# Mobile — distribuzione TestFlight

## Path ufficiale (guscio nativo)

Da settembre 2026 lo ship iOS è un **guscio SwiftUI + WKWebView** in `school-shell/`, che apre:

`https://school.musicproeventi.it/dashboard`

```bash
npm run testflight
# oppure
bash school-shell/scripts/xcode-testflight.sh
```

Flusso: **xcodebuild archive** → IPA → App Store Connect / TestFlight → assegnazione gruppo **Test** (`andreoni.mauro@gmail.com`). Niente Expo, niente EAS.

Dettagli: `school-shell/README.md`.

| Campo | Valore |
| --- | --- |
| Bundle | `it.musicproeventi.school` |
| ASC | `6806407450` |
| Team | `YSU7PL673A` |

## Legacy Expo (`musicpro/apps/mobile`)

La app Expo Router resta in repo ma **non** è più il path di ship. Solo se serve esplicitamente:

```bash
npm run testflight:legacy-expo
# = ./scripts/testflight.sh [--prebuild]
```

Documentazione storica crash Hermes / New Arch sotto.

---

## Crash all’apertura (TestFlight) — storico Expo

1. Build `1.0.0 (202608282351)` crashava subito (“si è bloccato”) con New Architecture attiva ma **senza** i peer di Expo Router (`react-native-gesture-handler`, `react-native-reanimated`). Fix: dipendenze + import in `app/_layout.tsx` + plugin Reanimated in `babel.config.js`.
2. Build `1.0.0 (202608301239)` (VALID su ASC) aveva già i peer nativi linkati ma **New Architecture / Fabric restava ON**. Crash → `newArchEnabled: false` + `./scripts/testflight.sh --prebuild`.
3. Build successiva: `structuredClone` a livello di modulo in `@musicpro/database` → Hermes crash. Fix: `cloneJson()` in `packages/database/src/clone.ts`.

**Anti-regressione** (solo se usi ancora il path Expo): `npm run check:hermes-clone`.

## Cosa è deprecato / non usato

| Tool | Stato |
|------|--------|
| **Expo Go** | Deprecato. |
| **EAS Build / EAS Submit** | Non usati. |
| **Expo come path di ship** | Sostituito dal guscio `school-shell/`. |
