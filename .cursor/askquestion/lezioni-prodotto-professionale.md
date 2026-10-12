# AskQuestion — Lezioni verso prodotto professionale

**Uso:** in Cursor Desktop/Composer (con strumento **AskQuestion** attivo):

| Comando | Contenuto |
|---------|-----------|
| `#askquestion lezioni prodotto` | Batch **1** (default) |
| `#askquestion lezioni batch N` | Batch 1–9 |
| `#askquestion lezioni ui` | Solo batch **5** |
| `#askquestion lezioni flussi` | Solo batch **6** |
| `#askquestion lezioni problematiche` | Solo batch **8** |
| `#askquestion lezioni facoltativo` | Batch **7** + **9** (due form separati se troppe domande: prima 7, poi 9) |

**Regole:** opzioni in italiano, 2–4 voci + ultima sempre `Altro (lo scrivo in chat)`; prima opzione consigliata con `(consigliato)` nel label.

**Contesto attuale:** V1 scritta (`docs/PIANO_LEZIONI.md` §41); cutover con VAI; sala test `sandbox-test`; Nexi Classic XPay (pack/rette); wallet pack alla 4ª presenza / saldo ≤ 0; `is_test_account`; sezionale TEST ricevute/notule; sandbox env `docs/LEZIONI_SANDBOX.md`.

**Obbligatorio per «professionale»:** batch **1 → 4**, poi **6** e **8**. **5** = UI da allineare prima del go-live se qualcuno usa l’area ogni giorno. **7** e **9** = facoltativi (roadmap).

---

## Batch 1 — Priorità release (obbligatorio)

| ID | Domanda | Tipo | Opzioni |
|----|---------|------|---------|
| `release_scope` | Cosa deve essere **live** prima di considerare lezioni «professionali»? | single | Tutto insieme: lezioni + pagamenti + ricevute/notule (consigliato) · Solo lezioni interne (presenze/calendario), pagamenti dopo · Solo pagamenti Nexi pack, resto manuale · Altro (lo scrivo in chat) |
| `sandbox_strategy` | Strategia test vs produzione lezioni | single | Solo sala test + account test in prod (consigliato) · Secondo Supabase sandbox (doc LEZIONI_SANDBOX) · Flag `NEXT_PUBLIC_LESSONS_MODULE=sandbox` su preview · Altro (lo scrivo in chat) |
| `biggest_risk` | Rischio maggiore da mitigare subito | single | Doppio addebito / wallet errato (consigliato) · Email/link pagamento persi · Blocco sale reali · Dati fiscali TEST in prod · Altro (lo scrivo in chat) |
| `stripe_db_cleanup` | Rinomina colonne/RPC `stripe_*` in DB | single | Dopo cutover lezioni (consigliato) · Mai, solo alias UI · Subito in migration dedicata · Altro (lo scrivo in chat) |
| `lessons_module_flag` | Accensione `NEXT_PUBLIC_LESSONS_MODULE` in prod | single | `live` solo dopo smoke sandbox + checklist (consigliato) · `sandbox` su branch dedicato fino a prova reale · `live` subito con banner test · Altro (lo scrivo in chat) |

---

## Batch 2 — Wallet, pacchetti, presenze (obbligatorio)

| ID | Domanda | Tipo | Opzioni |
|----|---------|------|---------|
| `pack_trigger` | Quando aprire la retta del **prossimo** pacchetto | single | A saldo crediti ≤ 0 dopo presenza (consigliato) · Alla 4ª presenza fissa indipendentemente dal saldo · Manuale da segreteria · Altro (lo scrivo in chat) |
| `pack_notify` | Dopo apertura pack, notifica allievo | multi | Email link Nexi automatica (consigliato) · Solo banner in area allievo · Push/app (futuro) · Nessuna notifica automatica · Altro (lo scrivo in chat) |
| `absence_wallet` | Assenza / giustificato consuma credito? | single | Solo **Presente** scala (consigliato) · Assente scala sempre · Giustificato non scala, assente sì · Regole per corso · Altro (lo scrivo in chat) |
| `first_pack` | Primo pacchetto a iscrizione corso | single | Staff incassa contanti/crediti poi lezioni (consigliato) · Nexi obbligatorio prima della 1ª lezione · Prova gratuita 1 lezione senza pack · Altro (lo scrivo in chat) |
| `trial_courses` | Corsi `is_trial` | single | Esclusi da pack automatico (consigliato) · Stesse regole dei corsi pagati · Solo staff decide caso per caso · Altro (lo scrivo in chat) |
| `opening_balance` | Saldo iniziale lezioni già pagate (SS / anno prima) | single | Solo staff, senza ricevuta automatica (consigliato) · Con ricevuta di nota · Vietato in prod · Altro (lo scrivo in chat) |
| `family_advance` | Anticipo famiglia > importo pack | single | Eccesso in wallet, niente nuova retta finché copre (consigliato) · Sempre nuova retta a 4 lezioni · Solo contanti in segreteria · Altro (lo scrivo in chat) |

