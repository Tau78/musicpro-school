/** Skeleton pagina admin (nav workspace + contenuto). */
export function AdminPageLoading({ withWorkspaceNav = true }: {
  withWorkspaceNav?: boolean;
}) {
  return (
    <div className="animate-pulse space-y-3 sm:space-y-4">
      {withWorkspaceNav ? (
        <div className="rounded-xl bg-white/90 p-3 shadow-sm ring-1 ring-black/5">
          <div className="flex gap-2">
            <div className="h-4 w-16 rounded bg-neutral-200" />
            <div className="h-8 flex-1 rounded-lg bg-neutral-100" />
          </div>
          <div className="mt-2 flex gap-1.5">
            <div className="h-7 w-24 rounded-md bg-neutral-100" />
            <div className="h-7 w-20 rounded-md bg-neutral-100" />
            <div className="h-7 w-28 rounded-md bg-neutral-50" />
          </div>
        </div>
      ) : null}
      <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="h-5 w-40 rounded bg-neutral-200" />
        <div className="h-4 w-full max-w-md rounded bg-neutral-100" />
        <div className="mt-4 h-48 rounded-lg bg-neutral-100" />
      </div>
    </div>
  );
}

export function StaffDashboardLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="h-[4.5rem] rounded-xl bg-white/80 ring-1 ring-black/5" />
        <div className="h-[4.5rem] rounded-xl bg-white/80 ring-1 ring-black/5" />
        <div className="h-[4.5rem] rounded-xl bg-white/80 ring-1 ring-black/5" />
        <div className="h-[4.5rem] rounded-xl bg-white/80 ring-1 ring-black/5" />
      </div>
      <div className="h-10 rounded-lg bg-neutral-100" />
      <div className="h-80 rounded-xl bg-neutral-100" />
    </div>
  );
}
