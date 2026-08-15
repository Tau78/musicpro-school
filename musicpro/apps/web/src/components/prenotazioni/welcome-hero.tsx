export function PrenotazioniWelcomeHero() {
  return (
    <div className="space-y-6">
      <span className="inline-flex items-center rounded-full bg-[var(--brand-accent)]/15 px-4 py-1.5 text-sm font-medium text-[var(--brand)]">
        Sale prova · MusicPro School
      </span>
      <h1 className="text-3xl font-bold tracking-tight text-[var(--brand)] sm:text-4xl">
        Ciao! Prenota la tua sala in pochi click
      </h1>
      <p className="text-lg leading-relaxed text-neutral-600">
        Benvenuto nel sistema di prenotazione delle sale prova. Scegli sala,
        data e orario — pagamento sicuro online quando serve.
      </p>
      <ul className="space-y-3 text-sm text-neutral-600">
        <li className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-xs font-bold text-[var(--brand)]">
            1
          </span>
          <span>Sale Rossa, Verde, Arancio e altre — tariffe chiare all&apos;ora</span>
        </li>
        <li className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-xs font-bold text-[var(--brand)]">
            2
          </span>
          <span>Slot ogni 30 minuti, conferma immediata o approvazione segreteria</span>
        </li>
        <li className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-xs font-bold text-[var(--brand)]">
            3
          </span>
          <span>Gestisci tutto da &laquo;Le mie prenotazioni&raquo;</span>
        </li>
      </ul>
      <p className="rounded-xl border border-[var(--brand-accent)]/30 bg-[var(--brand-accent)]/5 px-4 py-3 text-sm text-neutral-700">
        Per prenotare serve l&apos;accesso con l&apos;email in anagrafica e la quota
        associativa in regola.
      </p>
    </div>
  );
}
