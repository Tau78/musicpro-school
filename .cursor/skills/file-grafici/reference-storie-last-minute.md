# Storie last minute sale — Instagram/Facebook 9:16

Playbook **STANZE last-minute** per MusicPro School. Storie **9:16** Instagram/Facebook.

Repo: `/Users/mauroandreoni/Cursor/MusicPro School`.  
Look: **dark/foto + Montserrat/Bebas**. **NON** glass app. **NON** iscrizione rossa.  
Palette brand e sale: [reference-school.md](reference-school.md).  
ONDA **sempre** in School.

## Due fasi

| Fase | File / flag | Contenuto |
|---|---|---|
| **URGENZA** | `LM-URGENZA`, `--phase urgenza` | Niente prezzo promo |
| **PREZZO** | `LM-PREZZO`, `--phase prezzo` | Prezzo **TOTALE slot**, mai −30% gigante |
| **CHIUSO** (opzionale) | `--phase chiuso` | «Slot occupato — a presto» |

Stesso layout urgenza→prezzo, cambia solo blocco prezzo.

## Brief obbligatorio

Non inventare prezzi, orari, nomi sala.

| Campo | Valori | Obbligatorio |
|---|---|---|
| Sala | Rossa / Verde / Arancio | sì |
| Data + fascia | Europe/Rome | sì |
| Fase | urgenza / prezzo / chiuso | sì |
| Prezzo | importo + durata | solo se fase **prezzo** |
| Foto | path locale o CDN | no |
| Draft vs publish | default **draft** | sì (se assente = draft) |

Se manca un campo del brief: **NON generare la campagna**; chiedi (AskQuestion) o attendi.  
Eccezione: `--smoke` layout senza slot reale.

## Tono

Tono serata live, locale, musicale.

### Vietato

- Linguaggio app (blacklist sotto)
- «offerta lampo» cheap
- gratis
- % sconto giganti
- >5 righe
- Testo da AI immagine

### Blacklist linguaggio app

Non usare: dashboard, area personale, shop, crediti, wallet, checkout, login, password, account, iscrizione, quota, lezione, docente, allievo, registro, «dall’app», «apri l’app», «nella dashboard», «acquista», associato (voce UI).

Usare: sala, stasera, adesso, prova, prenota, scrivici — parole da locale, non da schermata.

## Palette

| Token | Hex | Uso |
|---|---|---|
| Accento Rossa | `#B23B3E` | Sala Rossa |
| Accento Verde | `#38764B` | Sala Verde |
| Accento Arancio | `#D2762A` | Sala Arancio |
| Brand navy | `#1e3a5f` | CTA pieni, scena senza foto |
| Brand gold | `#c9a227` | Eyebrow / traccia, non CTA |
| CTA | navy `#1e3a5f` + **testo bianco** | Sempre `text-white` sul pieno |

Mai navy su navy. Mai CTA rosso iscrizione `#e10600`. Mai glass-card.

## Canvas e safe area IG

Formato **1080×1920**.

- Testo in `x=65 y=269 w=950 h=979` (box fino a y=1248)
- Niente copy critico `y>1248`
- CTA dentro il box, non nella chrome IG in basso

## Foto

- Cover 9:16, non stretch, overlay scuro
- Se manca foto: scena scura navy, non bande nere
- CDN `img/sale.jpg` è un **mosaico 720×720** (4 riquadri), non una lastra 9:16: non usarlo come `--bg` cover. Serve uno scatto singolo della sala, almeno ~1080 px sul lato corto.

Soggetto intero, dai bordi estremi in dentro. Sorgente pulita (foto sala), non il PNG di output.

## Copy — obiettivo 3 secondi

Quale sala, quando, CTA **oppure** quanto costa. Max **5 righe**. Placeholder solo dal brief.

**URGENZA** (niente prezzo promo) — struttura, non testo fisso; riempire dal brief:

```
LAST MINUTE
Sala [NOME]
[giorno] · [ora inizio–fine]
Prenota su MusicPro
```

**PREZZO** (prezzo TOTALE slot, mai −30% gigante): stesso layout + numero grande `da XX €` dal brief:

```
LAST MINUTE
Sala [NOME]
[giorno] · [ora inizio–fine]
da XX €
Prenota su MusicPro
```

Sottotitolo durata solo se nel brief. Mai inventato.

**CHIUSO**:

```
Slot occupato
a presto
```

