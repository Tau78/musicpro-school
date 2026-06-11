# MusicPro School — Monorepo

Monorepo Turborepo per la migrazione da Google Apps Script a Supabase + Next.js (admin web) + Expo (app mobile).

## Struttura

```
musicpro/
├── apps/
│   ├── web/          # Next.js 15 — pannello amministrativo
│   └── mobile/       # Expo SDK 52 — app associati
├── packages/
│   ├── database/     # Client Supabase (browser, server, mobile)
│   └── shared/       # Tipi, costanti, enum ruoli
├── turbo.json
└── package.json
```

## Prerequisiti

- Node.js 20+
- npm 10+
- Per mobile: [Expo Go](https://expo.dev/go) su dispositivo o simulatore iOS/Android

## Setup

```bash
cd musicpro
cp .env.example .env
# Compila NEXT_PUBLIC_SUPABASE_* e EXPO_PUBLIC_SUPABASE_* con i valori del progetto Supabase
npm install
```

### Variabili ambiente

| Variabile | Dove | Descrizione |
|-----------|------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | web | URL progetto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | Chiave anonima Supabase |
| `EXPO_PUBLIC_SUPABASE_URL` | mobile | URL progetto Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | mobile | Chiave anonima Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | server/script | Chiave service role (solo backend) |
| `STRIPE_*` | futuro | Placeholder per pagamenti |

## Sviluppo

### Tutti i progetti

```bash
npm run dev
```

### Solo web (Next.js)

```bash
npm run dev --workspace=@musicpro/web
# oppure
cd apps/web && npm run dev
```

Apri [http://localhost:3000](http://localhost:3000) — redirect a `/login`, dashboard protetta su `/dashboard`.

### Solo mobile (Expo)

```bash
npm run dev --workspace=@musicpro/mobile
# oppure
cd apps/mobile && npm run dev
```

Scansiona il QR code con Expo Go, oppure premi `i` (iOS) / `a` (Android) nel terminale.

## Build e lint

```bash
npm run build   # build di tutti i workspace
npm run lint    # lint/typecheck di tutti i workspace
```

## Pacchetti condivisi

### `@musicpro/shared`

Enum `MemberRole` allineato allo schema Supabase (`admin`, `docente`, `associato`, `segreteria`, `social`, `tutore`).

### `@musicpro/database`

- `createBrowserClient()` — client SSR per browser (Next.js)
- `createServerClient(cookieStore)` — client SSR per Server Components / middleware
- `createMobileClient({ storage })` — client per Expo/React Native (sessione in `expo-secure-store`)
- `getSession(client)` — sessione corrente
- `getCurrentMember(client)` — profilo `members` collegato all'utente auth
- `getMemberRoles(client, memberId)` — ruoli attivi da `member_roles`
- `getCurrentMemberWithRoles(client)` — profilo + ruoli
- `ensureMemberLinked(client)` — RPC `ensure_member_linked` (collega email → `members.user_id`)

I tipi Supabase sono un placeholder in `packages/database/src/types/database.ts`. Rigenerarli con:

```bash
npx supabase gen types typescript --project-id <id> > packages/database/src/types/database.ts
```

## Autenticazione

Email + password via Supabase Auth (sostituisce i magic link GAS).

### Flusso

1. L'utente si registra (`/signup`) o accede (`/login`) con l'email presente in anagrafica.
2. La migration `004_auth_hooks.sql` collega `auth.users` a `members` per email (`members.user_id`).
3. All'accesso viene chiamata `ensure_member_linked()` per gestire membri importati dopo la registrazione.
4. Web: middleware Next.js reindirizza gli utenti non autenticati da `/dashboard` a `/login`.
5. Mobile: `AuthProvider` gestisce sessione, profilo, ruoli e sblocco biometrico (stub) dopo il primo login.

### Utenti migrati da GAS

- L'email dell'account Supabase **deve coincidere** con `members.email`.
- Se il collegamento automatico fallisce (email diversa, profilo mancante), un admin può collegare manualmente:

```sql
UPDATE public.members
SET user_id = '<uuid-da-auth-users>'
WHERE lower(email) = lower('utente@esempio.it');
```

- Assegnare ruoli in `member_roles` se non presenti dopo la migrazione dati.

### Test locale

1. Applicare le migration Supabase (`001`–`004`) sul progetto.
2. Inserire un membro di test con email nota e almeno un ruolo in `member_roles`.
3. In Supabase Dashboard → Authentication, disabilitare temporaneamente "Confirm email" in dev.
4. Web: `npm run dev --workspace=@musicpro/web` → registrati/accedi → verifica ruoli su `/dashboard`.
5. Mobile: `npm run dev --workspace=@musicpro/mobile` → login → area personale mostra profilo e ruoli.

## Note

- I file GAS esistenti nella root del workspace (`index.html`, script deploy, ecc.) **non sono stati migrati**.
- Le pagine attuali sono stub con etichette in italiano; auth e ruoli sono funzionanti.
- Le migration Supabase sono in `../supabase/migrations/` (fuori da questo monorepo).
