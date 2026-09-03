# Screenshot — App Store (MusicPro School)

Guideline **2.3.3**: app **in uso**, non splash / schermata vuota / solo logo. Niente testo TEST, REVIEW, SMOKE, Lorem, password in chiaro, errori di rete.

**Non inventare screenshot.** Servono scatti reali da device o TestFlight (o Simulator solo se l’app gira davvero).

Tema: UI reale post-login. Dati demo ok se sembrano credibili.

Formato: PNG o JPEG, **senza alpha**. Verticale.

## Size class obbligatorie (2026)

| Slot ASC | Pixel (verticale) | Come ottenerli |
| --- | --- | --- |
| iPhone **6.9″** (obbligatorio) | **1320 × 2868** (accetta anche 1290 × 2796 o 1260 × 2736) | iPhone 16/17 Pro Max, o Simulator → Cmd+S |
| iPhone **6.5″** (se richiesto / legacy) | tipicamente 1242 × 2688 | device / Simulator |
| iPad **13″** (se tablet supportato) | **2064 × 2752** (accetta anche 2048 × 2732) | iPad Pro 13″ |

## Shot list (da fare a mano)

| # | Schermata | Percorso | Cosa deve vedersi |
| --- | --- | --- | --- |
| 1 | Accedi | cold start | Schermo Accedi, email + password (senza password riempita in vetrina) |
| 2 | Area personale | tab Area personale | Profilo / stato associato dopo login demo |
| 3 | Prenotazioni | tab Prenotazioni | Elenco o form sale prova |
| 4 | Lezioni docente | tab Lezioni → Oggi o Calendario | Vista docente con lezioni |
| 5 | Nuova prova / presenze | Lezioni → Nuova prova o presenze | Flusso docente in uso |

Non mettere Impostazioni tecniche o errori API in vetrina.

## Come scattare

```text
Installa build TestFlight (o Simulator con l’app vera).
Login con account demo.
Device / Simulator → Screenshot (Cmd+S su Mac Simulator).
```

Cartella ready (PNG senza alpha): `store/ios/screenshots/iphone-69/`
- `01-accedi-1320x2868.png` (+ nativo `01-accedi-1290x2796.png`)
- `03-prenotazioni-1320x2868.png` (+ nativo)

Prossimi scatti: `02-area-personale`, poi ripeti Prenotazioni **dopo** una prenotazione reale (quota demo già in regola).

## App Preview (opzionale)

Solo dopo screenshot reali. Non è lo stesso di un eventuale allegato review: uno screen recording serve **solo** se Apple lo chiede in Resolution Center, non di default.
