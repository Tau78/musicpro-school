/** Skeleton dettaglio corso — feedback immediato in navigazione client. */
export function CourseDetailPageLoading() {
  return (
    <div className="animate-pulse space-y-4 pb-2">
      <div>
        <div className="h-4 w-28 rounded bg-neutral-200" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="h-7 w-56 max-w-full rounded bg-neutral-200" />
          <div className="h-5 w-14 rounded-full bg-neutral-100" />
        </div>
        <div className="mt-2 flex rounded-lg bg-neutral-100/90 p-0.5">
          <div className="h-7 flex-1 rounded-md bg-white/80" />
          <div className="h-7 flex-1 rounded-md bg-neutral-100" />
        </div>
      </div>
      <section className="rounded-xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-black/5">
        <div className="mb-3 h-3 w-16 rounded bg-neutral-200" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <div className="mb-1 h-3 w-12 rounded bg-neutral-100" />
              <div className="h-4 w-24 rounded bg-neutral-200" />
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-black/5">
        <div className="mb-2 h-3 w-14 rounded bg-neutral-200" />
        <div className="space-y-2">
          <div className="h-10 rounded-lg bg-neutral-100" />
          <div className="h-10 rounded-lg bg-neutral-100" />
        </div>
      </section>
    </div>
  );
}
