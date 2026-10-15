# Accesso associati — diagnosi e backfill Auth

## Pierpaolo Romairone (n. 22)

| Campo | Valore |
|-------|--------|
| Email anagrafica | `agincourt1965@gmail.com` |
| Auth Supabase | Presente, collegato (`user_id` ok) |
| Creato Auth | 2026-10-01 |

Il backfill **non** era il problema: account già attivo. «Password sempre la stessa» = password **non** coincide con quella in Supabase (es. vecchio portale, oppure mai impostata dopo migrazione).

**Azione:** [Recupera password](https://school.musicproeventi.it/forgot-password) con **esattamente** `agincourt1965@gmail.com`, oppure tab **Link email** sul login.

## Backfill Auth (`npm run backfill:associate-auth`)

Eseguito in produzione il 2026-10-16:

| Esito | N |
|-------|---|
| Già ok | 629 |
| Account Auth creati | 36 |
| Conflitti / email duplicate | 24 |
| Senza email valida in rubrica | 215 |

I 36 creati hanno password casuale: devono usare **Recupera password** o **Link email**.

### Email duplicate in anagrafica (serve email dedicata o fix manuale admin)

- `solari.pino@gmail.com` — EDOARDO SOLARI (+ altro profilo)
- `ameliemayacouture@gmail.com` — conflitto unique
- `terry_ale@yahoo.it`, `francesca.dellerna@gmail.com`, `maricamanfredi70@gmail.com`, `filippo.oliva@gmail.com`, `tabbitaroberto@libero.it`, `n.belloglio@gmail.com`, `minetti.erika@yahoo.it`, `gyore.anett@gmail.com`, `liping977@gmail.com`, `michelasanguineti@libero.it`, `jormez@yahoo.it`, `erica.alberto.eli@gmail.com`, `ainwen14062013@gmail.com`, `cinziapotter@libero.it`, `vdelucchi@asl4.liguria.it`, `saradevoto6@gmail.com`, `rosy41186@gmail.com`, `mauro.cademartori@libero.it`, `aliceter90@gmail.com`

Script singolo: `node scripts/backfill-associate-auth.mjs --email nome@dominio.it`

## Dove si incastrano

1. Password sbagliata / vecchio sistema → messaggio generico; usare recupero.
2. Nessun Auth (prima del backfill) → recupero non inviava mail (fix: ensure Auth in `/api/auth/forgot-password`).
3. Email ≠ anagrafica → login ok ma «Profilo non collegato».
4. Email condivisa tra più soci → solo un profilo collegato.

## Log utili

- Vercel: `[forgot-password]`, `[prepare-login]`
- Supabase Dashboard → Authentication → Logs (failed sign-in)