---

## Batch 3 — Nexi, solleciti, rimborsi (obbligatorio)

| ID | Domanda | Tipo | Opzioni |
|----|---------|------|---------|
| `nexi_env` | Ambiente Nexi lezioni in prod | single | TEST fino a checklist verde poi PROD (consigliato) · PROD subito · Solo contanti/bonifico in prod · Altro (lo scrivo in chat) |
| `payment_reminder` | Sollecito retta pack scaduta | single | Email + link rigenerabile (consigliato) · Solo email · Solo UI staff · Altro (lo scrivo in chat) |
| `partial_pay` | Rette **parziali** | single | Sì, con saldo residuo visibile (consigliato) · No, solo pagamento intero pack · Solo contanti in segreteria · Altro (lo scrivo in chat) |
| `refund_pack` | Rimborso pacchetto pagato Nexi | single | Manuale segreteria + nota (consigliato) · Flusso Nexi storno automatizzato · Solo crediti lezione · Altro (lo scrivo in chat) |
| `quota_pack_checkout` | Checkout unico quota associativa + pack | single | Due righe, un pagamento Nexi se possibile (consigliato) · Sempre due link separati · Solo pack, quota a parte · Altro (lo scrivo in chat) |
| `dunning_auto` | Sollecito automatico pre-5ª lezione senza crediti | single | Cron + soglie scuola come da piano (consigliato) · Solo manuale staff · Disattivato in V1 · Altro (lo scrivo in chat) |

---

## Batch 4 — Fiscale TEST, ricevute, notule (obbligatorio)

| ID | Domanda | Tipo | Opzioni |
|----|---------|------|---------|
| `test_section_policy` | Sezionale TEST in produzione | single | Solo payee `is_test_account` (consigliato) · Tutti i corsi su sala test · Mai in prod, solo sandbox DB · Altro (lo scrivo in chat) |
| `test_purge` | Pulizia TEST a fine prova | single | SQL checklist + verifica manuale (consigliato) · Job admin «svuota TEST» · Export poi delete · Altro (lo scrivo in chat) |
| `receipt_timing` | Quando emettere ricevuta incasso pack | single | All’allocazione pagamento (consigliato) · Solo su richiesta staff · Mai automatica · Altro (lo scrivo in chat) |
| `payroll_test` | Notula docente test | single | Serie TEST se docente flag test (consigliato) · Mai notule su account test · Stessa serie S · Altro (lo scrivo in chat) |
| `receipt_export` | Export Excel rette / ZIP PDF ricevute (oggi assenti) | single | Dopo go-live, non blocca V1 (consigliato) · Obbligatorio prima del live · Mai, solo schermo · Altro (lo scrivo in chat) |
| `teacher_payment_visibility` | Cosa vede il docente su pagamenti allievo | single | Solo stato pagato/in ritardo (consigliato) · Stato + importi · Niente · Altro (lo scrivo in chat) |

---

## Batch 5 — UI staff / docente / allievo (da definire o rifinire)

