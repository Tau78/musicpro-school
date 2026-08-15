/** Accetta service role key (env o JWT con role service_role). */
export function isServiceRoleRequest(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;

  const token = auth.slice(7).trim();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
  if (serviceKey && token === serviceKey) return true;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
      role?: string;
    };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}
