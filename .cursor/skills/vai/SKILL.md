---
name: vai
description: >-
  Ships MusicPro School when the user says VAI. Git, PR merge, Supabase migrations,
  Edge Functions, Vercel, FTP iscrizione, smoke HTTP. Use for VAI, vai, ship.
---

# VAI

Quando l’utente scrive **VAI**, esegui lo script esistente (non rifare i passi a mano):

```bash
VAI_MESSAGE='…' bash scripts/vai.sh
# Anteprima:
bash scripts/vai.sh --dry-run
```

Ordine: git → PR → main → Supabase → Edge Functions → Vercel → FTP iscrizione → smoke HTTP.

Mai `--force`, amend, committare segreti.

## Da iPhone (My Machines)

Worker `~/Cursor/MusicPro School @ Mac mini` → **VAI**.