| ID | Domanda | Tipo | Opzioni |
|----|---------|------|---------|
| `attendance_ux` | Conferma presenze (docente) | single | Salva → toast + eventuale «link pagamento inviato» (consigliato) · Modale riepilogo prima del save · Solo icona stato senza testo · Altro (lo scrivo in chat) |
| `fees_panel` | Pannello rette pack (`/admin/lezioni/rette`) | single | Tabella compatta + azioni riga (consigliato) · Wizard per incasso · Solo link Nexi · Altro (lo scrivo in chat) |
| `student_payment_ux` | Allievo/tutore paga pack (non entra in `/lezioni`) | single | Email → landing Nexi → ritorno dashboard (consigliato) · Pagina dedicata «Le mie rette» in area associato · Solo contatto segreteria · Altro (lo scrivo in chat) |
| `test_account_ui` | Flag **Account test** in rubrica | single | Checkbox in modifica rapida (consigliato) · Badge readonly + solo admin · Nascondere associati test dalla rubrica pubblica · Altro (lo scrivo in chat) |
| `calendar_density` | Calendario lezioni (web) | single | Densità attuale, no righe extra (consigliato) · Filtri sala/docente sempre visibili · Vista settimana default · Altro (lo scrivo in chat) |
| `queue_ux` | Coda staff (approva corso, hold, richieste spostamento) | single | Una lista con filtri + azioni inline (consigliato) · Tab separati per tipo · Solo da dettaglio corso · Altro (lo scrivo in chat) |
| `change_request_defaults` | Approvazione richiesta spostamento: notifiche default | single | Docente + famiglia entrambi ON (consigliato) · Solo famiglia · Solo docente · Staff sceglie ogni volta senza default · Altro (lo scrivo in chat) |
| `listino_settings` | Form listino pack in Impostazioni (prezzi NULL bloccano pack) | single | Tabella tipo×durata inline (consigliato) · Modale per riga · Import CSV listino · Altro (lo scrivo in chat) |
| `unplaced_block` | Lezioni «da piazzare» dopo pausa/occupato | single | Blocco in coda + drag da calendario (consigliato) · Solo lista in coda · Solo staff da dettaglio corso · Altro (lo scrivo in chat) |
| `payroll_sign_ux` | Firma notula in app | single | Pad firma + anteprima PDF come oggi (consigliato) · Solo «accetto» checkbox · Firma solo staff · Altro (lo scrivo in chat) |
| `sandbox_banner` | Banner modulo sandbox / test | single | Banner staff+docente se `sandbox` o sala test (consigliato) · Solo admin · Nessun banner · Altro (lo scrivo in chat) |
| `payment_copy` | Testi verso famiglia (evitare jargon gateway) | single | «Paga retta lezioni» senza nome Nexi/Stripe (consigliato) · Nome gateway esplicito · Solo «link pagamento» · Altro (lo scrivo in chat) |

---

## Batch 6 — Flussi mancanti / integrazioni (obbligatorio)

| ID | Domanda | Tipo | Opzioni |
|----|---------|------|---------|
| `missing_flow` | Flusso **mancante** più urgente | single | E2E Playwright lezioni pack (consigliato) · Cambio docente mid-corso · Recupero lezione / makeup · Chiusura corso con crediti residui · Altro (lo scrivo in chat) |
| `course_lifecycle` | Pausa / chiusura / rimuovi iscritto + undo 24h | single | Comportamento piano §38 così com’è (consigliato) · Undo più permissivo · Niente undo · Altro (lo scrivo in chat) |
| `trial_conversion` | Da prova gratuita a corso pagato | single | Nuovo corso attivo stesso slot + checkout quota+pack (consigliato) · Conversione in-place stesso corso · Solo manuale staff · Altro (lo scrivo in chat) |
| `teacher_cash` | Incasso contanti da docente titolare | single | Solo propri allievi, come fetta 10 (consigliato) · Vietato, solo segreteria · Qualsiasi allievo del docente · Altro (lo scrivo in chat) |
| `hold_48h` | Hold sala 48h su corso docente in attesa | single | Rifiuto automatico + email come piano (consigliato) · Estensione manuale staff · Hold senza scadenza · Altro (lo scrivo in chat) |
| `attendance_window` | Finestra temporale modifica presenze | single | Soglie scuola in Impostazioni (consigliato) · Sempre modificabile da staff · Blocco 24h dopo lezione · Altro (lo scrivo in chat) |
| `family_pay` | Pagamento famiglia (genitore) | single | Già ok con incasso famiglia / ledger (consigliato) · Serve UI dedicata in dashboard · Non usato · Altro (lo scrivo in chat) |
| `google_cal` | Sync Google Calendar lezioni | single | OAuth docente se chiavi; stub accettabile in V1 (consigliato) · Non in scope V1 · Solo export iCal · Bidirezionale obbligatorio · Altro (lo scrivo in chat) |
| `ss_import` | ScuolaSemplice / import quote | single | Separato da lezioni live (consigliato) · Deve aggiornare wallet lezioni · Non serve · Altro (lo scrivo in chat) |
| `permission_override` | Override permessi per singolo corso | single | V2, solo flag globali + staff (consigliato) · Implementare tabella override prima del live · Altro (lo scrivo in chat) |

---

## Batch 7 — Mobile, notifiche, qualità (facoltativo)

