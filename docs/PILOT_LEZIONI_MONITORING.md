# Pilot lezioni reali — monitoraggio UX

**Docente:** `andreoni.mauro@gmail.com` (migration `112`)

| Ruolo | Nome | Login / nota |
|--------|------|----------------|
| teacher | Mauro Andreoni | `andreoni.mauro@gmail.com` |
| student | Annalia Canepa | minore — uso app via tutore |
| student | Anita Isabella Fiore | minore — uso app via tutore |
| tutor | Maria Vita Lucchetti | `mariavitalucchetti@gmail.com` (tutore Annalia) |
| tutor | Fabio Fiore | `fiore.fab@libero.it` · tel. 347 118 4637 (tutore Anita) |

Cohort in migration `113_pilot_cohort_canepa_fiore.sql`.

## Cosa viene registrato

| Tipo | Esempio |
|------|---------|
| `session` | `session.start` |
| `screen_view` | ogni cambio pagina (`screen.view` + `route`) |
| `action` | presenze (`lezioni.attendance.saved`), sblocco, cancellazione lezione |

Client: `web` (browser), `ios_shell` (app nativa WKWebView), `mobile` (Expo se usata).

Solo i membri in **`pilot_cohort_members`** generano righe (gli altri utenti non riempiono il log).

## Deploy

1. `supabase db push` (migration `112_pilot_product_usage_events.sql`)
2. Deploy web su Vercel (instrumentazione in `UsageLogProvider` + presenze)

## Leggere la timeline

```bash
PILOT_REPORT_PASSWORD='…' npm run pilot:usage-report
PILOT_REPORT_PASSWORD='…' npm run pilot:usage-report -- --since 2026-10-14 --limit 300
```

Oppure in Supabase SQL (staff):

```sql
SELECT * FROM public.list_pilot_usage_events(now() - interval '3 days', 500);
```

## Analisi successiva

- Raggruppa per `session_id` per ricostruire un percorso
- Confronta `teacher` vs `student` su stesse schermate
- Cerca `error` / `*_failed` e tempi tra `screen.view` e `lezioni.attendance.saved`

## Privacy

Dati su navigazione e azioni didattiche: conservarli solo per il pilot; valutare retention/cancellazione dopo l’analisi.
