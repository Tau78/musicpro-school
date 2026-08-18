# Piano Lezioni — area docente e didattica

**Data:** 2026-08-18  
**Stato:** specifica V1 chiusa (§20–33). **Fette 1–9b UI fatte.** Audit 4 punti di vista in §32. Wallet/rette/`037` applicata. Dual iscrizione e webhook pack vanno in produzione con VAI.  
**Riferimento UX:** planning settimanale tipo ScuolaSemplice / screenshot docente (card gialle, ore totali, Oggi, DnD, vista mensile)  
**Stack:** monorepo `musicpro/` + Supabase (stesso di [`PIANO_PRENOTAZIONI.md`](PIANO_PRENOTAZIONI.md))

Oggi il ruolo `docente` esiste (`member_roles`) e copre rimborsi propri + prenotazione sale senza quota. **Non esiste** un dominio corsi/lezioni: `enrollments` è solo iscrizione associativa.

---

## 1. Obiettivo

Portare in MusicPro la didattica oggi gestita in **ScuolaSemplice**: calendario docente, corsi (individuali e gruppo), presenze, prove, pacchetti da 4 lezioni, occupazione sale (blocco prenotazioni associati), notule generate dalle lezioni presenti, permessi a due livelli.

Implementare **a fette** seguendo §16. Non partire da un import CSV ScuolaSemplice (non urgente).

---

## 2. V1 vs dopo

### V1 — in scope

- Tab **Lezioni** (docente, coordinatore in sola lettura, staff)
- Sub-tab: **Oggi**, **Calendario** (settimana + mensile), **Corsi**, **Impostazioni** (Anagrafica, Disponibilità, Permessi)
- Staff: stessa area + code + anagrafica didattica in rubrica
- Corsi individuali e di gruppo (regolari); flessibili in V2
- Creazione corso docente → approvazione segreteria (hold sala 48h)
- Staff crea corso → già attivo
- Lezioni occupano `rooms` (overlap con prenotazioni associati)
- Lezione **online** senza `room_id` (non occupa sale fisiche; niente URL videocall)
- Presenze, accodamento se giustificata, ferie docente, festività scuola
- Prova gratuita (bozza rubrica + magic link iscrizione)
- Pacchetti da 4, checkout quota+pacchetto, contanti, listino
- **Rette da incassare** (staff): scadute in ordine cronologico, filtri, ricerca, Registra incasso
- **Anticipo famiglia:** un incasso può coprire più lezioni future (wallet crediti)
- **Saldo iniziale** lezioni già pagate (transizione SS / anno precedente)
- **Ricevute fiscali:** matrice in sede (storico + export) + copia a allievo/tutore; emissione automatica all’incasso (es. corso + primo pacchetto)
- Notule mensili da lezioni **presente** (firma in app, fattura opzionale)
- Coordinatore: visivo, nascosto al titolare, no overlap, no edit
- Flag globali + override corso; stesse azioni in admin
- Expo: parità Oggi / calendario / presenze (niente push)
- GCal docente + GCal sala con nome allievo
- Reminder email famiglia (anche prova)
- Pausa corso, chiudi / rimuovi iscritto, undo 24h
- Stampa PDF settimana docente, registro presenze PDF, linea «adesso»
- Drag & drop, dropdown docente, ore totali
- Web + Expo

### V2 (bloccato, non implementare ora)

- Corsi flessibili; self-book carnet; portale tutore; push Expo
- Note lezione; attestati fine corso + certificato crediti (due template, motore documenti esistente)
- Saggi come corso speciale; rinnovo anno; lista d’attesa; KPI
- Multidocenza in sala (due insegnanti); UI «Coordinatore» verso il titolare resta nascosta
- iCal; QR se poco sforzo; lettera incarico / contratto corso
- Import CSV ScuolaSemplice quando ci sarà un export di esempio

### Più avanti / no

- Voti; file didattici; ritardi/uscite anticipate; default permessi «scuola»
- Vincolo materia↔sala; multi-sede; esami; prestito strumenti
- Disdetta famiglia da portale; BCC segreteria sui reminder
- Nexi/SDD, PayPal checkout, QR pay: **non operativi** oggi; V1 incasso = Stripe + contanti + segno bonifico

---

## 3. Informazione architecture

### Docente / coordinatore

Docente: path **`/lezioni`**, landing **Oggi**. Staff: **`/admin/lezioni`**. Rimborsi spese restano in `/admin/rimborsi`.

| Sub-tab | Contenuto |
|---------|-----------|
| **Oggi** | Roster giornata, presenze in un tap, badge «da inserire». Home Expo. |
| **Calendario** | Settimana (default) + switch mensile. Frecce, Oggi, date picker, dropdown docente (staff: tutti; docente: sé), ore totali. DnD. Linea ora corrente. |
| **Corsi** | Card corsi attivi / in attesa / chiusi. Sezione **«Che coordino»** solo se è coordinatore. |
| **Impostazioni** | Anagrafica (materie in lettura, **niente importi**) · Disponibilità · Permessi (sola lettura) |

Domenica **nascosta** (flag scuola per accenderla). Griglia default lun–sab, 10:00–23:00, **configurabile**. Inizio lezione a **15 minuti** (`:00/:15/:30/:45`).

### Staff (admin / segreteria)

Stessa tab **Lezioni** con:

- Calendario **per sala** + dropdown docente
- Coda: corsi da approvare, chiusure, hold in scadenza, «da piazzare»
- **Rette da incassare** (scadute, filtri, Registra incasso)
- Impostazioni scuola: anno corsi, festività, listino, materie, soglie reminder, finestra presenze

In rubrica (`/admin/associati/[id]`): sezione **Ruoli** (Amministratore, Segreteria, Docente). Se è docente, sotto compare **Didattica** (materie, tariffe, permessi — solo staff). Lista `/admin/associati`: pulsante filtro **Docenti**.

---

## 4. Permessi

Tre flag, due livelli. **Override corso, altrimenti globale.** Staff ignora i flag.

| Flag | Globale | Sul corso | Effetto se sì |
|------|---------|-----------|----------------|
| Crea corsi (e prove) | Sì | No | Nuovo corso → coda; prova senza approvazione (slot singolo) |
| Annulla / sposta lezioni | Sì | Override | Altrimenti richiesta + hold sul nuovo slot |
| Chiudi corso | Sì | Override | Altrimenti «Richiedi chiusura» |

Default docente nuovo: tutti **no**.

Senza flag: tap → richiesta alla segreteria **con hold** sul nuovo slot.

Visibilità pagamenti allievo (anagrafica docente, uno dei tre):

- solo stato (pagato / in attesa / in ritardo)
- stato + importi
- niente

Staff e admin: tutte le azioni sempre.

---

## 5. Coordinatore