| ID | Domanda | Tipo | Opzioni |
|----|---------|------|---------|
| `mobile_priority` | App mobile lezioni (Expo docente) | single | Parità web essenziale Oggi/calendario/presenze (consigliato) · Solo consultazione · Web-first 6 mesi · Altro (lo scrivo in chat) |
| `push_lessons` | Push pagamento / lezione | single | Dopo inbox email stabile · Subito con Expo · Mai · Altro (lo scrivo in chat) |
| `optional_polish` | Polish facoltativo prioritario | multi | Copy utente senza jargon pagamenti · Stati loading/error uniformi · Accessibilità tap target · Dark mode · Altro (lo scrivo in chat) |
| `expo_staff` | Staff lezioni su Expo | single | Fuori scope V1 (consigliato) · Solo rette in lettura · Parità admin web · Altro (lo scrivo in chat) |

---

## Batch 8 — Problematiche e gap audit (obbligatorio)

Triaging prima del go-live: cosa è accettabile, cosa va chiuso, cosa va in backlog.

| ID | Domanda | Tipo | Opzioni |
|----|---------|------|---------|
| `blocker_list` | Cosa **blocca** il go-live lezioni oggi? | multi | Listino pack con prezzi NULL · Smoke Nexi pack mancante · Wallet/pack in caso edge · Ricevute TEST in prod · Email solleciti · Nessun blocker noto (consigliato solo se verificato) · Altro (lo scrivo in chat) |
| `cron_timezone` | Job reminder/notule (UTC vs Europe/Rome) | single | Verificare e allineare a Rome prima del live (consigliato) · Accettare UTC · Solo manuale staff · Altro (lo scrivo in chat) |
| `dual_enrollment` | Dual write iscrizione GAS + Supabase | single | Spento fino a VAI env come piano (consigliato) · Accendere con lezioni · Non rilevante · Altro (lo scrivo in chat) |
| `oggi_hold` | Da Oggi: tap lezione in hold / coda | single | Comportamento attuale (no apertura hold) ok (consigliato) · Link alla coda · Aprire dettaglio hold · Altro (lo scrivo in chat) |
| `ui_pain` | Superficie UI più confusa oggi | single | Rette da incassare · Coda approvazioni · Dettaglio corso · Calendario staff · Notule/firma · Nessuna prioritaria (consigliato) · Altro (lo scrivo in chat) |
| `data_risk` | Rischio dati in prova reale | single | Solo sala test + `is_test_account` (consigliato) · Account reali su corsi prova · Mix accettato con checklist · Altro (lo scrivo in chat) |
| `open_bug` | Problema tecnico aperto da prioritizzare | single | Notify Nexi non idempotente · Link pagamento scaduto · Doppia richiesta spostamento · Export ricevute · Coordinatore visibilità · Nessuno (consigliato) · Altro (lo scrivo in chat) |

---

## Batch 9 — Roadmap facoltativa V1.1 (facoltativo)

| ID | Domanda | Tipo | Opzioni |
|----|---------|------|---------|
| `v11_feature` | Prima feature dopo go-live | single | Export rette/ricevute · E2E Playwright pack · GCal OAuth completo · Portale tutore rette · Altro (lo scrivo in chat) |
| `flex_courses` | Corsi flessibili (V2 piano) | single | Restano fuori (consigliato) · Pilot su un corso · Priorità alta · Altro (lo scrivo in chat) |
| `waitlist` | Lista d’attesa corsi | single | V2 (consigliato) · Semplice flag su corso · Subito · Altro (lo scrivo in chat) |
| `kpi_dashboard` | KPI lezioni (occupazione, incassi) | single | Dopo 3 mesi uso reale (consigliato) · Mini widget in admin subito · Mai · Altro (lo scrivo in chat) |

---

## Per l’agente — mapping AskQuestion

1. Risolvi il batch dal comando utente (tabella in cima). `#askquestion lezioni problematiche` → batch **8**; `ui` → **5**; `flussi` → **6**.
2. Costruisci **un** form con **tutte** le domande del batch. Tipo `multi` → scelta multipla nel tool; se il tool non supporta multi su una domanda, spezza in sotto-domande single con prefisso ID.
3. Dopo le risposte, aggiorna `docs/LEZIONI_PRODOTTO_DECISIONS.md` (tabella stato + righe ID + note Altro).
4. Proponi il batch successivo nell’ordine: **1 → 2 → 3 → 4 → 6 → 8 → 5** (5 può slittare dopo 4 se il team è solo backend) **→ 7 → 9**.
5. Se l’utente chiede «tutte le askquestion»: non unire 1–9 in un form; guida batch per batch (max ~12 domande per form).

**Ordine consigliato (must-have):** 1 → 2 → 3 → 4 → 6 → 8 → 5. **Facoltativo:** 7, 9.
