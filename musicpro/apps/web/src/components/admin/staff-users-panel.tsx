"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getTeacherProfile,
  listMemberIdsWithRole,
  setMemberHasRole,
  upsertTeacherProfile,
  type StaffAddCandidate,
  type StaffUserRow,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20";

type ManagedRole =
  | typeof MemberRole.Admin
  | typeof MemberRole.Segreteria
  | typeof MemberRole.Docente;

interface StaffUsersPanelProps {
  users: StaffUserRow[];
  candidates: StaffAddCandidate[];
  currentStaffMemberId: string;
}

type PasswordDialog = {
  memberId: string;
  name: string;
  mode: "set" | "remove";
};

function memberLabel(row: { firstName: string; lastName: string }): string {
  return `${row.lastName} ${row.firstName}`.trim();
}

function hasAnyRole(row: StaffUserRow): boolean {
  return row.isAdmin || row.isSegreteria || row.isDocente;
}

function patchRole(
  row: StaffUserRow,
  role: ManagedRole,
  enabled: boolean,
): StaffUserRow {
  return {
    ...row,
    isAdmin: role === MemberRole.Admin ? enabled : row.isAdmin,
    isSegreteria:
      role === MemberRole.Segreteria ? enabled : row.isSegreteria,
    isDocente: role === MemberRole.Docente ? enabled : row.isDocente,
  };
}

