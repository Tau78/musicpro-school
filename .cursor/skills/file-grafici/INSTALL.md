# Mettere file-grafici in un repo

**Fonte unica da mantenere:** `~/.cursor/skills/file-grafici/`  
Nei repo: `.cursor/skills/file-grafici/` (copia piatta — **niente** cartelle nested).

## MusicPro School

```bash
mkdir -p ".cursor/skills" ".cursor/rules"
cp -R ~/.cursor/skills/file-grafici .cursor/skills/file-grafici
cp ~/.cursor/skills/file-grafici/file-grafici.mdc .cursor/rules/file-grafici.mdc
```

In `AGENTS.md`:

```md
# File grafici

Banner, card, icone, foto sale, screenshot: skill `file-grafici` (`.cursor/skills/file-grafici/` o `~/.cursor/skills/file-grafici/`). In questo repo l’agente è il grafico e usa **sempre ONDA**.
```

## Cloud vs Desktop

- **Desktop / My Machines:** vede `~/.cursor/skills/file-grafici/`.
- **Cloud:** solo git — serve la copia `.cursor/skills/file-grafici/`.

## Manutenzione

*Aggiungi alla skill file-grafici* → aggiorna **globale + copia repo** nello stesso task. Eventi resta in `reference-eventi.md`; School in `reference-school.md`; storie last minute IG/FB 9:16 in `reference-storie-last-minute.md`.
