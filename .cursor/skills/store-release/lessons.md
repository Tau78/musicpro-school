# Casi veri — non ripetere

Le regole stanno in `SKILL.md` (skill **store-release**, `#release`). Qui i rifiuti che le hanno insegnate. Su *aggiungi alla skill Release* o nuovo rifiuto Apple: aggiungi una voce **nello stesso task**.

## ReWavier — 2026-08 — Guideline 2.1 Information Needed

**Cosa ha detto Apple:** Information Needed. Volevano vedere registrazione, login ed eliminazione account. La build su TestFlight c’era; **App Review Information** no.

**Causa:** VAI / build TestFlight ≠ Submit for Review. Pacchetto Notes + demo assente. (TestFlight oggi: Xcode locale via `scripts/xcode-testflight.sh`, non più solo EAS.)

**Fix:** Notes a 7 punti, Sign-In Required nei campi dedicati, account demo, Elimina account in Impostazioni, privacy allineata. In quel caso Apple chiese anche uno screen recording — **evento particolare**, non regola permanente del pacchetto `#release`.

**Regola:** non dichiarare la scheda pronta se manca anche una riga del pacchetto standard. Non richiedere un video a ogni Submit.

---

## MusicPro Eventi — 2026-08-15 — Age Rating + account Individual

**Cosa ha detto Apple:** *App Review Guideline Issue* — il rating indica **simulated gambling**, ma l’app è su account **Individual**. Blocco **prima** della review. Nessun commento sul codice.

**Causa:** nel questionario Age Rating, **Simulated Gambling** ≠ **None** («per sicurezza»). L’app ha quiz, classifiche e una sfida a **punti torneo** (zero denaro, zero IAP, zero prelievo).

**Fix (solo metadati):** Simulated Gambling = **None**. Gambling and Contests = **Infrequent/Mild Contests**. Stessa build. Niente trasferimento a organizzazione.

**Regola:**

- Account Individual **non può** pubblicare Simulated Gambling ≠ None.
- Punti classifica / quiz / premi in locale = **contest**, non gambling simulato (slot, roulette, chips comprabili).
- Non rispondere Yes «per sicurezza».
- Se il rifiuto è solo rating: **non** rifare la build.

---

## MusicPro Eventi — 2026-08-18 — Guideline 2.1, login non trovato

**Cosa ha detto Apple:** 2.1, non riescono a usare l’app. Serviva Resolution Center + nuova build.

**Causa:** hub ospite senza **Accedi** evidente. Le Notes non dicevano tab, pulsante, e che il login è **Password** (non «Link di accesso»).

**Fix:** pulsante Accedi sul primo schermo ospite (Squadra / Giochi / Profilo). Notes con percorso tap esatto. Account `apple.review@…` già in squadra.

**Regola:**

- Login visibile a freddo, senza caccia.
- Notes: etichetta reale del pulsante + quale tab (Password vs magic link).
- Il reviewer non può usare un magic link.

---

## MusicPro Eventi — 2026-08-21 — Strong Password iOS

**Cosa è successo:** in registrazione / conferma password, iOS riempie **Strong Password**. I due campi non coincidono. Review e tester falliscono.

**Fix:** sui campi nuova password e conferma:

```
textContentType="none"
passwordRules=""
autoComplete="off"
importantForAutofill="no"
```

Più «Mostra password», così il reviewer digita il demo a mano.

**Regola:** mai `newPassword` / `password` su una coppia crea+conferma se il reviewer deve digitare una password nota.

---

## MusicPro Eventi — Export compliance e Expo nativo

**Cosa è successo:** TestFlight chiede «Conformità mancante» se `ITSAppUsesNonExemptEncryption` non è **nel binary**.

**Fix:** `false` in `app.json` → `ios.infoPlist` **e** in `ios/…/Info.plist` se esiste la cartella nativa. Solo HTTPS.

**Altro Expo bare:** con `ios/` EAS ignora versione / bundle di `app.json`. Allinea `CFBundleShortVersionString` / build number nel progetto nativo, o in TestFlight compare `0.1.0` mentre la scheda dice `1.0.0`.

---

## Diario Veicoli — 2026-09-17 — Upload ok ma TestFlight resta sulla build 4

**Cosa si è visto:** su iPhone TestFlight mostrava `1.0.0 (4) · Apri`. Icona e UI vecchie. Upload altool di build 5–10 riusciti.

**Causa:** `altool --upload-app` mette la build su ASC (`processing=VALID`, `internalBuildState=READY_FOR_BETA_TESTING`) ma **non** la assegna al gruppo interno. Solo le build già linkate al gruppo `Test` passano a `IN_BETA_TESTING` e compaiono come Aggiorna.

**Fix:** dopo ogni upload, `POST /v1/betaGroups/{Test}/relationships/builds` con l’id della build nuova (ora in `scripts/xcode-testflight.sh` → `assign_build_to_test_group`). Sul telefono: pull-to-refresh TestFlight → Aggiorna.

**Regola:** upload ≠ disponibile ai tester. Sempre assegnare al gruppo Test.

## Tutte le app — 2026-08-31 — TestFlight «La build è stata rimossa»

**Cosa si è visto:** su iPhone, quasi tutte le app in «Testate in precedenza» con *La build è stata rimossa*. Eventi/Love Roulette/ReWavier mostravano ancora «Aggiorna»; il tap dava «questa build non è più disponibile» o «l’app non esiste».

