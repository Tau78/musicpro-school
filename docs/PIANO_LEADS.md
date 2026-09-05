# Piano LEADS — interessi, assegnazione docente, scheda condivisa

**Data:** 2026-09-05  
**Stato:** specifica V1 **progettata** (non implementata).  
**Riferimento UX:** Inquiry → Trial → Enrolled (music-school SaaS) + lista/coda MusicPro (`associati`, `coda`, `course-cards`).  
**Stack:** monorepo `musicpro/` + Supabase (stesso di [`PIANO_LEZIONI.md`](PIANO_LEZIONI.md)).  
**Principio:** non è un CRM vendite. È una **scheda interesse** condivisa che porta a **prova** e **iscrizione** già esistenti.

---

## 1. Obiettivo

Dare a segreteria e docenti un posto unico per gestire chi chiede info o una prova, **prima** che diventi associato/corso.

- Scheda condivisa: **anagrafica**, **contatti**, **interessi**, **note** (timeline).
- Assegnazione a **un docente** specifico.
- Docenti: voce **Leads** nella dashboard `/lezioni` (solo i propri).
- Admin/segreteria: elenco completo + pool non assegnati + bridge verso prova/iscrizione.

Oggi questi pezzi sono sparsi: bozze `members.is_enrollment_draft`, `courses.is_trial`, coda operativa. LEADS li unifica **senza** duplicare prova o iscrizione.

---

## 2. Decisioni di prodotto (default V1)

> Form tappable AskQuestion non disponibile in questa sessione: default sotto. Si possono correggere prima dell’implementazione.

| Tema | Default V1 |
|------|------------|
| Nome in nav | **Leads** (corto). Empty state / microcopy: “interesse”, “richiesta”. |
| Chi crea | Admin, Segreteria, **e Docente** (form rapido o da flusso prova). |
| Assegnazione | Solo Admin/Segreteria assegna/riassegna. Docente può **rilasciare a segreteria**. |
| Owner | Un solo docente primario. Senza docente = pool **Non assegnati** (solo staff). |
| Chiusura | **Iscritto** / **Perso**: staff; docente può **segnalare** (“pronto per iscrizione” / “perso — motivo”). |
| Vista docente | **Lista** (non kanban). |
| Vista staff | Lista + filtri; kanban leggero opzionale in V1.5. |
| Mobile | Solo web V1. Expo in V2. |
| Relazione con bozze | Lead può collegarsi a `member_id` bozza quando nasce la prova; non sostituisce la rubrica. |

---

## 3. V1 vs dopo

### V1 — in scope

- Entità `leads` + note timeline + assegnazione docente
- Stage fissi (5 + esiti laterali)
- Admin: `/admin/leads` (lista + scheda + nuovo)
- Docente: `/lezioni/leads` in sidebar (gruppo dedicato o sotto Corsi)
- Stessa scheda condivisa (permessi diversi)
- CTA **Fissa prova** → precompila `trial-create-form` / flusso prova esistente
- CTA **Pronto per iscrizione** / **Converti** → handoff a iscrizione esistente (staff)
- Badge urgenza “nessun contatto da N giorni”
- Soft-delete / archivio solo staff
- RLS: docente vede solo lead assegnati (o creati da sé)

### V2 (bloccato)

- Kanban drag-and-drop default admin
- Notifiche email/push al docente all’assegnazione
- Reminder automatici Day 3/7
- Dedup merge wizard (in V1 solo avviso stesso telefono)
- App Expo: tab/sezione Leads
- Report conversioni avanzati / export CSV ricco
- Campi custom

### No (fuori scope)

- Multi-pipeline, scoring, deal value, forecasting
- Inbox WhatsApp/email omnichannel
- Automazioni drip marketing
- Stage custom configurabili
- Multi-owner / team su un lead

---

## 4. Pipeline (stage)

| Stage | Label UI | Exit criteria |
|-------|----------|---------------|
| `nuovo` | Nuovo | Contatto ricevuto; ancora senza risposta utile |
| `in_contatto` | In contatto | Almeno un contatto fatto; interesse chiarito |
| `prova_fissata` | Prova fissata | Data/docente prova prenotati (`course`/`lesson` prova collegata) |
| `dopo_prova` | Dopo la prova | Prova fatta o no-show gestito; decisione in corso |
| `iscritto` | Iscritto | Convertito — lead chiuso vinto |

**Esiti laterali** (non colonne kanban separate):

