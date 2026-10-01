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
  const perPage = 200;

  while (page <= 20) {
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

/** Auth trigger `link_member_on_auth_signup` may set user_id before we link manually. */
async function ensureMemberUserLink(
  service: ServiceClient,
  memberId: string,
  userId: string,
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

  if (data.user_id && data.user_id !== userId) {
    throw new Error(
      "Questo associato è già collegato a un altro account di accesso.",
    );
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

export async function setStaffMemberPassword(
  service: ServiceClient,
  memberId: string,
  password: string,
): Promise<void> {
  const invalid = validateStaffPassword(password);
  if (invalid) {
    throw new Error(invalid);
  }

  const member = await loadMemberAuth(service, memberId);
  const email = member.email?.trim().toLowerCase() ?? "";

  if (!email) {
    throw new Error(
      "Manca l'email sull'associato: non è possibile creare l'accesso.",
    );
  }

  let authUser: User | null = null;

  if (member.userId) {
    const { data: byId, error: byIdError } =
      await service.auth.admin.getUserById(member.userId);
    if (byIdError) {
      throw new Error(byIdError.message);
    }
    authUser = byId.user ?? null;
    if (authUser && authUser.email?.trim().toLowerCase() !== email) {
      authUser = null;
    }
  }

  if (!authUser) {
    authUser = await findAuthUserByEmail(service, email);
  }

  if (authUser) {
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
    await ensureMemberUserLink(service, memberId, authUser.id);
    return;
  }

  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (!createError && created.user) {
    await ensureMemberUserLink(service, memberId, created.user.id);
    return;
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

  const existing = await findAuthUserByEmail(service, email);
  if (!existing) {
    throw new Error(
      "Esiste già un account con questa email, ma non è stato possibile collegarlo.",
    );
  }

  const { error: updateError } = await service.auth.admin.updateUserById(
    existing.id,
    {
      email,
      password,
      email_confirm: true,
    },
  );
  if (updateError) {
    throw new Error(updateError.message);
  }

  await ensureMemberUserLink(service, memberId, existing.id);
}

export async function removeStaffMemberPassword(
  service: ServiceClient,
  memberId: string,
): Promise<void> {
  const member = await loadMemberAuth(service, memberId);
  if (!member.userId) {
    throw new Error("Questo associato non ha ancora un account di accesso.");
  }

  const { error } = await service.auth.admin.updateUserById(member.userId, {
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
