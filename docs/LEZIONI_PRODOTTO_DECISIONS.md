# Lezioni — decisioni prodotto (da AskQuestion)

Registro delle risposte ai form tappable. L’agente aggiorna questo file dopo ogni batch.

**Fonte domande:** [`.cursor/askquestion/lezioni-prodotto-professionale.md`](../.cursor/askquestion/lezioni-prodotto-professionale.md)

---

## Stato avanzamento

| Batch | Focus | Stato | Data |
|-------|--------|-------|------|
| 1 | Priorità release e sandbox | ☑ | 2026-10-12 |
| 2 | Wallet, pacchetti, presenze | ☑ | 2026-10-12 |
| 3 | Nexi, solleciti, rimborsi | ☑ | 2026-10-12 |
| 4 | Fiscale TEST, ricevute, notule | ☑ | 2026-10-12 |
| 5 | UI staff / docente / allievo | ☑ | 2026-10-12 |
| 6 | Flussi mancanti e integrazioni | ☑ | 2026-10-12 |
| 7 | Mobile e polish (facoltativo) | ☐ | |
| 8 | Problematiche e gap audit (obbligatorio) | ☑ | 2026-10-12 |
| 9 | Roadmap facoltativa (V1.1) | ☐ | |

Legenda stato: ☐ da fare · ◐ parziale · ☑ registrato

---

## Risposte per ID

### 2026-10-12 — Batch 1

| ID | Scelta |
|----|--------|
| `release_scope` | Tutto insieme: lezioni + pagamenti + ricevute/notule |
| `sandbox_strategy` | Solo sala test + account test in prod |
| `biggest_risk` | Doppio addebito / wallet errato |
| `stripe_db_cleanup` | Lasciare colonne/RPC stripe_* per storico; codice/UI senza jargon Stripe |
| `lessons_module_flag` | `live` solo dopo smoke sandbox + checklist |

### 2026-10-12 — Batch 2

| ID | Scelta |
|----|--------|
| `pack_trigger` | Saldo ≤ 0 dopo presenza + programmazione a creazione corso; tab **Programmazione** (verde/rosso/grigio) |
| `pack_notify` | Email link Nexi automatica |
| `absence_wallet` | Assente scala sempre (crediti) |
| `first_pack` | Incasso staff **oppure** Nexi prima della 1ª lezione |
| `trial_courses` | Esclusi da pack automatico |
| `opening_balance` | Solo staff, senza ricevuta automatica |
| `family_advance` | Eccesso in wallet, niente nuova retta finché copre |

### 2026-10-12 — Batch 3

| ID | Scelta |
|----|--------|
| `nexi_env` | PROD subito, dopo smoke pack su account test |
| `payment_reminder` | Email + link pagamento rigenerabile |
| `partial_pay` | Sì, saldo residuo visibile |
| `refund_pack` | Manuale segreteria + nota |
| `quota_pack_checkout` | Due righe, un pagamento Nexi se possibile |
| `dunning_auto` | Cron + soglie scuola (come da piano) |

### 2026-10-12 — Batch 4

| ID | Scelta |
|----|--------|
| `test_section_policy` | Sezionale TEST solo per `is_test_account` |
| `test_purge` | SQL checklist + verifica manuale |
| `receipt_timing` | Ricevuta all’allocazione pagamento |
| `payroll_test` | Serie TEST se docente flag test |
| `receipt_export` | Dopo go-live (non blocca V1) |
| `teacher_payment_visibility` | Solo stato pagato / in ritardo |

### 2026-10-12 — Batch 5

| ID | Scelta |
|----|--------|
| `attendance_ux` | Salva → toast (+ link pagamento se inviato) |
| `fees_panel` | Tabella compatta + azioni riga |
| `student_payment_ux` | Email Nexi **e** pagina «Le mie rette» in dashboard |
| `test_account_ui` | Checkbox account test in modifica rapida |
| `calendar_density` | Densità attuale, no righe extra |
| `queue_ux` | Lista unica con filtri + azioni inline |
| `change_request_defaults` | Notifica docente + famiglia ON |
| `listino_settings` | Tabella tipo×durata inline (blocker: compilare prezzi) |
| `unplaced_block` | Coda + drag su calendario |
| `payroll_sign_ux` | Pad firma + anteprima PDF |
| `sandbox_banner` | Banner staff + docenti in test/sandbox |
| `payment_copy` | Copy senza jargon gateway |
| `admin_lessons_nav` | Tab Lezioni in admin + sub-nav Rette/Coda/Oggi |

### 2026-10-12 — Batch 6

| ID | Scelta |
|----|--------|
| `missing_flow` | E2E Playwright lezioni + pack |
| `course_lifecycle` | Piano §38 così com’è |
| `trial_conversion` | Nuovo corso attivo, stesso slot + quota+pack |
| `teacher_cash` | Contanti solo propri allievi (titolare) |
| `hold_48h` | Scadenza automatica + email |
| `attendance_window` | Soglie in Impostazioni scuola |
| `family_pay` | Incasso famiglia / ledger sufficienti |
| `google_cal` | OAuth se chiavi; stub accettabile V1 |
| `ss_import` | Separato da lezioni live |
| `permission_override` | V1: solo flag globali + staff; override per corso → feature futura |

### 2026-10-12 — Batch 8

| ID | Scelta |
|----|--------|
| `blocker_list` | Listino pack prezzi NULL; smoke Nexi pack → `npm run smoke:lesson-pack` |
| `cron_timezone` | Allineare job a Europe/Rome prima del live |
| `dual_enrollment` | Dual write GAS+Supabase spento fino a VAI |
| `oggi_hold` | Tap su lezione in hold: comportamento attuale ok |
| `ui_pain` | Nav admin macchinosa; tab Lezioni mancante |
| `data_risk` | Solo sala test + `is_test_account` |
| `open_bug` | Priorità navigazione admin lezioni |

---

## Note libere (voce «Altro»)

### Tab Programmazione (batch 2)

Alla creazione corso: programmazione lezioni fino a data fine, festività, calendario bloccato. Pagamenti allineati. UI tab sul dettaglio corso (verde=coperto, rosso=pagato+assente, grigio=pianificato/salti).

### Navigazione admin (batch 5 / 8)

Tab **Lezioni** nell’area admin; sub-nav Rette / Coda / Oggi; accesso diretto senza solo dashboard → Oggi → Rette.