- `perso` — motivo obbligatorio breve (chip: Orari · Prezzo · Strumento · Non risponde · Altro)
- `in_pausa` — ripresa opzionale (es. “a settembre”)

**UX:** avanzamento = gesti chiari (“Segna contattato”, “Fissa prova”, “Prova fatta”, “Converti”), non drag libero senza contesto.

---

## 5. Scheda lead — information architecture

**Header (sempre)**  
Nome · Stage · Docente assegnato · Ultimo contatto · Badge urgenza

| # | Sezione | Campi |
|---|---------|--------|
| 1 | Anagrafica | Nome/cognome allievo · età o data nascita (opz.) · genitore/tutore se minorenne · zona (opz.) · fonte (`sito`, `passaparola`, `social`, `evento`, `altro`) |
| 2 | Contatti | Telefono · email · preferenza canale · contatto secondario |
| 3 | Interessi | Strumento/i · tipo corso · livello dichiarato · fasce orarie · “cosa cerca” (1–2 frasi) |
| 4 | Assegnazione | Docente · chi ha assegnato · data |
| 5 | Attività | **Una sola timeline**: note + eventi sistema (stage, prova, assegnazione). Autore + timestamp |
| 6 | Prova collegata | Se esiste: data, docente, stato, CTA apri/riprogramma |
| 7 | Esito | Solo in dopo_prova / perso / iscritto |

**Non in V1 sulla scheda:** scoring, company, custom fields, tab Note/Call/Task separate.

---

## 6. Placement UI (coerenza MusicPro)

### Docente — `/lezioni`

Sidebar (`TEACHER_LEZIONI_NAV` in `lezioni-side-nav.tsx`):

| Group | Item | Route |
|-------|------|-------|
| **Persone** (nuovo) o sotto Corsi | **Leads** | `/lezioni/leads` |
| | scheda | `/lezioni/leads/[id]` |

Pattern lista: come `course-cards` / coda — `rounded-xl border bg-white`, badge stage, azioni inline.  
Empty: *“Nessun interesse assegnato. Quando la segreteria ti passa un contatto, lo trovi qui.”*

### Staff — `/admin`

**Non** un nuovo tab top-level (la nav è già piena). Stesso gate di Rubrica (`canManageMembers` / `showRubrica`), con tab secondari stile settings chrome:

| Tab | Route |
|-----|-------|
| Associati (esistente) | `/admin/associati` |
| **Leads** | `/admin/leads` |
| Scheda | `/admin/leads/[id]` |
| Nuovo | `/admin/leads/nuovo` |

Pattern lista: `member-list` (search + pill filter + divide-y).  
Pattern scheda: detail associati (`fieldset` / `SettingsPanel`) + timeline stile coda.  
Assegnazione: riusa `teacher-select`.

### Bridge flussi esistenti

```
Lead ──Fissa prova──► trial-create-form (precompilato)
     ──Prova fatta──► stage dopo_prova
     ──Converti─────► iscrizione / corso (staff)
```

Non creare un secondo wizard prova.

---

## 7. Capability matrix

| Capacità | Admin / Segreteria | Docente |
|----------|:------------------:|:-------:|
| Vedere tutti i lead | ✓ | solo assegnati (+ creati da sé) |
| Creare lead | ✓ | ✓ |
| Assegnare / riassegnare | ✓ | ✗ (rilascia a segreteria) |
| Cambiare stage | ✓ | fino a `dopo_prova`; chiusure via segnalazione |
| Note | ✓ | ✓ |
| Fissa / gestisci prova | ✓ | ✓ |
| Converti → iscrizione | ✓ | segnala “pronto” |
| Soft-delete / archivia | ✓ | ✗ |
| Report / export | ✓ minimi | ✗ |

Helper ruoli (estensione di `lib/admin/roles.ts`):

- `canManageLeads` → admin, segreteria  
- `canAccessOwnLeads` → docente (scope assegnati)

---

## 8. Modello dati (bozza)

Tabelle nuove (nomi indicativi):

### `leads`

