import type { SupabaseClient, User } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

import type { Database } from "@musicpro/database";

type ServiceClient = SupabaseClient<Database>;

const MIN_PASSWORD_LENGTH = 8;

export function validateStaffPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "La password deve avere almeno 8 caratteri.";
  }
  return null;
}

async function findAuthUserByEmail(
  service: ServiceClient,
  email: string,
): Promise<User | null> {
  // auth.admin.getUserByEmail non esiste in @supabase/auth-js 2.112.3 (solo listUsers / getUserById).
  const target = email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (page <= 10) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      throw new Error(error.message);
    }
    const users = data.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === target);
    if (match) return match;
    if (users.length < perPage) return null;
    page += 1;
  }

  return null;
}

async function loadMemberAuth(
  service: ServiceClient,
  memberId: string,
): Promise<{ userId: string | null; email: string | null }> {
  const { data, error } = await service
    .from("members")
    .select("user_id, email")
    .eq("id", memberId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Associato non trovato.");
  }

  return {
    userId: data.user_id,
    email: data.email,
  };
}

/**
 * Collega `members.user_id` all'Auth usato al login (email anagrafica).
 * Con `allowRelink` corregge un user_id obsoleto (reset admin altrimenti falliva
 * e la password «nuova» andava sul conto sbagliato: restava valida la vecchia).
 */
async function ensureMemberUserLink(
  service: ServiceClient,
  memberId: string,
  userId: string,
  options?: { allowRelink?: boolean },
): Promise<void> {
  const { data, error } = await service
    .from("members")
    .select("user_id")
    .eq("id", memberId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Associato non trovato.");
  }

  if (data.user_id === userId) {
    return;
  }

  if (data.user_id && data.user_id !== userId && !options?.allowRelink) {
    throw new Error(
      "Questo associato è già collegato a un altro account di accesso.",
    );
  }

  if (data.user_id && data.user_id !== userId && options?.allowRelink) {
    const { data: conflict, error: conflictError } = await service
      .from("members")
      .select("id")
      .eq("user_id", userId)
      .neq("id", memberId)
      .maybeSingle();
    if (conflictError) {
      throw new Error(conflictError.message);
    }
    if (conflict) {
      throw new Error(
        "Questo account di accesso è già collegato a un altro associato.",
      );
    }

    const { error: relinkError } = await service
      .from("members")
      .update({ user_id: userId })
      .eq("id", memberId);
    if (relinkError) {
      if (relinkError.code === "23505") {
        throw new Error(
          "Questo account di accesso è già collegato a un altro associato.",
        );
      }
      throw new Error(relinkError.message);
    }
    return;
  }

  const { error: updateError } = await service
    .from("members")
    .update({ user_id: userId })
    .eq("id", memberId)
    .is("user_id", null);

  if (updateError) {
    if (updateError.code === "23505") {
      throw new Error(
        "Questo account di accesso è già collegato a un altro associato.",
      );
    }
    throw new Error(updateError.message);
  }

  const { data: again, error: againError } = await service
    .from("members")
    .select("user_id")
    .eq("id", memberId)
    .maybeSingle();

  if (againError) {
    throw new Error(againError.message);
  }

  if (again?.user_id === userId) {
    return;
  }

  if (again?.user_id && again.user_id !== userId) {
    throw new Error(
      "Questo associato è già collegato a un altro account di accesso.",
    );
  }

  throw new Error(
    "Collegamento account fallito: riprova o contatta il supporto.",
  );
}

function isValidAuthEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function randomAuthPassword(): string {
  return `Mp${randomBytes(18).toString("base64url")}!`;
}

export type EnsureMemberAuthResult = {
  status: "ok" | "created" | "linked" | "synced_email" | "no_email" | "invalid_email";
  userId?: string;
};

/**
 * Garanzia: se l'associato ha email valida → esiste Auth + `members.user_id`.
 * Password iniziale casuale (magic link / recupera password / reset admin).
 * Opzionale: `email` dal form (persistita prima se diversa dal DB).
 */
