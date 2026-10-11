# Lezioni — form AskQuestion prodotto

Questionari **tappable** (multitap) per portare lezioni da V1 scritta a **prodotto professionale**: decisioni di release, pagamenti, fiscale, **UI da rifinire**, **flussi mancanti**, **problematiche** note dagli audit.

**Definizione completa (tutti i batch):**  
[`.cursor/askquestion/lezioni-prodotto-professionale.md`](../.cursor/askquestion/lezioni-prodotto-professionale.md)

**Registro risposte:** [`LEZIONI_PRODOTTO_DECISIONS.md`](./LEZIONI_PRODOTTO_DECISIONS.md)

---

## Come rispondere

1. Chat in **Cursor Desktop / Composer** con strumento **AskQuestion** attivo.
2. Usa uno dei comandi sotto (un form per tornata).
3. L’agente salva le scelte in `LEZIONI_PRODOTTO_DECISIONS.md`.

---

## Comandi rapidi

| Comando | Batch | Quando |
|---------|-------|--------|
| `#askquestion lezioni batch 1` … `9` | 1–9 | Percorso completo |
| `#askquestion lezioni prodotto` | 1 | Default |
| `#askquestion lezioni ui` | 5 | Layout, coda, rette, copy, listino |
| `#askquestion lezioni flussi` | 6 | Pausa/chiusura, prova, hold, permessi, integrazioni |
| `#askquestion lezioni problematiche` | 8 | Blocker go-live, gap audit, UI pain |
| `#askquestion lezioni facoltativo` | 7 poi 9 | Mobile, polish, roadmap V1.1 |

---

## Catalogo batch

| Batch | Focus | Obbligatorietà |
|-------|--------|----------------|
| **1** | Priorità release, sandbox, flag modulo | Obbligatorio |
| **2** | Wallet, pacchetti, presenze, anticipo | Obbligatorio |
| **3** | Nexi, solleciti, rimborsi, dunning | Obbligatorio |
| **4** | Fiscale TEST, ricevute, notule, visibilità docente | Obbligatorio |
| **5** | **UI** staff / docente / famiglia (rette, coda, calendario, test account) | Fortemente consigliato pre go-live |
| **6** | **Flussi** mancanti e integrazioni (lifecycle, prova, GCal, SS) | Obbligatorio |
| **7** | Mobile Expo, push, polish | Facoltativo |
| **8** | **Problematiche** e gap audit (blocker, cron, dual iscrizione, bug aperti) | Obbligatorio |
| **9** | Roadmap V1.1 (export, KPI, V2) | Facoltativo |

### Cosa copre «professionale»

- **Must-Have decisioni:** batch **1–4**, **6**, **8** → sufficienti per chiudere gap pagamenti/fiscale/flussi e triage blocker.
- **UX quotidiana:** batch **5** → allinea segreteria e docenti su densità e flussi tap (regola UI sacra: niente righe gonfie).
- **Dopo il live:** batch **7** e **9**.

Ordine suggerito: `1 → 2 → 3 → 4 → 6 → 8 → 5` (poi `7`, `9`).

---

## Contesto tecnico (per l’agente)

- Specifica V1: [`PIANO_LEZIONI.md`](./PIANO_LEZIONI.md) (§41 = scrittura chiusa, VAI = cutover).
- Sandbox: [`LEZIONI_SANDBOX.md`](./LEZIONI_SANDBOX.md).
- Pagamenti: Nexi Classic XPay ([`NEXI_MIGRATION.md`](./NEXI_MIGRATION.md)); pack lezioni allineati a RPC apply Nexi.

---

## Prossimo passo

Se non hai ancora risposto nulla, scrivi in chat:

**`#askquestion lezioni batch 1`**

Dopo ogni batch l’agente propone il successivo fino a 8 (e 5/7/9 se vuoi rifinitura completa).