**Causa:** alle **15:18 CEST** Apple ha invalidato **insieme** tutte le build vive (stesso `expirationDate` su Eventi, School, Admin, ReWavier, Gestore e le Love Roulette vecchie). Non era la scadenza a 90 giorni. Non un Expire a mano (è per singola build). Non VAI / `xcode-testflight.sh` (quelli uploadano). L’API sul test esterno: `BETA_CONTRACT_MISSING`. I gruppi Test interni c’erano già (`andreoni.mauro@gmail.com`); aggiungere il tester non riporta l’app in elenco.

**Fix:** accettare i contratti in [Agreements](https://appstoreconnect.apple.com/agreements). Poi nuova build (Eventi 21, Admin 3; Love Roulette 13 e ReWavier 54 erano già vive). Sul telefono: chiudere TestFlight, Installa il numero nuovo — **non** Aggiorna (punta alla build morta).

**Regola:**

- Stesso `expirationDate` su più app → contratto/account, non “è sparito il tester”.
- Mai `PATCH` `expired: true`. Mai expire di massa.
- Mail/banner Agreements: accettare subito. Su iPhone il giallo in Agreements può sparire. Date in tabella fino al 2027 = Free/Paid **già ok** (caso 2026-08-31: 18/21 ago 2026 – 7 lug 2027). Se Installa fallisce lo stesso, non è quella riga: tab Tasse/Banca o sync Apple, non un altro upload.
- Dopo un wipe: bump + upload; TestFlight loggato come `andreoni.mauro@gmail.com`.

---

## MusicPro School — 2026-09 — Guideline 2.1, demo login sbagliato + submission bloccata

**Cosa ha detto Apple:** versione **REJECTED** / submission `UNRESOLVED_ISSUES` (messaggio Resolution Center non esposto via API).

**Causa vera in ASC:**
1. **Sign-In Required** aveva email `andreoni.mauro@gmail.com` mentre le Notes dicevano `appstore.review@musicproeventi.it`. La password demo faceva login solo su `appstore.review@…` → reviewer fallisce l’accesso (2.1).
2. `asc-metadata.sh` scriveva il demo email sbagliato.
3. Notes promettevano uno screen recording **non allegato**.
4. Categoria ASC assente (`primaryCategory` null) → «Version is not ready».
5. Dopo il reject, la versione restava attaccata alla submission `UNRESOLVED_ISSUES` → 409 `ITEM_PART_OF_ANOTHER_SUBMISSION` su una submission nuova.

**Fix:** allineare demo a `appstore.review@musicproeventi.it` + password nei campi Sign-In Required; Notes senza video finto; Education + Lifestyle; PATCH `canceled: true` sulla submission bloccata; poi nuova reviewSubmission + build 3 (1.1.0). Stato: **WAITING_FOR_REVIEW**.

**Regola:**
- Demo email ASC = stesso utente che fa `signInWithPassword` OK (verificare prima del Submit).
- Notes e Sign-In Required devono coincidere; password mai in git.
- Non inventare allegati video.
- Prima di un nuovo Submit dopo reject: cancellare submission `UNRESOLVED_ISSUES` / stale `READY_FOR_REVIEW` con `canceled: true`, poi create/attach/submit.

---

## MusicPro School — 2026-09-28 — Guideline 3.2 Business (pubblico vs organizzazione)

**Cosa ha detto Apple:** 3.2 Business. L’app è per un’organizzazione specifica (soci / docenti / partner), ma la distribuzione scelta è **App Store pubblica**. Review su iPad Air 11″, v1.1.0 (3). Submission `ac49ed0e-…`. Chiedono: passare a Custom / Unlisted / altra distribution, oppure rispondere alle 5 domande se si insiste sul pubblico.

**Causa:** MusicPro School è il portale di **MusicPro Eventi** (associati/docenti, roster, login obbligatorio). Non è un prodotto SaaS multi-tenant apribile da chiunque senza affiliazione. Su Individual + listing “scuola MusicPro” Apple legge B2B/org.

**Fix consigliato (onesto):**
1. **Unlisted App Distribution** (link diretto, non in cerca Store) — tipico per associazioni / BYOD.
2. Oppure **Custom App** via Apple Business Manager / Apple School Manager se dispositivi gestiti dall’org.
3. **Non** reinventare la risposta «è per il pubblico generale» se l’accesso resta roster-only: ripresentano 3.2.

**Se** un giorno diventa prodotto multi-scuola (qualsiasi associazione può iscriversi e usare l’app): allora si può argomentare pubblico e rispondere alle 5 domande con evidenza di self-serve signup.

**Regola:** prima del Submit, decidere distribution (Public / Unlisted / Custom) in base al modello utenti. App di una sola scuola/associazione → Unlisted o Custom, non Public.

---

## MusicPro Eventi — Listing, Privacy, dati veri

- **Listing pubblica** = solo il ruolo utente (giocatore). Staff / host solo in Review Notes.
- Screenshot senza nomi `APPLE REVIEW`, `TEST`, `SMOKE`.
- **App Privacy** (nutrition labels) obbligatorio: senza, «Aggiungi alla verifica» resta rosso.
- Non dichiarare dati che non raccogli. Permesso microfono Expo nel binary ≠ «Audio Data» se non registri.
- Account demo su produzione, **non** un cliente reale. Se il feed è vero: «do not cancel real bookings»; nascondi i locali di laboratorio.
- Email + password only → **niente** Sign in with Apple. Dillo in Notes. SIWA serve se c’è Google / Facebook / altro social login (4.8).