Data/fascia: Europe/Rome dal brief. Orari come nel brief. CTA default **Prenota su MusicPro** (navy testo bianco). URL `school.musicproeventi.it` solo se il brief lo chiede in grafica (di solito è link sticker, non testo).

Font overlay (veri, non dal modello): **Bebas** titolo sala, **Montserrat** orario / prezzo / CTA. Non Cinzel, non Georgia/ui-serif, non Bricolage/Manrope.

## Output

- **1–3 varianti** per brief
- Naming: `LM-YYYY-MM-DD-Sala-HH-HH-phase.png`  
  Esempio: `LM-2026-10-25-Rossa-21-23-urgenza.png`  
  Più varianti: suffisso `-v2` `-v3` prima di `.png`
- Cartella: `docs/assets/school/storie-last-minute/`
- Prima release = solo bozza (`--draft`). Default draft vs publish = **draft**. Publish solo se il brief lo dice esplicito **e** la pipeline non è più prima release.

## Script

`scripts/compose-last-minute-story.py` — scritte vere (PIL/font), scena senza parole.

Flag minimi = campi brief: `--sala` `--date` `--start` `--end` `--phase` (alias `--from`/`--to`). Se prezzo: `--price` (alias `--importo`) e `--duration` (alias `--durata`). Foto: `--bg` (alias `--foto`). Default bozza; `--publish` solo se il brief lo dice. Layout senza slot: `--smoke`.

Non chiamare il generatore di immagini per le lettere. Non produrre PNG campagna se manca un campo (salvo `--smoke`).

## Ponte verso publisher Eventi

School **non** ha Meta Graph. APP Eventi **sì**: Edge `admin-social-story-publish-cron` + tabelle `social_story_plans` / `social_story_slots`.

Ponte (solo coda, non publish da School):

1. PNG compose → `docs/assets/school/storie-last-minute/`
2. Upload bucket pubblico Eventi `social-story-media` (`images/musicproeventi/…`)
3. Insert piano + slot con `instagram_account_id` di **@musicproeventi** (slug `musicproeventi`)
4. Il cron Eventi pubblica a `scheduled_at`

Script: `scripts/queue-lm-story-to-eventi.mjs` (default `--dry-run`).

```bash
node scripts/queue-lm-story-to-eventi.mjs \
  --file docs/assets/school/storie-last-minute/LM-YYYY-MM-DD-Sala-HH-HH-phase.png \
  --account musicproeventi \
  --scheduled-at 2026-10-26T19:30:00 \
  --link https://school.musicproeventi.it/prenotazioni
```

`--scheduled-at` senza timezone = Europe/Rome. `--apply` solo se esplicito (OK Mauro + secret Eventi). Prima release / compose `--draft`: **NON** chiamare il ponte `--apply`.

### Vietato sul ponte

- Pubblicare su **@ilcervellonegenova** (account DEFAULT Eventi)
- Chiamare Edge `admin-social-story-manual-package` (non inoltra `accountId`, cade sul DEFAULT)
- Duplicare Meta Graph in School / chiamare Meta da School
- Link sticker verso Eventi app / `musicproeventiapp.html` — usare landing **prenotazioni School**: `https://school.musicproeventi.it/prenotazioni`

## Flusso

1. Brief completo. Campo mancante → AskQuestion (o attendi). Stop. Niente campagna.
2. ONDA (sempre in School).
3. Compose `--draft` (prima release). 1–3 varianti. **Non** accodare al publisher Eventi.
4. Apri i PNG: safe area, overlay, CTA navy testo bianco, sala/orario/prezzo = brief, max 5 righe, niente % sconto, niente testo da modello.
5. `--smoke` = solo layout, senza slot reale, senza prezzi finti da campagna.
6. Ponte `--apply` solo dopo OK Mauro, PNG definitivo, account **@musicproeventi**. Prima: dry-run.

## Vietato (riepilogo, non parafrasare)

- Inventare prezzi, orari, nomi sala
- URGENZA con prezzo promo
- PREZZO con −30% gigante / % sconto giganti / gratis / «offerta lampo» cheap
- Linguaggio app (blacklist)
- >5 righe
- Testo da AI immagine
- Glass app, iscrizione rossa, bande nere al posto della scena
- Stretch della foto
- Copy critico y>1248
- Generare la campagna se manca un campo del brief (eccezione `--smoke`)
- Ponte `--apply` in prima release / `--draft`
- Coda su @ilcervellonegenova o Edge `admin-social-story-manual-package`