| Colonna | Note |
|---------|------|
| `id` | uuid PK |
| `org` / school scope | come resto dello schema |
| `first_name`, `last_name` | required |
| `birth_date` / `age_years` | opz. |
| `guardian_name` | opz. |
| `phone`, `email` | contatti |
| `channel_preference` | enum opz. |
| `source` | enum fonte |
| `interests` | jsonb o tabella leggera: strumenti[], course_kind, level, time_prefs, pitch |
| `stage` | enum pipeline |
| `lost_reason` | text/null |
| `paused_until` | date/null |
| `assigned_teacher_id` | fk `members` null = non assegnati |
| `assigned_by`, `assigned_at` | audit |
| `linked_member_id` | bozza/associato se creato |
| `linked_trial_course_id` | prova collegata |
| `last_contact_at` | per urgenza |
| `created_by`, `created_at`, `updated_at`, `archived_at` | |

### `lead_notes`

| Colonna | Note |
|---------|------|
| `id`, `lead_id` | |
| `author_member_id` | |
| `body` | testo nota; eventi sistema possono usare `kind` |
| `kind` | `note` \| `stage_change` \| `assignment` \| `system` |
| `meta` | jsonb (from/to stage, teacher ids…) |
| `created_at` | |

**RLS:** staff full; docente `assigned_teacher_id = auth member` OR `created_by = self`; note stessa policy sul lead padre.

---

## 9. Microcopy

- Preferire **interesse / richiesta** in frasi; **Leads** in nav.
- CTA: *Fissa la prova* · *Aggiungi una nota* · *Segna come contattato* · *Pronto per l’iscrizione*
- Urgenza: *Nessun contatto da 3 giorni* (non “SLA”)
- Perso: *Perché non è andata avanti?* + chip
- Handoff: *Assegnato a te: Marco, chitarra — preferisce dopo le 18*
- Evitare in UI: deal, opportunity, qualify, nurture, pipeline (ok “stage” interno)

---

## 10. Metriche admin minime (V1)

- % Nuovo → Prova fissata  
- % Prova → Iscritto  
- Conteggio lead fermi > 3 / > 7 giorni  
Niente funnel a 12 step.

---

## 11. Fette di implementazione

| # | Fetia | Done quando |
|---|-------|-------------|
| 1 | Migration `leads` + `lead_notes` + RLS + tipi shared | schema pushabile, query smoke |
| 2 | API `@musicpro/database` (list/get/create/update/assign/note/stage) | unit/integration minimi |
| 3 | Admin lista + nuovo + scheda (senza prova) | CRUD staff OK |
| 4 | Docente `/lezioni/leads` + stessa scheda scoped | docente vede solo i suoi |
| 5 | Bridge **Fissa prova** precompilata + link trial | prova creata aggiorna stage |
| 6 | Segnalazioni chiusura + Converti staff + urgenza | pipeline chiusa end-to-end |
| 7 | Nav, empty state, microcopy, filtri | UI allineata al resto |

Ordine consigliato: 1 → 2 → 3 → 4 → 5 → 6 → 7.

---

## 12. Criteri di accettazione V1

1. Staff crea un lead, assegna un docente, aggiunge una nota: il docente la vede identica in **Leads**.
2. Docente non vede lead di altri né il pool non assegnati.
3. Da scheda, **Fissa prova** apre il flusso prova con nome/strumento/contatti precompilati; a prova creata lo stage diventa `prova_fissata`.
4. Dopo la prova, docente segnala “pronto”; staff completa iscrizione e stage → `iscritto`.
5. Lead perso richiede motivo; resta consultabile in archivio/filtro.
6. Nessuna seconda anagrafica parallela obbligata: se nasce bozza membro, è collegata via `linked_member_id`.

---

## 13. Rischi e non-obiettivi

| Rischio | Mitigazione |
|---------|-------------|
| Doppione con bozze rubrica | Lead ≠ member; link esplicito alla prova/iscrizione |
| Scope creep CRM | Stage fissi; una timeline; un owner |
| Docente sovraccarico UI | Lista, non kanban; filtri minimi |
| Drift da prova esistente | Solo bridge, zero secondo wizard |

---

## 14. File / aree probabili (implementazione)

- Nav: `components/lezioni/lezioni-side-nav.tsx`, `components/admin/admin-nav.tsx`
- Pagine: `apps/web/src/app/admin/leads/**`, `apps/web/src/app/lezioni/leads/**`
- Componenti: nuovo `components/leads/*` riusando `teacher-select`, chrome settings, pattern member-list
- DB: `supabase/migrations/*_leads.sql`, `packages/database/src/leads.ts`
- Ruoli: `apps/web/src/lib/admin/roles.ts`

---

## 15. Prossimo passo

Implementazione a fette §11 dopo conferma (o correzione) delle decisioni §2. Questo documento è il contratto di design per ONDA/implementazione successive.
