---
name: file-grafici
description: >-
  Compone banner, card, icone, foto sale, screenshot store e sfondi senza
  ritagliare l'originale e senza testo inventato dal modello. Use when the user
  asks for a graphic file, banner, locandina, card, sfondo, logo, og-image,
  app icon, foto sala, screenshot App Store, or says rifai, rigenera, più
  cartoonesca, tutto lo sfondo, solo queste scritte, #grafico, or opens a
  jpg/png to fix. In MusicPro School this agent is the repo graphic designer
  and always runs ONDA with this skill.
---

# File grafici

Quando Mauro chiede un file grafico, il deliverable è il file che ha aperto. Si aggiorna quello. Non si dichiara fatto finché l'immagine letta mostra il soggetto intero e solo le scritte chieste.

**Casa:** `~/.cursor/skills/file-grafici/`. Copia repo School: `MusicPro School/.cursor/skills/file-grafici/`.  
*Aggiungi alla skill file-grafici* → aggiorna **globale + copia repo** nello stesso task.

## Ruolo — MusicPro School

In **MusicPro School** questo agente è il grafico del repo. Ogni task grafico usa **questa skill** e **sempre ONDA** (`~/.cursor/skills/onda/`): backlog → wave → supervisione → smoke → VAI se smoke verde. Non chiedere «vuoi che faccia VAI?».

Dettagli School: [reference-school.md](reference-school.md).  
Dettagli Eventi / Giochi: [reference-eventi.md](reference-eventi.md).

## Quale prodotto

| Repo / segnale | Reference | Palette |
|---|---|---|
| MusicPro School, `school.musicproeventi.it`, `school-shell`, iscrizione School | [reference-school.md](reference-school.md) | Navy `#1e3a5f` + gold `#c9a227` |
| APP Eventi, Giochi, Enigma, Shop gettoni, 1200×520 | [reference-eventi.md](reference-eventi.md) | Non mischiare con School |

Non copiare Enigma (cubo viola, verde smeraldo, Cinzel) su materiale School. Non copiare navy/gold School su card Giochi.

## Metodo

1. Parti dalla grafica ufficiale o dalla foto che ha dato. Non stirarla e non ritagliarla per farla entrare.
2. Se il formato di destinazione è diverso, componi una scena nuova **ispirata** all'originale. Il soggetto (personaggio, oggetto, pile) resta intero, dai bordi estremi in dentro.
3. Le scritte ufficiali non le ridisegna il generatore di immagini: sbaglia l'italiano. Due strade:
   - stacca le lettere dal file originale (maschera colore, riquadro stretto, senza il sole o lo sfondo intorno);
   - oppure scrivile con un font vero (Cinzel, Montserrat, Bebas in Eventi; in School titoli UI = Georgia/ui-serif, wordmark = system-ui).
4. Il generatore di immagini serve solo per la scena, senza parole. Poi si sovrappongono le scritte vere.
5. «Tutto lo sfondo» = l'immagine copre il rettangolo fino ai bordi. Niente fascia nera, niente foto incollata a sinistra, niente lati sfocati del poster.
6. «Solo queste scritte» = via tutto il resto (montepremi, legale, sottotitolo). Non aggiungere righe non chieste.
7. Lo script di compose legge una **sorgente pulita** (`docs/assets/…` o, in School, `docs/assets/school/` al primo asset), non il jpg di output. Un secondo giro non raddoppia il testo.

## Card già in un'app

- Se la card disegna titolo e frase sopra l'immagine, la zona di quel testo nel jpg resta libera.
- Se le parole sono nel jpg, togli lo stesso testo dal componente. Altrimenti si legge due volte.
- Sulle card con pulsante in basso a destra, la riga importante non finisce in quell'angolo.
- Il conteggio che cambia (frammenti aperti, saldo, crediti, €/h) resta nel componente, non nel jpg.

## ONDA

- **MusicPro School:** sempre ONDA, anche per un solo file. Subagenti: max 4; due agenti non scrivono lo stesso file. Parent supervisiona a vista (apri il jpg, non fidarti della descrizione del modello).
- **Eventi / altri repo:** un file → solo questa skill, niente commit/FTP/OTA se Mauro non lo chiede. Batch o la parola **ONDA** → pipeline ONDA.

## Controllo prima di dire che è pronto

Apri il jpg/png e controlla a vista. Un modello che descrive l'immagine inventa tagli e riquadri neri: se il dubbio resta, campiona i pixel (angoli, bordo del soggetto, lettere).

Poi una frase su cosa c'è nel file.

Installazione copia repo: [INSTALL.md](INSTALL.md).
