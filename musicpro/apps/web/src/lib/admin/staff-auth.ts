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

async function linkMemberUserId(
  service: ServiceClient,
  memberId: string,
  userId: string,
): Promise<void> {
  const { error } = await service
    .from("members")
    .update({ user_id: userId })
    .eq("id", memberId)
    .is("user_id", null);

  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "Questo account di accesso è già collegato a un altro associato.",
      );
    }
    throw new Error(error.message);
  }
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

  if (member.userId) {
    const { error } = await service.auth.admin.updateUserById(member.userId, {
      password,
    });
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  if (!email) {
    throw new Error(
      "Manca l'email sull'associato: non è possibile creare l'accesso.",
    );
  }

  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (!createError && created.user) {
    await linkMemberUserId(service, memberId, created.user.id);
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
    { password },
  );
  if (updateError) {
    throw new Error(updateError.message);
  }

  await linkMemberUserId(service, memberId, existing.id);
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
    throw new Error(error.message);
  }
}
