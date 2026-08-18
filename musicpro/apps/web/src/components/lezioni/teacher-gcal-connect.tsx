function teacherGcalClientId(): string | undefined {
  return (
    process.env.GOOGLE_CALENDAR_TEACHER_CLIENT_ID?.trim() ||
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ||
    undefined
  );
}

export function TeacherGcalConnect() {
  const configured = Boolean(teacherGcalClientId());

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-700">
        Collega il calendario Google per vedere le lezioni anche lì.
      </p>
      {configured ? (
        <>
          <button
            type="button"
            disabled
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-400"
          >
            Collega Google
          </button>
          <p className="text-xs text-neutral-500">Disponibile a breve.</p>
        </>
      ) : (
        <p className="text-sm text-neutral-600">
          Il collegamento non è ancora disponibile.
        </p>
      )}
    </div>
  );
}
