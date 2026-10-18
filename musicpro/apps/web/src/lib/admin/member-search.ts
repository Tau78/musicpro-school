/** Match rubrica search: every whitespace token must hit nome, cognome or email. */
export function memberMatchesSearch(
  member: {
    firstName: string;
    lastName: string;
    email?: string | null;
  },
  query: string,
): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;

  const first = member.firstName.toLowerCase();
  const last = member.lastName.toLowerCase();
  const email = (member.email ?? "").toLowerCase();
  const fullForward = `${first} ${last}`;
  const fullReverse = `${last} ${first}`;

  if (
    first.includes(term) ||
    last.includes(term) ||
    email.includes(term) ||
    fullForward.includes(term) ||
    fullReverse.includes(term)
  ) {
    return true;
  }

  const tokens = term.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return false;

  return tokens.every(
    (token) =>
      first.includes(token) ||
      last.includes(token) ||
      email.includes(token),
  );
}
