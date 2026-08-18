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
    <section className="rounded-xl border border-neutral-200 bg-white p-6">
      <h3 className="text-sm font-semibold text-[var(--brand)]">
        Google Calendar
      </h3>
      {configured ? (
        <>
          <p className="mt-2 text-sm text-neutral-700">
            Collega il tuo Google Calendar
          </p>
          <button
            type="button"
            disabled
            className="mt-3 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-400"
          >
            Collega Google
          </button>
          <p className="mt-2 text-xs text-neutral-500">
            OAuth in arrivo — chiavi presenti, sync eventi non ancora attivo
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-neutral-600">
          Collegamento Google Calendar docente non configurato. Quando le chiavi
          OAuth saranno in env, potrai sincronizzare le tue lezioni.
        </p>
      )}
    </section>
  );
}
