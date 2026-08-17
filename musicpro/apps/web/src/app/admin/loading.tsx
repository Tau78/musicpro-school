export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-56 rounded-lg bg-neutral-200" />
      <div className="h-4 w-80 rounded bg-neutral-100" />
      <div className="mt-6 space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="h-12 rounded-lg bg-neutral-100" />
        <div className="h-12 rounded-lg bg-neutral-100" />
        <div className="h-12 rounded-lg bg-neutral-100" />
        <div className="h-12 rounded-lg bg-neutral-50" />
      </div>
    </div>
  );
}
