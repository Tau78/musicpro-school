# Sandbox lezioni (sala prove resta in produzione)

Obiettivo: provare **corsi, area docente, lezioni** (spostamenti, pagamenti, presenze, assenze, solleciti, notule…) su dati di test, senza toccare **prenotazioni sala**, Nexi/Stripe sala e associati reali su `school.musicproeventi.it`.

## Perché un database separato

Le lezioni **occupano le stesse sale** delle prenotazioni (`rooms` + overlap calendario). Scrivere lezioni di prova sul DB di produzione rischia di bloccare slot sala veri. La sandbox usa un **secondo progetto Supabase** (o branch DB usa-e-getta) con sale clone ma **zero prenotazioni live**.

## Architettura consigliata

| Ambiente | URL | `NEXT_PUBLIC_LESSONS_MODULE` | Supabase |
|----------|-----|------------------------------|----------|
| **Produzione sala** | `https://school.musicproeventi.it` | `off` | Progetto attuale (`mlsiagbrejjylqvcnfbe`) |
| **Sandbox lezioni** | Preview Vercel dedicata o sottodominio (es. branch `lezioni-sandbox`) | `sandbox` | Nuovo progetto staging |

Stesso repository Next.js; cambiano solo le **variabili Vercel** (e i secret Edge sul progetto staging).

### Flag applicativi

| Variabile | Valori | Effetto |
|-----------|--------|---------|
| `NEXT_PUBLIC_LESSONS_MODULE` | `off` · `sandbox` · `live` | `off`: nasconde `/lezioni`, `/admin/lezioni`, `/tabellone`, API `/api/lezioni/*`, cron lezioni no-op. `sandbox`: tutto attivo + banner. `live`: cutover produzione lezioni. Default se assente: `live` (compatibilità). |
| `NEXT_PUBLIC_LESSONS_SANDBOX_URL` | URL https | Su produzione (`off`): link «Apri sandbox lezioni» in dashboard per staff/docenti. |

Implementazione: `musicpro/apps/web/src/lib/lessons-module.ts` + middleware.

## Setup sandbox (checklist)

### 1. Progetto Supabase staging

1. Crea progetto es. **MusicProSchool-LezioniSandbox** (regione EU come prod).
2. Dalla root repo:
   ```bash
   supabase link --project-ref <REF_SANDBOX>
   supabase db push
   ```
3. Auth Dashboard → Site URL = URL sandbox Vercel; Redirect URLs = `https://<sandbox-host>/**`.
4. Copia **anon** + **service role** nel team (non in git).

Opzionale: seed minimale (2 docenti test, 2 allievi, materie, sala fittizia). Puoi duplicare anagrafica reale solo con email `@musicpro.local` / account dedicati.

### 2. Edge Functions sullo staging

Sul **progetto staging**, deploya almeno le function usate dai pagamenti lezioni / email (stesso elenco di `scripts/vai.sh`, filtrando ciò che serve ai test lezioni):

```bash
supabase functions deploy nexi-xpay-pay nexi-xpay-notify nexi-xpay-return --project-ref <REF_SANDBOX>
```

Secret: `NEXI_XPAY_ENV=test`, Alias/MAC test, `SCHOOL_PUBLIC_URL=https://<sandbox-host>`.

### 3. Deployment Vercel sandbox

- Branch persistente `lezioni-sandbox` **oppure** secondo progetto Vercel collegato allo stesso repo.
- **Environment** (Preview o Production del sandbox):

  ```env
  NEXT_PUBLIC_LESSONS_MODULE=sandbox
  NEXT_PUBLIC_SUPABASE_URL=https://<REF_SANDBOX>.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=...
  SUPABASE_SERVICE_ROLE_KEY=...
  SCHOOL_PUBLIC_URL=https://<sandbox-host>
  CRON_SECRET=...   # per cron reminder/notule/payroll solo su sandbox
  NEXI_XPAY_ENV=test
  ```

- Cron in `vercel.json` (`/api/lezioni/reminders`, payroll): eseguiti solo sul deploy sandbox; su prod con `off` rispondono 503.

### 4. Produzione sala (invariata)

Su **Production** del dominio `school.musicproeventi.it`:

```env
NEXT_PUBLIC_LESSONS_MODULE=off
NEXT_PUBLIC_LESSONS_SANDBOX_URL=https://<sandbox-host>
```

Prenotazioni, shop crediti, quota, admin sale → stessi secret Supabase/Nexi **live** di oggi.

### 5. Cosa testare in sandbox

- Creazione corso (docente → approvazione staff), prove, pacchetti da 4
- Calendario: spostamento lezione (DnD), conflitto sala
- Presenze / assenze / accodamento, solleciti email (indirizzi test)
- Rette: contanti, Stripe test, Nexi test
- Notule / ricevute (Drive test o bucket staging)
- Area docente `/lezioni` e staff `/admin/lezioni`

### 6. Cutover lezioni in produzione (quando pronto)

1. Migrazione dati SS → prod (se serve) **fuori** dalla sandbox o con script dedicato.
2. Prod: `NEXT_PUBLIC_LESSONS_MODULE=live`.
3. Sandbox: resta per regression o si spegne.

Non usare `VAI` per accendere le lezioni in prod finché non hai completato smoke lezioni sulla sandbox e la checklist in [`PIANO_LEZIONI.md`](./PIANO_LEZIONI.md).

## Dev locale

```env
# Solo lezioni contro DB staging
NEXT_PUBLIC_LESSONS_MODULE=sandbox
NEXT_PUBLIC_SUPABASE_URL=https://<REF_SANDBOX>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Sala in locale resta sullo stesso DB del `.env` — per non mischiare, usa due file `.env.local` / due terminali o lascia i test sala su prod URL e le lezioni su `npm run dev` puntato allo staging.

## Mobile (Expo)

L’app punta a un solo Supabase. Fino al cutover, **non** esporre tab Lezioni in build store collegata a prod, oppure usa build interna con env staging (TestFlight separato). Web sandbox è sufficiente per la maggior parte dei test docente/staff.
