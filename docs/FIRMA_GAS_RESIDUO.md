# Firma documento — residuo GAS

**Decisione (onda residui):** non migrare ora. Non è un ponte minimo su `/api/iscrizione`.

## Cosa resta su GAS

| Pezzo | Ruolo |
|-------|--------|
| `firma.html` (FTP) | UI PDF + 3 zone firma (pdf.js / pdf-lib / SignaturePad) → `/api.php` |
| `FirmaDocumento.js` | `getFirmaPdfForView`, `getFirmaSignaturePositions`, `salvaFirmaDocumento`, `inviaFirmaDocumentoAdmin` |
| `FirmaPdfOriginale.js` | PDF template “Estensione Associazione MP” embedded (base64) |
| `iscrizioni.js` doGet/doPost | Espone le 4 action sopra sullo stesso Web App dell’iscrizione |
| Google Drive | Cartella “Estensione Associazione”, upsert firmato, mirror in root iscrizioni |
| Script Properties | Contatore slot firme (`FIRMA_DOC_SIGNATURE_COUNT`) |
| MailApp | Email admin con allegato + link Drive |

Prodotto distinto dall’iscrizione soci: documento consiglio (Presidente / VP / Consigliere), multi-signer, non token enrollment.

## Perché non il ponte

Il proxy dual/supabase di `deploy-iscrizione.js` serve **iscrizione** (token, salva, Stripe). Su Next **non esistono** le action firma. Portarle richiederebbe Storage (originale + firmato), stato slot multi-firmatario, email admin, lock concorrente, e spostare `FirmaPdfOriginale` — rewrite, non proxy.

## Come spegnerlo dopo

1. Portare template + PDF firmato su Supabase Storage; API Next dedicate (non riuso enrollment).
2. Email admin via stesso provider già usato per iscrizione.
3. Aggiornare `firma.html` (o pagina Next) e, se serve, `deploy-iscrizione` per URL API firma.
4. Rimuovere da `iscrizioni.js` le branch `getFirmaPdf*` / `salvaFirmaDocumento` / `inviaFirmaDocumentoAdmin`; deprecare `FirmaDocumento.js` + `FirmaPdfOriginale.js`.
5. Finché GAS vive: lasciare `ISCRIZIONE_BACKEND=gas|dual` — le call firma cadono su GAS via `api.php`.

**Fuori scope:** riscrivere il prodotto firma da zero in questa onda.