export async function ensureMemberAuthAccess(
  service: ServiceClient,
  memberId: string,
  options?: { email?: string | null },
): Promise<EnsureMemberAuthResult> {
  const emailFromForm = options?.email?.trim().toLowerCase() ?? "";
  if (emailFromForm) {
    if (!isValidAuthEmail(emailFromForm)) {
      return { status: "invalid_email" };
    }
    const member = await loadMemberAuth(service, memberId);
    if ((member.email?.trim().toLowerCase() ?? "") !== emailFromForm) {
      const { error } = await service
        .from("members")
        .update({ email: emailFromForm })
        .eq("id", memberId);
      if (error) {
        if (error.code === "23505") {
          throw new Error("Questa email è già usata da un altro associato.");
        }
        throw new Error(error.message);
      }
    }
  }

  const member = await loadMemberAuth(service, memberId);
  const email = member.email?.trim().toLowerCase() ?? "";
  if (!email) {
    return { status: "no_email" };
  }
  if (!isValidAuthEmail(email)) {
    return { status: "invalid_email" };
  }

  if (member.userId) {
    const { data: byId, error: byIdError } =
      await service.auth.admin.getUserById(member.userId);
    if (byIdError) {
      throw new Error(byIdError.message);
    }
    const authUser = byId.user ?? null;
    if (authUser) {
      const authEmail = authUser.email?.trim().toLowerCase() ?? "";
      if (authEmail === email) {
        return { status: "ok", userId: authUser.id };
      }
      // Preferisci l'Auth con l'email di anagrafica (quello del login).
      const byEmail = await findAuthUserByEmail(service, email);
      if (byEmail && byEmail.id !== authUser.id) {
        await ensureMemberUserLink(service, memberId, byEmail.id, {
          allowRelink: true,
        });
        return { status: "linked", userId: byEmail.id };
      }
      const { error: syncError } = await service.auth.admin.updateUserById(
        authUser.id,
        { email, email_confirm: true },
      );
      if (syncError) {
        throw new Error(syncError.message);
      }
      return { status: "synced_email", userId: authUser.id };
    }
  }

  let authUser = await findAuthUserByEmail(service, email);
  if (authUser) {
    await ensureMemberUserLink(service, memberId, authUser.id);
    return { status: "linked", userId: authUser.id };
  }

  const password = randomAuthPassword();
  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (!createError && created.user) {
    await ensureMemberUserLink(service, memberId, created.user.id);
    return { status: "created", userId: created.user.id };
  }

  const alreadyExists =
    createError?.message?.toLowerCase().includes("already") ||
    createError?.message?.toLowerCase().includes("registered") ||
    createError?.message?.toLowerCase().includes("exists");

  if (!alreadyExists) {
    throw new Error(
      createError?.message || "Impossibile creare l'account di accesso.",
    );
  }

  authUser = await findAuthUserByEmail(service, email);
  if (!authUser) {
    throw new Error(
      "Esiste già un account con questa email, ma non è stato possibile collegarlo.",
    );
  }
  await ensureMemberUserLink(service, memberId, authUser.id);
  return { status: "linked", userId: authUser.id };
}

/**
 * Auth user used at login (email in anagrafica), non un user_id obsoleto.
 */
async function resolveMemberAuthUser(
  service: ServiceClient,
  memberId: string,
): Promise<{ authUser: User; email: string }> {
  await ensureMemberAuthAccess(service, memberId);

  const member = await loadMemberAuth(service, memberId);
  const email = member.email?.trim().toLowerCase() ?? "";

  if (!email) {
    throw new Error(
      "Manca l'email sull'associato: non è possibile creare l'accesso.",
    );
  }

  const byEmail = await findAuthUserByEmail(service, email);
  let authUser: User | null = byEmail;
  let allowRelink = false;

  if (member.userId) {
    const { data: byId, error: byIdError } =
      await service.auth.admin.getUserById(member.userId);
    if (byIdError) {
      throw new Error(byIdError.message);
    }
    const linked = byId.user ?? null;
    if (linked) {
      const linkedEmail = linked.email?.trim().toLowerCase() ?? "";
      if (linkedEmail === email) {
        authUser = linked;
      } else if (byEmail && byEmail.id !== linked.id) {
        console.warn(
          `[staff-auth] member ${memberId}: user_id punta a ${linked.id} (${linkedEmail}) ma login è ${email} → aggiorno su ${byEmail.id}`,
        );
        authUser = byEmail;
        allowRelink = true;
      } else if (!byEmail) {
        const { error: syncError } = await service.auth.admin.updateUserById(
          linked.id,
          { email, email_confirm: true },
        );
        if (syncError) {
          throw new Error(syncError.message);
        }
        authUser = linked;
      }
    }
  }

  if (!authUser) {
    throw new Error("Impossibile trovare o creare l'account di accesso.");
  }

  await ensureMemberUserLink(service, memberId, authUser.id, {
    allowRelink,
  });
  return { authUser, email };
}

export async function setStaffMemberPassword(
  service: ServiceClient,
  memberId: string,
  password: string,
): Promise<void> {
  const invalid = validateStaffPassword(password);
  if (invalid) {
    throw new Error(invalid);
  }

  const { authUser, email } = await resolveMemberAuthUser(service, memberId);

  const { error: updateError } = await service.auth.admin.updateUserById(
    authUser.id,
    {
      email,
      password,
      email_confirm: true,
    },
  );
  if (updateError) {
    throw new Error(updateError.message);
  }
}

export async function removeStaffMemberPassword(
  service: ServiceClient,
  memberId: string,
): Promise<void> {
  const { authUser } = await resolveMemberAuthUser(service, memberId);

  const { error } = await service.auth.admin.updateUserById(authUser.id, {
    password: randomBytes(32).toString("base64url"),
  });
  if (error) {
    throw new Error(
      `Impossibile disattivare l'accesso: ${error.message}`,
    );
  }

  // auth.admin.signOut(jwt, scope) richiede il JWT della sessione, non lo userId:
  // senza token non si possono revocare le sessioni attive via client. La password
  // ruotata blocca nuovi login; i refresh token esistenti restano validi fino a scadenza.
}