export function StaffUsersPanel({
  users,
  candidates,
  currentStaffMemberId,
}: StaffUsersPanelProps) {
  const router = useRouter();
  const supabase = createClient();

  const [rows, setRows] = useState(users);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addAdmin, setAddAdmin] = useState(false);
  const [addSegreteria, setAddSegreteria] = useState(true);
  const [addDocente, setAddDocente] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [dialog, setDialog] = useState<PasswordDialog | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    setRows(users);
  }, [users]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 2) return [];
    return candidates
      .filter((row) => {
        const haystack =
          `${row.lastName} ${row.firstName} ${row.email ?? ""} ${row.memberNumber ?? ""}`.toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 8);
  }, [candidates, query]);

  const selected = candidates.find((row) => row.id === selectedId) ?? null;

  async function ensureTeacherProfile(memberId: string): Promise<string | null> {
    try {
      const existing = await getTeacherProfile(supabase, memberId);
      if (existing) return null;
    } catch {
      // continue to create
    }

    const profileResult = await upsertTeacherProfile(supabase, memberId, {
      canCreateCourses: false,
      canReschedule: false,
      canCloseCourses: false,
      paymentVisibility: "hidden",
    });

    if (!profileResult.success) {
      return (
        profileResult.errorMessage ??
        "Ruolo assegnato, ma il profilo docente non è stato creato."
      );
    }

    return null;
  }

  async function toggleRole(
    memberId: string,
    role: ManagedRole,
    enabled: boolean,
    current: StaffUserRow,
  ) {
    setError(null);
    setOk(null);

    if (
      role === MemberRole.Admin &&
      !enabled &&
      memberId === currentStaffMemberId
    ) {
      setError("Non puoi togliere a te stesso il ruolo Amministratore.");
      return;
    }

    if (role === MemberRole.Admin && !enabled) {
      try {
        const adminIds = await listMemberIdsWithRole(supabase, MemberRole.Admin);
        if (adminIds.length <= 1) {
          setError("Deve restare almeno un amministratore.");
          return;
        }
      } catch {
        setError("Impossibile verificare gli amministratori. Riprova.");
        return;
      }
    }

    const next = patchRole(current, role, enabled);
    if (!hasAnyRole(next)) {
      const confirmed = window.confirm(
        `Rimuovere tutti i ruoli a ${memberLabel(current)}?`,
      );
      if (!confirmed) return;
    }

    setBusyMemberId(memberId);
    setRows((prev) =>
      prev
        .map((row) => (row.id !== memberId ? row : next))
        .filter((row) => hasAnyRole(row)),
    );

    const result = await setMemberHasRole(
      supabase,
      memberId,
      role,
      enabled,
      enabled ? currentStaffMemberId : null,
    );

    if (!result.success) {
      setBusyMemberId(null);
      setRows(users);
      setError(result.errorMessage ?? "Impossibile aggiornare il privilegio.");
      return;
    }

    if (enabled && role === MemberRole.Docente) {
      const profileError = await ensureTeacherProfile(memberId);
      if (profileError) {
        setBusyMemberId(null);
        setError(profileError);
        router.refresh();
        return;
      }
    }

    setBusyMemberId(null);
    setOk(
      enabled
        ? "Privilegio assegnato."
        : hasAnyRole(next)
          ? "Privilegio rimosso."
          : "Utente rimosso dall'elenco.",
    );
    router.refresh();
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOk(null);

    if (!selected) {
      setError("Scegli un associato già in rubrica.");
      return;
    }
    if (!addAdmin && !addSegreteria && !addDocente) {
      setError("Assegna almeno un ruolo: Admin, Segreteria o Docente.");
      return;
    }

    setAdding(true);
    const roles = [
      addAdmin ? MemberRole.Admin : null,
      addSegreteria ? MemberRole.Segreteria : null,
      addDocente ? MemberRole.Docente : null,
    ].filter((role): role is ManagedRole => role != null);

    for (const role of roles) {
      const result = await setMemberHasRole(
        supabase,
        selected.id,
        role,
        true,
        currentStaffMemberId,
      );
      if (!result.success) {
        setAdding(false);
        setError(
          result.errorMessage ?? "Impossibile assegnare i privilegi.",
        );
        return;
      }
    }

    if (addDocente) {
      const profileError = await ensureTeacherProfile(selected.id);
      if (profileError) {
        setAdding(false);
        setError(profileError);
        router.refresh();
        return;
      }
    }

    setAdding(false);
    setSelectedId(null);
    setQuery("");
    setAddAdmin(false);
    setAddSegreteria(true);
    setAddDocente(false);
    setOk(`${memberLabel(selected)} aggiunto agli utenti.`);
    router.refresh();
  }

  function openPasswordDialog(row: StaffUserRow, mode: "set" | "remove") {
    setError(null);
    setOk(null);
    setPassword("");
    setConfirmPassword("");
    setDialog({
      memberId: row.id,
      name: memberLabel(row),
      mode,
    });
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;

    if (dialog.mode === "set") {
      if (password.length < 8) {
        setError("La password deve avere almeno 8 caratteri.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Le password non coincidono.");
        return;
      }
    }

    setPasswordBusy(true);
    setError(null);
    const response = await fetch("/api/admin/users/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        dialog.mode === "remove"
          ? { memberId: dialog.memberId, action: "remove" }
          : { memberId: dialog.memberId, action: "set", password },
      ),
    });
    const payload = (await response.json()) as {
      success: boolean;
      message?: string;
    };
    setPasswordBusy(false);

    if (!payload.success) {
      setError(payload.message ?? "Operazione non riuscita.");
      return;
    }

    setDialog(null);
    setPassword("");
    setConfirmPassword("");
    setOk(payload.message ?? "Password aggiornata.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--brand)]">Utenti</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Aggiungi associati già in rubrica, assegna i ruoli (Admin, Segreteria,
          Docente) e gestisci le password di accesso.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {ok}
        </p>
      ) : null}

      <form
        onSubmit={(event) => void handleAdd(event)}
        className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5"
      >
        <h3 className="text-sm font-semibold text-[var(--brand)]">
          Aggiungi utente esistente
        </h3>
        <label className="block text-sm text-neutral-700">
          Cerca in rubrica
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedId(null);
            }}
            placeholder="Nome, cognome o email…"
            className={`mt-1 ${inputClass}`}
          />
        </label>
        {query.trim().length >= 2 && !selected ? (
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200">
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-sm text-neutral-500">
                Nessun associato trovato, oppure è già tra gli utenti.
              </li>
            ) : (
              matches.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(row.id);
                      setQuery(memberLabel(row));
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  >
                    <span>{memberLabel(row)}</span>
                    <span className="text-neutral-400">{row.email ?? "—"}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
        {selected ? (
          <p className="text-sm text-neutral-600">
            Selezionato: <strong>{memberLabel(selected)}</strong>
            {selected.email ? ` · ${selected.email}` : ""}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={addAdmin}
              onChange={(event) => setAddAdmin(event.target.checked)}
              className="rounded border-neutral-300"
            />
            Admin
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={addSegreteria}
              onChange={(event) => setAddSegreteria(event.target.checked)}
              className="rounded border-neutral-300"
            />
            Segreteria
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={addDocente}
              onChange={(event) => setAddDocente(event.target.checked)}
              className="rounded border-neutral-300"
            />
            Docente
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
          >
            {adding ? "Aggiunta…" : "Aggiungi"}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-3 py-3 text-left font-medium text-neutral-600">
                Utente
              </th>
              <th className="px-3 py-3 text-left font-medium text-neutral-600">
                Email
              </th>
              <th className="px-3 py-3 text-center font-medium text-neutral-600">
                Admin
              </th>
              <th className="px-3 py-3 text-center font-medium text-neutral-600">
                Segreteria
              </th>
              <th className="px-3 py-3 text-center font-medium text-neutral-600">
                Docente
              </th>
              <th className="px-3 py-3 text-right font-medium text-neutral-600">
                Password
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-neutral-500"
                >
                  Nessun utente. Aggiungine uno dalla rubrica.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const lockedSelfAdmin = row.id === currentStaffMemberId;
                const busy = busyMemberId === row.id;
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-3 font-medium text-neutral-900">
                      {memberLabel(row)}
                      {lockedSelfAdmin ? (
                        <span className="ml-2 text-xs font-normal text-neutral-400">
                          tu
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-neutral-600">
                      {row.email ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={row.isAdmin}
                        disabled={busy || (lockedSelfAdmin && row.isAdmin)}
                        onChange={(event) =>
                          void toggleRole(
                            row.id,
                            MemberRole.Admin,
                            event.target.checked,
                            row,
                          )
                        }
                        aria-label={`Admin ${memberLabel(row)}`}
                        className="rounded border-neutral-300"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={row.isSegreteria}
                        disabled={busy}
                        onChange={(event) =>
                          void toggleRole(
                            row.id,
                            MemberRole.Segreteria,
                            event.target.checked,
                            row,
                          )
                        }
                        aria-label={`Segreteria ${memberLabel(row)}`}
                        className="rounded border-neutral-300"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={row.isDocente}
                        disabled={busy}
                        onChange={(event) =>
                          void toggleRole(
                            row.id,
                            MemberRole.Docente,
                            event.target.checked,
                            row,
                          )
                        }
                        aria-label={`Docente ${memberLabel(row)}`}
                        className="rounded border-neutral-300"
                      />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openPasswordDialog(row, "set")}
                          className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                        >
                          {row.userId ? "Modifica" : "Imposta"}
                        </button>
                        {row.userId ? (
                          <button
                            type="button"
                            onClick={() => openPasswordDialog(row, "remove")}
                            className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Rimuovi
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            role="dialog"
            aria-labelledby="staff-password-title"
            onSubmit={(event) => void submitPassword(event)}
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
          >
            <h3
              id="staff-password-title"
              className="text-lg font-semibold text-neutral-900"
            >
              {dialog.mode === "remove"
                ? "Rimuovi password"
                : "Password di accesso"}
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              {dialog.mode === "remove"
                ? `L'accesso con password di ${dialog.name} non sarà più valido. Potrà ancora entrare con link email o passkey, se attivi.`
                : `Imposta una nuova password per ${dialog.name}. Minimo 8 caratteri.`}
            </p>
            {error ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            {dialog.mode === "set" ? (
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-neutral-700">
                  Nuova password
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-700">
                  Conferma password
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
              </div>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={passwordBusy}
                className={
                  dialog.mode === "remove"
                    ? "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    : "rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
                }
              >
                {passwordBusy
                  ? "Salvataggio…"
                  : dialog.mode === "remove"
                    ? "Rimuovi password"
                    : "Salva password"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