- Assegnato **solo dallo staff**, su un corso. Qualsiasi docente; **non** può essere titolare dello stesso corso.
- Il titolare **non deve sapere** che esiste un coordinatore (niente badge, nome, mail).
- Il coordinatore **si vede** come Coordinatore (sezione «Che coordino»).
- Vista = stesso dettaglio del titolare, **tutti i pulsanti disabilitati**.
- **Nessun conflitto orario** con le sue lezioni da insegnante (può coordinare e insegnare insieme).
- Non edita nulla. Il lavoro di coordinamento è fuori app (programma del corso).
- In notula: matura su ogni lezione del corso con **≥1 presente**. Il titolare non vede quella riga. Se il mese non è chiuso in tempo, le sue ore slittano al mese dopo.
- Multidocenza (due insegnanti in sala) = V2. In V1 il docente che crea mette **solo sé** come titolare.

---

## 6. Calendario

Riferimento visivo: card gialle, `#` = **progressivo per corso** (la prima lezione del corso è #1), allievo, orario, sala; colori V1 per tipo (prova / individuale / gruppo / online / in attesa).

- DnD con controllo conflitti; spostamento chiede **solo questa / questa e le future**.
- Stesso dialogo per cambio durata o sala.
- Overlap **insegnamento** stesso docente due slot: **avviso, si può forzare**. Coordinamento non conta.
- Overlap allievo due lezioni: avviso, si può forzare.
- Stesso allievo + stessa materia + due docenti: avviso.
- Nessun buffer: 17:00–18:00 e 18:00–19:00 ok.
- Vista mensile in V1.

Ogni lezione confermata = riga `bookings` (o occupazione equivalente) sulla sala: `confirmed`, `payment_status = not_required`, tipo `lesson`, così `create_booking_safe()` e il calendario associati le vedono occupate.

---

## 7. Corsi

### Modello

- **Regolare** in V1: **un solo slot settimanale**. Due giorni = due corsi. Flessibile = V2.
- Nome **automatico**: `Materia — Allievo` oppure `Gruppo {materia}` + elenco.
- Individuale (1 allievo) o gruppo (N allievi, capienza **max sul corso**).
- Senza date anno corsi in Impostazioni: **non si crea/approva**.
- Senza riga listino per tipo/durata: **non si approva** (si può sempre scrivere il prezzo sul corso, anche 0).
- Email allievo o tutore **obbligatoria** in creazione corso/prova.
- Durata fissa per corso: 30 / 45 / 60 / 90.
- Sala proposta dal docente, staff può cambiare in approvazione. Tutte le sale fisiche usabili. Online = niente sala.
- Anno corsi: date **dal/al in Impostazioni** (quote restano anno **solare**). Niente default in codice: le mette lo staff prima del go-live.
- Materie seed: Chitarra, Basso, Batteria, Pianoforte, Canto/voce, Propedeutica Musicale, Musicoterapia, Musica di Insieme (poi si edita).
- Listino famiglia: prezzo pacchetto da 4 × tipo/durata.
- Paga docente: voci di retribuzione in anagrafica/catalogo, **selezionate sul corso**. Collettivo: **per lezione per testa** (30 o 60 min stesso importo).
- Collettivo: capienza default **8** se non indicata.
- Listino pacchetto da 4: tabella Impostazioni (tipo × durata). Nessun importo hard-coded. Sul corso si può mettere un prezzo anche **0 €**.
- Listino cambiato: i **prossimi** pacchetti usano il nuovo; i già pagati no.
- 1 corso = 1 materia = 1 titolare (V1).

### Stati

`in_attesa` · `attivo` · `rifiutato` · `in_pausa` · `chiuso`

### Creazione e approvazione

1. Docente (se flag) o staff: allievo/i associato/i in regola (modulo + quota per il **corso vero**), materia, slot, sala, durata.
2. Docente → `in_attesa`, **hold 48h dalla creazione**. Scadenza → `rifiutato`, sala libera, email al docente. Lo **staff può prolungare** l’hold.
3. Due richieste sullo stesso slot: avviso staff; **vince chi è approvato prima**, l’altro va «da piazzare».
4. In creazione/approvazione è obbligatoria la **data inizio corso** (anche **retroattiva**). Si genera da quella data a fine anno. Sala **obbligatoria** se in presenza.
5. Staff che crea → `attivo` subito, genera lezioni.
6. In generazione, se uno slot è occupato: **si salta**, resta **«da piazzare»**. A piazzarla: **staff**, o il docente se ha il flag sposta/crea.
7. Festività: in generazione si **saltano e si accodano** subito (stessa fascia, primo buco).

### Gruppo

- Pacchetto da 4 **per allievo** (sollecito per allievo).
- Aggiunta a corso partito: dalle **prossime** lezioni, pacchetto da 4 pieno.
- Uscita: **Rimuovi iscritto** (stesso riepilogo contabile della chiusura). «Chiudi corso» solo individuali.
- Assente giustificato: si accoda un recupero **solo per lui**.
- Paga collettivo **per testa per lezione** (stesso importo a 30 o 60 min). Voce e importo: **default del titolare** (vedi §13), staff può cambiare. Snapshot iscritti quel giorno.

### Pausa e chiusura

- **Pausa:** cancella/libera le future; in ripresa si rigenera dove libero.
- **Chiudi corso:** data di chiusura **obbligatoria** (`closed_on`, anche retroattiva); cancella lezioni dopo quella data, libera sale, storico resta, segnale a segreteria con situazione contabile (anche se saldo aperto).
- Undo chiusura / rimozione: **24h**, se le sale sono ancora libere.
- **Togliere il ruolo Docente** (disattivare): solo se non ha più corsi aperti (titolare), tutte le presenze sono inserite e tutte le notule sono firmate. Finché i corsi non esistono (pre-fetta 5) la revoca è libera. Non si toglie il flag e si lasciano corsi aperti.
- Allievo non in regola a metà corso: avviso, si insegna.

---

## 8. Lezioni e presenze

### Stati presenza

`presente` · `assente` · `assente_giustificato` · `cancellata_scuola` · (no ritardo/uscita)

Default registro: **tutti presenti**; si toglie chi manca.  
Presenza docente **implicita** se si segnano gli allievi.

### Regole

- **Giustificato** o **cancellata scuola:** la lezione va in **da recuperare** (parcheggio, stessa coda «da piazzare»). **Non** si accoda in silenzio al primo buco. Non scala il pacchetto. Lo slot originale **si libera subito**.
- **Assente** (non giustificato): consuma il pacchetto (fetta 9), non si accoda.
- Collettivo, un solo allievo giustificato: la lezione di gruppo **resta**; si crea uno slot **1:1 extra** (`kind=recupero`) in da recuperare, solo per lui. Non si infila in un altro gruppo.
- Si può segnare un’assenza **in anticipo**.
- Docente: edit passato entro **14 giorni** e solo se il **mese notula non è chiuso**.
- Mese chiuso: solo staff, edit **in riga** sull’elenco. Tentativo → popup «Sblocca mese?» → salva → **notula rigenerata**. (Fetta 11; in 7 il mese è sempre aperto.)
- Ferie/assenze docente: non si restringe la disponibilità sotto lezioni già messe. Azione unica **«Docente assente»** (oggi o range) → lezioni → da recuperare + libera sala. Conflitto disponibilità ↔ lezioni = blocco con elenco.
- Disponibilità default: **tutto libero** (zero fasce). Prima fascia = libero **solo** in quelle ore. Fasce che si toccano si **uniscono**. Ferie: giorni interi (default) o fascia oraria. Domenica nascosta se il flag scuola è off. Modificano docente e staff (scheda + `/admin/lezioni`).
- Lezione **già presenziata**: niente DnD / spostamento. Prima si sblocca la presenza (docente se mese aperto e ≤14 giorni; staff sempre).
- Recupero: **non** si piazza nel passato.
- **Cambio titolare** a metà anno: staff «Passa a X» sullo stesso corso (chiude riga `course_teachers`, nuova titolarità, `courses.titular_member_id`). Storico presenze/notule resta. Le future pagano il nuovo.

### Supplenza

Docente propone un collega; staff conferma. Il supplente è pagato con **la sua** tariffa insegnamento. Prova = non retribuita.

---

## 9. Prova

- Stesso flag «crea corsi». **Gratuita** per la famiglia, **0 €** in notula docente.
- Individuale, **presenza o online**. Popup: nome, cognome, email, data, ora, sala se in presenza; durata 30/45/60 (default 30). Minore: **dati allievo + tutore** (stessa soglia di `iscrizione.html`).
- Bozza in rubrica **senza numero associato**. Email già presente → **riaggancia**. Bozza scade **30 giorni**.
- Assegnazione prova → email benvenuto + **magic link 30 giorni** a `iscrizioni.musicproeventi.it`, campi bozza precompilati **e modificabili**.
- La prova si fa anche **senza modulo finito**. Il corso vero richiede modulo + quota.
- Sala **occupata subito** (`confirmed`).
- **1 prova a stagione**; se no-show, il docente sceglie se liberare o riprogrammare (**1 sola** riprogrammazione).
- Conversione: se c’è già uno slot, si **propone in automatico**; checkout **una sessione, due voci** (quota + pacchetto). Quota già pagata → riga a **0 € «già versata»**.

---

## 10. Pacchetti da 4 e pagamenti famiglia

Flusso:

1. Si programma **fino a fine anno corsi** e si blocca la sala.
2. Ogni iscrizione ha un **wallet di crediti lezione** (1 credito = 1 lezione di quel corso).
3. Acquisto standard = **pacchetto da 4**. Si può versare **di più** (anticipo famiglia): l’eccesso resta nel wallet e si **spalma** sulle lezioni successive, senza generare una nuova retta finché ci sono crediti.
4. Ogni 4 lezioni **consumate** senza crediti residui si apre la retta del pacchetto successivo.
5. **Saldo iniziale:** in creazione/modifica corso lo staff può mettere N lezioni già pagate (SS / anno prima). Stesso wallet; **niente ricevuta** su quel saldo (già incassato fuori).
6. Più ore = altro corso o flessibile (V2), non un extra sullo stesso.

**Consuma** uno slot: `presente` o `assente` non giustificato.  
Avviso se in ritardo, **si insegna comunque**.

Due «anticipi», nomi distinti in UI:

| Nome | Chi | Cosa |
|------|-----|------|
| **Anticipo famiglia** | Incasso allievo > retta aperta | Crediti lezione futuri |
| **Anticipo docente** | Contanti segnati dal docente | Trattenuta in notula (§11) |

Sollecito automatico email al tutore/allievo: **1 settimana + 24h prima della 5ª** in calendario (soglie in Impostazioni).  
Reminder lezione: **24h + 2h** (configurabili), **solo email**, solo famiglia (tutore se minore), **anche sulla prova**, niente BCC.

Fine anno: credito sul rinnovo (V2) o rimborso staff.  
Transizione SS: il residuo si mette come **saldo iniziale** sul corso nuovo.

### 10.2 Rette da incassare (staff)

Ispirato a ScuolaSemplice *Gestione finanziaria → Rette studenti*. **Solo admin/segreteria.** Il docente non entra.

Path: `/admin/lezioni` → sub-tab **Rette**.

- Lista default: come SS, **scadute + in scadenza nei 5 giorni**, dalla **più vecchia**. Filtri periodo/stato per il resto (questo mese, fino al prossimo, range, saldate, aperte senza data).
- Filtri: allievo/tutore, corso, docente, periodo, stato. Ricerca per nome.
- In lista: **pack lezione** e **quota associativa** non pagata (tipo riga distinto).
- Riga: allievo, tutore, corso o «Quota», importo residuo, scadenza, ultimo sollecito.
- **Registra incasso** (riga o pulsante globale): cerca tutore/allievo → tutte le rette aperte della **famiglia** (stesso tutore, tutti i figli e i loro corsi) → importo **in euro**, data, metodo, nota. Si spalmano in FIFO dalla più vecchia: possono chiudere più rette, lasciarne una **parziale**, o avanzare crediti. Staff può spostare la scadenza. Ricevuta §10.1 sull’importo incassato.
- **Abbuono:** stralcia una retta (o un residuo) senza incasso; nota obbligatoria; niente ricevuta.
- **Sposta crediti:** N lezioni da un corso all’altro dello **stesso allievo**; nota obbligatoria; ledger su entrambi.
- Sollecito automatico già in §10; dalla lista **sollecito manuale** (riga) e **massivo** sui filtrati.
- Scheda allievo (staff): saldo crediti per corso + rette aperte + storico.
- Rettifica manuale crediti e **saldo iniziale** (N lezioni già pagate): entrambi con nota obbligatoria.
- Export Excel della lista filtrata.

### Metodi V1

| Metodo | Comportamento |
|--------|----------------|
| Stripe | Payment Link / checkout (come iscrizioni), due line item |
| Contanti | Docente segna → **ricevuta subito** → staff conferma conti (crediti lezione + anticipo) |
| Bonifico | Staff marca pagato: data, CRO, allegato facoltativo |
| PayPal / QR / Nexi | Non in V1 (non sono gateway oggi) |

Link Stripe scaduto/fallito: reinvio + nuovo link; storico tentativi in staff.  
Email di benvenuto (tessera/gadget) **a parte** dalla ricevuta fiscale (§10.1).

In UI: **«crediti lezione»** (distinti dai crediti sala SHOP).

### 10.1 Ricevute fiscali (matrice + copia)

Ispirato a ScuolaSemplice. Non è la notula docente né l’email di benvenuto.

Stesso PDF («Ricevuta»): in sede è la **matrice** (registro, Storage, export); in email è la **copia** per la famiglia. Stesso numero.

| | |
|--|--|
| **Numero** | Sezionale digitale **`S/{n}/{y}`** (distinto dalle ricevute cartacee attuali). `{n}` progressivo anno solare, `{y}` anno. «Prossimo n» in Impostazioni. |
| **Intestatario** | Tutore se presente in anagrafica, altrimenti allievo. Email copia allo stesso. |
| **Quota + pack** | **Una** ricevuta, due righe, se stesso pagamento. |
| **Bollo** | V2. |
| **PDF** | Un file; intestazione da dati documenti/notule già in uso + campi mancanti in Impostazioni. |
| **Docente** | Non vede le ricevute. |
| **UI staff** | Sub-tab **Ricevute** sotto Lezioni (`/admin/lezioni`). |

**Emissione automatica (genera + invia) su:**

- Stripe webhook (quota e/o pacchetto)
- Staff marca pagato (bonifico/altro)
- Docente segna **contanti** (non aspetta la conferma conti)
- Staff crea corso **e** incassa il primo pacchetto nello stesso form

Più pulsante **Invia** (e reinvia) se la famiglia la chiede o l’email è fallita.

**Storno:** non si cancella. Si emette una nuova ricevuta e la vecchia va in stato **sostituita**. Nel **rendiconto commercialista non si sommano** sostituita + nuova (solo i documenti «validi»).

**Export un click:** pulsante «Registro» (Excel: numero, data, intestatario, CF, importo, causale, metodo; esclusi i sostituiti dal totale) e «Registro + PDF» (Excel + ZIP). Filtri periodo/allievo/corso.

---

## 11. Contanti = crediti lezione + anticipo docente

1. Docente registra incasso → **ricevuta emessa e inviata**.
2. Staff **conferma** i conti.

3. Allievo: salgono i **crediti lezione**.
4. Notula docente: importo = **anticipo percepito**.

Netto scuola → docente = **compenso ore − anticipi**.  
Se anticipi > ore: debito portato sulla **notula successiva** (niente cassa fisica obbligatoria).

Esempio: 200 € incassati, 4 × 20 € = 80 € maturati → anticipo 200, da riportare 120 €.

---

## 12. Notule (compensi)

**Due documenti distinti:**

1. **Notula didattica** (nuova, da Lezioni): ore insegnamento/coordinamento del mese.
2. **Notula spese** (flusso `/admin/rimborsi` attuale): scontrini, invariato. Resta usabile anche da chi non ha corsi.

- **Una notula didattica per docente per mese**, dettaglio lezioni (data, corso, durata, importo).
- Insegnamento individuale: entra in paga solo se l’allievo è **`presente`**. Prova esclusa.
- Insegnamento collettivo: **per testa** (`tariffa_allievo × n. presenti`).
- Coordinatore: riga su ogni lezione del corso con **≥1 presente**. **Al massimo un** coordinatore; cambio con **data di decorrenza** staff.
- Lezioni **senza presenze compilate** entro la **scadenza firma**: le ore **slittano al mese successivo** (titolare e coordinatore).
- Tariffe: **Insegnamento** e **Coordinamento**. Cambio → dal **mese dopo**.
- Ore: minutaggio reale; sul corso flag opzionale «conta come 1h».
- Extra manuali in V1 (saggio, riunione).
- Firma: **canvas in app** (come `iscrizione.html`) sulla bozza mese. Opzione carica fattura (P.IVA) + nota spese allegata sulla didattica se serve.
- Ritenuta: come oggi, in compilazione.
- Contabile pagamento staff: facoltativa.

### Chiusura mese

| Chi | Quando |
|-----|--------|
| Staff | **Sempre** «Chiudi mese» (uno o tutti) |
| Docente | Dal **1° del mese successivo** può chiedere la bozza |
| Job | Il giorno **8 alle 08:00** Europe/Rome genera le bozze mancanti |

Senza notula **firmata** (o fattura caricata) non si chiude il mese dopo. Scadenza globale + sollecito email.  
Mese sbloccato da staff → notula rigenerata.

Il docente vede ore e **€ maturati**.

---

## 13. Anagrafica didattica (staff)

Scheda associato:

- Sezione **Ruoli**: flag **Docente** (assegna/revoca `member_roles`).
- Se è docente: sezione **Didattica**.
- In **Nuovo associato** si può già flaggare Docente; materie/tariffe **non** obbligatorie subito (si compilano dopo).
- Materie insegnate (multi, da catalogo). Zero materie: **si salva**, avviso giallo.
- Catalogo **voci di retribuzione** estendibile **inline** («+ Voce»: nome, unità €/h o per testa). Importi per docente **facoltativi** (vuoto = non assegnata, niente default 0). Base: «Lezioni» (€/h), «Corso collettivo» (per testa / lezione), **Coordinamento** (€/h). **Solo staff** vede catalogo e importi.
- **Paga di default sul docente.** In un corso nuovo (creato da docente o staff) si **copia automaticamente** la voce/importo del titolare adatta al tipo: individuale → Lezioni, gruppo → Collettivo. Coordinatore, quando lo staff lo assegna → Coordinamento. Il docente **non** la vede e **non** la sceglie: mette allievo, materia, data, sala. Staff può cambiare voce/importo sul corso (rifinitura). Se manca la tariffa di quel tipo, il corso parte senza paga e lo staff la mette prima dell’approvazione / prima che maturi notula.
- Cambio tariffa sul **profilo** docente → dal mese notula successivo (corsi già aperti restano sullo snapshot del corso, salvo override staff).
- Flag: crea corsi, sposta/annulla, chiudi (globali). Default tutti no.
- Visibilità pagamenti allievo
- Override dei flag sul singolo corso (dettaglio corso)

Lista rubrica: filtro **Docenti**.

Consenso foto/video: va **aggiunto** al modulo `iscrizioni.musicproeventi.it` (testo già in .doc). Visibile in scheda allievo.

---

## 14. Email (V1)

| Evento | Destinatario |
|--------|----------------|
| Prova creata | Allievo/tutore: benvenuto + magic link modulo |
| Hold 48h / rifiuto | Docente |
| Coda (nuovo corso, chiusura, hold) | Tutti `segreteria` + `admin` |
| Pacchetto da pagare / sollecito | Famiglia |
| Benvenuto corso | Famiglia (tessera/gadget) |
| Ricevuta fiscale (copia) | Intestatario (tutore se c’è); pulsante Invia/reinvia |
| Reminder lezione e prova | Famiglia only |
| **Subito** su spostamento / cancellazione / da recuperare / supplenza | Famiglia (tutore se minore); se agisce lo staff anche titolare e supplente. Checkbox «Avvisa» default acceso. Fetta 14. |
| Conferma corso approvato (prima lezione) | Famiglia. Se manca < 24h, reminder immediato. Fetta 14. |
| Notula da firmare / sollecito firma | Docente |

Canale V1: **email**. Niente Telegram reminder, niente push, niente BCC.

GCal sala: titolo con **nome allievo** (prefisso `Lezione:`).  
GCal personale docente: il docente **collega Google in Impostazioni (OAuth)**.

---

## 15. Dati da aggiungere (bozza schema)

Non è la migration: guida per la fetta 1.

| Entità | Note |
|--------|------|
| `lesson_subjects` | Catalogo materie + seed |
| `teacher_profiles` | Flag globali, visibilità pagamenti; 1-1 con `members` docente |
| `pay_rate_types` + `teacher_pay_rates` | Catalogo voci (Lezioni, Collettivo, Coordinamento, …) e importi per docente |
| `teacher_availability` | Fasce settimanali + eccezioni/ferie |
| `course_pack_prices` | Listino tipo × durata |
| `school_lesson_settings` | Griglia, soglie mail, hold, notule (singleton) |
| `school_course_terms` | Anni corsi (dal/al, una `is_current`) |
| `school_closures` | Festività / chiusure |
| `courses` | Stato, materia, titolare, sala default nullable (online), durata, prezzo, max allievi, `counts_as_hour`, un solo slot settimanale, nome auto, `closed_on`, `pay_rate_type_id` + snapshot importo (default dal titolare) |
| `course_enrollments` | Allievo, wallet crediti, `opening_prepaid_lessons` (SS/anno prima), chiuso_at |
| `course_teachers` | Titolare / coordinatore (coordinatore nascosto al titolare) |
| `course_permission_overrides` | Flag per corso |
| `lessons` | start/end, sala, progressivo #, stato presenza per allievo, booking_id, da_piazzare |
| `lesson_attendance` | Per allievo (gruppo) |
| `trial_lessons` | Bozza member, slot, no-show / riprogrammazione |
| `lesson_credit_ledger` | Movimenti wallet per iscrizione: saldo iniziale, pack, anticipo famiglia, consumo, rettifica, rimborso |
| `lesson_fees` | Rette aperte/scadute/saldate (pack da 4 o residuo); scadenza, importo, sollecito |
| `lesson_pack_payments` | Stripe/contanti/bonifico, tentativi, allegati; può chiudere N rette + generare crediti |
| `fiscal_receipts` | Matrice: sezionale S, n, anno, PDF, stato emessa/sostituita, intestatario, righe |
| `teacher_cash_advances` | Incassi confermati → anticipo notula |
| `lesson_change_requests` | Richieste se manca il flag |
| Estendere `reimbursements` | Collegamento mese, lezioni, anticipi, firma, allegato fattura/nota spese |
| `bookings` | `source = lesson`, link `lesson_id` |
| `members` | Flag bozza, tessera/gadget, scadenza bozza |

RLS: docente vede solo i propri corsi/lezioni (e «che coordino» in lettura). Staff tutto. Associato non vede l’area Lezioni.

Riutilizzo: `members`, `tutor_links`, `rooms`, `bookings`, overlap RPC, Stripe iscrizione, notule PDF/email, template documenti (attestati = V2), `iscrizione.html` / magic link.

---

## 16. Fette di implementazione

Ordine consigliato (ogni fetta consegnabile e testabile):

| # | Fetta | Output |
|---|--------|--------|
| 1 | Schema fondazione + RLS + seed materie/voci paga + Impostazioni scuola (date, listino vuoto, festività) | **Fatto** (029–030, `@musicpro/database`) |
| 2 | Anagrafica didattica in rubrica (tariffe, flag, materie, Ruoli) | **Fatto** (031 applicata) |
| 3 | Disponibilità docente | **UI fatta** (`/lezioni`, `/admin/lezioni`, scheda) |
| 4 | Occupazione sala da lezione (booking source) | Inclusa nella 5 (generate → `bookings.source=lesson`) |
| 5 | Corsi: crea / approva / hold 48h / genera ricorrente / da piazzare | **UI fatta** (`032`–`033`) |
| 6 | Calendario settimana + mensile + Oggi + DnD + colori | **UI fatta** |
| 7 | Presenze + da recuperare + docente assente + passa titolare + coda richieste | **UI fatta** (`035`) |
| 8 | Prova + bozza + magic link + email benvenuto | **UI fatta** (`036`) |
| 8b | Ponte iscrizione: form produzione valida token Supabase (poi GAS) + chiudi bozza su quota | **Codice fatto** (dual spento di default; VAI deve settare env) |
| 9 | Pacchetti da 4 + wallet crediti + checkout Stripe (quota+pack) + sollecito | **UI fatta** (`037` applicata) |
| 9b | **Rette da incassare** + Registra incasso (anticipo famiglia) + saldo iniziale SS | **UI fatta** (lista + incasso + saldo; export Excel dopo) |
| 10 | Contanti → conferma staff → crediti lezione + **anticipo docente** | Cassa docente |
| 10b | Ricevute: matrice + copia, auto su incasso, registro/export | Fiscalità entrate |
| 11 | Notule da presenti + firma + extra + chiusura mese + job giorno 8 | Compensi |
| 12 | Coordinatore read-only + sezione «Che coordino» | Ruolo visivo |
| 13 | Pausa / chiudi / rimuovi iscritto / undo 24h / code email | Ciclo vita |
| 14 | GCal docente + titolo sala; reminder email; stampa PDF; flag tessera | Integrazioni |
| 15 | Expo parità (Oggi, calendario, presenze) | Mobile |
| 16 | Consenso foto nel modulo iscrizione | Form |

---

## 17. Vincoli già nel repo

- Ruolo `docente` e `canAccessAdmin` / `isDocenteOnly` rimborsi: **restano**. Notule **spese** e notule **didattiche** sono due documenti.
- Prenotazioni sale: overlap unico; lezioni = stesso calendario sale.
- Crediti SHOP sale ≠ crediti lezione (nomi distinti in UI).
- Onboarding quota: docenti/staff già esclusi; gli allievi dei corsi no.
- Timezone: **Europe/Rome**.

---

## 18. Fuori da questo piano

- Import ScuolaSemplice (quando c’è un CSV si aggiunge una fetta).
- Nexi «tipo RIBA» / SDD.
- Portale famiglie, attestati, note, push.
- Modifiche al booking associati oltre il rispetto dell’occupazione lezione.

---

## 19. Decisioni esplicite (indice rapido)

Creato dal docente, approvato dalla segreteria · lezioni bloccano le sale · flag globali+corso · chiudi corso con consuntivo · individuale+gruppo · pacchetti da 4 su anno intero · hold 48h poi rifiuto · durata per corso · giustificata accoda · anno corsi ≠ anno solare quote · due tariffe · checkout unico quota+pack · prova = bozza+magic link · notula didattica ≠ notula spese · coordinatore invisibile al titolare, no edit, no overlap · push V2 · CSV non urgente.

---

## 20. Dettagli post-piano (2026-08-18)

| Tema | Decisione |
|------|-----------|
| Slot settimanali | Uno solo per corso |
| Nome corso | Automatico |
| Griglia | Passo 15 min |
| Paga collettivo | Proporzionale ai presenti |
| Ore coordinatore | Ogni lezione con ≥1 presente; mese non chiuso → slittano al successivo |
| Documenti | Didattica e spese **separati** |
| Landing / URL | Docente `/lezioni` (Oggi); staff `/admin/lezioni` |
| Online | Nessuna `room_id` |
| Chiusure | Solo festività di scuola in V1 |
| Da piazzare | Staff, o docente con flag |
| Hold | 48h da creazione; staff può prolungare |
| Job notule | Giorno 8 alle **08:00** Rome |
| Email | Obbligatoria in creazione |
| N. associato | Stessa regola di `iscrizioni.musicproeventi.it` |
| GCal docente | OAuth in Impostazioni |
| Anno / listino | Blocco se mancano |
| # card | Progressivo **per corso** |
| Doppio hold | Avviso; vince la prima approvazione |
| Firma | Canvas in app |
| Rimborsi senza corsi | Flusso attuale invariato |

---

## 21. Dettagli successivi (§20)

| Tema | Decisione |
|------|-----------|
| Paga collettivo | **Per testa** (tariffa-allievo × presenti), snapshot iscritti quel giorno |
| Slittamento ore | Se le **presenze non sono compilate** entro scadenza **firma** → mese dopo |
| Inizio corso | Data obbligatoria, anche retroattiva |
| Sala in presenza | Obbligatoria |
| Prova | Individuale presenza **o** online |
| Coordinatore | Uno solo; cambio con data staff |
| Admin+docente | Switch vista staff / vista docente |
| Bozze rubrica | Badge «Bozza» + filtro |
| Progressivo notule | **Stessa serie** didattica e spese |
| Reminder | Skip se cancellata o presenza già segnata |
| Hold 48h | Ore di calendario (notte/weekend compresi) |
| GCal docente | Calendar **primario**; upsert come le sale |
| Capienza default | 8 |
| Rimborso pacchetto | Staff a mano, anche **parziale**; refund Stripe se fattibile |
| Reminder notturni | Si mandano comunque |
| Expo | Nuova tab **Lezioni** se ha ruolo docente |
| Seed materie | Chitarra, Basso, Batteria, Pianoforte, Canto, Propedeutica Musicale, Musicoterapia, Musica di Insieme |

---

## 22. Dettagli residui

| Tema | Decisione |
|------|-----------|
| Tariffa-allievo | **Per lezione**, indipendente dalla durata |
| Voci retribuzione | Catalogo estendibile. Sul corso: **default del titolare** (copia automatica), staff può cambiare dal dropdown |
| Coordinatore | `tariffa_coord × durata` se ≥1 presente (non per testa) |
| Mese a 0 ore | Niente bozza, salvo anticipi/debiti da riportare |
| Inizio retroattivo | Lezioni passate = **presenza da inserire** |
| Extra lezione | Se flag sposta/crea, senno richiesta |
| Togli lezione futura | Annulla, libera sala, **non** accoda, **non** scala pacchetto |
| Conversione prova | Corso **già attivo** |
| 1 prova / stagione | Per **persona** (fratelli = due prove) |
| Annulla prova | Docente/staff, sala libera, bozza resta 30g |
| Reinvio link | Docente e staff |
| DnD Expo | Sì |
| PDF didattica | Tabella lezioni + anticipi + firma |
| IVA | Non applicabile |
| Arrotondamento | Centesimo **riga per riga**, poi somma |
| Prova staff | Sempre, anche senza flag del docente |
| Email bozza | Si corregge e si reinvia |
| Presenze arretrate | Badge in Oggi; in notula del mese in cui le **segna** |
| Corso 0 € | Niente pacchetti né solleciti |
| Listino Impostazioni | Prezzo famiglia (pack 4) × tipo/durata **e** paghe docente |

---

## 23. Cataloghi (fetta 1)

| Tema | Decisione |
|------|-----------|
| Nuove voci retribuzione | Admin **e** segreteria |
| Disattiva voce usata | Soft: resta sui corsi esistenti, non si assegna più |
| Festività seed | Nazionali italiane + `repeats_yearly` (no Pasqua) |
| Anno corsi | **Una riga per anno** (`school_course_terms.is_current`) |
| Disponibilità vuota | Tutto libero |
| Materia | Rinomina ok; disattiva = soft, i corsi restano |

---

## 24. Ricevute fiscali

| Tema | Decisione |
|------|-----------|
| Auto emetti+invia | Stripe, staff pagato, **contanti al segno docente**, crea corso + incasso |
| Invia manuale | Pulsante **Invia** se la famiglia la chiede |
| Quota+pack | Una ricevuta, due righe |
| Intestatario | Tutore se c’è, senno allievo |
| Numero | Sezionale **`S/{n}/{y}`** (≠ cartacee) |
| Bollo | V2 |
| Storno | Nuova + vecchia **sostituita**; il rendiconto **non somma** le sostituite |
| PDF | Un file; matrice = archivio, copia = stessa in email |
| Export | «Registro» e «Registro + PDF» |
| Dove | Sub-tab Ricevute in Lezioni staff |
| Docente | Non le vede |
| Intestazione | Dati documenti/notule esistenti |

---

## 25. Anagrafica docente (fetta 2, 2026-08-18)

| Tema | Decisione |
|------|-----------|
| Accendere docente | Flag **Docente** in sezione **Ruoli** (insieme ad Amministratore e Segreteria) |
| Chi assegna i ruoli | Admin: tutti e tre. Segreteria: Docente e Segreteria, **non** Admin. Non si toglie il proprio Admin; deve restare ≥1 admin |
| Lista | Pulsante filtro **Docenti** in `/admin/associati` |
| Nuovo associato | Si possono flaggare i ruoli in creazione; Didattica non obbligatoria subito |
| Materie | Facoltative; avviso se zero |
| Tariffe | Facoltative in anagrafica; vuoto = non assegnata. **Solo staff** le vede. Una per voce (Lezioni / Collettivo / Coordinamento) = **default** di quel tipo |
| Nuova voce paga | **+ Voce** inline (nome + unità); catalogo globale staff |
| Creazione corso | Docente: allievo, materia, data, sala. **Paga copiata in automatico** dal default del titolare (individuale→Lezioni, gruppo→Collettivo). Staff può cambiare |
| Togliere Docente | Blocca solo se è **titolare** di corsi aperti; prima `closed_on`, presenze, notule firmate. Da coordinatore: si toglie in automatico. Pre-corsi: revoca libera |
| Dati dopo revoca | Profilo, materie e tariffe restano in DB |

---

## 26. Rette, anticipo famiglia, saldo SS (2026-08-18)

Wiki SS usata: *Rette studenti*, *pagamento parziale/cumulativo*, *solleciti*, *pacchetti rinnovabili / crediti*, *report rette da ricevere*.

| Tema | Decisione |
|------|-----------|
| Coda staff | Sub-tab **Rette** in `/admin/lezioni` |
| Vista default | Come SS: **scadute + in scadenza 5 giorni**, dalla più vecchia |
| Filtri | Allievo/tutore, corso, docente, periodo, stato (anche saldate); ricerca nome |
| Cosa c’è in lista | Pack lezione **e** quota associativa non pagata |
| Wallet | 1 credito = 1 lezione del corso. Pack da 4 = acquisto standard |
| Unità incasso | **Euro**. Chiude le rette FIFO; resto ÷ prezzo-lezione del corso → crediti; centesimi restano acconto € sulla famiglia |
| Parziale | Sì: ultima retta toccata resta aperta col residuo (come SS) |
| Perimetro incasso | Un bonifico di **famiglia**: tutti i corsi dei figli dello stesso tutore |
| Scadenza retta | Si apre **subito** alla richiesta pack (scadenza = oggi); lo staff la può spostare |
| Anticipo famiglia | Incasso > dovuto → crediti (e acconto €). Niente nuova retta finché il wallet copre |
| Anticipo docente | Resta §11. Nomi distinti |
| Saldo iniziale | N lezioni già pagate + nota. No ricevuta. Transizione SS / anno prima |
| Rettifica | Staff, nota obbligatoria, riga ledger |
| Abbuono | Stralcio senza incasso, nota, no ricevuta |
| Sposta crediti | Stesso allievo, corso A → B, N lezioni, nota |
| Storico | Ledger: acquisto, consumo, anticipo, saldo iniziale, rettifica, spostamento, abbuono, rimborso |
| Docente | Non vede Rette. Sul profilo allievo vale il flag visibilità |
| Sollecito lista | Manuale riga + massivo sui filtrati + automatici 1 settimana / 24h |
| Export | Excel della lista filtrata |
| Fuori V1 (SS ce l’ha, noi no) | Canone mensile, rinnovo automatico, buoni d’acquisto, portale famiglie, fattura elettronica, disiscrizione a crediti 0, caparra/preiscrizione, prima nota |

---

## 27. Disponibilità (fetta 3, 2026-08-18)

| Tema | Decisione |
|------|-----------|
| Default | Zero fasce = sempre libero |
| Prima fascia | Da allora libero **solo** in quelle ore |
| Sovrapposizioni | Si uniscono (anche se si toccano) |
| Ferie | Giorni interi default; opzione fascia oraria |
| Dove staff | Scheda associato **e** `/admin/lezioni` (dropdown) |
| Domenica | Nascosta in disponibilità se il flag scuola è off |
| Conflitti lezioni | Stub; si attiva quando esistono i corsi (fetta 5/7) |

---

## 28. Corsi (fetta 5, 2026-08-18)

| Tema | Decisione |
|------|-----------|
| Hold 48h | Occupa **solo la prima occorrenza futura** (stesso giorno/ora/sala) |
| Gruppo in creazione | Uno o più allievi subito; altri dopo |
| Quota/modulo | Docente: **blocca**. Staff: avvisa e può forzare. Bozza anagrafica: sempre no |
| Festività in generazione | Salta e **accoda** stessa fascia al primo buco (dopo fine anno, max 12 settimane); senno da piazzare |
| Slot occupato | Lezione **da piazzare** (niente booking) |
| Anno corsi | Form in `/admin/lezioni/impostazioni` (niente seed) |
| Occupazione sala | `bookings.source=lesson` via `create_lesson_booking` (fetta 4 inclusa) |

---

## 29. Calendario (fetta 6, 2026-08-18)

| Tema | Decisione |
|------|-----------|
| Staff | Toggle **Docente / Sala** (default docente) |
| Senza flag sposta | Card non trascinabile; tap → **Richiedi spostamento** (testo + hold; tabella `lesson_change_requests`) |
| Corsi in attesa | Card tratteggiata sulla lezione hold |
| Tap giorno in mese | Apre la **settimana** e evidenzia il giorno |
| Colori | Individuale giallo, gruppo azzurro, online viola |
| Landing docente | `/lezioni` → **Oggi** |

---

## 30. Presenze e recuperi (fetta 7, 2026-08-18)

Default operativi chiusi (SS / Jackrabbit, senza feature extra).

| Tema | Decisione |
|------|-----------|
| Recupero data ignota | **Parcheggio da recuperare** (default). Accodamento automatico al primo buco = no |
| Slot originale | Si **libera subito** (booking cancellato) |
| Collettivo 1 assente giustificato | Slot **1:1 extra** `kind=recupero`, non altro gruppo |
| Docente assente su lezioni già messe | Azione unica «Docente assente» oggi/range → da recuperare + libera sala |
| Cambio titolare | **Passa a X** sullo stesso corso |
| Già presenziata | Niente spostamento / DnD finché non si sblocca |
| Recupero nel passato | Vietato |
| Oggi | Registro in un tap (default tutti presenti); **telefono** allievo/tutore in riga |
| Wallet / pack | Stati presenza sì; consumo crediti = fetta 9 |
| Mese notula chiuso | Stub (sempre aperto) fino alla 11 |
| Email subito su sposta/cancella | Spec §14, implementazione fetta 14 |
| Coda staff | Da piazzare **e** da recuperare **e** richieste spostamento (`034`) |

---

## 31. Prova (fetta 8, 2026-08-18)

| Tema | Decisione |
|------|-----------|
| Modello | `courses.is_trial` + **una** lezione `kind=prova`. Status **attivo** subito, niente hold/coda |
| Flag crea | Docente: serve `can_create_courses`. Staff: sempre |
| Allievo | Bozza rubrica (`is_enrollment_draft`, no n. associato, scade 30g). Email già in anagrafe → **riaggancia** |
| Minore | < 18 come `iscrizione.html`: dati allievo **e** tutore |
| Sala | Occupata subito (`confirmed`). Online = niente sala |
| 1 / stagione | Per persona, anno corsi corrente. Fratelli = due prove |
| No-show | Docente: **libera** o **riprogramma** (1 sola volta) |
| Annulla | Libera sala; bozza resta 30g |
| Conversione | Nuovo corso **già attivo**, stesso slot proposto. Checkout quota+pack = fetta 9 |
| Magic link | 30 giorni, URL form iscrizione esistente (`iscrizioneToken`), campi modificabili. Reinvio docente/staff |
| Email | Benvenuto + link via Resend. Se manca la chiave, warning (non blocca la prova) |
| Colore card | Prova = rosa (distinto da individuale giallo) |
| Rubrica | Badge **Bozza** + filtro |

---

## 32. Audit quattro punti di vista (2026-08-18)

Walk su fette 1–8 (admin/segreteria, docente, allievo, tutore). Distingue **buchi in pezzi già consegnati** da **fette successive**. Il portale famiglia è V2, non un buco.

### Verdetto

| Persona | Pronto? | Cosa gira | Cosa rompe il lunedì |
|---------|---------|-----------|----------------------|
| Admin / segreteria | Didattica sì, cassa no | Anno, rubrica docente, disponibilità, crea/approva/hold, calendario, Oggi, recuperi in coda, passa titolare, prova | Rette stub, listino/festività senza UI, email famiglia, sblocca presenza, pausa/chiudi, saldo SS senza campo |
| Docente | Oggi sì, settimana no | Landing Oggi, presenze del giorno, docente assente, calendario, richiesta spostamento, corso/prova se flag, disponibilità | Presenze solo oggi, recuperi non piazzabili, niente sblocca, RLS prova `attivo`, Impostazioni 1/3, prezzo sempre visibile |
| Allievo | No (canali V1 rotti) | Dashboard associativa (sale, shop crediti **sala**, quota onboarding). Non entra in `/lezioni` (voluto) | Magic link prova → GAS. Zero reminder, pack, ricevuta, avviso spostamento |
| Tutore | No | Campi sul figlio + email prova (se Resend). Telefono in Oggi docente | Stesso link rotto. Non è un’identità. Quota pagata non chiude la bozza. Conferme al figlio. Un solo contatto |

### Cinque pezzi comuni

| Pezzo | Chi colpisce | Dove sta |
|-------|--------------|----------|
| Form iscrizione in produzione valida token **GAS**; la prova li scrive in **Supabase** → «Link non valido» | Allievo, tutore, poi docente (non converte) | **8b** (inclusa nella 9) |
| Rette / wallet / checkout quota+pack | Admin, famiglia | **9 / 9b** (questa fetta) |
| Email subito su sposta/cancella + reminder 24h/2h | Famiglia, tutore, staff che deve telefonare | **14** |
| Presenze solo oggi + recuperi solo in coda admin + niente sblocca | Docente e staff | **Gap 7** (hotfix dopo la 9, non V2) |
| Pausa / chiudi / togli iscritto / notule didattiche / GCal / PDF / Expo | Admin e docente | **11–15** |

### Admin / segreteria

Percorso: tab Lezioni → `/admin/lezioni` (Oggi · Corsi · Coda · Disponibilità · Calendario · Rette · Impostazioni).

- Impostazioni oggi = solo anno corsi. Helper listino e chiusure **esistono** (`listCoursePackPrices`, `listSchoolClosures`) ma **senza form**. Listino `amount_eur` NULL blocca il go-live pack.
- Crea corso: `openingPrepaidLessons` è nel helper, **campo assente** in UI.
- Approva: non si cambia sala al volo.
- Rette = stub. Senza 9/9b niente FIFO famiglia, niente sollecito, niente saldo SS.
- Richieste spostamento: manca orario originale in coda.

### Docente

Percorso: `/lezioni` (landing Oggi). Associato non vede Lezioni.

- Registro: piano dice `attendanceEditDays` (14); UI = **solo oggi**.
- `PlaceLessonForm` solo in coda **admin**, anche se `can_reschedule`.
- Niente «sblocca presenza» → card già presenziata non si muove (voluto finché non si sblocca; manca l’azione).
- **RLS:** `courses_insert_docente` accetta solo `in_attesa`; `createTrial` inserisce `attivo` → la prova lato docente può fallire. Fix in `037`.
- Flag `can_reschedule` / `can_close_courses` non applicati in `moveLesson` / `placeLesson`.
- `payment_visibility` ignorato: il prezzo corso si vede sempre.
- Impostazioni docente = solo disponibilità. Mancano Anagrafica e Permessi in sola lettura.

### Allievo

Niente `/lezioni` (contratto V1). Canale famiglia = email + form iscrizione + paga.

- Token prova in `app_settings` (`iscrizione_token:`); `api.php` produzione inoltra a GAS.
- Pagare la quota su GAS **non** scrive `member_annual_quotas` e **non** toglie `is_enrollment_draft` → il docente non converte.
- Dashboard shop = crediti **sala**, omonimia con «crediti lezione».
- Nessuna email dopo il benvenuto prova (reminder, spostamento, pack). Fetta 14.

### Tutore

Non è un login. Identità = `manual_tutor_*` sul figlio. `tutor_links` non usata in UI.

- Stesso magic link rotto.
- Email di prova al tutore, saluto col **nome del figlio**.
- Conferma/PDF iscrizione all’email del figlio.
- Un solo contatto. Famiglia = stesso tutore (FIFO 9b) non implementata prima di questa fetta.

### Cosa non è un buco

Portale tutore, disdetta famiglia, self-book, SMS, push, PayPal/Nexi, lista d’attesa, note lezione, KPI, timeclock. Piano V2 o fuori perimetro.

---

## 33. Pacchetti, wallet, rette (fetta 9+9b, 2026-08-18)

Default operativi chiusi. Ricevute PDF = **10b**. Contanti docente = **10**. Email reminder lezione / sposta = **14** (qui solo sollecito retta).

| Tema | Decisione |
|------|-----------|
| Wallet | 1 riga ledger per movimento. Saldo = `sum(delta)` su `course_enrollments`. 1 credito = 1 lezione di **quel** corso |
| Consumo | `presente` o `assente` (non giustificato). Idempotente per `(lesson_id, member_id)`. Prova = niente consumo |
| Apertura retta pack | Se dopo il consumo il saldo ≤ 0: `ceil(debiti/4)` rette pack aperte (`debiti = max(0, −saldo)`). Prezzo 0 € = nessuna retta, nessun sollecito |
| Prima retta | Anche in conversione prova e in crea corso (se saldo 0 e prezzo > 0): si apre subito, scadenza = oggi |
| Saldo iniziale | Staff: N lezioni + nota. Ledger `saldo_iniziale`, **niente** ricevuta né retta |
| Incasso | Euro, FIFO famiglia (stesso `manual_tutor_email`, senno solo l’allievo). Parziale sì. Resto ÷ prezzo-lezione → crediti; centesimi → acconto € famiglia |
| Metodi V1 qui | Stripe checkout (quota+pack), bonifico staff, altro staff. Contanti docente = fetta 10 |
| Checkout | Payment Link come iscrizioni. Due line item se quota mancante. `mp_flow=lesson_pack` |
| Bozza | Pagamento quota (Stripe o staff) toglie `is_enrollment_draft` |
| Ponte form | `ISCRIZIONE_BACKEND=dual`: valida token Supabase prima, poi GAS. Il form tiene `iscrizioneToken` nel POST. Submit Next se il token è in Supabase, senno GAS. Dual spento di default (VAI deve settare env) |
| Sollecito | Manuale (riga + massivo filtrati) + automatico 1 settimana / 24h prima della **5ª** lezione in calendario se il wallet non copre (`pack_remind_hours_*`) |
| UI staff | `/admin/lezioni/rette` + listino e festività in Impostazioni + campo saldo iniziale in crea corso |
| Docente | Non vede Rette. Non vede importi se `payment_visibility` lo vieta (fix visibilità prezzo in questa fetta, sul dettaglio corso) |
| Fuori da questa fetta | Export Excel, ricevuta PDF, contanti docente, email sposta/reminder lezione, hotfix presenze 14 giorni / piazza recupero / sblocca |

*Fine specifica V1. Implementare solo a fette (§16), senza allargare il perimetro V2.*
