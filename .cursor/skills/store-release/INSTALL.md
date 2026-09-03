# Mettere store-release in un’altra app

**Fonte unica da mantenere:** `~/.cursor/skills/store-release/`  
Nei repo: `.cursor/skills/store-release/` (copia piatta — **niente** cartelle nested).

## In ogni repo iOS nuovo

```bash
mkdir -p .cursor/skills .cursor/rules scripts
cp -R ~/.cursor/skills/store-release .cursor/skills/store-release
# regola opzionale alwaysApply:
cp ~/.cursor/skills/store-release/store-release.mdc .cursor/rules/store-release.mdc 2>/dev/null \
  || true
cp path/to/ReWavier/scripts/xcode-testflight.sh scripts/xcode-testflight.sh
```

Adatta lo script: `SCHEME`, `WORKSPACE`, `ARCHIVE`, team `YSU7PL673A`.

In `AGENTS.md`:

```md
# Store release

`#release` / skill `store-release`. TestFlight = Xcode nativo (niente Expo/EAS senza OK). ≠ Submit for Review. Segreti: `secrets.md`. Pacchetto Notes 7 punti, demo, privacy, Age Rating. Video solo se Apple lo chiede.
```

Notes **compilate** dell’app → `docs/` (o `store/ios/`), non nella skill globale.

Se Apple boccia: caso in `lessons.md` + regola in `SKILL.md` nello stesso task (*aggiungi alla skill Release*).

## Cloud vs Desktop

- **Desktop / My Machines:** vede `~/.cursor/skills/store-release/`.
- **Cloud:** solo ciò che è in git nel repo — serve la copia `.cursor/skills/store-release/`.

## User rule (una volta)

```text
#release o Submit for Review / rifiuto Apple: leggi store-release (repo o ~/.cursor/skills/store-release). TestFlight = Xcode locale, non obbligatorio EAS. VAI ≠ recensione Store. Pacchetto completo prima di Submit. Simulated Gambling = None su Individual. «Aggiungi alla skill Release» aggiorna quella skill.
```
