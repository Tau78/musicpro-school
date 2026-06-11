# Manual QUOTE import — missing members (2026-06-11)

Four QUOTE rows had no matching row in `members` (not in ASSOCIATI). Per user decision, **new members were created** (not fuzzy-matched to Emanuela Pegoraro or Guido Parma).

## Source (Google Sheet QUOTE)

| Sheet row | Name | Fiscal year | Paid date | Amount |
|-----------|------|-------------|-----------|--------|
| 38 | Michela Terrosi | 2025 | 06/01/2025 | €15 |
| 39 | Giovanni Pegoraro | 2025 | 06/01/2025 | €15 |
| 40 | Tony Carta | 2025 | 06/01/2025 | €15 |
| 41 | Nicola Parma | 2025 | 21/02/2025 | €15 |

Columns mapped per `scripts/migrate-from-sheets/mappers/quotas.js`: A=name, B=fiscal year, C=paid date, D=amount.

## Supabase inserts

### `members` (is_active=true, member_number=max+1)

| # | Name | member_id |
|---|------|-----------|
| 794 | Michela Terrosi | `fe8f5cc5-5882-427d-a8de-8b33c70e7301` |
| 795 | Giovanni Pegoraro | `6a105e7d-1828-4315-a5dc-a10e10fb1d51` |
| 796 | Tony Carta | `8aff5a55-a24e-4a50-9d28-c02e3e25b317` |
| 797 | Nicola Parma | `1667515f-6ff6-4af9-abd6-a927eb18aeef` |

### `member_annual_quotas`

| member | fiscal_year | quota id |
|--------|-------------|----------|
| Michela Terrosi | 2025 | `683373e9-62c4-407f-9a46-b471b1bdc3ee` |
| Giovanni Pegoraro | 2025 | `b5b701f2-129a-4990-98fe-4560a8eeaeeb` |
| Tony Carta | 2025 | `1dd84eaa-1614-4520-8a73-d59ab0606166` |
| Nicola Parma | 2025 | `3c273d3a-b077-44aa-a678-af7381b3e6ac` |

## Google Sheet update

Column **E** (rows 38–41) set to: `Migrato a Supabase 2026-06-11`.

## Verification

```bash
node scripts/verify-quota-import.mjs
```

**Result (2026-06-11):** 97/97 QUOTE rows resolvable, **0 missing** in DB, **0** member-not-found, **0** extra in DB. Total `member_annual_quotas`: 95 rows.

## Script

Re-run (idempotent checks prevent duplicates):

```bash
node scripts/import-quota-missing-members.mjs
```
